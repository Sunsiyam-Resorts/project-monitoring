// Admin reviews a deleted request or payment request, including its documents, and can
// restore it to exactly the status it had.
import { Badge, DataTable, Detail, DetailGrid, FileList, Help, text } from "../components/ui.jsx";
import { ActionRow, DetailSection, Notice, RecordLead, RecordTop } from "../components/detail.jsx";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/tables.jsx";
import { CategoryTable, ReviewHistory } from "../components/Records.jsx";
import { date, fmt, shortDate } from "../lib/format.js";
import { allOrders, allRequests, deletedRecord, nameOf } from "../lib/selectors.js";
import { useApp, useData } from "../lib/store.js";
import { Button } from "@/components/ui/button";
import { Modal } from "./ModalHost.jsx";

export function DeletedDetail({ id, kind }) {
  const { actions } = useApp();
  const { state } = useData();
  const x = deletedRecord(state, id, kind);
  if (!x) return null;
  const o = kind === "order" ? x : allOrders(state).find((o) => o.id === x.orderId);
  const del = x.deleted, blocked = kind === "request" && o.deleted;
  const notice = (
    <Notice tone="warning" className="mt-0 mb-5" title={`Deleted ${date(del.at)} by ${text(del.by)}`}>
      <p>{del.reason}</p>
      {del.withOrder ? <p>{`Deleted together with its request ${text(o.number)}. Restoring the request restores it.`}</p> : null}
    </Notice>
  );
  const restore = del.withOrder ? null : (
    <>
      <ActionRow className="mt-0 mb-6">
        <Button className="primary" data-action="restoreDeleted" data-kind={kind} data-id={id} disabled={!!blocked} onClick={() => actions.restoreForm(id, kind)}>{`Restore ${kind === "order" ? "request" : "payment request"}`}</Button>
      </ActionRow>
      {blocked ? <Help className="-mt-3 mb-6">{`Restore its request ${text(o.number)} first.`}</Help> : null}
    </>
  );
  const grid = (
    <DetailGrid>
      {kind === "request" ? <Detail label="Request">{text(o.number)}</Detail> : null}
      <Detail label="Company">{nameOf(state, "companies", o.companyId)}</Detail>
      <Detail label="Project">{nameOf(state, "projects", o.projectId)}</Detail>
      <Detail label="Supplier">{nameOf(state, "suppliers", o.supplierId)}</Detail>
      <Detail label="PO">{text(o.po)}</Detail>
      <Detail label="Invoice">{o.invoice || "—"}</Detail>
      <Detail label="Requested by">{nameOf(state, "users", x.requestedBy)}</Detail>
    </DetailGrid>
  );
  if (kind === "order") {
    const children = allRequests(state).filter((r) => r.orderId === id);
    return (
      <Modal title="Deleted request">
        <RecordTop number={x.number}><Badge status="Deleted" /></RecordTop>
        {notice}
        <RecordLead eyebrow="Total order amount" currency={text(x.currency)} amount={fmt(x.total)}
          side={<><small>USD equivalent</small><strong>{`USD ${fmt(x.total / x.rate)}`}</strong>{x.rejectedAt ? <small>Rejected before deletion</small> : null}</>} />
        {restore}
        {grid}
        <p className="sub mt-5 text-[13px] text-muted-foreground">{x.description}</p>
        <DetailSection title="Budget allocations"><CategoryTable o={x} /></DetailSection>
        <DetailSection title="Supporting documents">{x.files?.length ? <FileList files={x.files} kind="order" id={id} /> : <Help>No supporting documents attached.</Help>}</DetailSection>
        <DetailSection title="Payment Requests">
          {children.length ? (
            <DataTable containerClassName="rounded-xl border border-border">
              <TableHeader><TableRow><TableHead scope="col">Payment request</TableHead><TableHead scope="col">Status</TableHead><TableHead scope="col" className="text-right">Amount</TableHead><TableHead scope="col">Deleted</TableHead></TableRow></TableHeader>
              <TableBody>
                {children.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.number}</TableCell><TableCell><Badge status={r.status} /></TableCell><TableCell className="text-right">{`${text(r.currency)} ${fmt(r.amount)}`}</TableCell>
                    <TableCell>{r.deleted ? (r.deleted.id === del.id ? "With this request" : `Separately · ${date(r.deleted.at)}`) : "Not deleted"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          ) : <Help>No payment requests.</Help>}
        </DetailSection>
      </Modal>
    );
  }
  const currency = text(x.currency || o.currency);
  return (
    <Modal title="Deleted payment request">
      <RecordTop number={x.number}><div className="flex gap-1.5"><Badge status={x.status} /><Badge status="Deleted" /></div></RecordTop>
      {notice}
      <RecordLead eyebrow={`Requested payment · ${x.percent}% at creation`} currency={currency} amount={fmt(x.amount)} note={text(x.terms)}
        side={<><small>Full order amount</small><strong>{`${text(o.currency)} ${fmt(o.total)}`}</strong><small>{`Request date ${shortDate(x.date)}`}</small></>} />
      {restore}
      {grid}
      {x.payment ? (
        <>
          <Notice tone="success" title={`Paid ${currency} ${fmt(x.payment.amount)}`}>{`${shortDate(x.payment.date)} · ${text(x.payment.type)} · ${text(x.payment.by)}`}</Notice>
          {x.payment.files?.length ? <div className="mt-3"><FileList files={x.payment.files} kind="payment" id={id} /></div> : null}
        </>
      ) : null}
      <DetailSection title="Supporting documents">{x.files?.length ? <FileList files={x.files} kind="request" id={id} /> : <Help>No additional supporting documents.</Help>}</DetailSection>
      {x.remarks.length ? (
        <DetailSection title="Finance remarks">
          {x.remarks.map((m, i) => <Notice key={i} className="mt-0" title={text(m.text)}>{`${text(m.by)} · ${date(m.at)}`}</Notice>)}
        </DetailSection>
      ) : null}
      <ReviewHistory history={x.history} />
    </Modal>
  );
}
