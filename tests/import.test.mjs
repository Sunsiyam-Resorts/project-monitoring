import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../public/domain.js';
import { demoState } from '../public/demo.js';
import { importFields, tableRows, parseCSV, excelRows, checkExcelArchive } from '../public/import-data.js';
import ExcelJS from 'exceljs';

const rowsFor = (kind, records) => tableRows(kind, [importFields[kind], ...records.map(v => importFields[kind].map(f => v[f] || ''))]);
const admin = s => s.users.find(u => u.role === 'Admin');
const run = (s, u, kind, rows, extra = {}, type = 'import.create') => apply(s, u, { type, data: { kind, rows, ...extra } });
const pdf = { name: 'sample.pdf', type: 'application/pdf', data: 'JVBERi0xLjQK' };

test('Real XLSX round-trip imports typed values and rejects formulas and multiple populated sheets', async () => {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('Import');
  sheet.addRow(importFields.currencies);
  sheet.addRow(['Fictional test currency', 'ZZZ', 2.5]);
  const buffer = await workbook.xlsx.writeBuffer();
  const array = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  checkExcelArchive(array);
  const loaded = new ExcelJS.Workbook(); await loaded.xlsx.load(buffer);
  const rows = excelRows('currencies', loaded), s = demoState();
  run(s, admin(s), 'currencies', rows);
  assert.equal(s.currencies.at(-1).rate, 2.5);
  loaded.worksheets[0].getCell('C2').value = { formula: '1+1', result: 2 };
  assert.throws(() => excelRows('currencies', loaded), /without formulas/);
  loaded.addWorksheet('Other').addRow(['Unexpected']);
  assert.throws(() => excelRows('currencies', loaded), /one populated/);
  assert.throws(() => checkExcelArchive(new ArrayBuffer(10)), /Invalid XLSX/);
});

test('CSV handles quoted commas, newlines, escaped quotes and BOM; rejects malformed headings and quoting', () => {
  assert.deepEqual(parseCSV('\uFEFFName,Email\r\n"A, ""B""\nC",sample@example.com\r\n'), [['Name', 'Email'], ['A, "B"\nC', 'sample@example.com']]);
  assert.throws(() => parseCSV('Name\n"bad'), /Unclosed/);
  assert.throws(() => tableRows('suppliers', [['Name', 'Name'], ['a','b']]), /Duplicate/);
  assert.throws(() => tableRows('suppliers', [['Name','Status'], ['a','Paid']]), /Unknown/);
});

test('Master preview is read-only and a duplicate batch rolls back every row', () => {
  const s = demoState(), u = admin(s), before = structuredClone(s);
  const rows = rowsFor('companies', [{ Name: 'Fictional Import Company', 'Short code': 'IMPC' }]);
  run(s, u, 'companies', rows, {}, 'import.preview');
  assert.deepEqual(s, before);
  const bad = [...rows, { ...rows[0], line: 3 }];
  assert.throws(() => run(s, u, 'companies', bad), /Row 3.*already exists/);
  assert.deepEqual(s, before);
  run(s, u, 'companies', rows);
  assert.equal(s.companies.at(-1).code, 'IMPC');
  assert.equal(s.audit.at(-1).action, 'import.create');
  assert.throws(() => run(s, s.users.find(u => u.role === 'Requester'), 'companies', rows), /role/);
});

test('Imports create related master data and preserve existing currency and budget history', () => {
  const s = demoState(), u = admin(s), company = s.companies[0];
  run(s, u, 'projects', rowsFor('projects', [{ Name: 'Fictional Import Project', 'Short code': 'IPR', Company: company.name }]));
  run(s, u, 'budgets', rowsFor('budgets', [{ Name: 'Fictional Import Budget', Company: company.name, Project: 'IPR', 'Budget currency': 'USD', Categories: 'Civil:100 | MEP:200' }]));
  const b = structuredClone(s.budgets.at(-1));
  assert.deepEqual(b.categories.map(c => c.amount), [100, 200]);
  const duplicate = rowsFor('budgets', [{ Name: b.name, Company: company.name, Project: 'IPR', 'Budget currency': 'USD', Categories: 'Civil:500' }]);
  assert.throws(() => run(s, u, 'budgets', duplicate), /revise it/);
  assert.deepEqual(s.budgets.at(-1), b);
  assert.throws(() => run(s, u, 'currencies', rowsFor('currencies', [{ Name: 'Changed USD', 'Currency code': 'USD', 'Currency units per USD 1': '2' }])), /already exists/);
  run(s, u, 'currencies', rowsFor('currencies', [{ Name: 'Fictional test currency', 'Currency code': 'ZZZ', 'Currency units per USD 1': '2' }]));
  assert.equal(s.currencies.at(-1).rate, 2);
  run(s, u, 'suppliers', rowsFor('suppliers', [{ Name: 'Fictional Import Supplier', Email: 'fictional@example.com' }]));
  assert.equal(s.suppliers.at(-1).email, 'fictional@example.com');
});

