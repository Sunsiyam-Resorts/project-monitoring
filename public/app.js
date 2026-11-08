import {
  apply,
  migrateState,
  today,
  approved,
  reservation,
  remainingToRequest,
  parentAmount,
  stageActor,
  canReject,
  canCreateRequests,
  canManageRequest,
  randomId,
  currencyStats,
  financeActor,
  isFinanceAdmin,
  canEditTasks,
  projectProgress,
  TASK_STATUSES,
  visibleState,
  supportingFile,
  kpis,
  kpiTrend,
  money,
  access,
  budgetAmount,
  categoryUsed,
  warnings,
  ROLES,
} from "./domain.js";
import { demoState } from "./demo.js";
import { createUI } from "./ui.js";
import { icon } from "./icons.js";
import { importFields, parseCSV, tableRows, excelRows, checkExcelArchive } from './import-data.js';
let importPreview = null;
async function excelLibrary() {
  if (!globalThis.ExcelJS) await import('./vendor/exceljs.min.js');
  return globalThis.ExcelJS;
}
function downloadImport(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function importForm() {
  importPreview = null;
  const kinds = page === 'master' ? [masterTab] : ['orders', 'payments'];
  const labels = { companies: 'Companies', projects: 'Projects', suppliers: 'Suppliers', currencies: 'Currencies', budgets: 'Approved budgets', orders: 'New requests with first payment', payments: 'Additional payment requests' };
  showModal('Import CSV or Excel', `<form data-form="import"><div class="notice">Create new records only. Existing records and budget revisions must be edited individually. Requests are imported as drafts; each payment request is submitted to Finance separately.</div>${field('Import type', `<select name="importKind">${kinds.map(k => `<option value="${k}">${labels[k]}</option>`).join('')}</select>`)}<div class="actions"><button type="button" data-action="importCSV">Download CSV template</button><button type="button" data-action="importXLSX">Download Excel template</button></div><p class="help">Use all template headings, one record per row (maximum 100). Company and project accept names or short codes. Categories and allocations use Category:amount | Category:amount. For payments enter either amount or percentage, leaving the other blank. Dates use YYYY-MM-DD. Excel imports use one populated sheet; formulas are not accepted.</p>${field('CSV or XLSX file · maximum 2 MB', '<input name="importFile" type="file" accept=".csv,.xlsx" required>')}<div id="importSupporting" ${kinds[0] === 'orders' ? '' : 'hidden'}>${field('Supporting PDFs for new requests · combined maximum 2 MB', '<input name="importPDFs" type="file" accept="application/pdf,.pdf" multiple>')}<p class="help">For new requests, list attached PDF filenames in Supporting PDFs, separated by |. Currency fields use configured three-letter codes. Approved budget, supplier and category names must match Master Data. Blank payment date defaults to today; blank payment currency uses the order currency.</p></div><div id="importPreview" aria-live="polite"></div>${footer('Validate and preview', 'The entire file must pass validation before anything is saved.')}</form>`);
}
async function importTemplate(excel) {
  const kind = document.querySelector('[name=importKind]').value, headers = importFields[kind];
  if (excel) {
    const Excel = await excelLibrary(), workbook = new Excel.Workbook(), sheet = workbook.addWorksheet('Import');
    sheet.addRow(headers); sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((col, i) => { col.width = Math.max(20, headers[i].length + 3); });
    downloadImport(new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${kind}-template.xlsx`);
  } else downloadImport(new Blob(['\uFEFF' + headers.join(',') + '\r\n'], { type: 'text/csv;charset=utf-8' }), `${kind}-template.csv`);
}
async function readImport(file, kind) {
  if (!file?.size || file.size > 2000000) throw Error('Choose a CSV or XLSX file up to 2 MB');
  if (/\.csv$/i.test(file.name)) return tableRows(kind, parseCSV(await file.text()));
  if (!/\.xlsx$/i.test(file.name)) throw Error('Choose a .csv or .xlsx file');
  const Excel = await excelLibrary(), workbook = new Excel.Workbook();
  const buffer = await file.arrayBuffer();
  checkExcelArchive(buffer);
  await workbook.xlsx.load(buffer);
  return excelRows(kind, workbook);
}
const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const fmt = (v, cur = "USD") =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(Number(v) || 0);
const date = (v) =>
  v
    ? new Date(v).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
let state,
  user,
  raw,
  demo = false,
  page = "dashboard",
  tab = "requests",
  masterTab = "companies",
  company = "",
  project = "",
  from = "",
  to = "",
  search = "",
  statusFilter = "",
  selected = null,
  returnPaymentId = null,
  loginStep = "password",
  loginChallenge = "",
  enrollKey = "",
  enrollQr = "",
  enrollMethod = "qr",
  busy = false;
const expanded = new Set();
let sortOrder = "date-desc",
  masterSearch = "",
  auditSearch = "",
  auditFilter = { action: "", user: "", company: "", from: "", to: "" },
  auditPageNo = 1,
  userSearch = "",
  filtersExpanded = false,
  toastTimer,
  focusReturn = null,
  labelSequence = 0,
  approvalOnly = false,
  projectId = "",
  projectSearch = "",
  financeOnly = false;
const pageNames = {
  dashboard: "Dashboard",
  requests: "Requests",
  master: "Master Data",
  users: "User Manager",
  settings: "Settings",
};
const brand = () =>
  `<div class="brand"><img class="brand-logo" src="/logo.svg" alt="Sun Siyam" width="110" height="88"><span class="brand-label">PROJECT MONITORING</span></div>`;
const { appShell, appSidebar, appHeader, propertySwitcher, pageHeader, statCard, trendChart, budgetChart, paymentChart, figureLength,
  field, badge, empty, disclosure, loadingSkeleton, themePicker } = createUI({ esc, icon, getThemePreference: () => document.documentElement.dataset.themePreference || 'system', getResolvedTheme: () => document.documentElement.dataset.theme || 'light' });
const section = (number, title, body, description = "") =>
  `<fieldset class="form-section"><legend><span>${number}</span>${title}</legend>${description ? `<p>${description}</p>` : ""}${body}</fieldset>`;
const footer = (label, note = "") =>
  `<div class="form-footer">${note ? `<small>${note}</small>` : ""}<button type="button" data-action="close">Cancel</button><button class="primary" type="submit">${label}${icon("arrow")}</button></div>`;
const rowAction = (action, id, label) =>
  `<button class="row-action" data-action="${action}" data-id="${id}" aria-label="${esc(label)}" title="${esc(label)}">${icon("arrow")}</button>`;
const usd = (v) => `<span class="currency">USD</span>${fmt(v)}`;

const storeKey = "ss-project-monitoring-demo-v1";
function toast(m, kind = "success") {
  const t = $("#toast");
  t.textContent = m;
  t.dataset.kind = kind;
  t.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.style.display = "none"), 5000);
  if ($("#modal").open) {
    let feedback = $("#modalFeedback");
    if (!feedback) {
      feedback = document.createElement("div");
      feedback.id = "modalFeedback";
      feedback.setAttribute("role", "status");
      $("#modal .modal-body").prepend(feedback);
    }
    feedback.className =
      "notice " + (kind === "error" ? "error" : "success") + " modal-feedback";
    feedback.textContent = m;
  }
}
async function api(action, body) {
  const r = await fetch("/api/index?action=" + action, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error || "Request failed");
  return j;
}
function useDemo() {
  demo = true;
  try {
    raw = JSON.parse(localStorage.getItem(storeKey));
  } catch {}
  // A demo saved from older sample data (for example before project tasks) is replaced
  // with the current sample, so new demo content always shows up.
  if (!raw || raw.sampleVersion !== demoState().sampleVersion) raw = demoState({ history: true });
  migrateState(raw);
  localStorage.setItem(storeKey, JSON.stringify(raw));
  user =
    raw.users.find((u) => u.id === sessionStorage.getItem("demo-actor")) ||
    raw.users[0];
  state = visibleState(raw, user);
  render();
}
async function command(a) {
  if (busy) throw Error("Please wait for the current action");
  busy = true;
  try {
    if (demo) {
      const next = structuredClone(raw);
      apply(next, user, a);
      raw = next;
      localStorage.setItem(storeKey, JSON.stringify(raw));
      user = raw.users.find((u) => u.id === user.id);
      state = visibleState(raw, user);
    } else {
      const out = await api("command", a);
      state = out.state;
      user = out.user;
    }
    render();
    return true;
  } finally {
    busy = false;
  }
}
const name = (kind, id) => state[kind].find((x) => x.id === id)?.name || "—";
const opt = (arr, val, blank = "Select…") =>
  `<option value="">${esc(blank)}</option>` +
  arr
    .map(
      (x) =>
        `<option value="${esc(x.id)}" ${x.id === val ? "selected" : ""}>${esc(x.name)}</option>`,
    )
    .join("");
const input = (n, v = "", type = "text", attrs = "") =>
  `<input name="${n}" value="${esc(v)}" type="${type}" ${attrs}>`;
function amendmentAttention(o) {
  return !o.rejectedAt && o.amendment && (stageActor(user, o.amendment) ||
    (o.amendment.status === 'Draft' && canManageRequest(user, o)));
}
function attention(r) {
  return (
    (["Draft", "Documents Required"].includes(r.status) &&
      canManageRequest(user, r)) ||
    stageActor(user, r)
  );
}
function sortRequests(rs) {
  return rs.slice().sort((a, b) => {
    if (sortOrder === "amount-desc") {
      const oa = state.orders.find((o) => o.id === a.orderId),
        ob = state.orders.find((o) => o.id === b.orderId);
      return b.amount / (b.rate || ob.rate) - a.amount / (a.rate || oa.rate);
    }
    if (sortOrder === "date-asc")
      return a.date.localeCompare(b.date) || a.number.localeCompare(b.number);
    if (sortOrder === "number") return a.number.localeCompare(b.number);
    return b.date.localeCompare(a.date) || b.number.localeCompare(a.number);
  });
}
function accessible(root = document) {
  root.querySelectorAll('[data-theme-picker]').forEach(picker => {
    picker.value = document.documentElement.dataset.themePreference || 'system';
  });
  root
    .querySelectorAll(".field, .filters>div, .category-row")
    .forEach((group) => {
      const label = group.querySelector("label"),
        control = group.querySelector("input,select,textarea");
      const help = group.querySelector(".help");
      if (help && control) {
        help.id = help.id || "help-" + ++labelSequence;
        control.setAttribute("aria-describedby", help.id);
      }
      if (label && control && !label.contains(control)) {
        if (!control.id) control.id = "field-" + ++labelSequence;
        label.htmlFor = control.id;
      }
    });
  root.querySelectorAll(".table-wrap").forEach((wrap, i) => {
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    wrap.setAttribute(
      "aria-label",
      (wrap.closest("section")?.querySelector("h2,h3")?.textContent ||
        "Data table") + " · scroll for more columns",
    );
  });
  root.querySelectorAll("th").forEach((th) => (th.scope = "col"));
  root.querySelectorAll(".tabs").forEach((t) => {
    t.setAttribute("role", "group");
    t.setAttribute("aria-label", "View selection");
    t.querySelectorAll("button").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.classList.contains("active"))),
    );
  });
  root.querySelectorAll("form").forEach((f) => {
    if (!f.querySelector(".form-error"))
      f.insertAdjacentHTML(
        "afterbegin",
        '<div class="form-error" role="alert" tabindex="-1" hidden></div>',
      );
  });
}
const disclosureState = new Map();
function restoreDisclosures() {
  document.querySelectorAll('[data-disclosure]').forEach(el => {
    const key = page + ':' + el.dataset.disclosure;
    el.open = disclosureState.get(key) || false;
    el.addEventListener('toggle', () => disclosureState.set(key, el.open));
  });
}
// Motion. Same feel as the smooth page scroll: a strong ease-out over ~0.65–0.9s.
// Reduced-motion users get instant updates. Nothing here changes text content,
// so figures stay exactly as rendered for tests and assistive technology.
const MOTION_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const reduceMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
const motionOff = () => !!reduceMotionQuery?.matches;
// KPI figures roll digit by digit (odometer) from the last shown value to the new one;
// on first view they roll up from zeros. Each digit keeps its real character as
// (transparent) text; the rolling 0–9 strip is drawn by CSS ::before.
const shownFigures = new Map();
function flipNumbers() {
  document.querySelectorAll(".dashboard-kpi[data-kpi] .dashboard-kpi-value").forEach((el) => {
    const key = el.closest("[data-kpi]").dataset.kpi;
    const next = el.textContent;
    if (!next.trim()) return;
    const prev = shownFigures.get(key) ?? next.replace(/\d/g, "0");
    shownFigures.set(key, next);
    if (prev === next || motionOff()) return;
    const from = prev.length >= next.length ? prev.slice(prev.length - next.length) : " ".repeat(next.length - prev.length) + prev;
    const wrap = document.createElement("span");
    wrap.className = "odo-number";
    // Decimals roll in their own half-size group on the same baseline.
    const dot = next.indexOf(".");
    const decimals = document.createElement("span");
    decimals.className = "odo-dec";
    [...next].forEach((ch, i) => {
      const cell = document.createElement("span");
      cell.textContent = ch;
      if (/\d/.test(ch)) {
        cell.className = "odo";
        cell.style.setProperty("--d", /\d/.test(from[i]) ? from[i] : "0");
        cell.style.setProperty("--i", String(i));
        cell.dataset.to = ch;
      }
      (dot >= 0 && i >= dot ? decimals : wrap).append(cell);
    });
    if (decimals.childNodes.length) wrap.append(decimals);
    el.replaceChildren(wrap);
    requestAnimationFrame(() => requestAnimationFrame(() =>
      wrap.querySelectorAll(".odo").forEach((cell) => cell.style.setProperty("--d", cell.dataset.to))));
  });
}
// Trend charts wipe in from left to right on first view and whenever their data
// changes (for example after a filter change); unchanged charts do not replay.
const shownCharts = new Map();
function revealCharts() {
  document.querySelectorAll(".dashboard-kpis .kpi-trend").forEach((svg, i) => {
    const key = svg.closest("[data-kpi]")?.dataset.kpi || svg.closest("[data-chart]")?.dataset.chart;
    const drawn = svg.innerHTML;
    const changed = shownCharts.get(key) !== drawn;
    shownCharts.set(key, drawn);
    if (!changed || motionOff() || !svg.animate) return;
    (svg.closest(".overview-plot") || svg).animate([{ clipPath: "inset(-8px 100% -8px -8px)" }, { clipPath: "inset(-8px -8px -8px -8px)" }],
      { duration: 2200, delay: Math.min(i, 6) * 120, easing: MOTION_EASE, fill: "backwards" });
  });
}
// Table rows animate as separate items between renders of the same page: rows that
// stay glide to their new position, rows that leave slide out to the right, and
// new rows rise from below into place.
const topTables = () => [...document.querySelectorAll(".content table")].filter((t) => !t.parentElement.closest("table"));
const tableKey = (t, i) => (document.querySelector(".main")?.dataset.view || "") + ":" +
  (t.closest("[data-disclosure]")?.dataset.disclosure || t.closest("section[aria-label], .panel")?.querySelector("h2")?.textContent || i);
const rowKey = (tr) => tr.dataset.rowKey || tr.cells[0]?.textContent.trim().replace(/\s+/g, " ");
function snapshotTables() {
  const snap = new Map();
  if (motionOff()) return snap;
  topTables().forEach((t, i) => {
    const rows = new Map();
    for (const tr of [...(t.tBodies[0]?.rows || []), ...(t.tFoot?.rows || [])]) {
      const k = (tr.parentElement.tagName === "TFOOT" ? "tfoot:" : "") + rowKey(tr);
      const rect = tr.getBoundingClientRect();
      if (!k || rows.has(k) || !rect.height) continue;
      rows.set(k, { tr, rect, widths: [...tr.cells].map((c) => c.getBoundingClientRect().width) });
    }
    const wrap = t.closest(".table-wrap");
    snap.set(tableKey(t, i), { rows, wrapClass: wrap?.className || "table-wrap", height: wrap?.getBoundingClientRect().height || 0 });
  });
  return snap;
}
function ghostRow(old, wrapClass) {
  const r = old.rect;
  if (r.bottom < 0 || r.top > window.innerHeight) return;
  const wrap = document.createElement("div");
  wrap.className = wrapClass + " row-ghost";
  wrap.setAttribute("aria-hidden", "true");
  Object.assign(wrap.style, { position: "fixed", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
  const table = document.createElement("table");
  const body = document.createElement("tbody");
  [...old.tr.cells].forEach((c, i) => { c.style.width = old.widths[i] + "px"; });
  body.append(old.tr);
  table.append(body);
  wrap.append(table);
  document.body.append(wrap);
  const done = () => wrap.remove();
  wrap.animate([{ transform: "none", opacity: 1 }, { transform: `translateX(${Math.round(Math.min(r.width * 0.6, 520))}px)`, opacity: 0 }],
    { duration: 600, easing: MOTION_EASE, fill: "forwards" }).finished.then(done, done);
}
function animateTables(snap) {
  if (!snap?.size || motionOff()) return;
  topTables().forEach((t, i) => {
    const before = snap.get(tableKey(t, i));
    if (!before) return;
    const kept = new Set();
    let entering = 0;
    // The table eases from its old height to the new one so content below never jumps.
    const wrap = t.closest(".table-wrap");
    const height = wrap?.getBoundingClientRect().height || 0;
    if (wrap?.animate && before.height && Math.abs(before.height - height) > 1) {
      wrap.animate([{ height: before.height + "px", overflow: "hidden" }, { height: height + "px", overflow: "hidden" }], { duration: 650, easing: MOTION_EASE });
    }
    for (const tr of [...(t.tBodies[0]?.rows || []), ...(t.tFoot?.rows || [])]) {
      if (!tr.animate) return;
      const k = (tr.parentElement.tagName === "TFOOT" ? "tfoot:" : "") + rowKey(tr);
      const old = k && before.rows.get(k);
      if (old) {
        kept.add(k);
        const dy = old.rect.top - tr.getBoundingClientRect().top;
        if (Math.abs(dy) > 1) tr.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 650, easing: MOTION_EASE });
      } else {
        tr.animate([{ transform: "translateY(28px)", opacity: 0 }, { transform: "none", opacity: 1 }],
          { duration: 650, delay: Math.min(entering++, 12) * 40, easing: MOTION_EASE, fill: "backwards" });
      }
    }
    before.rows.forEach((old, k) => { if (!kept.has(k)) ghostRow(old, before.wrapClass); });
  });
}
function render() {
  if (!user) {
    renderLogin();
    return;
  }
  if (company && !state.companies.some((c) => c.id === company)) {
    company = "";
    project = "";
  }
  const pending = state.requests.filter(attention).length + state.orders.filter(amendmentAttention).length;
  const sidebarProps = { brand: brand(), page, admin: user.role === 'Admin', manage: isFinanceAdmin(user), pending, user };
  const actorFor = (id) => demo ? { id, html: `<select id="${id}" aria-label="Demo user — role switching for testing only">${raw.users.filter(u => u.active).map(u => `<option value="${u.id}" ${u.id === user.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>` } : null;
  const operational = ['dashboard', 'projects', 'project', 'requests'].includes(page);
  const scopeFor = (id) => operational
    ? propertySwitcher(state.companies, company, id)
    : '<span class="admin-scope">Group administration</span>';
  const tableSnapshot = snapshotTables();
  $("#app").innerHTML = appShell({
    page,
    sidebar: appSidebar({ ...sidebarProps, scope: scopeFor('company'), actor: actorFor('actor') }),
    drawer: appSidebar({ ...sidebarProps, scope: scopeFor('drawerCompany'), actor: actorFor('drawerActor'), drawer: true }),
    header: appHeader(),
    banner: demo ? '<div class="demo-banner"><span><strong>Demo workspace</strong>Sample data · browser-local changes<span class="demo-explanation"> · Role switching is for testing only.</span></span><a href="#" data-action="resetDemo">Reset sample data</a></div>' : '',
    content: page === 'dashboard' ? dashboard() : page === 'projects' ? projectsPage() : page === 'project' ? projectPage() : page === 'requests' ? requestsPage() : page === 'master' ? masterPage() : page === 'users' ? usersPage() : page === 'audit' ? auditPage() : settingsPage(),
  });
  $('#navigationDrawer').addEventListener('close', () => $('[data-action=openNavigation]')?.setAttribute('aria-expanded', 'false'));
  restoreDisclosures();
  accessible();
  flipNumbers();
  revealCharts();
  animateTables(tableSnapshot);
}
// compact (Dashboard): the Project label is for screen readers only, the blank option reads
// 'All projects', and there is no Clear filters link.
function filters(dates = false, note = '', actions = '', compact = false) {
  const extra = Boolean(from || to || statusFilter);
  return `<div class="filters"><div><label for="project"${compact ? ' class="sr-only"' : ""}>Project</label><select id="project">${opt(
    state.projects.filter((p) => !company || p.companyId === company),
    project,
    compact ? "All projects" : "All",
  )}</select></div>${
    dates
      ? `<button data-action="toggleFilters" aria-expanded="${filtersExpanded}" aria-controls="extraFilters">${icon("filter")}Filters${extra ? '<span class="count">Active</span>' : ""}</button><div class="advanced-filters wide" id="extraFilters" ${filtersExpanded ? "" : "hidden"}><div><label for="from">Request date · From</label><input id="from" type="date" value="${from}"></div><div><label for="to">To</label><input id="to" type="date" value="${to}"></div><div><label for="statusFilter">Status</label><select id="statusFilter">${opt(
          [
            "Draft",
            "Finance",
            "On Hold",
            "Paid",
            "Rejected",
            "Documents Required",
          ].map((x) => ({ id: x, name: x })),
          statusFilter,
          "All",
        )}</select></div></div>`
      : ""
  }<div class="filter-end">${note}<span class="currency-label">Reporting currency <strong>USD</strong></span></div>${!compact && (company || project || extra) ? '<button class="linkbtn" data-action="clearFilters">Clear filters</button>' : ""}${actions}</div>`;
}
// The budget card (three figures over the YTD chart) and, on the right, the payment card
// (four figures over one combined chart). Shared by the Dashboard and each project page;
// `before` / `after` add cards above or below the payment card in the right-hand column.
function overview(c, p, { before = '', after = '' } = {}) {
  const k = kpis(state, c, p);
  const trend = kpiTrend(state, c, p);
  const periodLabel = (t) => new Date(t).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const monthName = (t) => new Date(t).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  const lastMonth = trend.budget.at(-1)?.start ?? Date.now();
  const caption = `YTD · ${monthName(trend.budget[0]?.start ?? lastMonth)}–${monthName(lastMonth)} ${new Date(lastMonth).getUTCFullYear()}`;
  const paymentSeries = [['paid', 'Paid'], ['outstanding', 'Outstanding Payments'], ['hold', 'On Hold'], ['balance', 'Balance Payments Pending']];
  return `<div class="kpi-layout"><section class="dashboard-kpis budget-kpis budget-overview" aria-label="Budget overview" style="--row-len:${Math.max(...[k.budget, k.utilized, k.available].map(v => figureLength(fmt(v))))}"><div class="overview-figures">${[['Total Approved Budget', k.budget, 'budget'], ['Budget Utilized', k.utilized, 'utilized'], ['Available Budget', k.available, 'available']].map(([label, value, key]) => statCard(label, fmt(value), key, 2)).join('')}</div>${budgetChart(trend, { fmt, periodLabel, monthLabel: monthName, caption })}</section>
    <div class="kpi-side">${before}<section class="dashboard-kpis budget-kpis payment-overview" aria-label="Payment overview" style="--row-len:${Math.max(...[k.paid, k.outstanding, k.hold, k.balance].map(v => figureLength(fmt(v))))}"><div class="overview-figures">${paymentSeries.map(([key, label]) => statCard(label, fmt(k[key]), key, 3)).join('')}</div>${paymentChart(trend, paymentSeries, { fmt, periodLabel, monthLabel: monthName, caption })}</section>${after}</div></div>`;
}
// Recent activity: a dated ledger, newest first.
function activityCard(activity, note = 'Approvals, payments and changes in this view will appear here.') {
  return `<section class="panel activity-card" aria-labelledby="activityTitle"><header class="card-head"><h2 id="activityTitle">Recent activity</h2><small>Latest ${activity.length}</small></header>${activity.length ? `<ol class="activity-list">${activity.map(x => { const d = new Date(x.at); return `<li class="activity-entry"><time datetime="${esc(x.at)}"><b>${String(d.getDate()).padStart(2, '0')}</b><small>${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()}</small><small>${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</small></time><div><strong>${esc(actionLabel(x.action))}</strong><p>${esc(x.user)}${x.detail ? ' · ' + esc(x.detail) : ''}</p></div></li>`; }).join('')}</ol>` : empty('No activity yet', note)}</section>`;
}
// Task progress bar: Done (solid) then In progress (hatched); the rest of the track is To do.
function progressBar(g, label = '') {
  const pct = (n) => (g.total ? (n / g.total) * 100 : 0).toFixed(2);
  return `<span class="progress-track" role="img" aria-label="${esc(label || (g.total ? `${g.done} done, ${g.inProgress} in progress, ${g.todo} to do` : 'No tasks yet'))}"><i class="done" style="width:${pct(g.done)}%"></i><i class="doing" style="width:${pct(g.inProgress)}%"></i></span>`;
}
const TASK_ORDER = { "In progress": 0, "To do": 1, Done: 2 };
const shortDate = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
// Projects: every visible project as a card with its task progress and budget position.
function projectsPage() {
  const q = projectSearch.trim().toLowerCase();
  const all = state.projects.filter((p) => !company || p.companyId === company);
  const ps = all.filter((p) => !q || [p.name, p.code, name('companies', p.companyId)].join(' ').toLowerCase().includes(q));
  const cards = ps.map((p) => {
    const g = projectProgress(state, p.id), k = kpis(state, p.companyId, p.id);
    // The whole card opens the project; the title button is its keyboard stop.
    return `<article class="panel project-card" data-action="openProject" data-id="${p.id}"><div class="project-card-head"><div><h2><button class="project-link" data-action="openProject" data-id="${p.id}">${esc(p.name)}</button></h2><p>${esc(name('companies', p.companyId))}${p.code ? ' · ' + esc(p.code) : ''}</p></div><b class="project-pct">${g.pct === null ? '—' : `${g.pct}<span>%</span>`}</b></div>${progressBar(g)}<div class="project-foot"><span>${g.total ? `${g.done} of ${g.total} done` : 'No tasks yet'}${g.overdue ? ` · <span class="project-late">${icon('clock')}${g.overdue} overdue</span>` : ''}</span><span><strong>${fmt(k.available)}</strong> available</span></div></article>`;
  }).join('');
  return `${pageHeader('PORTFOLIO', 'Projects', 'Progress from each project’s tasks, beside its budget position.', isFinanceAdmin(user) ? `<button class="primary" data-action="newProject">${icon('plus')}Add project</button>` : '')}<div class="list-toolbar"><div class="searchbox">${icon('search')}<input id="projectSearch" value="${esc(projectSearch)}" aria-label="Search projects" placeholder="Search project, code or company"></div><small>${ps.length} of ${all.length} projects · budgets in USD</small></div>${ps.length ? `<div class="project-grid">${cards}</div>` : `<section class="panel">${empty(all.length ? 'No matching projects' : 'No projects in this view', all.length ? 'Try a different name, code or company.' : 'Choose another company to see its projects.')}</section>`}`;
}
// One project: the Dashboard's overview for this project, its progress, tasks and details.
function projectPage() {
  const p = state.projects.find((x) => x.id === projectId);
  if (!p) {
    page = 'projects';
    return projectsPage();
  }
  const g = projectProgress(state, p.id);
  const canEdit = canEditTasks(user, p.companyId);
  const day = today();
  const ts = state.tasks.filter((t) => t.projectId === p.id).sort((x, y) => TASK_ORDER[x.status] - TASK_ORDER[y.status] || (x.due || '9999').localeCompare(y.due || '9999') || x.name.localeCompare(y.name));
  const progressCard = `<section class="panel progress-card" aria-labelledby="progressTitle"><header class="progress-head"><h2 id="progressTitle">Project progress</h2><small>${g.total ? `${g.done} of ${g.total} tasks done` : 'No tasks yet'}</small></header><div class="progress-figure"><b>${g.pct === null ? '—' : g.pct}</b>${g.pct === null ? '' : '<span>%</span>'}</div>${progressBar(g)}<dl class="progress-counts"><div><dt><i class="key done" aria-hidden="true"></i>Done</dt><dd>${g.done}</dd></div><div><dt><i class="key doing" aria-hidden="true"></i>In progress</dt><dd>${g.inProgress}</dd></div><div><dt><i class="key todo" aria-hidden="true"></i>To do</dt><dd>${g.todo}</dd></div></dl>${g.overdue ? `<p class="project-flag">${icon('clock')}${g.overdue} overdue ${g.overdue === 1 ? 'task' : 'tasks'}</p>` : ''}</section>`;
  const taskRow = (t) => {
    const late = t.status !== 'Done' && t.due && t.due < day;
    const key = t.status.toLowerCase().replace(' ', '-');
    return `<li class="task-row" data-status="${key}">${canEdit ? `<select class="task-status" data-task="${t.id}" aria-label="Status of ${esc(t.name)}">${TASK_STATUSES.map((x) => `<option ${x === t.status ? 'selected' : ''}>${x}</option>`).join('')}</select>` : `<span class="task-badge" data-status="${key}">${t.status === 'Done' ? icon('check') : ''}${esc(t.status)}</span>`}<div class="task-main"><strong>${esc(t.name)}</strong><p>${esc(t.owner || 'No owner')}${t.due ? ` · Due ${shortDate(t.due)}` : ''}${late ? ` · <span class="task-overdue">${icon('clock')}Overdue</span>` : ''}</p></div>${canEdit ? `<div class="task-actions"><button class="linkbtn" data-action="editTask" data-id="${t.id}" aria-label="Edit ${esc(t.name)}">Edit</button><button class="linkbtn danger-link" data-action="deleteTask" data-id="${t.id}" aria-label="Delete ${esc(t.name)}">Delete</button></div>` : ''}</li>`;
  };
  const tasksCard = `<section class="panel task-card" aria-labelledby="tasksTitle"><header class="card-head"><h2 id="tasksTitle">Tasks</h2>${canEdit ? `<button class="primary" data-action="newTask" data-id="${p.id}">${icon('plus')}Add task</button>` : `<small>${ts.length} ${ts.length === 1 ? 'task' : 'tasks'}</small>`}</header>${ts.length ? `<ol class="task-list">${ts.map(taskRow).join('')}</ol>` : empty('No tasks yet', canEdit ? 'Add the first task to start tracking progress.' : 'Finance adds tasks to track this project’s progress.')}</section>`;
  const table = (headings, body) => `<div class="table-wrap dashboard-table"><table><thead><tr>${headings.map((h, i) => `<th class="${i ? 'right' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
  const budgets = state.budgets.filter((b) => b.projectId === p.id);
  const categoryRows = budgets.flatMap((b) => b.categories.map((c) => ({ b, c })));
  const orders = state.orders.filter((o) => o.projectId === p.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  const orderIds = new Set(orders.map((o) => o.id));
  const requests = state.requests.filter((r) => orderIds.has(r.orderId)).sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || ''));
  const categoryTable = table(['Category', 'Approved', 'Utilized', 'Available'], categoryRows.map(({ b, c }) => {
    const used = categoryUsed(state, b.id, c.id), amount = c.amount / (b.rate || 1);
    return `<tr><td>${esc(c.name)}<span class="secondary">${esc(b.name)}</span></td><td class="right">${fmt(amount)}</td><td class="right">${fmt(used)}</td><td class="right">${fmt(amount - used)}</td></tr>`;
  }).join(''));
  // Requests: each order with what is left to request and, for whoever may raise one, a
  // button that opens the payment request form for that order.
  const canRaise = canCreateRequests(user) && access(user, p.companyId);
  const requestRow = (o) => {
    const left = o.rejectedAt ? 0 : remainingToRequest(state, o);
    const can = canRaise && !o.rejectedAt && left > 0.005 && canManageRequest(user, o);
    const count = state.requests.filter((r) => r.orderId === o.id).length;
    return `<li class="request-row"><div class="request-main"><button class="linkbtn" data-action="openOrder" data-id="${o.id}">${esc(o.number)}</button><p>${esc(name('suppliers', o.supplierId))} · ${esc(o.po)} · ${count} ${count === 1 ? 'payment' : 'payments'}</p></div><div class="request-figures"><strong>${o.currency} ${fmt(o.total)}</strong><small>${o.rejectedAt ? 'Rejected' : left > 0.005 ? `${o.currency} ${fmt(left)} left to request` : 'Fully requested'}</small></div>${can ? `<button data-action="projectPayment" data-id="${o.id}" aria-label="Create payment request for ${esc(o.number)}">${icon('plus')}Payment request</button>` : '<span class="request-spacer" aria-hidden="true"></span>'}</li>`;
  };
  const requestsCard = `<section class="panel requests-card" aria-labelledby="requestsTitle"><header class="card-head"><h2 id="requestsTitle">Requests</h2>${canRaise ? `<button class="primary" data-action="projectOrder" data-id="${p.id}">${icon('plus')}New request</button>` : `<small>${orders.length} ${orders.length === 1 ? 'request' : 'requests'}</small>`}</header>${orders.length ? `<ol class="request-list">${orders.map(requestRow).join('')}</ol>` : empty('No requests yet', canRaise ? 'Raise the first request for this project; it includes its first payment request.' : 'Requests raised for this project will appear here.')}</section>`;
  const requestTable = table(['Payment request', 'Amount', 'Status'], requests.map((r) => `<tr><td><button class="linkbtn" data-action="openRequest" data-id="${r.id}">${esc(r.number)}</button><span class="secondary">${esc(r.date || '')}</span></td><td class="right">${r.currency} ${fmt(r.amount)}</td><td class="right">${badge(r.status)}</td></tr>`).join(''));
  const word = (n, one, many) => n === 1 ? one : many;
  const exploreCard = `<section class="panel explore-card" aria-labelledby="exploreTitle"><header class="card-head"><h2 id="exploreTitle">Explore the details</h2><small>Expand a breakdown</small></header>
    ${disclosure('Budget Categories', 'Allocations and category balances · USD', categoryRows.length ? categoryTable : empty('No budget yet', 'Finance adds this project’s approved budget in Master Data.'), 'categories', categoryRows.length, word(categoryRows.length, 'category', 'categories'))}
    ${disclosure('Payment Requests', 'Every payment request and where it stands', requests.length ? requestTable : empty('No payment requests yet'), 'payments', requests.length, word(requests.length, 'payment', 'payments'))}
    </section>`;
  const taskIds = new Set(state.tasks.filter((t) => t.projectId === p.id).map((t) => t.id));
  const requestIds = new Set(requests.map((r) => r.id));
  const activity = state.audit.filter((x) => orderIds.has(x.entity) || requestIds.has(x.entity) || taskIds.has(x.entity) || (x.action === 'task.delete' && x.companyId === p.companyId && (x.detail || '').startsWith(p.name + ':'))).sort((x, y) => Date.parse(y.at) - Date.parse(x.at)).slice(0, 6);
  return `<button class="back-link" data-action="backProjects"><span class="pager-back">${icon('chevron')}</span>All projects</button>${pageHeader(`${name('companies', p.companyId)}${p.code ? ' · ' + p.code : ''}`, p.name, 'Budget, payments and progress for this project.', isFinanceAdmin(user) ? `<button data-action="editProject" data-id="${p.id}">Edit project</button>` : '')}
    ${overview(p.companyId, p.id, { before: progressCard })}
    <div class="dashboard-bottom section-gap"><div class="project-main">${tasksCard}${requestsCard}${exploreCard}</div>${activityCard(activity, 'Task changes, requests and payments for this project will appear here.')}</div>`;
}
function taskForm(projectIdFor, id) {
  const t = id ? state.tasks.find((x) => x.id === id) : null;
  const p = state.projects.find((x) => x.id === (t?.projectId || projectIdFor));
  showModal(t ? 'Edit task' : 'Add task', `<form data-form="task" data-id="${id || ''}" data-project="${p.id}">${section('01', 'Task', `<div class="grid2">${field('Task name', input('name', t?.name, 'text', 'required maxlength="120"'), true)}${field('Status', `<select name="status">${TASK_STATUSES.map((x) => `<option ${x === (t?.status || 'To do') ? 'selected' : ''}>${x}</option>`).join('')}</select>`)}${field('Due date · optional', input('due', t?.due, 'date'))}${field('Owner · optional', input('owner', t?.owner, 'text', 'maxlength="80"'), true)}</div>`)}${footer(t ? 'Save task' : 'Add task', `${esc(p.name)} · progress counts the tasks marked Done.`)}</form>`);
}
function dashboard() {
  const k = kpis(state, company, project);
  const ps = state.projects.filter(p => (!company || p.companyId === company) && (!project || p.id === project));
  const completion = k.utilized ? Math.round((k.paid / k.utilized) * 100) : 0;
  const paymentProgress = `<div class="coverage-heading"><strong>${completion}%</strong><span>Payments Completed</span></div><div class="coverage-track"><span style="width:${Math.min(100, completion)}%"></span></div>${[['Paid', k.paid], ['Outstanding Payments', k.outstanding], ['On Hold', k.hold], ['Balance Payments Pending', k.balance]].map(([label, value]) => `<div class="stats-line"><span>${label}</span><strong>USD ${fmt(value)}</strong></div>`).join('')}`;
  const table = (headings, body, footer = '') => `<div class="table-wrap dashboard-table"><table><thead><tr>${headings.map((h, i) => `<th class="${i ? 'right' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody>${footer}</table></div>`;
  const numbers = values => values.map(v => Math.abs(v) < 0.005 ? `<td class="right zero">${fmt(0)}</td>` : v < 0 ? `<td class="right"><span class="negative">${fmt(v)}</span></td>` : `<td class="right">${fmt(v)}</td>`).join('');
  const metrics = x => [x.budget, x.utilized, x.available, x.paid, x.outstanding, x.balance, x.hold];
  const projectTable = table(['Project / Company', 'Approved Budget', 'Utilized', 'Available', 'Paid', 'Outstanding Payments', 'Balance Payments Pending', 'On Hold'], ps.map(p => {
    const x = kpis(state, p.companyId, p.id);
    return `<tr><td><button class="linkbtn" data-action="openProject" data-id="${p.id}">${esc(p.name)}</button><span class="secondary">${esc(name('companies', p.companyId))}</span></td>${numbers(metrics(x))}</tr>`;
  }).join(''), `<tfoot><tr class="total-row"><td>Total</td>${numbers(metrics(k))}</tr></tfoot>`);
  const summary = (items, heading) => table([heading, 'Approved Budget', 'Utilized', 'Available'], items.map(item => {
    const x = kpis(state, item.companyId, item.projectId);
    return `<tr><td>${esc(item.name)}${item.sub ? `<span class="secondary">${esc(item.sub)}</span>` : ''}</td>${numbers([x.budget, x.utilized, x.available])}</tr>`;
  }).join(''));
  const word = (n, one, many) => n === 1 ? one : many;
  const companyCount = state.companies.filter(c => !company || c.id === company).length;
  const currencies = currencyStats(state, company, project);
  const companyTable = summary(state.companies.filter(c => !company || c.id === company).map(c => ({ name: c.name, companyId: c.id, projectId: project })), 'Company');
  const projectSummary = summary(ps.map(p => ({ name: p.name, sub: name('companies', p.companyId), companyId: p.companyId, projectId: p.id })), 'Project / Company');
  const currencyTable = table(['Currency', 'Approved Budget', 'Utilized', 'Paid', 'Outstanding Payments', 'On Hold'], currencies.map(c => `<tr><td>${esc(c.currency)}</td>${numbers([c.budget, c.utilized, c.paid, c.outstanding, c.hold])}</tr>`).join(''));
  const categoryRows = state.budgets.filter(b => (!company || b.companyId === company) && (!project || b.projectId === project)).flatMap(b => b.categories.map(c => ({ b, c })));
  const categoryTable = table(['Category / Project', 'Approved', 'Utilized', 'Available'], categoryRows.map(({ b, c }) => {
    const used = categoryUsed(state, b.id, c.id), amount = c.amount / (b.rate || 1);
    return `<tr><td>${esc(c.name)}<span class="secondary">${esc(name('projects', b.projectId))}</span></td>${numbers([amount, used, amount - used])}</tr>`;
  }).join(''));
  const activity = state.audit.filter(a => (!company || a.companyId === company) && (!project || state.orders.some(o => o.projectId === project && (o.id === a.entity || state.requests.some(r => r.orderId === o.id && r.id === a.entity))))).sort((x, y) => Date.parse(y.at) - Date.parse(x.at)).slice(0, 6);
  return `${pageHeader('Portfolio overview', 'Project dashboard', 'Your budgets, commitments and payments at a glance.')}${filters(false, '', `<button class="filter-action" data-action="export">${icon('download')}Export summary</button>`, true)}
    ${overview(company, project, { after: `<section class="panel workspace-actions" aria-label="Shortcuts"><button class="action-tile" data-action="queue" data-target="Finance">Finance payments${icon('arrow')}</button><button class="action-tile primary" data-page="projects">Projects${icon('arrow')}</button></section>` })}
    <section class="panel flush section-gap"><div class="section-title"><div><h2>Project Financial Overview</h2><p class="help">${ps.length} project${ps.length === 1 ? '' : 's'} · consolidated in USD</p></div><span class="unit-label">USD</span></div>${ps.length ? projectTable : empty('No projects in this view', 'Choose another company or project to see its financial position.')}</section>
    <div class="dashboard-bottom section-gap"><section class="panel explore-card" aria-labelledby="exploreTitle"><header class="card-head"><h2 id="exploreTitle">Explore the details</h2><small>Expand a breakdown</small></header>
    ${disclosure('Budget Summary by Company', 'Compare approved, utilized and available budgets · USD', companyTable, 'company', companyCount, word(companyCount, 'company', 'companies'))}
    ${disclosure('Budget Summary by Project', 'A focused view of project budget balances · USD', projectSummary, 'project', ps.length, word(ps.length, 'project', 'projects'))}
    ${disclosure('Currency Summary', 'Original currencies and saved exchange rates', currencyTable + '<p class="help">Budget and utilization use their original currencies; payment figures use each payment request’s currency. Saved exchange rates determine consolidated USD totals.</p>', 'currency', currencies.length, word(currencies.length, 'currency', 'currencies'))}
    ${disclosure('Payment Status', 'Payment completion and the remaining commitment', paymentProgress, 'payments', completion + '%', 'paid of utilized')}
    ${disclosure('Budget Categories', 'Review allocations and category balances · USD', categoryTable, 'categories', categoryRows.length, word(categoryRows.length, 'category', 'categories'))}
    </section>${activityCard(activity)}</div>`;
}
const ACTION_LABELS = {
  "order.create": "Order created", "order.edit": "Order edited", "order.amend": "Amendment submitted", "order.reject": "Order rejected",
  "amendment.approve": "Amendment approved", "amendment.return": "Amendment returned", "amendment.reject": "Amendment rejected", "amendment.resubmit": "Amendment resubmitted",
  "request.create": "Payment request created", "request.edit": "Payment request edited", "request.submit": "Payment request submitted",
  "request.approve": "Payment request approved", "request.return": "Payment request returned", "request.reject": "Payment request rejected",
  "request.hold": "Put on hold", "request.resume": "Hold released", "request.pay": "Payment recorded", "request.support": "Documents supplied",
  "request.remark": "Remark added", "master.save": "Master data saved", "user.save": "User saved", "settings.save": "Settings saved",
  "import.create": "Records imported", lock: "Record locked", unlock: "Record unlocked",
  "task.save": "Task saved", "task.delete": "Task deleted", "workflow.migrated": "Moved to Finance", "user.migrated": "Role retired",
};
const actionLabel = (code) => ACTION_LABELS[code] || (/^[a-z]+\.[a-zA-Z]+$/.test(code) ? code.replace(".", " ").replace(/([A-Z])/g, " $1").toLowerCase().replace(/^./, (c) => c.toUpperCase()) : code);
function orderMatch(o) {
  return (
    (!company || o.companyId === company) &&
    (!project || o.projectId === project) &&
    (!search ||
      [
        o.number,
        o.po,
        o.invoice,
        o.description,
        name("suppliers", o.supplierId),
        ...state.requests
          .filter((r) => r.orderId === o.id)
          .map((r) => r.number),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()))
  );
}
function filteredRequests() {
  return state.requests.filter((r) => {
    const o = state.orders.find((o) => o.id === r.orderId);
    return (
      o &&
      orderMatch(o) &&
      (!from || r.date >= from) &&
      (!to || r.date <= to) &&
      (!statusFilter || r.status === statusFilter) &&
      (!financeOnly || ["Finance", "On Hold"].includes(r.status))
    );
  });
}
function requestsPage() {
  const all = sortRequests(filteredRequests()),
    os = state.orders
      .filter(orderMatch)
      .sort((a, b) =>
        sortOrder === "amount-desc"
          ? b.total / b.rate - a.total / a.rate
          : sortOrder === "number"
            ? a.number.localeCompare(b.number)
            : sortOrder === "date-asc"
              ? a.createdAt.localeCompare(b.createdAt)
              : b.createdAt.localeCompare(a.createdAt),
      ),
    children = (o) => all.filter((r) => r.orderId === o.id),
    actionable = amendmentAttention;
  const lists = {
    requests: os.filter(
      (o) => (!from && !to && !statusFilter) || children(o).length,
    ),
    finance: all.filter(approved),
    balance: os.filter(
      (o) => !o.rejectedAt && remainingToRequest(state, o) > 0.005,
    ),
    inbox: os.filter((o) => children(o).some(attention) || actionable(o)),
  };
  const rows =
    tab === "finance"
      ? requestTable(lists.finance)
      : ordersTable(lists[tab] || lists.requests, tab, all);
  return `${pageHeader("REQUEST WORKSPACE", "Requests", "One order, with every payment request submitted to Finance separately.", canCreateRequests(user) && tab === "requests" ? `<button data-action="import">Import CSV / Excel</button><button class="primary" data-action="newOrder">${icon("plus")}New Request</button>` : "")}<div class="tabs">${[
    ["requests", "Requests"],
    ["finance", "Finance"],
    ["balance", "Balance to request"],
    ["inbox", "My Actions"],
  ]
    .map(
      ([v, t]) =>
        `<button data-tab="${v}" class="${tab === v ? "active" : ""}">${t}<span class="count">${lists[v].length}</span></button>`,
    )
    .join(
      "",
    )}</div>${filters(true)}<div class="list-toolbar"><div class="searchbox">${icon("search")}<input id="search" aria-label="Search requests" placeholder="Search reference, supplier, PO or invoice" value="${esc(search)}"></div><div class="list-options"><select id="sortOrder" aria-label="Sort payment requests">${[
    ["date-desc", "Date: newest first"],
    ["date-asc", "Date: oldest first"],
    ["amount-desc", "Amount: highest USD"],
    ["number", "Request number"],
  ]
    .map(
      ([v, t]) =>
        `<option value="${v}" ${sortOrder === v ? "selected" : ""}>${t}</option>`,
    )
    .join(
      "",
    )}</select></div></div><section class="panel flush">${rows}<div class="table-footer"><span>${lists[tab]?.length || 0} records</span><span>Company access applies to every record</span></div></section>`;
}
function requestTable(rs) {
  return rs.length
    ? `<div class="table-wrap"><table class="work-table"><thead><tr><th>Payment request</th><th>Supplier / PO</th><th>Project / Company</th><th class="right">Requested amount</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${rs
        .map((r) => {
          const o = state.orders.find((o) => o.id === r.orderId);
          return `<tr><td data-label="Payment request"><strong>${esc(r.number)}</strong><span class="secondary">${esc(r.date)} · ${r.percent}% instalment</span></td><td data-label="Supplier / PO">${esc(name("suppliers", o.supplierId))}<span class="secondary">${esc(o.po)}</span></td><td data-label="Project / Company">${esc(name("projects", o.projectId))}<span class="secondary">${esc(name("companies", o.companyId))}</span></td><td data-label="Requested amount" class="right"><strong><span class="currency">${r.currency || o.currency}</span>${fmt(r.amount)}</strong>${(r.currency || o.currency) !== "USD" ? `<span class="secondary">USD ${fmt(r.amount / (r.rate || o.rate))}</span>` : ""}</td><td data-label="Status">${badge(r.status)}</td><td>${rowAction("openRequest", r.id, "Open " + r.number)}</td></tr>`;
        })
        .join("")}</tbody></table></div>`
    : empty(
        "Nothing in this view",
        "Change your filters, or create a main request to begin a new payment workflow.",
      );
}
function ordersTable(os, view = "requests", all = state.requests) {
  return os.length
    ? `<div class="table-wrap"><table class="work-table"><thead><tr><th>Request Reference</th><th>Supplier / PO</th><th>Project / Company</th><th class="right">Total Amount</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${os
        .map((o) => {
          const open = expanded.has(o.id),
            rs = all.filter(
              (r) => r.orderId === o.id && (view !== "inbox" || attention(r)),
            );
          return `<tr><td data-label="Request Reference"><button class="linkbtn" data-action="openOrder" data-id="${o.id}">${esc(o.number)}</button></td><td data-label="Supplier / PO">${esc(name("suppliers", o.supplierId))}<span class="secondary">${esc(o.po)}</span></td><td data-label="Project / Company">${esc(name("projects", o.projectId))}<span class="secondary">${esc(name("companies", o.companyId))}</span></td><td data-label="Total Amount" class="right"><span class="currency">${o.currency}</span>${fmt(o.total)}</td><td>${view === "balance" ? rowAction("openOrder", o.id, "Open " + o.number) : `<button class="row-action expand-control" data-action="expand" data-id="${o.id}" aria-expanded="${open}" aria-label="${open ? "Collapse" : "Expand"} ${esc(o.number)}">${open ? "−" : "+"}</button>`}</td></tr>${open && view !== "balance" ? `<tr class="children-row"><td colspan="5"><div class="nested-requests">${o.amendment ? `<button data-action="openOrder" data-id="${o.id}">Amendment · ${esc(o.amendment.status)}</button>` : ""}${requestTable(rs)}</div></td></tr>` : ""}`;
        })
        .join("")}</tbody></table></div>`
    : empty(
        "Nothing in this view",
        "Adjust your filters or check another tab.",
      );
}
function commitmentsView(os) {
  return ordersTable(os, "balance");
}
function masterPage() {
  const labels = {
      companies: "Companies",
      projects: "Projects",
      budgets: "Approved Budgets",
      suppliers: "Suppliers",
      currencies: "Currencies",
    },
    singular = {
      companies: "company",
      projects: "project",
      budgets: "budget",
      suppliers: "supplier",
      currencies: "currency",
    };
  const rows = state[masterTab].filter(
    (r) =>
      !masterSearch ||
      [
        r.name,
        r.email,
        name("companies", r.companyId),
        name("projects", r.projectId),
        r.id,
      ]
        .join(" ")
        .toLowerCase()
        .includes(masterSearch.toLowerCase()),
  );
  return `${pageHeader("ADMINISTRATION", "Master data", "The shared foundation for accurate budgets, requests and reporting.", `<button data-action="import">Import CSV / Excel</button><button class="primary" data-action="newMaster">${icon("plus")}Add ${singular[masterTab]}</button>`)}<div class="tabs">${Object.entries(
    labels,
  )
    .map(
      ([v, t]) =>
        `<button data-master="${v}" class="${masterTab === v ? "active" : ""}">${t}<span class="count">${state[v].length}</span></button>`,
    )
    .join(
      "",
    )}</div><div class="list-toolbar"><div class="searchbox">${icon("search")}<input id="masterSearch" value="${esc(masterSearch)}" aria-label="Search ${labels[masterTab].toLowerCase()}" placeholder="Search ${labels[masterTab].toLowerCase()}"></div><small>${rows.length} ${labels[masterTab].toLowerCase()}</small></div><section class="panel flush"><div class="table-wrap"><table><thead><tr><th>${masterTab === "currencies" ? "Currency" : "Name"}</th><th>${masterTab === "budgets" ? "Project / Approved amount" : masterTab === "currencies" ? "Rate against USD" : "Details"}</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows.map((r) => `<tr><td><strong>${esc(r.name)}</strong>${r.code ? `<span class="secondary">${esc(r.code)}</span>` : ""}${masterTab === "currencies" ? `<span class="secondary">${r.id}</span>` : ""}</td><td>${masterTab === "projects" ? esc(name("companies", r.companyId)) : masterTab === "budgets" ? `${esc(name("projects", r.projectId))}<span class="secondary">USD ${fmt(budgetAmount(r))} · ${r.currency || "USD"} ${fmt(r.categories.reduce((a, c) => a + Number(c.amount), 0))} original · ${r.categories.length} categories · ${r.revisions.length} revisions</span>` : masterTab === "currencies" ? `<span class="currency">1 USD =</span> ${fmt(r.rate)} ${r.id}` : esc(r.email || "—")}</td><td class="right"><button class="linkbtn" data-action="editMaster" data-id="${r.id}">${masterTab === "budgets" ? "Edit / Revise" : "Edit"} ${icon("arrow")}</button></td></tr>`).join("")}</tbody></table></div>${!rows.length ? empty("No matching " + labels[masterTab].toLowerCase(), "Add a record or adjust your search.") : ""}<div class="table-footer"><span>${labels[masterTab]} · ${rows.length} records</span><span>${masterTab === "suppliers" ? "Shared across all companies" : masterTab === "budgets" ? "Revision history is preserved" : "Admin-managed master data"}</span></div></section>`;
}
function usersPage() {
  const users = state.users.filter(
    (u) =>
      !userSearch ||
      [u.name, u.username, u.email, u.role]
        .join(" ")
        .toLowerCase()
        .includes(userSearch.toLowerCase()),
  );
  return `${pageHeader("ACCESS & IDENTITY", "User Manager", "Clear responsibilities. The right access for every member of the team.", `<button class="primary" data-action="newUser">${icon("plus")}Create user</button>`)}<div class="admin-stats"><div><strong>${state.users.length}</strong><span>Total users</span></div><div><strong>${state.users.filter((u) => u.active).length}</strong><span>Active accounts</span></div><div><strong>${state.users.filter((u) => u.groupAccess).length}</strong><span>Full group access</span></div></div><div class="admin-intro"><span class="op-icon">${icon("shield")}</span><div><strong>One role per user. Mandatory two-factor authentication.</strong><br><small>Admin creates accounts. Password resets use email OTP; authenticator verification stays required.</small></div></div><div class="list-toolbar"><div class="searchbox">${icon("search")}<input id="userSearch" aria-label="Search users" value="${esc(userSearch)}" placeholder="Search name, username, email or role"></div><small>${users.length} users</small></div><section class="panel flush"><div class="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Company access</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${users.map((u) => `<tr><td><div class="user-cell"><span class="avatar" aria-hidden="true">${esc(u.name.slice(0, 1))}</span><div><strong>${esc(u.name)}</strong><span class="secondary">${esc(u.username)} · ${esc(u.email)}</span></div></div></td><td>${u.role}</td><td><div class="access-chips">${u.groupAccess ? '<span class="access-chip">Full group</span>' : u.companies.map((c) => `<span class="access-chip">${esc(name("companies", c))}</span>`).join("")}</div></td><td>${badge(u.active ? "Active" : "Inactive")}</td><td>${rowAction("editUser", u.id, "Manage " + u.name)}</td></tr>`).join("")}</tbody></table></div>${!users.length ? empty("No matching users", "Try a different name, role or email address.") : ""}<div class="table-footer"><span>${users.length} accounts shown</span><span>Role controls actions · Company access controls visibility</span></div></section>`;
}
// Audit Log: filters by action, user, company and date range plus a search; newest first,
// AUDIT_PAGE_SIZE entries per page.
const AUDIT_PAGE_SIZE = 20;
function auditPage() {
  const q = auditSearch.trim().toLowerCase();
  const f = auditFilter;
  const day = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const all = state.audit.slice().sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
  const rows = all.filter((x) =>
    (!f.action || actionLabel(x.action) === f.action) &&
    (!f.user || x.user === f.user) &&
    (!f.company || (f.company === "group" ? !x.companyId : x.companyId === f.company)) &&
    (!f.from || day(x.at) >= f.from) &&
    (!f.to || day(x.at) <= f.to) &&
    (!q || [actionLabel(x.action), x.action, x.user, x.detail, x.entity, x.companyId && name("companies", x.companyId)].join(" ").toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(rows.length / AUDIT_PAGE_SIZE));
  auditPageNo = Math.min(Math.max(1, auditPageNo), pages);
  const start = (auditPageNo - 1) * AUDIT_PAGE_SIZE;
  const shown = rows.slice(start, start + AUDIT_PAGE_SIZE);
  const choices = (list, value, blank) => `<option value="">${esc(blank)}</option>` + list.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(l)}</option>`).join("");
  const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort((m, n) => m.localeCompare(n));
  const actions = uniq(all.map((x) => actionLabel(x.action))).map((v) => [v, v]);
  const users = uniq(all.map((x) => x.user)).map((v) => [v, v]);
  const companies = [...state.companies.map((c) => [c.id, c.name]), ["group", "Group (no company)"]];
  const active = Boolean(f.action || f.user || f.company || f.from || f.to || q);
  // Page numbers: first, last, and two either side of the current page.
  const nums = [...new Set([1, pages, ...[-2, -1, 0, 1, 2].map((d) => auditPageNo + d)])].filter((n) => n >= 1 && n <= pages).sort((m, n) => m - n);
  const pager = pages > 1 ? `<nav class="pager" aria-label="Audit log pages"><button data-action="auditGo" data-n="${auditPageNo - 1}" ${auditPageNo === 1 ? "disabled" : ""} aria-label="Previous page"><span class="pager-back">${icon("chevron")}</span>Previous</button><span class="pager-pages">${nums.map((n, i) => `${i && n - nums[i - 1] > 1 ? '<span class="pager-gap" aria-hidden="true">…</span>' : ""}<button data-action="auditGo" data-n="${n}" ${n === auditPageNo ? 'aria-current="page" class="current"' : ""} aria-label="Page ${n}">${n}</button>`).join("")}</span><button data-action="auditGo" data-n="${auditPageNo + 1}" ${auditPageNo === pages ? "disabled" : ""} aria-label="Next page">Next${icon("chevron")}</button></nav>` : "";
  return `${pageHeader("ADMINISTRATION", "Audit Log", "Every recorded action, newest first. Entries cannot be edited or removed in the portal.")}<div class="filters audit-filters"><div><label for="auditAction">Action</label><select id="auditAction">${choices(actions, f.action, "All actions")}</select></div><div><label for="auditUser">User</label><select id="auditUser">${choices(users, f.user, "All users")}</select></div><div><label for="auditCompany">Company</label><select id="auditCompany">${choices(companies, f.company, "All companies")}</select></div><div><label for="auditFrom">From</label><input id="auditFrom" type="date" value="${esc(f.from)}"></div><div><label for="auditTo">To</label><input id="auditTo" type="date" value="${esc(f.to)}"></div>${active ? '<button class="linkbtn" data-action="auditClear">Clear filters</button>' : ""}</div><div class="list-toolbar"><div class="searchbox">${icon("search")}<input id="auditSearch" value="${esc(auditSearch)}" aria-label="Search the audit log" placeholder="Search action, user, reference or detail"></div><small>${rows.length ? `${start + 1}–${start + shown.length} of ${rows.length}` : "0"} entries${rows.length !== all.length ? ` · ${all.length} in total` : ""}</small></div><section class="panel flush"><div class="table-wrap"><table class="audit-table"><thead><tr><th>Date and time</th><th>Action</th><th>User</th><th>Detail</th><th>Company</th></tr></thead><tbody>${shown.map((x) => `<tr><td class="audit-when">${date(x.at)}</td><td><strong>${esc(actionLabel(x.action))}</strong></td><td>${esc(x.user)}</td><td>${esc(x.detail || "—")}</td><td>${x.companyId ? esc(name("companies", x.companyId)) : "Group"}</td></tr>`).join("")}</tbody></table></div>${!rows.length ? empty(active ? "No matching entries" : "No audit entries yet", active ? "Adjust or clear the filters." : "Recorded actions will appear here.") : ""}<div class="table-footer"><span>Page ${auditPageNo} of ${pages} · ${AUDIT_PAGE_SIZE} per page</span><span>Application audit trail · read-only</span></div></section>${pager}`;
}
function settingsPage() {
  return `${pageHeader("ADMINISTRATION", "Settings", "Reference formats and operational controls.")}<form data-form="settings"><section class="panel">${section("01", "Reference numbering", `<div class="grid2">${field("Request reference format", input("orderFormat", state.settings.orderFormat, "text", 'required maxlength="100"'))}${field("Payment request reference format", input("numberFormat", state.settings.numberFormat, "text", 'required maxlength="100"'))}</div><p class="help">Required tokens: {COMPANY}, {PROJECT}, {SEQ}. Optional: {YYYY}. Separate permanent sequences run for each company and project. Issued references never change.</p>`)}${section("02", "Record locks", field("Lock duration · minutes", input("lockMinutes", 10, "number", "readonly")))}${footer("Save settings", "Sequence counters cannot be edited or reset.")}</section></form><section class="panel section-gap"><div class="section-title"><h2>Active locks</h2></div>${
    Object.entries(state.locks)
      .filter(([id, l]) => l.expires > Date.now())
      .map(
        ([id, l]) =>
          `<div class="stats-line"><span>${esc(state.orders.find((o) => o.id === id)?.number || state.requests.find((r) => r.id === id)?.number || id)} · ${esc(l.name)}</span><button data-action="unlock" data-id="${id}">Unlock</button></div>`,
      )
      .join("") || '<p class="help">No active locks.</p>'
  }</section>`;
}
function showModal(title, body) {
  const modal = $("#modal"),
    wasOpen = modal.open;
  if (!wasOpen && document.activeElement !== document.body)
    focusReturn = document.activeElement;
  modal.innerHTML = `<div class="modal-head"><div><div class="eyebrow">PROJECT WORKSPACE</div><h2 id="modalTitle">${title}</h2></div><button type="button" class="close" data-action="close" aria-label="Close dialog">${icon("close")}</button></div><div class="modal-body">${body}</div>`;
  modal.setAttribute("aria-labelledby", "modalTitle");
  accessible(modal);
  if (!wasOpen) modal.showModal();
  modal.scrollTop = 0;
  const focus =
    modal.querySelector(
      "input:not([readonly]):not([disabled]),select:not([disabled]),textarea",
    ) || modal.querySelector(".close");
  focus?.focus({ preventScroll: true });
}
async function closeModal() {
  const id = selected;
  selected = null;
  returnPaymentId = null;
  $("#modal").close();
  document.body.classList.remove("document-mode");
  if (id)
    try {
      await command({ type: "unlock", id });
    } catch (e) {
      toast(e.message, "error");
    }
  const restoreAction = focusReturn?.dataset?.action;
  const restored = restoreAction
    ? document.querySelector(
        `[data-action="${restoreAction}"]${focusReturn.dataset.id ? '[data-id="' + focusReturn.dataset.id + '"]' : ""}`,
      )
    : null;
  if (focusReturn?.isConnected) focusReturn.focus({ preventScroll: true });
  else if (restored) restored.focus({ preventScroll: true });
  else
    document
      .querySelector(`[data-page="${page}"]`)
      ?.focus({ preventScroll: true });
}
async function openRecord(id, kind, paymentId = null) {
  if (selected && selected !== id) await closeModal();
  if (!$("#modal").open) focusReturn = document.activeElement;
  await command({ type: "lock", id });
  selected = id;
  returnPaymentId = kind === "order" && state.requests.some(r=>r.id===paymentId&&r.orderId===id) ? paymentId : null;
  kind === "order" ? orderDetail(id) : requestDetail(id);
}
function detail(label, value) {
  return `<div><label>${label}</label>${value}</div>`;
}
function orderDetail(id) {
  const o = state.orders.find((o) => o.id === id),
    rs = state.requests.filter((r) => r.orderId === id),
    owner =
      canManageRequest(user, o) && !o.rejectedAt,
    m = o.amendment;
  showModal(
    "Request details",
    `${returnPaymentId ? `<div class="actions" style="margin-top:0"><button data-action="openRequest" data-id="${returnPaymentId}" data-return-payment><span aria-hidden="true">←</span>Back to Payment Request · ${esc(state.requests.find(r=>r.id===returnPaymentId).number)}</button></div>` : ""}<div class="detail-top"><div><div class="eyebrow">REQUEST</div><div class="detail-number">${esc(o.number)}</div></div>${o.rejectedAt ? badge("Rejected") : ""}</div><div class="detail-lead"><div><div class="eyebrow">TOTAL ORDER AMOUNT</div><div class="amount"><span>${o.currency}</span>${fmt(o.total)}</div></div><div class="lead-side"><small>Remaining to request</small><strong>${o.currency} ${fmt(remainingToRequest(state, o))}</strong><small>USD ${fmt(o.total / o.rate)} full equivalent</small></div></div><div class="actions">${owner && remainingToRequest(state, o) > 0.005 ? `<button class="primary" data-action="newPayment" data-id="${id}">Create Payment Request</button>` : ""}${owner && (!m || ["Draft", "Rejected"].includes(m.status)) ? `<button data-action="editOrder" data-id="${id}">${m?.status === "Draft" ? "Correct amendment" : "Amend request details"}</button>` : ""}${isFinanceAdmin(user) && !o.rejectedAt ? `<button class="danger" data-action="parentReject" data-id="${id}">Reject request</button>` : ""}</div><div class="detail-grid">${detail("Company", esc(name("companies", o.companyId)))}${detail("Project", esc(name("projects", o.projectId)))}${detail("Supplier", esc(name("suppliers", o.supplierId)))}${detail("PO", esc(o.po))}${detail("Invoice", esc(o.invoice || "—"))}${detail("Requested by", esc(name("users", o.requestedBy)))}</div><p class="sub">${esc(o.description)}</p>${warnings(
      state,
      o,
    )
      .map((w) => `<div class="notice warn">${esc(w)}</div>`)
      .join(
        "",
      )}${m ? amendmentView(o) : ""}<h3>Budget allocations</h3>${categoryTable(o)}<div class="detail-section"><h3>Supporting documents</h3>${fileList(o.files, "order", id)}</div><div class="detail-section"><h3>Payment Requests</h3>${requestTable(rs)}</div>${amendmentHistory(o)}`,
  );
}
function fileList(files, kind, id, version = "", side = "data") {
  return (files || [])
    .map(
      (f, i) =>
        `<button class="document-link" data-action="file" data-kind="${kind}" data-id="${id}" data-index="${i}" data-version="${esc(version)}" data-side="${side}">${icon("requests")}<span class="document-name">${esc(f.name)}<small>PDF</small></span>${icon("download")}</button>`,
    )
    .join("");
}
function amendmentView(o) {
  const m = o.amendment,
    review = stageActor(user, m);
  return `<section class="decision-panel"><h3>Proposed amendment · ${esc(m.status)}</h3><p>${esc(m.reason)}</p><div class="detail-grid">${["total", "po", "invoice", "description"].map((k) => detail(k, `<span class="secondary">${esc(o[k])}</span> → ${esc(m.data[k])}`)).join("")}</div><p>Supplier: ${esc(name("suppliers", m.data.supplierId))} · Budget: ${esc(name("budgets", m.data.budgetId))}</p>${categoryTable(m.data)}${fileList(m.data.files, "amendment", o.id)}${reviewHistory(m.history)}<p class="help">Effective details stay unchanged until Finance approves the amendment.</p>${review ? `<div class="actions"><button class="primary" data-action="amendApprove" data-id="${o.id}">Approve amendment</button><button data-action="amendReturn" data-id="${o.id}">Return to requester</button><button class="danger" data-action="amendReject" data-id="${o.id}">Reject amendment</button></div>` : ""}</section>`;
}
function categoryTable(o) {
  const b = state.budgets.find((b) => b.id === o.budgetId);
  return `<div class="table-wrap"><table><thead><tr><th>Budget category</th><th class="right">Order allocation ${o.currency}</th><th class="right">USD equivalent</th></tr></thead><tbody>${o.allocations.map((a) => `<tr><td>${esc(b?.categories.find((c) => c.id === a.categoryId)?.name || a.categoryId)}</td><td class="right">${fmt(a.amount)}</td><td class="right">${fmt(a.amount / o.rate)}</td></tr>`).join("")}</tbody></table></div>`;
}
function reviewHistory(history = []) {
  const entries = history;
  return `<section class="detail-section"><h3>Review history</h3>${entries.length ? `<div class="table-wrap"><table><thead><tr><th>Stage / Action</th><th>Name</th><th>Date / Time</th><th>Reason</th></tr></thead><tbody>${entries.map((h) => `<tr><td>${esc(h.stage)} · ${esc(h.action)}</td><td>${esc(h.by)}</td><td>${date(h.at)}</td><td>${esc(h.reason || "—")}</td></tr>`).join("")}</tbody></table></div>` : '<p class="help">No review actions recorded yet.</p>'}</section>`;
}
function amendmentDetails(o, data, title, kind, version, side) {
  if (!data) return "";
  return `<section class="detail-section"><h4>${title}</h4><div class="detail-grid">${detail("Supplier", esc(name("suppliers", data.supplierId)))}${detail("PO", esc(data.po))}${detail("Invoice", esc(data.invoice || "—"))}${detail("Approved budget", esc(name("budgets", data.budgetId)))}${detail("Full order amount", `${esc(data.currency)} ${fmt(data.total)}`)}${detail("Saved exchange rate", `1 USD = ${fmt(data.rate)} ${esc(data.currency)}`)}</div><p>${esc(data.description)}</p>${categoryTable(data)}<h4>Supporting documents</h4>${fileList(data.files, kind, o.id, version, side) || '<p class="help">No supporting documents recorded.</p>'}</section>`;
}
function amendmentHistory(o) {
  const versions = [
    ...(o.amendments || []).map((m) => ({ m, kind: "amendment-history", status: "Approved" })),
    ...(o.amendmentAttempts || []).map((m) => ({ m, kind: "amendment-attempt", status: m.status === "Draft" ? "Returned for correction" : m.status })),
  ].sort((a, b) => (b.m.createdAt || "").localeCompare(a.m.createdAt || ""));
  return versions.length ? `<details class="details-disclosure"><summary>Amendment history <span class="count">${versions.length}</span></summary>${versions.map(({m, kind, status}) => `<details class="details-disclosure"><summary>${esc(status)} · ${date(m.createdAt)}</summary><p>${esc(m.reason)}</p>${m.approvedAt ? `<p>Effective from ${date(m.approvedAt)}</p>` : ""}${amendmentDetails(o, m.previous, "Previous effective details", kind, m.id, "previous")}${amendmentDetails(o, m.data, status === "Approved" ? "Approved details" : "Proposed details", kind, m.id, "data")}${reviewHistory(m.history)}</details>`).join("")}</details>` : "";
}
function budgetHistory(budget) {
  return budget?.revisions?.length ? `<details class="details-disclosure"><summary>Previous budget versions <span class="count">${budget.revisions.length}</span></summary>${budget.revisions.map((v) => {
    const currency = v.currency || "USD", rate = v.rate || 1;
    return `<section class="detail-section"><h3>${date(v.at)} · ${esc(v.by)}</h3><p>${esc(v.reason)}</p><p>Saved exchange rate: 1 USD = ${fmt(rate)} ${esc(currency)}</p><div class="table-wrap"><table><thead><tr><th>Category</th><th class="right">Approved ${esc(currency)}</th><th class="right">USD equivalent</th></tr></thead><tbody>${v.categories.map((c) => `<tr><td>${esc(c.name)}</td><td class="right">${esc(currency)} ${fmt(c.amount)}</td><td class="right">USD ${fmt(c.amount / rate)}</td></tr>`).join("")}</tbody><tfoot><tr><td>Total</td><td class="right">${esc(currency)} ${fmt(v.categories.reduce((n,c) => n + Number(c.amount), 0))}</td><td class="right">USD ${fmt(budgetAmount(v))}</td></tr></tfoot></table></div></section>`;
  }).join("")}</details>` : "";
}
function supportingReferences(o, r) {
  const groups = [["Order supporting", o.files], ["Additional supporting", r.files], ["Payment evidence", r.payment?.files]];
  return `<section class="detail-section"><h3>Supporting document references</h3><p>Order reference: ${esc(o.number)}</p>${groups.map(([label, files]) => `<h4>${label}</h4>${files?.length ? `<ul>${files.map((f) => `<li>${esc(f.name)}</li>`).join("")}</ul>` : '<p class="help">None recorded.</p>'}`).join("")}</section>`;
}
function requestDetail(id) {
  const r = state.requests.find((r) => r.id === id),
    o = state.orders.find((o) => o.id === r.orderId);
  const review = false,
    fin = financeActor(user, r) && ["Finance", "On Hold"].includes(r.status),
    draft =
      r.status === "Draft" &&
      canManageRequest(user, r);
  const stages = ["Requested", "Finance", "Paid"];
  const context = draft
    ? "Ready when you are"
    : review
      ? "Your review is required"
      : fin
        ? r.status === "On Hold"
          ? "Payment is on hold"
          : "Ready for Finance"
        : r.status === "Paid"
          ? "Payment completed"
          : r.status === "Rejected"
            ? "Request rejected"
            : "Awaiting the next stage";
  showModal(
    "Payment request",
    `<div class="detail-top"><div><div class="eyebrow">PAYMENT REQUEST</div><div class="detail-number">${esc(r.number)}</div></div>${badge(r.status)}</div><div class="detail-lead"><div><div class="eyebrow">REQUESTED PAYMENT · ${r.percent}% AT CREATION</div><div class="amount"><span>${r.currency || o.currency}</span>${fmt(r.amount)}</div><small>${esc(r.terms)}</small></div><div class="lead-side"><small>Full order amount</small><strong>${o.currency} ${fmt(o.total)}</strong><small>${esc(o.po)}</small></div></div><div class="detail-grid">${detail("Company", esc(name("companies", o.companyId)))}${detail("Project", esc(name("projects", o.projectId)))}${detail("Supplier", esc(name("suppliers", o.supplierId)))}${detail("Invoice", esc(o.invoice || "Not yet provided"))}${detail("Request date", r.date)}${detail("Saved exchange rate", `1 USD = ${fmt(r.rate)} ${r.currency}`)}${detail("Reserved order amount", `${o.currency} ${fmt(parentAmount(r))}`)}${detail("Requested by", esc(name("users", r.requestedBy)))}</div><h3>Progress</h3><div class="steps" style="--stages:${stages.length}" aria-label="Payment request progress">${stages
      .map((st) => {
        const ap = r.approvals.find((a) => a.stage === st);
        const current =
            r.status === st || (st === "Finance" && r.status === "On Hold"),
          done =
            !!ap ||
            st === "Requested" ||
            (st === "Paid" && r.status === "Paid") ||
            (st === "Finance" && r.status === "Paid") ||
            (st === "Requested" && r.status !== "Draft");
        return `<div class="step ${done ? "done" : current ? "current" : ""}" ${current ? 'aria-current="step"' : ""}><span class="step-dot" aria-hidden="true"></span><strong>${st === "Reviewer" ? "Checked by" : st}</strong>${esc(ap?.by || (st === "Paid" && r.payment ? r.payment.by : current ? "Current stage" : ""))}${ap ? `<span class="secondary">${date(ap.at)}</span>` : ""}</div>`;
      })
      .join("")}</div>${warnings(state, o)
      .map((w) => `<div class="notice warn">${esc(w)}</div>`)
      .join(
        "",
      )}<div class="detail-section"><div class="section-title"><h3>Evidence & request document</h3><small>${o.files.length} supporting PDFs on main request</small></div><div class="actions" style="margin-top:0"><button data-action="document" data-id="${id}">${icon("requests")}View Payment Request</button><button data-action="openOrder" data-id="${o.id}" data-payment="${r.id}">${icon("master")}Main details & supporting</button></div></div>${draft || review || fin ? `<section class="decision-panel"><h3>${context}</h3><p>${draft ? "Review the amount and terms, then submit this payment request." : review ? "Check the supporting evidence and payment details before making your decision." : r.status === "On Hold" ? "Release the hold when the reason is resolved." : "Record the exact payment amount with its own supporting PDF."}</p><div class="actions">${draft ? `<button data-action="editPayment" data-id="${id}">Edit payment terms</button><button class="primary" data-action="submit" data-id="${id}">Submit to Finance ${icon("arrow")}</button>` : ""}${review ? `<button class="primary" data-action="approve" data-id="${id}">${icon("check")}${r.status === "Reviewer" ? "Check & forward" : "Approve"}</button><button data-action="return" data-id="${id}">Return to requester</button><button class="danger" data-action="reject" data-id="${id}">Reject</button>` : ""}${fin ? `<button data-action="remark" data-id="${id}">Add remark</button>${r.status === "On Hold" ? `<button class="primary" data-action="resume" data-id="${id}">Release hold</button>` : `<button data-action="hold" data-id="${id}">${icon("hold")}Put on hold</button><button class="primary" data-action="pay" data-id="${id}">${icon("check")}Record payment</button>`}` : ""}</div></section>` : ""}${fin ? `<div class="actions"><button data-action="return" data-id="${id}">Return for correction</button><button data-action="documents" data-id="${id}">Request additional supporting</button><button class="danger" data-action="reject" data-id="${id}">Reject</button></div>` : ""}${user.role === "Admin" && !fin && canReject(user, r) ? `<div class="actions"><button class="danger" data-action="reject" data-id="${id}">Reject payment request</button></div>` : ""}${r.status === "Documents Required" ? `<div class="notice"><strong>Additional supporting required</strong><p>${esc(r.documentRequest.description)}</p></div>${canManageRequest(user, r) ? `<button class="primary" data-action="supply" data-id="${id}">Upload requested documents</button>` : ""}` : ""}${fileList(r.files, "request", id)}${r.payment ? `<div class="notice success"><strong>Paid ${r.currency || o.currency} ${fmt(r.payment.amount)}</strong><br>${r.payment.date} · ${r.payment.type} · ${esc(r.payment.by)}</div>${fileList(r.payment.files, "payment", id)}${isFinanceAdmin(user) ? `<button class="danger" data-action="deletePayment" data-id="${id}">Delete Payment</button>` : ""}` : ""}${r.remarks.length ? '<div class="detail-section"><h3>Finance remarks</h3>' + r.remarks.map((m) => `<div class="notice">${esc(m.text)}<br><small>${esc(m.by)} · ${date(m.at)}</small></div>`).join("") + "</div>" : ""}<details class="details-disclosure"><summary>Budget category allocations</summary>${categoryTable(o)}</details><details class="details-disclosure"><summary>Review history <span class="count">${r.history.length}</span></summary>${r.history.length ? r.history.map((h) => `<div class="activity"><i class="dot"></i><div><strong>${esc(h.stage)} · ${esc(h.action)}</strong><p>${esc(h.by)} · ${date(h.at)}</p><p>${esc(h.reason)}</p></div></div>`).join("") : '<p class="help">No review actions recorded yet.</p>'}</details><p class="help">Each payment request is reviewed by Finance separately. Corrections return to the requester, who resubmits to Finance.</p>`,
  );
}
// preset: { companyId, projectId } fills the company, project and (when the project has
// only one) the approved budget for a new request raised from a project page.
function orderForm(id, preset = null) {
  const effective = id ? state.orders.find((o) => o.id === id) : null;
  const o =
    effective?.amendment?.status === "Draft"
      ? { ...effective, ...effective.amendment.data }
      : effective;
  const presetBudgets = !o && preset ? state.budgets.filter((b) => b.projectId === preset.projectId) : [];
  const scope = o || (preset ? { ...preset, budgetId: presetBudgets.length === 1 ? presetBudgets[0].id : "" } : null);
  showModal(
    o ? "Amend request" : "New Request",
    `<form data-form="order" data-id="${id || ""}"><div class="form-intro"><p>Enter the order details and its first payment request. Each payment request is submitted to Finance separately.</p></div>${section("01", "Company & budget", `<div class="grid2">${field("Company", `<select name="companyId" id="formCompany" required>${opt(state.companies, scope?.companyId)}</select>`)}${field("Project", `<select name="projectId" id="formProject" required>${opt(scope ? state.projects.filter((p) => p.companyId === scope.companyId) : [], scope?.projectId)}</select>`)}${field("Approved budget", `<select name="budgetId" id="formBudget" required>${opt(scope ? state.budgets.filter((b) => b.projectId === scope.projectId) : [], scope?.budgetId)}</select>`)}${field("Supplier", `<select name="supplierId" required>${opt(state.suppliers, o?.supplierId)}</select>`)}</div>`)}${section(
      "02",
      "Order details",
      `<div class="grid2">${field("PO number", input("po", o?.po, "text", 'required maxlength="100"'))}${field("Invoice number · optional for advance", input("invoice", o?.invoice, "text", 'maxlength="100"'))}${field(
        "Currency",
        `<select name="currency" required>${opt(
          state.currencies.map((c) => ({ ...c, name: c.id + " — " + c.name })),
          o?.currency || "USD",
        )}</select>`,
      )}${field("Full order amount", input("total", o?.total, "number", 'required min="0.01" step="0.01"'))}${field("Description", `<textarea name="description" required maxlength="3000" placeholder="Describe the goods, services or works covered by this order.">${esc(o?.description)}</textarea>`, true)}</div>`,
    )}${section("03", "Budget category allocations", `<div id="allocations">${o ? allocationInputs(o.budgetId, o.allocations) : scope?.budgetId ? allocationInputs(scope.budgetId) : '<div class="notice">Select an approved budget above to see its categories.</div>'}</div><div class="allocation-total"><span>Total allocated</span><span id="allocationReadout">${fmt(o?.total || 0)}</span></div><p class="help">Allocate the full amount in the selected order currency. Category totals must match the order. Budget overruns warn without blocking submission.</p>`)}${section("04", "Supporting documents", field("Supporting PDFs · combined limit 2 MB", `<input type="file" name="files" accept="application/pdf,.pdf" multiple ${o ? "" : "required"}><div class="help">${o ? "Choose whether new uploads supplement or replace existing supporting." : "Attach the order’s supporting evidence. Files belong to this main request."}</div>${o ? '<select name="fileMode" aria-label="Supporting file update"><option value="append">Add to existing documents</option><option value="replace">Replace existing documents</option></select>' : ""}`))}${o ? section("05", "Amendment reason", field("Reason", '<textarea name="reason" required></textarea>')) : section("05", "First payment request", paymentFields(null, null, true))}${footer(o ? "Submit amendment" : "Create Request", "Each payment request goes to Finance on its own.")}</form>`,
  );
  if (o) {
    for (const name of ["companyId", "projectId", "currency"]) {
      const el = document.querySelector(`[data-form=order] [name=${name}]`);
      if (el) {
        el.value = o[name];
        el.disabled = true;
        el.setAttribute("aria-describedby", "identityNote");
      }
    }
    document
      .querySelector("[data-form=order] .form-intro")
      .insertAdjacentHTML(
        "beforeend",
        '<p class="help" id="identityNote">Company, project and order currency stay fixed to preserve references and saved payment conversions.</p>',
      );
  }
}
function allocationInputs(budgetId, allocations = []) {
  const b = state.budgets.find((b) => b.id === budgetId);
  return b
    ? b.categories
        .map(
          (c) =>
            `<div class="category-row"><label>${esc(c.name)}<br><small>Approved ${b.currency || "USD"} ${fmt(c.amount)}</small></label><input name="allocation_${c.id}" type="number" min="0" step="0.01" placeholder="Amount" value="${allocations.find((a) => a.categoryId === c.id)?.amount || ""}" aria-label="${esc(c.name)} amount"><span></span></div>`,
        )
        .join("")
    : "";
}
function paymentForm(orderId, id) {
  const o = state.orders.find((o) => o.id === orderId),
    r = id ? state.requests.find((r) => r.id === id) : null;
  showModal(
    r ? "Edit payment request" : "Create Payment Request",
    `<form data-form="payment" data-id="${id || ""}" data-order="${orderId}"><div class="detail-lead"><div><strong>${esc(o.number)}</strong><p>Full order ${o.currency} ${fmt(o.total)}</p></div><div class="lead-side"><small>Remaining to request</small><strong>${o.currency} ${fmt(o.total - reservation(state, o, id))}</strong></div></div>${section("01", "Payment details", paymentFields(o, r))}${footer("Save draft", "Submit the draft to start its independent approval workflow.")}</form>`,
  );
}
function paymentFields(o, r, combined = false) {
  const prefix = combined ? "first" : "",
    currency = r?.currency || o?.currency || "USD";
  return `<div class="grid2">${field("Payment request date", input(prefix + "date", r?.date || today(), "date", "required"))}${field(
    "Payment currency",
    `<select id="paymentCurrency" name="${prefix}currency" required>${opt(
      state.currencies.map((c) => ({ ...c, name: c.id })),
      currency,
    )}</select>`,
  )}${field("Payment request %", input(prefix + "percent", r&&o ? Number((parentAmount(r)/o.total*100).toFixed(6)) : "", "number", 'required min="0.000001" max="100" step="any" id="paymentPercent"'))}${field("Payment Amount", input(prefix + "amount", r?.amount || "", "number", 'required min="0.01" step="0.01" id="paymentAmount"'))}${field("Payment terms", `<textarea name="${prefix}terms" maxlength="1000">${esc(r?.terms || (o ? state.requests.filter((x) => x.orderId === o.id && x.status !== "Rejected").at(-1)?.terms : "") || "")}</textarea>`, true)}</div>`;
}
function syncPayment(target) {
  const f = target.form;
  if (!f || !f.querySelector("#paymentAmount")) return;
  const o = state.orders.find((o) => o.id === f.dataset.order),
    total = o?.total || Number(f.elements.total?.value),
    orderCurrency = o?.currency || f.elements.currency?.value,
    orderRate =
      o?.rate ||
      state.currencies.find((c) => c.id === orderCurrency)?.rate ||
      1,
    cur = f.querySelector("#paymentCurrency").value,
    existing = state.requests.find(r=>r.id===f.dataset.id),
    rate = existing?.currency===cur ? existing.rate :
      cur === orderCurrency
        ? orderRate
        : state.currencies.find((c) => c.id === cur)?.rate || 1,
    p = f.querySelector("#paymentPercent"),
    a = f.querySelector("#paymentAmount");
  if (target.id === "paymentAmount") {
    p.value = total
      ? Number(
          ((((Number(a.value) / rate) * orderRate) / total) * 100).toFixed(6),
        )
      : "";
  } else a.value = money(((total * Number(p.value)) / 100 / orderRate) * rate);
}
function masterForm(id) {
  const k = masterTab,
    r = id ? state[k].find((x) => x.id === id) : null;
  let html = field(
    "Name",
    input("name", r?.name, "text", 'required maxlength="150"'),
  );
  if (["companies", "projects"].includes(k))
    html += field(
      "Short code",
      input(
        "code",
        r?.code,
        "text",
        'required pattern="[A-Za-z0-9]{2,12}" maxlength="12"',
      ),
    );
  if (k === "budgets")
    html += field(
      "Budget currency",
      `<select name="currency" required>${opt(
        state.currencies.map((c) => ({ ...c, name: c.id })),
        r?.currency || "USD",
      )}</select>`,
    );
  if (k === "projects" || k === "budgets")
    html += field(
      "Company",
      `<select name="companyId" id="masterCompany" required ${r ? "disabled" : ""}>${opt(state.companies, r?.companyId)}</select>`,
    );
  if (k === "budgets")
    html += field(
      "Project",
      `<select name="projectId" id="masterProject" required ${r ? "disabled" : ""}>${opt(r ? state.projects.filter((p) => p.companyId === r.companyId) : [], r?.projectId)}</select>`,
    );
  if (k === "suppliers")
    html += field("Email · optional", input("email", r?.email, "email"));
  if (k === "currencies")
    html +=
      field(
        "Currency code",
        input(
          "code",
          r?.id,
          "text",
          `required minlength="3" maxlength="3" ${r ? "readonly" : ""}`,
        ),
      ) +
      field(
        "Currency units per USD 1",
        input(
          "rate",
          r?.rate,
          "number",
          'required min="0.000001" step="0.000001"',
        ),
      );
  const budget =
    k === "budgets"
      ? section(
          "02",
          "Approved category amounts · selected budget currency",
          `<div id="budgetCategories">${(r?.categories || [{ id: randomId(), name: "", amount: "" }]).map((c) => budgetRow(c)).join("")}</div><div class="actions"><button type="button" data-action="addCategory">${icon("plus")}Add category</button></div>${r ? '<div class="section-gap">' + field("Revision reason", '<textarea name="reason" required placeholder="Record why the approved budget is being revised."></textarea>') + '</div><div class="notice">The original budget and all prior revisions will be preserved.</div>' : ""}`,
        )
      : "";
  showModal(
    r ? "Edit / Revise master record" : "Add master record",
    `<form data-form="master" data-id="${id || ""}">${section("01", "Record details", `<div class="grid2">${html}</div>`)}${budget}${budgetHistory(r)}${footer("Save record", k === "suppliers" ? "Suppliers are shared across all companies." : k === "currencies" ? "USD is the base reporting currency." : "Managed by Finance and Admin.")}</form>`,
  );
}
function budgetRow(c) {
  return `<div class="category-row" data-category="${esc(c.id)}"><input name="categoryName" value="${esc(c.name)}" required placeholder="Category name" aria-label="Category name"><input name="categoryAmount" value="${esc(c.amount)}" required type="number" min="0.01" step="0.01" placeholder="Approved amount" aria-label="Approved category amount"><span></span></div>`;
}
function userForm(id) {
  const u = id ? state.users.find((u) => u.id === id) : null;
  showModal(
    u ? "Manage user" : "Create user",
    `<form data-form="user" data-id="${id || ""}">${section("01", "Account identity", `<div class="grid2">${field("Full name", input("name", u?.name, "text", "required"))}${field("Username", input("username", u?.username, "text", "required"))}${field("Email for password reset", input("email", u?.email, "email", "required"))}${field(u ? "New password · leave blank to keep" : "Initial password", input("password", "", "password", `minlength="12" maxlength="256" autocomplete="new-password" ${u ? "" : "required"}`))}</div>`)}${section(
      "02",
      "Role & responsibility",
      `<div class="grid2">${field("Single role", `<select name="role" id="userRole">${ROLES.map((r) => `<option value="${r}" ${u?.role === r ? "selected" : ""}>${r}</option>`).join("")}</select>`)}</div><p class="help">Requesters raise orders and payment requests. Finance reviews and pays them, and manages budgets, master data and project tasks. Viewers can only read.</p>`,
    )}${section("03", "Company access", `<div class="checks"><label class="group-access"><input name="groupAccess" type="checkbox" ${u?.groupAccess ? "checked" : ""}>Full group access</label>${state.companies.map((c) => `<label><input name="companies" type="checkbox" value="${c.id}" ${u?.companies.includes(c.id) ? "checked" : ""}>${esc(c.name)}</label>`).join("")}</div>`)}<div class="checks"><label><input name="active" type="checkbox" ${u?.active === false ? "" : "checked"}>Active account</label></div>${footer("Save user", "Mandatory 2FA is enrolled at first sign-in.")}</form>`,
  );
}
function reasonForm(id, action) {
  const titles = {
      return: "Return to requester",
      reject: "Reject request",
      hold: "Place payment on hold",
      remark: "Add Finance remark",
      documents: "Request additional supporting",
      deletePayment: "Delete Payment",
      parentReject: "Reject request",
      amendReturn: "Return amendment",
      amendReject: "Reject amendment",
    },
    r =
      state.requests.find((r) => r.id === id) ||
      state.orders.find((o) => o.id === id);
  showModal(
    titles[action],
    `<form data-form="reason" data-id="${id}" data-action-type="${action}"><div class="form-intro"><p>${esc(r.number)} · ${action === "documents" ? "Describe the documents needed. The requester can upload them directly back to Finance; existing approvals stay valid." : action === "deletePayment" ? "Payment details and payment supporting PDFs will be permanently cleared. The approved request returns to Pending Payment. A reason is mandatory and remains in the audit trail." : action === "parentReject" ? "All child payment requests must be rejected first. Paid children require Admin payment deletion before rejection." : action === "return" ? "The requester can correct the request and resubmit it to Finance." : action === "reject" ? "Record a clear reason for rejecting this payment request." : action === "hold" ? "Explain what needs to be resolved before payment can proceed." : "Leave context for the Finance team and requester."}</p></div>${field(action === "remark" ? "Remark" : "Reason", `<textarea name="reason" required maxlength="2000" placeholder="Give the team a clear explanation and next step."></textarea>`)}${footer(action === "remark" ? "Add remark" : titles[action], "This action is recorded in the audit trail.")}</form>`,
  );
}
function payForm(id) {
  const r = state.requests.find((r) => r.id === id),
    o = state.orders.find((o) => o.id === r.orderId);
  showModal(
    "Record completed payment",
    `<form data-form="pay" data-id="${id}"><div class="detail-lead"><div><div class="eyebrow">EXACT PAYMENT REQUIRED</div><div class="amount"><span>${r.currency || o.currency}</span>${fmt(r.amount)}</div></div><div class="lead-side"><strong>${esc(r.number)}</strong><small>${esc(name("suppliers", o.supplierId))}</small></div></div>${section("01", "Payment details", `<div class="grid2">${field("Payment date", input("paymentDate", today(), "date", 'required max="' + today() + '"'))}${field("Payment type", '<select name="paymentType" required><option>Transfer</option><option>Cheque</option><option>TT</option></select>')}</div>`)}${section("02", "Payment evidence", field("Payment supporting PDFs · combined limit 2 MB", '<input name="files" type="file" accept="application/pdf,.pdf" multiple required>'))}<div class="notice">Upload evidence for this payment request. The amount must be settled in full before marking it Paid.</div>${footer("Mark as Paid", "Only Admin can delete a completed payment, with mandatory remarks.")}</form>`,
  );
}
function documentView(id) {
  const r = state.requests.find((r) => r.id === id),
    o = state.orders.find((o) => o.id === r.orderId),
    prior = state.requests
      .filter((x) => x.orderId === o.id && x.id !== r.id && x.status === "Paid")
      .reduce((a, x) => a + parentAmount(x), 0);
  const ap = (st) => r.approvals.find((x) => x.stage === st);
  showModal(
    "View Payment Request",
    `<div class="noprint actions" style="margin-top:0;margin-bottom:20px"><button class="primary" data-action="print">Print / Save as PDF</button><button data-action="openRequest" data-id="${id}">Back to request</button></div><article class="printdoc"><div class="docbrand"><img src="/logo.svg" alt="Sun Siyam" width="94" height="75"></div><small>GROUP PROJECT MONITORING</small><h1>PAYMENT REQUEST</h1><div class="detail-top"><strong>${esc(r.number)}</strong>${badge(r.status)}</div><div class="detail-grid">${detail("Company", esc(name("companies", o.companyId)))}${detail("Project", esc(name("projects", o.projectId)))}${detail("Date", r.date)}${detail("Supplier", esc(name("suppliers", o.supplierId)))}${detail("PO number", esc(o.po))}${detail("Invoice number", esc(o.invoice || "—"))}${detail("Order currency", o.currency)}${detail("Payment currency", r.currency || o.currency)}${detail("Saved payment rate", `1 USD = ${fmt(r.rate)} ${r.currency || o.currency}`)}${detail("Approved budget", esc(name("budgets", o.budgetId)))}</div><h3>Description</h3><p>${esc(o.description)}</p>${categoryTable(o)}<table style="margin-top:18px"><tbody><tr><td>Full order amount</td><td class="right">${o.currency} ${fmt(o.total)}</td></tr><tr><td>Other instalments paid to date</td><td class="right">${o.currency} ${fmt(prior)}</td></tr><tr><td><strong>This payment request · ${r.percent}% at creation</strong></td><td class="right"><strong>${r.currency || o.currency} ${fmt(r.amount)}</strong></td></tr><tr><td>Payment terms</td><td>${esc(r.terms)}</td></tr></tbody></table><h3 style="margin-top:22px">Request & payment · this payment request only</h3><table><thead><tr><th>Stage</th><th>Name</th><th>Date / Time</th></tr></thead><tbody><tr><td>Requested by</td><td>${esc(name("users", r.requestedBy))}</td><td>${date(r.createdAt)}</td></tr>${r.approvals.map((x) => `<tr><td>${esc(x.stage === "Reviewer" ? "Checked by" : x.stage)}</td><td>${esc(x.by)}</td><td>${date(x.at)}</td></tr>`).join("")}${r.finalApprovedAt ? `<tr><td>Submitted to Finance</td><td>${esc(name("users", r.requestedBy))}</td><td>${date(r.finalApprovedAt)}</td></tr>` : ""}${r.payment ? `<tr><td>Paid by</td><td>${esc(r.payment.by)}</td><td>${r.payment.date} · ${r.payment.type}</td></tr>` : ""}</tbody></table>${r.remarks.length ? '<h3 style="margin-top:22px">Finance remarks</h3>' + r.remarks.map((m) => `<p>${esc(m.text)} — ${esc(m.by)}</p>`).join("") : ""}${supportingReferences(o, r)}${reviewHistory(r.history)}<div class="docfooter">System-generated document · ${esc(r.number)} · Generated ${date(Date.now())}${demo ? " · DEMO SAMPLE — FOR TESTING ONLY" : ""}</div></article>`,
  );
}
function enrollmentOptions() {
  if (!enrollKey) return "";
  return `<section id="enrollmentOptions" class="auth-enrollment" aria-labelledby="enrollmentTitle"><h3 id="enrollmentTitle">Add your authenticator</h3><p>Choose how to add this account to your authenticator app, then enter its six-digit code below.</p><div class="actions" role="group" aria-label="Authenticator setup method"><button type="button" data-action="enrollMethod" data-method="qr" aria-pressed="${enrollMethod === "qr"}" ${enrollQr ? "" : "disabled"}>Scan QR code</button><button type="button" data-action="enrollMethod" data-method="key" aria-pressed="${enrollMethod === "key"}">Enter setup key</button></div>${enrollMethod === "qr" && enrollQr ? `<div class="auth-qr"><img src="${esc(enrollQr)}" width="280" height="280" alt="Scan this QR code with your authenticator app to add your Sun Siyam account"><p>In your authenticator app, add an account and select Scan QR code.</p></div>` : `<p>In your authenticator app, add an account with a setup key. Select a time-based code.</p><div class="secret" aria-label="Authenticator setup key">${esc(enrollKey)}</div>`}</section>`;
}
function renderLogin() {
  const reset = loginStep.startsWith("reset");
  $("#app").innerHTML =
    `<div class="login"><div class="login-appearance">${themePicker("loginAppearance")}</div><div class="login-art">${brand()}<div class="login-message"><div class="eyebrow">A CLEARER FINANCIAL PICTURE</div><h1>Every commitment.<br>Every payment.<br>One clear picture.</h1><p>Your workspace for project budgets, Purchasing and Planning approvals, and Finance visibility.</p><div class="login-graphic" aria-hidden="true"><div class="graphic-label">FROM PLAN TO PAYMENT</div><div class="graphic-line"><span>Approved budget</span><i style="width:100%"></i></div><div class="graphic-line"><span>Commitment</span><i style="width:72%"></i></div><div class="graphic-line"><span>Payment</span><i style="width:44%"></i></div></div></div><div class="login-foot">SUN SIYAM GROUP &nbsp; / &nbsp; PROJECT MONITORING</div></div><div class="login-panel"><div class="login-card"><div class="login-mobile-brand" style="display:none">${brand()}</div><div class="eyebrow">SECURE WORKSPACE</div><h2 id="pageTitle">${reset ? "Reset password" : loginStep === "totp" ? "Verify your identity" : "Welcome back"}</h2><p class="sub">${loginStep === "totp" ? "Enter the six-digit code from your authenticator." : reset ? "Recover access to your project workspace." : "Sign in to your project workspace."}</p><form data-form="login">${loginStep === "password" ? field("Username", input("username", "", "text", 'required autocomplete="username"')) + field("Password", input("password", "", "password", 'required autocomplete="current-password"')) : loginStep === "totp" ? `${enrollmentOptions()}${field("Authenticator code", input("code", "", "text", 'required pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code"'))}` : loginStep === "reset-start" ? field("Account email", input("email", "", "email", 'required autocomplete="email"')) : field("Email OTP", input("code", "", "text", 'required pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code"')) + field("New password", input("password", "", "password", 'required minlength="12" maxlength="256" autocomplete="new-password"'))}<button class="primary">${loginStep === "password" ? "Sign in" : loginStep === "reset-start" ? "Send email OTP" : loginStep === "reset-finish" ? "Reset password" : "Verify & continue"}${icon("arrow")}</button><div id="loginError" role="alert" class="help"></div></form><div class="actions">${loginStep === "password" ? '<button class="linkbtn" data-action="resetPassword">Forgot password?</button>' : '<button class="linkbtn" data-action="backLogin">Back to sign in</button>'}</div><div class="login-demo"><button data-action="demo">Explore demo workspace ${icon("arrow")}</button><p class="help">Sample data only. Explore the portal and test workflows without changing live records.</p></div><div class="login-security">${icon("shield")}Password + authenticator verification</div></div></div></div>`;
  accessible();
  if (new URLSearchParams(location.search).get("sso") === "failed") {
    history.replaceState(null, "", location.pathname);
    toast("ERP sign-in failed — sign in with your portal account.", "error");
  }
}
async function readFiles(fd) {
  const files = fd.getAll("files").filter((f) => f.size);
  if (!files.length || files.reduce((a, f) => a + f.size, 0) > 2000000)
    throw Error("Attach supporting PDFs with a combined size of at most 2 MB");
  return Promise.all(files.map(readPDF));
}
async function readPDF(file) {
  if (
    !file ||
    file.type !== "application/pdf" ||
    !file.name.toLowerCase().endsWith(".pdf") ||
    file.size > 2000000
  )
    throw Error("Upload a PDF of at most 2 MB");
  return {
    name: file.name,
    type: file.type,
    data: await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    }),
  };
}
async function fileDownload(b) {
  const f = demo
    ? supportingFile(raw, user, b)
    : (await api("file&" + new URLSearchParams({
        id: b.id,
        kind: b.kind,
        index: b.index || 0,
        version: b.version || "",
        side: b.side || "data",
      }))).file;
  const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/pdf" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = f.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csvExport() {
  const rows = [
    [
      "Company",
      "Project",
      "Approved Budget USD",
      "Budget Utilized USD",
      "Available USD",
      "Paid USD",
      "Outstanding Payments USD",
      "Balance Payments Pending USD",
      "On Hold USD",
    ],
    ...state.projects
      .filter(
        (p) =>
          (!company || p.companyId === company) &&
          (!project || p.id === project),
      )
      .map((p) => {
        const k = kpis(state, p.companyId, p.id);
        return [
          name("companies", p.companyId),
          p.name,
          k.budget,
          k.commitment,
          k.available,
          k.paid,
          k.outstanding,
          k.balance,
          k.hold,
        ];
      }),
  ];
  const csv = rows
    .map((r) =>
      r
        .map((x) => {
          let v = String(x);
          if (/^[=+@-]/.test(v) && typeof x === "string") v = "'" + v;
          return '"' + v.replaceAll('"', '""') + '"';
        })
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = "Project_Financial_Summary.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.addEventListener("click", async (e) => {
  document.querySelectorAll('.profile-menu[open], .demo-actor[open]').forEach(menu => {
    if (!menu.contains(e.target)) menu.open = false;
  });
  const b = e.target.closest("button,[data-action]");
  if (!b) return;
  if (b.dataset.action) e.preventDefault();
  if (
    b.dataset.action &&
    [
      "openOrder",
      "openRequest",
      "submit",
      "resume",
      "unlock",
      "file",
    ].includes(b.dataset.action)
  ) {
    b.disabled = true;
    b.setAttribute("aria-busy", "true");
  }
  try {
    if (b.dataset.page) {
      const mobileNavigation = Boolean(b.closest("#navigationDrawer"));
      page = b.dataset.page;
      render();
      window.scrollTo({ top: 0, behavior: 'instant' });
      (mobileNavigation ? $("#pageTitle") : document.querySelector(`[data-page="${page}"]`))?.focus({ preventScroll: true });
      return;
    }
    if (b.dataset.tab) {
      tab = b.dataset.tab;
      render();
      document
        .querySelector(`[data-tab="${tab}"]`)
        ?.focus({ preventScroll: true });
      return;
    }
    if (b.dataset.master) {
      masterTab = b.dataset.master;
      masterSearch = "";
      render();
      document
        .querySelector(`[data-master="${masterTab}"]`)
        ?.focus({ preventScroll: true });
      return;
    }
    const a = b.dataset.action,
      id = b.dataset.id;
    if (a === 'openNavigation') {
      $('#navigationDrawer').showModal();
      b.setAttribute('aria-expanded', 'true');
      return;
    }
    if (a === 'closeNavigation') {
      $('#navigationDrawer').close();
      $('[data-action=openNavigation]').focus();
      return;
    }
    if (a === "expand") {
      expanded.has(id) ? expanded.delete(id) : expanded.add(id);
      render();
      document
        .querySelector(`[data-action="expand"][data-id="${id}"]`)
        ?.focus();
      return;
    }
    if (a === "openProject") {
      projectId = id;
      page = "project";
      render();
      window.scrollTo({ top: 0, behavior: "instant" });
      $("#pageTitle")?.focus({ preventScroll: true });
      return;
    }
    if (a === "backProjects") {
      const from = projectId;
      page = "projects";
      render();
      document.querySelector(`[data-action="openProject"][data-id="${from}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (a === "newProject" || a === "editProject") {
      masterTab = "projects";
      masterForm(a === "editProject" ? id : undefined);
      return;
    }
    if (a === "projectOrder") {
      const pr = state.projects.find((x) => x.id === id);
      orderForm(undefined, { companyId: pr.companyId, projectId: pr.id });
      return;
    }
    if (a === "projectPayment") {
      // A payment request needs the order's lock, as when it is raised from the order itself.
      await command({ type: "lock", id });
      selected = id;
      paymentForm(id);
      return;
    }
    if (a === "newTask") {
      taskForm(id);
      return;
    }
    if (a === "editTask") {
      taskForm(null, id);
      return;
    }
    if (a === "deleteTask") {
      const t = state.tasks.find((x) => x.id === id);
      showModal("Delete task", `<form data-form="taskDelete" data-id="${id}"><div class="form-intro"><p>Delete “${esc(t.name)}”? Project progress is recalculated without it. The deletion is recorded in the audit log.</p></div>${footer("Delete task", "This cannot be undone.")}</form>`);
      return;
    }
    if (a === "amendApprove") {
      await command({ type: "amendment.approve", id });
      orderDetail(id);
      return;
    }
    if (a === "supply") {
      showModal(
        "Supply requested documents",
        `<form data-form="support" data-id="${id}">${field("Supporting PDFs · combined limit 2 MB", '<input name="files" type="file" accept="application/pdf,.pdf" multiple required>')}${footer("Submit to Finance", "Document upload goes directly back to Finance.")}</form>`,
      );
      return;
    }
    if (a === "clearApproval") {
      approvalOnly = false;
      financeOnly = false;
      render();
      return;
    }
    if (a === "toggleFilters") {
      filtersExpanded = !filtersExpanded;
      render();
      document
        .querySelector('[data-action="toggleFilters"]')
        ?.focus({ preventScroll: true });
      return;
    }
    if (a === "auditGo") {
      auditPageNo = Number(b.dataset.n) || 1;
      render();
      document.querySelector(".pager .current")?.focus({ preventScroll: true });
      document.querySelector(".audit-table")?.scrollIntoView({ block: "start" });
      return;
    }
    if (a === "auditClear") {
      auditFilter = { action: "", user: "", company: "", from: "", to: "" };
      auditSearch = "";
      auditPageNo = 1;
      render();
      $("#auditAction")?.focus({ preventScroll: true });
      return;
    }
    if (a === "clearFilters") {
      company = "";
      project = "";
      from = "";
      to = "";
      statusFilter = "";
      search = "";
      approvalOnly = false;
      financeOnly = false;
      render();
      return;
    }
    if (a === "queue") {
      page = "requests";
      search = "";
      from = "";
      to = "";
      statusFilter = "";
      approvalOnly = false;
      financeOnly = false;
      tab = "requests";
      if (b.dataset.target === "Finance") {
        tab = "finance";
      } else if (b.dataset.target === "commitments") tab = "balance";
      else if (b.dataset.target === "inbox") tab = "inbox";
      else if (b.dataset.target === "approval") approvalOnly = true;
      render();
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    if (a === "demo") useDemo();
    else if (a === "close") await closeModal();
    else if (a === "logout") {
      await closeModal();
      if (!demo) await api("logout", {});
      demo = false;
      user = null;
      page = "dashboard";
      loginStep = "password";
      renderLogin();
    } else if (a === "resetDemo") {
      await closeModal();
      raw = demoState({ history: true });
      localStorage.setItem(storeKey, JSON.stringify(raw));
      user = raw.users[0];
      state = visibleState(raw, user);
      render();
      toast("Demo data reset");
    } else if (a === "import") importForm();
    else if (a === "importCSV" || a === "importXLSX") await importTemplate(a === "importXLSX");
    else if (a === "confirmImport") {
      if (!importPreview) throw Error("Validate the file first");
      b.disabled = true;
      try {
        await command({ type: "import.create", data: importPreview });
        importPreview = null;
        await closeModal();
        toast("Import completed");
      } finally { b.disabled = false; }
    } else if (a === "newOrder") orderForm();
    else if (a === "editOrder") orderForm(id);
    else if (a === "openOrder") await openRecord(id, "order", b.dataset.payment);
    else if (a === "openRequest") await openRecord(id, "request");
    else if (a === "newPayment") paymentForm(id);
    else if (a === "editPayment")
      paymentForm(state.requests.find((r) => r.id === id).orderId, id);
    else if (["submit", "resume"].includes(a)) {
      await command({ type: "request." + a, id });
      requestDetail(id);
      toast(a === "submit" ? "Submitted to Finance" : "Hold released");
    } else if (
      [
        "return",
        "reject",
        "hold",
        "remark",
        "documents",
        "deletePayment",
        "parentReject",
        "amendReturn",
        "amendReject",
      ].includes(a)
    )
      reasonForm(id, a);
    else if (a === "pay") payForm(id);
    else if (a === "file") await fileDownload(b.dataset);
    else if (a === "document") documentView(id);
    else if (a === "print") window.print();
    else if (a === "newMaster") masterForm();
    else if (a === "editMaster") masterForm(id);
    else if (a === "addCategory")
      $("#budgetCategories").insertAdjacentHTML(
        "beforeend",
        budgetRow({ id: randomId(), name: "", amount: "" }),
      );
    else if (a === "newUser") userForm();
    else if (a === "editUser") userForm(id);
    else if (a === "unlock") {
      await command({ type: "unlock", id });
      toast("Lock released");
    } else if (a === "export") csvExport();
    else if (a === "project") {
      project = id;
      company = state.projects.find((p) => p.id === id).companyId;
      render();
    } else if (a === "resetPassword") {
      loginStep = "reset-start";
      renderLogin();
    } else if (a === "enrollMethod" && loginStep === "totp" && enrollKey) {
      enrollMethod = b.dataset.method === "qr" && enrollQr ? "qr" : "key";
      $("#enrollmentOptions").outerHTML = enrollmentOptions();
      document.querySelector(`[data-method="${enrollMethod}"]`)?.focus();
    } else if (a === "backLogin") {
      loginStep = "password";
      enrollKey = enrollQr = loginChallenge = "";
      renderLogin();
    }
  } catch (e) {
    toast(e.message, "error");
  } finally {
    b.disabled = false;
    b.removeAttribute("aria-busy");
  }
});
document.addEventListener("change", async (e) => {
  if (e.target.closest('[data-form="import"]')) {
    importPreview = null;
    const support = document.querySelector('#importSupporting');
    if (support) support.hidden = document.querySelector('[name=importKind]').value !== 'orders';
    const preview = document.querySelector('#importPreview');
    if (preview) preview.innerHTML = '';
  }
  const t = e.target;
  try {
    if (t.id === "sortOrder") {
      sortOrder = t.value;
      render();
      $("#sortOrder")?.focus();
      return;
    }
    if (t.id === "actor" || t.id === "drawerActor") {
      await closeModal();
      user = raw.users.find((u) => u.id === t.value);
      sessionStorage.setItem("demo-actor", user.id);
      state = visibleState(raw, user);
      const allowed = ["dashboard", "projects", "project", "requests", ...(isFinanceAdmin(user) ? ["master", "audit"] : []), ...(user.role === "Admin" ? ["users", "settings"] : [])];
      if (!allowed.includes(page)) page = "dashboard";
      company = "";
      project = "";
      render();
    } else if (
      [
        "company",
        "drawerCompany",
        "project",
        "from",
        "to",
        "statusFilter",
      ].includes(t.id)
    ) {
      if (t.id === "company" || t.id === "drawerCompany") {
        company = t.value;
        project = "";
      }
      if (t.id === "project") project = t.value;
      if (t.id === "from") from = t.value;
      if (t.id === "to") to = t.value;
      if (t.id === "statusFilter") {
        statusFilter = t.value;
        approvalOnly = false;
        financeOnly = false;
      }
      const focusedId = t.id;
      render();
      document.getElementById(focusedId)?.focus({ preventScroll: true });
    } else if (t.dataset.task) {
      const task = state.tasks.find((x) => x.id === t.dataset.task);
      try {
        await command({ type: "task.save", data: { record: { ...task, status: t.value } } });
        toast(`${task.name}: ${t.value}`);
      } catch (error) {
        toast(error.message, "error");
        render();
      }
      document.querySelector(`[data-task="${task.id}"]`)?.focus({ preventScroll: true });
    } else if (["auditAction", "auditUser", "auditCompany", "auditFrom", "auditTo"].includes(t.id)) {
      auditFilter = { ...auditFilter, [{ auditAction: "action", auditUser: "user", auditCompany: "company", auditFrom: "from", auditTo: "to" }[t.id]]: t.value };
      auditPageNo = 1;
      const focusedId = t.id;
      render();
      document.getElementById(focusedId)?.focus({ preventScroll: true });
    } else if (t.id === "paymentCurrency") {
      syncPayment(t);
    } else if (t.name === "currency" && t.form?.dataset.form === "order") {
      if (!t.form.dataset.id) {
        $("#paymentCurrency").value = t.value;
        syncPayment(t);
      }
    } else if (t.id === "userRole") {
    } else if (t.id === "formCompany") {
      $("#formProject").innerHTML = opt(
        state.projects.filter((p) => p.companyId === t.value),
        "",
      );
      $("#formBudget").innerHTML = opt([], "");
      $("#allocations").innerHTML = "";
    } else if (t.id === "formProject") {
      $("#formBudget").innerHTML = opt(
        state.budgets.filter((b) => b.projectId === t.value),
        "",
      );
      $("#allocations").innerHTML = "";
    } else if (t.id === "formBudget")
      $("#allocations").innerHTML = allocationInputs(t.value);
    else if (t.id === "masterCompany" && $("#masterProject"))
      $("#masterProject").innerHTML = opt(
        state.projects.filter((p) => p.companyId === t.value),
        "",
      );
  } catch (e) {
    toast(e.message);
  }
});
document.addEventListener("input", (e) => {
  e.target.removeAttribute("aria-invalid");
  e.target.setCustomValidity?.("");
  if (e.target.id === "masterSearch" || e.target.id === "userSearch" || e.target.id === "auditSearch" || e.target.id === "projectSearch") {
    const id = e.target.id,
      pos = e.target.selectionStart;
    if (id === "masterSearch") masterSearch = e.target.value;
    else if (id === "projectSearch") projectSearch = e.target.value;
    else if (id === "auditSearch") { auditSearch = e.target.value; auditPageNo = 1; }
    else userSearch = e.target.value;
    render();
    document.getElementById(id).focus();
    document.getElementById(id).setSelectionRange(pos, pos);
    return;
  }
  if (e.target.form?.dataset.form === "order") {
    const form = e.target.form,
      total = Number(form.elements.total.value),
      allocated = [...form.querySelectorAll("[name^=allocation_]")].reduce(
        (n, x) => n + Number(x.value || 0),
        0,
      ),
      out = $("#allocationReadout");
    if (out) {
      out.textContent =
        form.elements.currency.value +
        " " +
        fmt(allocated) +
        " / " +
        fmt(total);
      out.dataset.mismatch = String(Math.abs(allocated - total) > 0.005);
    }
  }
  if (
    ["paymentPercent", "paymentAmount", "paymentCurrency"].includes(
      e.target.id,
    ) ||
    ["total", "currency"].includes(e.target.name)
  )
    syncPayment(e.target);
  if (e.target.id === "search") {
    const pos = e.target.selectionStart;
    search = e.target.value;
    render();
    $("#search").focus();
    $("#search").setSelectionRange(pos, pos);
  }
});
document.addEventListener("submit", async (e) => {
  const f = e.target;
  if (!f.dataset.form) return;
  e.preventDefault();
  const submit = f.querySelector("button[type=submit],button.primary");
  if (submit) {
    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
  }
  const existingError = f.querySelector(".form-error");
  if (existingError) existingError.hidden = true;
  try {
    const fd = new FormData(f),
      d = Object.fromEntries(fd),
      kind = f.dataset.form,
      id = f.dataset.id;
    if (kind === "login") {
      if (loginStep === "password") {
        const r = await api("login", d);
        loginChallenge = r.challenge;
        enrollKey = r.secret || "";
        enrollQr = r.qrCode || "";
        enrollMethod = enrollQr ? "qr" : "key";
        loginStep = "totp";
        renderLogin();
      } else if (loginStep === "totp") {
        const r = await api("verify", {
          challenge: loginChallenge,
          code: d.code,
        });
        user = r.user;
        state = r.state;
        enrollKey = enrollQr = loginChallenge = "";
        demo = false;
        render();
      } else if (loginStep === "reset-start") {
        const r = await api("reset-start", d);
        loginChallenge = r.challenge;
        loginStep = "reset-finish";
        renderLogin();
        toast(r.message);
      } else {
        await api("reset-finish", {
          challenge: loginChallenge,
          code: d.code,
          password: d.password,
        });
        loginStep = "password";
        renderLogin();
        toast(
          "Password reset. Sign in with your new password and authenticator.",
        );
      }
      return;
    }
    if (kind === "import") {
      importPreview = null;
      const preview = f.querySelector('#importPreview');
      preview.innerHTML = '';
      const rows = await readImport(fd.get('importFile'), d.importKind);
      const uploads = fd.getAll('importPDFs').filter(f => f.size);
      if (uploads.reduce((sum, f) => sum + f.size, 0) > 2000000) throw Error('Combined supporting PDFs must not exceed 2 MB');
      const files = await Promise.all(uploads.map(readPDF));
      const payload = { kind: d.importKind, rows, files };
      await command({ type: 'import.preview', data: payload });
      importPreview = payload;
      const headers = importFields[d.importKind];
      preview.innerHTML = `<p>${rows.length} records validated. Review the values before importing.</p><div class="table-wrap"><table><thead><tr><th>Row</th>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr><td>${r.line}</td>${headers.map(h => `<td>${esc(r.values[h])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><button type="button" class="primary" data-action="confirmImport">Import ${rows.length} records</button>`;
      accessible(preview);
      return;
    }
    if (kind === "order") {
      const old = id ? state.orders.find((o) => o.id === id) : null;
      if (old) {
        d.companyId = old.companyId;
        d.projectId = old.projectId;
        d.currency = old.currency;
      }
      const source =
        old?.amendment?.status === "Draft" ? old.amendment.data : old;
      const files = fd.getAll("files").filter((x) => x.size);
      if (files.reduce((a, f) => a + f.size, 0) > 2000000)
        throw Error("Combined supporting PDFs must not exceed 2 MB");
      let keep;
      if (old && (!files.length || d.fileMode === "append")) {
        if (demo) {
          const rec = raw.orders.find((o) => o.id === id);
          keep =
            rec.amendment?.status === "Draft"
              ? rec.amendment.data.files
              : rec.files;
        } else
          keep = await Promise.all(
            source.files.map((_, i) =>
              api(
                "file&id=" +
                  id +
                  "&kind=" +
                  (old.amendment?.status === "Draft" ? "amendment" : "order") +
                  "&index=" +
                  i,
              ).then((r) => r.file),
            ),
          );
      }
      d.files = files.length
        ? [
            ...(d.fileMode === "append" ? keep || [] : []),
            ...(await Promise.all(files.map(readPDF))),
          ]
        : keep;
      d.allocations = state.budgets
        .find((b) => b.id === d.budgetId)
        .categories.map((c) => ({
          categoryId: c.id,
          amount: Number(fd.get("allocation_" + c.id)),
        }))
        .filter((c) => c.amount > 0);
      if (!id)
        d.payment = {
          date: d.firstdate,
          currency: d.firstcurrency,
          percent: d.firstpercent,
          amount: d.firstamount,
          terms: d.firstterms,
        };
      await command({ type: id ? "order.amend" : "order.create", id, data: d });
      await closeModal();
      if (!id) await openRecord(state.requests.at(-1).id, "request");
      toast(
        id
          ? "Amendment submitted to Finance"
          : "Request and first payment request created",
      );
    } else if (kind === "payment") {
      await command({
        type: id ? "request.edit" : "request.create",
        id,
        data: { ...d, orderId: f.dataset.order },
      });
      const reqId =
        id || (demo ? raw.requests.at(-1).id : state.requests.at(-1).id);
      await openRecord(reqId, "request");
      toast("Payment request saved as draft");
    } else if (kind === "reason") {
      const action = f.dataset.actionType,
        type =
          action === "parentReject"
            ? "order.reject"
            : action === "amendReturn"
              ? "amendment.return"
              : action === "amendReject"
                ? "amendment.reject"
                : "request." + action;
      await command({ type, id, data: d });
      if (type.startsWith("order.") || type.startsWith("amendment."))
        orderDetail(id);
      else requestDetail(id);
      toast("Request updated");
    } else if (kind === "support") {
      d.files = await readFiles(fd);
      await command({ type: "request.support", id, data: d });
      requestDetail(id);
      toast("Documents submitted to Finance");
    } else if (kind === "pay") {
      d.files = await readFiles(fd);
      await command({ type: "request.pay", id, data: d });
      requestDetail(id);
      toast("Payment recorded");
    } else if (kind === "master") {
      const old = id ? state[masterTab].find((x) => x.id === id) : null;
      const record = { id: id || undefined, name: d.name };
      if (["companies", "projects"].includes(masterTab)) record.code = d.code;
      if (masterTab === "budgets") record.currency = d.currency;
      if (masterTab === "projects" || masterTab === "budgets")
        record.companyId = old?.companyId || d.companyId;
      if (masterTab === "suppliers") record.email = d.email;
      if (masterTab === "currencies") {
        record.id = d.code;
        record.rate = Number(d.rate);
      }
      if (masterTab === "budgets") {
        record.projectId = old?.projectId || d.projectId;
        record.categories = [...f.querySelectorAll("[data-category]")].map(
          (row) => ({
            id: row.dataset.category,
            name: row.querySelector("[name=categoryName]").value,
            amount: Number(row.querySelector("[name=categoryAmount]").value),
          }),
        );
      }
      await command({
        type: "master.save",
        data: { kind: masterTab, record, reason: d.reason },
      });
      await closeModal();
      toast("Master data saved");
    } else if (kind === "task") {
      await command({ type: "task.save", data: { record: { id: id || undefined, projectId: f.dataset.project, name: d.name, status: d.status, owner: d.owner, due: d.due } } });
      await closeModal();
      toast(id ? "Task saved" : "Task added");
    } else if (kind === "taskDelete") {
      await command({ type: "task.delete", id });
      await closeModal();
      toast("Task deleted");
    } else if (kind === "user") {
      const record = {
        ...d,
        id: id || undefined,
        companies: fd.getAll("companies"),
        groupAccess: fd.has("groupAccess"),
        active: fd.has("active"),
      };
      delete record.password;
      await command({
        type: "user.save",
        data: { record, password: d.password },
      });
      await closeModal();
      toast("User saved");
    } else if (kind === "settings") {
      await command({ type: "settings.save", data: d });
      toast("Settings saved");
    }
  } catch (e) {
    if (f.dataset.form === "login" && $("#loginError")) {
      $("#loginError").textContent = e.message;
      $("#loginError").className = "notice error";
    } else {
      const error = f.querySelector(".form-error");
      if (error) {
        error.textContent = e.message;
        error.hidden = false;
        error.focus();
      } else toast(e.message, "error");
    }
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
    }
  }
});
$("#modal").addEventListener("cancel", (e) => {
  e.preventDefault();
  closeModal();
});
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.profile-menu[open], .demo-actor[open]').forEach(menu => {
    menu.open = false;
    menu.querySelector('summary')?.focus();
  });
});
window.matchMedia('(min-width: 761px)').addEventListener('change', event => {
  if (event.matches && $('#navigationDrawer')?.open) $('#navigationDrawer').close();
});
window.addEventListener("storage", (e) => {
  if (demo && e.key === storeKey && e.newValue) {
    raw = JSON.parse(e.newValue);
    user = raw.users.find((u) => u.id === user.id) || raw.users[0];
    state = visibleState(raw, user);
    render();
  }
});
setInterval(async () => {
  if (
    !user ||
    $("#modal").open ||
    $("#navigationDrawer")?.open ||
    document.querySelector(".profile-menu[open], .demo-actor[open]") ||
    document.activeElement?.matches("input,select,textarea")
  )
    return;
  try {
    if (demo) {
      const saved = localStorage.getItem(storeKey);
      if (saved) raw = JSON.parse(saved);
      state = visibleState(raw, user);
    } else {
      const r = await api("state");
      state = r.state;
      user = r.user;
    }
    render();
  } catch (e) {
    if (e.message === "Sign in required") {
      user = null;
      renderLogin();
    }
  }
}, 30000);
$("#app").innerHTML = loadingSkeleton();
(async () => {
  try {
    const c = await api("config");
    if (c.configured) {
      try {
        const r = await api("state");
        user = r.user;
        state = r.state;
        render();
        return;
      } catch {}
    }
    renderLogin();
  } catch {
    renderLogin();
  }
})();

document.addEventListener(
  "invalid",
  (e) => {
    const control = e.target;
    control.setAttribute("aria-invalid", "true");
    const f = control.form,
      error = f?.querySelector(".form-error");
    if (error) {
      const label =
        control.labels?.[0]?.textContent?.trim() ||
        control.getAttribute("aria-label") ||
        "This field";
      error.textContent = label + ": " + control.validationMessage;
      error.hidden = false;
    }
  },
  true,
);

// Workspace sheet grid parallax (every page): the background barely moves on screen (8% of the
// scroll speed). It is positioned in the same frame as the page scroll so it never
// trails the foreground.
const reduceScrollMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
const setSheetShift = (y) => {
  const shift = reduceScrollMotion?.matches ? 0 : Math.round(y * 0.92);
  document.documentElement.style.setProperty("--sheet-shift", `${shift}px`);
};
window.addEventListener("scroll", () => setSheetShift(window.scrollY), { passive: true });
reduceScrollMotion?.addEventListener?.("change", () => setSheetShift(window.scrollY));

// Smooth wheel scrolling for the page. Each wheel step moves a target and the page
// eases toward it every frame. Keyboard, scrollbar, links, zoom (Ctrl+wheel),
// horizontal scrolling, inner scroll areas and open dialogs stay native, and
// reduced-motion users keep instant scrolling.
(() => {
  const reduceMotion = reduceScrollMotion;
  const ease = 0.14;
  let target = window.scrollY;
  let current = window.scrollY;
  let animating = false;
  const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
  const handledInside = (node, dy) => {
    for (let el = node instanceof Element ? node : node?.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      if (el.matches("dialog[open], select, textarea, [contenteditable=true]")) return true;
      const overflowY = getComputedStyle(el).overflowY;
      if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1) {
        const canUp = el.scrollTop > 0;
        const canDown = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
        if ((dy < 0 && canUp) || (dy > 0 && canDown)) return true;
      }
    }
    return false;
  };
  const step = () => {
    current += (target - current) * ease;
    if (Math.abs(target - current) < 0.5) {
      current = target;
      animating = false;
    }
    window.scrollTo(0, current);
    setSheetShift(window.scrollY);
    if (animating) requestAnimationFrame(step);
  };
  window.addEventListener("wheel", (event) => {
    if (event.defaultPrevented || reduceMotion?.matches || event.ctrlKey || event.shiftKey) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (document.querySelector("dialog[open]") || handledInside(event.target, event.deltaY)) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    if (!animating) current = target = window.scrollY;
    target = Math.max(0, Math.min(maxScroll(), target + event.deltaY * unit));
    if (!animating) {
      animating = true;
      requestAnimationFrame(step);
    }
  }, { passive: false });
  // Keyboard, scrollbar and link scrolling move the page natively; follow them.
  window.addEventListener("scroll", () => {
    if (!animating) current = target = window.scrollY;
  }, { passive: true });
})();
