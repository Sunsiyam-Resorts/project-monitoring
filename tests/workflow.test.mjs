import test from "node:test";
import assert from "node:assert/strict";
import {
  apply,
  visibleState,
  kpis,
  kpiTrend,
  budgetAmount,
  money,
  migrateState,
  remainingToRequest,
  reservation,
  currencyStats,
  supportingFile,
  projectProgress,
} from "../public/domain.js";
import { demoState } from "../public/demo.js";
const now = Date.parse("2026-10-14T12:00:00Z");
function setup() {
  const s = demoState();
  s.orders = [];
  s.requests = [];
  s.audit = [];
  s.locks = {};
  const requester = s.users.find((u) => u.id === "req0");
  const payload = {
    companyId: "c1",
    projectId: "p1",
    budgetId: "b0",
    supplierId: "s1",
    currency: "USD",
    total: 100000,
    po: "PO-1",
    invoice: "INV-1",
    description: "Works",
    allocations: [
      { categoryId: "civil0", amount: 60000 },
      { categoryId: "mep0", amount: 40000 },
    ],
    files: [
      { name: "support.pdf", type: "application/pdf", data: "JVBERi0xLjQK" },
    ],
  };
  const run = (u, type, id, data) => apply(s, u, { type, id, data }, now);
  const lock = (u, id) => run(u, "lock", id);
  run(requester, "order.create", null, payload);
  const o = s.orders[0];
  lock(requester, o.id);
  run(requester, "request.create", null, {
    orderId: o.id,
    percent: 30,
    terms: "Advance",
    date: "2026-10-14",
  });
  const r = s.requests[0];
  lock(requester, r.id);
  return {
    s,
    requester,
    payload,
    run,
    lock,
    o,
    r,
    finance: s.users.find((u) => u.id === "fin"),
    finance2: s.users.find((u) => u.id === "fin2"),
    viewer: s.users.find((u) => u.id === "viewer"),
    admin: s.users[0],
  };
}
// There are no approval stages: submitting sends a payment request straight to Finance.
function approve(x) {
  x.run(x.requester, "request.submit", x.r.id);
  x.run(x.requester, "unlock", x.r.id);
}
test("Admin and Finance can raise requests; each payment request goes to Finance on its own", () => {
  const x = setup();
  x.run(x.admin, "order.create", null, {
    ...x.payload, po: "ADMIN-PO", invoice: "ADMIN-INV",
    payment: { percent: 30 },
  });
  const o = x.s.orders.at(-1), r = x.s.requests.at(-1);
  assert.equal(o.requestedBy, x.admin.id);
  assert.equal(o.team, undefined);
  assert.equal(r.status, "Draft");
  assert.equal(o.committedAt, undefined);
  x.lock(x.admin, r.id);
  x.run(x.admin, "request.edit", r.id, { percent: 40 });
  assert.equal(r.amount, 40000);
  x.run(x.admin, "request.submit", r.id);
  assert.equal(r.status, "Finance");
  assert.ok(o.committedAt);
  assert.throws(() => x.run(x.admin, "request.approve", r.id), /Unknown request action/);
  // Nobody pays a request they raised themselves.
  assert.throws(() => x.run(x.admin, "request.pay", r.id, { paymentDate: "2026-10-14", paymentType: "TT", files: x.payload.files }), /Finance role/);
  assert.throws(() => x.run(x.admin, "request.edit", r.id, { percent: 50 }), /draft/);
  x.lock(x.admin, o.id);
  x.run(x.admin, "request.create", null, { orderId: o.id, percent: 20 });
  assert.equal(x.s.requests.at(-1).status, "Draft");
  assert.deepEqual(x.s.requests.at(-1).approvals, []);
  x.run(x.admin, "order.amend", o.id, { ...x.payload, po: o.po, invoice: o.invoice, description: "Admin proposed correction", reason: "Population correction" });
  assert.equal(o.description, x.payload.description);
  assert.equal(o.amendment.status, "Finance");
  assert.throws(() => x.run(x.admin, "amendment.approve", o.id), /cannot review/);
  x.run(x.admin, "unlock", o.id);
  x.lock(x.finance, o.id);
  x.run(x.finance, "amendment.approve", o.id);
  assert.equal(o.description, "Admin proposed correction");
  // Finance can raise an order too; a different Finance user pays it.
  x.run(x.finance, "order.create", null, { ...x.payload, po: "FIN-PO", invoice: "FIN-INV", payment: { percent: 50 } });
  const fr = x.s.requests.at(-1);
  x.lock(x.finance, fr.id);
  x.run(x.finance, "request.submit", fr.id);
  assert.throws(() => x.run(x.finance, "request.hold", fr.id, { reason: "x" }), /Finance role/);
  x.run(x.finance, "unlock", fr.id);
  x.lock(x.finance2, fr.id);
  x.run(x.finance2, "request.pay", fr.id, { paymentDate: "2026-10-14", paymentType: "Transfer", files: x.payload.files });
  assert.equal(fr.status, "Paid");
});

