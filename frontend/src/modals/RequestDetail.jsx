import { canManageRequest, canReject, financeActor, isFinanceAdmin, parentAmount, warnings } from "../domain/domain.js";
import { Icon } from "../components/Icon.jsx";
import { Badge, BusyButton, Detail, FileList, text } from "../components/ui.jsx";
import { CategoryTable } from "../components/Records.jsx";
import { date, fmt } from "../lib/format.js";
import { nameOf } from "../lib/selectors.js";
import { useApp, useData } from "../lib/store.js";
import { Modal } from "./ModalHost.jsx";
import { Warnings } from "./parts.jsx";

const STAGES = ["Requested", "Finance", "Paid"];

export function RequestDetail({ id }) {
  const { actions } = useApp();
  const { state, user } = useData();
  const r = state.requests.find((r) => r.id === id);
  const o = r && state.orders.find((o) => o.id === r.orderId);
  if (!r || !o) return null;
  const fin = financeActor(user, r) && ["Finance", "On Hold"].includes(r.status);
  const draft = r.status === "Draft" && canManageRequest(user, r);
  const context = draft ? "Ready when you are"
    : fin ? (r.status === "On Hold" ? "Payment is on hold" : "Ready for Finance")
      : r.status === "Paid" ? "Payment completed" : r.status === "Rejected" ? "Request rejected" : "Awaiting the next stage";
  const currency = r.currency || o.currency;
  return (
    <Modal title="Payment request">
      <div className="detail-top"><div><div className="eyebrow">PAYMENT REQUEST</div><div className="detail-number">{r.number}</div></div><Badge status={r.status} /></div>
      <div className="detail-lead">
        <div><div className="eyebrow">{`REQUESTED PAYMENT · ${r.percent}% AT CREATION`}</div><div className="amount"><span>{currency}</span>{fmt(r.amount)}</div><small>{text(r.terms)}</small></div>
        <div className="lead-side"><small>Full order amount</small><strong>{`${o.currency} ${fmt(o.total)}`}</strong><small>{text(o.po)}</small></div>
      </div>
      <div className="detail-grid">
        <Detail label="Company">{nameOf(state, "companies", o.companyId)}</Detail>
        <Detail label="Project">{nameOf(state, "projects", o.projectId)}</Detail>
        <Detail label="Supplier">{nameOf(state, "suppliers", o.supplierId)}</Detail>
        <Detail label="Invoice">{o.invoice || "Not yet provided"}</Detail>
        <Detail label="Request date">{`${r.date}`}</Detail>
        <Detail label="Saved exchange rate">{`1 USD = ${fmt(r.rate)} ${r.currency}`}</Detail>
        <Detail label="Reserved order amount">{`${o.currency} ${fmt(parentAmount(r))}`}</Detail>
        <Detail label="Requested by">{nameOf(state, "users", r.requestedBy)}</Detail>
      </div>
      <h3>Progress</h3>
      <div className="steps" style={{ "--stages": STAGES.length }} aria-label="Payment request progress">
        {STAGES.map((st) => {
          const ap = r.approvals.find((a) => a.stage === st);
          const current = r.status === st || (st === "Finance" && r.status === "On Hold");
          const done = !!ap || st === "Requested" || (st === "Paid" && r.status === "Paid") || (st === "Finance" && r.status === "Paid");
          return (
            <div key={st} className={done ? "step done" : current ? "step current" : "step"} aria-current={current ? "step" : undefined}>
              <span className="step-dot" aria-hidden="true"></span><strong>{st}</strong>
              {text(ap?.by || (st === "Paid" && r.payment ? r.payment.by : current ? "Current stage" : ""))}
              {ap ? <span className="secondary">{date(ap.at)}</span> : null}
            </div>
          );
        })}
      </div>
      <Warnings list={warnings(state, o)} />
      <div className="detail-section">
        <div className="section-title"><h3>Evidence & request document</h3><small>{`${o.files.length} supporting PDFs on main request`}</small></div>
        <div className="actions" style={{ marginTop: 0 }}>
          <button data-action="document" data-id={id} onClick={() => actions.documentView(id)}><Icon name="requests" />View Payment Request</button>
          <BusyButton data-action="openOrder" data-id={o.id} data-payment={r.id} onRun={() => actions.openOrder(o.id, r.id)}><Icon name="master" />Main details & supporting</BusyButton>
        </div>
      </div>
      {draft || fin ? (
        <section className="decision-panel">
          <h3>{context}</h3>
          <p>{draft ? "Review the amount and terms, then submit this payment request." : r.status === "On Hold" ? "Release the hold when the reason is resolved." : "Record the exact payment amount, with its supporting PDFs if you have them."}</p>
          <div className="actions">
            {draft ? (
              <>
                <button data-action="editPayment" data-id={id} onClick={() => actions.editPayment(id)}>Edit payment terms</button>
                <BusyButton className="primary" data-action="submit" data-id={id} onRun={() => actions.submitRequest(id)}>Submit to Finance <Icon name="arrow" /></BusyButton>
              </>
            ) : null}
            {fin ? (
              <>
                <button data-action="remark" data-id={id} onClick={() => actions.reasonForm(id, "remark")}>Add remark</button>
                {r.status === "On Hold"
                  ? <BusyButton className="primary" data-action="resume" data-id={id} onRun={() => actions.resume(id)}>Release hold</BusyButton>
                  : (
                    <>
                      <button data-action="hold" data-id={id} onClick={() => actions.reasonForm(id, "hold")}><Icon name="hold" />Put on hold</button>
                      <button className="primary" data-action="pay" data-id={id} onClick={() => actions.payForm(id)}><Icon name="check" />Record payment</button>
                    </>
                  )}
              </>
            ) : null}
          </div>
        </section>
      ) : null}
      {fin ? (
        <div className="actions">
          <button data-action="return" data-id={id} onClick={() => actions.reasonForm(id, "return")}>Return for correction</button>
          <button data-action="documents" data-id={id} onClick={() => actions.reasonForm(id, "documents")}>Request additional supporting</button>
          <button className="danger" data-action="reject" data-id={id} onClick={() => actions.reasonForm(id, "reject")}>Reject</button>
        </div>
      ) : null}
      {user.role === "Admin" ? (
        <div className="actions">
          {!fin && canReject(user, r) ? <button className="danger" data-action="reject" data-id={id} onClick={() => actions.reasonForm(id, "reject")}>Reject payment request</button> : null}
          <button className="danger" data-action="deleteRequest" data-id={id} onClick={() => actions.reasonForm(id, "deleteRequest")}><Icon name="deleted" />Delete payment request</button>
        </div>
      ) : null}
      {r.status === "Documents Required" ? (
        <>
          <div className="notice"><strong>Additional supporting required</strong><p>{r.documentRequest.description}</p></div>
          {canManageRequest(user, r) ? <button className="primary" data-action="supply" data-id={id} onClick={() => actions.supply(id)}>Upload requested documents</button> : null}
        </>
      ) : null}
      <FileList files={r.files} kind="request" id={id} />
      {r.payment ? (
        <>
          <div className="notice success"><strong>{`Paid ${currency} ${fmt(r.payment.amount)}`}</strong><br />{`${r.payment.date} · ${r.payment.type} · ${text(r.payment.by)}`}</div>
          <FileList files={r.payment.files} kind="payment" id={id} />
          {isFinanceAdmin(user) ? <button className="danger" data-action="deletePayment" data-id={id} onClick={() => actions.reasonForm(id, "deletePayment")}>Delete Payment</button> : null}
        </>
      ) : null}
      {r.remarks.length ? (
        <div className="detail-section">
          <h3>Finance remarks</h3>
          {r.remarks.map((m, i) => <div key={i} className="notice">{text(m.text)}<br /><small>{`${text(m.by)} · ${date(m.at)}`}</small></div>)}
        </div>
      ) : null}
      <details className="details-disclosure"><summary>Budget category allocations</summary><CategoryTable o={o} /></details>
      <details className="details-disclosure">
        <summary>Review history <span className="count">{r.history.length}</span></summary>
        {r.history.length ? r.history.map((h, i) => (
          <div key={i} className="activity"><i className="dot"></i><div><strong>{`${text(h.stage)} · ${text(h.action)}`}</strong><p>{`${text(h.by)} · ${date(h.at)}`}</p><p>{text(h.reason)}</p></div></div>
        )) : <p className="help">No review actions recorded yet.</p>}
      </details>
      <p className="help">Each payment request is reviewed by Finance separately. Corrections return to the requester, who resubmits to Finance.</p>
    </Modal>
  );
}
