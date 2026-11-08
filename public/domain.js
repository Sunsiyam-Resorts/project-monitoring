import { importFields, importCommand } from './import-data.js';
import { randomId } from './ids.js';
export { randomId };
// One role per user. Finance reviews and pays every payment request directly; there are
// no approval teams or approval levels.
export const ROLES = [
  "Requester",
  "Finance",
  "Viewer",
  "Admin",
];
// Retired approval stages and roles, kept only so migration can recognise older data.
export const RETIRED_STAGES = ["Reviewer", "Approval 1", "Approval 2"];
export const RETIRED_ROLES = ["Reviewer", "Approver"];
export const TASK_STATUSES = ["To do", "In progress", "Done"];
export const STAGES = [
  "Draft",
  "Finance",
  "On Hold",
  "Documents Required",
  "Paid",
  "Rejected",
];
export const money = (n) =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fail = (m) => {
    throw new Error(m);
  },
  need = (v, m) => {
    if (!v) fail(m);
  },
  positive = (n) => Number.isFinite(Number(n)) && Number(n) > 0,
  text = (v) => String(v ?? "").trim(),
  norm = (v) => text(v).toUpperCase().replace(/\s+/g, " ");
export const today = (now = Date.now()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Indian/Maldives",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
export function emptyState() {
  return {
    version: 3,
    companies: [],
    projects: [],
    tasks: [],
    budgets: [],
    suppliers: [],
    currencies: [
      { id: "USD", name: "US Dollar", rate: 1 },
      { id: "MVR", name: "Maldivian Rufiyaa", rate: 15.42 },
    ],
    users: [],
    orders: [],
    requests: [],
    audit: [],
    locks: {},
    settings: {
      orderFormat: "{COMPANY}-{PROJECT}-REQ-{SEQ}",
      numberFormat: "{COMPANY}-{PROJECT}-PAY-{SEQ}",
      lockMinutes: 10,
    },
    counters: {},
    sequence: 0,
  };
}
export const access = (u, c) =>
  !!u && (u.groupAccess || (u.companies || []).includes(c));
// Finance and Admin have full operational access (everything except users and settings).
export const isFinanceAdmin = (u) => !!u && u.active !== false && ["Finance", "Admin"].includes(u.role);
export const canCreateRequests = (u) => !!u && u.active !== false && ["Requester", "Finance", "Admin"].includes(u.role);
export const canManageRequest = (u, r) => canCreateRequests(u) && access(u, r.companyId) &&
  (isFinanceAdmin(u) || u.id === r.requestedBy);
export function roleFor(u, r, role) {
  return u.role === role && access(u, r.companyId) && u.id !== r.requestedBy;
}
// Who may act on a request or amendment waiting for Finance: Finance or Admin with access to
// the company, never on a record they requested themselves (separation of duties).
export const financeActor = (u, r) =>
  isFinanceAdmin(u) && access(u, r.companyId) && u.id !== r.requestedBy;
export const canEditTasks = (u, companyId) => isFinanceAdmin(u) && access(u, companyId);
// Project progress is the share of its tasks that are Done; null when it has no tasks.
export function projectProgress(s, projectId, now = Date.now()) {
  const ts = (s.tasks || []).filter((t) => t.projectId === projectId);
  const done = ts.filter((t) => t.status === "Done").length;
  const inProgress = ts.filter((t) => t.status === "In progress").length;
  const day = today(now);
  return {
    total: ts.length,
    done,
    inProgress,
    todo: ts.length - done - inProgress,
    overdue: ts.filter((t) => t.status !== "Done" && t.due && t.due < day).length,
    pct: ts.length ? Math.round((done / ts.length) * 100) : null,
  };
}
export const approved = (r) =>
  ["Finance", "On Hold", "Documents Required", "Paid"].includes(r.status);
const onHold = (r) => r.status === "On Hold" ||
  (r.status === "Documents Required" && r.documentRequest?.returnStatus === "On Hold");
export const parentAmount = (r) => Number(r.orderAmount ?? r.amount);
export function totalUSD(s, o) {
  return money(o.total / o.rate);
}
export const committed = (s, o) => !!o.committedAt && !o.rejectedAt;
export function budgetAmount(b) {
  return money(
    b.categories.reduce((a, c) => a + Number(c.amount), 0) / (b.rate || 1),
  );
}
export const reservation = (s, o, exclude) =>
  money(
    s.requests
      .filter(
        (r) =>
          r.orderId === o.id && r.id !== exclude && r.status !== "Rejected",
      )
      .reduce((a, r) => a + parentAmount(r), 0),
  );
export const remainingToRequest = (s, o) => money(o.total - reservation(s, o));
export function stageActor(u, r) {
  return ["Finance", "On Hold"].includes(r.status) && financeActor(u, r);
}
export const canReject = (u, r) =>
  r.status !== "Paid" &&
  r.status !== "Rejected" &&
  ((u.role === "Admin" && access(u, r.companyId)) || stageActor(u, r));
// Year-to-date monthly trend of the seven dashboard figures, rebuilt only from dated
// records. One bucket per calendar month (UTC) from 1 January to now; the current
// month runs to now. Each bucket carries open/close/high/low in USD, and the last
// close equals the current kpis() figures for the same scope.
// Sources: budget revisions (each keeps its previous categories, rate and time),
// order commitment dates, each payment request's final approval time, its payment
// time, and the audit trail's hold / resume / pay / reject events for that request.
// Limits: a budget's creation date is not recorded, so it counts from 1 January; an
// amended order counts at its current value from its commitment date; a request on
// hold with no recorded hold event counts as held from its latest Finance remark.
export function kpiTrend(s, company = "", project = "", { now = Date.now() } = {}) {
  const inScope = (x) => (!company || x.companyId === company) && (!project || x.projectId === project);
  const bs = s.budgets.filter(inScope);
  const scoped = s.orders.filter(inScope);
  const os = scoped.filter((o) => committed(s, o));
  const live = new Map(scoped.filter((o) => !o.rejectedAt).map((o) => [o.id, o]));
  const time = (v) => (v ? Date.parse(v) : NaN);
  const revisionValue = (rev) =>
    money(rev.categories.reduce((a, c) => a + Number(c.amount), 0) / (rev.rate || 1));
  const budgetValueAt = (b, t) => {
    const next = (b.revisions || []).find((rev) => time(rev.at) > t);
    return next ? revisionValue(next) : budgetAmount(b);
  };
  const events = (r) => (s.audit || [])
    .filter((a) => a.entity === r.id && ["request.hold", "request.resume", "request.pay", "request.reject"].includes(a.action))
    .map((a) => ({ action: a.action, at: time(a.at) }))
    .sort((a, b) => a.at - b.at);
  const requests = s.requests.filter((r) => live.has(r.orderId)).map((r) => {
    const o = live.get(r.orderId);
    const log = events(r);
    const approvedAt = r.finalApprovedAt
      ? time(r.finalApprovedAt)
      : approved(r) || r.status === "Rejected"
        ? Math.max(...(r.approvals || []).map((x) => time(x.at)).filter(Number.isFinite), -Infinity)
        : NaN;
    const rejectedAt = r.status === "Rejected"
      ? (log.filter((e) => e.action === "request.reject").at(-1)?.at ?? -Infinity)
      : Infinity;
    const paidAt = r.status === "Paid" && r.payment ? time(r.payment.at || r.payment.date) : Infinity;
    const holds = log.filter((e) => e.action !== "request.reject");
    const heldByLog = (t) => holds.filter((e) => e.at <= t).at(-1)?.action === "request.hold";
    // A request held now but without a recorded hold event: held since its latest remark.
    const fallbackHold = onHold(r) && !heldByLog(now)
      ? Math.max(approvedAt, ...(r.remarks || []).map((m) => time(m.at)).filter(Number.isFinite))
      : Infinity;
    return {
      usd: r.amount / (r.rate || o.rate),
      approvedAt: Number.isFinite(approvedAt) ? approvedAt : Infinity,
      rejectedAt, paidAt,
      heldAt: (t) => heldByLog(t) || t >= fallbackHold,
    };
  });
  const values = (t) => {
    const budget = money(bs.reduce((a, b) => a + budgetValueAt(b, t), 0));
    const utilized = money(os.filter((o) => time(o.committedAt) <= t).reduce((a, o) => a + totalUSD(s, o), 0));
    let paid = 0, hold = 0, outstanding = 0;
    for (const r of requests) {
      if (!(r.approvedAt <= t) || r.rejectedAt <= t) continue;
      if (r.paidAt <= t) paid += r.usd;
      else if (r.heldAt(t)) hold += r.usd;
      else outstanding += r.usd;
    }
    paid = money(paid); hold = money(hold); outstanding = money(outstanding);
    return {
      budget, utilized, available: money(budget - utilized),
      paid, outstanding, hold, balance: money(utilized - paid - outstanding - hold),
    };
  };
  const eventTimes = [
    ...bs.flatMap((b) => (b.revisions || []).map((rev) => time(rev.at))),
    ...os.map((o) => time(o.committedAt)),
    ...requests.flatMap((r) => [r.approvedAt, r.paidAt, r.rejectedAt]),
    ...(s.audit || []).filter((a) => a.action === "request.hold" || a.action === "request.resume").map((a) => time(a.at)),
  ].filter(Number.isFinite);
  const year = new Date(now).getUTCFullYear();
  const months = new Date(now).getUTCMonth() + 1;
  const series = { budget: [], utilized: [], available: [], paid: [], outstanding: [], hold: [], balance: [] };
  for (let i = 0; i < months; i++) {
    const t0 = Date.UTC(year, i, 1), t1 = i === months - 1 ? now : Date.UTC(year, i + 1, 1);
    const points = [t0, ...eventTimes.filter((t) => t > t0 && t <= t1), t1].map(values);
    for (const key of Object.keys(series)) {
      const v = points.map((p) => p[key]);
      series[key].push({ start: t0, end: t1, open: v[0], close: v[v.length - 1], high: Math.max(...v), low: Math.min(...v) });
    }
  }
  return series;
}
export function kpis(s, company = "", project = "") {
  const os = s.orders.filter(
      (o) =>
        (!company || o.companyId === company) &&
        (!project || o.projectId === project),
    ),
    ids = new Set(os.filter((o) => !o.rejectedAt).map((o) => o.id)),
    rs = s.requests.filter((r) => ids.has(r.orderId) && approved(r));
  const bs = s.budgets.filter(
    (b) =>
      (!company || b.companyId === company) &&
      (!project || b.projectId === project),
  );
  const budget = money(bs.reduce((a, b) => a + budgetAmount(b), 0)),
    commitment = money(
      os.filter((o) => committed(s, o)).reduce((a, o) => a + totalUSD(s, o), 0),
    );
  const sum = (fn) =>
    money(
      rs
        .filter(fn)
        .reduce(
          (a, r) =>
            a +
            r.amount /
              (r.rate || s.orders.find((o) => o.id === r.orderId).rate),
          0,
        ),
    );
  const paid = sum((r) => r.status === "Paid"),
    hold = sum(onHold),
    outstanding = sum((r) => r.status !== "Paid" && !onHold(r)),
    finance = outstanding,
    balance = money(commitment - paid - outstanding - hold);
  return {
    budget,
    commitment,
    utilized: commitment,
    available: money(budget - commitment),
    paid,
    outstanding,
    finance,
    hold,
    balance,
    notReceived: balance,
    approval: s.requests.filter(
      (r) =>
        ids.has(r.orderId) &&
        RETIRED_STAGES.includes(r.status),
    ).length,
    projects: new Set(bs.map((b) => b.projectId)).size,
    orders: os.length,
    requests: rs.length,
  };
}
export function currencyStats(s, company = "", project = "") {
  const os = s.orders.filter(
      (o) =>
        (!company || o.companyId === company) &&
        (!project || o.projectId === project) &&
        !o.rejectedAt,
    ),
    ids = new Set(os.map((o) => o.id));
  return s.currencies
    .map((c) => {
      const bs = s.budgets.filter(
          (b) =>
            (!company || b.companyId === company) &&
            (!project || b.projectId === project) &&
            (b.currency || "USD") === c.id,
        ),
        orders = os.filter((o) => o.currency === c.id && committed(s, o)),
        rs = s.requests.filter(
          (r) => ids.has(r.orderId) && approved(r) && r.currency === c.id,
        ),
        sum = (fn) => money(rs.filter(fn).reduce((a, r) => a + r.amount, 0));
      return {
        currency: c.id,
        budget: money(
          bs.reduce(
            (a, b) =>
              a + b.categories.reduce((v, x) => v + Number(x.amount), 0),
            0,
          ),
        ),
        utilized: money(orders.reduce((a, o) => a + o.total, 0)),
        paid: sum((r) => r.status === "Paid"),
        outstanding: sum((r) => r.status !== "Paid" && !onHold(r)),
        hold: sum(onHold),
      };
    })
    .filter((c) => c.budget || c.utilized || c.paid || c.outstanding || c.hold);
}
export function categoryUsed(s, budgetId, categoryId, exclude) {
  return money(
    s.orders
      .filter(
        (o) => o.id !== exclude && o.budgetId === budgetId && committed(s, o),
      )
      .reduce(
        (a, o) =>
          a +
          (o.allocations.find((x) => x.categoryId === categoryId)?.amount ||
            0) /
            o.rate,
        0,
      ),
  );
}
export function warnings(s, o) {
  const b = s.budgets.find((b) => b.id === o.budgetId);
  return o.allocations
    .filter(
      (a) =>
        categoryUsed(s, o.budgetId, a.categoryId, o.id) + a.amount / o.rate >
        b.categories.find((c) => c.id === a.categoryId).amount / (b.rate || 1) +
          0.005,
    )
    .map(
      (a) =>
        `${b.categories.find((c) => c.id === a.categoryId).name}: budget exceeded. Inform Finance of additional budget approvals.`,
    );
}
function audit(s, u, action, entity, companyId, detail = "", now = Date.now()) {
  s.audit.push({
    id: randomId(),
    at: new Date(now).toISOString(),
    userId: u.id,
    user: u.name,
    action,
    entity,
    companyId,
    detail,
  });
}
function issue(s, o, kind, now) {
  const key = `${o.companyId}:${o.projectId}:${kind}`,
    n = (s.counters[key] || 0) + 1,
    format =
      kind === "order" ? s.settings.orderFormat : s.settings.numberFormat,
    number = format
      .replaceAll(
        "{COMPANY}",
        s.companies.find((c) => c.id === o.companyId).code,
      )
      .replaceAll(
        "{PROJECT}",
        s.projects.find((p) => p.id === o.projectId).code,
      )
      .replaceAll("{YYYY}", String(new Date(now).getUTCFullYear()))
      .replaceAll("{SEQ}", String(n).padStart(6, "0"));
  need(
    ![...s.orders, ...s.requests].some((r) => r.number === number),
    "Number format would create a duplicate; change the format in Settings",
  );
  s.counters[key] = n;
  return number;
}
export function migrateState(s, now = Date.now()) {
  if (
    s.version >= 3 &&
    Array.isArray(s.tasks) &&
    s.counters &&
    s.orders.every((o) => o.number) &&
    s.requests.every((r) => r.currency)
  )
    return s;
  s.counters ||= {};
  s.settings.orderFormat ||= "{COMPANY}-{PROJECT}-REQ-{SEQ}";
  s.settings.numberFormat = "{COMPANY}-{PROJECT}-PAY-{SEQ}";
  for (const list of [s.companies, s.projects])
    for (const x of list) {
      if (!x.code) {
        const base =
          x.name
            .split(/\s+/)
            .map((w) => w[0])
            .join("")
            .replace(/[^a-z0-9]/gi, "")
            .toUpperCase()
            .slice(0, 8) || "CODE";
        let code = base,
          i = 1;
        while (
          list.some(
            (y) =>
              y !== x &&
              y.code === code &&
              (list === s.companies || y.companyId === x.companyId),
          )
        )
          code = base + i++;
        x.code = code;
      }
    }
  for (const b of s.budgets) {
    b.currency ||= "USD";
    b.rate ||= 1;
  }
  for (const o of s.orders) {
    o.number ||= issue(s, o, "order", now);
    o.files ||= [];
  }
  for (const r of s.requests) {
    const o = s.orders.find((o) => o.id === r.orderId);
    r.currency ||= o.currency;
    r.rate ||= o.rate;
    r.orderAmount ??= r.amount;
    r.orderRate ||= o.rate;
    r.files ||= [];
    if (r.payment) {
      r.payment.files ||= r.payment.file ? [r.payment.file] : [];
      delete r.payment.file;
    }
    // Approval stages are retired: anything waiting for an approver now waits for Finance.
    if (RETIRED_STAGES.includes(r.status)) {
      const from = r.status;
      r.status = "Finance";
      r.finalApprovedAt ||= new Date(now).toISOString();
      if (o && !o.committedAt) {
        o.committedAt = r.finalApprovedAt;
        o.commitmentRequestId = r.id;
      }
      audit(s, SYSTEM, "workflow.migrated", r.id, r.companyId, `Approval workflow removed; moved from ${from} to Finance`, now);
    }
    const key = `${r.companyId}:${o.projectId}:payment`;
    s.counters[key] = Math.max(
      s.counters[key] || 0,
      Number(r.number?.match(/(\d+)$/)?.[1]) || 0,
    );
  }
  for (const o of s.orders)
    if (o.amendment && RETIRED_STAGES.includes(o.amendment.status)) {
      const from = o.amendment.status;
      o.amendment.status = "Finance";
      audit(s, SYSTEM, "workflow.migrated", o.id, o.companyId, `Approval workflow removed; amendment moved from ${from} to Finance`, now);
    }
  for (const u of s.users) {
    if (RETIRED_ROLES.includes(u.role)) {
      const from = u.role;
      u.role = "Viewer";
      audit(s, SYSTEM, "user.migrated", u.id, undefined, `${u.username}: ${from} role retired; now Viewer`, now);
    }
    delete u.team;
    delete u.approvalLevel;
  }
  s.tasks ||= [];
  s.version = 3;
  return s;
}
const SYSTEM = { id: "system", name: "System" };
export function visibleState(s, u) {
  const out = structuredClone(s);
  out.tasks ||= [];
  for (const k of ["companies", "projects", "tasks", "budgets", "orders", "requests"])
    out[k] = out[k].filter((c) =>
      access(u, k === "companies" ? c.id : c.companyId),
    );
  out.audit = out.audit.filter(
    (c) =>
      (!c.companyId || access(u, c.companyId)) &&
      (isFinanceAdmin(u) || c.companyId),
  );
  out.users = out.users.map(
    ({
      id,
      name,
      username,
      email,
      role,
      companies,
      groupAccess,
      active,
    }) => ({
      id,
      name,
      username,
      ...(u.role === "Admin" ? { email } : {}),
      role,
      companies,
      groupAccess,
      active,
    }),
  );
  if (u.role !== "Admin")
    out.users = out.users.filter(
      (x) =>
        x.id === u.id ||
        x.groupAccess ||
        (x.companies || []).some((c) => access(u, c)),
    );
  delete out.sequence;
  delete out.counters;
  function strip(v) {
    if (!v || typeof v !== "object") return;
    for (const k of Object.keys(v))
      if (k === "data" && typeof v[k] === "string") delete v[k];
      else strip(v[k]);
  }
  out.orders.forEach(strip);
  out.requests.forEach(strip);
  return out;
}
function documentCheck(f) {
  need(
    f &&
      f.type === "application/pdf" &&
      text(f.name).toLowerCase().endsWith(".pdf"),
    "Upload a PDF document",
  );
  need(
    typeof f.data === "string" &&
      f.data.startsWith("JVBERi0") &&
      f.data.length <= 2800000,
    "PDF must be valid and at most 2 MB",
  );
}
function documents(files, required = true) {
  need(
    Array.isArray(files) && (!required || files.length),
    "Attach supporting PDFs",
  );
  files.forEach(documentCheck);
  need(
    files.reduce((a, f) => a + f.data.length, 0) <= 2800000,
    "Combined uploads must be at most 2 MB",
  );
  return files;
}
function findOrder(s, id, u) {
  const o = s.orders.find((o) => o.id === id);
  need(o && access(u, o.companyId), "Order not available");
  return o;
}
function findRequest(s, id, u) {
  const r = s.requests.find((r) => r.id === id);
  need(r && access(u, r.companyId), "Request not available");
  return r;
}
function checkLock(s, u, id, now, required = true) {
  const l = s.locks[id];
  need(
    !l || l.expires <= now || l.userId === u.id,
    "This record is opened by another user",
  );
  if (required)
    need(
      l && l.userId === u.id && l.expires > now,
      "Open this record again to obtain a lock",
    );
}
export function supportingFile(s, u, { id, kind, index = 0, version, side = "data" }, now = Date.now()) {
  need(u && u.active !== false, "Active user required");
  need(Number.isInteger(Number(index)) && Number(index) >= 0, "Invalid file index");
  const parent = ["order", "amendment", "amendment-history", "amendment-attempt"].includes(kind);
  need(parent || ["request", "payment"].includes(kind), "Invalid document type");
  const rec = parent ? findOrder(s, id, u) : findRequest(s, id, u);
  checkLock(s, u, id, now);
  let files;
  if (kind === "order") files = rec.files;
  else if (kind === "amendment") files = rec.amendment?.data.files;
  else if (kind === "amendment-history" || kind === "amendment-attempt") {
    need(["data", "previous"].includes(side), "Invalid document version");
    const versions = kind === "amendment-history" ? rec.amendments : rec.amendmentAttempts;
    const amendment = versions?.find((m) => m.id === version);
    files = amendment?.[side]?.files;
  } else if (kind === "request") files = rec.files;
  else files = rec.payment?.files;
  const file = files?.[Number(index)];
  need(file, "File not available");
  return file;
}
function validateOrder(s, u, d, exclude) {
  need(canCreateRequests(u), "Requester, Finance or Admin role required");
  need(access(u, d.companyId), "Company access required");
  need(
    s.projects.some((p) => p.id === d.projectId && p.companyId === d.companyId),
    "Select a valid project",
  );
  const b = s.budgets.find(
    (b) =>
      b.id === d.budgetId &&
      b.projectId === d.projectId &&
      b.companyId === d.companyId,
  );
  need(b, "Select an approved budget");
  need(
    s.suppliers.some((x) => x.id === d.supplierId),
    "Select a supplier",
  );
  const c = s.currencies.find((c) => c.id === d.currency);
  need(c && positive(c.rate), "Currency rate not configured");
  need(positive(d.total), "Total amount must be positive");
  need(text(d.po) && text(d.description), "PO and description are required");
  need(
    Array.isArray(d.allocations) && d.allocations.length > 0,
    "Allocate the order to budget categories",
  );
  need(
    new Set(d.allocations.map((a) => a.categoryId)).size ===
      d.allocations.length,
    "Each category can appear once",
  );
  for (const a of d.allocations)
    need(
      b.categories.some((c) => c.id === a.categoryId) && positive(a.amount),
      "Enter a positive amount for every selected category",
    );
  need(
    Math.abs(
      money(d.allocations.reduce((a, c) => a + Number(c.amount), 0)) -
        money(d.total),
    ) < 0.005,
    "Category amounts must equal the full order amount",
  );
  need(
    !s.orders.some(
      (o) =>
        o.id !== exclude &&
        o.companyId === d.companyId &&
        norm(o.po) === norm(d.po),
    ),
    "Duplicate PO number in this company",
  );
  if (text(d.invoice))
    need(
      !s.orders.some(
        (o) =>
          o.id !== exclude &&
          o.supplierId === d.supplierId &&
          norm(o.invoice) === norm(d.invoice),
      ),
      "Duplicate invoice number for this supplier",
    );
  documents(d.files);
  return {
    companyId: d.companyId,
    projectId: d.projectId,
    budgetId: d.budgetId,
    supplierId: d.supplierId,
    currency: d.currency,
    rate: c.rate,
    total: money(d.total),
    po: text(d.po),
    invoice: text(d.invoice),
    description: text(d.description),
    allocations: d.allocations.map((a) => ({
      categoryId: a.categoryId,
      amount: money(a.amount),
    })),
    files: d.files,
  };
}
function paymentData(s, o, d, exclude) {
  const currency = d.currency || o.currency,
    c = s.currencies.find((c) => c.id === currency);
  need(c && positive(c.rate), "Select a payment currency");
  const existing = s.requests.find((r) => r.id === exclude),
    rate =
      existing?.currency === currency
        ? existing.rate
        : currency === o.currency
          ? o.rate
          : c.rate,
    amount =
      d.amount !== undefined && d.amount !== ""
        ? money(d.amount)
        : money(((o.total * Number(d.percent)) / 100 / o.rate) * rate),
    orderAmount = money((amount / rate) * o.rate),
    percent = Number(((orderAmount / o.total) * 100).toFixed(6));
  need(
    positive(amount) && percent <= 100.000001,
    "Payment percentage must be between 0 and 100",
  );
  const limit =
    o.amendment && o.amendment.status !== "Rejected"
      ? Math.min(o.total, o.amendment.data.total)
      : o.total;
  need(
    orderAmount + reservation(s, o, exclude) <= limit + 0.005,
    "Payment requests exceed the remaining order balance",
  );
  const date = text(d.date) || today();
  need(
    /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)),
    "Enter a valid request date",
  );
  return {
    currency,
    rate,
    amount,
    orderAmount,
    orderRate: o.rate,
    percent,
    date,
    terms: text(d.terms) || "Payment against order",
  };
}
function createPayment(s, u, o, d, now) {
  need(!o.rejectedAt, "This request was rejected");
  const r = {
    ...paymentData(s, o, d),
    id: randomId(),
    orderId: o.id,
    companyId: o.companyId,
    number: issue(s, o, "payment", now),
    status: "Draft",
    requestedBy: o.requestedBy,
    createdBy: u.id,
    createdAt: new Date(now).toISOString(),
    approvals: [],
    history: [],
    remarks: [],
    files: [],
  };
  s.requests.push(r);
  return r;
}
function orderSnapshot(o) {
  const { amendment, amendments, amendmentAttempts, ...details } = o;
  return structuredClone(details);
}
export function apply(s, u, a, now = Date.now()) {
  if (a.type === 'import.create' || a.type === 'import.preview') {
    const { kind, rows, files = [] } = a.data || {};
    need(u && u.active !== false, 'Active user required');
    need(importFields[kind], 'Invalid import type');
    need(['orders', 'payments'].includes(kind) ? canCreateRequests(u) : isFinanceAdmin(u), 'Your role cannot import these records');
    need(Array.isArray(rows) && rows.length > 0 && rows.length <= 100, 'Import between 1 and 100 records');
    need(Array.isArray(files) && JSON.stringify(files).length <= 2800000, 'Combined supporting PDFs must not exceed 2 MB');
    const next = structuredClone(s), errors = [];
    for (const [index, row] of rows.entries()) {
      try {
        const cmd = importCommand(next, u, kind, row.values, files);
        // Payment creation retains its ordinary parent lock contract.
        const previousLock = cmd.type === 'request.create' ? next.locks?.[cmd.data.orderId] : null;
        if (cmd.type === 'request.create') apply(next, u, { type: 'lock', id: cmd.data.orderId }, now);
        apply(next, u, cmd, now);
        if (cmd.type === 'request.create') {
          if (previousLock) next.locks[cmd.data.orderId] = previousLock;
          else apply(next, u, { type: 'unlock', id: cmd.data.orderId }, now);
        }
      } catch (error) { errors.push(`Row ${row.line || index + 2}: ${error.message}`); }
    }
    need(!errors.length, errors.join('\n'));
    if (a.type === 'import.create') {
      audit(next, u, 'import.create', kind, undefined, `${rows.length} records imported`, now);
      Object.assign(s, next);
    }
    return s;
  }
  migrateState(s, now);
  need(u?.active !== false, "User is inactive");
  const d = a.data || {};
  let company,
    entity = a.id || "",
    detail = "";
  const at = new Date(now).toISOString();
  if (a.type === "lock" || a.type === "unlock") {
    const rec =
      s.requests.find((x) => x.id === a.id) ||
      s.orders.find((x) => x.id === a.id);
    need(rec && access(u, rec.companyId), "Record not available");
    const l = s.locks[a.id];
    if (a.type === "lock") {
      checkLock(s, u, a.id, now, false);
      s.locks[a.id] = {
        userId: u.id,
        name: u.name,
        expires: now + s.settings.lockMinutes * 60000,
      };
    } else {
      need(
        !l || l.userId === u.id || isFinanceAdmin(u),
        "Only Finance or Admin can release another user’s lock",
      );
      delete s.locks[a.id];
      if (l && l.userId !== u.id)
        audit(s, u, "Admin unlocked", a.id, rec.companyId, l.name, now);
    }
    return s;
  }
  if (a.type === "order.create") {
    const data = validateOrder(s, u, d),
      o = {
        ...data,
        id: randomId(),
        requestedBy: u.id,
        createdBy: u.id,
        createdAt: at,
      };
    o.number = issue(s, o, "order", now);
    if (d.payment) paymentData(s, o, d.payment);
    s.orders.push(o);
    if (d.payment) {
      const r = createPayment(s, u, o, d.payment, now);
      audit(s, u, "request.create", r.id, o.companyId, r.number, now);
    }
    entity = o.id;
    company = o.companyId;
    detail = `${o.number}; PO ${o.po}; ${o.currency} ${o.total}`;
  } else if (a.type === "order.edit" || a.type === "order.amend") {
    const o = findOrder(s, a.id, u);
    checkLock(s, u, o.id, now);
    need(
      !o.rejectedAt && canManageRequest(u, o),
      "Only the original requester, Finance or Admin can amend this request",
    );
    need(
      !o.amendment || ["Rejected", "Draft"].includes(o.amendment.status),
      "An amendment is already in progress",
    );
    const next = validateOrder(s, u, d, o.id);
    need(
      ["companyId", "projectId", "currency"].every(
        (k) => next[k] === o[k],
      ),
      "Company, project and order currency cannot change after numbering",
    );
    next.rate = o.rate;
    need(
      next.total + 0.005 >= reservation(s, o),
      "Reject conflicting payment requests before reducing the order total",
    );
    need(text(d.reason), "Amendment reason required");
    if (o.amendment) {
      o.amendmentAttempts ||= [];
      o.amendmentAttempts.push(o.amendment);
    }
    o.amendment = {
      id: randomId(),
      previous: orderSnapshot(o),
      data: next,
      reason: text(d.reason),
      status: "Finance",
      companyId: o.companyId,
      requestedBy: u.id,
      approvals: [],
      history: [],
      createdAt: at,
    };
    company = o.companyId;
    detail = d.reason;
  } else if (a.type.startsWith("amendment.")) {
    const o = findOrder(s, a.id, u),
      m = o.amendment;
    checkLock(s, u, o.id, now);
    need(m && !o.rejectedAt, "No pending amendment");
    const action = a.type.split(".")[1];
    need(
      ["approve", "return", "reject"].includes(action),
      "Unknown amendment action",
    );
    need(
      (m.status === "Finance" && financeActor(u, m)) ||
        (action === "reject" && u.role === "Admin" && m.status === "Finance"),
      "You cannot review this amendment",
    );
    need(action === "approve" || text(d.reason), "Reason is required");
    m.history.push({
      stage: m.status,
      action,
      by: u.name,
      userId: u.id,
      at,
      reason: text(d.reason),
    });
    if (action === "approve") {
      need(financeActor(u, m), "You cannot approve this amendment");
      m.approvals.push({ stage: m.status, by: u.name, userId: u.id, at });
      {
        need(
          m.data.total + 0.005 >= reservation(s, o),
          "Reject conflicting payment requests before reducing the order total",
        );
        validateOrder(
          s,
          s.users.find((x) => x.id === o.requestedBy),
          m.data,
          o.id,
        );
        o.amendments ||= [];
        o.amendments.push({
          ...m,
          previous: orderSnapshot(o),
          approvedAt: at,
        });
        Object.assign(o, m.data);
        delete o.amendment;
      }
    } else if (action === "return") {
      m.status = "Draft";
      m.approvals = [];
    } else {
      m.status = "Rejected";
    }
    company = o.companyId;
    detail = text(d.reason);
  } else if (a.type === "amendment.resubmit") {
    fail("Use a corrected amendment proposal");
  } else if (a.type === "order.reject") {
    const o = findOrder(s, a.id, u);
    checkLock(s, u, o.id, now);
    need(isFinanceAdmin(u), "Finance or Admin required");
    need(!o.rejectedAt, "Request already rejected");
    need(text(d.reason), "Reason is required");
    need(
      s.requests
        .filter((r) => r.orderId === o.id)
        .every((r) => r.status === "Rejected"),
      "Reject all child payment requests first; paid requests require Admin payment deletion first",
    );
    o.rejectedAt = at;
    o.rejectedBy = u.id;
    o.rejectionReason = text(d.reason);
    company = o.companyId;
    detail = d.reason;
  } else if (a.type === "request.create") {
    const o = findOrder(s, d.orderId, u);
    need(
      canManageRequest(u, o),
      "Only the order requester, Finance or Admin can create a payment request",
    );
    checkLock(s, u, o.id, now);
    const r = createPayment(s, u, o, d, now);
    entity = r.id;
    company = o.companyId;
    detail = r.number;
  } else if (a.type.startsWith("request.")) {
    const r = findRequest(s, a.id, u),
      o = findOrder(s, r.orderId, u);
    checkLock(s, u, r.id, now);
    company = r.companyId;
    const action = a.type.split(".")[1];
    need(!o.rejectedAt, "Parent request is rejected");
    if (action === "edit" || action === "submit") {
      need(
        r.status === "Draft" && canManageRequest(u, r),
        "Only the requester, Finance or Admin can edit or submit a draft",
      );
      if (action === "edit") Object.assign(r, paymentData(s, o, d, r.id));
      else {
        need(o.files.length, "Order supporting required");
        need(
          reservation(s, o) <= o.total + 0.005,
          "Payment requests exceed order balance",
        );
        // Submitted requests go straight to Finance. The first submitted request of an
        // order commits the order to its budget.
        r.status = "Finance";
        r.approvals = [];
        r.finalApprovedAt = at;
        if (!o.committedAt) {
          o.committedAt = at;
          o.commitmentRequestId = r.id;
        }
      }
    } else if (["return", "reject"].includes(action)) {
      need(
        action === "reject" ? canReject(u, r) : stageActor(u, r),
        "You cannot review this stage",
      );
      need(text(d.reason), "Reason is required");
      r.history.push({
        stage: r.status,
        action,
        by: u.name,
        userId: u.id,
        at,
        reason: text(d.reason),
      });
      r.status = action === "return" ? "Draft" : "Rejected";
      r.approvals = [];
      delete r.finalApprovedAt;
      delete r.documentRequest;
      detail = text(d.reason);
    } else if (action === "documents") {
      need(
        financeActor(u, r) && ["Finance", "On Hold"].includes(r.status),
        "Finance role and submitted request required",
      );
      need(text(d.reason), "Specify the additional documents required");
      r.documentRequest = {
        description: text(d.reason),
        by: u.name,
        at,
        returnStatus: r.status,
      };
      r.status = "Documents Required";
      detail = d.reason;
    } else if (action === "support") {
      need(
        r.status === "Documents Required" && canManageRequest(u, r),
        "Only the original requester or Admin can supply these documents",
      );
      const files = documents(d.files);
      r.files.push(...files);
      r.history.push({
        stage: r.status,
        action: "Documents supplied",
        by: u.name,
        userId: u.id,
        at,
        reason: r.documentRequest.description,
      });
      r.status = r.documentRequest.returnStatus;
      delete r.documentRequest;
    } else if (action === "deletePayment") {
      need(isFinanceAdmin(u), "Only Finance or Admin can delete a payment");
      need(r.status === "Paid" && r.payment, "Paid request required");
      need(text(d.reason), "Reason is required");
      delete r.payment;
      r.status = "Finance";
      r.history.push({
        stage: "Paid",
        action: "Payment deleted",
        by: u.name,
        userId: u.id,
        at,
        reason: text(d.reason),
      });
      detail = text(d.reason);
    } else if (["remark", "hold", "resume", "pay"].includes(action)) {
      need(
        financeActor(u, r) && ["Finance", "On Hold"].includes(r.status),
        "Finance role and submitted request required",
      );
      if (action === "remark" || action === "hold") {
        need(text(d.reason), "Reason or remark required");
        r.remarks.push({ by: u.name, at, text: text(d.reason) });
        detail = text(d.reason);
      }
      if (action === "hold") r.status = "On Hold";
      if (action === "resume") r.status = "Finance";
      if (action === "pay") {
        need(r.status === "Finance", "Release the hold before payment");
        need(
          ["Cheque", "Transfer", "TT"].includes(d.paymentType),
          "Select a payment type",
        );
        need(
          /^\d{4}-\d{2}-\d{2}$/.test(text(d.paymentDate)) &&
            !Number.isNaN(Date.parse(d.paymentDate)) &&
            d.paymentDate <= today(now),
          "Enter a valid payment date no later than today",
        );
        const files = documents(d.files || (d.file ? [d.file] : []));
        r.payment = {
          amount: r.amount,
          currency: r.currency,
          date: d.paymentDate,
          type: d.paymentType,
          files,
          by: u.name,
          userId: u.id,
          at,
        };
        r.status = "Paid";
        detail = `${r.amount} ${r.currency}, ${d.paymentType}, ${d.paymentDate}`;
      }
    } else fail("Unknown request action");
  } else if (a.type === "master.save") {
    need(isFinanceAdmin(u), "Finance or Admin required");
    const kind = d.kind;
    need(
      ["companies", "projects", "budgets", "suppliers", "currencies"].includes(
        kind,
      ),
      "Invalid master type",
    );
    const rec = structuredClone(d.record);
    need(text(rec.name), "Name required");
    const prev = s[kind].find((x) => x.id === rec.id);
    if (kind === "companies" || kind === "projects") {
      rec.code = norm(rec.code);
      need(
        /^[A-Z0-9]{2,12}$/.test(rec.code),
        "Short code must contain 2–12 letters or digits",
      );
      need(
        !s[kind].some(
          (x) =>
            x.id !== rec.id &&
            x.code === rec.code &&
            (kind === "companies" || x.companyId === rec.companyId),
        ),
        "Short code already exists",
      );
    }
    if (kind === "companies" || kind === "suppliers")
      need(
        !s[kind].some(
          (x) => x.id !== rec.id && norm(x.name) === norm(rec.name),
        ),
        "Duplicate master name",
      );
    if (kind === "projects")
      need(
        s.companies.some((c) => c.id === rec.companyId),
        "Select company",
      );
    if (kind === "budgets") {
      need(
        s.projects.some(
          (p) => p.id === rec.projectId && p.companyId === rec.companyId,
        ),
        "Select project and company",
      );
      need(
        Array.isArray(rec.categories) && rec.categories.length,
        "Add budget categories",
      );
      need(
        new Set(rec.categories.map((c) => norm(c.name))).size ===
          rec.categories.length,
        "Category names must be unique",
      );
      rec.categories.forEach((c) =>
        need(
          text(c.name) && positive(c.amount),
          "Category name and approved amount required",
        ),
      );
      const currency = s.currencies.find(
        (c) => c.id === (rec.currency || "USD"),
      );
      need(currency, "Select budget currency");
      rec.currency = currency.id;
      rec.rate = prev?.currency === rec.currency ? prev.rate : currency.rate;
      if (prev) {
        need(text(d.reason), "Budget revision reason required");
        need(
          prev.companyId === rec.companyId && prev.projectId === rec.projectId,
          "Budget company/project cannot change",
        );
        need(
          prev.categories.every((c) =>
            rec.categories.some((x) => x.id === c.id),
          ),
          "Keep existing categories when revising a budget",
        );
        rec.revisions = [
          ...(prev.revisions || []),
          {
            at: new Date(now).toISOString(),
            by: u.name,
            reason: text(d.reason),
            currency: prev.currency,
            rate: prev.rate,
            categories: structuredClone(prev.categories),
          },
        ];
      } else rec.revisions = [];
    }
    if (kind === "currencies") {
      rec.id = norm(rec.id);
      need(
        /^[A-Z]{3}$/.test(rec.id) && positive(rec.rate),
        "Currency must have a 3-letter code and positive rate",
      );
      rec.rate = Number(rec.rate);
      need(rec.id !== "USD" || rec.rate === 1, "USD base rate must be 1");
    }
    if (prev && kind === "projects")
      need(prev.companyId === rec.companyId, "Project company cannot change");
    rec.id = rec.id || randomId();
    rec.name = text(rec.name);
    if (prev) s[kind][s[kind].indexOf(prev)] = rec;
    else s[kind].push(rec);
    entity = rec.id;
    company = rec.companyId;
    detail = `${kind}: ${rec.name}${d.reason ? " — " + d.reason : ""}`;
  } else if (a.type === "user.save") {
    need(u.role === "Admin", "Admin required");
    const x = d.record;
    need(
      ROLES.includes(x.role) &&
        text(x.name) &&
        text(x.username) &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(x.email)),
      "Name, username, email and single role required",
    );
    need(
      !s.users.some(
        (y) =>
          y.id !== x.id &&
          (norm(y.username) === norm(x.username) ||
            norm(y.email) === norm(x.email)),
      ),
      "Username or email already exists",
    );
    need(
      x.role === "Admin" ||
        x.groupAccess ||
        (Array.isArray(x.companies) && x.companies.length),
      "Assign company access",
    );
    need(
      (x.companies || []).every((c) => s.companies.some((y) => y.id === c)),
      "Invalid company access",
    );
    const prev = s.users.find((y) => y.id === x.id);
    const user = {
      ...(prev || {}),
      id: x.id || randomId(),
      name: text(x.name),
      username: text(x.username),
      email: text(x.email).toLowerCase(),
      role: x.role,
      companies: x.companies || [],
      groupAccess: !!x.groupAccess,
      active: x.active !== false,
    };
    if (prev?.role === "Admin" && (user.role !== "Admin" || !user.active))
      need(
        s.users.some((y) => y.id !== user.id && y.role === "Admin" && y.active),
        "Keep at least one active Admin",
      );
    delete user.team;
    delete user.approvalLevel;
    if (prev) {
      delete prev.team;
      delete prev.approvalLevel;
      Object.assign(prev, user);
    } else s.users.push(user);
    entity = user.id;
    detail = `${user.username}: ${user.role}`;
  } else if (a.type === "task.save") {
    const x = d.record || {};
    const prev = x.id ? s.tasks.find((t) => t.id === x.id) : null;
    need(!x.id || prev, "Task not found");
    const p = s.projects.find((p) => p.id === (prev ? prev.projectId : x.projectId));
    need(p, "Select a valid project");
    need(canEditTasks(u, p.companyId), "Only Finance or Admin can change project tasks");
    const taskName = text(x.name);
    need(taskName && taskName.length <= 120, "Task name required (up to 120 characters)");
    need(TASK_STATUSES.includes(x.status), "Select a task status");
    const due = text(x.due);
    need(!due || (/^\d{4}-\d{2}-\d{2}$/.test(due) && !Number.isNaN(Date.parse(due))), "Enter a valid due date");
    const owner = text(x.owner).slice(0, 80);
    const task = {
      ...(prev || { id: randomId(), createdAt: at, createdBy: u.id }),
      companyId: p.companyId,
      projectId: p.id,
      name: taskName,
      status: x.status,
      due,
      owner,
      updatedAt: at,
    };
    if (task.status === "Done") task.completedAt = prev?.status === "Done" ? prev.completedAt : at;
    else delete task.completedAt;
    if (prev) s.tasks[s.tasks.indexOf(prev)] = task;
    else s.tasks.push(task);
    entity = task.id;
    company = p.companyId;
    detail = `${p.name}: ${task.name} · ${task.status}`;
  } else if (a.type === "task.delete") {
    const t = s.tasks.find((t) => t.id === a.id);
    need(t, "Task not found");
    need(canEditTasks(u, t.companyId), "Only Finance or Admin can change project tasks");
    s.tasks.splice(s.tasks.indexOf(t), 1);
    company = t.companyId;
    detail = `${s.projects.find((p) => p.id === t.projectId)?.name || "Project"}: ${t.name}`;
  } else if (a.type === "settings.save") {
    need(u.role === "Admin", "Admin required");
    for (const key of ["orderFormat", "numberFormat"]) {
      const f = text(d[key]);
      need(
        f.length <= 100 &&
          ["{COMPANY}", "{PROJECT}", "{SEQ}"].every((t) => f.includes(t)) &&
          !/\{(?!COMPANY\}|PROJECT\}|SEQ\}|YYYY\})/.test(f),
        "Formats must contain {COMPANY}, {PROJECT} and {SEQ}; optional {YYYY}",
      );
    }
    need(
      d.orderFormat !== d.numberFormat,
      "Use distinct parent and payment formats",
    );
    need(Number(d.lockMinutes) === 10, "Lock duration is 10 minutes");
    s.settings = {
      orderFormat: text(d.orderFormat),
      numberFormat: text(d.numberFormat),
      lockMinutes: 10,
    };
    detail =
      "Numbering formats updated; existing references and counters retained";
  } else fail("Unknown action");
  audit(
    s,
    u,
    a.type === "request.deletePayment" ? "Payment deleted" : a.type,
    entity,
    company,
    detail,
    now,
  );
  return s;
}
