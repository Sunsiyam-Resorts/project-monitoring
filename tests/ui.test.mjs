import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import * as domain from "../public/domain.js";
import { demoState } from "../public/demo.js";
const flush = () => new Promise((r) => setTimeout(r, 20));
async function app(seed) {
  const window = new Window({
    url: "http://localhost:3000",
    settings: {
      enableJavaScriptEvaluation: true,
      disableCSSFileLoading: true,
      disableJavaScriptFileLoading: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
    },
  });
  window.document.body.innerHTML =
    '<div id="app"></div><dialog id="modal"></dialog><div id="toast"></div>';
  window.structuredClone = structuredClone;
  if (seed)
    window.localStorage.setItem(
      "ss-project-monitoring-demo-v1",
      JSON.stringify(seed),
    );
  window.fetch = async () => ({
    ok: true,
    json: async () => ({ configured: false }),
  });
  window.__deps = { ...domain, demoState };
  const source = (
    await readFile(new URL("../public/app.js", import.meta.url), "utf8")
  ).replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, "");
  window.eval(
    "const {" +
      Object.keys(window.__deps).join(",") +
      "}=window.__deps;\n" +
      source,
  );
  await flush();
  return window;
}
const click = (w, s) => {
  const el = w.document.querySelector(s);
  assert.ok(el, "Missing " + s);
  el.click();
};
test("All five pages and document render, scoped role switching works", async () => {
  const w = await app();
  assert.match(w.document.body.textContent, /Welcome back/);
  click(w, "[data-action=demo]");
  assert.match(w.document.body.textContent, /Project dashboard/);
  assert.deepEqual([...w.document.querySelectorAll('.budget-kpis h2')].map(x=>x.textContent), ['Total Approved Budget','Budget Utilized','Available Budget']);
  assert.deepEqual([...w.document.querySelectorAll('.payment-kpis h3')].map(x=>x.textContent), ['Paid','Outstanding Payments','On Hold','Balance Payments Pending']);
  assert.equal(w.document.querySelectorAll('.dashboard-kpis p,.dashboard-kpis small').length, 0);
  for (const page of ["requests", "master", "users", "settings", "dashboard"]) {
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
      w.document.querySelector("#toast").textContent,
    /PR-2026/,
  );
  click(w, "[data-action=document]");
  assert.ok(w.document.querySelector(".printdoc"));
  assert.match(
    w.document.querySelector(".printdoc").textContent,
    /This payment request/,
  );
  await w.document.querySelector("[data-action=close]").click();
  await flush();
  const actor = w.document.querySelector("#actor");
  actor.value = "viewer";
  actor.dispatchEvent(new w.Event("change", { bubbles: true }));
  await flush();
  assert.equal(w.document.querySelectorAll("[data-page]").length, 2);
  click(w, "[data-page=dashboard]");
  assert.match(w.document.body.textContent, /All/);
  const actor2 = w.document.querySelector("#actor");
  actor2.value = "req0";
  actor2.dispatchEvent(new w.Event("change", { bubbles: true }));
  await flush();
  assert.ok(
    !w.document.querySelector("#company").textContent.includes("Siyam World"),
  );
  w.close();
  await w.happyDOM.abort();
});
test("Requester forms populate dependent project, budget, category and instalment fields", async () => {
  const w = await app();
  click(w, "[data-action=demo]");
  const actor = w.document.querySelector("#actor");
  actor.value = "req0";
  actor.dispatchEvent(new w.Event("change", { bubbles: true }));
  await flush();
  click(w, "[data-page=requests]");
  click(w, "[data-action=newOrder]");
  const company = w.document.querySelector("#formCompany");
  company.value = "c1";
  company.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert.match(
    w.document.querySelector("#formProject").textContent,
    /Tropical/,
  );
  const project = w.document.querySelector("#formProject");
  project.value = "p1";
  project.dispatchEvent(new w.Event("change", { bubbles: true }));
  const budget = w.document.querySelector("#formBudget");
  budget.value = "b0";
  budget.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert.equal(w.document.querySelectorAll("#allocations input").length, 3);
  click(w, "[data-action=close]");
  await flush();
  click(w, "[data-tab=requests]");
  click(w, "[data-action=openOrder][data-id=o1]");
  await flush();
  click(w, "[data-action=newPayment]");
  const percent = w.document.querySelector("#paymentPercent");
  percent.value = "20";
  percent.dispatchEvent(new w.Event("input", { bubbles: true }));
  assert.equal(w.document.querySelector("#paymentAmount").value, "84000");
  w.close();
  await w.happyDOM.abort();
});
const actor = async (w, id) => {
  const select = w.document.querySelector("#actor");
  select.value = id;
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  await flush();
};
const change = (w, id, value) => {
  const el = w.document.getElementById(id);
  el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
};
const submit = (w, form) =>
  w.document
    .querySelector(form)
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
test("Filter disclosure, grouped Finance queue, sorting and search reflect real records", async () => {
  const w = await app();
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
    search.value = "not-a-real-supplier";
    search.dispatchEvent(new w.Event("input", { bubbles: true }));
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
        "#modal input,#modal select,#modal textarea",
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
    click(w, "[data-action=logout]");
    await flush();
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
test("Presentation retains full Purchasing approval workflow and return-to-requester behaviour", async () => {
  const seed = demoState();
  seed.requests[0].status = "Draft";
  seed.requests[0].approvals = [];
  delete seed.requests[0].payment;
  delete seed.orders[0].committedAt;
  const w = await app(seed);
  try {
    click(w, "[data-action=demo]");
    await actor(w, "req0");
    click(w, "[data-page=requests]");
    click(w, "[data-tab=inbox]");
    var expand = w.document.querySelector(
      '[data-action=expand][aria-expanded="false"]',
    );
    if (expand) expand.click();
    click(w, "[data-action=openRequest]");
    await flush();
    click(w, "[data-action=submit]");
    await flush();
    assert.match(
      w.document.querySelector("#modal").textContent,
      /Awaiting the next stage|Reviewer/,
    );
    click(w, "[data-action=close]");
    await flush();
    await actor(w, "rev0");
    click(w, "[data-tab=inbox]");
    var expand = w.document.querySelector(
      '[data-action=expand][aria-expanded="false"]',
    );
    if (expand) expand.click();
    click(w, "[data-action=openRequest]");
    await flush();
    assert.ok(w.document.querySelector("[data-action=approve]"));
    click(w, "[data-action=approve]");
    await flush();
    assert.equal(
      w.document.querySelector("[aria-current=step] strong").textContent,
      "Approval 1",
    );
    click(w, "[data-action=close]");
    await flush();
    await actor(w, "app0");
    click(w, "[data-tab=inbox]");
    var expand = w.document.querySelector(
      '[data-action=expand][aria-expanded="false"]',
    );
    if (expand) expand.click();
    click(w, "[data-action=openRequest]");
    await flush();
    click(w, "[data-action=return]");
    w.document.querySelector("[name=reason]").value =
      "Clarify the advance terms";
    submit(w, "[data-form=reason]");
    await flush();
    assert.match(w.document.querySelector("#modal").textContent, /Draft/);
    const saved = JSON.parse(
      w.localStorage.getItem("ss-project-monitoring-demo-v1"),
    );
    assert.equal(saved.requests[0].status, "Draft");
    assert.deepEqual(saved.requests[0].approvals, []);
    assert.equal(
      saved.requests[0].history.at(-1).reason,
      "Clarify the advance terms",
    );
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
      '[data-action=expand][aria-expanded="false"]',
    );
    if (expand) expand.click();
    click(w, "[data-action=openRequest]");
    await flush();
    click(w, "[data-action=editPayment]");
    const percent = w.document.querySelector("#paymentPercent");
    percent.value = "110";
    percent.dispatchEvent(new w.Event("input", { bubbles: true }));
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
    if (exp) exp.click();
    const r0 = w.document.querySelector(
      "[data-action=openRequest][data-id=r0]",
    );
    r0.click();
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
test("Responsive styles switch sidebar, form columns and mobile work items at realistic widths", async () => {
  const css = await readFile(
    new URL("../public/style.css", import.meta.url),
    "utf8",
  );
  for (const width of [1440, 1024, 768, 390]) {
    const w = new Window({ width, height: 900 });
    try {
      const style = w.document.createElement("style");
      style.textContent = css;
      w.document.head.append(style);
      w.document.body.innerHTML =
        '<div class="shell"><aside class="sidebar"></aside><main class="main"><div class="grid2"></div><table class="work-table"><tbody><tr><td>Request</td></tr></tbody></table><div class="advanced-filters" hidden></div></main></div>';
      assert.equal(
        w.getComputedStyle(w.document.querySelector(".sidebar")).position,
        width < 760 ? "static" : "fixed",
      );
      assert.equal(
        w.getComputedStyle(w.document.querySelector(".work-table")).display,
        width < 520 ? "block" : "table",
      );
      assert.equal(
        w.getComputedStyle(w.document.querySelector(".advanced-filters"))
          .display,
        "none",
      );
      if (width === 390)
        assert.equal(
          w
            .getComputedStyle(w.document.querySelector(".grid2"))
            .gridTemplateColumns.replace(/\s/g, ""),
          "minmax(0,1fr)",
        );
    } finally {
      w.close();
    }
  }
});
test("Core text and primary controls meet WCAG AA contrast against their surfaces", async () => {
  const css = await readFile(
      new URL("../public/style.css", import.meta.url),
      "utf8",
    ),
    color = (n) => css.match(new RegExp("--" + n + ": (#[a-fA-F0-9]+)"))[1];
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
  for (const [fg, bg] of [
    [color("ink"), color("canvas")],
    [color("secondary"), color("surface")],
    [color("muted"), color("canvas")],
    [color("muted"), "#f3f7ef"],
    ["#ffffff", color("accent")],
    [color("accent"), color("accent-soft")],
    [color("danger"), color("danger-soft")],
    [color("warning"), color("warning-soft")],
  ])
    assert.ok(contrast(fg, bg) >= 4.5, fg + " on " + bg);
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
    p.dispatchEvent(new w.Event("input", { bubbles: true }));
    assert.equal(a.value, "30000");
    change(w, "paymentCurrency", "MVR");
    assert.equal(a.value, "462600");
    a.value = "771000";
    a.dispatchEvent(new w.Event("input", { bubbles: true }));
    assert.equal(p.value, "50");
    assert.equal(f.elements.firstdate.value, domain.today());
  } finally {
    w.close();
    await w.happyDOM.abort();
  }
});
test("Combined form creates the parent and first child with one submission and keeps dashboards unapproved", async () => {
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
    await new Promise((r) => setTimeout(r, 80));
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
    assert.equal(r.status, "Draft");
    assert.equal(o.committedAt, undefined);
    assert.equal(o.files.length, 1);
    assert.match(
      w.document.querySelector("#modal").textContent,
      /Submit for approval/,
    );
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
    await new Promise((r) => setTimeout(r, 80));
    const r = JSON.parse(
      w.localStorage.getItem("ss-project-monitoring-demo-v1"),
    ).requests.find((r) => r.id === "r1");
    assert.equal(
      r.status,
      "Finance",
      w.document.querySelector("#modal").textContent,
    );
    assert.equal(r.files.length, 2);
    assert.equal(r.approvals.length, 3);
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
 back.click();await flush();assert.equal(w.document.querySelector('#modalTitle').textContent,'Payment request');assert.match(w.document.querySelector('.detail-number').textContent,/PR-2026-000001/);saved=JSON.parse(w.localStorage.getItem('ss-project-monitoring-demo-v1'));assert.ok(saved.locks.r0);assert.equal(saved.locks.o1,undefined);
 click(w,'[data-action=close]');await flush();click(w,'[data-action=openOrder][data-id=o1]');await flush();assert.equal(w.document.querySelector('[data-return-payment]'),null);
 }finally{w.close();await w.happyDOM.abort()}
});
