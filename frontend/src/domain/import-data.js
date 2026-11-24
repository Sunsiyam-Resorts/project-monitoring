import { randomId } from './ids.js';
// Shared by the browser and server. Import fields never accept approvals or issued IDs.
export const importFields = {
  companies: ['Name', 'Short code'],
  projects: ['Name', 'Short code', 'Company'],
  suppliers: ['Name', 'Email'],
  currencies: ['Name', 'Currency code', 'Currency units per USD 1'],
  budgets: ['Name', 'Company', 'Project', 'Budget currency', 'Categories'],
  orders: ['Company', 'Project', 'Approved budget', 'Supplier', 'PO number', 'Invoice number', 'Currency', 'Full order amount', 'Description', 'Budget category allocations', 'Supporting PDFs', 'Payment request date', 'Payment currency', 'Payment request %', 'Payment Amount', 'Payment terms'],
  payments: ['Main request number', 'Payment request date', 'Payment currency', 'Payment request %', 'Payment Amount', 'Payment terms'],
  // Updates existing payment requests found by their system-generated reference. Main request
  // number to Current status are read-only context filled in by the template and ignored.
  paymentUpdates: ['Payment request reference', 'Main request number', 'Supplier', 'Currency', 'Amount', 'Current status', 'New status', 'Payment type', 'Payment date', 'Remark'],
};
export const PAYMENT_UPDATE_STATUSES = ['Paid', 'On Hold', 'Rejected'];
export const PAYMENT_TYPES = ['Cheque', 'Transfer', 'TT'];
// The pre-filled payment update template lists up to this many payment requests.
export const PAYMENT_UPDATE_TEMPLATE_ROWS = 1000;
const norm = v => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
function requireValue(ok, message) { if (!ok) throw Error(message); }

export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], value = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else value += c;
    } else if (c === '"') {
      requireValue(!value && !closed, 'Unexpected quote in CSV'); quoted = true;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(value); value = ''; closed = false;
      if (c !== ',') {
        rows.push(row); row = [];
        if (c === '\r' && text[i + 1] === '\n') i++;
      }
    } else { requireValue(!closed, 'Unexpected text after closing CSV quote'); value += c; }
  }
  requireValue(!quoted, 'Unclosed CSV quote');
  if (row.length || value || closed) rows.push([...row, value]);
  return rows;
}

export function tableRows(kind, table) {
  const fields = importFields[kind];
  requireValue(fields, 'Invalid import type');
  requireValue(table.length > 1, 'Include column headings and at least one data row');
  const headers = table[0].map(norm);
  requireValue(new Set(headers).size === headers.length, 'Duplicate column heading');
  for (const h of headers) requireValue(fields.some(f => norm(f) === h), `Unknown column: ${h || '(blank)'}`);
  for (const f of fields) requireValue(headers.includes(norm(f)), `Missing column: ${f}`);
  const rows = [];
  // A payment update row with no New status leaves that payment request unchanged.
  const status = kind === 'paymentUpdates' ? headers.indexOf(norm('New status')) : -1;
  table.slice(1).forEach((cells, i) => {
    if (cells.every(c => !String(c ?? '').trim())) return;
    if (status >= 0 && !String(cells[status] ?? '').trim()) return;
    requireValue(cells.length <= headers.length, `Row ${i + 2}: too many columns`);
    rows.push({ line: i + 2, values: Object.fromEntries(fields.map(f => [f, String(cells[headers.indexOf(norm(f))] ?? '').trim()])) });
  });
  requireValue(status < 0 || rows.length > 0, 'Fill in New status for at least one payment request');
  requireValue(rows.length > 0 && rows.length <= 100, 'Import between 1 and 100 records at a time');
  return rows;
}

