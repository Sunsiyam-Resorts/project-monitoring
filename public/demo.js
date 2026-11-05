import { emptyState, migrateState } from "./domain.js";
// demoState() is the fixed sample used by the workflow tests; the demo workspace
// asks for demoState({ history: true }), which adds a fictional year of activity.
export function demoState({ history = false } = {}) {
  const s = emptyState();
  s.companies = [
    { id: "c1", name: "Sun Siyam Olhuveli" },
    { id: "c2", name: "Sun Siyam Irufushi" },
    { id: "c3", name: "Siyam World" },
  ];
  s.projects = [
    { id: "p1", companyId: "c1", name: "Tropical Maldives Project" },
    { id: "p2", companyId: "c1", name: "Villa Refurbishment" },
    { id: "p3", companyId: "c2", name: "Beach Villa Upgrade" },
    { id: "p4", companyId: "c3", name: "Operations Expansion" },
  ];
  s.budgets = s.projects.map((p, i) => ({
    id: "b" + i,
    name: "Approved BOQ 2026",
    companyId: p.companyId,
    projectId: p.id,
    categories: [
      {
        id: "civil" + i,
        name: "Civil Works",
        amount: [900000, 300000, 450000, 650000][i],
      },
      {
        id: "mep" + i,
        name: "MEP Works",
        amount: [400000, 150000, 200000, 250000][i],
      },
      {
        id: "fit" + i,
        name: "Furniture & Finishes",
        amount: [300000, 200000, 250000, 350000][i],
      },
    ],
    revisions: [],
  }));
  s.suppliers = [
    {
      id: "s1",
      name: "Demo Construction Supplier",
      email: "supplier@example.com",
    },
    {
      id: "s2",
      name: "Demo Furnishing Supplier",
      email: "furnishing@example.com",
    },
    {
      id: "s3",
      name: "Demo Engineering Supplier",
      email: "engineering@example.com",
    },
  ];
  s.users = [
    {
      id: "admin",
      name: "abuney",
      username: "abuney",
      email: "admin@example.com",
      role: "Admin",
      groupAccess: true,
      companies: [],
      active: true,
    },
    ...["Purchasing", "Planning"]
      .flatMap((team, i) => [
        { id: "req" + i, name: team + " Requester", role: "Requester", team },
        ...(i === 0
          ? [
              {
                id: "rev" + i,
                name: team + " Reviewer",
                role: "Reviewer",
                team,
              },
            ]
          : []),
        {
          id: "app" + i,
          name: team + " Approver",
          role: "Approver",
          team,
          approvalLevel: 1,
        },
        ...(i === 0
          ? [
              {
                id: "app2",
                name: "Purchasing Final Approver",
                role: "Approver",
                team,
                approvalLevel: 2,
              },
            ]
          : []),
      ])
      .map((u) => ({
        ...u,
        username: u.id,
        email: u.id + "@example.com",
        companies: ["c1", "c2"],
        active: true,
      })),
    {
      id: "fin",
      name: "Finance Officer",
      username: "finance",
      email: "finance@example.com",
      role: "Finance",
      groupAccess: true,
      companies: [],
      active: true,
    },
    {
      id: "viewer",
      name: "Group Viewer",
      username: "viewer",
      email: "viewer@example.com",
      role: "Viewer",
      groupAccess: true,
      companies: [],
      active: true,
    },
  ];
  const pdf = {
    name: "Demo-support.pdf",
    type: "application/pdf",
    data: "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA+PiA+PiAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggMTMyID4+CnN0cmVhbQpCVCAvRjEgMTggVGYgNTAgNzYwIFRkIChERU1PIFNVUFBPUlRJTkcgRE9DVU1FTlQpIFRqIDAgLTM1IFRkIC9GMSAxMSBUZiAoU2FtcGxlIG9ubHkgLSBub3QgYSByZWFsIHB1cmNoYXNlIG9yIHBheW1lbnQgcmVjb3JkLikgVGogRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNDEgMDAwMDAgbiAKMDAwMDAwMDMxMSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjQ5NAolJUVPRg==",
  };
  s.orders = [
    {
      id: "o1",
      companyId: "c1",
      projectId: "p1",
      budgetId: "b0",
      supplierId: "s1",
      team: "Purchasing",
      currency: "USD",
      rate: 1,
      total: 420000,
      po: "DEMO-PO-1001",
      invoice: "DEMO-INV-1001",
      description: "Civil works package — structural construction",
      allocations: [{ categoryId: "civil0", amount: 420000 }],
      requestedBy: "req0",
      committedAt: "2026-10-10T08:00:00Z",
      createdAt: "2026-10-01T08:00:00Z",
      files: [pdf],
    },
    {
      id: "o2",
      companyId: "c1",
      projectId: "p2",
      budgetId: "b1",
      supplierId: "s2",
      team: "Purchasing",
      currency: "USD",
      rate: 1,
      total: 180000,
      po: "DEMO-PO-1002",
      invoice: "DEMO-INV-1002",
      description: "Guest villa furniture supply",
      allocations: [{ categoryId: "fit1", amount: 180000 }],
      requestedBy: "req0",
      committedAt: "2026-10-11T08:00:00Z",
      createdAt: "2026-10-03T08:00:00Z",
      files: [pdf],
    },
    {
      id: "o3",
      companyId: "c2",
      projectId: "p3",
      budgetId: "b2",
      supplierId: "s3",
      team: "Planning",
      currency: "MVR",
      rate: 15.42,
      total: 3700800,
      po: "DEMO-PO-1003",
      invoice: "",
      description: "Beach villa electrical and civil installation",
      allocations: [
        { categoryId: "mep2", amount: 1850400 },
        { categoryId: "civil2", amount: 1850400 },
      ],
      requestedBy: "req1",
      committedAt: "2026-10-12T08:00:00Z",
      createdAt: "2026-10-05T08:00:00Z",
      files: [pdf],
    },
    {
      id: "o4",
      companyId: "c3",
      projectId: "p4",
      budgetId: "b3",
      supplierId: "s1",
      team: "Purchasing",
      currency: "USD",
      rate: 1,
      total: 310000,
      po: "DEMO-PO-1004",
      invoice: "DEMO-INV-1004",
      description: "Expansion construction works",
      allocations: [{ categoryId: "civil3", amount: 310000 }],
      requestedBy: "req0",
      createdAt: "2026-10-07T08:00:00Z",
      files: [pdf],
    },
  ];
  s.requests = s.orders.map((o, i) => ({
    id: "r" + i,
    number: "PR-2026-00000" + (i + 1),
    orderId: o.id,
    companyId: o.companyId,
    team: o.team,
    amount: o.total * 0.3,
    percent: 30,
    terms: "30% advance on confirmed order",
    date: "2026-10-" + String(8 + i).padStart(2, "0"),
    status: ["Paid", "Finance", "On Hold", "Approval 1"][i],
    requestedBy: o.requestedBy,
    createdAt: o.createdAt,
    approvals: [],
    history: [],
    remarks:
      i === 2
        ? [
            {
              by: "Finance Officer",
              at: "2026-10-13T08:00:00Z",
              text: "Awaiting supplier bank confirmation.",
            },
          ]
        : [],
  }));
  s.requests[0].payment = {
    amount: 126000,
    date: "2026-10-12",
    type: "Transfer",
    file: pdf,
    by: "Finance Officer",
    at: "2026-10-12T08:00:00Z",
  };
  for (const r of s.requests) {
    r.approvals = [
      {
        stage: "Reviewer",
        by: r.team + " Reviewer",
        at: "2026-10-09T08:00:00Z",
      },
      ...(r.status === "Approval 1"
        ? []
        : [
            {
              stage: "Approval 1",
              by: r.team + " Approver",
              at: "2026-10-10T08:00:00Z",
            },
          ]),
      ...(r.team === "Purchasing" && r.status !== "Approval 1"
        ? [
            {
              stage: "Approval 2",
              by: "Purchasing Final Approver",
              at: "2026-10-11T08:00:00Z",
            },
          ]
        : []),
    ];
  }
  s.audit = s.requests.map((r) => ({
    id: "a" + r.id,
    at: r.createdAt,
    user: "Demo User",
    action: "Sample request loaded",
    entity: r.id,
    companyId: r.companyId,
    detail: r.number,
  }));
  s.sequence = 4;
  if (history) addSampleHistory(s, pdf);
  s.version = 1;
  return migrateState(s);
}

