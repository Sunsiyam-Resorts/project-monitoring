import { canManageRequest, isFinanceAdmin, remainingToRequest, warnings } from "../domain/domain.js";
import { Icon } from "../components/Icon.jsx";
import { Badge, BusyButton, Detail, FileList, text } from "../components/ui.jsx";
import { CategoryTable, RequestTable } from "../components/Records.jsx";
import { fmt } from "../lib/format.js";
import { nameOf } from "../lib/selectors.js";
import { useApp, useData } from "../lib/store.js";
import { Modal } from "./ModalHost.jsx";
import { AmendmentHistory, AmendmentView, Warnings } from "./parts.jsx";

export function OrderDetail({ id, returnPaymentId }) {
  const { actions } = useApp();
  const { state, user } = useData();
  const o = state.orders.find((o) => o.id === id);
  if (!o) return null;
  const rs = state.requests.filter((r) => r.orderId === id);
  const owner = canManageRequest(user, o) && !o.rejectedAt, m = o.amendment;
  // Admin deletes a request only when nothing under it has been processed; drafts go with it.
  const processed = rs.filter((r) => r.status !== "Draft"), admin = user.role === "Admin";
  const remaining = remainingToRequest(state, o);
  return (
    <Modal title="Request details">
      {returnPaymentId ? (
        <div className="actions" style={{ marginTop: 0 }}>
          <BusyButton data-action="openRequest" data-id={returnPaymentId} data-return-payment="" onRun={() => actions.openRequest(returnPaymentId)}>
            <span aria-hidden="true">←</span>{`Back to Payment Request · ${text(state.requests.find((r) => r.id === returnPaymentId)?.number)}`}
          </BusyButton>
        </div>
      ) : null}
      <div className="detail-top"><div><div className="detail-number">{o.number}</div></div>{o.rejectedAt ? <Badge status="Rejected" /> : null}</div>
      <div className="detail-lead">
        <div><div className="eyebrow">Total order amount</div><div className="amount"><span>{o.currency}</span>{fmt(o.total)}</div></div>
        <div className="lead-side"><small>Remaining to request</small><strong>{`${o.currency} ${fmt(remaining)}`}</strong><small>{`USD ${fmt(o.total / o.rate)} full equivalent`}</small></div>
      </div>
      <div className="actions">
        {owner && remaining > 0.005 ? <button className="primary" data-action="newPayment" data-id={id} onClick={() => actions.newPayment(id)}>Create Payment Request</button> : null}
        {owner && (!m || ["Draft", "Rejected"].includes(m.status)) ? <button data-action="editOrder" data-id={id} onClick={() => actions.editOrder(id)}>{m?.status === "Draft" ? "Correct amendment" : "Amend request details"}</button> : null}
        {isFinanceAdmin(user) && !o.rejectedAt ? <button className="danger" data-action="parentReject" data-id={id} onClick={() => actions.reasonForm(id, "parentReject")}>Reject request</button> : null}
        {admin ? (
          <button className="danger" data-action="deleteOrder" data-id={id} disabled={processed.length > 0} aria-describedby={processed.length ? "deleteOrderNote" : undefined} onClick={() => actions.reasonForm(id, "deleteOrder")}>
            <Icon name="deleted" />Delete request
          </button>
        ) : null}
      </div>
      {admin && processed.length ? <p className="help" id="deleteOrderNote">{`To delete this request, first delete its processed payment requests: ${processed.map((r) => r.number).join(", ")}.`}</p> : null}
      <div className="detail-grid">
        <Detail label="Company">{nameOf(state, "companies", o.companyId)}</Detail>
        <Detail label="Project">{nameOf(state, "projects", o.projectId)}</Detail>
        <Detail label="Supplier">{nameOf(state, "suppliers", o.supplierId)}</Detail>
        <Detail label="PO">{text(o.po)}</Detail>
        <Detail label="Invoice">{o.invoice || "—"}</Detail>
        <Detail label="Requested by">{nameOf(state, "users", o.requestedBy)}</Detail>
      </div>
      <p className="sub">{o.description}</p>
      <Warnings list={warnings(state, o)} />
      {m ? <AmendmentView o={o} /> : null}
      <h3>Budget allocations</h3>
      <CategoryTable o={o} />
      <div className="detail-section"><h3>Supporting documents</h3>{o.files?.length ? <FileList files={o.files} kind="order" id={id} /> : <p className="help">No supporting documents attached.</p>}</div>
      <div className="detail-section"><h3>Payment Requests</h3><RequestTable rs={rs} /></div>
      <AmendmentHistory o={o} />
    </Modal>
  );
}
