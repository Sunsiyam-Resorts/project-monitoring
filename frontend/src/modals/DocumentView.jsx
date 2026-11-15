// View Payment Request: the printable A4 document. Print / Save as PDF uses the browser.
import { parentAmount } from "../domain/domain.js";
import { Badge, BusyButton, Detail, text } from "../components/ui.jsx";
import { CategoryTable, ReviewHistory } from "../components/Records.jsx";
import { date, fmt } from "../lib/format.js";
import { nameOf } from "../lib/selectors.js";
import { useApp, useData } from "../lib/store.js";
import { Modal } from "./ModalHost.jsx";
import { SupportingReferences } from "./parts.jsx";

export function DocumentView({ id, generatedAt }) {
  const { actions } = useApp();
  const { state, demo } = useData();
  const r = state.requests.find((r) => r.id === id);
  const o = r && state.orders.find((o) => o.id === r.orderId);
  if (!r || !o) return null;
  const prior = state.requests.filter((x) => x.orderId === o.id && x.id !== r.id && x.status === "Paid").reduce((a, x) => a + parentAmount(x), 0);
  const currency = r.currency || o.currency;
  return (
    <Modal title="View Payment Request">
      <div className="noprint actions" style={{ marginTop: 0, marginBottom: "20px" }}>
        <button className="primary" data-action="print" onClick={() => actions.print()}>Print / Save as PDF</button>
        <BusyButton data-action="openRequest" data-id={id} onRun={() => actions.openRequest(id)}>Back to request</BusyButton>
      </div>
      <article className="printdoc">
        <div className="docbrand"><img src="/logo.svg" alt="Sun Siyam" width="94" height="75" /></div>
        <small>GROUP PROJECT MONITORING</small>
        <h1>PAYMENT REQUEST</h1>
        <div className="detail-top"><strong>{r.number}</strong><Badge status={r.status} /></div>
        <div className="detail-grid">
          <Detail label="Company">{nameOf(state, "companies", o.companyId)}</Detail>
          <Detail label="Project">{nameOf(state, "projects", o.projectId)}</Detail>
          <Detail label="Date">{`${r.date}`}</Detail>
          <Detail label="Supplier">{nameOf(state, "suppliers", o.supplierId)}</Detail>
          <Detail label="PO number">{text(o.po)}</Detail>
          <Detail label="Invoice number">{o.invoice || "—"}</Detail>
          <Detail label="Order currency">{`${o.currency}`}</Detail>
          <Detail label="Payment currency">{`${currency}`}</Detail>
          <Detail label="Saved payment rate">{`1 USD = ${fmt(r.rate)} ${currency}`}</Detail>
          <Detail label="Approved budget">{nameOf(state, "budgets", o.budgetId)}</Detail>
        </div>
        <h3>Description</h3>
        <p>{o.description}</p>
        <CategoryTable o={o} />
        <table style={{ marginTop: "18px" }}>
          <tbody>
            <tr><td>Full order amount</td><td className="right">{`${o.currency} ${fmt(o.total)}`}</td></tr>
            <tr><td>Other instalments paid to date</td><td className="right">{`${o.currency} ${fmt(prior)}`}</td></tr>
            <tr><td><strong>{`This payment request · ${r.percent}% at creation`}</strong></td><td className="right"><strong>{`${currency} ${fmt(r.amount)}`}</strong></td></tr>
            <tr><td>Payment terms</td><td>{text(r.terms)}</td></tr>
          </tbody>
        </table>
        <h3 style={{ marginTop: "22px" }}>Request & payment · this payment request only</h3>
        <table>
          <thead><tr><th scope="col">Stage</th><th scope="col">Name</th><th scope="col">Date / Time</th></tr></thead>
          <tbody>
            <tr><td>Requested by</td><td>{nameOf(state, "users", r.requestedBy)}</td><td>{date(r.createdAt)}</td></tr>
            {r.approvals.map((x, i) => <tr key={i}><td>{x.stage === "Reviewer" ? "Checked by" : text(x.stage)}</td><td>{text(x.by)}</td><td>{date(x.at)}</td></tr>)}
            {r.finalApprovedAt ? <tr><td>Submitted to Finance</td><td>{nameOf(state, "users", r.requestedBy)}</td><td>{date(r.finalApprovedAt)}</td></tr> : null}
            {r.payment ? <tr><td>Paid by</td><td>{text(r.payment.by)}</td><td>{`${r.payment.date} · ${r.payment.type}`}</td></tr> : null}
          </tbody>
        </table>
        {r.remarks.length ? (
          <>
            <h3 style={{ marginTop: "22px" }}>Finance remarks</h3>
            {r.remarks.map((m, i) => <p key={i}>{`${text(m.text)} — ${text(m.by)}`}</p>)}
          </>
        ) : null}
        <SupportingReferences o={o} r={r} />
        <ReviewHistory history={r.history} />
        <div className="docfooter">{`System-generated document · ${r.number} · Generated ${date(generatedAt)}${demo ? " · DEMO SAMPLE — FOR TESTING ONLY" : ""}`}</div>
      </article>
    </Modal>
  );
}
