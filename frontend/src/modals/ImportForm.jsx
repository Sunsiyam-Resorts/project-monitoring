// CSV / Excel import: validate and preview first (nothing is saved), then confirm.
// Any change to the form discards the preview.
import { useRef, useState } from "react";
import { importFields } from "../domain/import-data.js";
import { DataTable, Field, FileDrop, FormSelect, Help, UploadList, text } from "../components/ui.jsx";
import { ActionRow, Notice } from "../components/detail.jsx";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/tables.jsx";
import { Footer, Form } from "../components/Form.jsx";
import { readPDF } from "../lib/files.js";
import { readImport } from "../lib/excel.js";
import { useApp } from "../lib/store.js";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Modal } from "./ModalHost.jsx";

const LABELS = { companies: "Companies", projects: "Projects", suppliers: "Suppliers", currencies: "Currencies", budgets: "Approved budgets", orders: "New requests with first payment", payments: "Additional payment requests" };
const isTemplate = (f) => /\.(csv|xlsx)$/i.test(f.name);
const isPDF = (f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf";
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function ImportForm({ kinds }) {
  const { actions } = useApp();
  const [kind, setKind] = useState(kinds[0]);
  // The one drop area feeds two separate values: the completed template and the supporting PDFs.
  const [template, setTemplate] = useState(null);
  const [pdfs, setPdfs] = useState([]);
  const [skipped, setSkipped] = useState("");
  const [missingTemplate, setMissingTemplate] = useState(false);
  const [preview, setPreview] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const validated = useRef(null);
  const withPDFs = kind === "orders";

  // Any change discards the preview. The import type is tracked in state: reading it back
  // through form.elements is unreliable because the select's trigger button shares its id.
  function reset() {
    validated.current = null;
    setPreview(null);
  }

  function changeKind(next) {
    reset();
    setKind(next);
    setSkipped("");
    if (next !== "orders") setPdfs([]);
  }

  // Sort picked or dropped files: the newest CSV/XLSX becomes the template, PDFs are added to
  // the supporting files (a PDF with the same name replaces the earlier one, since rows refer to
  // PDFs by filename), and anything else is skipped with a note.
  function addFiles(files) {
    reset();
    const templates = files.filter(isTemplate);
    const added = files.filter((f) => !isTemplate(f) && isPDF(f));
    const other = files.filter((f) => !isTemplate(f) && !isPDF(f));
    const notes = [];
    if (templates.length) {
      setTemplate(templates.at(-1));
      setMissingTemplate(false);
      if (templates.length > 1) notes.push(`Only one template can be imported at a time; ${templates.at(-1).name} was kept.`);
    }
    if (added.length && withPDFs) setPdfs((list) => [...list.filter((p) => !added.some((a) => a.name === p.name)), ...added]);
    if (added.length && !withPDFs) notes.push(`Supporting PDFs are attached to new requests only; ${plural(added.length, "PDF was", "PDFs were")} not added.`);
    if (other.length) notes.push(`Not added: ${other.map((f) => f.name).join(", ")}. Use a CSV or XLSX template${withPDFs ? " and PDF supporting files" : ""}.`);
    setSkipped(notes.join(" "));
  }

  function removeTemplate() {
    reset();
    setTemplate(null);
  }

  function removePDF(name) {
    reset();
    setPdfs((list) => list.filter((p) => p.name !== name));
  }

  async function validate() {
    validated.current = null;
    setPreview(null);
    if (!template) {
      setMissingTemplate(true);
      throw Error("Add the completed template: one CSV or XLSX file.");
    }
    const rows = await readImport(template, kind);
    const uploads = withPDFs ? pdfs : [];
    if (uploads.reduce((sum, f) => sum + f.size, 0) > 2000000) throw Error("Combined supporting PDFs must not exceed 2 MB");
    const files = await Promise.all(uploads.map(readPDF));
    const payload = { kind, rows, files };
    await actions.previewImport(payload);
    validated.current = payload;
    setPreview({ kind, rows });
  }

  async function confirm() {
    setConfirming(true);
    try {
      await actions.confirmImport(validated.current);
    } finally {
      setConfirming(false);
    }
  }

  const headers = preview ? importFields[preview.kind] : [];
  const count = preview ? plural(preview.rows.length, "record", "records") : "";
  const listed = [
    ...(template ? [{ file: template, role: "Completed template", onRemove: removeTemplate }] : []),
    ...(withPDFs ? pdfs.map((f) => ({ file: f, role: "Supporting PDF", onRemove: () => removePDF(f.name) })) : []),
  ];
  return (
    <Modal title="Import CSV or Excel">
      <Form kind="import" onSubmit={validate} onChange={reset}>
        <div className="grid gap-5">
          <Notice className="mt-0">Create new records only. Existing records and budget revisions must be edited individually. Imported payment requests go straight to Finance, as when they are created one by one.</Notice>
          <div className="max-w-sm"><Field label="Import type"><FormSelect name="importKind" id="importKind" disabled={kinds.length === 1} value={kind} onValueChange={changeKind} options={kinds.map((k) => ({ value: k, label: LABELS[k] }))} /></Field></div>
          <div className="grid gap-2">
            <ActionRow className="mt-0">
              <Button type="button" variant="outline" size="sm" data-action="importCSV" onClick={() => actions.importTemplate(kind, false)}>Download CSV template</Button>
              <Button type="button" variant="outline" size="sm" data-action="importXLSX" onClick={() => actions.importTemplate(kind, true)}>Download Excel template</Button>
            </ActionRow>
            <Help>Use all template headings, one record per row (maximum 100). Company and project accept names or short codes. Categories and allocations use Category:amount | Category:amount. For payments enter either amount or percentage, leaving the other blank. Dates use DD/MM/YYYY, for example 23/11/2026. Excel imports use one populated sheet; formulas are not accepted.</Help>
          </div>
          {/* Drop area, then what happened to the files, then the files themselves, then the rules. */}
          <Field label={withPDFs ? "Completed template and supporting PDFs" : "Completed template"}>
            <FileDrop name="importFile" required invalid={missingTemplate} onFiles={addFiles}
              accept={withPDFs ? ".csv,.xlsx,.pdf,application/pdf" : ".csv,.xlsx"}
              title={withPDFs ? "Drop the completed template and any supporting PDFs here, or click to choose" : "Drop the completed template here, or click to choose"}
              note={withPDFs ? "One CSV or XLSX file up to 2 MB · PDFs up to 2 MB combined" : "One CSV or XLSX file up to 2 MB"} />
            {skipped ? <Notice tone="warning" className="mt-0">{skipped}</Notice> : null}
            {listed.length ? <UploadList label="Files to import" files={listed} /> : null}
            {withPDFs ? <Help>For new requests, list attached PDF filenames in Supporting PDFs, separated by |, or leave it blank when there are none. Currency fields use configured three-letter codes. Approved budget, supplier and category names must match Master Data. Blank payment date defaults to today; blank payment currency uses the order currency.</Help> : null}
          </Field>
          <div id="importPreview" aria-live="polite" className="grid gap-3 empty:hidden">
            {preview ? (
              <>
                <p className="text-[13px] font-semibold">{`${count} validated. Review the values before importing.`}</p>
                <DataTable containerClassName="rounded-xl border border-border" className="[&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
                  <TableHeader><TableRow><TableHead scope="col">Row</TableHead>{headers.map((h) => <TableHead key={h} scope="col">{h}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>{preview.rows.map((r, i) => <TableRow key={i}><TableCell className="tabular">{r.line}</TableCell>{headers.map((h) => <TableCell key={h}>{text(r.values[h])}</TableCell>)}</TableRow>)}</TableBody>
                </DataTable>
              </>
            ) : null}
          </div>
        </div>
        {/* After a successful preview the import is the footer's primary action; validating again stays available.
            On small screens the three buttons wrap, so each row is filled edge to edge. */}
        <Footer label="Validate and preview" submitVariant={preview ? "outline" : "default"} className="max-sm:[&>button]:flex-1"
          note="The entire file must pass validation before anything is saved.">
          {preview ? (
            <Button type="button" data-action="confirmImport" disabled={confirming} aria-busy={confirming ? "true" : undefined} onClick={confirm}>
              {confirming ? <Spinner /> : null}{`Import ${count}`}
            </Button>
          ) : null}
        </Footer>
      </Form>
    </Modal>
  );
}