test("Admin data entry preserves requester ownership, locks, scope and balance limits", () => {
  const x = setup();
  assert.throws(() => x.run(x.admin, "request.edit", x.r.id, { percent: 20 }), /another user/);
  x.run(x.requester, "unlock", x.r.id);
  x.lock(x.admin, x.r.id);
  x.run(x.admin, "request.edit", x.r.id, { percent: 20 });
  assert.equal(x.r.requestedBy, x.requester.id);
  x.run(x.requester, "unlock", x.o.id);
  x.lock(x.admin, x.o.id);
  x.run(x.admin, "request.create", null, { orderId: x.o.id, percent: 30 });
  const child = x.s.requests.at(-1);
  assert.equal(child.requestedBy, x.requester.id);
  assert.equal(child.createdBy, x.admin.id);
  assert.equal(x.s.audit.at(-1).userId, x.admin.id);
  assert.throws(() => x.run(x.admin, "request.create", null, { orderId: x.o.id, percent: 90 }), /remaining/);
  const restricted = { ...x.admin, groupAccess: false, companies: ["c2"] };
  assert.throws(() => x.run(restricted, "request.edit", x.r.id, { percent: 10 }), /not available/);
  assert.throws(() => x.run(restricted, "order.create", null, { ...x.payload, po: "SCOPED-PO" }), /Company access/);
  assert.throws(() => x.run(x.viewer, "order.create", null, { ...x.payload, po: "VIEW-PO" }), /role required/);
  x.run(x.finance, "order.create", null, { ...x.payload, po: "FIN-PO", invoice: "FIN-INV" });
  assert.equal(x.s.orders.at(-1).requestedBy, x.finance.id);
});
test("Submitting sends a payment request straight to Finance and commits the full parent once", () => {
  const x = setup();
  assert.equal(x.r.amount, 30000);
  assert.equal(x.o.committedAt, undefined);
  assert.equal(kpis(x.s).commitment, 0);
  x.run(x.requester, "request.submit", x.r.id);
  assert.equal(x.r.status, "Finance");
  assert.ok(x.r.finalApprovedAt);
  assert.deepEqual(x.r.approvals, []);
  assert.equal(x.o.commitmentRequestId, x.r.id);
  assert.equal(kpis(x.s).commitment, 100000);
});


test("Second child starts draft with no inherited approvals and cannot double commit", () => {
  const x = setup();
  approve(x);
  x.lock(x.requester, x.o.id);
  x.run(x.requester, "request.create", null, {
    orderId: x.o.id,
    percent: 70,
    terms: "Balance",
  });
  const second = x.s.requests[1];
  assert.equal(second.status, "Draft");
  assert.deepEqual(second.approvals, []);
  assert.equal(kpis(x.s).commitment, 100000);
  assert.throws(
    () =>
      x.run(x.requester, "request.create", null, {
        orderId: x.o.id,
        percent: 1,
        terms: "Extra",
      }),
    /remaining/,
  );
});
test("Submission removes direct editing; parent changes require an amendment", () => {
  const x = setup();
  x.run(x.requester, "request.submit", x.r.id);
  assert.throws(
    () =>
      x.run(x.requester, "request.edit", x.r.id, {
        percent: 40,
        terms: "Changed",
      }),
    /draft/,
  );
  assert.throws(
    () => x.run(x.requester, "order.edit", x.o.id, x.payload),
    /reason/,
  );
  x.run(x.requester, "order.amend", x.o.id, {
    ...x.payload,
    description: "Proposed",
    reason: "Updated scope",
  });
  assert.equal(x.o.description, "Works");
  assert.equal(x.o.amendment.status, "Finance");
});
test("Finance return goes to the requester, who corrects and resubmits to Finance", () => {
  const x = setup();
  approve(x);
  x.lock(x.finance, x.r.id);
  assert.throws(() => x.run(x.finance, "request.return", x.r.id), /Reason/);
  x.run(x.finance, "request.return", x.r.id, { reason: "Correct terms" });
  assert.equal(x.r.status, "Draft");
  assert.equal(x.r.finalApprovedAt, undefined);
  x.run(x.finance, "unlock", x.r.id);
  x.lock(x.requester, x.r.id);
  x.run(x.requester, "request.submit", x.r.id);
  assert.equal(x.r.status, "Finance");
  assert.equal(x.r.history.at(-1).reason, "Correct terms");
});

test("Rejection requires reason and releases child allocation", () => {
  const x = setup();
  x.run(x.requester, "request.submit", x.r.id);
  x.run(x.requester, "unlock", x.r.id);
  x.lock(x.finance, x.r.id);
  assert.throws(() => x.run(x.finance, "request.reject", x.r.id), /Reason/);
  x.run(x.finance, "request.reject", x.r.id, { reason: "Not accepted" });
  x.run(x.finance, "unlock", x.r.id);
  x.run(x.requester, "request.create", null, {
    orderId: x.o.id,
    percent: 100,
    terms: "Replacement",
  });
  assert.equal(x.s.requests[1].amount, 100000);
});
test("Only Finance or Admin, never the requester or a Viewer, act on a submitted request", () => {
  const x = setup();
  x.run(x.requester, "request.submit", x.r.id);
  assert.throws(() => x.run(x.requester, "request.hold", x.r.id, { reason: "x" }), /Finance role/);
  assert.throws(() => x.run(x.requester, "request.return", x.r.id, { reason: "x" }), /cannot review/);
  assert.throws(() => x.run(x.requester, "request.approve", x.r.id), /Unknown request action/);
  x.run(x.requester, "unlock", x.r.id);
  x.lock(x.viewer, x.r.id);
  assert.throws(() => x.run(x.viewer, "request.hold", x.r.id, { reason: "x" }), /Finance role/);
  assert.throws(() => x.run(x.viewer, "request.reject", x.r.id, { reason: "x" }), /cannot review/);
  x.run(x.viewer, "unlock", x.r.id);
  x.lock(x.admin, x.r.id);
  x.run(x.admin, "request.hold", x.r.id, { reason: "Admin can act at Finance" });
  assert.equal(x.r.status, "On Hold");
});

