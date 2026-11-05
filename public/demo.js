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

// Fictional year-to-date history so the dashboard trends have something to show:
// nine settled or in-progress orders committed January–September, their payment
// requests (paid, held and released, still held, awaiting payment, or not yet
// requested), dated budget revisions, and the matching audit events. Current
// approved budgets are unchanged; every order stays within its category budget.
function addSampleHistory(s, pdf) {
  const day = (iso) => iso + "T08:00:00Z";
  // Budgets: each revision stores the categories in force before it.
  const before = (b, amounts) => ({
    currency: "USD",
    rate: 1,
    categories: b.categories.map((c, i) => ({ ...c, amount: amounts[i] })),
  });
  const [b0, , b2, b3] = s.budgets;
  b0.revisions = [{ at: day("2026-04-10"), by: "abuney", reason: "Sample: phase 2 scope approved", ...before(b0, [800000, 350000, 250000]) }];
  b2.revisions = [
    { at: day("2026-03-05"), by: "abuney", reason: "Sample: additional villas approved", ...before(b2, [380000, 190000, 250000]) },
    { at: day("2026-07-08"), by: "abuney", reason: "Sample: furniture scope reduced", ...before(b2, [480000, 220000, 250000]) },
  ];
  b3.revisions = [{ at: day("2026-06-02"), by: "abuney", reason: "Sample: expansion budget increase", ...before(b3, [600000, 200000, 300000]) }];

  // [id, project index, category prefix, team, total USD, created, committed, children]
  // children: [percent, final approval, paid, holds as [hold, resume?] pairs]
  const orders = [
    ["h1", 0, "civil", "Purchasing", 240000, "2026-01-08", "2026-01-20", [[40, "2026-02-05", "2026-02-12"], [60, "2026-04-08", "2026-04-20"]]],
    ["h2", 2, "civil", "Planning", 150000, "2026-02-03", "2026-02-18", [[50, "2026-03-09", "2026-03-15"], [50, "2026-05-12", "2026-05-22"]]],
    ["h3", 3, "fit", "Purchasing", 200000, "2026-03-10", "2026-03-24", [[30, "2026-04-22", "2026-04-30"], [40, "2026-07-02", "2026-08-18", [["2026-07-10", "2026-08-05"]]], [30, "2026-09-20", null]]],
    ["h4", 1, "mep", "Planning", 90000, "2026-04-02", "2026-04-14", [[100, "2026-05-20", "2026-05-30"]]],
    ["h5", 0, "mep", "Purchasing", 180000, "2026-05-06", "2026-05-19", [[50, "2026-06-16", "2026-06-25"], [50, "2026-08-25", null, [["2026-09-03"]]]]],
    ["h6", 2, "fit", "Planning", 120000, "2026-06-04", "2026-06-16", [[60, "2026-07-20", "2026-07-28"]]],
    ["h7", 3, "mep", "Purchasing", 160000, "2026-07-07", "2026-07-21", [[50, "2026-08-30", "2026-09-10"]]],
    ["h8", 1, "civil", "Purchasing", 110000, "2026-08-03", "2026-08-12", [[40, "2026-09-28", null]]],
    ["h9", 0, "fit", "Planning", 140000, "2026-09-02", "2026-09-15", [[30, "2026-09-25", "2026-10-03"]]],
  ];
  const suppliers = ["s1", "s3", "s2"];
  const history = [];
  const requests = [];
  orders.forEach(([id, pi, cat, team, total, created, commit, children], n) => {
    const p = s.projects[pi];
    const requester = team === "Purchasing" ? "req0" : "req1";
    s.orders.push({
      id, companyId: p.companyId, projectId: p.id, budgetId: "b" + pi,
      supplierId: suppliers[n % 3], team, currency: "USD", rate: 1, total,
      po: "DEMO-PO-" + (2001 + n), invoice: "DEMO-INV-" + (2001 + n),
      description: "Sample " + (cat === "civil" ? "civil works" : cat === "mep" ? "MEP works" : "furniture and finishes") + " package",
      allocations: [{ categoryId: cat + pi, amount: total }],
      requestedBy: requester, committedAt: day(commit), createdAt: day(created), files: [pdf],
    });
    children.forEach(([percent, approvedOn, paidOn, holds = []], c) => {
      const rid = id + "r" + c;
      const amount = Math.round(total * percent) / 100;
      const stages = team === "Purchasing" ? ["Reviewer", "Approval 1", "Approval 2"] : ["Approval 1"];
      const stillHeld = holds.length && holds.at(-1).length === 1;
      const r = {
        id: rid, orderId: id, companyId: p.companyId, team, amount, percent,
        terms: percent === 100 ? "Full payment on delivery" : percent + "% instalment",
        date: approvedOn, status: paidOn ? "Paid" : stillHeld ? "On Hold" : "Finance",
        requestedBy: requester, createdAt: day(approvedOn), finalApprovedAt: day(approvedOn),
        approvals: stages.map((stage) => ({ stage, by: team + (stage === "Approval 2" ? " Final Approver" : stage === "Reviewer" ? " Reviewer" : " Approver"), at: day(approvedOn) })),
        history: [], remarks: [],
      };
      for (const [hold, resume] of holds) {
        r.remarks.push({ by: "Finance Officer", at: day(hold), text: "Sample: held pending supplier documents." });
        history.push({ at: day(hold), action: "request.hold", entity: rid, companyId: p.companyId, detail: "Sample hold" });
        if (resume) history.push({ at: day(resume), action: "request.resume", entity: rid, companyId: p.companyId, detail: "Sample release" });
      }
      if (paidOn) {
        r.payment = { amount, date: paidOn, type: "Transfer", file: pdf, by: "Finance Officer", at: day(paidOn) };
        history.push({ at: day(paidOn), action: "request.pay", entity: rid, companyId: p.companyId, detail: "Sample payment" });
      }
      requests.push(r);
    });
  });
  // History requests follow the existing four in issue order.
  requests.forEach((r, i) => { r.number = "PR-2026-" + String(5 + i).padStart(6, "0"); });
  s.requests.push(...requests);
  s.sequence = 4 + requests.length;
  // Older audit events come first so Recent activity still shows the latest samples.
  s.audit = [
    ...history.sort((a, b) => a.at.localeCompare(b.at)).map((a, i) => ({ id: "h-audit-" + i, user: "Finance Officer", ...a })),
    ...s.audit,
  ];
}
