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
  currencyStats,
  firstStage,
  visibleState,
  supportingFile,
  kpis,
  money,
  access,
  roleFor,
  budgetAmount,
  categoryUsed,
  warnings,
  ROLES,
} from "./domain.js";
import { demoState } from "./demo.js";
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
  teamFilter = "",
  selected = null,
  returnPaymentId = null,
  loginStep = "password",
  loginChallenge = "",
  enrollKey = "",
  enrollQr = "",
  enrollMethod = "qr",
  busy = false;
const symbols = {
  dashboard:
    '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  requests: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"/>',
  master:
    '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m3 10v-3a5 5 0 0 0-3-4"/>',
  settings:
    '<path d="m9 3 6 0 1 3 3 1 2 5-2 4-3 1-1 4H9l-1-3-3-1-2-5 2-4 3-1z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield:
    '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  hold: '<circle cx="12" cy="12" r="9"/><path d="M9 8v8m6-8v8"/>',
  chart: '<path d="M4 20h17M7 16V9m6 7V4m6 12v-5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
};
const icon = (n) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${symbols[n] || symbols.chart}</svg>`;
const expanded = new Set();
let sortOrder = "date-desc",
  masterSearch = "",
  userSearch = "",
  filtersExpanded = false,
  toastTimer,
  focusReturn = null,
  labelSequence = 0,
  approvalOnly = false,
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
const pageHeader = (eyebrow, title, description, action = "") =>
  `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1 id="pageTitle">${title}</h1><p class="sub">${description}</p></div>${action}</div>`;
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
  if (!raw) raw = demoState();
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
const badge = (s) =>
  `<span class="badge ${s.replaceAll(" ", "")}">${esc(s === "Finance" ? "Pending Payment" : s)}</span>`;
const opt = (arr, val, blank = "Select…") =>
  `<option value="">${esc(blank)}</option>` +
  arr
    .map(
      (x) =>
        `<option value="${esc(x.id)}" ${x.id === val ? "selected" : ""}>${esc(x.name)}</option>`,
    )
    .join("");
const field = (label, html, wide = false) =>
  `<div class="field ${wide ? "wide" : ""}"><label>${label}</label>${html}</div>`;
const input = (n, v = "", type = "text", attrs = "") =>
  `<input name="${n}" value="${esc(v)}" type="${type}" ${attrs}>`;
function attention(r) {
  return (
    (["Draft", "Documents Required"].includes(r.status) &&
      user.role === "Requester" &&
      r.requestedBy === user.id) ||
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
function render() {
  if (!user) {
    renderLogin();
    return;
  }
  if (company && !state.companies.some((c) => c.id === company)) {
    company = "";
    project = "";
  }
  const pending = state.requests.filter(attention).length;
  $("#app").innerHTML =
    `<a class="skip-link" href="#workspace">Skip to workspace</a><div class="shell"><aside class="sidebar">${brand()}<div class="eyebrow nav-label">GROUP WORKSPACE</div><nav class="nav" aria-label="Main navigation">${[
      ["dashboard", "Dashboard"],
      ["requests", "Requests"],
      ...(user.role === "Admin"
        ? [
            ["master", "Master Data"],
            ["users", "User Manager"],
            ["settings", "Settings"],
          ]
        : []),
    ]
      .map(
        ([p, t]) =>
          `<button data-page="${p}" class="${page === p ? "active" : ""}" ${page === p ? 'aria-current="page"' : ""}>${icon(p)}${t}${p === "requests" && pending ? `<span class="nav-count">${pending}<span class="sr-only"> awaiting your action</span></span>` : ""}</button>`,
      )
      .join(
        "",
      )}</nav><div class="sidebar-foot"><div class="workspace-note"><strong>Clarity at every stage.</strong>Budgets. Commitments. Payments.<br><span class="release">PROJECT WORKSPACE</span></div></div></aside><main class="main" id="workspace" tabindex="-1"><header class="topbar"><div class="crumb"><span>Group workspace</span>${icon("chevron")}<strong>${pageNames[page]}</strong></div><div class="top-right">${
      demo
        ? `<select id="actor" aria-label="Demo user — role switching for testing only">${raw.users
            .filter((u) => u.active)
            .map(
              (u) =>
                `<option value="${u.id}" ${u.id === user.id ? "selected" : ""}>${esc(u.name)}</option>`,
            )
            .join("")}</select>`
        : ""
    }<div class="profile"><span class="avatar" aria-hidden="true">${esc(user.name.slice(0, 1).toUpperCase())}</span><div class="profile-name"><strong>${esc(user.name)}</strong><small>${esc(user.role)}${user.team ? " · " + esc(user.team) : ""}</small></div></div><button data-action="logout" class="linkbtn">Sign out</button></div></header>${demo ? '<div class="demo-banner"><span><strong>DEMO WORKSPACE</strong>Sample data · browser-local changes<span class="demo-explanation"> · Role switching is for testing only.</span></span><a href="#" data-action="resetDemo">Reset sample data</a></div>' : ""}<div class="content" aria-labelledby="pageTitle">${page === "dashboard" ? dashboard() : page === "requests" ? requestsPage() : page === "master" ? masterPage() : page === "users" ? usersPage() : settingsPage()}</div></main></div>`;
  accessible();
}
function filters(dates = false) {
  const extra = Boolean(from || to || statusFilter || teamFilter);
  return `<div class="filters"><div><label for="company">Company</label><select id="company">${opt(state.companies, company, user.groupAccess ? "All" : "All")}</select></div><div><label for="project">Project</label><select id="project">${opt(
    state.projects.filter((p) => !company || p.companyId === company),
    project,
    "All",
  )}</select></div>${
    dates
      ? `<button data-action="toggleFilters" aria-expanded="${filtersExpanded}" aria-controls="extraFilters">${icon("settings")}Filters${extra ? '<span class="count">Active</span>' : ""}</button><div class="advanced-filters wide" id="extraFilters" ${filtersExpanded ? "" : "hidden"}><div><label for="from">Request date · From</label><input id="from" type="date" value="${from}"></div><div><label for="to">To</label><input id="to" type="date" value="${to}"></div><div><label for="statusFilter">Status</label><select id="statusFilter">${opt(
          [
            "Draft",
            "Reviewer",
            "Approval 1",
            "Approval 2",
            "Finance",
            "On Hold",
            "Paid",
            "Rejected",
            "Documents Required",
          ].map((x) => ({ id: x, name: x })),
          statusFilter,
          "All",
        )}</select></div><div><label for="teamFilter">Team</label><select id="teamFilter">${opt(
          ["Planning", "Purchasing"].map((x) => ({ id: x, name: x })),
          teamFilter,
          "All",
        )}</select></div></div>`
      : ""
  }<div class="filter-end"><span class="currency-label">Reporting currency <strong>USD</strong></span></div>${company || project || extra ? '<button class="linkbtn" data-action="clearFilters">Clear filters</button>' : ""}</div>`;
}
function dashboard() {
  const k = kpis(state, company, project),
    ps = state.projects.filter(
      (p) =>
        (!company || p.companyId === company) && (!project || p.id === project),
    ),
    pct = k.utilized ? Math.round((k.paid / k.utilized) * 100) : 0;
  const kpiTile = (label, value, key, level = 2) =>
    `<article class="dashboard-kpi" aria-labelledby="kpi-title-${key}" data-kpi="${key}"><h${level} id="kpi-title-${key}">${label}</h${level}><div class="dashboard-kpi-value"><span>USD</span>${fmt(value)}</div></article>`;
  const summary = (items, title) =>
    `<section class="panel flush"><div class="section-title"><h2>${title}</h2><small>USD</small></div><div class="table-wrap"><table><thead><tr><th>${title.includes("Company") ? "Company" : "Project / Company"}</th><th class="right">Approved Budget</th><th class="right">Utilized</th><th class="right">Available</th></tr></thead><tbody>${items
      .map((v) => {
        const x = kpis(state, v.companyId, v.projectId);
        return `<tr><td>${esc(v.name)}</td>${[x.budget, x.utilized, x.available].map((n) => `<td class="right">${fmt(n)}</td>`).join("")}</tr>`;
      })
      .join("")}</tbody></table></div></section>`;
  return `${pageHeader("PORTFOLIO OVERVIEW", "Project dashboard", "Approved budgets, order utilization and payment status — consolidated in USD.", `<button data-action="export">${icon("download")}Export summary</button>`)}${filters()}
 <section class="dashboard-kpis budget-kpis" aria-label="Budget overview">${[
   ["Total Approved Budget", k.budget, "budget"],
   ["Budget Utilized", k.utilized, "utilized"],
   ["Available Budget", k.available, "available"],
 ].map(([label,value,key])=>kpiTile(label,value,key)).join("")}</section>
 <section class="dashboard-kpis payment-kpis" aria-label="Payment overview">${[
   ["Paid", k.paid, "paid"],
   ["Outstanding Payments", k.outstanding, "outstanding"],
   ["On Hold", k.hold, "hold"],
   ["Balance Payments Pending", k.balance, "balance"],
 ].map(([label,value,key])=>kpiTile(label,value,key,3)).join("")}</section>
 <div class="actions section-gap"><button data-action="queue" data-target="Finance">Finance payments ${icon("arrow")}</button><button data-action="queue" data-target="inbox">My Actions ${icon("arrow")}</button></div><div class="panels section-gap">${summary(
   ps.map((p) => ({
     name: p.name + " / " + name("companies", p.companyId),
     companyId: p.companyId,
     projectId: p.id,
   })),
   "Budget Summary by Project",
 )}<section class="panel coverage-panel"><div class="section-title"><h2>Payment Status</h2></div><div class="coverage-heading"><strong>${pct}%</strong><span>Payments Completed</span></div><div class="coverage-track"><span style="width:${Math.min(100, pct)}%"></span></div>${[
   ["Paid", k.paid],
   ["Outstanding Payments", k.outstanding],
   ["On Hold", k.hold],
   ["Balance Payments Pending", k.balance],
 ]
   .map(
     ([t, v]) =>
       `<div class="stats-line"><span>${t}</span><strong>USD ${fmt(v)}</strong></div>`,
   )
   .join(
     "",
   )}</section></div>
 <div class="section-gap">${summary(
   state.companies
     .filter((c) => !company || c.id === company)
     .map((c) => ({ name: c.name, companyId: c.id, projectId: project })),
   "Budget Summary by Company",
 )}</div>
 <section class="panel flush section-gap"><div class="section-title"><h2>Project Financial Overview</h2><small>USD</small></div><div class="table-wrap"><table><thead><tr><th>Project / Company</th>${["Approved Budget", "Utilized", "Available", "Paid", "Outstanding Payments", "Balance Payments Pending", "On Hold"].map((t) => `<th class="right">${t}</th>`).join("")}</tr></thead><tbody>${ps
   .map((p) => {
     const x = kpis(state, p.companyId, p.id);
     return `<tr><td><button class="linkbtn" data-action="project" data-id="${p.id}">${esc(p.name)}</button><span class="secondary">${esc(name("companies", p.companyId))}</span></td>${[x.budget, x.utilized, x.available, x.paid, x.outstanding, x.balance, x.hold].map((v) => `<td class="right">${fmt(v)}</td>`).join("")}</tr>`;
   })
   .join(
     "",
   )}</tbody><tfoot><tr class="total-row"><td>Total</td>${[k.budget, k.utilized, k.available, k.paid, k.outstanding, k.balance, k.hold].map((v) => `<td class="right">${fmt(v)}</td>`).join("")}</tr></tfoot></table></div></section>
 <section class="panel flush section-gap"><div class="section-title"><h2>Currency Summary</h2><small>Original currencies · USD totals above</small></div><div class="table-wrap"><table><thead><tr><th>Currency</th>${["Approved Budget", "Utilized", "Paid", "Outstanding Payments", "On Hold"].map((t) => `<th class="right">${t}</th>`).join("")}</tr></thead><tbody>${currencyStats(
   state,
   company,
   project,
 )
   .map(
     (c) =>
       `<tr><td>${c.currency}</td>${[c.budget, c.utilized, c.paid, c.outstanding, c.hold].map((v) => `<td class="right">${fmt(v)}</td>`).join("")}</tr>`,
   )
   .join(
     "",
   )}</tbody></table></div><p class="help">Budget and utilization use their original currencies; payment figures use each payment request’s currency. Saved exchange rates determine consolidated USD totals.</p></section>
 <div class="panels section-gap"><section class="panel flush"><div class="section-title"><h2>Budget Categories</h2><small>USD</small></div><div class="table-wrap"><table><thead><tr><th>Category / Project</th><th class="right">Approved</th><th class="right">Utilized</th><th class="right">Available</th></tr></thead><tbody>${state.budgets
   .filter(
     (b) =>
       (!company || b.companyId === company) &&
       (!project || b.projectId === project),
   )
   .flatMap((b) =>
     b.categories.map((c) => {
       const used = categoryUsed(state, b.id, c.id),
         amount = c.amount / (b.rate || 1);
       return `<tr><td>${esc(c.name)}<span class="secondary">${esc(name("projects", b.projectId))}</span></td><td class="right">${fmt(amount)}</td><td class="right">${fmt(used)}</td><td class="right">${fmt(amount - used)}</td></tr>`;
     }),
   )
   .join(
     "",
   )}</tbody></table></div></section><section class="panel"><div class="section-title"><h2>Recent activity</h2></div>${
   state.audit
     .filter(
       (a) =>
         (!company || a.companyId === company) &&
         (!project ||
           state.orders.some(
             (o) =>
               o.projectId === project &&
               (o.id === a.entity ||
                 state.requests.some(
                   (r) => r.orderId === o.id && r.id === a.entity,
                 )),
           )),
     )
     .slice(-6)
     .reverse()
     .map(
       (a) =>
         `<div class="activity"><i class="dot"></i><div><strong>${esc(a.action)}</strong><p>${esc(a.user)} · ${esc(a.detail)}</p><small>${date(a.at)}</small></div></div>`,
     )
     .join("") || empty("No activity yet")
 }</section></div>`;
}
function orderMatch(o) {
  return (
    (!company || o.companyId === company) &&
    (!project || o.projectId === project) &&
    (!teamFilter || o.team === teamFilter) &&
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
      (!approvalOnly ||
        ["Reviewer", "Approval 1", "Approval 2"].includes(r.status)) &&
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
    actionable = (o) =>
      !o.rejectedAt &&
      o.amendment &&
      (stageActor(user, o.amendment) ||
        (o.amendment.status === "Draft" &&
          o.requestedBy === user.id &&
          user.role === "Requester"));
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
  return `${pageHeader("REQUEST WORKSPACE", "Requests", "One order, with independent approvals and evidence for every payment.", user.role === "Requester" && tab === "requests" ? `<button class="primary" data-action="newOrder">${icon("plus")}New Request</button>` : "")}<div class="tabs">${[
    ["requests", "Requests"],
    ["finance", "Finance"],
    ["balance", "Balance Payments To Be Requested"],
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
    ? `<div class="table-wrap"><table class="work-table"><thead><tr><th>Payment request</th><th>Supplier / PO</th><th>Project / Company</th><th>Team</th><th class="right">Requested amount</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${rs
        .map((r) => {
          const o = state.orders.find((o) => o.id === r.orderId);
          return `<tr><td data-label="Payment request"><strong>${esc(r.number)}</strong><span class="secondary">${esc(r.date)} · ${r.percent}% instalment</span></td><td data-label="Supplier / PO">${esc(name("suppliers", o.supplierId))}<span class="secondary">${esc(o.po)}</span></td><td data-label="Project / Company">${esc(name("projects", o.projectId))}<span class="secondary">${esc(name("companies", o.companyId))}</span></td><td data-label="Team">${r.team}</td><td data-label="Requested amount" class="right"><strong><span class="currency">${r.currency || o.currency}</span>${fmt(r.amount)}</strong>${(r.currency || o.currency) !== "USD" ? `<span class="secondary">USD ${fmt(r.amount / (r.rate || o.rate))}</span>` : ""}</td><td data-label="Status">${badge(r.status)}</td><td>${rowAction("openRequest", r.id, "Open " + r.number)}</td></tr>`;
        })
        .join("")}</tbody></table></div>`
    : empty(
        "Nothing in this view",
        "Change your filters, or create a main request to begin a new payment workflow.",
      );
}
function ordersTable(os, view = "requests", all = state.requests) {
  return os.length
    ? `<div class="table-wrap"><table class="work-table"><thead><tr><th>Request Reference</th><th>Supplier / PO</th><th>Project / Company</th><th>Team</th><th class="right">Total Amount</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${os
        .map((o) => {
          const open = expanded.has(o.id),
            rs = all.filter(
              (r) => r.orderId === o.id && (view !== "inbox" || attention(r)),
            );
          return `<tr><td data-label="Request Reference"><button class="linkbtn" data-action="openOrder" data-id="${o.id}">${esc(o.number)}</button></td><td data-label="Supplier / PO">${esc(name("suppliers", o.supplierId))}<span class="secondary">${esc(o.po)}</span></td><td data-label="Project / Company">${esc(name("projects", o.projectId))}<span class="secondary">${esc(name("companies", o.companyId))}</span></td><td data-label="Team">${esc(o.team)}</td><td data-label="Total Amount" class="right"><span class="currency">${o.currency}</span>${fmt(o.total)}</td><td>${view === "balance" ? rowAction("openOrder", o.id, "Open " + o.number) : `<button class="row-action expand-control" data-action="expand" data-id="${o.id}" aria-expanded="${open}" aria-label="${open ? "Collapse" : "Expand"} ${esc(o.number)}">${open ? "−" : "+"}</button>`}</td></tr>${open && view !== "balance" ? `<tr class="children-row"><td colspan="6"><div class="nested-requests">${o.amendment ? `<button data-action="openOrder" data-id="${o.id}">Amendment · ${esc(o.amendment.status)}</button>` : ""}${requestTable(rs)}</div></td></tr>` : ""}`;
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
function empty(t, n = "") {
  return `<div class="empty"><div class="empty-icon">${icon("requests")}</div><h3>${t}</h3>${n ? `<p>${n}</p>` : ""}</div>`;
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
  return `${pageHeader("ADMINISTRATION", "Master data", "The shared foundation for accurate budgets, requests and reporting.", `<button class="primary" data-action="newMaster">${icon("plus")}Add ${singular[masterTab]}</button>`)}<div class="tabs">${Object.entries(
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
      [u.name, u.username, u.email, u.role, u.team]
        .join(" ")
        .toLowerCase()
        .includes(userSearch.toLowerCase()),
  );
  return `${pageHeader("ACCESS & IDENTITY", "User Manager", "Clear responsibilities. The right access for every member of the team.", `<button class="primary" data-action="newUser">${icon("plus")}Create user</button>`)}<div class="admin-stats"><div><strong>${state.users.length}</strong><span>Total users</span></div><div><strong>${state.users.filter((u) => u.active).length}</strong><span>Active accounts</span></div><div><strong>${state.users.filter((u) => u.groupAccess).length}</strong><span>Full group access</span></div></div><div class="admin-intro"><span class="op-icon">${icon("shield")}</span><div><strong>One role per user. Mandatory two-factor authentication.</strong><br><small>Admin creates accounts. Password resets use email OTP; authenticator verification stays required.</small></div></div><div class="list-toolbar"><div class="searchbox">${icon("search")}<input id="userSearch" aria-label="Search users" value="${esc(userSearch)}" placeholder="Search name, username, email or role"></div><small>${users.length} users</small></div><section class="panel flush"><div class="table-wrap"><table><thead><tr><th>User</th><th>Role / Team</th><th>Company access</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${users.map((u) => `<tr><td><div class="user-cell"><span class="avatar" aria-hidden="true">${esc(u.name.slice(0, 1))}</span><div><strong>${esc(u.name)}</strong><span class="secondary">${esc(u.username)} · ${esc(u.email)}</span></div></div></td><td>${u.role}<span class="secondary">${u.team || "No team assignment"}${u.role === "Approver" ? " · Level " + u.approvalLevel : ""}</span></td><td><div class="access-chips">${u.groupAccess ? '<span class="access-chip">Full group</span>' : u.companies.map((c) => `<span class="access-chip">${esc(name("companies", c))}</span>`).join("")}</div></td><td>${badge(u.active ? "Active" : "Inactive")}</td><td>${rowAction("editUser", u.id, "Manage " + u.name)}</td></tr>`).join("")}</tbody></table></div>${!users.length ? empty("No matching users", "Try a different name, role or email address.") : ""}<div class="table-footer"><span>${users.length} accounts shown</span><span>Role controls actions · Company access controls visibility</span></div></section>`;
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
  }</section><section class="panel section-gap"><h2>Audit trail</h2>${state.audit
    .slice()
    .reverse()
    .map(
      (a) =>
        `<div class="activity"><div><strong>${esc(a.action)}</strong><p>${esc(a.user)} · ${date(a.at)}</p><p>${esc(a.detail)}</p></div></div>`,
    )
    .join("")}</section>`;
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
      user.role === "Requester" && user.id === o.requestedBy && !o.rejectedAt,
    m = o.amendment;
  showModal(
    "Request details",
    `${returnPaymentId ? `<div class="actions" style="margin-top:0"><button data-action="openRequest" data-id="${returnPaymentId}" data-return-payment><span aria-hidden="true">←</span>Back to Payment Request · ${esc(state.requests.find(r=>r.id===returnPaymentId).number)}</button></div>` : ""}<div class="detail-top"><div><div class="eyebrow">${esc(o.team)} · REQUEST</div><div class="detail-number">${esc(o.number)}</div></div>${o.rejectedAt ? badge("Rejected") : ""}</div><div class="detail-lead"><div><div class="eyebrow">TOTAL ORDER AMOUNT</div><div class="amount"><span>${o.currency}</span>${fmt(o.total)}</div></div><div class="lead-side"><small>Remaining to request</small><strong>${o.currency} ${fmt(remainingToRequest(state, o))}</strong><small>USD ${fmt(o.total / o.rate)} full equivalent</small></div></div><div class="actions">${owner && remainingToRequest(state, o) > 0.005 ? `<button class="primary" data-action="newPayment" data-id="${id}">Create Payment Request</button>` : ""}${owner && (!m || ["Draft", "Rejected"].includes(m.status)) ? `<button data-action="editOrder" data-id="${id}">${m?.status === "Draft" ? "Correct amendment" : "Amend request details"}</button>` : ""}${user.role === "Admin" && !o.rejectedAt ? `<button class="danger" data-action="parentReject" data-id="${id}">Reject request</button>` : ""}</div><div class="detail-grid">${detail("Company", esc(name("companies", o.companyId)))}${detail("Project", esc(name("projects", o.projectId)))}${detail("Supplier", esc(name("suppliers", o.supplierId)))}${detail("PO", esc(o.po))}${detail("Invoice", esc(o.invoice || "—"))}${detail("Requested by", esc(name("users", o.requestedBy)))}</div><p class="sub">${esc(o.description)}</p>${warnings(
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
  return `<section class="decision-panel"><h3>Proposed amendment · ${esc(m.status)}</h3><p>${esc(m.reason)}</p><div class="detail-grid">${["total", "po", "invoice", "description"].map((k) => detail(k, `<span class="secondary">${esc(o[k])}</span> → ${esc(m.data[k])}`)).join("")}</div><p>Supplier: ${esc(name("suppliers", m.data.supplierId))} · Budget: ${esc(name("budgets", m.data.budgetId))}</p>${categoryTable(m.data)}${fileList(m.data.files, "amendment", o.id)}${reviewHistory(m.history, o.team)}<p class="help">Effective details stay unchanged until final approval.</p>${review ? `<div class="actions"><button class="primary" data-action="amendApprove" data-id="${o.id}">Approve amendment</button><button data-action="amendReturn" data-id="${o.id}">Return to requester</button><button class="danger" data-action="amendReject" data-id="${o.id}">Reject amendment</button></div>` : ""}</section>`;
}
function categoryTable(o) {
  const b = state.budgets.find((b) => b.id === o.budgetId);
  return `<div class="table-wrap"><table><thead><tr><th>Budget category</th><th class="right">Order allocation ${o.currency}</th><th class="right">USD equivalent</th></tr></thead><tbody>${o.allocations.map((a) => `<tr><td>${esc(b?.categories.find((c) => c.id === a.categoryId)?.name || a.categoryId)}</td><td class="right">${fmt(a.amount)}</td><td class="right">${fmt(a.amount / o.rate)}</td></tr>`).join("")}</tbody></table></div>`;
}
function reviewHistory(history = [], team) {
  const entries = history.filter((h) => team !== "Planning" || h.stage !== "Reviewer");
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
  return versions.length ? `<details class="details-disclosure"><summary>Amendment history <span class="count">${versions.length}</span></summary>${versions.map(({m, kind, status}) => `<details class="details-disclosure"><summary>${esc(status)} · ${date(m.createdAt)}</summary><p>${esc(m.reason)}</p>${m.approvedAt ? `<p>Effective from ${date(m.approvedAt)}</p>` : ""}${amendmentDetails(o, m.previous, "Previous effective details", kind, m.id, "previous")}${amendmentDetails(o, m.data, status === "Approved" ? "Approved details" : "Proposed details", kind, m.id, "data")}${reviewHistory(m.history, o.team)}</details>`).join("")}</details>` : "";
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
  const review =
      r.status === "Reviewer"
        ? roleFor(user, r, "Reviewer")
        : r.status === "Approval 1"
          ? roleFor(user, r, "Approver", 1)
          : r.status === "Approval 2"
            ? roleFor(user, r, "Approver", 2)
            : false,
    fin =
      roleFor(user, r, "Finance") && ["Finance", "On Hold"].includes(r.status),
    draft =
      r.status === "Draft" &&
      r.requestedBy === user.id &&
      user.role === "Requester";
  const stages = [
    "Requested",
    ...(r.team === "Purchasing" ? ["Reviewer"] : []),
    "Approval 1",
    ...(r.team === "Purchasing" ? ["Approval 2"] : []),
    "Finance",
    "Paid",
  ];
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
    `<div class="detail-top"><div><div class="eyebrow">${r.team.toUpperCase()} · PAYMENT REQUEST</div><div class="detail-number">${esc(r.number)}</div></div>${badge(r.status)}</div><div class="detail-lead"><div><div class="eyebrow">REQUESTED PAYMENT · ${r.percent}% AT CREATION</div><div class="amount"><span>${r.currency || o.currency}</span>${fmt(r.amount)}</div><small>${esc(r.terms)}</small></div><div class="lead-side"><small>Full order amount</small><strong>${o.currency} ${fmt(o.total)}</strong><small>${esc(o.po)}</small></div></div><div class="detail-grid">${detail("Company", esc(name("companies", o.companyId)))}${detail("Project", esc(name("projects", o.projectId)))}${detail("Supplier", esc(name("suppliers", o.supplierId)))}${detail("Invoice", esc(o.invoice || "Not yet provided"))}${detail("Request date", r.date)}${detail("Saved exchange rate", `1 USD = ${fmt(r.rate)} ${r.currency}`)}${detail("Reserved order amount", `${o.currency} ${fmt(parentAmount(r))}`)}${detail("Requested by", esc(name("users", r.requestedBy)))}</div><h3>Approval progress</h3><div class="steps" style="--stages:${stages.length}" aria-label="Payment request approval progress">${stages
      .map((st) => {
        const ap = r.approvals.find((a) => a.stage === st);
        const current =
            r.status === st || (st === "Finance" && r.status === "On Hold"),
          done =
            !!ap ||
            st === "Requested" ||
            (st === "Paid" && r.status === "Paid") ||
            (st === "Finance" && r.status === "Paid");
        return `<div class="step ${done ? "done" : current ? "current" : ""}" ${current ? 'aria-current="step"' : ""}><span class="step-dot" aria-hidden="true"></span><strong>${st === "Reviewer" ? "Checked by" : st}</strong>${esc(ap?.by || (st === "Paid" && r.payment ? r.payment.by : current ? "Current stage" : ""))}${ap ? `<span class="secondary">${date(ap.at)}</span>` : ""}</div>`;
      })
      .join("")}</div>${warnings(state, o)
      .map((w) => `<div class="notice warn">${esc(w)}</div>`)
      .join(
        "",
      )}<div class="detail-section"><div class="section-title"><h3>Evidence & request document</h3><small>${o.files.length} supporting PDFs on main request</small></div><div class="actions" style="margin-top:0"><button data-action="document" data-id="${id}">${icon("requests")}View Payment Request</button><button data-action="openOrder" data-id="${o.id}" data-payment="${r.id}">${icon("master")}Main details & supporting</button></div></div>${draft || review || fin ? `<section class="decision-panel"><h3>${context}</h3><p>${draft ? "Review the amount and terms, then submit this payment request." : review ? "Check the supporting evidence and payment details before making your decision." : r.status === "On Hold" ? "Release the hold when the reason is resolved." : "Record the exact payment amount with its own supporting PDF."}</p><div class="actions">${draft ? `<button data-action="editPayment" data-id="${id}">Edit payment terms</button><button class="primary" data-action="submit" data-id="${id}">Submit for approval ${icon("arrow")}</button>` : ""}${review ? `<button class="primary" data-action="approve" data-id="${id}">${icon("check")}${r.status === "Reviewer" ? "Check & forward" : "Approve"}</button><button data-action="return" data-id="${id}">Return to requester</button><button class="danger" data-action="reject" data-id="${id}">Reject</button>` : ""}${fin ? `<button data-action="remark" data-id="${id}">Add remark</button>${r.status === "On Hold" ? `<button class="primary" data-action="resume" data-id="${id}">Release hold</button>` : `<button data-action="hold" data-id="${id}">${icon("hold")}Put on hold</button><button class="primary" data-action="pay" data-id="${id}">${icon("check")}Record payment</button>`}` : ""}</div></section>` : ""}${fin ? `<div class="actions"><button data-action="return" data-id="${id}">Return for correction</button><button data-action="documents" data-id="${id}">Request additional supporting</button><button class="danger" data-action="reject" data-id="${id}">Reject</button></div>` : ""}${user.role === "Admin" && canReject(user, r) ? `<div class="actions"><button class="danger" data-action="reject" data-id="${id}">Reject payment request</button></div>` : ""}${r.status === "Documents Required" ? `<div class="notice"><strong>Additional supporting required</strong><p>${esc(r.documentRequest.description)}</p></div>${r.requestedBy === user.id && user.role === "Requester" ? `<button class="primary" data-action="supply" data-id="${id}">Upload requested documents</button>` : ""}` : ""}${fileList(r.files, "request", id)}${r.payment ? `<div class="notice success"><strong>Paid ${r.currency || o.currency} ${fmt(r.payment.amount)}</strong><br>${r.payment.date} · ${r.payment.type} · ${esc(r.payment.by)}</div>${fileList(r.payment.files, "payment", id)}${user.role === "Admin" ? `<button class="danger" data-action="deletePayment" data-id="${id}">Delete Payment</button>` : ""}` : ""}${r.remarks.length ? '<div class="detail-section"><h3>Finance remarks</h3>' + r.remarks.map((m) => `<div class="notice">${esc(m.text)}<br><small>${esc(m.by)} · ${date(m.at)}</small></div>`).join("") + "</div>" : ""}<details class="details-disclosure"><summary>Budget category allocations</summary>${categoryTable(o)}</details><details class="details-disclosure"><summary>Review history <span class="count">${r.history.length}</span></summary>${r.history.length ? r.history.map((h) => `<div class="activity"><i class="dot"></i><div><strong>${esc(h.stage)} · ${esc(h.action)}</strong><p>${esc(h.by)} · ${date(h.at)}</p><p>${esc(h.reason)}</p></div></div>`).join("") : '<p class="help">No review actions recorded yet.</p>'}</details><p class="help">Each payment request is approved separately. Corrections return to the requester and restart the team approval workflow.</p>`,
  );
}
function orderForm(id) {
  const effective = id ? state.orders.find((o) => o.id === id) : null;
  const o =
    effective?.amendment?.status === "Draft"
      ? { ...effective, ...effective.amendment.data }
      : effective;
  showModal(
    o ? "Amend request" : "New Request",
    `<form data-form="order" data-id="${id || ""}"><div class="form-intro"><p>Enter the order details and its first payment request. Each payment request follows its own approval workflow.</p></div>${section("01", "Company & budget", `<div class="grid2">${field("Company", `<select name="companyId" id="formCompany" required>${opt(state.companies, o?.companyId)}</select>`)}${field("Project", `<select name="projectId" id="formProject" required>${opt(o ? state.projects.filter((p) => p.companyId === o.companyId) : [], o?.projectId)}</select>`)}${field("Approved budget", `<select name="budgetId" id="formBudget" required>${opt(o ? state.budgets.filter((b) => b.projectId === o.projectId) : [], o?.budgetId)}</select>`)}${field("Supplier", `<select name="supplierId" required>${opt(state.suppliers, o?.supplierId)}</select>`)}</div>`)}${section(
      "02",
      "Order details",
      `<div class="grid2">${field("PO number", input("po", o?.po, "text", 'required maxlength="100"'))}${field("Invoice number · optional for advance", input("invoice", o?.invoice, "text", 'maxlength="100"'))}${field(
        "Currency",
        `<select name="currency" required>${opt(
          state.currencies.map((c) => ({ ...c, name: c.id + " — " + c.name })),
          o?.currency || "USD",
        )}</select>`,
      )}${field("Full order amount", input("total", o?.total, "number", 'required min="0.01" step="0.01"'))}${field("Description", `<textarea name="description" required maxlength="3000" placeholder="Describe the goods, services or works covered by this order.">${esc(o?.description)}</textarea>`, true)}</div>`,
    )}${section("03", "Budget category allocations", `<div id="allocations">${o ? allocationInputs(o.budgetId, o.allocations) : '<div class="notice">Select an approved budget above to see its categories.</div>'}</div><div class="allocation-total"><span>Total allocated</span><span id="allocationReadout">${fmt(o?.total || 0)}</span></div><p class="help">Allocate the full amount in the selected order currency. Category totals must match the order. Budget overruns warn without blocking submission.</p>`)}${section("04", "Supporting documents", field("Supporting PDFs · combined limit 2 MB", `<input type="file" name="files" accept="application/pdf,.pdf" multiple ${o ? "" : "required"}><div class="help">${o ? "Choose whether new uploads supplement or replace existing supporting." : "Attach the order’s supporting evidence. Files belong to this main request."}</div>${o ? '<select name="fileMode" aria-label="Supporting file update"><option value="append">Add to existing documents</option><option value="replace">Replace existing documents</option></select>' : ""}`))}${o ? section("05", "Amendment reason", field("Reason", '<textarea name="reason" required></textarea>')) : section("05", "First payment request", paymentFields(null, null, true))}${footer(o ? "Submit amendment" : "Create Request", `${esc(user.team)} · Independent payment approvals.`)}</form>`,
  );
  if (o) {
    for (const name of ["companyId", "projectId", "currency"]) {
      const el = document.querySelector(`[data-form=order] [name=${name}]`);
      if (el) {
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
          `<div id="budgetCategories">${(r?.categories || [{ id: crypto.randomUUID(), name: "", amount: "" }]).map((c) => budgetRow(c)).join("")}</div><div class="actions"><button type="button" data-action="addCategory">${icon("plus")}Add category</button></div>${r ? '<div class="section-gap">' + field("Revision reason", '<textarea name="reason" required placeholder="Record why the approved budget is being revised."></textarea>') + '</div><div class="notice">The original budget and all prior revisions will be preserved.</div>' : ""}`,
        )
      : "";
  showModal(
    r ? "Edit / Revise master record" : "Add master record",
    `<form data-form="master" data-id="${id || ""}">${section("01", "Record details", `<div class="grid2">${html}</div>`)}${budget}${budgetHistory(r)}${footer("Save record", k === "suppliers" ? "Suppliers are shared across all companies." : k === "currencies" ? "USD is the base reporting currency." : "Admin-managed master data.")}</form>`,
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
      `<div class="grid2">${field("Single role", `<select name="role" id="userRole">${ROLES.map((r) => `<option value="${r}" ${u?.role === r ? "selected" : ""}>${r}</option>`).join("")}</select>`)}${field(
        "Team",
        `<select name="team" id="userTeam">${opt(
          ["Planning", "Purchasing"].map((t) => ({ id: t, name: t })),
          u?.team,
          "No team",
        )}</select><div class="help">Planning: Requester → Approver → Finance. Purchasing includes Reviewer and two approval levels.</div>`,
      )}${field("Approval level · Approver only", `<select name="approvalLevel"><option value="1">Level 1</option><option value="2" ${u?.approvalLevel === 2 ? "selected" : ""}>Level 2 · Purchasing only</option></select>`)}</div>`,
    )}${section("03", "Company access", `<div class="checks"><label class="group-access"><input name="groupAccess" type="checkbox" ${u?.groupAccess ? "checked" : ""}>Full group access</label>${state.companies.map((c) => `<label><input name="companies" type="checkbox" value="${c.id}" ${u?.companies.includes(c.id) ? "checked" : ""}>${esc(c.name)}</label>`).join("")}</div>`)}<div class="checks"><label><input name="active" type="checkbox" ${u?.active === false ? "" : "checked"}>Active account</label></div>${footer("Save user", "Mandatory 2FA is enrolled at first sign-in.")}</form>`,
  );
  syncUserRole(document.querySelector("[data-form=user]"));
}
function syncUserRole(f) {
  const planning = f.elements.team.value === "Planning",
    option = f.elements.role.querySelector('option[value="Reviewer"]');
  option.disabled = planning;
  option.hidden = planning;
  if (planning && f.elements.role.value === "Reviewer")
    f.elements.role.value = "Requester";
  f.elements.approvalLevel.querySelector('option[value="2"]').disabled =
    planning;
  if (planning) f.elements.approvalLevel.value = "1";
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
    `<form data-form="reason" data-id="${id}" data-action-type="${action}"><div class="form-intro"><p>${esc(r.number)} · ${action === "documents" ? "Describe the documents needed. The requester can upload them directly back to Finance; existing approvals stay valid." : action === "deletePayment" ? "Payment details and payment supporting PDFs will be permanently cleared. The approved request returns to Pending Payment. A reason is mandatory and remains in the audit trail." : action === "parentReject" ? "All child payment requests must be rejected first. Paid children require Admin payment deletion before rejection." : action === "return" ? "The requester can correct and resubmit. All approval stages will restart." : action === "reject" ? "Record a clear reason for rejecting this payment request." : action === "hold" ? "Explain what needs to be resolved before payment can proceed." : "Leave context for the Finance team and requester."}</p></div>${field(action === "remark" ? "Remark" : "Reason", `<textarea name="reason" required maxlength="2000" placeholder="Give the team a clear explanation and next step."></textarea>`)}${footer(action === "remark" ? "Add remark" : titles[action], "This action is recorded in the audit trail.")}</form>`,
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
    `<div class="noprint actions" style="margin-top:0;margin-bottom:20px"><button class="primary" data-action="print">Print / Save as PDF</button><button data-action="openRequest" data-id="${id}">Back to request</button></div><article class="printdoc"><div class="docbrand"><img src="/logo.svg" alt="Sun Siyam" width="94" height="75"></div><small>GROUP PROJECT MONITORING</small><h1>PAYMENT REQUEST</h1><div class="detail-top"><strong>${esc(r.number)}</strong>${badge(r.status)}</div><div class="detail-grid">${detail("Company", esc(name("companies", o.companyId)))}${detail("Project", esc(name("projects", o.projectId)))}${detail("Date", r.date)}${detail("Supplier", esc(name("suppliers", o.supplierId)))}${detail("PO number", esc(o.po))}${detail("Invoice number", esc(o.invoice || "—"))}${detail("Team", o.team)}${detail("Order currency", o.currency)}${detail("Payment currency", r.currency || o.currency)}${detail("Saved payment rate", `1 USD = ${fmt(r.rate)} ${r.currency || o.currency}`)}${detail("Approved budget", esc(name("budgets", o.budgetId)))}</div><h3>Description</h3><p>${esc(o.description)}</p>${categoryTable(o)}<table style="margin-top:18px"><tbody><tr><td>Full order amount</td><td class="right">${o.currency} ${fmt(o.total)}</td></tr><tr><td>Other instalments paid to date</td><td class="right">${o.currency} ${fmt(prior)}</td></tr><tr><td><strong>This payment request · ${r.percent}% at creation</strong></td><td class="right"><strong>${r.currency || o.currency} ${fmt(r.amount)}</strong></td></tr><tr><td>Payment terms</td><td>${esc(r.terms)}</td></tr></tbody></table><h3 style="margin-top:22px">Request & approvals · this payment request only</h3><table><thead><tr><th>Stage</th><th>Name</th><th>Date / Time</th></tr></thead><tbody><tr><td>Requested by</td><td>${esc(name("users", r.requestedBy))}</td><td>${date(r.createdAt)}</td></tr>${[...(r.team === "Purchasing" ? ["Reviewer"] : []), "Approval 1", ...(r.team === "Purchasing" ? ["Approval 2"] : [])].map((st) => `<tr><td>${st === "Reviewer" ? "Checked by" : st}</td><td>${esc(ap(st)?.by || "Pending")}</td><td>${date(ap(st)?.at)}</td></tr>`).join("")}${r.payment ? `<tr><td>Paid by</td><td>${esc(r.payment.by)}</td><td>${r.payment.date} · ${r.payment.type}</td></tr>` : ""}</tbody></table>${r.remarks.length ? '<h3 style="margin-top:22px">Finance remarks</h3>' + r.remarks.map((m) => `<p>${esc(m.text)} — ${esc(m.by)}</p>`).join("") : ""}${supportingReferences(o, r)}${reviewHistory(r.history, r.team)}<div class="docfooter">System-generated document · ${esc(r.number)} · Generated ${date(Date.now())}${demo ? " · DEMO SAMPLE — FOR TESTING ONLY" : ""}</div></article>`,
  );
}
function enrollmentOptions() {
  if (!enrollKey) return "";
  return `<section id="enrollmentOptions" class="auth-enrollment" aria-labelledby="enrollmentTitle"><h3 id="enrollmentTitle">Add your authenticator</h3><p>Choose how to add this account to your authenticator app, then enter its six-digit code below.</p><div class="actions" role="group" aria-label="Authenticator setup method"><button type="button" data-action="enrollMethod" data-method="qr" aria-pressed="${enrollMethod === "qr"}" ${enrollQr ? "" : "disabled"}>Scan QR code</button><button type="button" data-action="enrollMethod" data-method="key" aria-pressed="${enrollMethod === "key"}">Enter setup key</button></div>${enrollMethod === "qr" && enrollQr ? `<div class="auth-qr"><img src="${esc(enrollQr)}" width="280" height="280" alt="Scan this QR code with your authenticator app to add your Sun Siyam account"><p>In your authenticator app, add an account and select Scan QR code.</p></div>` : `<p>In your authenticator app, add an account with a setup key. Select a time-based code.</p><div class="secret" aria-label="Authenticator setup key">${esc(enrollKey)}</div>`}</section>`;
}
function renderLogin() {
  const reset = loginStep.startsWith("reset");
  $("#app").innerHTML =
    `<div class="login"><div class="login-art">${brand()}<div class="login-message"><div class="eyebrow">A CLEARER FINANCIAL PICTURE</div><h1>Every commitment.<br>Every payment.<br>One clear picture.</h1><p>Your workspace for project budgets, Purchasing and Planning approvals, and Finance visibility.</p><div class="login-graphic" aria-hidden="true"><div class="graphic-label">FROM PLAN TO PAYMENT</div><div class="graphic-line"><span>Approved budget</span><i style="width:100%"></i></div><div class="graphic-line"><span>Commitment</span><i style="width:72%"></i></div><div class="graphic-line"><span>Payment</span><i style="width:44%"></i></div></div></div><div class="login-foot">SUN SIYAM GROUP &nbsp; / &nbsp; PROJECT MONITORING</div></div><div class="login-panel"><div class="login-card"><div class="login-mobile-brand" style="display:none">${brand()}</div><div class="eyebrow">SECURE WORKSPACE</div><h2 id="pageTitle">${reset ? "Reset password" : loginStep === "totp" ? "Verify your identity" : "Welcome back"}</h2><p class="sub">${loginStep === "totp" ? "Enter the six-digit code from your authenticator." : reset ? "Recover access to your project workspace." : "Sign in to your project workspace."}</p><form data-form="login">${loginStep === "password" ? field("Username", input("username", "", "text", 'required autocomplete="username"')) + field("Password", input("password", "", "password", 'required autocomplete="current-password"')) : loginStep === "totp" ? `${enrollmentOptions()}${field("Authenticator code", input("code", "", "text", 'required pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code"'))}` : loginStep === "reset-start" ? field("Account email", input("email", "", "email", 'required autocomplete="email"')) : field("Email OTP", input("code", "", "text", 'required pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code"')) + field("New password", input("password", "", "password", 'required minlength="12" maxlength="256" autocomplete="new-password"'))}<button class="primary">${loginStep === "password" ? "Sign in" : loginStep === "reset-start" ? "Send email OTP" : loginStep === "reset-finish" ? "Reset password" : "Verify & continue"}${icon("arrow")}</button><div id="loginError" role="alert" class="help"></div></form><div class="actions">${loginStep === "password" ? '<button class="linkbtn" data-action="resetPassword">Forgot password?</button>' : '<button class="linkbtn" data-action="backLogin">Back to sign in</button>'}</div><div class="login-demo"><button data-action="demo">Explore demo workspace ${icon("arrow")}</button><p class="help">Sample data only. Explore the portal and test workflows without changing live records.</p></div><div class="login-security">${icon("shield")}Password + authenticator verification</div></div></div></div>`;
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
  const b = e.target.closest("button,[data-action]");
  if (!b) return;
  if (b.dataset.action) e.preventDefault();
  if (
    b.dataset.action &&
    [
      "openOrder",
      "openRequest",
      "approve",
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
      page = b.dataset.page;
      render();
      document
        .querySelector(`[data-page="${page}"]`)
        ?.focus({ preventScroll: true });
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
    if (a === "expand") {
      expanded.has(id) ? expanded.delete(id) : expanded.add(id);
      render();
      document
        .querySelector(`[data-action="expand"][data-id="${id}"]`)
        ?.focus();
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
    if (a === "clearFilters") {
      company = "";
      project = "";
      from = "";
      to = "";
      statusFilter = "";
      teamFilter = "";
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
      teamFilter = "";
      approvalOnly = false;
      financeOnly = false;
      tab = "requests";
      if (b.dataset.target === "Finance") {
        tab = "finance";
      } else if (b.dataset.target === "commitments") tab = "balance";
      else if (b.dataset.target === "inbox") tab = "inbox";
      else if (b.dataset.target === "approval") approvalOnly = true;
      render();
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
      raw = demoState();
      localStorage.setItem(storeKey, JSON.stringify(raw));
      user = raw.users[0];
      state = visibleState(raw, user);
      render();
      toast("Demo data reset");
    } else if (a === "newOrder") orderForm();
    else if (a === "editOrder") orderForm(id);
    else if (a === "openOrder") await openRecord(id, "order", b.dataset.payment);
    else if (a === "openRequest") await openRecord(id, "request");
    else if (a === "newPayment") paymentForm(id);
    else if (a === "editPayment")
      paymentForm(state.requests.find((r) => r.id === id).orderId, id);
    else if (["submit", "approve", "resume"].includes(a)) {
      await command({ type: "request." + a, id });
      requestDetail(id);
      toast(
        a === "approve"
          ? "Stage approved"
          : a === "submit"
            ? "Submitted for approval"
            : "Hold released",
      );
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
        budgetRow({ id: crypto.randomUUID(), name: "", amount: "" }),
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
  const t = e.target;
  try {
    if (t.id === "sortOrder") {
      sortOrder = t.value;
      render();
      $("#sortOrder")?.focus();
      return;
    }
    if (t.id === "actor") {
      await closeModal();
      user = raw.users.find((u) => u.id === t.value);
      sessionStorage.setItem("demo-actor", user.id);
      state = visibleState(raw, user);
      if (!["dashboard", "requests"].includes(page) && user.role !== "Admin")
        page = "dashboard";
      company = "";
      project = "";
      render();
    } else if (
      [
        "company",
        "project",
        "from",
        "to",
        "statusFilter",
        "teamFilter",
      ].includes(t.id)
    ) {
      if (t.id === "company") {
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
      if (t.id === "teamFilter") teamFilter = t.value;
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
    } else if (t.id === "userTeam" || t.id === "userRole") {
      syncUserRole(t.form);
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
  if (e.target.id === "masterSearch" || e.target.id === "userSearch") {
    const id = e.target.id,
      pos = e.target.selectionStart;
    if (id === "masterSearch") masterSearch = e.target.value;
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
      d.team = user.team;
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
          ? "Amendment submitted for approval"
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