export function excelRows(kind, workbook) {
  const sheets = workbook.worksheets.filter(s => s.actualRowCount);
  requireValue(sheets.length === 1, 'Use exactly one populated worksheet');
  const sheet = sheets[0];
  // The payment update template lists every payment request awaiting payment; at most 100 are filled in.
  const maxRows = kind === 'paymentUpdates' ? PAYMENT_UPDATE_TEMPLATE_ROWS + 1 : 101;
  requireValue(sheet.rowCount <= maxRows && sheet.columnCount <= importFields[kind].length, 'Excel imports support up to 100 records and the template columns only');
  const table = [];
  for (let i = 1; i <= sheet.rowCount; i++) {
    const row = [];
    for (let j = 1; j <= sheet.columnCount; j++) {
      const v = sheet.getCell(i, j).value;
      // A native Excel date cell becomes DD/MM/YYYY, the format typed dates use.
      if (v instanceof Date) row.push(v.toISOString().slice(0, 10).split('-').reverse().join('/'));
      else {
        requireValue(v === null || typeof v !== 'object', `Row ${i}: use plain values without formulas, links or rich text`);
        row.push(v ?? '');
      }
    }
    table.push(row);
  }
  return tableRows(kind, table);
}

// Bound decompression before ExcelJS reads an untrusted ZIP container.
export function checkExcelArchive(buffer) {
  const view = new DataView(buffer);
  let end = -1;
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  requireValue(end >= 0, 'Invalid XLSX archive');
  const entries = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true), total = 0;
  requireValue(entries > 0 && entries <= 500, 'XLSX archive has too many entries');
  for (let i = 0; i < entries; i++) {
    requireValue(offset + 46 <= view.byteLength && view.getUint32(offset, true) === 0x02014b50, 'Invalid XLSX archive');
    total += view.getUint32(offset + 24, true);
    requireValue(total <= 20000000, 'Expanded XLSX content must not exceed 20 MB');
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
}

function find(records, value, label) {
  const matches = records.filter(r => [r.id, r.name, r.code, r.number].some(v => v && norm(v) === norm(value)));
  requireValue(value && matches.length === 1, `Select a unique ${label} by name, code or reference`);
  return matches[0];
}
function positive(value, label) {
  requireValue(/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) && Number(value) > 0 && Number.isFinite(Number(value)), `${label} must be a positive number without currency symbols or thousands separators`);
  return Number(value);
}
function categories(value) {
  return value.split('|').map(part => {
    const at = part.lastIndexOf(':');
    requireValue(at > 0, 'Use Category:amount | Category:amount');
    return { name: part.slice(0, at).trim(), amount: positive(part.slice(at + 1).trim(), 'Category amount') };
  });
}

