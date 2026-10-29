import { emptyState, migrateState } from "./domain.js";
export function demoState() {
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
  s.version = 1;
  return migrateState(s);
}
