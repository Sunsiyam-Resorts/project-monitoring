import { canManageRequest, isFinanceAdmin, remainingToRequest, warnings } from "../domain/domain.js";
import { Icon } from "../components/Icon.jsx";
import { Badge, BusyButton, Detail, DetailGrid, FileList, Help, text } from "../components/ui.jsx";
import { ActionRow, DetailSection, RecordLead, RecordTop } from "../components/detail.jsx";
import { CategoryTable, RequestTable } from "../components/Records.jsx";
import { fmt } from "../lib/format.js";
import { nameOf } from "../lib/selectors.js";
import { useApp, useData } from "../lib/store.js";
import { Button } from "@/components/ui/button";
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
        <ActionRow className="mt-0 mb-5">
          <BusyButton variant="outline" size="sm" data-action="openRequest" data-id={returnPaymentId} data-return-payment="" onRun={() => actions.openRequest(returnPaymentId)}>
            <span aria-hidden="true">←</span>{`Back to Payment Request · ${text(state.requests.find((r) => r.id === returnPaymentId)?.number)}`}
          </BusyButton>
        </ActionRow>
      ) : null}
      <RecordTop number={o.number}>{o.rejectedAt ? <Badge status="Rejected" /> : null}</RecordTop>
      <RecordLead eyebrow="Total order amount" currency={o.currency} amount={fmt(o.total)}
        side={<><small>Remaining to request</small><strong>{`${o.currency} ${fmt(remaining)}`}</strong><small>{`USD ${fmt(o.total / o.rate)} full equivalent`}</small></>} />
      <ActionRow className="mt-0 mb-6">
        {owner && remaining > 0.005 ? <Button data-action="newPayment" data-id={id} onClick={() => actions.newPayment(id)}><Icon name="plus" />Create Payment Request</Button> : null}
        {owner && (!m || ["Draft", "Rejected"].includes(m.status)) ? <Button variant="outline" data-action="editOrder" data-id={id} onClick={() => actions.editOrder(id)}>{m?.status === "Draft" ? "Correct amendment" : "Amend request details"}</Button> : null}
        {isFinanceAdmin(user) && !o.rejectedAt ? <Button variant="destructive" data-action="parentReject" data-id={id} onClick={() => actions.reasonForm(id, "parentReject")}>Reject request</Button> : null}
        {admin ? (
          <Button variant="destructive" data-action="deleteOrder" data-id={id} disabled={processed.length > 0} aria-describedby={processed.length ? "deleteOrderNote" : undefined} onClick={() => actions.reasonForm(id, "deleteOrder")}>
            <Icon name="deleted" />Delete request
          </Button>
        ) : null}
      </ActionRow>
      {admin && processed.length ? <Help id="deleteOrderNote" className="-mt-3 mb-6">{`To delete this request, first delete its processed payment requests: ${processed.map((r) => r.number).join(", ")}.`}</Help> : null}
      <DetailGrid>
        <Detail label="Company">{nameOf(state, "companies", o.companyId)}</Detail>
        <Detail label="Project">{nameOf(state, "projects", o.projectId)}</Detail>
        <Detail label="Supplier">{nameOf(state, "suppliers", o.supplierId)}</Detail>
        <Detail label="PO">{text(o.po)}</Detail>
        <Detail label="Invoice">{o.invoice || "—"}</Detail>
        <Detail label="Requested by">{nameOf(state, "users", o.requestedBy)}</Detail>
      </DetailGrid>
      <p className="sub mt-5 text-[13px] text-muted-foreground">{o.description}</p>
      <Warnings list={warnings(state, o)} />
      {m ? <AmendmentView o={o} /> : null}
      <DetailSection title="Budget allocations"><CategoryTable o={o} /></DetailSection>
      <DetailSection title="Supporting documents">{o.files?.length ? <FileList files={o.files} kind="order" id={id} /> : <Help>No supporting documents attached.</Help>}</DetailSection>
      <DetailSection title="Payment Requests"><div className="overflow-hidden rounded-xl border border-border"><RequestTable rs={rs} /></div></DetailSection>
      <AmendmentHistory o={o} />
    </Modal>
  );
}
