// Browser file handling: supporting PDFs, downloads and the dashboard CSV export.
import { kpis } from "../domain/domain.js";
import { nameOf } from "./selectors.js";

export function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readPDF(file) {
  if (!file || file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf") || file.size > 2000000)
    throw Error("Upload a PDF of at most 2 MB");
  return {
    name: file.name,
    type: file.type,
    data: await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    }),
  };
}

export async function readFiles(fd, required = true) {
  const files = fd.getAll("files").filter((f) => f.size);
  if ((required && !files.length) || files.reduce((a, f) => a + f.size, 0) > 2000000)
    throw Error(required ? "Attach supporting PDFs with a combined size of at most 2 MB" : "Combined supporting PDFs must not exceed 2 MB");
  return Promise.all(files.map(readPDF));
}

export function downloadPDF(f) {
  const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
  download(new Blob([bytes], { type: "application/pdf" }), f.name);
}

// One quoted CSV cell. Text that a spreadsheet would run as a formula is prefixed with '.
export function csvCell(x) {
  let v = String(x);
  if (/^[=+@-]/.test(v) && typeof x === "string") v = "'" + v;
  return '"' + v.replaceAll('"', '""') + '"';
}

export function csvExport(state, company, project) {
  const rows = [
    ["Company", "Project", "Approved Budget USD", "Budget Utilized USD", "Available USD", "Paid USD", "Outstanding Payments USD", "Balance Payments Pending USD", "On Hold USD"],
    ...state.projects
      .filter((p) => (!company || p.companyId === company) && (!project || p.id === project))
      .map((p) => {
        const k = kpis(state, p.companyId, p.id);
        return [nameOf(state, "companies", p.companyId), p.name, k.budget, k.commitment, k.available, k.paid, k.outstanding, k.balance, k.hold];
      }),
  ];
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  download(new Blob(["﻿" + csv], { type: "text/csv" }), "Project_Financial_Summary.csv");
}
