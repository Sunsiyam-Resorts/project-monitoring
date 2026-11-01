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
};
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
  table.slice(1).forEach((cells, i) => {
    if (cells.every(c => !String(c ?? '').trim())) return;
    requireValue(cells.length <= headers.length, `Row ${i + 2}: too many columns`);
    rows.push({ line: i + 2, values: Object.fromEntries(fields.map(f => [f, String(cells[headers.indexOf(norm(f))] ?? '').trim()])) });
  });
  requireValue(rows.length > 0 && rows.length <= 100, 'Import between 1 and 100 records at a time');
  return rows;
}

export function excelRows(kind, workbook) {
  const sheets = workbook.worksheets.filter(s => s.actualRowCount);
  requireValue(sheets.length === 1, 'Use exactly one populated worksheet');
  const sheet = sheets[0];
  requireValue(sheet.rowCount <= 101 && sheet.columnCount <= importFields[kind].length, 'Excel imports support up to 100 records and the template columns only');
  const table = [];
  for (let i = 1; i <= sheet.rowCount; i++) {
    const row = [];
    for (let j = 1; j <= sheet.columnCount; j++) {
      const v = sheet.getCell(i, j).value;
      if (v instanceof Date) row.push(v.toISOString().slice(0, 10));
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

export function importCommand(s, u, kind, v, files = [], team = u.team) {
  requireValue(importFields[kind], 'Invalid import type');
  requireValue(Object.keys(v).length === importFields[kind].length && Object.keys(v).every(k => importFields[kind].includes(k)), 'Use the template columns only');
  const payment = () => {
    requireValue(v['Payment Amount'] || v['Payment request %'], 'Enter Payment Amount or Payment request %');
    const p = { date: v['Payment request date'], currency: v['Payment currency'], terms: v['Payment terms'] };
    if (v['Payment Amount']) p.amount = positive(v['Payment Amount'], 'Payment Amount');
    if (v['Payment request %']) p.percent = positive(v['Payment request %'], 'Payment request %');
    // One input avoids silently accepting conflicting amount/percentage values.
    requireValue(!(p.amount && p.percent), 'Fill either Payment Amount or Payment request %, leaving the other blank');
    return p;
  };
  if (kind === 'payments') {
    const o = find(s.orders, v['Main request number'], 'main request');
    return { type: 'request.create', data: { orderId: o.id, ...payment() } };
  }
  let company, project;
  if (['projects', 'budgets', 'orders'].includes(kind)) company = find(s.companies, v.Company, 'company');
  if (['budgets', 'orders'].includes(kind)) project = find(s.projects.filter(p => p.companyId === company.id), v.Project, 'project');
  if (kind === 'orders') {
    const budget = find(s.budgets.filter(b => b.projectId === project.id && b.companyId === company.id), v['Approved budget'], 'approved budget');
    const names = v['Supporting PDFs'].split('|').map(n => n.trim());
    requireValue(names.every(Boolean), 'Supporting PDFs are required');
    return { type: 'order.create', data: {
      companyId: company.id, projectId: project.id, budgetId: budget.id,
      supplierId: find(s.suppliers, v.Supplier, 'supplier').id,
      team: u.role === 'Admin' ? team : u.team, po: v['PO number'], invoice: v['Invoice number'], currency: v.Currency.toUpperCase(),
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