test("On hold requires reason; exact payment requires date, type and separate PDF", () => {
  const x = setup();
  approve(x);
  x.lock(x.finance, x.r.id);
  assert.throws(() => x.run(x.finance, "request.hold", x.r.id), /Reason/);
  x.run(x.finance, "request.hold", x.r.id, { reason: "Bank confirmation" });
  assert.equal(x.r.status, "On Hold");
  assert.throws(() => x.run(x.finance, "request.pay", x.r.id, {}), /Release/);
  x.run(x.finance, "request.resume", x.r.id);
  assert.throws(
    () =>
      x.run(x.finance, "request.pay", x.r.id, {
        paymentDate: "2026-10-14",
        paymentType: "Transfer",
      }),
    /PDF/,
  );
  x.run(x.finance, "request.pay", x.r.id, {
    amount: 1,
    paymentDate: "2026-10-14",
    paymentType: "Transfer",
    file: x.payload.files[0],
  });
  assert.equal(x.r.payment.amount, 30000);
  assert.equal(x.r.status, "Paid");
  assert.throws(
    () =>
      x.run(x.finance, "request.remark", x.r.id, { reason: "After payment" }),
    /submitted request/,
  );
});
test("Finance sees full commitment including unrequested balances", () => {
  const x = setup();
  approve(x);
  assert.equal(kpis(x.s).notReceived, 70000);
  assert.equal(kpis(x.s).finance, 30000);
  assert.equal(kpis(x.s).outstanding, 30000);
  x.lock(x.finance, x.r.id);
  x.run(x.finance, "request.pay", x.r.id, {
    paymentDate: "2026-10-14",
    paymentType: "TT",
    file: x.payload.files[0],
  });
  assert.equal(kpis(x.s).paid, 30000);
  assert.equal(kpis(x.s).notReceived, 70000);
});
test("PO duplicates span all requesters in the same company; invoice duplicates span same supplier", () => {
  const x = setup();
  const p = { ...x.payload, invoice: "NEW" };
  assert.throws(
    () =>
      x.run(
        x.s.users.find((u) => u.id === "req1"),
        "order.create",
        null,
        p,
      ),
    /Duplicate PO/,
  );
  assert.throws(
    () =>
      x.run(x.requester, "order.create", null, { ...x.payload, po: "PO-2" }),
    /Duplicate invoice/,
  );
  x.run(x.requester, "order.create", null, {
    ...x.payload,
    po: "PO-3",
    supplierId: "s2",
  });
  assert.equal(x.s.orders.length, 2);
});
test("Multiple category allocations must sum to full order", () => {
  const x = setup();
  assert.throws(
    () =>
      x.run(x.requester, "order.create", null, {
        ...x.payload,
        po: "PO-2",
        invoice: "INV-2",
        allocations: [{ categoryId: "civil0", amount: 1 }],
      }),
    /equal/,
  );
});
test("Budget exceeded does not block approval", () => {
  const x = setup();
  x.o.total = 2000000;
  x.o.allocations = [{ categoryId: "civil0", amount: 2000000 }];
  approve(x);
  assert.equal(kpis(x.s, "c1", "p1").available, -400000);
});
test("MVR conversion uses units per USD and preserves order rate", () => {
  const x = setup();
  x.o.currency = "MVR";
  x.o.total = 1542000;
  x.o.rate = 15.42;
  x.o.allocations = [{ categoryId: "civil0", amount: 1542000 }];
  approve(x);
  assert.equal(kpis(x.s).commitment, 100000);
  x.s.currencies.find((c) => c.id === "MVR").rate = 20;
  assert.equal(kpis(x.s).commitment, 100000);
});
test("Company scoping hides inaccessible records and all secret hashes", () => {
  const x = setup();
  const u = { ...x.finance, groupAccess: false, companies: ["c2"] };
  x.s.users[0].passwordHash = "SECRET";
  x.s.users[0].totpSecret = "SECRET";
  const v = visibleState(x.s, u);
  assert.equal(v.orders.length, 0);
  assert.equal(v.requests.length, 0);
  assert.equal(v.companies.length, 1);
  assert.ok(!JSON.stringify(v).includes("SECRET"));
  assert.throws(() => x.run(u, "lock", x.r.id), /available/);
});
test("10-minute record lock blocks opening by another user and Admin can release", () => {
  const x = setup();
  assert.throws(() => x.lock(x.finance, x.r.id), /another user/);
  x.run(x.admin, "unlock", x.r.id);
  x.lock(x.finance, x.r.id);
  assert.equal(x.s.locks[x.r.id].expires, now + 600000);
  apply(x.s, x.requester, { type: "lock", id: x.r.id }, now + 600001);
  assert.equal(x.s.locks[x.r.id].userId, x.requester.id);
});
test("Expired lock cannot authorize mutation", () => {
  const x = setup();
  assert.throws(
    () =>
      apply(
        x.s,
        x.requester,
        { type: "request.submit", id: x.r.id },
        now + 600001,
      ),
    /again/,
  );
});
test("Number format changes retain sequence and existing numbers", () => {
  const x = setup();
  const original = x.r.number;
  x.run(x.admin, "settings.save", null, {
    orderFormat: "{COMPANY}-{PROJECT}-REQ-{SEQ}",
    numberFormat: "{COMPANY}-{PROJECT}-SS-{SEQ}",
    lockMinutes: 10,
  });
  x.run(x.requester, "request.create", null, {
    orderId: x.o.id,
    percent: 20,
    terms: "Second",
  });
  assert.match(x.s.requests[1].number, /^SSO-TMP-SS-00000[0-9]$/);
  assert.equal(x.r.number, original);
  assert.throws(
    () =>
      x.run(x.admin, "settings.save", null, {
        numberFormat: "SS",
        lockMinutes: 10,
      }),
    /SEQ/,
  );
});
test("Budget revisions keep prior approved values and demand reason", () => {
  const x = setup();
  const b = structuredClone(x.s.budgets[0]);
  b.categories[0].amount = 1000000;
  assert.throws(
    () => x.run(x.admin, "master.save", null, { kind: "budgets", record: b }),
    /reason/,
  );
  x.run(x.admin, "master.save", null, {
    kind: "budgets",
    record: b,
    reason: "Approved variation",
  });
  assert.equal(x.s.budgets[0].revisions[0].categories[0].amount, 900000);
});
test("Finance and Admin manage master data and budgets; only Admin manages users and settings", () => {
  const x = setup();
  x.run(x.finance, "master.save", null, { kind: "companies", record: { name: "Finance Co", code: "FCO" } });
  assert.ok(x.s.companies.some((c) => c.code === "FCO"));
  const b = structuredClone(x.s.budgets[0]);
  b.categories[0].amount = 950000;
  x.run(x.finance, "master.save", null, { kind: "budgets", record: b, reason: "Finance revision" });
  assert.equal(x.s.budgets[0].revisions.at(-1).by, x.finance.name);
  for (const u of [x.requester, x.viewer])
    assert.throws(() => x.run(u, "master.save", null, { kind: "companies", record: { name: "X", code: "XX" } }), /Finance or Admin/);
  assert.throws(() => x.run(x.finance, "settings.save", null, {}), /Admin/);
  assert.throws(() => x.run(x.finance, "user.save", null, { record: { ...x.viewer, role: "Admin" } }), /Admin required/);
});

