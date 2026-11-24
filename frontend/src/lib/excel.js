// CSV / XLSX import support. ExcelJS is large, so it loads on first use in its own chunk.
import { importFields, parseCSV, tableRows, excelRows, checkExcelArchive, PAYMENT_TYPES, PAYMENT_UPDATE_STATUSES } from "../domain/import-data.js";
import { csvCell, download } from "./files.js";

let excel;
export function excelLibrary() {
  excel ||= import("exceljs").then((m) => m.default || m, (e) => { excel = null; throw e; });
  return excel;
}

// The template: the headings, then any pre-filled rows (the payment update template lists the
// payment requests the user can process, by reference).
export async function importTemplate(kind, asExcel, rows = []) {
  const headers = importFields[kind];
  if (asExcel) {
    const Excel = await excelLibrary(), workbook = new Excel.Workbook(), sheet = workbook.addWorksheet("Import");
    sheet.addRow(headers);
    rows.forEach((row) => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((col, i) => { col.width = Math.max(20, headers[i].length + 3); });
    // Dates are day first: entered dates show as DD/MM/YYYY, matching what the import reads.
    for (const name of ["Payment request date", "Payment date"]) {
      const column = headers.indexOf(name);
      if (column >= 0) sheet.getColumn(column + 1).numFmt = "dd/mm/yyyy";
    }
    // Pre-filled rows offer the allowed values as drop-down lists.
    const lists = { "New status": PAYMENT_UPDATE_STATUSES, "Payment type": PAYMENT_TYPES };
    for (const [name, values] of Object.entries(lists)) {
      const column = headers.indexOf(name);
      if (column < 0) continue;
      for (let i = 2; i <= rows.length + 1; i++)
        sheet.getCell(i, column + 1).dataValidation = { type: "list", allowBlank: true, formulae: [`"${values.join(",")}"`] };
    }
    download(new Blob([await workbook.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${kind}-template.xlsx`);
  } else {
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    download(new Blob(["﻿" + csv + "\r\n"], { type: "text/csv;charset=utf-8" }), `${kind}-template.csv`);
  }
}

export async function readImport(file, kind) {
  if (!file?.size || file.size > 2000000) throw Error("Choose a CSV or XLSX file up to 2 MB");
  if (/\.csv$/i.test(file.name)) return tableRows(kind, parseCSV(await file.text()));
  if (!/\.xlsx$/i.test(file.name)) throw Error("Choose a .csv or .xlsx file");
  const Excel = await excelLibrary(), workbook = new Excel.Workbook();
  const buffer = await file.arrayBuffer();
  checkExcelArchive(buffer);
  await workbook.xlsx.load(buffer);
  return excelRows(kind, workbook);
}
