// @vitest-environment happy-dom
// UI regression suite for the React app, ported from the legacy node:test suite. Every test
// case and assertion is kept; only the mechanics changed: the app is rendered with React in
// Vitest's happy-dom window, events and waits run inside act(), and controlled text inputs
// are typed into through the native value setter (as a browser does).
import { test } from "vitest";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL as NodeURL } from "node:url";
import { Window } from "happy-dom";
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import * as domain from "../src/domain/domain.js";
import { demoState } from "../src/domain/demo.js";
import * as imports from "../src/domain/import-data.js";
import ExcelJS from "exceljs";
import { App } from "../src/App.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// happy-dom does not know the customizable-select <selectedcontent> element; React reports it once.
const consoleError = console.error;
console.error = (...args) => {
  if (String(args[0]).includes("is unrecognized in this browser") && args.includes("selectedcontent")) return;
  consoleError(...args);
};

// public/theme.js is a classic script that owns the appearance preference; it runs once for
// this file, and each test starts from the System preference with empty storage.
(0, eval)(await readFile(new NodeURL("../public/theme.js", import.meta.url), "utf8"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Two act() passes: a state change renders and runs its effects when act() exits, and a toast
// then needs a further pass (Sonner renders it from a timer).
const flush = async () => { await act(() => sleep(20)); await act(() => sleep(20)); };
const wait = (ms) => act(() => sleep(ms));

async function app(seed, handleFetch, { withoutRandomUUID = false, keepUrl = false, width = 1280, reload = false } = {}) {
  // The layout follows the window width (the sidebar becomes a drawer below 768px).
  window.happyDOM.setViewport({ width, height: 900 });
  document.body.innerHTML =
    '<div id="app"></div>';
  // reload: a browser refresh, which keeps this tab's storage and URL.
  if (!reload) {
    localStorage.clear();
    sessionStorage.clear();
  }
  // Every test starts on a fresh URL: no page from an earlier test in the history entry.
  if (!keepUrl && !reload) history.replaceState(null, "", location.href.split("#")[0]);
  window.dispatchEvent(new StorageEvent("storage", { key: null }));
  const restore = { fetch: window.fetch, createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL };
  if (withoutRandomUUID) Object.defineProperty(window.crypto, "randomUUID", { value: undefined, configurable: true });
  if (seed) localStorage.setItem("ss-project-monitoring-demo-v1", JSON.stringify(seed));
  window.fetch = handleFetch || (async () => ({ ok: true, json: async () => ({ configured: false }) }));
  const root = createRoot(document.getElementById("app"));
  await act(async () => root.render(<StrictMode><App /></StrictMode>));
  await flush();
  const close = () => {
    act(() => root.unmount());
    if (withoutRandomUUID) delete window.crypto.randomUUID;
    window.fetch = restore.fetch;
    URL.createObjectURL = restore.createObjectURL;
    URL.revokeObjectURL = restore.revokeObjectURL;
  };
  // The tests address the window as `w`, as the legacy suite did with its own happy-dom Window.
  return new Proxy(window, {
    get(target, key) {
      if (key === "close") return close;
      if (key === "happyDOM") return { abort: async () => {} };
      const value = Reflect.get(target, key);
      return typeof value === "function" && !/^[A-Z]/.test(String(key)) ? value.bind(target) : value;
    },
  });
}
const click = (w, s) => {
  const el = typeof s === "string" ? w.document.querySelector(s) : s;
  assert.ok(el, "Missing " + s);
  // A pointer click: mousedown first (Radix Tabs switch on mousedown), then click.
  act(() => {
    el.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    el.click();
  });
};
const fire = (el, event) => act(() => { el.dispatchEvent(event); });
// Picks an option in a shadcn Select as a keyboard user does: Enter opens the list, then the
// option (each carries its value as data-value; "" is a clearable Select's blank choice).
const choose = (w, s, value) => {
  const el = typeof s === "string" ? w.document.querySelector(s) : s;
  assert.ok(el, "Missing " + s);
  assert.equal(el.dataset.slot, "select-trigger", "Not a select: " + s);
  act(() => { el.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
  const option = w.document.querySelector(`[role=option][data-value="${value}"]`);
  assert.ok(option, `No option ${value} for ${s}: ` + [...w.document.querySelectorAll("[role=option]")].map((o) => o.dataset.value));
  act(() => option.click());
};
// A Select's options as [value, label] pairs: opens the list, reads it and closes it again.
const optionsOf = (w, s) => {
  const el = typeof s === "string" ? w.document.querySelector(s) : s;
  assert.ok(el, "Missing " + s);
  act(() => { el.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
  const list = [...w.document.querySelectorAll("[role=option]")].map((o) => [o.dataset.value, o.textContent]);
  act(() => { w.document.activeElement.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
  return list;
};
// The sidebar navigation (shadcn Sidebar; on phones the same menu opens in a Sheet).
const NAV = "[data-sidebar=menu-button][data-page]";
// The text of the toasts on screen (Sonner).
const toastText = (w) => [...w.document.querySelectorAll("[data-sonner-toast]")].map((t) => t.textContent).join(" ");
// The workspace dialog is open while its content (#modal) is mounted.
const modalOpen = (w) => Boolean(w.document.querySelector("#modal"));
// Signs out through the account menu (a shadcn DropdownMenu).
const signOut = async (w) => {
  fire(w.document.querySelector(".profile-menu"), new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await flush();
  click(w, "[data-action=logout]");
  await flush();
};
// Types into an input as a browser does (React tracks values set through the element's own setter).
const type = (w, el, value) => {
  Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value").set.call(el, value);
  fire(el, new w.Event("input", { bubbles: true }));
};
test("First sign-in offers QR or manual key without resetting the challenge or entered code", async () => {
  const key = "JBSWY3DPEHPK3PXP";
  const qr = "data:image/png;base64,iVBORw0KGgo=";
  const calls = [];
  const w = await app(null, async (url, options) => {
    const action = new URL(url, "http://localhost:3000").searchParams.get("action");
    calls.push({ action, body: options?.body && JSON.parse(options.body) });
    return { ok: true, json: async () => action === "login"
      ? { challenge: "fictional-enrollment-challenge", enroll: true, secret: key, qrCode: qr }
      : action === "verify" ? { error: "Invalid authenticator code" } : { configured: false } };
  });
  try {
    w.document.querySelector('[name="username"]').value = "fictional-user";
    w.document.querySelector('[name="password"]').value = "FictionalPassword123";
    fire(w.document.querySelector('[data-form="login"]'), new w.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    assert.equal(w.document.querySelector(".auth-qr img").src, qr);
    assert.equal(w.document.querySelector('[data-method="qr"]').getAttribute("aria-pressed"), "true");
    assert.equal(w.document.querySelector(".secret"), null);
    w.document.querySelector('[name="code"]').value = "123456";
    click(w, '[data-method="key"]');
    assert.equal(w.document.querySelector(".secret").textContent, key);
    assert.equal(w.document.querySelector(".auth-qr"), null);
    assert.equal(w.document.querySelector('[name="code"]').value, "123456");
    click(w, '[data-method="qr"]');
    assert.equal(w.document.querySelector('[name="code"]').value, "123456");
    assert.equal(calls.filter((c) => c.action === "login").length, 1);
    click(w, '[data-action="backLogin"]');
    assert.equal(w.document.querySelector("#enrollmentOptions"), null);
    assert.equal(w.document.querySelector(".auth-qr"), null);
    assert.ok(!w.document.body.textContent.includes(key));
    assert.equal(w.localStorage.length, 0);
  } finally { w.close(); await w.happyDOM.abort(); }
});

test("Existing enrolled accounts do not show an enrollment key or QR code", async () => {
  const w = await app(null, async (url) => ({ ok: true, json: async () => url.includes("action=login") ? { challenge: "existing-account-challenge" } : { configured: false } }));
  try {
    w.document.querySelector('[name="username"]').value = "fictional-user";
    w.document.querySelector('[name="password"]').value = "FictionalPassword123";
    fire(w.document.querySelector('[data-form="login"]'), new w.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    assert.equal(w.document.querySelector("#pageTitle").textContent, "Verify your identity");
    assert.equal(w.document.querySelector("#enrollmentOptions"), null);
    assert.ok(w.document.querySelector('[name="code"]'));
  } finally { w.close(); await w.happyDOM.abort(); }
});
test("Printed requests include supporting references, prior decisions and the Finance submission", async () => {
  const seed = demoState(), o = seed.orders[0], r = seed.requests[0];
  o.files[0].name = "order-evidence.pdf";
  r.files = [{ ...o.files[0], name: "additional-evidence.pdf" }];
  r.payment.files = [{ ...r.payment.files[0], name: "settlement-evidence.pdf" }];
  r.history = [
    { stage: "Finance", action: "return", by: "Finance Officer", at: r.createdAt, reason: "Correct <terms>" },
  ];
  const w = await app(seed);
  try {
    click(w, "[data-action=demo]");
    click(w, "[data-page=requests]");
    click(w, "[data-action=expand][data-id=o1]");
    click(w, "[data-action=openRequest][data-id=r0]");
    await flush();
    click(w, "[data-action=document]");
    const print = w.document.querySelector(".printdoc");
    for (const label of ["order-evidence.pdf", "additional-evidence.pdf", "settlement-evidence.pdf", "Review history", "Correct <terms>", "Submitted to Finance", o.number])
      assert.ok(print.textContent.includes(label), label);
    assert.equal(print.querySelector("terms"), null);
    assert.doesNotMatch(print.textContent, /Team|Checked by|Approval 2/);
  } finally { w.close(); await w.happyDOM.abort(); }
});

test("Budget history uses each version's saved currency and exchange rate", async () => {
  const seed = demoState();
  seed.currencies.find((c) => c.id === "MVR").rate = 20;
  seed.budgets[0].revisions = [
    { at: "2026-10-01T08:00:00Z", by: "Administrator", reason: "MVR baseline", currency: "MVR", rate: 15.42, categories: [{ id: "civil0", name: "Civil", amount: 15420 }] },
    { at: "2026-09-01T08:00:00Z", by: "Administrator", reason: "Legacy USD baseline", categories: [{ id: "civil0", name: "Civil", amount: 500 }] },
  ];
  const w = await app(seed);
  try {
    click(w, "[data-action=demo]"); click(w, "[data-page=master]");
    click(w, "[data-master=budgets]"); click(w, "[data-action=editMaster][data-id=b0]");
    const history = w.document.querySelector(".details-disclosure");
    assert.match(history.textContent, /MVR 15,420\.00/);
    assert.match(history.textContent, /USD 1,000\.00/);
    assert.match(history.textContent, /1 USD = 15\.42 MVR/);
    assert.doesNotMatch(history.textContent, /USD 15,420\.00/);
    assert.match(history.textContent, /USD 500\.00/);
  } finally { w.close(); await w.happyDOM.abort(); }
});

test("Amendment history exposes complete versions, attempts and archived document downloads", async () => {
  const seed = demoState(), o = seed.orders[0];
  const previous = structuredClone(o), data = { ...structuredClone(o), po: "UPDATED-PO", description: "Approved updated scope" };
  previous.files[0].name = "previous-support.pdf";
  data.files[0].name = "approved-support.pdf";
  const history = [{ stage: "Approval 1", action: "return", by: "First approver", at: o.createdAt, reason: "Clarify scope" }];
  o.amendments = [{ id: "approved-version", createdAt: o.createdAt, approvedAt: "2026-10-20T08:00:00Z", previous, data, reason: "Approved variation", history }];
  o.amendmentAttempts = [{ id: "returned-version", createdAt: o.createdAt, status: "Draft", previous, data: { ...data, description: "Returned proposal" }, reason: "Initial proposal", history }];
  const w = await app(seed);
  try {
    click(w, "[data-action=demo]"); click(w, "[data-page=requests]");
    click(w, "[data-action=openOrder][data-id=o1]"); await flush();
    const text = w.document.querySelector("#modal").textContent;
    for (const label of ["Previous effective details", "Approved details", "UPDATED-PO", "Approved updated scope", "Returned for correction", "Returned proposal", "Clarify scope", "previous-support.pdf", "approved-support.pdf"])
      assert.ok(text.includes(label), label);
    const button = w.document.querySelector('[data-kind="amendment-history"][data-side="previous"]');
    assert.equal(button.dataset.version, "approved-version");
    let downloaded;
    w.URL.createObjectURL = (blob) => { downloaded = blob; return "blob:test-history"; };
    w.URL.revokeObjectURL = () => {};
    click(w, button); await flush();
    assert.ok(downloaded, toastText(w));
    assert.equal(downloaded.type, "application/pdf");
    assert.equal(await downloaded.text(), Buffer.from(previous.files[0].data, "base64").toString());
    const saved = JSON.parse(w.localStorage.getItem("ss-project-monitoring-demo-v1"));
    assert.equal(saved.orders[0].amendments[0].previous.po, previous.po);
  } finally { w.close(); await w.happyDOM.abort(); }
});
test("All five pages and document render, scoped role switching works", async () => {
  const w = await app();
  assert.match(w.document.body.textContent, /Welcome back/);
  click(w, "[data-action=demo]");
  assert.match(w.document.body.textContent, /Project dashboard/);
  assert.deepEqual([...w.document.querySelectorAll('.budget-kpis h2')].map(x=>x.textContent), ['Total Approved Budget','Budget Utilized','Available Budget']);
  assert.deepEqual([...w.document.querySelectorAll('.payment-overview h3')].map(x=>x.textContent), ['Paid','Outstanding Payments','On Hold','Balance Payments Pending']);
  // REVIEW-1 (amended): tiles add only a year-to-date trend chart, no other text.
  assert.equal(w.document.querySelectorAll('.dashboard-kpis p,.dashboard-kpis small').length, 0);
  // One main card: three figures above one area chart; payment columns split into the four buckets.
  assert.equal(w.document.querySelectorAll('.budget-overview .dashboard-kpi').length, 3);
  assert.equal(w.document.querySelectorAll('.budget-overview .kpi-trend-overview').length, 1);
  assert.match(w.document.querySelector('.kpi-trend-overview').getAttribute('aria-label'), /approved budget USD .+; utilized USD .+; available USD .+/);
  assert.equal(w.document.querySelectorAll('.payment-overview .kpi-trend-payments').length, 1);
  // Both charts (shadcn Charts) plot the same months.
  const months = Number(w.document.querySelector('.budget-overview .kpi-trend-overview').dataset.months);
  assert.ok(months > 0);
  assert.equal(Number(w.document.querySelector('.payment-overview .kpi-trend-payments').dataset.months), months);
  assert.match(w.document.querySelector('.kpi-trend-payments').getAttribute('aria-label'), /Paid USD .+; Outstanding Payments USD .+; On Hold USD .+; Balance Payments Pending USD .+/);
  // Shortcuts: Finance payments and Projects (My Actions is no longer a shortcut).
  assert.ok(w.document.querySelector('.kpi-side > .workspace-actions [data-target=Finance]'));
  assert.ok(w.document.querySelector('.kpi-side > .workspace-actions [data-page=projects]'));
  assert.equal(w.document.querySelector('.kpi-side > .workspace-actions [data-target=inbox]'), null);
  for (const page of ["projects", "requests", "master", "users", "audit", "deleted", "settings", "dashboard"]) {
    click(w, "[data-page=" + page + "]");
    assert.ok(w.document.querySelector(".content").textContent.length > 100);
  }
  click(w, "[data-page=requests]");
  click(w, "[data-action=expand]");
  click(w, "[data-action=openRequest]");
  await flush();
  assert.match(
    w.document.querySelector("#modal").textContent +
      " TOAST: " +
      toastText(w),
    /PR-2026/,
  );
  click(w, "[data-action=document]");
  assert.ok(w.document.querySelector(".printdoc"));
  assert.match(
    w.document.querySelector(".printdoc").textContent,
    /This payment request/,
  );
  click(w, "[data-action=close]");
  await flush();
  choose(w, "#actor", "viewer");
  await flush();
  assert.deepEqual([...w.document.querySelectorAll(NAV)].map((b) => b.dataset.page), ["dashboard", "projects", "budgets", "requests"]);
  // Planning works on project tasks only: Projects is its only page.
  choose(w, "#actor", "planner");
  await flush();
  assert.deepEqual([...w.document.querySelectorAll(NAV)].map((b) => b.dataset.page), ["projects"]);
  assert.equal(w.document.querySelector("#pageTitle").textContent, "Projects");
  choose(w, "#actor", "fin");
  await flush();
  assert.deepEqual([...w.document.querySelectorAll(NAV)].map((b) => b.dataset.page), ["dashboard", "projects", "budgets", "requests", "master", "audit"]);
  click(w, "[data-page=dashboard]");
  assert.match(w.document.body.textContent, /All/);
  choose(w, "#actor", "req0");
  await flush();
  assert.ok(
    !optionsOf(w, "#company").some(([, label]) => label.includes("Siyam World")),
  );
  w.close();
  await w.happyDOM.abort();
});
test("Requester forms populate dependent project, budget, category and instalment fields", async () => {
  const w = await app();
  click(w, "[data-action=demo]");
  choose(w, "#actor", "req0");
  await flush();
  click(w, "[data-page=requests]");
  click(w, "[data-action=newOrder]");
  choose(w, "#formCompany", "c1");
  assert.match(
    w.document.querySelector("[name=projectId]").textContent,
    /Tropical/,
  );
  choose(w, "#formProject", "p1");
  choose(w, "#formBudget", "b0");
  assert.equal(w.document.querySelectorAll("#allocations input").length, 3);
  click(w, "[data-action=close]");
  await flush();
  click(w, "[data-tab=requests]");
  click(w, "[data-action=openOrder][data-id=o1]");
  await flush();
  click(w, "[data-action=newPayment]");
  const percent = w.document.querySelector("#paymentPercent");
  percent.value = "20";
  fire(percent, new w.Event("input", { bubbles: true }));
  assert.equal(w.document.querySelector("#paymentAmount").value, "84000");
  w.close();
  await w.happyDOM.abort();
});
const actor = async (w, id) => {
  choose(w, "#actor", id);
  await flush();
};
// Sets a field: a shadcn Select by choosing the option, any other control by value + change.
const change = (w, id, value) => {
  const el = w.document.getElementById(id);
  if (el?.dataset.slot === "select-trigger") return choose(w, el, value);
  el.value = value;
  fire(el, new w.Event("change", { bubbles: true }));
};
const submit = (w, form) =>
  fire(w.document.querySelector(form), new w.Event("submit", { bubbles: true, cancelable: true }));
test("Filter disclosure, grouped Finance queue, sorting and search reflect real records", async () => {
  // Uses the fixed sample without the demo's year of history, so counts and order are exact.
  const w = await app(demoState());
  try {
    click(w, "[data-action=demo]");
    click(w, "[data-action=queue][data-target=Finance]");
    assert.match(w.document.body.textContent, /Finance/);
    assert.equal(w.document.querySelectorAll(".work-table tbody tr").length, 3);
    click(w, "[data-tab=requests]");
    click(w, "[data-tab=finance]");
    assert.equal(w.document.querySelectorAll(".work-table tbody tr").length, 3);
    assert.ok(w.document.querySelector("#extraFilters").hidden);
    click(w, "[data-action=toggleFilters]");
    assert.equal(
      w.document
        .querySelector("[data-action=toggleFilters]")
        .getAttribute("aria-expanded"),
      "true",
    );
    assert.equal(w.document.querySelector("#extraFilters").hidden, false);
    change(w, "statusFilter", "Paid");
    assert.equal(w.document.querySelectorAll(".work-table tbody tr").length, 1);
    click(w, "[data-action=clearFilters]");
    change(w, "sortOrder", "date-asc");
    assert.match(
      w.document.querySelector(".work-table tbody tr").textContent,
      /PR-2026-000001/,
    );
    change(w, "sortOrder", "amount-desc");
    assert.deepEqual(
      [
        ...w.document.querySelectorAll(
          '.work-table tbody tr [data-label=\"Payment request\"] strong',
        ),
      ].map((x) => x.textContent),
      ["PR-2026-000001", "PR-2026-000003", "PR-2026-000002"],
    );
    const search = w.document.querySelector("#search");
    type(w, search, "not-a-real-supplier");
    assert.match(
      w.document.querySelector(".empty").textContent,
      /Nothing in this view/,
    );
    assert.equal(w.document.activeElement.id, "search");
  } finally {
    w.close();
    await w.happyDOM.abort();
  }
});
test("Every master form, user form and login state has persistent accessible labels", async () => {
  const w = await app();
  try {
    click(w, "[data-action=demo]");
    click(w, "[data-page=master]");
    for (const master of [
      "companies",
      "projects",
      "budgets",
      "suppliers",
      "currencies",
    ]) {
      click(w, "[data-master=" + master + "]");
      click(w, "[data-action=newMaster]");
      assert.equal(
        w.document.querySelector("#modal").getAttribute("aria-labelledby"),
        "modalTitle",
      );
      for (const control of w.document.querySelectorAll(
        "#modal input:not([aria-hidden=true]),#modal textarea,#modal [data-slot=select-trigger],#modal [role=checkbox]",
      ))
        assert.ok(
          control.labels.length || control.getAttribute("aria-label"),
          control.outerHTML,
        );
      click(w, "[data-action=close]");
      await flush();
    }
    click(w, "[data-page=users]");
    click(w, "[data-action=newUser]");
    assert.equal(w.document.querySelectorAll(".form-section").length, 3);
    assert.ok(w.document.querySelector("[name=password]").labels.length);
    click(w, "[data-action=close]");
    await flush();
    // The audit log has its own admin page; Settings no longer lists it.
    click(w, "[data-sidebar=menu-button][data-page=audit]");
    assert.equal(w.document.querySelector("#pageTitle").textContent, "Audit Log");
    const auditRows = () => w.document.querySelectorAll(".audit-table tbody tr").length;
    assert.ok(auditRows() > 0 && auditRows() <= 20);
    const auditUsers = optionsOf(w, "#auditUser").map(([v]) => v).filter(Boolean);
    assert.ok(auditUsers.length);
    change(w, "auditUser", auditUsers[0]);
    assert.ok([...w.document.querySelectorAll(".audit-table tbody tr td:nth-child(3)")].every((td) => td.textContent === auditUsers[0]));
    click(w, "[data-action=auditClear]");
    if (w.document.querySelector("[data-action=auditGo][data-n='2']")) {
      click(w, "[data-action=auditGo][data-n='2']");
      assert.equal(w.document.querySelector(".pager .current").textContent, "2");
    }
    assert.ok(w.document.querySelector("#auditSearch").getAttribute("aria-label"));
    click(w, "[data-sidebar=menu-button][data-page=settings]");
    assert.doesNotMatch(w.document.querySelector(".content").textContent, /Audit trail/);
    await signOut(w);
    click(w, "[data-action=resetPassword]");
    assert.match(w.document.querySelector("h2").textContent, /Reset password/);
    assert.ok(w.document.querySelector("[name=email]").labels.length);
    click(w, "[data-action=backLogin]");
    assert.ok(w.document.querySelector("[name=username]").labels.length);
    assert.ok(
      w.document.querySelector("#loginError").getAttribute("role") === "alert",
    );
  } finally {
    w.close();
    await w.happyDOM.abort();
  }
});
test("Submitting goes straight to Finance, and a Finance return goes back to the requester", async () => {
  const seed = demoState();
  seed.requests[0].status = "Draft";
  seed.requests[0].approvals = [];
  delete seed.requests[0].finalApprovedAt;
  delete seed.requests[0].payment;
  delete seed.orders[0].committedAt;
  const w = await app(seed);
  try {
    click(w, "[data-action=demo]");
    await actor(w, "req0");
    click(w, "[data-page=requests]");
    click(w, "[data-tab=inbox]");
    var expand = w.document.querySelector(`[data-action=expand][data-id="${seed.requests[0].orderId}"][aria-expanded="false"]`);
    if (expand) click(w, expand);
    click(w, "[data-action=openRequest][data-id=r0]");
    await flush();
    assert.match(w.document.querySelector("[data-action=submit]").textContent, /Submit to Finance/);
    click(w, "[data-action=submit]");
    await flush();
    assert.equal(w.document.querySelector("[aria-current=step] strong").textContent, "Finance");
    assert.equal(w.document.querySelector("[data-action=approve]"), null);
    click(w, "[data-action=close]");
    await flush();
    await actor(w, "fin");
    click(w, "[data-tab=finance]");
    click(w, "[data-action=openRequest][data-id=r0]");
    await flush();
    assert.ok(w.document.querySelector("[data-action=pay]"));
    click(w, "[data-action=return]");
    w.document.querySelector("[name=reason]").value = "Clarify the advance terms";
    submit(w, "[data-form=reason]");
    await flush();
    assert.match(w.document.querySelector("#modal").textContent, /Draft/);
    const saved = JSON.parse(w.localStorage.getItem("ss-project-monitoring-demo-v1"));
    assert.equal(saved.requests[0].status, "Draft");
    assert.equal(saved.requests[0].history.at(-1).reason, "Clarify the advance terms");
    // Correcting the returned request sends it back to Finance in the same step.
    click(w, "[data-action=close]");
    await flush();
    await actor(w, "req0");
    click(w, "[data-tab=inbox]");
    const again = w.document.querySelector(`[data-action=expand][data-id="${seed.requests[0].orderId}"][aria-expanded="false"]`);
    if (again) click(w, again);
    click(w, "[data-action=openRequest][data-id=r0]");
    await flush();
    click(w, "[data-action=editPayment]");
    assert.match(w.document.querySelector("[data-form=payment] .form-footer").textContent, /Submit to Finance/);
    submit(w, "[data-form=payment]");
    await flush();
    const resent = JSON.parse(w.localStorage.getItem("ss-project-monitoring-demo-v1"));
    assert.equal(resent.requests[0].status, "Finance", toastText(w));
    assert.match(toastText(w), /sent to Finance/);
  } finally {
    w.close();
    await w.happyDOM.abort();
  }
});

test("Validation errors remain inside the form and submitted draft details are not editable", async () => {
  const seed = demoState();
  seed.requests[0].status = "Draft";
  seed.requests[0].approvals = [];
  delete seed.requests[0].payment;
  const w = await app(seed);
  try {
    click(w, "[data-action=demo]");
    await actor(w, "req0");
    click(w, "[data-page=requests]");
    click(w, "[data-tab=inbox]");
    var expand = w.document.querySelector(
      `[data-action=expand][data-id="${seed.requests[0].orderId}"][aria-expanded="false"]`,
    );
    if (expand) click(w, expand);
    click(w, `[data-action=openRequest][data-id="${seed.requests[0].id}"]`);
    await flush();
    click(w, "[data-action=editPayment]");
    const percent = w.document.querySelector("#paymentPercent");
    percent.value = "110";
    fire(percent, new w.Event("input", { bubbles: true }));
    submit(w, "[data-form=payment]");
    await flush();
    const error = w.document.querySelector(".form-error");
    assert.equal(error.hidden, false);
    assert.match(error.textContent, /percentage|between/);
    assert.equal(w.document.activeElement, error);
    click(w, "[data-action=close]");
    await flush();
    click(w, "[data-tab=requests]");
    const exp = w.document.querySelector(
      '[data-action=expand][data-id=o1][aria-expanded="false"]',
    );
    if (exp) click(w, exp);
    const r0 = w.document.querySelector(
      "[data-action=openRequest][data-id=r0]",
    );
    click(w, r0);
    await flush();
    click(w, "[data-action=submit]");
    await flush();
    assert.equal(w.document.querySelector("[data-action=editPayment]"), null);
    assert.equal(w.document.querySelector("[data-action=approve]"), null);
  } finally {
    w.close();
    await w.happyDOM.abort();
  }
});
test("Tables expose regions, column headers and mobile labels; navigation exposes current page", async () => {
  const w = await app();
  try {
    click(w, "[data-action=demo]");
    assert.equal(
      w.document
        .querySelector("[data-page=dashboard]")
        .getAttribute("aria-current"),
      "page",
    );
    click(w, "[data-page=requests]");
    assert.equal(
      w.document
        .querySelector("[data-page=requests]")
        .getAttribute("aria-current"),
      "page",
    );
    assert.equal(w.document.activeElement.dataset.page, "requests");
    const region = w.document.querySelector(".table-wrap");
    assert.equal(region.getAttribute("role"), "region");
    assert.equal(region.tabIndex, 0);
    assert.ok(region.getAttribute("aria-label"));
    for (const th of w.document.querySelectorAll("th"))
      assert.equal(th.scope, "col");
    for (const td of w.document.querySelectorAll(
      ".work-table tr td:not(:last-child)",
    ))
      assert.ok(td.dataset.label);
    for (const action of w.document.querySelectorAll(".row-action"))
      assert.ok(action.getAttribute("aria-label"));
    assert.equal(
      w.document
        .querySelector(".tabs button.active")
        .getAttribute("aria-pressed"),
      "true",
    );
  } finally {
    w.close();
    await w.happyDOM.abort();
  }
});
test("Responsive layout: the sidebar becomes a drawer on phones; tables, form grids and filters carry their phone layouts", async () => {
  for (const width of [1440, 1024, 768, 390]) {
    const w = await app(null, null, { width });
    try {
      click(w, "[data-action=demo]");
      // Below 768px the shadcn Sidebar is not rendered in the page; the menu button opens it in a drawer.
      assert.equal(Boolean(w.document.querySelector("[data-slot=sidebar-container]")), width >= 768, "sidebar at " + width);
      assert.equal(Boolean(w.document.querySelector("[data-mobile=true]")), false);
      if (width < 768) { click(w, "[data-action=openNavigation]"); await flush(); }
      click(w, "[data-page=requests]");
      await flush();
      // Work tables turn each row into a card on phones (Tailwind max-sm variants).
      const table = w.document.querySelector(".work-table");
      for (const name of ["max-sm:block", "max-sm:[&_thead]:hidden", "max-sm:[&_tr.children-row>td]:static"]) assert.ok(table.classList.contains(name), name);
      // Advanced filters start collapsed.
      assert.equal(w.document.querySelector("[data-action=toggleFilters]").getAttribute("aria-expanded"), "false");
      assert.ok(!w.document.querySelector(".advanced-filters") || w.document.querySelector(".advanced-filters").hidden);
      click(w, "[data-action=newOrder]");
      const grid = w.document.querySelector("#modal .grid2");
      assert.ok(grid.classList.contains("grid-cols-1") && grid.classList.contains("sm:grid-cols-2"));
    } finally {
      w.close();
    }
  }
});
test("Core text and primary controls meet WCAG AA contrast against their surfaces in both themes", async () => {
  // Theme tokens from globals.css: :root (light) and [data-theme="dark"], which overrides it.
  const css = await readFile(new NodeURL("../src/styles/globals.css", import.meta.url), "utf8");
  const block = (selector) => Object.fromEntries([...css.slice(css.indexOf(selector + " {")).split("}")[0].matchAll(/--([a-z0-9-]+):\s*(#[a-fA-F0-9]{3,6})\b/g)].map((m) => [m[1], m[2]]));
  const light = block(":root"), dark = { ...light, ...block('[data-theme="dark"]') };
  const lum = (h) => {
    if (h.length === 4) h = "#" + [...h.slice(1)].map((c) => c + c).join("");
    const c = h
      .slice(1)
      .match(/../g)
      .map((x) => parseInt(x, 16) / 255)
      .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  };
  const contrast = (a, b) =>
    (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const pairs = [
    ["foreground", "background"], ["foreground", "card"], ["foreground", "popover"],
    ["muted-foreground", "background"], ["muted-foreground", "card"], ["muted-foreground", "muted"],
    ["link", "card"], ["link", "soft"], ["soft-foreground", "soft"],
    ["primary-foreground", "primary"], ["primary-foreground", "primary-hover"],
    ["sidebar-foreground", "sidebar"], ["sidebar-muted", "sidebar"], ["sidebar-foreground", "sidebar-accent"],
    ["sidebar-primary-foreground", "sidebar-primary"],
    ["chip-foreground", "chip-green"], ["chip-foreground", "chip-blue"], ["chip-foreground", "chip-amber"], ["chip-foreground", "chip-red"],
    ["chip-grey-foreground", "chip-grey"],
    ["danger", "danger-soft"], ["warning", "warning-soft"], ["success", "success-soft"], ["info", "info-soft"],
    ["destructive", "card"],
  ];
  for (const [theme, tokens] of [["light", light], ["dark", dark]])
    for (const [fg, bg] of pairs) {
      assert.ok(tokens[fg] && tokens[bg], `${theme}: ${fg} / ${bg} defined`);
      assert.ok(contrast(tokens[fg], tokens[bg]) >= 4.5, `${theme}: ${fg} ${tokens[fg]} on ${bg} ${tokens[bg]}`);
    }
  // Keyboard focus rings stand out from the surfaces they sit on.
  for (const tokens of [light, dark]) assert.ok(contrast(tokens.ring, tokens.card) >= 3, "focus ring");
});

test("Four tabs use contextual creation and new request percent/amount/currency inputs work both ways", async () => {
  const w = await app();
  try {
    click(w, "[data-action=demo]");
    await actor(w, "req0");
    click(w, "[data-page=requests]");
    assert.deepEqual(
      [...w.document.querySelectorAll("[data-tab]")].map((x) => x.dataset.tab),
      ["requests", "finance", "balance", "inbox"],
    );
    for (const tab of ["finance", "balance", "inbox"]) {
      click(w, "[data-tab=" + tab + "]");
      assert.equal(w.document.querySelector("[data-action=newOrder]"), null);
    }
    click(w, "[data-tab=requests]");
    click(w, "[data-action=newOrder]");
    const f = w.document.querySelector("[data-form=order]");
    f.elements.total.value = "100000";
    const p = f.querySelector("#paymentPercent"),
      a = f.querySelector("#paymentAmount");
    p.value = "30";
    fire(p, new w.Event("input", { bubbles: true }));
    assert.equal(a.value, "30000");
    change(w, "paymentCurrency", "MVR");
    assert.equal(a.value, "462600");
    a.value = "771000";
    fire(a, new w.Event("input", { bubbles: true }));
    assert.equal(p.value, "50");
    assert.equal(f.elements.firstdate.value, domain.today());
  } finally {
    w.close();
    await w.happyDOM.abort();
  }
});
test("Date fields show and accept DD/MM/YYYY and submit YYYY-MM-DD", async () => {
  const w = await app();
  try {
    click(w, "[data-action=demo]");
    await actor(w, "req0");
    click(w, "[data-page=requests]");
    click(w, "[data-action=newOrder]");
    const f = w.document.querySelector("[data-form=order]");
    const hidden = f.elements.firstdate, shown = f.querySelector(".date-input input");
    const [y, m, d] = domain.today().split("-");
    assert.equal(shown.value, `${d}/${m}/${y}`);
    const enter = (v) => type(w, shown, v);
    enter("3/4/2026");
    assert.equal(hidden.value, "2026-04-03");
    assert.equal(shown.validationMessage, "");
    enter("31/02/2026");
    assert.equal(hidden.value, "2026-04-03");
    assert.match(shown.validationMessage, /DD\/MM\/YYYY/);
    enter("");
    assert.equal(hidden.value, "");
  } finally {
    w.close();
    await w.happyDOM.abort();
  }
});
test("Combined form creates the parent and first child with one submission and sends the child straight to Finance", async () => {
  const w = await app();
  try {
    click(w, "[data-action=demo]");
    await actor(w, "req0");
    click(w, "[data-page=requests]");
    click(w, "[data-action=newOrder]");
    change(w, "formCompany", "c1");
    change(w, "formProject", "p1");
    change(w, "formBudget", "b0");
    const f = w.document.querySelector("[data-form=order]");
    for (const [k, v] of Object.entries({
      supplierId: "s1",
      po: "NEW-PO",
      invoice: "NEW-INV",
      total: "100000",
      description: "New testing order",
      allocation_civil0: "100000",
      firstpercent: "30",
      firstamount: "30000",
      firstterms: "Advance",
    }))
      f.elements[k].value = v;
    const file = new w.File(["%PDF-1.4\nTest supporting"], "evidence.pdf", {
      type: "application/pdf",
    });
    const transfer = new w.DataTransfer();
    transfer.items.add(file);
    f.elements.files.files = transfer.files;
    submit(w, "[data-form=order]");
    await wait(80);
    const raw = JSON.parse(
        w.localStorage.getItem("ss-project-monitoring-demo-v1"),
      ),
      o = raw.orders.at(-1),
      r = raw.requests.at(-1);
    assert.equal(
      o.po,
      "NEW-PO",
      w.document.querySelector("#modal").textContent,
    );
    assert.equal(r.orderId, o.id);
    assert.equal(r.amount, 30000);
    assert.equal(r.status, "Finance");
    assert.equal(o.committedAt, r.createdAt);
    assert.equal(o.files.length, 1);
    // There is no separate submit step.
    assert.equal(w.document.querySelector("#modal [data-action=submit]"), null);
    assert.match(w.document.querySelector("#modal").textContent, /Finance/);
  } finally {
    w.close();
    await w.happyDOM.abort();
  }
});
test("Finance supporting request and requester multi-file return preserve approvals in the interface", async () => {
  const w = await app();
  try {
    click(w, "[data-action=demo]");
    await actor(w, "fin");
    click(w, "[data-page=requests]");
    click(w, "[data-tab=finance]");
    click(w, "[data-action=openRequest][data-id=r1]");
    await flush();
    click(w, "[data-action=documents]");
    w.document.querySelector("[name=reason]").value = "Bank letter";
    submit(w, "[data-form=reason]");
    await flush();
    assert.match(
      w.document.querySelector("#modal").textContent,
      /Additional supporting required/,
    );
    click(w, "[data-action=close]");
    await flush();
    await actor(w, "req0");
    click(w, "[data-tab=inbox]");
    click(w, "[data-action=expand][data-id=o2]");
    click(w, "[data-action=openRequest][data-id=r1]");
    await flush();
    assert.equal(w.document.querySelector("[data-action=editPayment]"), null);
    click(w, "[data-action=supply]");
    const f = w.document.querySelector("[data-form=support]");
    const transfer = new w.DataTransfer();
    transfer.items.add(
      new w.File(["%PDF-1.4\nBank"], "bank.pdf", { type: "application/pdf" }),
    );
    transfer.items.add(
      new w.File(["%PDF-1.4\nInvoice"], "invoice.pdf", {
        type: "application/pdf",
      }),
    );
    f.elements.files.files = transfer.files;
    submit(w, "[data-form=support]");
    await wait(80);
    const r = JSON.parse(
      w.localStorage.getItem("ss-project-monitoring-demo-v1"),
    ).requests.find((r) => r.id === "r1");
    assert.equal(
      r.status,
      "Finance",
      w.document.querySelector("#modal").textContent,
    );
    assert.equal(r.files.length, 2);
    assert.ok(r.finalApprovedAt);
  } finally {
    w.close();
    await w.happyDOM.abort();
  }
});

test('Main details opened from a payment provide a direct return to that payment without stale navigation or locks',async()=>{
 const w=await app();try{
 click(w,'[data-action=demo]');click(w,'[data-page=requests]');click(w,'[data-action=expand][data-id=o1]');click(w,'[data-action=openRequest][data-id=r0]');await flush();
 click(w,'[data-action=openOrder][data-payment=r0]');await flush();
 const back=w.document.querySelector('[data-return-payment]');assert.ok(back);assert.equal(back.dataset.id,'r0');assert.match(back.textContent,/Back to Payment Request/);assert.match(w.document.querySelector('#modal').textContent,/Supporting documents/);
 let saved=JSON.parse(w.localStorage.getItem('ss-project-monitoring-demo-v1'));assert.ok(saved.locks.o1);assert.equal(saved.locks.r0,undefined);
 click(w,back);await flush();assert.equal(w.document.querySelector('#modalTitle').textContent,'Payment request');assert.match(w.document.querySelector('.detail-number').textContent,/PR-2026-000001/);saved=JSON.parse(w.localStorage.getItem('ss-project-monitoring-demo-v1'));assert.ok(saved.locks.r0);assert.equal(saved.locks.o1,undefined);
 click(w,'[data-action=close]');await flush();click(w,'[data-action=openOrder][data-id=o1]');await flush();assert.equal(w.document.querySelector('[data-return-payment]'),null);
 }finally{w.close();await w.happyDOM.abort()}
});

test('CSV and Excel imports preview without saving, confirm creates masters, and changing the file invalidates preview', async () => {
  for (const format of ['csv', 'xlsx']) {
    const w = await app();
    try {
      click(w, '[data-action=demo]'); click(w, '[data-page=master]');
      click(w, '[data-master=suppliers]'); click(w, '[data-action=import]');
      const f = w.document.querySelector('[data-form=import]');
      const name = `Fictional ${format} import supplier`;
      let contents = `Name,Email\r\n${name},fictional@example.com\r\n`;
      if (format === 'xlsx') {
        const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Import');
        sheet.addRow(imports.importFields.suppliers); sheet.addRow([name, 'fictional@example.com']);
        contents = await book.xlsx.writeBuffer();
      }
      const transfer = new w.DataTransfer();
      transfer.items.add(new w.File([contents], `fictional.${format}`));
      f.elements.importFile.files = transfer.files;
      fire(f.elements.importFile, new w.Event('change', { bubbles: true }));
      const before = JSON.parse(w.localStorage.getItem('ss-project-monitoring-demo-v1')).suppliers.length;
      submit(w, '[data-form=import]');
      await wait(100);
      assert.ok(w.document.querySelector('[data-action=confirmImport]'), f.textContent);
      assert.equal(JSON.parse(w.localStorage.getItem('ss-project-monitoring-demo-v1')).suppliers.length, before);
      assert.ok(w.document.querySelector('#importPreview').textContent.includes(name));
      fire(f.elements.importFile, new w.Event('change', { bubbles: true }));
      assert.equal(w.document.querySelector('[data-action=confirmImport]'), null);
      submit(w, '[data-form=import]'); await wait(100);
      click(w, '[data-action=confirmImport]'); await flush();
      const saved = JSON.parse(w.localStorage.getItem('ss-project-monitoring-demo-v1'));
      assert.equal(saved.suppliers.length, before + 1);
      assert.equal(saved.suppliers.at(-1).name, name);
      assert.equal(modalOpen(w), false);
      await actor(w, 'req0'); click(w, '[data-page=requests]'); click(w, '[data-action=import]');
      assert.deepEqual([...w.document.querySelectorAll('[name=importKind] option')].map(o => o.value), ['orders', 'payments']);
    } finally { w.close(); await w.happyDOM.abort(); }
  }
});

test('The sidebar keeps one company switcher, preserves scope across operational pages and scopes project options', async () => {
  const w = await app();
  try {
    click(w, '[data-action=demo]');
    assert.equal(w.document.querySelectorAll('#company').length, 1);
    assert.ok(w.document.querySelector('[data-slot=sidebar] .sidebar-scope #company'));
    change(w, 'company', 'c1');
    assert.ok(optionsOf(w, '#project').every(([v]) => !v || ['p1','p2'].includes(v)));
    click(w, '[data-page=requests]');
    assert.equal(w.document.querySelector('#company').dataset.value, 'c1');
    assert.equal(w.document.querySelectorAll('#company').length, 1);
    click(w, '[data-page=master]');
    assert.equal(w.document.querySelector('#company'), null);
    assert.match(w.document.querySelector('[data-slot=sidebar] .sidebar-scope').textContent, /Group administration/);
    click(w, '[data-page=dashboard]');
    assert.equal(w.document.querySelector('#company').dataset.value, 'c1');
  } finally { w.close(); await w.happyDOM.abort(); }
});

test('Mobile drawer opens, closes and navigates with focus; role restrictions apply to both navigations', async () => {
  const w = await app(null, null, { width: 390 });
  const drawer = () => w.document.querySelector('[data-mobile=true]');
  try {
    click(w, '[data-action=demo]');
    assert.equal(drawer(), null);
    click(w, '[data-action=openNavigation]'); await flush();
    assert.ok(drawer());
    assert.equal(w.document.querySelector('[data-action=openNavigation]').getAttribute('aria-expanded'), 'true');
    fire(w.document.activeElement, new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flush();
    assert.equal(drawer(), null);
    assert.equal(w.document.activeElement.dataset.action, 'openNavigation');
    click(w, '[data-action=openNavigation]'); await flush();
    click(w, '[data-mobile=true] [data-page=requests]'); await flush();
    assert.equal(drawer(), null);
    assert.equal(w.document.activeElement.id, 'pageTitle');
    assert.equal(w.document.querySelector('#pageTitle').textContent, 'Requests');
    click(w, '[data-action=openNavigation]'); await flush();
    await actor(w, 'viewer');
    assert.equal(w.document.querySelector('[data-page=master]'), null);
    if (!drawer()) { click(w, '[data-action=openNavigation]'); await flush(); }
    assert.ok(w.document.querySelector('[data-mobile=true] [data-page=requests]'));
    assert.equal(w.document.querySelector('[data-mobile=true] [data-page=master]'), null);
  } finally { w.close(); await w.happyDOM.abort(); }
});

test('Dashboard breakdowns use progressive disclosure, preserve the chosen state and retain financial metrics', async () => {
  const w = await app();
  try {
    click(w, '[data-action=demo]');
    const report = w.document.querySelector('[data-disclosure=currency]');
    assert.equal(report.dataset.state, 'closed');
    click(w, '[data-disclosure=currency] [data-slot=collapsible-trigger]'); await flush();
    change(w, 'project', 'p1');
    assert.equal(w.document.querySelector('[data-disclosure=currency]').dataset.state, 'open');
    assert.ok(w.document.querySelector('[data-disclosure=categories] table'));
    assert.match(w.document.querySelector('[data-disclosure=payments]').textContent, /Payments Completed/);
    assert.equal(w.document.querySelectorAll('[data-kpi]').length, 7);
    assert.equal(w.document.querySelector('[data-kpi=budget] .dashboard-kpi-value').textContent, '1,600,000.00');
  } finally { w.close(); await w.happyDOM.abort(); }
});

test('User menus close on Escape and outside interaction without losing page state', async () => {
  const w = await app();
  try {
    click(w, '[data-action=demo]');
    const trigger = w.document.querySelector('.profile-menu');
    const open = async () => { fire(trigger, new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await flush(); };
    const menu = () => w.document.querySelector('[role=menu]');
    await open();
    assert.ok(menu());
    fire(w.document.activeElement, new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flush();
    assert.equal(menu(), null);
    assert.equal(w.document.activeElement, trigger);
    await open();
    assert.ok(menu());
    fire(w.document.querySelector('#pageTitle'), new w.PointerEvent('pointerdown', { bubbles: true, button: 0 })); await flush();
    assert.equal(menu(), null);
    assert.equal(w.document.querySelector('#pageTitle').textContent, 'Project dashboard');
  } finally { w.close(); await w.happyDOM.abort(); }
});

test('Appearance changes persist across navigation without resetting entered form data', async () => {
  const w = await app();
  try {
    const form = w.document.querySelector('[data-form=login]');
    form.elements.username.value = 'fictional-theme-test';
    form.elements.password.value = 'FictionalTestOnly123';
    change(w, 'loginAppearance', 'dark');
    assert.equal(w.document.documentElement.dataset.theme, 'dark');
    assert.equal(form.elements.username.value, 'fictional-theme-test');
    assert.equal(form.elements.password.value, 'FictionalTestOnly123');
    assert.equal(w.localStorage.getItem('ss-project-monitoring-appearance'), 'dark');
    click(w, '[data-action=demo]');
    // The account menu's Appearance choice (a shadcn DropdownMenu radio group).
    const openMenu = async () => { fire(w.document.querySelector('.profile-menu'), new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await flush(); };
    const checked = () => w.document.querySelector('[data-appearance][data-state=checked]')?.dataset.appearance;
    await openMenu();
    assert.equal(checked(), 'dark');
    fire(w.document.activeElement, new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flush();
    click(w, '[data-page=master]');
    await openMenu();
    assert.equal(checked(), 'dark');
    click(w, '[data-appearance=light]'); await flush();
    assert.equal(w.document.documentElement.dataset.theme, 'light');
    await openMenu();
    click(w, '[data-action=logout]'); await flush();
    assert.equal(w.document.querySelector('#loginAppearance').dataset.value, 'light');
  } finally { w.close(); await w.happyDOM.abort(); }
});

test('Sidebar theme icon switches themes in place, keeps focus and remembers the choice', async () => {
  const w = await app();
  try {
    click(w, '[data-action=demo]');
    const before = w.localStorage.getItem('ss-project-monitoring-demo-v1');
    const toggle = w.document.querySelector('[data-slot=sidebar] [data-theme-toggle]');
    assert.ok(toggle);
    assert.equal(toggle.getAttribute('aria-label'), 'Switch to dark theme');
    toggle.focus();
    fire(toggle.querySelector('svg'), new w.MouseEvent('click', { bubbles: true }));
    await flush(); // The button re-renders from <html> (a MutationObserver).
    assert.equal(w.document.documentElement.dataset.theme, 'dark');
    assert.equal(toggle.getAttribute('aria-label'), 'Switch to light theme');
    assert.equal(w.document.activeElement, toggle);
    assert.equal(w.localStorage.getItem('ss-project-monitoring-appearance'), 'dark');
    assert.equal(w.document.documentElement.dataset.themePreference, 'dark');
    assert.equal(w.localStorage.getItem('ss-project-monitoring-demo-v1'), before);
    click(w, '[data-page=requests]');
    const nextToggle = w.document.querySelector('[data-theme-toggle]');
    assert.equal(nextToggle.getAttribute('aria-label'), 'Switch to light theme');
    click(w, nextToggle);
    await flush();
    assert.equal(w.document.documentElement.dataset.theme, 'light');
    assert.equal(nextToggle.getAttribute('aria-label'), 'Switch to dark theme');
    assert.equal(w.localStorage.getItem('ss-project-monitoring-appearance'), 'light');
  } finally { w.close(); await w.happyDOM.abort(); }
});

test('Approved budgets can be created and revised when crypto.randomUUID is unavailable', async () => {
  const w = await app(null, null, { withoutRandomUUID: true });
  try {
    assert.equal(typeof w.crypto.randomUUID, 'undefined');
    click(w, '[data-action=demo]'); click(w, '[data-page=master]');
    click(w, '[data-master=budgets]'); click(w, '[data-action=newMaster]');
    let f = w.document.querySelector('[data-form=master]');
    assert.ok(f, toastText(w));
    f.elements.name.value = 'Fictional compatibility budget';
    change(w, 'masterCompany', 'c1'); change(w, 'masterProject', 'p1');
    f.querySelector('[name=categoryName]').value = 'Civil';
    f.querySelector('[name=categoryAmount]').value = '1000';
    click(w, '[data-action=addCategory]');
    const names = f.querySelectorAll('[name=categoryName]'), amounts = f.querySelectorAll('[name=categoryAmount]');
    assert.equal(names.length, 2);
    names[1].value = 'Electrical'; amounts[1].value = '500';
    const categoryIds = [...f.querySelectorAll('[data-category]')].map(el => el.dataset.category);
    assert.equal(new Set(categoryIds).size, 2);
    for (const id of categoryIds) assert.match(id, /^[0-9a-f-]{36}$/);
    submit(w, '[data-form=master]'); await flush();
    let saved = JSON.parse(w.localStorage.getItem('ss-project-monitoring-demo-v1'));
    const b = saved.budgets.at(-1);
    assert.equal(b.name, 'Fictional compatibility budget', toastText(w));
    assert.deepEqual(b.categories.map(c => c.id), categoryIds);
    click(w, `[data-action=editMaster][data-id="${b.id}"]`);
    f = w.document.querySelector('[data-form=master]');
    f.querySelector('[name=categoryAmount]').value = '1200';
    f.elements.reason.value = 'Fictional budget adjustment';
    submit(w, '[data-form=master]'); await flush();
    saved = JSON.parse(w.localStorage.getItem('ss-project-monitoring-demo-v1'));
    const revised = saved.budgets.find(x => x.id === b.id);
    assert.equal(revised.categories[0].amount, 1200);
    assert.equal(revised.revisions[0].categories[0].amount, 1000);
    assert.deepEqual(revised.categories.map(c => c.id), categoryIds);
  } finally { w.close(); await w.happyDOM.abort(); }
});

test('Admin creates requests that go straight to Finance and adds further independent payments', async () => {
  const w = await app();
  try {
    click(w, '[data-action=demo]'); click(w, '[data-page=requests]');
    assert.ok(w.document.querySelector('[data-action=import]'));
    click(w, '[data-action=newOrder]');
    let f = w.document.querySelector('[data-form=order]');
    assert.equal(f.elements.team, undefined);
    change(w, 'formCompany', 'c1'); change(w, 'formProject', 'p1'); change(w, 'formBudget', 'b0');
    for (const [key, value] of Object.entries({ supplierId: 's1', po: 'ADMIN-POPULATION-PO', invoice: 'ADMIN-POPULATION-INV', total: '1000', description: 'Fictional Admin data entry', allocation_civil0: '1000', firstpercent: '30', firstamount: '300', firstterms: 'Advance' }))
      f.elements[key].value = value;
    const transfer = new w.DataTransfer();
    transfer.items.add(new w.File(['%PDF-1.4\nFictional evidence'], 'sample.pdf', { type: 'application/pdf' }));
    f.elements.files.files = transfer.files;
    submit(w, '[data-form=order]'); await wait(80);
    let saved = JSON.parse(w.localStorage.getItem('ss-project-monitoring-demo-v1'));
    const order = saved.orders.at(-1), child = saved.requests.at(-1);
    assert.equal(order.po, 'ADMIN-POPULATION-PO', toastText(w));
    assert.equal(order.requestedBy, 'admin');
    assert.equal(child.status, 'Finance');
    assert.equal(w.document.querySelector('[data-action=submit]'), null);
    assert.ok(order.committedAt);
    click(w, '[data-action=close]'); await flush();
    click(w, `[data-action=openOrder][data-id="${order.id}"]`); await flush();
    click(w, '[data-action=newPayment]');
    f = w.document.querySelector('[data-form=payment]');
    f.elements.percent.value = '20'; f.elements.amount.value = '200';
    submit(w, '[data-form=payment]'); await flush();
    saved = JSON.parse(w.localStorage.getItem('ss-project-monitoring-demo-v1'));
    assert.equal(saved.requests.at(-1).amount, 200, toastText(w));
    assert.equal(saved.requests.at(-1).status, 'Finance');
    assert.match(toastText(w), /submitted to Finance/);
    assert.deepEqual(saved.requests.at(-1).approvals, []);
  } finally { w.close(); await w.happyDOM.abort(); }
});

test('Projects list and project pages show task progress; only Planning and Admin edit tasks', async () => {
  const w = await app();
  try {
    click(w, '[data-action=demo]');
    await actor(w, 'fin');
    click(w, '.kpi-side > .workspace-actions [data-page=projects]');
    assert.equal(w.document.querySelector('#pageTitle').textContent, 'Projects');
    const cards = [...w.document.querySelectorAll('.project-card')];
    assert.equal(cards.length, 4);
    assert.equal(cards[0].querySelector('.project-pct').textContent, '47%');
    assert.match(cards[0].querySelector('.project-foot').textContent, /8 of 17 done/);
    // Anywhere on the card opens the project, not only the title.
    click(w, cards[1].querySelector('.project-foot'));
    await flush();
    assert.equal(w.document.querySelector('#pageTitle').textContent, 'Villa Refurbishment');
    click(w, '[data-action=backProjects]');
    assert.ok(w.document.querySelector('[data-action=newProject]'));
    const search = w.document.querySelector('#projectSearch');
    type(w, search, 'villa');
    await flush();
    assert.equal(w.document.querySelectorAll('.project-card').length, 2);
    const search2 = w.document.querySelector('#projectSearch');
    type(w, search2, '');
    await flush();
    click(w, '[data-action=openProject][data-id=p1]');
    assert.equal(w.document.querySelector('#pageTitle').textContent, 'Tropical Maldives Project');
    assert.ok(w.document.querySelector('.kpi-layout .budget-overview .kpi-trend-overview'));
    assert.ok(w.document.querySelector('.kpi-side > .progress-card'));
    assert.ok(w.document.querySelector('.kpi-side > .payment-overview'));
    assert.match(w.document.querySelector('.progress-figure').textContent, /^47%$/);
    assert.equal(w.document.querySelectorAll('.task-row').length, 17);
    assert.ok(w.document.querySelector('.explore-card [data-disclosure=payments]'));
    // Finance reads the tasks but cannot change them.
    assert.equal(w.document.querySelector('.task-status,[data-action=newTask],[data-action=editTask],[data-action=deleteTask]'), null);
    // Payment requests from the project page: a new request is preset to this project, and
    // an order with value left to request takes a further payment request directly.
    click(w, '[data-action=projectOrder]');
    const of = w.document.querySelector('[data-form=order]');
    assert.equal(of.elements.companyId.value, 'c1');
    assert.equal(of.elements.projectId.value, 'p1');
    assert.equal(of.elements.budgetId.value, 'b0');
    assert.ok(of.querySelector('[name=allocation_civil0]'));
    click(w, '[data-action=close]');
    await flush();
    const before = JSON.parse(w.localStorage.getItem('ss-project-monitoring-demo-v1')).requests.length;
    const payButton = w.document.querySelector('[data-action=projectPayment]');
    const orderId = payButton.dataset.id;
    click(w, payButton);
    await flush();
    const pf = w.document.querySelector('[data-form=payment]');
    assert.equal(pf.dataset.order, orderId);
    pf.elements.percent.value = '1';
    pf.elements.amount.value = '';
    fire(pf.elements.percent, new w.Event('input', { bubbles: true }));
    submit(w, '[data-form=payment]');
    await flush();
    let saved = JSON.parse(w.localStorage.getItem('ss-project-monitoring-demo-v1'));
    assert.equal(saved.requests.length, before + 1, w.document.querySelector('#modal').textContent.slice(0, 300));
    assert.equal(saved.requests.at(-1).orderId, orderId);
    assert.equal(saved.requests.at(-1).status, 'Finance');
    click(w, '[data-action=close]');
    await flush();
    // Planning: projects and tasks only, without budget figures; it adds and changes tasks.
    await actor(w, 'planner');
    click(w, '[data-page=projects]');
    assert.equal(w.document.querySelector('#pageTitle').textContent, 'Projects');
    assert.doesNotMatch(w.document.querySelector('.project-card .project-foot').textContent, /available/);
    click(w, '[data-action=openProject][data-id=p1]');
    assert.equal(w.document.querySelector('#pageTitle').textContent, 'Tropical Maldives Project');
    assert.equal(w.document.querySelector('.budget-overview,.payment-overview,.requests-card,.explore-card'), null);
    assert.ok(w.document.querySelector('.kpi-side > .progress-card'));
    assert.match(w.document.querySelector('.progress-figure').textContent, /^47%$/);
    // Add a task through the form.
    click(w, '[data-action=newTask]');
    const f = w.document.querySelector('[data-form=task]');
    f.elements.name.value = 'Commissioning';
    f.elements.status.value = 'Done';
    submit(w, '[data-form=task]');
    await flush();
    assert.equal(w.document.querySelectorAll('.task-row').length, 18);
    assert.match(w.document.querySelector('.progress-figure').textContent, /^50%$/);
    // Inline status change saves straight away.
    choose(w, '.task-status', 'Done');
    await flush();
    assert.match(w.document.querySelector('.progress-figure').textContent, /^56%$/);
    saved = JSON.parse(w.localStorage.getItem('ss-project-monitoring-demo-v1'));
    assert.equal(saved.tasks.filter((t) => t.projectId === 'p1' && t.status === 'Done').length, 10);
    assert.ok(saved.audit.some((a) => a.action === 'task.save' && a.user === 'Project Planner'));
    // Delete with an in-page confirmation.
    const added = saved.tasks.find((t) => t.name === 'Commissioning');
    click(w, `[data-action=deleteTask][data-id="${added.id}"]`);
    submit(w, '[data-form=taskDelete]');
    await flush();
    assert.equal(w.document.querySelectorAll('.task-row').length, 17);
    click(w, '[data-action=backProjects]');
    assert.equal(w.document.querySelector('#pageTitle').textContent, 'Projects');
    // A Viewer sees progress but no task controls.
    await actor(w, 'viewer');
    click(w, '[data-page=projects]');
    assert.equal(w.document.querySelector('[data-action=newProject]'), null);
    click(w, '[data-action=openProject][data-id=p1]');
    assert.equal(w.document.querySelectorAll('.task-row').length, 17);
    assert.equal(w.document.querySelector('.task-status,[data-action=newTask],[data-action=editTask],[data-action=deleteTask]'), null);
    assert.ok(w.document.querySelector('.task-badge'));
  } finally { w.close(); await w.happyDOM.abort(); }
});

test("Admin deletes payment requests and requests, reviews them on the Deleted page and restores them", async () => {
  // Fixed sample: r0 is Paid; one request holds only a draft payment request.
  const seed = demoState();
  const paid = seed.requests.find((r) => r.status === "Paid");
  const paidOrder = seed.orders.find((o) => o.id === paid.orderId);
  const draftOrder = seed.orders.find((o) => seed.requests.filter((r) => r.orderId === o.id).every((r) => r.status === "Draft"));
  const draft = seed.requests.find((r) => r.orderId === draftOrder.id);
  const w = await app(seed);
  const saved = () => JSON.parse(w.localStorage.getItem("ss-project-monitoring-demo-v1"));
  const deleteWith = async (action, reason) => {
    click(w, `[data-action=${action}]`);
    w.document.querySelector("[name=reason]").value = reason;
    submit(w, "[data-form=reason]");
    await flush();
  };
  try {
    click(w, "[data-action=demo]");
    const paidBefore = domain.kpis(saved()).paid;
    assert.ok(paidBefore >= paid.amount);
    assert.ok(w.document.querySelector("[data-sidebar=menu-button][data-page=deleted]"));
    // A request with a processed payment request offers deletion only after that one goes.
    click(w, "[data-page=requests]");
    click(w, `[data-action=openOrder][data-id="${paidOrder.id}"]`);
    await flush();
    assert.ok(w.document.querySelector("[data-action=deleteOrder]").disabled);
    assert.match(w.document.querySelector("#deleteOrderNote").textContent, new RegExp(paid.number));
    click(w, `#modal [data-action=openRequest][data-id="${paid.id}"]`);
    await flush();
    await deleteWith("deleteRequest", "Entered against the wrong order");
    assert.equal(modalOpen(w), false);
    assert.equal(saved().requests.find((r) => r.id === paid.id).deleted.reason, "Entered against the wrong order");
    assert.equal(domain.kpis(saved()).paid, domain.money(paidBefore - paid.amount / paid.rate));
    // A request holding only a draft is deleted together with that draft.
    click(w, `[data-action=openOrder][data-id="${draftOrder.id}"]`);
    await flush();
    assert.equal(w.document.querySelector("[data-action=deleteOrder]").disabled, false);
    await deleteWith("deleteOrder", "Raised twice");
    assert.ok(saved().orders.find((o) => o.id === draftOrder.id).deleted);
    assert.equal(saved().requests.find((r) => r.id === draft.id).deleted.withOrder, draftOrder.id);
    assert.equal(w.document.querySelector(`[data-action=openOrder][data-id="${draftOrder.id}"]`), null);
    // The Deleted page lists both, with the draft shown under its request, and logs each deletion.
    click(w, "[data-sidebar=menu-button][data-page=deleted]");
    assert.equal(w.document.querySelector("#pageTitle").textContent, "Deleted");
    const listed = () => [...w.document.querySelectorAll(".deleted-table tbody tr td:first-child strong")].map((x) => x.textContent);
    assert.deepEqual(listed().sort(), [paid.number, draftOrder.number].sort());
    assert.match(w.document.querySelector(".deleted-table").textContent, new RegExp(`with draft ${draft.number}`));
    assert.equal(w.document.querySelectorAll(".deletion-log tbody tr").length, 3);
    click(w, `[data-action=openDeleted][data-id="${paid.id}"]`);
    await flush();
    assert.match(w.document.querySelector("#modalTitle").textContent, /Deleted payment request/);
    assert.match(w.document.querySelector("#modal").textContent, /Entered against the wrong order/);
    click(w, "#modal [data-action=restoreDeleted]");
    submit(w, "[data-form=restore]");
    await flush();
    assert.equal(saved().requests.find((r) => r.id === paid.id).deleted, undefined);
    assert.equal(domain.kpis(saved()).paid, paidBefore);
    assert.deepEqual(listed(), [draftOrder.number]);
    click(w, `.deleted-table [data-action=restoreDeleted][data-id="${draftOrder.id}"]`);
    submit(w, "[data-form=restore]");
    await flush();
    assert.equal(saved().orders.find((o) => o.id === draftOrder.id).deleted, undefined);
    assert.equal(saved().requests.find((r) => r.id === draft.id).deleted, undefined);
    assert.equal(w.document.querySelector(".deleted-table"), null);
    assert.equal(w.document.querySelectorAll(".deletion-log tbody tr").length, 6);
    // Finance never sees the page or the delete buttons.
    await actor(w, "fin");
    assert.equal(w.document.querySelector("[data-sidebar=menu-button][data-page=deleted]"), null);
    click(w, "[data-page=requests]");
    click(w, `[data-action=openOrder][data-id="${paidOrder.id}"]`);
    await flush();
    assert.equal(w.document.querySelector("[data-action=deleteOrder]"), null);
    click(w, `#modal [data-action=openRequest][data-id="${paid.id}"]`);
    await flush();
    assert.equal(w.document.querySelector("[data-action=deleteRequest]"), null);
  } finally {
    w.close();
    await w.happyDOM.abort();
  }
});

test("Budgets page lists each approved budget; the Balance to request tab shows the balance amount", async () => {
  const w = await app();
  try {
    click(w, "[data-action=demo]");
    await actor(w, "fin");
    click(w, ".kpi-side > .workspace-actions [data-page=budgets]");
    assert.equal(w.document.querySelector("#pageTitle").textContent, "Budgets");
    const cards = w.document.querySelectorAll(".budget-card");
    assert.ok(cards.length > 0);
    assert.deepEqual([...cards[0].querySelectorAll(".budget-figures dt")].map((x) => x.textContent), ["Approved Budget", "Budget Utilized", "Available Budget", "Utilized"]);
    assert.ok(cards[0].querySelector(".dashboard-table tbody tr"));
    assert.ok(w.document.querySelector("[data-action=newBudget]"));
    type(w, w.document.querySelector("#budgetSearch"), "no such budget");
    await flush();
    assert.equal(w.document.querySelectorAll(".budget-card").length, 0);
    click(w, "[data-page=requests]");
    click(w, "[data-tab=balance]");
    const heads = [...w.document.querySelectorAll(".work-table thead th")].map((th) => th.textContent);
    assert.deepEqual(heads.slice(3, 5), ["Total Amount", "Balance Amount"]);
    assert.match(w.document.querySelector('.work-table tbody td[data-label="Balance Amount"]').textContent, /^[A-Z]{3}[\d,]+\.\d{2}$/);
    await actor(w, "viewer");
    click(w, "[data-page=budgets]");
    assert.equal(w.document.querySelector("#pageTitle").textContent, "Budgets");
    assert.equal(w.document.querySelector("[data-action=newBudget],[data-action=editBudget]"), null);
  } finally { w.close(); await w.happyDOM.abort(); }
});

test("Browser Back and Forward move between portal pages, and the URL reopens the page", async () => {
  const w = await app();
  const title = () => w.document.querySelector("#pageTitle").textContent;
  const back = async () => { w.history.back(); await new Promise((r) => setTimeout(r, 30)); await flush(); };
  try {
    click(w, "[data-action=demo]");
    await flush();
    assert.equal(w.location.hash, "#dashboard");
    click(w, "[data-page=projects]");
    click(w, "[data-action=openProject][data-id=p1]");
    assert.equal(w.location.hash, "#project/p1");
    click(w, "[data-page=budgets]");
    assert.equal(title(), "Budgets");
    await back();
    assert.equal(title(), "Tropical Maldives Project");
    await back();
    assert.equal(title(), "Projects");
    // (happy-dom does not implement history.forward(); Forward is checked in a real browser.)
    click(w, "[data-action=openProject][data-id=p1]");
    assert.equal(title(), "Tropical Maldives Project");
    // Going Back with a dialog open closes it and shows the previous page.
    click(w, "[data-page=requests]");
    click(w, "[data-action=openOrder]");
    await flush();
    assert.ok(modalOpen(w));
    await back();
    assert.equal(title(), "Tropical Maldives Project");
    assert.equal(modalOpen(w), false);
  } finally { w.close(); await w.happyDOM.abort(); }
  // A reload on a page URL reopens that page.
  history.replaceState(null, "", location.href.split("#")[0] + "#budgets");
  const w2 = await app(undefined, undefined, { keepUrl: true });
  try {
    click(w2, "[data-action=demo]");
    await flush();
    assert.equal(w2.document.querySelector("#pageTitle").textContent, "Budgets");
    assert.equal(w2.location.hash, "#budgets");
  } finally { w2.close(); await w2.happyDOM.abort(); }
});

test("A live session signs out after 15 minutes of inactivity, never while active or visible, and the background refresh does not count", async () => {
  const seed = demoState(), user = seed.users[0];
  const calls = [];
  const realNow = Date.now;
  let offset = 0;
  Date.now = () => realNow() + offset;
  const w = await app(null, async (url, options = {}) => {
    const action = new URL(url, "http://localhost:3000").searchParams.get("action");
    calls.push({ action, background: options.headers?.["X-Portal-Background"] === "1" });
    return { ok: true, json: async () => action === "config" ? { configured: true } : action === "state" ? { user, state: seed } : { ok: true } };
  });
  const later = async (ms) => {
    offset += ms;
    fire(w.document, new w.Event("visibilitychange"));
    await flush();
  };
  try {
    await flush();
    assert.equal(w.document.querySelector("#pageTitle").textContent, "Project dashboard");
    // The 30-second refresh is marked as background, so the server does not extend the session.
    await act(() => sleep(0));
    calls.length = 0;
    // Active for 30 minutes (a key press every 5): keep-alives, no sign-out.
    for (let i = 0; i < 6; i++) {
      await later(5 * 60 * 1000);
      fire(w.document.body, new w.KeyboardEvent("keydown", { key: "Shift", bubbles: true }));
    }
    await later(61 * 1000);
    assert.ok(calls.some((c) => c.action === "session"), JSON.stringify(calls));
    assert.equal(calls.some((c) => c.action === "end-session"), false);
    assert.equal(w.document.querySelector("#pageTitle").textContent, "Project dashboard");
    // Reading with the portal visible for 30 minutes, no input: still active, renewed silently.
    calls.length = 0;
    for (let i = 0; i < 6; i++) await later(5 * 60 * 1000);
    assert.ok(calls.some((c) => c.action === "session"), JSON.stringify(calls));
    assert.equal(calls.some((c) => c.action === "end-session"), false);
    assert.equal(w.document.querySelector("#pageTitle").textContent, "Project dashboard");
    // Idle with the portal hidden: back after 14 minutes, still signed in; hidden again for
    // 15 minutes, signed out with a notice.
    const visibility = (state) => Object.defineProperty(w.document, "visibilityState", { value: state, configurable: true });
    visibility("hidden");
    await later(0);
    visibility("visible");
    await later(14 * 60 * 1000);
    assert.equal(w.document.querySelector("#pageTitle").textContent, "Project dashboard");
    visibility("hidden");
    await later(0);
    visibility("visible");
    await later(15 * 60 * 1000);
    assert.ok(calls.some((c) => c.action === "end-session"));
    assert.equal(w.document.querySelector("#pageTitle").textContent, "Welcome back");
    assert.match(w.document.querySelector("#loginNotice").textContent, /signed out after 15 minutes of inactivity/);
  } finally {
    Date.now = realNow;
    w.close();
    await w.happyDOM.abort();
  }
});

test("The background refresh tells the server it is not user activity", async () => {
  const seed = demoState(), user = seed.users[0];
  const calls = [];
  const w = await app(null, async (url, options = {}) => {
    const action = new URL(url, "http://localhost:3000").searchParams.get("action");
    calls.push({ action, background: options.headers?.["X-Portal-Background"] === "1" });
    return { ok: true, json: async () => action === "config" ? { configured: true } : action === "state" ? { user, state: seed } : { ok: true } };
  });
  try {
    await flush();
    const startup = calls.find((c) => c.action === "state");
    assert.equal(startup.background, false); // opening the portal is activity
    await act(() => sleep(30100)); // the 30-second refresh
    const refresh = calls.filter((c) => c.action === "state").at(-1);
    assert.notEqual(refresh, startup);
    assert.equal(refresh.background, true);
  } finally {
    w.close();
    await w.happyDOM.abort();
  }
}, 40000);

test("Refreshing the page keeps the demo workspace open on the same page; signing out ends it", async () => {
  let w = await app();
  click(w, "[data-action=demo]");
  await actor(w, "fin");
  click(w, "[data-page=requests]");
  await flush();
  w.close();
  w = await app(null, null, { reload: true });
  try {
    await flush();
    assert.equal(w.document.querySelector("#pageTitle").textContent, "Requests");
    assert.equal(w.document.querySelector("#actor").dataset.value, "fin");
    assert.equal(w.document.querySelector("[data-action=demo]"), null);
    await signOut(w);
    assert.equal(w.document.querySelector("#pageTitle").textContent, "Welcome back");
  } finally { w.close(); }
  w = await app(null, null, { reload: true });
  try {
    await flush();
    assert.equal(w.document.querySelector("#pageTitle").textContent, "Welcome back");
  } finally { w.close(); }
});
