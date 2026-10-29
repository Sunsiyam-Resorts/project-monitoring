import test from "node:test";
import assert from "node:assert/strict";
import {
  apply,
  visibleState,
  kpis,
  money,
  migrateState,
  remainingToRequest,
  reservation,
  currencyStats,
} from "../public/domain.js";
import { demoState } from "../public/demo.js";
const now = Date.parse("2026-10-14T12:00:00Z");
function setup(team = "Purchasing") {
  const s = demoState();
  s.orders = [];
  s.requests = [];
  s.audit = [];
  s.locks = {};
  const i = team === "Purchasing" ? 0 : 1;
  const requester = s.users.find((u) => u.id === "req" + i);
  const payload = {
    companyId: "c1",
    projectId: "p1",
    budgetId: "b0",
    supplierId: "s1",
    team,
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
    reviewer: s.users.find((u) => u.id === "rev" + i),
    approver: s.users.find((u) => u.id === "app" + i),
    final: s.users.find((u) => u.id === "app2"),
    finance: s.users.find((u) => u.id === "fin"),
    admin: s.users[0],
  };
}
function advance(x, u) {
  x.run(x.requester, "unlock", x.r.id);
  x.lock(u, x.r.id);
  x.run(u, "request.approve", x.r.id);
  x.run(u, "unlock", x.r.id);
}
function approve(x) {
  x.run(x.requester, "request.submit", x.r.id);
  if (x.o.team === "Purchasing") advance(x, x.reviewer);
  advance(x, x.approver);
  if (x.o.team === "Purchasing") advance(x, x.final);
}
test("Purchasing child requires reviewer and two approvals, then commits full parent once", () => {
  const x = setup();
  assert.equal(x.r.amount, 30000);
  assert.equal(x.o.committedAt, undefined);
  x.run(x.requester, "request.submit", x.r.id);
  assert.equal(x.r.status, "Reviewer");
  advance(x, x.reviewer);
  assert.equal(x.r.status, "Approval 1");
  advance(x, x.approver);
  assert.equal(x.o.committedAt, undefined);
  advance(x, x.final);
  assert.equal(x.r.status, "Finance");
  assert.equal(x.r.approvals.length, 3);
  assert.equal(kpis(x.s).commitment, 100000);
});
test("Planning skips Reviewer and needs only one approver", () => {
  const x = setup("Planning");
  approve(x);
  assert.equal(x.r.status, "Finance");
  assert.equal(x.r.approvals.length, 1);
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
  assert.equal(x.o.amendment.status, "Reviewer");
});
test("Approver return goes to requester and restarts all child approvals", () => {
  const x = setup();
  x.run(x.requester, "request.submit", x.r.id);
  advance(x, x.reviewer);
  x.lock(x.approver, x.r.id);
  x.run(x.approver, "request.return", x.r.id, { reason: "Correct terms" });
  assert.equal(x.r.status, "Draft");
  assert.deepEqual(x.r.approvals, []);
  x.run(x.approver, "unlock", x.r.id);
  x.lock(x.requester, x.r.id);
  x.run(x.requester, "request.submit", x.r.id);
  assert.equal(x.r.status, "Reviewer");
  assert.equal(x.r.history.at(-1).reason, "Correct terms");
});
test("Rejection requires reason and releases child allocation", () => {
  const x = setup();
  x.run(x.requester, "request.submit", x.r.id);
  x.run(x.requester, "unlock", x.r.id);
  x.lock(x.reviewer, x.r.id);
  assert.throws(() => x.run(x.reviewer, "request.reject", x.r.id), /Reason/);
  x.run(x.reviewer, "request.reject", x.r.id, { reason: "Not accepted" });
  x.run(x.requester, "request.create", null, {
    orderId: x.o.id,
    percent: 100,
    terms: "Replacement",
  });
  assert.equal(x.s.requests[1].amount, 100000);
});
test("Wrong team, role or approval level cannot approve", () => {
  const x = setup();
  x.run(x.requester, "request.submit", x.r.id);
  assert.throws(
    () => x.run(x.requester, "request.approve", x.r.id),
    /cannot review/,
  );
  x.run(x.requester, "unlock", x.r.id);
  const wrong = x.s.users.find((u) => u.id === "app1");
  x.lock(wrong, x.r.id);
  assert.throws(() => x.run(wrong, "request.approve", x.r.id), /cannot review/);
  x.run(wrong, "unlock", x.r.id);
  advance(x, x.reviewer);
  x.lock(x.final, x.r.id);
  assert.throws(
    () => x.run(x.final, "request.approve", x.r.id),
    /cannot review/,
  );
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
    /approved/,
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
test("PO duplicates span both teams in same company; invoice duplicates span same supplier", () => {
  const x = setup();
  const p = { ...x.payload, team: "Planning", invoice: "NEW" };
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
  assert.throws(() => x.lock(x.reviewer, x.r.id), /another user/);
  x.run(x.admin, "unlock", x.r.id);
  x.lock(x.reviewer, x.r.id);
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
test("Only Admin manages master data, user roles and settings", () => {
  const x = setup();
  assert.throws(
    () =>
      x.run(x.finance, "master.save", null, {
        kind: "companies",
        record: { name: "X" },
      }),
    /Admin/,
  );
  assert.throws(() => x.run(x.finance, "settings.save", null, {}), /Admin/);
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
        a.action === "request.approve" &&
        a.user === "Purchasing Final Approver" &&
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
  const x = setup("Planning");
  approve(x);
  x.lock(x.finance, x.r.id);
  x.run(x.finance, "request.documents", x.r.id, {
    reason: "Bank letter and revised invoice",
  });
  assert.equal(kpis(x.s).outstanding, 30000);
  assert.equal(x.r.status, "Documents Required");
  const approvals = structuredClone(x.r.approvals);
  assert.throws(
    () =>
      x.run(x.finance, "request.support", x.r.id, { files: x.payload.files }),
    /original requester/,
  );
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
test("Only Admin can delete a paid payment, with remarks and actual removal of supporting and details", () => {
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
  assert.throws(
    () =>
      x.run(x.finance, "request.deletePayment", x.r.id, {
        reason: "Wrong evidence",
      }),
    /Only Admin/,
  );
  x.run(x.finance, "unlock", x.r.id);
  x.lock(x.admin, x.r.id);
  assert.throws(
    () => x.run(x.admin, "request.reject", x.r.id, { reason: "Reject" }),
    /cannot review/,
  );
  assert.throws(
    () => x.run(x.admin, "request.deletePayment", x.r.id),
    /Reason/,
  );
  x.run(x.admin, "request.deletePayment", x.r.id, {
    reason: "Incorrect payment entry",
  });
  assert.equal(x.r.payment, undefined);
  assert.equal(x.r.status, "Finance");
  assert.equal(kpis(x.s).paid, 0);
  assert.equal(kpis(x.s).outstanding, 30000);
  assert.ok(
    x.r.history.some(
      (h) =>
        h.action === "Payment deleted" &&
        h.reason === "Incorrect payment entry",
    ),
  );
  x.run(x.admin, "request.reject", x.r.id, {
    reason: "Cancelled payment request",
  });
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
test("Parent amendment holds effective text and amounts until independent team final approval", () => {
  const x = setup("Planning");
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
  assert.equal(x.o.amendment.status, "Approval 1");
  x.run(x.requester, "unlock", x.o.id);
  x.lock(x.approver, x.o.id);
  x.run(x.approver, "amendment.approve", x.o.id);
  assert.equal(x.o.total, 150000);
  assert.equal(x.o.description, "Expanded scope");
  assert.equal(kpis(x.s).utilized, 150000);
  assert.equal(kpis(x.s).outstanding, 30000);
  assert.equal(kpis(x.s).balance, 120000);
  assert.equal(x.o.amendments[0].previous.total, 100000);
  assert.equal(x.r.percent, 30);
  assert.equal(x.r.amount, 30000);
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
test("Migration is idempotent, keeps legacy references, documents and audit, routes Planning reviewer safely", () => {
  const s = demoState();
  s.version = 1;
  delete s.counters;
  delete s.settings.orderFormat;
  for (const o of s.orders) delete o.number;
  const r = s.requests[2];
  delete r.currency;
  delete r.orderAmount;
  r.status = "Reviewer";
  const old = s.requests.map((r) => r.number),
    files = structuredClone(s.orders[0].files),
    audit = s.audit.length;
  migrateState(s, now);
  assert.deepEqual(
    s.requests.map((r) => r.number),
    old,
  );
  assert.deepEqual(s.orders[0].files, files);
  assert.equal(r.status, "Approval 1");
  assert.equal(s.audit.length, audit + 1);
  const snapshot = JSON.stringify(s);
  migrateState(s, now);
  assert.equal(JSON.stringify(s), snapshot);
  assert.equal(s.orders.length, 4);
});
test("Planning Reviewer assignment is prohibited, no silent permission escalation", () => {
  const x = setup();
  assert.throws(
    () =>
      x.run(x.admin, "user.save", null, {
        record: { ...x.reviewer, team: "Planning" },
      }),
    /no Reviewer/,
  );
});

test('Held cross-currency requests remain visible in currency stats and never overlap Outstanding through document collection, release and payment', () => {
  const x = setup('Planning');
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
