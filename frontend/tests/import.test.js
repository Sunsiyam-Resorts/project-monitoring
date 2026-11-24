import { test } from 'vitest';
import assert from 'node:assert/strict';
import { apply, today, visibleState } from '../src/domain/domain.js';
import { paymentUpdateRows } from '../src/lib/selectors.js';
import { demoState } from '../src/domain/demo.js';
import { importFields, tableRows, parseCSV, excelRows, checkExcelArchive } from '../src/domain/import-data.js';
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
  assert.throws(() => run(s, s.users.find(u => u.role === 'Planning'), 'companies', rows), /role/);
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
  const value = { Company: 'c1', Project: 'p1', 'Approved budget': b.name, Supplier: 's1', 'PO number': 'FICTIONAL-IMPORT-1', Currency: 'USD', 'Full order amount': '100', Description: 'Fictional test import', 'Budget category allocations': `${b.categories[0].name}:100`, 'Supporting PDFs': pdf.name, 'Payment request date': '01/11/2026', 'Payment request %': '30' };
  return { s, u, value };
}

test('Order imports require evidence, send each payment request to Finance and preserve numbering on failure', () => {
  const { s, u, value } = orderSetup(), before = structuredClone(s), rows = rowsFor('orders', [value]);
  assert.throws(() => run(s, u, 'orders', rows), /Attach exactly one PDF/);
  assert.deepEqual(s, before);
  run(s, u, 'orders', rows, { files: [pdf] }, 'import.preview');
  assert.deepEqual(s, before);
  run(s, u, 'orders', rows, { files: [pdf] });
  const o = s.orders[0], r = s.requests[0];
  assert.ok(o.number); assert.ok(r.number);
  // Imported payment requests go straight to Finance, like those created one by one.
  assert.equal(r.status, 'Finance'); assert.equal(r.amount, 30); assert.deepEqual(r.approvals, []);
  assert.equal(o.committedAt, r.createdAt); assert.equal(o.commitmentRequestId, r.id);
  const saved = structuredClone(s);
  assert.throws(() => run(s, u, 'orders', rows, { files: [pdf] }), /Duplicate PO/);
  assert.deepEqual(s, saved);
  const payments = rowsFor('payments', [{ 'Main request number': o.number, 'Payment Amount': '20', 'Payment terms': 'Fictional next instalment' }]);
  run(s, u, 'payments', payments);
  assert.equal(s.requests[1].amount, 20); assert.equal(s.requests[1].status, 'Finance');
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
  assert.equal(s.requests[0].status, 'Finance');
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

test('Import dates are day first, DD/MM/YYYY, and are stored as YYYY-MM-DD', async () => {
  const { s, u, value } = orderSetup();
  run(s, u, 'orders', rowsFor('orders', [{ ...value, 'Payment request date': '3/11/2026' }]), { files: [pdf] });
  assert.equal(s.requests[0].date, '2026-11-03');
  const o = s.orders[0], pay = (date) => rowsFor('payments', [{ 'Main request number': o.number, 'Payment Amount': '10', 'Payment request date': date }]);
  run(s, u, 'payments', pay('29/02/2028'));
  assert.equal(s.requests[1].date, '2028-02-29');
  const saved = structuredClone(s);
  for (const date of ['2026-11-03', '11/23/2026', '31/04/2026', '29/02/2027', '00/01/2026', '1/1/26', '01-11-2026'])
    assert.throws(() => run(s, u, 'payments', pay(date)), new RegExp(`Row 2: Payment request date must be a real date written DD/MM/YYYY, for example 23/11/2026 \\(found ${date}\\)`));
  assert.deepEqual(s, saved);
  // A native Excel date cell is read day first too, whatever its display format.
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('Import');
  sheet.addRow(importFields.payments);
  sheet.addRow([o.number, new Date(Date.UTC(2026, 10, 3)), '', '', '10', '']);
  sheet.getCell(2, 2).numFmt = 'm/d/yy';
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.equal(excelRows('payments', loaded)[0].values['Payment request date'], '03/11/2026');
});

test('Payment updates find payment requests by reference and apply the Finance actions row by row', () => {
  const { s, u, value } = orderSetup();
  run(s, u, 'orders', rowsFor('orders', [value]), { files: [pdf] });
  const o = s.orders[0], fin = s.users.find(x => x.id === 'fin');
  run(s, u, 'payments', rowsFor('payments', [1, 2, 3].map(() => ({ 'Main request number': o.number, 'Payment Amount': '10' }))));
  let [r1, r2, r3, r4] = s.requests;
  for (const t of ['lock', 'request.hold', 'unlock']) apply(s, fin, { type: t, id: r2.id, data: { reason: 'Awaiting invoice' } });
  const day = today().split('-').reverse().join('/');
  const update = records => rowsFor('paymentUpdates', records);
  const rows = update([
    { 'Payment request reference': r1.number, 'New status': 'Paid', 'Payment type': 'Transfer', 'Payment date': day, Remark: 'Paid by bank transfer' },
    { 'Payment request reference': r2.number, 'New status': 'paid', 'Payment type': 'tt', 'Payment date': day },
    { 'Payment request reference': r3.number, 'New status': 'On Hold', Remark: 'Supplier query' },
    { 'Payment request reference': r4.number, 'New status': 'Rejected', Remark: 'Raised twice' },
  ]);
  // The requester's own Finance role never processes them (separation of duties); Viewer never imports.
  assert.throws(() => run(s, u, 'paymentUpdates', rows), /Row 2: Finance role and submitted request required/);
  assert.throws(() => run(s, s.users.find(x => x.role === 'Viewer'), 'paymentUpdates', rows), /role/);
  const before = structuredClone(s);
  run(s, fin, 'paymentUpdates', rows, {}, 'import.preview');
  assert.deepEqual(s, before);
  run(s, fin, 'paymentUpdates', rows);
  // An import replaces the state with its checked copy, so read the records again.
  [r1, r2, r3, r4] = s.requests;
  assert.deepEqual([r1, r2, r3, r4].map(r => r.status), ['Paid', 'Paid', 'On Hold', 'Rejected']);
  assert.deepEqual([r1.payment.type, r2.payment.type], ['Transfer', 'TT']);
  assert.equal(r1.payment.date, today());
  assert.equal(r1.remarks.at(-1).text, 'Paid by bank transfer');
  assert.equal(r3.remarks.at(-1).text, 'Supplier query');
  assert.equal(r4.history.at(-1).reason, 'Raised twice');
  // Each step is audited as if taken one by one; the hold on r2 was released first.
  const actions = s.audit.filter(a => a.userId === fin.id).map(a => a.action);
  assert.deepEqual(actions.slice(-7), ['request.remark', 'request.pay', 'request.resume', 'request.pay', 'request.hold', 'request.reject', 'import.create']);
  assert.deepEqual(s.locks, {});
  // Every row must pass, or nothing changes.
  const saved = structuredClone(s);
  const fails = (record, message) => assert.throws(() => run(s, fin, 'paymentUpdates', update([record])), message);
  fails({ 'Payment request reference': 'PAY-NOPE', 'New status': 'Paid' }, /unique payment request/);
  fails({ 'Payment request reference': r1.number, 'New status': 'Rejected', Remark: 'x' }, new RegExp(`${r1.number} is Paid; only payment requests with Finance or On Hold`));
  fails({ 'Payment request reference': r3.number, 'New status': 'Paid', 'Payment type': 'Cheque' }, /Enter the Payment date/);
  fails({ 'Payment request reference': r3.number, 'New status': 'Paid', 'Payment type': 'Cheque', 'Payment date': '01/01/2099' }, /no later than today/);
  fails({ 'Payment request reference': r3.number, 'New status': 'Paid', 'Payment type': 'Cheque', 'Payment date': '2026-11-01' }, /Payment date must be a real date written DD\/MM\/YYYY/);
  fails({ 'Payment request reference': r3.number, 'New status': 'Paid', 'Payment type': 'Cash', 'Payment date': day }, /Payment type must be one of Cheque, Transfer, TT/);
  fails({ 'Payment request reference': r3.number, 'New status': 'Finance' }, /New status must be one of Paid, On Hold, Rejected/);
  fails({ 'Payment request reference': r3.number, 'New status': 'On Hold', Remark: 'Again' }, /already On Hold/);
  fails({ 'Payment request reference': r3.number, 'New status': 'Rejected', 'Payment type': 'TT', Remark: 'x' }, /Leave Payment type and Payment date blank/);
  fails({ 'Payment request reference': r3.number, 'New status': 'Rejected' }, /Enter a Remark giving the reason for Rejected/);
  assert.deepEqual(s, saved);
});

test('Admin may update payment requests it raised; the template lists only what the user can process', async () => {
  const { s, u, value } = orderSetup(), a = admin(s);
  run(s, a, 'orders', rowsFor('orders', [value]), { files: [pdf] });
  run(s, u, 'orders', rowsFor('orders', [{ ...value, 'PO number': 'FICTIONAL-IMPORT-2' }]), { files: [pdf] });
  const [own, other] = s.requests;
  // The template rows: by reference, with read-only context; Finance never sees its own requests.
  const listed = (user) => paymentUpdateRows(visibleState(s, user), user).map(r => r[0]);
  assert.deepEqual(listed(a), [own.number, other.number].sort());
  assert.deepEqual(listed(u), [own.number]);
  const [row] = paymentUpdateRows(visibleState(s, a), a).filter(r => r[0] === own.number);
  assert.deepEqual(row.slice(1, 6), [s.orders[0].number, s.suppliers.find(x => x.id === 's1').name, 'USD', 30, 'Finance']);
  run(s, a, 'paymentUpdates', rowsFor('paymentUpdates', [{ 'Payment request reference': own.number, 'New status': 'Paid', 'Payment type': 'Cheque', 'Payment date': today().split('-').reverse().join('/') }]));
  const paid = s.requests.find(r => r.id === own.id);
  assert.equal(paid.status, 'Paid');
  assert.equal(paid.payment.userId, a.id);
  // Rows without a New status are left out; a sheet with none is refused.
  const headers = importFields.paymentUpdates;
  const blank = headers.map(() => '');
  const filled = (status) => headers.map(h => h === 'Payment request reference' ? other.number : h === 'New status' ? status : h === 'Remark' ? 'Query' : 'context');
  assert.equal(tableRows('paymentUpdates', [headers, filled(''), filled('On Hold'), filled('')]).length, 1);
  assert.throws(() => tableRows('paymentUpdates', [headers, filled(''), blank]), /Fill in New status/);
  // A pre-filled Excel template may list more than 100 payment requests; at most 100 are filled in.
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('Import');
  sheet.addRow(headers);
  for (let i = 0; i < 150; i++) sheet.addRow(filled(i === 7 ? 'On Hold' : ''));
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.equal(excelRows('paymentUpdates', loaded).length, 1);
});