// Fictional year-to-date history so the dashboard trends have something to show.
// Deterministic (fixed seed), so every load and every reset gives the same data:
// 4–6 orders committed each month January–October across all projects and
// categories, one to three payment requests per order (approved, paid, held and
// released, still held, awaiting payment, or not yet requested), three or four
// dated budget revisions per budget, and the matching audit events. Final approved
// budgets are unchanged and every category stays below 90% of its budget.
function addSampleHistory(s, pdf) {
  let seed = 20260105;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const DAY = 86400000;
  const LAST = Date.UTC(2026, 10, 4); // nothing after 4 Nov 2026
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const at = (t) => iso(t) + "T08:00:00Z";

  // Budgets: three or four revisions each; each revision stores the categories in
  // force before it. Values wander up and down and end at today's approved budget.
  s.budgets.forEach((b, bi) => {
    const months = [1, 3, 5, 7, 9].filter(() => rand() < 0.8).slice(0, 4);
    if (months.length < 3) months.splice(0, months.length, 2, 5, 8);
    let factors = months.map(() => 0.8 + rand() * 0.3);
    b.revisions = months.map((m, i) => ({
      at: at(Date.UTC(2026, m, between(3, 25))),
      by: "abuney",
      reason: "Sample: " + pick(["scope change approved", "phase re-estimate", "supplier quotations received", "value engineering savings", "board-approved variation"]),
      currency: "USD",
      rate: 1,
      categories: b.categories.map((c) => ({ ...c, amount: Math.round((c.amount * factors[i]) / 1000) * 1000 })),
    }));
  });

  // Category headroom, counting the original sample orders (committed or not).
  const cap = new Map();
  s.budgets.forEach((b) => b.categories.forEach((c) => cap.set(c.id, c.amount * 0.9)));
  for (const o of s.orders) for (const a of o.allocations) cap.set(a.categoryId, cap.get(a.categoryId) - a.amount / (o.rate || 1));

  const suppliers = ["s1", "s2", "s3"];
  const reasons = ["Sample: held pending supplier documents.", "Sample: awaiting bank confirmation.", "Sample: invoice query raised with supplier.", "Sample: delivery inspection outstanding."];
  const history = [];
  const requests = [];
  let n = 0;
  for (let month = 0; month <= 9; month++) {
    const count = between(4, 6);
    for (let k = 0; k < count; k++) {
      const pi = between(0, 3);
      const p = s.projects[pi];
      const cat = pick(["civil", "mep", "fit"]) + pi;
      const total = between(3, 16) * 5000;
      if (cap.get(cat) < total) continue;
      cap.set(cat, cap.get(cat) - total);
      const team = rand() < 0.6 ? "Purchasing" : "Planning";
      const requester = team === "Purchasing" ? "req0" : "req1";
      const committed = Date.UTC(2026, month, between(2, 26));
      const created = committed - between(5, 14) * DAY;
      const id = "h" + ++n;
      s.orders.push({
        id, companyId: p.companyId, projectId: p.id, budgetId: "b" + pi,
        supplierId: pick(suppliers), team, currency: "USD", rate: 1, total,
        po: "DEMO-PO-" + (2000 + n), invoice: "DEMO-INV-" + (2000 + n),
        description: "Sample " + (cat.startsWith("civil") ? "civil works" : cat.startsWith("mep") ? "MEP works" : "furniture and finishes") + " package " + n,
        allocations: [{ categoryId: cat, amount: total }],
        requestedBy: requester, committedAt: at(committed), createdAt: at(created), files: [pdf],
      });
      // Instalments: deposit / progress / final, sometimes leaving value unrequested.
      const plan = pick([[100], [50, 50], [40, 60], [30, 40, 30], [30, 70], [40, 30], [50]]);
      let approvedOn = committed + between(5, 25) * DAY;
      plan.forEach((percent, c) => {
        if (approvedOn > LAST) return;
        const rid = id + "r" + c;
        const amount = Math.round(total * percent) / 100;
        const stages = team === "Purchasing" ? ["Reviewer", "Approval 1", "Approval 2"] : ["Approval 1"];
        const r = {
          id: rid, orderId: id, companyId: p.companyId, team, amount, percent,
          terms: percent === 100 ? "Full payment on delivery" : percent + "% instalment",
          date: iso(approvedOn), status: "Finance", requestedBy: requester,
          createdAt: at(approvedOn - 3 * DAY), finalApprovedAt: at(approvedOn),
          approvals: stages.map((stage) => ({ stage, by: team + (stage === "Approval 2" ? " Final Approver" : stage === "Reviewer" ? " Reviewer" : " Approver"), at: at(approvedOn) })),
          history: [], remarks: [],
        };
        let ready = approvedOn;
        if (rand() < 0.18) {
          const hold = approvedOn + between(2, 8) * DAY;
          if (hold <= LAST) {
            const reason = pick(reasons);
            r.remarks.push({ by: "Finance Officer", at: at(hold), text: reason });
            history.push({ at: at(hold), action: "request.hold", entity: rid, companyId: p.companyId, detail: reason });
            const resume = hold + between(7, 35) * DAY;
            if (resume <= LAST) {
              history.push({ at: at(resume), action: "request.resume", entity: rid, companyId: p.companyId, detail: "Sample: hold released" });
              ready = resume;
            } else {
              r.status = "On Hold";
              ready = Infinity;
            }
          }
        }
        const paidOn = ready + between(4, 24) * DAY;
        if (r.status === "Finance" && paidOn <= LAST) {
          r.status = "Paid";
          r.payment = { amount, date: iso(paidOn), type: pick(["Transfer", "TT", "Cheque"]), file: pdf, by: "Finance Officer", at: at(paidOn) };
          history.push({ at: at(paidOn), action: "request.pay", entity: rid, companyId: p.companyId, detail: "Sample payment" });
        }
        requests.push(r);
        approvedOn = paidOn + between(10, 45) * DAY;
      });
    }
  }
  // History requests follow the existing four in issue order.
  requests.sort((a, b) => a.finalApprovedAt.localeCompare(b.finalApprovedAt));
  requests.forEach((r, i) => { r.number = "PR-2026-" + String(5 + i).padStart(6, "0"); });
  s.requests.push(...requests);
  s.sequence = 4 + requests.length;
  // Older audit events come first so Recent activity still shows the latest samples.
  s.audit = [
    ...history.sort((a, b) => a.at.localeCompare(b.at)).map((a, i) => ({ id: "h-audit-" + i, user: "Finance Officer", ...a })),
    ...s.audit,
  ];
}