test("At least one active Admin remains", () => {
  const x = setup();
  assert.throws(
    () =>
      x.run(x.admin, "user.save", null, {
        record: { ...x.admin, active: false },
      }),
    /at least one/,
  );
});
test("Non-PDF and oversized supporting is rejected", () => {
  const x = setup();
  assert.throws(
    () =>
      x.run(x.requester, "order.create", null, {
        ...x.payload,
        po: "PO-2",
        invoice: "INV-2",
        files: [{ name: "x.pdf", type: "application/pdf", data: "evil" }],
      }),
    /valid/,
  );
});
test("Audit identifies actor, action, record and company", () => {
  const x = setup();
  approve(x);
  assert.ok(
    x.s.audit.some(
      (a) =>
        a.action === "request.submit" &&
        a.user === "Project Requester" &&
        a.companyId === "c1" &&
        a.entity === x.r.id,
    ),
  );
});

test("Unapproved reservations hide a fully raised order without affecting dashboard payment balances", () => {
  const x = setup();
  approve(x);
  x.lock(x.requester, x.o.id);
  x.run(x.requester, "request.create", null, { orderId: x.o.id, percent: 70 });
  assert.equal(remainingToRequest(x.s, x.o), 0);
  const k = kpis(x.s);
  assert.equal(k.balance, 70000);
  assert.equal(k.outstanding, 30000);
  assert.equal(k.utilized, k.paid + k.outstanding + k.hold + k.balance);
});
test("Held amounts are separate from outstanding; rejection restores dashboard balance without releasing utilization", () => {
  const x = setup();
  approve(x);
  x.lock(x.finance, x.r.id);
  x.run(x.finance, "request.hold", x.r.id, {
    reason: "Missing bank confirmation",
  });
  let k = kpis(x.s);
  assert.equal(k.finance, 0);
  assert.equal(k.hold, 30000);
  assert.equal(k.outstanding, 0);
  assert.equal(k.balance, 70000);
  assert.equal(k.utilized, k.paid + k.outstanding + k.hold + k.balance);
  x.run(x.finance, "request.reject", x.r.id, {
    reason: "Order payment cancelled",
  });
  k = kpis(x.s);
  assert.equal(k.utilized, 100000);
  assert.equal(k.outstanding, 0);
  assert.equal(k.hold, 0);
  assert.equal(k.balance, 100000);
  assert.equal(remainingToRequest(x.s, x.o), 100000);
});
test("Finance financial correction removes current approvals and requires the whole workflow again", () => {
  const x = setup();
  approve(x);
  x.lock(x.finance, x.r.id);
  x.run(x.finance, "request.return", x.r.id, {
    reason: "Correct financial terms",
  });
  assert.equal(kpis(x.s).outstanding, 0);
  assert.equal(kpis(x.s).balance, 100000);
  assert.equal(kpis(x.s).utilized, 100000);
  x.run(x.finance, "unlock", x.r.id);
  x.lock(x.requester, x.r.id);
  x.run(x.requester, "request.edit", x.r.id, {
    amount: 20000,
    currency: "USD",
    terms: "Corrected",
  });
  approve(x);
  assert.equal(kpis(x.s).outstanding, 20000);
});
test("Additional supporting preserves final approval and returns directly to Finance with multiple files", () => {
  const x = setup();
  approve(x);
  x.lock(x.finance, x.r.id);
  x.run(x.finance, "request.documents", x.r.id, {
    reason: "Bank letter and revised invoice",
  });
  assert.equal(kpis(x.s).outstanding, 30000);
  assert.equal(x.r.status, "Documents Required");
  const approvals = structuredClone(x.r.approvals);
  x.run(x.finance, "unlock", x.r.id);
  x.lock(x.requester, x.r.id);
  assert.throws(
    () => x.run(x.requester, "request.edit", x.r.id, { percent: 20 }),
    /draft/,
  );
  x.run(x.requester, "request.support", x.r.id, {
    files: [x.payload.files[0], { ...x.payload.files[0], name: "bank.pdf" }],
  });
  assert.equal(x.r.status, "Finance");
  assert.deepEqual(x.r.approvals, approvals);
  assert.equal(x.r.files.length, 2);
  assert.ok(!JSON.stringify(visibleState(x.s, x.finance)).includes("JVBERi0"));
});
test("Finance or Admin can delete a paid payment, with remarks and actual removal of supporting and details", () => {
  const x = setup();
  approve(x);
  x.lock(x.finance, x.r.id);
  x.run(x.finance, "request.pay", x.r.id, {
    paymentDate: "2026-10-14",
    paymentType: "TT",
    files: [x.payload.files[0], { ...x.payload.files[0], name: "second.pdf" }],
  });
  assert.throws(
    () => x.run(x.finance, "request.reject", x.r.id, { reason: "Reject" }),
    /cannot review/,
  );
  x.run(x.finance, "unlock", x.r.id);
  x.lock(x.requester, x.r.id);
  assert.throws(
    () => x.run(x.requester, "request.deletePayment", x.r.id, { reason: "Wrong evidence" }),
    /Only Finance or Admin/,
  );
  x.run(x.requester, "unlock", x.r.id);
  x.lock(x.finance, x.r.id);
  assert.throws(() => x.run(x.finance, "request.deletePayment", x.r.id), /Reason/);
  x.run(x.finance, "request.deletePayment", x.r.id, { reason: "Incorrect payment entry" });
  assert.equal(x.r.payment, undefined);
  assert.equal(x.r.status, "Finance");
  assert.equal(kpis(x.s).paid, 0);
  assert.equal(kpis(x.s).outstanding, 30000);
  assert.ok(x.r.history.some((h) => h.action === "Payment deleted" && h.reason === "Incorrect payment entry"));
  x.run(x.finance, "request.reject", x.r.id, { reason: "Cancelled payment request" });
  assert.equal(x.r.status, "Rejected");
});

