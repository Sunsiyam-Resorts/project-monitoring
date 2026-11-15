// CSV / Excel import: validate and preview first (nothing is saved), then confirm.
// Any change to the form discards the preview.
import { useRef, useState } from "react";
import { importFields } from "../domain/import-data.js";
import { Field, TableWrap, text } from "../components/ui.jsx";
import { Footer, Form } from "../components/Form.jsx";
import { readPDF } from "../lib/files.js";
import { readImport } from "../lib/excel.js";
import { useApp } from "../lib/store.js";
import { Modal } from "./ModalHost.jsx";

const LABELS = { companies: "Companies", projects: "Projects", suppliers: "Suppliers", currencies: "Currencies", budgets: "Approved budgets", orders: "New requests with first payment", payments: "Additional payment requests" };

export function ImportForm({ kinds }) {
  const { actions } = useApp();
  const [kind, setKind] = useState(kinds[0]);
  const [preview, setPreview] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const validated = useRef(null);
  const form = useRef(null);

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
        <div className="notice">Create new records only. Existing records and budget revisions must be edited individually. Requests are imported as drafts; each payment request is submitted to Finance separately.</div>
        <Field label="Import type"><select name="importKind">{kinds.map((k) => <option key={k} value={k}>{LABELS[k]}</option>)}</select></Field>
        <div className="actions">
          <button type="button" data-action="importCSV" onClick={() => actions.importTemplate(form.current.elements.importKind.value, false)}>Download CSV template</button>
          <button type="button" data-action="importXLSX" onClick={() => actions.importTemplate(form.current.elements.importKind.value, true)}>Download Excel template</button>
        </div>
        <p className="help">Use all template headings, one record per row (maximum 100). Company and project accept names or short codes. Categories and allocations use Category:amount | Category:amount. For payments enter either amount or percentage, leaving the other blank. Dates use YYYY-MM-DD. Excel imports use one populated sheet; formulas are not accepted.</p>
        <Field label="CSV or XLSX file · maximum 2 MB"><input name="importFile" type="file" accept=".csv,.xlsx" required /></Field>
        <div id="importSupporting" hidden={kind !== "orders"}>
          <Field label="Supporting PDFs for new requests · combined maximum 2 MB"><input name="importPDFs" type="file" accept="application/pdf,.pdf" multiple /></Field>
          <p className="help">For new requests, list attached PDF filenames in Supporting PDFs, separated by |, or leave it blank when there are none. Currency fields use configured three-letter codes. Approved budget, supplier and category names must match Master Data. Blank payment date defaults to today; blank payment currency uses the order currency.</p>
        </div>
        <div id="importPreview" aria-live="polite">
          {preview ? (
            <>
              <p>{`${preview.rows.length} records validated. Review the values before importing.`}</p>
              <TableWrap>
                <table>
                  <thead><tr><th scope="col">Row</th>{headers.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
                  <tbody>{preview.rows.map((r, i) => <tr key={i}><td>{r.line}</td>{headers.map((h) => <td key={h}>{text(r.values[h])}</td>)}</tr>)}</tbody>
                </table>
              </TableWrap>
              <button type="button" className="primary" data-action="confirmImport" disabled={confirming} onClick={confirm}>{`Import ${preview.rows.length} records`}</button>
            </>
          ) : null}
        </div>
        <Footer label="Validate and preview" note="The entire file must pass validation before anything is saved." />
      </Form>
    </Modal>
  );
}
