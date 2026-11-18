// CSV / Excel import: validate and preview first (nothing is saved), then confirm.
// Any change to the form discards the preview.
import { useRef, useState } from "react";
import { importFields } from "../domain/import-data.js";
import { DataTable, Field, FormSelect, Help, text } from "../components/ui.jsx";
import { ActionRow, Notice } from "../components/detail.jsx";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/tables.jsx";
import { Footer, Form } from "../components/Form.jsx";
import { readPDF } from "../lib/files.js";
import { readImport } from "../lib/excel.js";
import { useApp } from "../lib/store.js";
import { Button } from "@/components/ui/button";
import { Input as ShadcnInput } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Modal } from "./ModalHost.jsx";

const LABELS = { companies: "Companies", projects: "Projects", suppliers: "Suppliers", currencies: "Currencies", budgets: "Approved budgets", orders: "New requests with first payment", payments: "Additional payment requests" };

export function ImportForm({ kinds }) {
  const { actions } = useApp();
  const [kind, setKind] = useState(kinds[0]);
  const [preview, setPreview] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const validated = useRef(null);
  const form = useRef(null);

  // Any change (the import type's hidden native select included) discards the preview.
  function reset(e) {
    validated.current = null;
    setPreview(null);
    setKind(e.currentTarget.elements.importKind.value);
  }

  async function validate(fd) {
    validated.current = null;
    setPreview(null);
    const d = Object.fromEntries(fd);
    const rows = await readImport(fd.get("importFile"), d.importKind);
    const uploads = fd.getAll("importPDFs").filter((f) => f.size);
    if (uploads.reduce((sum, f) => sum + f.size, 0) > 2000000) throw Error("Combined supporting PDFs must not exceed 2 MB");
    const files = await Promise.all(uploads.map(readPDF));
    const payload = { kind: d.importKind, rows, files };
    await actions.previewImport(payload);
    validated.current = payload;
    setPreview({ kind: d.importKind, rows });
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
  return (
    <Modal title="Import CSV or Excel">
      <Form kind="import" ref={form} onSubmit={validate} onChange={reset}>
        <div className="grid gap-5">
          <Notice className="mt-0">Create new records only. Existing records and budget revisions must be edited individually. Imported payment requests go straight to Finance, as when they are created one by one.</Notice>
          <div className="max-w-sm"><Field label="Import type"><FormSelect name="importKind" id="importKind" defaultValue={kinds[0]} options={kinds.map((k) => ({ value: k, label: LABELS[k] }))} /></Field></div>
          <div>
            <ActionRow className="mt-0">
              <Button type="button" variant="outline" size="sm" data-action="importCSV" onClick={() => actions.importTemplate(form.current.elements.importKind.value, false)}>Download CSV template</Button>
              <Button type="button" variant="outline" size="sm" data-action="importXLSX" onClick={() => actions.importTemplate(form.current.elements.importKind.value, true)}>Download Excel template</Button>
            </ActionRow>
            <Help className="mt-3">Use all template headings, one record per row (maximum 100). Company and project accept names or short codes. Categories and allocations use Category:amount | Category:amount. For payments enter either amount or percentage, leaving the other blank. Dates use YYYY-MM-DD. Excel imports use one populated sheet; formulas are not accepted.</Help>
          </div>
          <Field label="CSV or XLSX file · maximum 2 MB"><ShadcnInput name="importFile" type="file" accept=".csv,.xlsx" required /></Field>
          <div id="importSupporting" hidden={kind !== "orders"}>
            <Field label="Supporting PDFs for new requests · combined maximum 2 MB">
              <ShadcnInput name="importPDFs" type="file" accept="application/pdf,.pdf" multiple />
              <Help>For new requests, list attached PDF filenames in Supporting PDFs, separated by |, or leave it blank when there are none. Currency fields use configured three-letter codes. Approved budget, supplier and category names must match Master Data. Blank payment date defaults to today; blank payment currency uses the order currency.</Help>
            </Field>
          </div>
          <div id="importPreview" aria-live="polite" className="grid gap-3 empty:hidden">
            {preview ? (
              <>
                <p className="text-[13px] font-semibold">{`${preview.rows.length} records validated. Review the values before importing.`}</p>
                <DataTable containerClassName="rounded-xl border border-border">
                  <TableHeader><TableRow><TableHead scope="col">Row</TableHead>{headers.map((h) => <TableHead key={h} scope="col">{h}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>{preview.rows.map((r, i) => <TableRow key={i}><TableCell>{r.line}</TableCell>{headers.map((h) => <TableCell key={h}>{text(r.values[h])}</TableCell>)}</TableRow>)}</TableBody>
                </DataTable>
                <div>
                  <Button type="button" className="primary" data-action="confirmImport" disabled={confirming} aria-busy={confirming ? "true" : undefined} onClick={confirm}>
                    {confirming ? <Spinner /> : null}{`Import ${preview.rows.length} records`}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </div>
        <Footer label="Validate and preview" note="The entire file must pass validation before anything is saved." />
      </Form>
    </Modal>
  );
}