function orderSetup() {
  const s = demoState(); s.orders = []; s.requests = []; s.audit = []; s.locks = {};
  const u = s.users.find(u => u.id === 'req0'), b = s.budgets.find(b => b.id === 'b0');
  const value = { Company: 'c1', Project: 'p1', 'Approved budget': b.name, Supplier: 's1', 'PO number': 'FICTIONAL-IMPORT-1', Currency: 'USD', 'Full order amount': '100', Description: 'Fictional test import', 'Budget category allocations': `${b.categories[0].name}:100`, 'Supporting PDFs': pdf.name, 'Payment request date': '2026-11-01', 'Payment request %': '30' };
  return { s, u, value };
}

test('Order imports require evidence, create independent drafts and preserve numbering on failure', () => {
  const { s, u, value } = orderSetup(), before = structuredClone(s), rows = rowsFor('orders', [value]);
  assert.throws(() => run(s, u, 'orders', rows), /Attach exactly one PDF/);
  assert.deepEqual(s, before);
  run(s, u, 'orders', rows, { files: [pdf] }, 'import.preview');
  assert.deepEqual(s, before);
  run(s, u, 'orders', rows, { files: [pdf] });
  const o = s.orders[0], r = s.requests[0];
  assert.ok(o.number); assert.ok(r.number);
  assert.equal(r.status, 'Draft'); assert.equal(r.amount, 30); assert.deepEqual(r.approvals, []);
  assert.equal(o.committedAt, undefined);
  const saved = structuredClone(s);
  assert.throws(() => run(s, u, 'orders', rows, { files: [pdf] }), /Duplicate PO/);
  assert.deepEqual(s, saved);
  const payments = rowsFor('payments', [{ 'Main request number': o.number, 'Payment Amount': '20', 'Payment terms': 'Fictional next instalment' }]);
  run(s, u, 'payments', payments);
  assert.equal(s.requests[1].amount, 20); assert.equal(s.requests[1].status, 'Draft');
  assert.deepEqual(s.requests[1].approvals, []); assert.deepEqual(s.locks, {});
  const tooLarge = rowsFor('payments', [{ 'Main request number': o.number, 'Payment Amount': '60' }]);
  assert.throws(() => run(s, u, 'payments', tooLarge), /remaining order balance/);
});

test('Server rejects cross-company and cross-role imports, unauthorized columns, and locked parents', () => {
  const { s, u, value } = orderSetup(), rows = rowsFor('orders', [value]);
  assert.throws(() => run(s, { ...u, companies: [], groupAccess: false }, 'orders', rows, { files: [pdf] }), /Company access/);
  assert.throws(() => run(s, s.users.find(u => u.role === 'Viewer'), 'orders', rows, { files: [pdf] }), /role/);
  assert.throws(() => run(s, u, 'orders', [{ ...rows[0], values: { ...rows[0].values, Status: 'Paid' } }], { files: [pdf] }), /template columns/);
  run(s, u, 'orders', rows, { files: [pdf] });
  const o = s.orders[0];
  apply(s, admin(s), { type: 'lock', id: o.id });
  const saved = structuredClone(s);
  assert.throws(() => run(s, u, 'payments', rowsFor('payments', [{ 'Main request number': o.number, 'Payment Amount': '20' }])), /opened by another user/);
  assert.deepEqual(s, saved);
});

test('Admin and Finance order/payment imports need no team and preserve existing requester ownership', () => {
  const { s, u, value } = orderSetup(), a = admin(s);
  const rows = rowsFor('orders', [value]), before = structuredClone(s);
  run(s, a, 'orders', rows, { files: [pdf] }, 'import.preview');
  assert.deepEqual(s, before);
  run(s, a, 'orders', rows, { files: [pdf] });
  assert.equal(s.orders[0].team, undefined);
  assert.equal(s.requests[0].requestedBy, a.id);
  assert.equal(s.requests[0].status, 'Draft');
  assert.deepEqual(s.requests[0].approvals, []);
  run(s, u, 'orders', rowsFor('orders', [{ ...value, 'PO number': 'REQUESTER-PO' }]), { files: [pdf] });
  const order = s.orders.at(-1);
  assert.equal(order.requestedBy, u.id);
  run(s, a, 'payments', rowsFor('payments', [{ 'Main request number': order.number, 'Payment Amount': '10' }]));
  assert.equal(s.requests.at(-1).requestedBy, u.id);
  assert.equal(s.requests.at(-1).createdBy, a.id);
  const fin = s.users.find(x => x.role === 'Finance');
  run(s, fin, 'orders', rowsFor('orders', [{ ...value, 'PO number': 'FINANCE-PO', 'Invoice number': 'FINANCE-INV' }]), { files: [pdf] });
  assert.equal(s.orders.at(-1).requestedBy, fin.id);
});
