// node scripts/traces/fuzz.mjs [seed] [episodes] (run by `npm run traces` after record.mjs): drives the workflow rules through a
// seeded random scenario (valid and invalid commands from every role, imports, files,
// legacy-data migrations) with the recorder on, and writes
// ../backend/internal/domain/testdata/fuzz-traces.json.gz for the Go parity test
// (TestParityFuzz). It complements traces.json.gz, which records the test suite.
// All names, references and documents are fictional.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { instrument } from './plugin.mjs';
import { combine } from './combine.mjs';

const seed = Number(process.argv[2] ?? 20261115);
const episodes = Number(process.argv[3] ?? 80);
const work = mkdtempSync(join(tmpdir(), 'portal-fuzz-'));
const traceDir = join(work, 'traces');
process.env.TRACE_DIR = traceDir;

// An instrumented copy of the rules (the Vite plugin does the same during the test suite).
const src = new URL('../../src/domain/', import.meta.url);
const copy = join(work, 'src', 'domain');
mkdirSync(copy, { recursive: true });
// plugin.mjs imports the recorder by file path (fine for Vite); plain Node needs a file URL.
const runtimePath = fileURLToPath(new URL('./runtime.mjs', import.meta.url));
const runtimeImport = JSON.stringify(runtimePath.split('\\').join('/'));
for (const f of ['domain.js', 'ids.js', 'import-data.js']) {
  const file = join(copy, f);
  copyFileSync(new URL(f, src), file);
  const out = instrument(file.split('\\').join('/'), readFileSync(file, 'utf8'));
  if (out) writeFileSync(file, out.split(runtimeImport).join(JSON.stringify(pathToFileURL(runtimePath).href)));
}
const D = await import(pathToFileURL(join(copy, 'domain.js')));

