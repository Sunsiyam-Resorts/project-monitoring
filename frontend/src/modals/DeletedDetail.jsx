// Admin reviews a deleted request or payment request, including its documents, and can
// restore it to exactly the status it had.
import { Badge, Detail, FileList, TableWrap, text } from "../components/ui.jsx";
import { CategoryTable, ReviewHistory } from "../components/Records.jsx";
import { date, fmt } from "../lib/format.js";
import { allOrders, allRequests, deletedRecord, nameOf } from "../lib/selectors.js";
import { useApp, useData } from "../lib/store.js";
import { Modal } from "./ModalHost.jsx";

export function DeletedDetail({ id, kind }) {
  const { actions } = useApp();
  const { state } = useData();
  const x = deletedRecord(state, id, kind);
  if (!x) return null;
  const o = kind === "order" ? x : allOrders(state).find((o) => o.id === x.orderId);
  const del = x.deleted, blocked = kind === "request" && o.deleted;
  const notice = (
    <div className="notice warn">
      <strong>{`Deleted ${date(del.at)} by ${text(del.by)}`}</strong>
      <p>{del.reason}</p>
      {del.withOrder ? <p>{`Deleted together with its request ${text(o.number)}. Restoring the request restores it.`}</p> : null}
    </div>
  );
  const restore = del.withOrder ? null : (
    <>
      <div className="actions">
        <button className="primary" data-action="restoreDeleted" data-kind={kind} data-id={id} disabled={!!blocked} onClick={() => actions.restoreForm(id, kind)}>{`Restore ${kind === "order" ? "request" : "payment request"}`}</button>
      </div>
      {blocked ? <p className="help">{`Restore its request ${text(o.number)} first.`}</p> : null}
    </>
  );
  const grid = (
    <div className="detail-grid">
      {kind === "request" ? <Detail label="Request">{text(o.number)}</Detail> : null}
      <Detail label="Company">{nameOf(state, "companies", o.companyId)}</Detail>
      <Detail label="Project">{nameOf(state, "projects", o.projectId)}</Detail>
      <Detail label="Supplier">{nameOf(state, "suppliers", o.supplierId)}</Detail>
      <Detail label="PO">{text(o.po)}</Detail>
      <Detail label="Invoice">{o.invoice || "—"}</Detail>
      <Detail label="Requested by">{nameOf(state, "users", x.requestedBy)}</Detail>
    </div>
  );
  if (kind === "order") {
    const children = allRequests(state).filter((r) => r.orderId === id);
    return (
      <Modal title="Deleted request">
        <div className="detail-top"><div><div className="detail-number">{x.number}</div></div><Badge status="Deleted" /></div>
        {notice}
        <div className="detail-lead">
          <div><div className="eyebrow">Total order amount</div><div className="amount"><span>{text(x.currency)}</span>{fmt(x.total)}</div></div>
          <div className="lead-side"><small>USD equivalent</small><strong>{`USD ${fmt(x.total / x.rate)}`}</strong>{x.rejectedAt ? <small>Rejected before deletion</small> : null}</div>
        </div>
        {restore}
        {grid}
        <p className="sub">{x.description}</p>
        <h3>Budget allocations</h3>
        <CategoryTable o={x} />
        <div className="detail-section"><h3>Supporting documents</h3>{x.files?.length ? <FileList files={x.files} kind="order" id={id} /> : <p className="help">No supporting documents attached.</p>}</div>
        <div className="detail-section">
          <h3>Payment Requests</h3>
          {children.length ? (
            <TableWrap>
              <table>
                <thead><tr><th scope="col">Payment request</th><th scope="col">Status</th><th scope="col" className="right">Amount</th><th scope="col">Deleted</th></tr></thead>
                <tbody>
                  {children.map((r) => (
                    <tr key={r.id}>
                      <td>{r.number}</td><td><Badge status={r.status} /></td><td className="right">{`${text(r.currency)} ${fmt(r.amount)}`}</td>
                      <td>{r.deleted ? (r.deleted.id === del.id ? "With this request" : `Separately · ${date(r.deleted.at)}`) : "Not deleted"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ) : <p className="help">No payment requests.</p>}
        </div>
      </Modal>
    );
  }
  const currency = text(x.currency || o.currency);
  return (
    <Modal title="Deleted payment request">
      <div className="detail-top"><div><div className="detail-number">{x.number}</div></div><Badge status={x.status} />{" "}<Badge status="Deleted" /></div>
      {notice}
      <div className="detail-lead">
        <div><div className="eyebrow">{`Requested payment · ${x.percent}% at creation`}</div><div className="amount"><span>{currency}</span>{fmt(x.amount)}</div><small>{text(x.terms)}</small></div>
        <div className="lead-side"><small>Full order amount</small><strong>{`${text(o.currency)} ${fmt(o.total)}`}</strong><small>{`Request date ${text(x.date)}`}</small></div>
      </div>
      {restore}
      {grid}
      {x.payment ? (
        <>
          <div className="notice success"><strong>{`Paid ${currency} ${fmt(x.payment.amount)}`}</strong><br />{`${text(x.payment.date)} · ${text(x.payment.type)} · ${text(x.payment.by)}`}</div>
          <FileList files={x.payment.files} kind="payment" id={id} />
        </>
      ) : null}
      <div className="detail-section"><h3>Supporting documents</h3>{x.files?.length ? <FileList files={x.files} kind="request" id={id} /> : <p className="help">No additional supporting documents.</p>}</div>
      {x.remarks.length ? (
        <div className="detail-section">
          <h3>Finance remarks</h3>
          {x.remarks.map((m, i) => <div key={i} className="notice">{text(m.text)}<br /><small>{`${text(m.by)} · ${date(m.at)}`}</small></div>)}
        </div>
      ) : null}
      <ReviewHistory history={x.history} />
    </Modal>
  );
}