test("Parent rejection requires all children rejected and releases budget only at parent rejection", () => {
  const x = setup();
  approve(x);
  x.run(x.requester, "unlock", x.o.id);
  x.lock(x.admin, x.o.id);
  assert.throws(
    () => x.run(x.admin, "order.reject", x.o.id, { reason: "Cancelled order" }),
    /all child/,
  );
  x.lock(x.admin, x.r.id);
  x.run(x.admin, "request.reject", x.r.id, { reason: "Cancelled instalment" });
  assert.equal(kpis(x.s).utilized, 100000);
  x.run(x.admin, "order.reject", x.o.id, { reason: "Cancelled order" });
  assert.equal(kpis(x.s).utilized, 0);
  assert.equal(kpis(x.s).balance, 0);
});
test("Cross-currency requests reserve a frozen parent equivalent and preserve rates after master changes", () => {
  const x = setup();
  x.run(x.requester, "request.edit", x.r.id, { currency: "MVR", percent: 30 });
  assert.equal(x.r.amount, 462600);
  assert.equal(x.r.orderAmount, 30000);
  assert.equal(x.r.rate, 15.42);
  approve(x);
  assert.equal(kpis(x.s).outstanding, 30000);
  x.s.currencies.find((c) => c.id === "MVR").rate = 20;
  assert.equal(x.r.rate, 15.42);
  assert.equal(kpis(x.s).outstanding, 30000);
  x.lock(x.requester, x.o.id);
  x.run(x.requester, "request.create", null, {
    orderId: x.o.id,
    currency: "MVR",
    amount: 1400000,
  });
  assert.equal(x.s.requests[1].orderAmount, 70000);
  assert.equal(remainingToRequest(x.s, x.o), 0);
  assert.equal(kpis(x.s).balance, 70000);
  assert.throws(
    () =>
      x.run(x.requester, "request.create", null, {
        orderId: x.o.id,
        currency: "USD",
        amount: 1,
      }),
    /remaining/,
  );
});
test("Parent amendment holds effective text and amounts until Finance approves it", () => {
  const x = setup();
  approve(x);
  x.lock(x.requester, x.o.id);
  x.run(x.requester, "order.amend", x.o.id, {
    ...x.payload,
    total: 150000,
    description: "Expanded scope",
    allocations: [{ categoryId: "civil0", amount: 150000 }],
    reason: "Approved variation",
  });
  assert.equal(x.o.total, 100000);
  assert.equal(x.o.description, "Works");
  assert.equal(kpis(x.s).utilized, 100000);
  assert.equal(x.o.amendment.status, "Finance");
  assert.throws(() => x.run(x.requester, "amendment.approve", x.o.id), /cannot review/);
  x.run(x.requester, "unlock", x.o.id);
  x.lock(x.finance, x.o.id);
  x.run(x.finance, "amendment.approve", x.o.id);
  assert.equal(x.o.total, 150000);
  assert.equal(x.o.description, "Expanded scope");
  assert.equal(kpis(x.s).utilized, 150000);
  assert.equal(kpis(x.s).outstanding, 30000);
  assert.equal(kpis(x.s).balance, 120000);
  assert.equal(x.o.amendments[0].previous.total, 100000);
  assert.equal(x.r.percent, 30);
  assert.equal(x.r.amount, 30000);
});