// Import dates are written day first, DD/MM/YYYY (day and month may be one digit), and stored
// as YYYY-MM-DD like every other date. A blank date stays blank.
function importDate(value, label = 'Payment request date') {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  const [d, mo, y] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
  const days = mo === 2 ? (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(mo) ? 30 : 31;
  requireValue(m && mo >= 1 && mo <= 12 && d >= 1 && d <= days, `${label} must be a real date written DD/MM/YYYY, for example 23/11/2026 (found ${s})`);
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

const cell = v => String(v ?? '').trim();
function oneOf(value, options, label) {
  const match = options.find(o => norm(o) === norm(value));
  requireValue(match, `${label} must be one of ${options.join(', ')}`);
  return match;
}

// A payment update becomes the ordinary request actions Finance would take one by one: Paid
// releases a hold first and records the remark, if any, before the payment; On Hold and
// Rejected need the remark as their reason.
function paymentUpdate(s, v) {
  const r = find(s.requests.filter(r => !r.deleted), v['Payment request reference'], 'payment request');
  requireValue(['Finance', 'On Hold'].includes(r.status), `${r.number} is ${r.status}; only payment requests with Finance or On Hold can be updated`);
  const status = oneOf(v['New status'], PAYMENT_UPDATE_STATUSES, 'New status');
  const remark = cell(v.Remark), id = r.id, steps = [];
  if (status === 'Paid') {
    const paymentType = oneOf(v['Payment type'], PAYMENT_TYPES, 'Payment type');
    const paymentDate = importDate(v['Payment date'], 'Payment date');
    requireValue(paymentDate, 'Enter the Payment date');
    if (r.status === 'On Hold') steps.push({ type: 'request.resume', id });
    if (remark) steps.push({ type: 'request.remark', id, data: { reason: remark } });
    steps.push({ type: 'request.pay', id, data: { paymentType, paymentDate } });
  } else {
    requireValue(!(status === 'On Hold' && r.status === 'On Hold'), `${r.number} is already On Hold`);
    requireValue(!cell(v['Payment type']) && !cell(v['Payment date']), `Leave Payment type and Payment date blank when New status is ${status}`);
    requireValue(remark, `Enter a Remark giving the reason for ${status}`);
    steps.push({ type: status === 'On Hold' ? 'request.hold' : 'request.reject', id, data: { reason: remark } });
  }
  return { type: 'import.update', id, steps };
}

export function importCommand(s, u, kind, v, files = []) {
  requireValue(importFields[kind], 'Invalid import type');
  requireValue(Object.keys(v).length === importFields[kind].length && Object.keys(v).every(k => importFields[kind].includes(k)), 'Use the template columns only');
  const payment = () => {
    requireValue(v['Payment Amount'] || v['Payment request %'], 'Enter Payment Amount or Payment request %');
    const p = { date: importDate(v['Payment request date']), currency: v['Payment currency'], terms: v['Payment terms'] };
    if (v['Payment Amount']) p.amount = positive(v['Payment Amount'], 'Payment Amount');
    if (v['Payment request %']) p.percent = positive(v['Payment request %'], 'Payment request %');
    // One input avoids silently accepting conflicting amount/percentage values.
    requireValue(!(p.amount && p.percent), 'Fill either Payment Amount or Payment request %, leaving the other blank');
    return p;
  };
  if (kind === 'payments') {
    const o = find(s.orders.filter(o => !o.deleted), v['Main request number'], 'main request');
    return { type: 'request.create', data: { orderId: o.id, ...payment() } };
  }
  if (kind === 'paymentUpdates') return paymentUpdate(s, v);
  let company, project;
  if (['projects', 'budgets', 'orders'].includes(kind)) company = find(s.companies, v.Company, 'company');
  if (['budgets', 'orders'].includes(kind)) project = find(s.projects.filter(p => p.companyId === company.id), v.Project, 'project');
  if (kind === 'orders') {
    const budget = find(s.budgets.filter(b => b.projectId === project.id && b.companyId === company.id), v['Approved budget'], 'approved budget');
    // Supporting PDFs are optional; a blank cell attaches none.
    const listed = String(v['Supporting PDFs'] ?? '').trim();
    const names = listed ? listed.split('|').map(n => n.trim()) : [];
    requireValue(names.every(Boolean), 'Separate supporting PDF names with |');
    return { type: 'order.create', data: {
      companyId: company.id, projectId: project.id, budgetId: budget.id,
      supplierId: find(s.suppliers, v.Supplier, 'supplier').id,
      po: v['PO number'], invoice: v['Invoice number'], currency: v.Currency.toUpperCase(),
      total: positive(v['Full order amount'], 'Full order amount'), description: v.Description,
      allocations: categories(v['Budget category allocations']).map(c => ({ categoryId: find(budget.categories, c.name, 'budget category').id, amount: c.amount })),
      files: names.map(name => { const matches = files.filter(f => f.name === name); requireValue(matches.length === 1, `Attach exactly one PDF named ${name}`); return matches[0]; }),
      payment: payment(),
    } };
  }
  const record = { name: v.Name };
  if (company) record.companyId = company.id;
  if (project) record.projectId = project.id;
  if (['companies', 'projects'].includes(kind)) record.code = v['Short code'];
  if (kind === 'suppliers') {
    requireValue(!v.Email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.Email), 'Enter a valid supplier email'); record.email = v.Email;
  }
  if (kind === 'currencies') {
    record.id = v['Currency code'].toUpperCase();
    requireValue(!s.currencies.some(c => norm(c.id) === norm(record.id)), 'Currency already exists; edit it using Master Data');
    record.rate = positive(v['Currency units per USD 1'], 'Currency rate');
  }
  if (kind === 'budgets') {
    requireValue(!s.budgets.some(b => b.projectId === project.id && norm(b.name) === norm(record.name)), 'Budget already exists; revise it using Master Data');
    record.currency = v['Budget currency'].toUpperCase();
    record.categories = categories(v.Categories).map(c => ({ ...c, id: randomId() }));
  }
  if (kind === 'projects') requireValue(!s.projects.some(p => p.companyId === company.id && norm(p.name) === norm(record.name)), 'Project name already exists in this company');
  return { type: 'master.save', data: { kind, record } };
}