// mulberry32
let s0 = seed >>> 0;
const rnd = () => { s0 = (s0 + 0x6D2B79F5) >>> 0; let t = s0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const chance = (p) => rnd() < p;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const PDF = (n = 1) => ({ name: `doc-${n}.pdf`, type: 'application/pdf', data: 'JVBERi0xLjQK' + 'QUJD'.repeat(n), size: 12 + n });
const badFiles = [
  [{ name: 'note.txt', type: 'text/plain', data: 'SGVsbG8=' }],
  [{ name: 'x.pdf', type: 'application/pdf', data: 'notapdf' }],
  [null], [5], 'not-an-array', [{ name: ['arr.pdf'], type: 'application/pdf', data: 'JVBERi0xLjQK' }],
  [{ name: 'BIG.PDF', type: 'application/pdf', data: 'JVBERi0' + 'A'.repeat(64) }],
];

function fixture() {
  const s = D.emptyState();
  s.currencies.push({ id: 'EUR', name: 'Euro', rate: 0.92 });
  s.companies.push({ id: 'c1', name: 'Fictional Lagoon Resort', code: 'FLR' }, { id: 'c2', name: 'Fictional Reef Hotel', code: 'FRH' });
  s.projects.push({ id: 'p1', companyId: 'c1', name: 'Villa Upgrade', code: 'VU' }, { id: 'p2', companyId: 'c1', name: 'Spa Build', code: 'SB' }, { id: 'p3', companyId: 'c2', name: 'Jetty Repair', code: 'JR' });
  s.budgets.push(
    { id: 'b1', companyId: 'c1', projectId: 'p1', name: 'Villa budget', currency: 'USD', rate: 1, categories: [{ id: 'k1', name: 'Civil', amount: 50000 }, { id: 'k2', name: 'MEP', amount: 20000 }], revisions: [] },
    { id: 'b2', companyId: 'c1', projectId: 'p2', name: 'Spa budget', currency: 'MVR', rate: 15.42, categories: [{ id: 'k3', name: 'Fit-out', amount: 300000 }], revisions: [] },
    { id: 'b3', companyId: 'c2', projectId: 'p3', name: 'Jetty budget', currency: 'USD', rate: 1, categories: [{ id: 'k4', name: 'Marine', amount: 80000 }], revisions: [] },
  );
  s.suppliers.push({ id: 's1', name: 'Fictional Builders', email: 'builders@example.test' }, { id: 's2', name: 'Fictional Marine' });
  const u = (id, role, extra = {}) => ({ id, name: `Fictional ${id}`, username: id, email: `${id}@example.test`, role, companies: [], groupAccess: false, active: true, ...extra });
  s.users.push(
    u('admin', 'Admin', { groupAccess: true }), u('admin2', 'Admin', { companies: ['c1'] }),
    u('fin', 'Finance', { groupAccess: true }), u('fin2', 'Finance', { companies: ['c1'] }),
    u('req', 'Finance', { companies: ['c1'] }), u('req2', 'Finance', { companies: ['c1', 'c2'] }),
    u('plan', 'Planning', { companies: ['c1'] }), u('plan2', 'Planning', { groupAccess: true }), u('oldreq', 'Requester', { companies: ['c1'] }),
    u('view', 'Viewer', { groupAccess: true }), u('gone', 'Finance', { groupAccess: true, active: false }),
  );
  s.tasks.push({ id: 't1', companyId: 'c1', projectId: 'p1', name: 'Survey', status: 'Done', due: '2026-03-01', owner: 'Site', createdAt: '2026-01-02T00:00:00.000Z', createdBy: 'fin', updatedAt: '2026-03-01T00:00:00.000Z', completedAt: '2026-03-01T00:00:00.000Z' });
  return s;
}

let now = Date.UTC(2026, 9, 1, 6, 0, 0);
const tick = () => { now += pick([0, 1000, 60000, 300000, 700000, 3600000, 86400000]); return now; };

function run(s, user, cmd) {
  const before = structuredClone(s);
  try { D.apply(s, user, cmd, tick()); return true; } catch { for (const k of Object.keys(s)) delete s[k]; Object.assign(s, before); return false; }
}

const records = (s) => [...s.orders, ...s.requests];
const someId = (list) => (list.length && chance(0.9) ? pick(list).id : pick(['missing', undefined, null, 5, '']));
const reason = () => pick(['Fictional reason', '  padded reason  ', '', '   ', undefined, 7, ['array', 'reason']]);
const date = () => pick(['', undefined, '2026-01-15', '2026-02-30', '2026-13-01', ' 2026-03-01 ', '2026-04-31', '15/01/2026', '2030-01-01', '2026-10-01']);
const money = () => pick([100, 2500, 0.125, 1.005, 33.335, '400', '', '1e3', -5, 0, 'abc', 49999.995, 100000, null]);

function orderData(s, base = {}) {
  const b = chance(0.85) ? pick(s.budgets) : { id: 'nobudget', companyId: 'c1', projectId: 'p1', categories: [{ id: 'k1' }] };
  const total = chance(0.8) ? int(1, 400) * 25 : money();
  const cats = b.categories || [];
  let allocations;
  if (chance(0.8) && cats.length) {
    const c = pick(cats);
    allocations = cats.length > 1 && chance(0.4)
      ? [{ categoryId: cats[0].id, amount: Number(total) / 2 }, { categoryId: cats[1].id, amount: Number(total) / 2 }]
      : [{ categoryId: c.id, amount: total }];
  } else allocations = pick([[], [{ categoryId: 'k1', amount: 1 }, { categoryId: 'k1', amount: 1 }], [{ categoryId: 'zz', amount: total }], [null], 'x', [{ categoryId: cats[0]?.id, amount: Number(total) + 1 }]]);
  const d = {
    companyId: b.companyId, projectId: b.projectId, budgetId: b.id, supplierId: chance(0.9) ? pick(s.suppliers).id : 'nosupplier',
    currency: chance(0.75) ? (b.currency || 'USD') : pick(['USD', 'MVR', 'EUR', 'GBP']),
    total, po: chance(0.85) ? `PO-${int(1, 40)}` : pick(['', '  ', 'po  12', 'PO 12']),
    invoice: chance(0.5) ? `INV-${int(1, 30)}` : pick(['', undefined, ' inv-3 ']),
    description: chance(0.9) ? 'Fictional works' : '', allocations,
    ...base,
  };
  if (chance(0.5)) d.files = chance(0.8) ? [PDF(int(1, 3))] : pick(badFiles);
  return d;
}

function paymentData(s, o) {
  const d = {};
  if (chance(0.6)) d.percent = pick([10, 25, '50', 33.3333, 100, 120, 0, 'x', 12.5, 1 / 3 * 100]);
  else d.amount = pick([o ? Number(o.total) / 4 : 100, 1, 0.01, '75', '', 1e9, 0, -1, o ? Number(o.total) : 5]);
  if (chance(0.5)) d.date = date();
  if (chance(0.3)) d.currency = pick(['USD', 'MVR', 'EUR', 'XXX', '']);
  if (chance(0.3)) d.terms = pick(['Advance', '  ', 'Balance on completion']);
  return d;
}

function lockFor(s, user, id) { if (chance(0.9)) run(s, user, { type: 'lock', id }); }

// A user who may plausibly act: active, one of roles, with access to the company and
// (when given) not the requester.
function actor(s, roles, companyId, notRequester) {
  const ok = s.users.filter((u) => u.active !== false && roles.includes(u.role) && (u.groupAccess || (u.companies || []).includes(companyId)) && u.id !== notRequester);
  return ok.length && chance(0.9) ? pick(ok) : pick(s.users);
}
const managers = ['Finance', 'Admin'], financeRoles = ['Finance', 'Admin'];

// A valid lifecycle step, chosen from what the state allows.
function lifecycle(s) {
  const live = s.requests.filter((r) => !r.deleted);
  const orders = s.orders.filter((o) => !o.deleted && !o.rejectedAt);
  const choice = pick(['create', 'create', 'request', 'request', 'submit', 'submit', 'finance', 'finance', 'finance', 'pay', 'pay', 'amend', 'review', 'delete', 'restore', 'reject']);
  if (choice === 'create' || !orders.length) {
    const b = pick(s.budgets.filter((x) => x.categories?.length));
    if (!b) return;
    const u = actor(s, managers, b.companyId);
    const total = int(4, 40) * 250;
    const d = { companyId: b.companyId, projectId: b.projectId, budgetId: b.id, supplierId: pick(s.suppliers).id, currency: pick([b.currency || 'USD', 'USD', 'MVR']),
      total, po: `LPO-${int(1, 500)}`, invoice: chance(0.4) ? `LINV-${int(1, 500)}` : '', description: 'Fictional lifecycle works',
      allocations: [{ categoryId: b.categories[0].id, amount: total }] };
    if (chance(0.5)) d.files = [PDF(int(1, 2))];
    if (chance(0.7)) d.payment = { percent: pick([10, 20, 25, 50]), ...(chance(0.3) ? { currency: pick(['USD', 'MVR', 'EUR']) } : {}), ...(chance(0.3) ? { date: '2026-10-02' } : {}) };
    return run(s, u, { type: 'order.create', data: d });
  }
  const o = pick(orders);
  const children = live.filter((r) => r.orderId === o.id);
  const byStatus = (...st) => live.filter((r) => st.includes(r.status) && orders.some((x) => x.id === r.orderId));
  if (chance(0.12)) { // open a record and fetch one of its PDFs
    const withFiles = [...s.orders, ...s.requests].filter((x) => x.files?.length || x.payment?.files?.length || x.amendments?.length || x.amendment);
    const t = pick(withFiles);
    if (!t) return;
    const u = actor(s, ['Admin', 'Finance', 'Planning', 'Viewer'], t.companyId);
    run(s, u, { type: 'lock', id: t.id });
    const m = pick([...(t.amendments || []), ...(t.amendmentAttempts || [])]);
    const kind = t.orderId ? pick(['request', 'payment']) : pick(['order', 'amendment', ...(m ? ['amendment-history', 'amendment-attempt'] : [])]);
    try { D.supportingFile(s, u, { id: t.id, kind, index: pick([0, '0', undefined, 1]), version: m?.id, side: pick([undefined, 'data', 'previous']) }, now); } catch {}
    return;
  }
  switch (choice) {
    case 'request': {
      const u = actor(s, managers, o.companyId);
      run(s, u, { type: 'lock', id: o.id });
      return run(s, u, { type: 'request.create', data: { orderId: o.id, ...(chance(0.7) ? { percent: pick([5, 10, 15, 25]) } : { amount: Math.round(o.total / 8) }), ...(chance(0.3) ? { currency: pick(['USD', 'MVR', 'EUR']) } : {}) } });
    }
    case 'submit': {
      const r = pick(byStatus('Draft'));
      if (!r) return;
      const u = actor(s, managers, r.companyId);
      run(s, u, { type: 'lock', id: r.id });
      if (chance(0.25)) run(s, u, { type: 'request.edit', id: r.id, data: { percent: pick([5, 12.5, 20]) } });
      return run(s, u, { type: 'request.submit', id: r.id });
    }
    case 'finance': case 'pay': {
      const r = pick(byStatus('Finance', 'On Hold', 'Documents Required'));
      if (!r) return;
      const action = choice === 'pay' ? (r.status === 'On Hold' ? 'resume' : r.status === 'Documents Required' ? 'support' : 'pay')
        : pick(['remark', 'hold', 'resume', 'documents', 'return', 'reject', 'support']);
      const u = action === 'support' ? actor(s, managers, r.companyId) : actor(s, financeRoles, r.companyId, r.requestedBy);
      run(s, u, { type: 'lock', id: r.id });
      const data = { reason: 'Fictional reason' };
      if (action === 'pay') Object.assign(data, { paymentType: pick(['Cheque', 'Transfer', 'TT']), paymentDate: D.today(now), ...(chance(0.5) ? { files: [PDF(1)] } : {}) });
      if (action === 'support') data.files = [PDF(1)];
      return run(s, u, { type: `request.${action}`, id: r.id, data });
    }
    case 'amend': {
      const u = actor(s, managers, o.companyId);
      run(s, u, { type: 'lock', id: o.id });
      const total = Number(o.total) + pick([0, 250, 500, -250]);
      return run(s, u, { type: 'order.amend', id: o.id, data: { companyId: o.companyId, projectId: o.projectId, budgetId: o.budgetId, supplierId: chance(0.8) ? o.supplierId : pick(s.suppliers).id,
        currency: o.currency, total, po: o.po, invoice: o.invoice, description: 'Amended fictional works', allocations: [{ categoryId: o.allocations[0].categoryId, amount: total }],
        files: chance(0.5) ? [PDF(3)] : o.files, reason: 'Fictional amendment' } });
    }
    case 'review': {
      const t = pick(s.orders.filter((x) => x.amendment && !x.deleted)) || o;
      const u = actor(s, financeRoles, t.companyId, t.amendment?.requestedBy);
      run(s, u, { type: 'lock', id: t.id });
      return run(s, u, { type: 'amendment.' + pick(['approve', 'approve', 'approve', 'return', 'reject']), id: t.id, data: { reason: 'Fictional review' } });
    }
    case 'delete': {
      const admin = actor(s, ['Admin'], o.companyId);
      const target = chance(0.5) && live.length ? pick(live) : o;
      run(s, admin, { type: 'lock', id: target.id });
      return run(s, admin, { type: target.orderId ? 'request.delete' : 'order.delete', id: target.id, data: { reason: 'Fictional deletion' } });
    }
    case 'restore': {
      const t = pick([...s.orders, ...s.requests].filter((x) => x.deleted));
      if (!t) return;
      return run(s, actor(s, ['Admin'], t.companyId), { type: t.orderId ? 'request.restore' : 'order.restore', id: t.id });
    }
    case 'reject': {
      const u = actor(s, financeRoles, o.companyId);
      for (const c of children.filter((r) => r.status !== 'Rejected')) {
        run(s, u, { type: 'lock', id: c.id });
        if (c.status === 'Paid') run(s, u, { type: 'request.deletePayment', id: c.id, data: { reason: 'Fictional correction' } });
        run(s, u, { type: 'request.reject', id: c.id, data: { reason: 'Fictional rejection' } });
      }
      run(s, u, { type: 'lock', id: o.id });
      return run(s, u, { type: 'order.reject', id: o.id, data: { reason: 'Fictional rejection' } });
    }
  }
}

function step(s) {
  if (chance(0.55)) return lifecycle(s);
  const user = chance(0.95) ? pick(s.users) : pick([{ id: 'ghost', name: 'Ghost', role: 'Admin', groupAccess: true }, { id: 'fin', role: 'Finance', active: true, companies: ['c2'] }]);
  const o = s.orders.length ? pick(s.orders) : null;
  const r = s.requests.length ? pick(s.requests) : null;
  const kind = pick(['order.create', 'order.create', 'request.create', 'request.create', 'request.edit', 'request.submit', 'request.submit', 'flow', 'flow', 'flow',
    'order.amend', 'amendment', 'amendment', 'order.reject', 'order.delete', 'request.delete', 'restore', 'master', 'master', 'user.save', 'task', 'settings',
    'import', 'import', 'lockunlock', 'weird', 'view', 'file']);
  switch (kind) {
    case 'order.create': {
      const d = orderData(s);
      if (chance(0.6)) d.payment = paymentData(s, d);
      return run(s, user, { type: 'order.create', data: d });
    }
    case 'request.create': {
      if (!o) return;
      lockFor(s, user, o.id);
      return run(s, user, { type: 'request.create', data: { orderId: chance(0.9) ? o.id : 'missing', ...paymentData(s, o) } });
    }
    case 'request.edit': case 'request.submit': {
      if (!r) return;
      lockFor(s, user, r.id);
      return run(s, user, { type: kind, id: r.id, data: kind === 'request.edit' ? paymentData(s, s.orders.find((x) => x.id === r.orderId)) : {} });
    }
    case 'flow': {
      if (!r) return;
      const action = pick(['return', 'reject', 'documents', 'support', 'deletePayment', 'remark', 'hold', 'resume', 'pay', 'pay', 'pay', 'approve', 'nothing']);
      const fin = chance(0.7) ? pick(s.users.filter((x) => ['Finance', 'Admin'].includes(x.role))) : user;
      lockFor(s, fin, r.id);
      const data = { reason: reason() };
      if (action === 'pay') Object.assign(data, { paymentType: pick(['Cheque', 'Transfer', 'TT', 'Cash', undefined]), paymentDate: pick([D.today(now), '2026-01-31', ' 2026-02-01', '2099-01-01', '2026-02-30', '', ['2026-01-02'], 20260102]) });
      if (action === 'pay' && chance(0.5)) data[chance(0.5) ? 'files' : 'file'] = chance(0.7) ? (chance(0.5) ? [PDF(2)] : PDF(1)) : pick(badFiles);
      if (action === 'support') data.files = chance(0.7) ? [PDF(1), PDF(2)] : pick([[], undefined, ...badFiles]);
      return run(s, chance(0.5) ? fin : user, { type: `request.${action}`, id: r.id, data });
    }
    case 'order.amend': {
      if (!o) return;
      lockFor(s, user, o.id);
      const d = orderData(s, { companyId: o.companyId, projectId: o.projectId, budgetId: o.budgetId, currency: o.currency, po: chance(0.7) ? o.po : `PO-${int(1, 40)}`, reason: reason() });
      if (chance(0.5)) d.allocations = o.allocations.map((a) => ({ ...a, amount: d.total / o.allocations.length }));
      if (chance(0.1)) d.currency = 'EUR';
      return run(s, user, { type: pick(['order.amend', 'order.edit']), id: o.id, data: d });
    }
    case 'amendment': {
      const withAmendment = s.orders.filter((x) => x.amendment);
      const t = withAmendment.length ? pick(withAmendment) : o;
      if (!t) return;
      const fin = chance(0.7) ? pick(s.users.filter((x) => ['Finance', 'Admin'].includes(x.role))) : user;
      lockFor(s, fin, t.id);
      return run(s, fin, { type: 'amendment.' + pick(['approve', 'approve', 'return', 'reject', 'resubmit', 'other', 'approve.extra']), id: t.id, data: { reason: reason() } });
    }
    case 'order.reject': case 'order.delete': {
      if (!o) return;
      const actor = chance(0.6) ? pick(s.users.filter((x) => ['Finance', 'Admin'].includes(x.role))) : user;
      if (kind === 'order.reject' && chance(0.5)) {
        for (const c of s.requests.filter((x) => x.orderId === o.id && !x.deleted)) { lockFor(s, actor, c.id); run(s, actor, { type: 'request.reject', id: c.id, data: { reason: 'Fictional' } }); }
      }
      lockFor(s, actor, o.id);
      return run(s, actor, { type: kind, id: o.id, data: { reason: reason() } });
    }
    case 'request.delete': {
      if (!r) return;
      const actor = chance(0.7) ? pick(s.users.filter((x) => x.role === 'Admin')) : user;
      lockFor(s, actor, r.id);
      return run(s, actor, { type: 'request.delete', id: r.id, data: { reason: reason() } });
    }
    case 'restore': {
      const deleted = records(s).filter((x) => x.deleted);
      const t = deleted.length ? pick(deleted) : (o || r);
      if (!t) return;
      const actor = chance(0.7) ? pick(s.users.filter((x) => x.role === 'Admin')) : user;
      if (chance(0.3)) run(s, actor, { type: 'lock', id: t.id });
      return run(s, actor, { type: t.orderId ? 'request.restore' : 'order.restore', id: t.id });
    }
    case 'master': return run(s, chance(0.7) ? pick(s.users.filter((x) => ['Finance', 'Admin'].includes(x.role))) : user, masterCommand(s));
    case 'user.save': return run(s, user.role === 'Admin' || chance(0.3) ? user : s.users[0], userCommand(s));
    case 'task': {
      const actor = chance(0.7) ? pick(s.users.filter((x) => ['Planning', 'Admin'].includes(x.role))) : user;
      const t = s.tasks.length && chance(0.5) ? pick(s.tasks) : null;
      if (t && chance(0.3)) return run(s, actor, { type: 'task.delete', id: chance(0.9) ? t.id : 'nope' });
      const record = t ? { ...t } : { projectId: pick([...s.projects.map((p) => p.id), 'nope']) };
      Object.assign(record, { name: pick(['Survey', ' Tender ', '', 'x'.repeat(121), 'Commissioning 🌴']), status: pick(['To do', 'In progress', 'Done', 'Done', 'Blocked']),
        due: pick(['', '2026-12-01', '2026-02-30', '01/12/2026', undefined]), owner: pick(['', 'Site team', 'o'.repeat(90), '🌴'.repeat(45), undefined]) });
      if (t && chance(0.2)) record.projectId = 'p2';
      return run(s, actor, { type: 'task.save', data: { record } });
    }
    case 'settings': return run(s, chance(0.7) ? s.users[0] : user, { type: 'settings.save', data: pick([
      { orderFormat: '{COMPANY}-{PROJECT}-REQ-{SEQ}', numberFormat: '{COMPANY}/{PROJECT}/{YYYY}/{SEQ}', lockMinutes: 10 },
      { orderFormat: '{COMPANY}-{PROJECT}-R{YYYY}-{SEQ}', numberFormat: '{COMPANY}-{PROJECT}-P-{SEQ}', lockMinutes: '10' },
      { orderFormat: 'R-{SEQ}', numberFormat: '{COMPANY}-{PROJECT}-P-{SEQ}', lockMinutes: 10 },
      { orderFormat: '{COMPANY}-{PROJECT}-{SEQ}', numberFormat: '{COMPANY}-{PROJECT}-{SEQ}', lockMinutes: 10 },
      { orderFormat: ' {COMPANY}-{PROJECT}-{SEQ}', numberFormat: '{COMPANY}-{PROJECT}-{SEQ}', lockMinutes: 10 },
      { orderFormat: '{COMPANY}-{PROJECT}-{SEQ}-{X}', numberFormat: '{COMPANY}-{PROJECT}-P{SEQ}', lockMinutes: 10 },
      { orderFormat: '{COMPANY}-{PROJECT}-A-{SEQ}', numberFormat: '{COMPANY}-{PROJECT}-B-{SEQ}', lockMinutes: 15 },
      { orderFormat: '{COMPANY}{PROJECT}{SEQ}' + 'x'.repeat(90), numberFormat: '{COMPANY}-{PROJECT}-B-{SEQ}', lockMinutes: 10 },
    ]) });
    case 'import': return run(s, chance(0.8) ? pick(s.users.filter((x) => x.role !== 'Viewer')) : user, importCommand(s));
    case 'lockunlock': {
      const t = records(s).length ? pick(records(s)) : null;
      return run(s, user, { type: pick(['lock', 'unlock', 'unlock']), id: t && chance(0.9) ? t.id : pick(['missing', undefined]) });
    }
    case 'weird': return run(s, user, pick([{}, { type: null }, { type: 5 }, { type: 'nothing' }, { type: 'request.create', data: 'text' },
      { type: 'order.create', data: null }, { type: 'master.save', data: { kind: 'companies' } }, { type: 'master.save', data: { kind: 'companies', record: null } },
      { type: 'master.save', data: { kind: 'secrets', record: { name: 'x' } } }, { type: 'user.save', data: {} }, { type: 'task.save' },
      { type: 'request.nothing', id: r?.id }, { type: 'settings.save', id: 'entity-from-client', data: { orderFormat: '{COMPANY}-{PROJECT}-W-{SEQ}', numberFormat: '{COMPANY}-{PROJECT}-V-{SEQ}', lockMinutes: 10 } }]));
    case 'view': {
      const u = chance(0.9) ? pick(s.users) : { id: 'outsider', role: pick(['Requester', 'Planning']), companies: ['c2'], active: true };
      try { D.visibleState(s, u); } catch {}
      return;
    }
    case 'file': {
      const t = records(s).length ? pick(records(s)) : null;
      if (!t) return;
      const u = chance(0.8) ? pick(s.users) : user;
      if (chance(0.7)) run(s, u, { type: 'lock', id: t.id });
      const amendmentVersions = [...(t.amendments || []), ...(t.amendmentAttempts || [])].map((m) => m.id);
      const q = { id: chance(0.9) ? t.id : 'nope', kind: pick(t.orderId ? ['request', 'payment', 'order'] : ['order', 'amendment', 'amendment-history', 'amendment-attempt', 'request']),
        index: pick([undefined, 0, '0', 1, '1', -1, 'x', 1.5, '0x0', '', 99]), version: amendmentVersions.length ? pick([...amendmentVersions, 'nope']) : undefined,
        side: pick([undefined, 'data', 'previous', 'passwordHash']) };
      try { D.supportingFile(s, u, q, now); } catch {}
    }
  }
}

function masterCommand(s) {
  const kind = pick(['companies', 'projects', 'budgets', 'suppliers', 'currencies', 'currencies']);
  const prev = s[kind].length && chance(0.4) ? structuredClone(pick(s[kind])) : null;
  let record;
  if (kind === 'companies') record = prev ? { ...prev, code: pick([prev.code, 'flr', 'x', 'NEW1', 'ßß']) } : { name: pick(['Fictional Atoll', 'fictional  lagoon resort', 'Fictional Lagoon Resort', '']), code: pick(['FA', 'flr', 'a b', 'TOOLONGCODE123', 'ßß']), extra: { note: 'kept' } };
  if (kind === 'projects') record = prev ? { ...prev, companyId: pick([prev.companyId, prev.companyId, 'c2']), code: pick([prev.code, 'SB', 'NP']) } : { name: 'Fictional Pier', code: pick(['NP', 'VU', 'jr']), companyId: pick(['c1', 'c2', 'cx']) };
  if (kind === 'suppliers') record = prev ? { ...prev, name: pick([prev.name, 'Fictional Builders', 'Fictional Glass']) } : { name: pick(['Fictional Glass', 'fictional builders', 'Fictional Paint']), email: pick(['glass@example.test', '', 5]) };
  if (kind === 'currencies') record = prev ? { ...prev, rate: pick([prev.rate, '16.1', 0, 2]) } : { id: pick(['GBP', 'gbp', 'usd', 'US', 'USD']), name: 'Fictional currency', rate: pick([0.8, '1', 1, 0, 'x', 2]) };
  if (kind === 'budgets') {
    record = prev
      ? { ...prev, categories: chance(0.8) ? prev.categories.map((c) => ({ ...c, amount: Number(c.amount) + pick([0, 1000, -10]) })).concat(chance(0.3) ? [{ id: 'kn' + int(1, 9), name: 'Extra', amount: 500 }] : []) : prev.categories.slice(1),
          currency: pick([prev.currency, prev.currency, 'EUR', undefined]), companyId: chance(0.9) ? prev.companyId : 'c2' }
      : { name: 'Fictional budget ' + int(1, 9), companyId: 'c1', projectId: pick(['p1', 'p2', 'p3']), currency: pick(['USD', 'MVR', undefined, 'XXX']),
          categories: pick([[{ id: 'kn1', name: 'Works', amount: 1000 }], [{ id: 'kn2', name: 'A', amount: '200' }, { id: 'kn3', name: 'a', amount: 1 }], [], [{ name: 'NoId', amount: 1 }], [{ id: 'kn4', name: '', amount: 5 }], [{ id: 'kn5', name: 'Neg', amount: -5 }]]) };
  }
  if (!chance(0.95)) record.name = pick(['', '   ', undefined]);
  return { type: 'master.save', data: { kind, record, reason: prev && kind === 'budgets' ? reason() : pick([undefined, '', 'Fictional note']) } };
}

function userCommand(s) {
  const prev = chance(0.5) ? structuredClone(pick(s.users)) : null;
  const n = int(1, 99);
  const record = prev ?? { name: `Fictional user ${n}`, username: `user${n}`, email: `user${n}@example.test`, role: 'Finance', companies: ['c1'] };
  if (chance(0.4)) record.role = pick(['Requester', 'Finance', 'Planning', 'Viewer', 'Admin', 'Reviewer', 'Boss']);
  if (chance(0.2)) record.active = pick([false, true, 'no']);
  if (chance(0.2)) record.companies = pick([[], ['c2'], ['cx'], undefined, 'c1']);
  if (chance(0.2)) record.groupAccess = pick([true, false, 1]);
  if (chance(0.1)) record.email = pick(['bad-email', 'ADMIN@example.test', ' spaced@example.test ']);
  if (chance(0.1)) record.username = pick(['ADMIN', '', ' fin ']);
  if (chance(0.1)) Object.assign(record, { team: 'Purchasing', approvalLevel: 2 });
  if (!prev && chance(0.3)) record.id = `user-${n}`;
  return { type: 'user.save', data: { record } };
}

function importCommand(s) {
  const kind = pick(['companies', 'projects', 'suppliers', 'currencies', 'budgets', 'orders', 'orders', 'payments', 'payments', 'toString', 'constructor', '__proto__', 'nope']);
  const table = { companies: ['Name', 'Short code'], projects: ['Name', 'Short code', 'Company'], suppliers: ['Name', 'Email'], currencies: ['Name', 'Currency code', 'Currency units per USD 1'],
    budgets: ['Name', 'Company', 'Project', 'Budget currency', 'Categories'],
    orders: ['Company', 'Project', 'Approved budget', 'Supplier', 'PO number', 'Invoice number', 'Currency', 'Full order amount', 'Description', 'Budget category allocations', 'Supporting PDFs', 'Payment request date', 'Payment currency', 'Payment request %', 'Payment Amount', 'Payment terms'],
    payments: ['Main request number', 'Payment request date', 'Payment currency', 'Payment request %', 'Payment Amount', 'Payment terms'] };
  const fields = Object.hasOwn(table, kind) ? table[kind] : [];
  const n = int(1, 999);
  const good = {
    Name: kind === 'budgets' ? `Imported budget ${n}` : `Fictional Import ${n}`, 'Short code': `FI${n}`, Company: 'FLR', Project: 'VU', Email: pick(['', 'imp@example.test']),
    'Currency code': pick(['chf', 'JPY', 'sgd']), 'Currency units per USD 1': '0.9', 'Budget currency': 'usd', Categories: 'Civil:1000 | MEP:200',
    'Approved budget': 'Villa budget', Supplier: 'Fictional Builders', 'PO number': `IPO-${n}`, 'Invoice number': '', Currency: 'usd', 'Full order amount': '1000',
    Description: 'Imported fictional works', 'Budget category allocations': pick(['Civil:1000', 'Civil:600 | MEP:400']), 'Supporting PDFs': pick(['', 'doc-1.pdf']),
    'Payment request date': '', 'Payment currency': '', 'Payment request %': pick(['25', '']), 'Payment Amount': '', 'Payment terms': '',
    'Main request number': s.orders.filter((o) => !o.deleted).length ? pick(s.orders.filter((o) => !o.deleted)).number : 'nope',
  };
  if (!good['Payment request %']) good['Payment Amount'] = '100';
  const valid = chance(0.6);
  const value = (f) => {
    if (valid && f in good) return good[f];
    switch (f) {
      case 'Name': return pick(['Fictional Import Co', 'Fictional Import Co', 'Villa Upgrade', 'Imported budget', '']);
      case 'Short code': return pick(['FIC', 'FLR', 'x']);
      case 'Company': return pick(['FLR', 'c1', 'fictional lagoon resort', 'FRH', 'Nope']);
      case 'Project': return pick(['VU', 'Villa Upgrade', 'SB', 'nope']);
      case 'Email': return pick(['', 'imp@example.test', 'bad']);
      case 'Currency code': return pick(['chf', 'USD', 'jpy']);
      case 'Currency units per USD 1': return pick(['0.9', '1,000', 'x', '.5', '5.']);
      case 'Budget currency': return pick(['usd', 'MVR']);
      case 'Categories': return pick(['Civil:1000 | MEP:200', 'Civil:1,000', 'NoAmount', ':5']);
      case 'Approved budget': return pick(['Villa budget', 'b1', 'b2', 'nope']);
      case 'Supplier': return pick(['Fictional Builders', 's2', 'nope']);
      case 'PO number': return `IPO-${int(1, 20)}`;
      case 'Invoice number': return pick(['', `IINV-${int(1, 9)}`]);
      case 'Currency': return pick(['usd', 'MVR', 'eur']);
      case 'Full order amount': return pick(['1000', '1000.50', '$1000', '0']);
      case 'Description': return 'Imported fictional works';
      case 'Budget category allocations': return pick(['Civil:1000', 'Civil:500 | MEP:500', 'Fit-out:1000', 'Civil:999', 'Unknown:1000']);
      case 'Supporting PDFs': return pick(['', 'doc-1.pdf', 'doc-1.pdf | missing.pdf', 'doc-1.pdf||']);
      case 'Payment request date': return pick(['', '2026-03-01', '2026-13-01']);
      case 'Payment currency': return pick(['', 'USD', 'MVR']);
      case 'Payment request %': return pick(['', '25', '150', 'x']);
      case 'Payment Amount': return pick(['', '', '100', '-1']);
      case 'Payment terms': return pick(['', 'Advance']);
      case 'Main request number': return s.orders.length && chance(0.8) ? pick(s.orders).number : 'nope';
    }
    return '';
  };
  const rows = Array.from({ length: pick([1, 1, 2, 3]) }, (_, i) => {
    const values = Object.fromEntries(fields.map((f) => [f, value(f)]));
    if (chance(0.05)) values.Extra = 'x';
    if (chance(0.03)) delete values[fields[0]];
    return chance(0.95) ? { line: pick([undefined, i + 2, 'L' + i]), values } : pick([{ values: null }, { line: 3 }, 5]);
  });
  return { type: pick(['import.preview', 'import.create', 'import.create']), data: { kind, rows: chance(0.95) ? rows : pick([[], 'x']), files: valid ? [PDF(1)] : pick([undefined, [PDF(1)], [PDF(1), PDF(1)], 'x']) } };
}

function legacyState() {
  const s = fixture();
  s.version = pick([1, 2]);
  if (chance(0.5)) delete s.tasks;
  if (chance(0.5)) delete s.counters;
  s.settings.numberFormat = '{COMPANY}-{PROJECT}-OLD-{SEQ}';
  for (const c of s.companies) if (chance(0.6)) delete c.code;
  for (const p of s.projects) if (chance(0.6)) delete p.code;
  s.companies.push({ id: 'c3', name: pick(['  fictional lagoon   retreat', 'Fictional Lagoon Resort', 'Ünïcode Örtlich', '🌴 Palm', 'a']) });
  s.projects.push({ id: 'p4', companyId: 'c3', name: 'Villa Upgrade' });
  for (const b of s.budgets) if (chance(0.5)) { delete b.currency; delete b.rate; }
  s.users.push({ id: 'oldreq', name: 'Old Requester', username: 'oldreq', email: 'oldreq@example.test', role: 'Requester', companies: ['c1'], active: true });
  s.users.push({ id: 'rev', name: 'Old Reviewer', username: 'rev', email: 'rev@example.test', role: pick(['Reviewer', 'Approver']), team: 'Planning', approvalLevel: 1, companies: ['c1'], active: true });
  for (let i = 1; i <= int(1, 4); i++) {
    const o = { id: 'lo' + i, companyId: 'c1', projectId: pick(['p1', 'p2']), budgetId: 'b1', supplierId: 's1', currency: 'USD', rate: 1, total: 1000, po: 'LPO-' + i, invoice: '', description: 'Legacy fictional order',
      allocations: [{ categoryId: 'k1', amount: 1000 }], requestedBy: 'req', createdBy: 'req', createdAt: '2026-01-05T00:00:00.000Z', team: 'Purchasing' };
    if (chance(0.5)) o.number = 'OLD-' + i;
    if (chance(0.5)) o.files = [PDF(1)];
    if (chance(0.3)) o.amendment = { id: 'am' + i, status: pick(['Reviewer', 'Approval 1', 'Finance', 'Draft']), companyId: 'c1', requestedBy: 'req', data: { total: 1200 }, approvals: [], history: [] };
    s.orders.push(o);
    const r = { id: 'lr' + i, orderId: chance(0.95) ? o.id : 'missing-order', companyId: 'c1', status: pick(['Draft', 'Reviewer', 'Approval 1', 'Approval 2', 'Finance', 'Paid']), amount: 250, percent: 25,
      number: pick(['FLR-VU-PAY-000007', 'X-12', undefined, 'NODIGITS']), requestedBy: 'req', approvals: [{ stage: 'Reviewer', by: 'Old Reviewer', userId: 'rev', at: '2026-01-06T00:00:00.000Z', level: 1 }], history: [], remarks: [], team: 'Purchasing' };
    if (chance(0.5)) r.currency = 'USD';
    if (chance(0.5)) r.finalApprovedAt = '2026-01-07T00:00:00.000Z';
    if (r.status === 'Paid') r.payment = { amount: 250, currency: 'USD', date: '2026-01-08', type: 'TT', ...(chance(0.5) ? { file: PDF(1) } : {}) };
    s.requests.push(r);
  }
  return s;
}

for (let e = 0; e < episodes; e++) {
  // Migrations of older workspaces (and the no-op on current ones).
  for (let i = 0; i < 3; i++) { try { D.migrateState(legacyState(), tick()); } catch {} }
  try { D.migrateState(fixture(), tick()); } catch {}
  const s = fixture();
  if (e % 5 === 4) s.settings.lockMinutes = 10;
  const steps = int(30, 60);
  for (let i = 0; i < steps; i++) step(s);
  for (const u of s.users) { try { D.visibleState(s, u); } catch {} }
}

const outDir = new URL('../../../backend/internal/domain/testdata/', import.meta.url);
mkdirSync(outDir, { recursive: true });
const data = combine(traceDir);
writeFileSync(new URL('fuzz-traces.json.gz', outDir), gzipSync(JSON.stringify(data), { level: 9 }));
rmSync(work, { recursive: true, force: true });
const counts = {};
for (const c of data.calls) { const k = c.fn + (c.action ? ' ' + String(c.action.type) : '') + (c.ok ? '' : ' (error)'); counts[k] = (counts[k] || 0) + 1; }
console.log(`Wrote ${data.calls.length} calls and ${Object.keys(data.states).length} states (seed ${seed}).`);
console.log(Object.entries(counts).sort().map(([k, v]) => `  ${k}: ${v}`).join('\n'));