test("Amendment documents stay retrievable by version with company access and a live parent lock", () => {
  const x = setup();
  x.approver = x.finance;
  const original = structuredClone(x.o.files[0]);
  const revised = { ...original, name: "revised-scope.pdf", data: "JVBERi0xLjUK" };
  x.run(x.requester, "order.amend", x.o.id, {
    ...x.payload, files: [revised], reason: "Scope clarification",
  });
  const version = x.o.amendment.id;
  x.run(x.requester, "unlock", x.o.id);
  x.lock(x.approver, x.o.id);
  x.run(x.approver, "amendment.return", x.o.id, { reason: "Correct description" });
  x.run(x.approver, "unlock", x.o.id);
  x.lock(x.requester, x.o.id);
  x.run(x.requester, "order.amend", x.o.id, {
    ...x.payload, description: "Corrected scope", files: [revised], reason: "Corrected proposal",
  });
  const locator = { id: x.o.id, kind: "amendment-attempt", version };
  assert.deepEqual(supportingFile(x.s, x.requester, locator, now), revised);
  assert.deepEqual(supportingFile(x.s, x.requester, { ...locator, side: "previous" }, now), original);
  x.run(x.requester, "unlock", x.o.id);
  x.lock(x.approver, x.o.id);
  x.run(x.approver, "amendment.approve", x.o.id);
  const archived = { id: x.o.id, kind: "amendment-history", version: x.o.amendments[0].id };
  assert.deepEqual(supportingFile(x.s, x.approver, archived, now), revised);
  assert.deepEqual(supportingFile(x.s, x.approver, { ...archived, side: "previous" }, now), original);
  assert.throws(() => supportingFile(x.s, { ...x.approver, companies: [], groupAccess: false }, archived, now), /not available/);
  assert.throws(() => supportingFile(x.s, x.requester, archived, now), /another user/);
  assert.throws(() => supportingFile(x.s, x.approver, archived, now + 600001), /obtain a lock/);
  assert.throws(() => supportingFile(x.s, x.approver, { ...archived, version: "unknown" }, now), /not available/);
  assert.throws(() => supportingFile(x.s, x.approver, { ...archived, side: "passwordHash" }, now), /Invalid document version/);
  assert.throws(() => supportingFile(x.s, x.approver, { ...archived, index: -1 }, now), /Invalid file index/);
  assert.throws(() => supportingFile(x.s, x.approver, { ...archived, kind: "unknown" }, now), /Invalid document type/);
  const visible = visibleState(x.s, x.approver).orders.find((o) => o.id === x.o.id);
  assert.equal(visible.amendments[0].previous.files[0].data, undefined);
  assert.equal(visible.amendmentAttempts[0].data.files[0].data, undefined);
  assert.equal(x.o.files[0].data, revised.data);
});
test("Reduction cannot contradict any non-rejected children and pending reduction limits new reservations", () => {
  const x = setup();
  x.run(x.requester, "order.amend", x.o.id, {
    ...x.payload,
    total: 50000,
    allocations: [{ categoryId: "civil0", amount: 50000 }],
    reason: "Reduced scope",
  });
  assert.throws(
    () =>
      x.run(x.requester, "request.create", null, {
        orderId: x.o.id,
        amount: 25000,
      }),
    /remaining/,
  );
  assert.throws(() => {
    x.o.amendment.status = "Rejected";
    x.run(x.requester, "order.amend", x.o.id, {
      ...x.payload,
      total: 20000,
      allocations: [{ categoryId: "civil0", amount: 20000 }],
      reason: "Reduction",
    });
  }, /Reject conflicting/);
});
test("Budget currency and revisions retain original and USD totals", () => {
  const x = setup(),
    b = structuredClone(x.s.budgets[0]);
  b.currency = "MVR";
  b.categories = [
    { ...b.categories[0], amount: 15420000 },
    ...b.categories.slice(1),
  ];
  x.run(x.admin, "master.save", null, {
    kind: "budgets",
    record: b,
    reason: "Currency-approved budget",
  });
  assert.equal(x.s.budgets[0].rate, 15.42);
  assert.equal(x.s.budgets[0].revisions[0].currency, "USD");
  const before = kpis(x.s).budget;
  x.s.currencies.find((c) => c.id === "MVR").rate = 20;
  assert.equal(kpis(x.s).budget, before);
});
test("Company/project numbering is independent, immutable and counters cannot be reset through Settings", () => {
  const x = setup(),
    old = x.r.number,
    key = "c1:p1:payment",
    counter = x.s.counters[key];
  x.run(x.admin, "settings.save", null, {
    orderFormat: "{COMPANY}-{PROJECT}-REQ-{SEQ}",
    numberFormat: "{COMPANY}-{PROJECT}-PAY-{YYYY}-{SEQ}",
    lockMinutes: 10,
    counters: {},
  });
  assert.equal(x.s.counters[key], counter);
  x.run(x.requester, "order.create", null, {
    ...x.payload,
    projectId: "p2",
    budgetId: "b1",
    po: "PO-OTHER",
    invoice: "INV-OTHER",
    allocations: [{ categoryId: "civil1", amount: 100000 }],
  });
  const o = x.s.orders.at(-1);
  x.lock(x.requester, o.id);
  x.run(x.requester, "request.create", null, { orderId: o.id, percent: 10 });
  assert.equal(x.s.counters["c1:p2:payment"], 3);
  assert.match(x.s.requests.at(-1).number, /SSO-VR-PAY-2026-000003/);
  assert.equal(x.r.number, old);
});
test("Migration is idempotent, keeps legacy references, documents and audit, and retires the approval workflow", () => {
  const s = demoState();
  s.version = 1;
  delete s.counters;
  delete s.settings.orderFormat;
  delete s.tasks;
  for (const o of s.orders) delete o.number;
  const r = s.requests[3];
  delete r.currency;
  delete r.orderAmount;
  r.status = "Approval 1";
  r.team = "Planning";
  s.users.push({ id: "legacy", name: "Legacy Approver", username: "legacy", email: "legacy@example.com", role: "Approver", team: "Purchasing", approvalLevel: 2, companies: ["c1"], active: true });
  const o = s.orders.find((x) => x.id === r.orderId);
  delete o.committedAt;
  const old = s.requests.map((r) => r.number),
    files = structuredClone(s.orders[0].files),
    audit = s.audit.length;
  migrateState(s, now);
  assert.deepEqual(s.requests.map((r) => r.number), old);
  assert.deepEqual(s.orders[0].files, files);
  assert.equal(r.status, "Finance");
  assert.ok(r.finalApprovedAt);
  assert.ok(o.committedAt);
  const legacy = s.users.find((u) => u.id === "legacy");
  assert.equal(legacy.role, "Viewer");
  assert.equal(legacy.team, undefined);
  assert.equal(legacy.approvalLevel, undefined);
  assert.equal(s.audit.length, audit + 2);
  assert.deepEqual(s.tasks, []);
  assert.equal(s.version, 3);
  const snapshot = JSON.stringify(s);
  migrateState(s, now);
  assert.equal(JSON.stringify(s), snapshot);
  assert.equal(s.orders.length, 4);
});

