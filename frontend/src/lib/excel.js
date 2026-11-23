// CSV / XLSX import support. ExcelJS is large, so it loads on first use in its own chunk.
import { importFields, parseCSV, tableRows, excelRows, checkExcelArchive } from "../domain/import-data.js";
import { download } from "./files.js";

let excel;
export function excelLibrary() {
  excel ||= import("exceljs").then((m) => m.default || m, (e) => { excel = null; throw e; });
  return excel;
}

export async function importTemplate(kind, asExcel) {
  const headers = importFields[kind];
  if (asExcel) {
    const Excel = await excelLibrary(), workbook = new Excel.Workbook(), sheet = workbook.addWorksheet("Import");
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((col, i) => { col.width = Math.max(20, headers[i].length + 3); });
    // Dates are day first: entered dates show as DD/MM/YYYY, matching what the import reads.
    const dateColumn = headers.indexOf("Payment request date");
    if (dateColumn >= 0) sheet.getColumn(dateColumn + 1).numFmt = "dd/mm/yyyy";
    download(new Blob([await workbook.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${kind}-template.xlsx`);
  } else download(new Blob(["﻿" + headers.join(",") + "\r\n"], { type: "text/csv;charset=utf-8" }), `${kind}-template.csv`);
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
