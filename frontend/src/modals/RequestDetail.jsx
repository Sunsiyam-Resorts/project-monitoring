import { canManageRequest, canReject, financeActor, isFinanceAdmin, parentAmount, warnings } from "../domain/domain.js";
import { Icon } from "../components/Icon.jsx";
import { Badge, BusyButton, Detail, DetailGrid, FileList, Help, text } from "../components/ui.jsx";
import { ActionRow, DecisionPanel, DetailSection, HistoryEntry, MoreDetails, Notice, RecordLead, RecordTop, Steps } from "../components/detail.jsx";
import { CategoryTable } from "../components/Records.jsx";
import { date, fmt, shortDate } from "../lib/format.js";
import { nameOf } from "../lib/selectors.js";
import { useApp, useData } from "../lib/store.js";
import { Button } from "@/components/ui/button";
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
  const steps = STAGES.map((st) => {
    const ap = r.approvals.find((a) => a.stage === st);
    const current = r.status === st || (st === "Finance" && r.status === "On Hold");
    const done = !!ap || st === "Requested" || (st === "Paid" && r.status === "Paid") || (st === "Finance" && r.status === "Paid");
    return { name: st, done, current: !done && current, by: text(ap?.by || (st === "Paid" && r.payment ? r.payment.by : current ? "Current stage" : "")), at: ap ? date(ap.at) : "" };
  });
  return (
    <Modal title="Payment request">
      <RecordTop number={r.number}><Badge status={r.status} /></RecordTop>
      <RecordLead eyebrow={`Requested payment · ${r.percent}% at creation`} currency={currency} amount={fmt(r.amount)} note={text(r.terms)}
        side={<><small>Full order amount</small><strong>{`${o.currency} ${fmt(o.total)}`}</strong><small>{text(o.po)}</small></>} />
      <DetailGrid>
        <Detail label="Company">{nameOf(state, "companies", o.companyId)}</Detail>
        <Detail label="Project">{nameOf(state, "projects", o.projectId)}</Detail>
        <Detail label="Supplier">{nameOf(state, "suppliers", o.supplierId)}</Detail>
        <Detail label="Invoice">{o.invoice || "Not yet provided"}</Detail>
        <Detail label="Request date">{shortDate(r.date)}</Detail>
        <Detail label="Saved exchange rate">{`1 USD = ${fmt(r.rate)} ${r.currency}`}</Detail>
        <Detail label="Reserved order amount">{`${o.currency} ${fmt(parentAmount(r))}`}</Detail>
        <Detail label="Requested by">{nameOf(state, "users", r.requestedBy)}</Detail>
      </DetailGrid>
      <DetailSection title="Progress"><Steps label="Payment request progress" steps={steps} /></DetailSection>
      <Warnings list={warnings(state, o)} />
      <DetailSection title="Evidence & request document" aside={`${o.files.length} supporting PDFs on main request`}>
        <ActionRow className="mt-0">
          <Button variant="outline" data-action="document" data-id={id} onClick={() => actions.documentView(id)}><Icon name="requests" />View Payment Request</Button>
          <BusyButton data-action="openOrder" data-id={o.id} data-payment={r.id} onRun={() => actions.openOrder(o.id, r.id)}><Icon name="master" />Main details & supporting</BusyButton>
        </ActionRow>
      </DetailSection>
      {draft || fin ? (
        <DecisionPanel title={context}
          note={draft ? "Review the amount and terms, then submit this payment request." : r.status === "On Hold" ? "Release the hold when the reason is resolved." : "Record the exact payment amount, with its supporting PDFs if you have them."}>
          <ActionRow className="mt-4">
            {draft ? (
              <>
                <Button variant="outline" data-action="editPayment" data-id={id} onClick={() => actions.editPayment(id)}>Edit payment terms</Button>
                <BusyButton variant="default" className="primary" data-action="submit" data-id={id} onRun={() => actions.submitRequest(id)}>Submit to Finance <Icon name="arrow" /></BusyButton>
              </>
            ) : null}
            {fin ? (
              <>
                <Button variant="outline" data-action="remark" data-id={id} onClick={() => actions.reasonForm(id, "remark")}>Add remark</Button>
                {r.status === "On Hold"
                  ? <BusyButton variant="default" className="primary" data-action="resume" data-id={id} onRun={() => actions.resume(id)}>Release hold</BusyButton>
                  : (
                    <>
                      <Button variant="outline" data-action="hold" data-id={id} onClick={() => actions.reasonForm(id, "hold")}><Icon name="hold" />Put on hold</Button>
                      <Button data-action="pay" data-id={id} onClick={() => actions.payForm(id)}><Icon name="check" />Record payment</Button>
                    </>
                  )}
              </>
            ) : null}
          </ActionRow>
        </DecisionPanel>
      ) : null}
      {fin ? (
        <ActionRow>
          <Button variant="outline" data-action="return" data-id={id} onClick={() => actions.reasonForm(id, "return")}>Return for correction</Button>
          <Button variant="outline" data-action="documents" data-id={id} onClick={() => actions.reasonForm(id, "documents")}>Request additional supporting</Button>
          <Button variant="destructive" data-action="reject" data-id={id} onClick={() => actions.reasonForm(id, "reject")}>Reject</Button>
        </ActionRow>
      ) : null}
      {user.role === "Admin" ? (
        <ActionRow>
          {!fin && canReject(user, r) ? <Button variant="destructive" data-action="reject" data-id={id} onClick={() => actions.reasonForm(id, "reject")}>Reject payment request</Button> : null}
          <Button variant="destructive" data-action="deleteRequest" data-id={id} onClick={() => actions.reasonForm(id, "deleteRequest")}><Icon name="deleted" />Delete payment request</Button>
        </ActionRow>
      ) : null}
      {r.status === "Documents Required" ? (
        <>
          <Notice tone="warning" title="Additional supporting required">{r.documentRequest.description}</Notice>
          {canManageRequest(user, r) ? <ActionRow className="mt-3"><Button data-action="supply" data-id={id} onClick={() => actions.supply(id)}>Upload requested documents</Button></ActionRow> : null}
        </>
      ) : null}
      {r.files?.length ? <div className="mt-5"><FileList files={r.files} kind="request" id={id} /></div> : null}
      {r.payment ? (
        <>
          <Notice tone="success" title={`Paid ${currency} ${fmt(r.payment.amount)}`}>{`${shortDate(r.payment.date)} · ${r.payment.type} · ${text(r.payment.by)}`}</Notice>
          {r.payment.files?.length ? <div className="mt-3"><FileList files={r.payment.files} kind="payment" id={id} /></div> : null}
          {isFinanceAdmin(user) ? <ActionRow className="mt-3"><Button variant="destructive" data-action="deletePayment" data-id={id} onClick={() => actions.reasonForm(id, "deletePayment")}>Delete Payment</Button></ActionRow> : null}
        </>
      ) : null}
      {r.remarks.length ? (
        <DetailSection title="Finance remarks">
          {r.remarks.map((m, i) => <Notice key={i} className="mt-0" title={text(m.text)}>{`${text(m.by)} · ${date(m.at)}`}</Notice>)}
        </DetailSection>
      ) : null}
      <MoreDetails title="Budget category allocations"><CategoryTable o={o} /></MoreDetails>
      <MoreDetails title="Review history" count={r.history.length}>
        {r.history.length ? <div>{r.history.map((h, i) => <HistoryEntry key={i} title={`${text(h.stage)} · ${text(h.action)}`} meta={`${text(h.by)} · ${date(h.at)}`}>{text(h.reason)}</HistoryEntry>)}</div> : <Help>No review actions recorded yet.</Help>}
      </MoreDetails>
      <Help className="mt-6">Each payment request is reviewed by Finance separately. Corrections return to the requester, who resubmits to Finance.</Help>
    </Modal>
  );
}