test("Retired approval roles cannot be assigned", () => {
  const x = setup();
  for (const role of ["Reviewer", "Approver"])
    assert.throws(() => x.run(x.admin, "user.save", null, { record: { ...x.viewer, role } }), /single role/);
  x.run(x.admin, "user.save", null, { record: { ...x.viewer, role: "Finance", team: "Purchasing", approvalLevel: 2 } });
  const u = x.s.users.find((y) => y.id === x.viewer.id);
  assert.equal(u.role, "Finance");
  assert.equal(u.team, undefined);
  assert.equal(u.approvalLevel, undefined);
});

test("Only Finance and Admin change project tasks; progress is the share of tasks Done", () => {
  const x = setup();
  const before = projectProgress(x.s, "p1");
  assert.equal(before.total, 17);
  assert.equal(before.done, 8);
  assert.equal(before.pct, 47);
  const record = { projectId: "p1", name: "Commissioning", status: "To do", due: "2027-06-30", owner: "MEP contractor" };
  for (const u of [x.requester, x.viewer])
    assert.throws(() => x.run(u, "task.save", null, { record }), /Only Finance or Admin/);
  assert.throws(() => x.run({ ...x.finance, groupAccess: false, companies: ["c2"] }, "task.save", null, { record }), /Only Finance or Admin/);
  assert.throws(() => x.run(x.finance, "task.save", null, { record: { ...record, name: " " } }), /Task name/);
  assert.throws(() => x.run(x.finance, "task.save", null, { record: { ...record, status: "Blocked" } }), /status/);
  assert.throws(() => x.run(x.finance, "task.save", null, { record: { ...record, due: "30/06/2027" } }), /due date/);
  assert.throws(() => x.run(x.finance, "task.save", null, { record: { ...record, projectId: "nope" } }), /valid project/);
  x.run(x.finance, "task.save", null, { record });
  const t = x.s.tasks.at(-1);
  assert.equal(t.companyId, "c1");
  assert.equal(t.createdBy, x.finance.id);
  assert.equal(x.s.audit.at(-1).action, "task.save");
  assert.equal(x.s.audit.at(-1).entity, t.id);
  assert.equal(projectProgress(x.s, "p1").pct, 44);
  x.run(x.admin, "task.save", null, { record: { ...t, status: "Done", projectId: "p2" } });
  const saved = x.s.tasks.find((y) => y.id === t.id);
  assert.equal(saved.projectId, "p1", "a task cannot move project");
  assert.ok(saved.completedAt);
  assert.equal(projectProgress(x.s, "p1").pct, 50);
  x.run(x.finance, "task.save", null, { record: { ...saved, status: "In progress" } });
  assert.equal(x.s.tasks.find((y) => y.id === t.id).completedAt, undefined);
  assert.throws(() => x.run(x.requester, "task.delete", t.id), /Only Finance or Admin/);
  x.run(x.finance, "task.delete", t.id);
  assert.ok(!x.s.tasks.some((y) => y.id === t.id));
  assert.equal(x.s.audit.at(-1).action, "task.delete");
  assert.equal(projectProgress(x.s, "p1").pct, 47);
  assert.equal(projectProgress(x.s, "missing").pct, null);
  assert.equal(projectProgress(x.s, "p1", Date.parse("2027-03-01T00:00:00Z")).overdue, 5);
  // Tasks follow company visibility.
  const scoped = visibleState(x.s, { ...x.viewer, groupAccess: false, companies: ["c2"] });
  assert.ok(scoped.tasks.length > 0 && scoped.tasks.every((t) => t.companyId === "c2"));
});

test('Held cross-currency requests remain visible in currency stats and never overlap Outstanding through document collection, release and payment', () => {
  const x = setup();
  x.run(x.requester, 'request.edit', x.r.id, {currency:'MVR',percent:30});
  approve(x);
  x.lock(x.finance, x.r.id);
  x.run(x.finance, 'request.hold', x.r.id, {reason:'Bank confirmation'});
  const reconcile = (expected) => {
    const k = kpis(x.s);
    assert.deepEqual([k.paid,k.outstanding,k.hold,k.balance],expected);
    assert.equal(k.utilized,money(k.paid+k.outstanding+k.hold+k.balance));
  };
  reconcile([0,0,30000,70000]);
  let cur=currencyStats(x.s).find(c=>c.currency==='MVR');
  assert.ok(cur);
  assert.equal(cur.outstanding,0);
  assert.equal(cur.hold,462600);
  x.run(x.finance,'request.documents',x.r.id,{reason:'Bank letter'});
  reconcile([0,0,30000,70000]);
  assert.equal(currencyStats(x.s).find(c=>c.currency==='MVR').hold,462600);
  x.run(x.finance,'unlock',x.r.id);
  x.lock(x.requester,x.r.id);
  x.run(x.requester,'request.support',x.r.id,{files:x.payload.files});
  reconcile([0,0,30000,70000]);
  x.run(x.requester,'unlock',x.r.id);
  x.lock(x.finance,x.r.id);
  x.run(x.finance,'request.resume',x.r.id);
  reconcile([0,30000,0,70000]);
  cur=currencyStats(x.s).find(c=>c.currency==='MVR');
  assert.equal(cur.outstanding,462600);
  assert.equal(cur.hold,0);
  x.run(x.finance,'request.pay',x.r.id,{paymentDate:'2026-10-14',paymentType:'Transfer',files:x.payload.files});
  reconcile([30000,0,0,70000]);
  cur=currencyStats(x.s).find(c=>c.currency==='MVR');
  assert.equal(cur.paid,462600);
  assert.equal(cur.outstanding,0);
  assert.equal(cur.hold,0);
});

test("KPI trend is a year-to-date monthly series rebuilt from commitment dates and budget revisions", () => {
  const s = demoState();
  const at = Date.parse("2026-11-05T12:00:00Z");
  const trend = kpiTrend(s, "", "", { now: at });
  const k = kpis(s);
  assert.equal(trend.budget[0].start, Date.UTC(2026, 0, 1));
  assert.equal(trend.budget.at(-1).end, at);
  for (const key of ["budget", "utilized", "available"]) {
    assert.equal(trend[key].length, 11);
    assert.equal(trend[key].at(-1).close, k[key]);
    trend[key].forEach((c) => assert.ok(c.low <= Math.min(c.open, c.close) && c.high >= Math.max(c.open, c.close)));
  }
  // Commitments only ever add to utilized and take from available.
  trend.utilized.forEach((c) => assert.ok(c.close >= c.open));
  trend.available.forEach((c, i) => assert.equal(c.close, money(trend.budget[i].close - trend.utilized[i].close)));
  assert.equal(trend.utilized[0].open, 0);
  // A budget revision appears in the month it was recorded, at the previous value before it.
  const b = s.budgets[0];
  const before = budgetAmount(b);
  b.revisions = [{ at: "2026-10-28T09:00:00Z", currency: b.currency, rate: b.rate, categories: b.categories.map((c) => ({ ...c, amount: c.amount / 2 })) }];
  const revised = kpiTrend(s, b.companyId, b.projectId, { now: at });
  const month = revised.budget[9];
  assert.equal(month.start, Date.UTC(2026, 9, 1));
  assert.equal(month.open, money(before / 2));
  assert.equal(month.close, before);
  // The October commitments appear in the October candle.
  assert.ok(trend.utilized[9].close > trend.utilized[9].open);
  assert.equal(revised.budget[0].open, money(before / 2));
  assert.ok(revised.budget.filter((c) => c.close > c.open).length === 1);
});

test("KPI trends over the demo's year of history end at the current figures for every tile", () => {
  const s = demoState({ history: true });
  const at = Date.parse("2026-11-05T12:00:00Z");
  for (const [company, project] of [["", ""], ["c1", ""], ["c2", "p3"], ["c3", "p4"]]) {
    const trend = kpiTrend(s, company, project, { now: at });
    const k = kpis(s, company, project);
    for (const key of ["budget", "utilized", "available", "paid", "outstanding", "hold", "balance"]) {
      assert.equal(trend[key].at(-1).close, k[key], company + project + " " + key);
    }
  }
  const all = kpiTrend(s, "", "", { now: at });
  assert.ok(all.budget.some((c) => c.close > c.open) && all.budget.some((c) => c.close < c.open));
  assert.ok(all.paid.every((c) => c.close >= c.open));
  assert.ok(all.hold.some((c) => c.close < c.open), "a released hold appears as a fall");
});
