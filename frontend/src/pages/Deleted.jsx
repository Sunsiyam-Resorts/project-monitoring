// Deleted page (Admin only). Lists the requests and payment requests Admin deleted, newest
// first, and the full log of deletions and restorations. A deleted record counts nowhere
// until it is restored; its draft payment requests deleted with it come back with it.
import { Badge, Empty, PageHeader, RegionLabel, TableWrap, text } from "../components/ui.jsx";
import { date, fmt } from "../lib/format.js";
import { allOrders, allRequests, nameOf } from "../lib/selectors.js";
import { useApp, useData } from "../lib/store.js";

export function Deleted() {
  const { actions } = useApp();
  const { state } = useData();
  const orders = state.deletedOrders || [], requests = state.deletedRequests || [];
  const everyOrder = allOrders(state);
  const orderOf = (r) => everyOrder.find((o) => o.id === r.orderId);
  const rows = [
    ...orders.map((o) => ({ kind: "order", x: o, o })),
    ...requests.filter((r) => !r.deleted.withOrder).map((r) => ({ kind: "request", x: r, o: orderOf(r) })),
  ].sort((m, n) => Date.parse(n.x.deleted.at) - Date.parse(m.x.deleted.at));
  const isOrder = (x) => everyOrder.includes(x);
  const events = [...everyOrder, ...allRequests(state)]
    .flatMap((x) => [...(x.deletionHistory || []), ...(x.deleted ? [x.deleted] : [])].flatMap((e) => [
      { at: e.at, event: "Deleted", x, by: e.by, reason: e.reason, withOrder: e.withOrder },
      ...(e.restoredAt ? [{ at: e.restoredAt, event: "Restored", x, by: e.restoredBy, reason: "", withOrder: e.withOrder }] : []),
    ]))
    .sort((m, n) => Date.parse(n.at) - Date.parse(m.at));
  return (
    <>
      <PageHeader eyebrow="ADMINISTRATION" title="Deleted" description="Requests and payment requests deleted by Admin. They count nowhere in the portal until restored." />
      <RegionLabel.Provider value="Deleted records">
        <section className="panel">
          <header className="card-head"><h2>Deleted records</h2><small>{rows.length}</small></header>
          <p className="help">A request can be deleted only after its processed payment requests are deleted; its drafts go with it. Restore a request before any payment request deleted under it.</p>
          {rows.length ? (
            <TableWrap>
              <table className="work-table deleted-table">
                <thead><tr><th scope="col">Record</th><th scope="col">Supplier / PO</th><th scope="col">Project / Company</th><th scope="col" className="right">Amount</th><th scope="col">Status</th><th scope="col">Deleted</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {rows.map(({ kind, x, o }) => {
                    const drafts = kind === "order" ? requests.filter((r) => r.deleted.withOrder === x.id && r.deleted.id === x.deleted.id) : [];
                    const blocked = kind === "request" && o?.deleted;
                    return (
                      <tr key={kind + x.id}>
                        <td data-label="Record"><strong>{x.number}</strong><span className="secondary">{(kind === "order" ? "Request" : `Payment request · ${text(o?.number)}`) + (drafts.length ? ` · with draft ${drafts.map((r) => r.number).join(", ")}` : "")}</span></td>
                        <td data-label="Supplier / PO">{nameOf(state, "suppliers", o?.supplierId)}<span className="secondary">{o?.po || ""}</span></td>
                        <td data-label="Project / Company">{nameOf(state, "projects", o?.projectId)}<span className="secondary">{nameOf(state, "companies", o?.companyId)}</span></td>
                        <td data-label="Amount" className="right"><strong><span className="currency">{text(kind === "order" ? x.currency : x.currency || o?.currency)}</span>{fmt(kind === "order" ? x.total : x.amount)}</strong></td>
                        <td data-label="Status">{kind === "order" ? (x.rejectedAt ? <Badge status="Rejected" /> : <span className="secondary">—</span>) : <Badge status={x.status} />}</td>
                        <td data-label="Deleted">{date(x.deleted.at)}<span className="secondary">{`${text(x.deleted.by)} · ${text(x.deleted.reason)}`}</span></td>
                        <td data-label="Actions">
                          <div className="actions" style={{ marginTop: 0 }}>
                            <button data-action="openDeleted" data-kind={kind} data-id={x.id} onClick={() => actions.openDeleted(x.id, kind)}>Review</button>
                            <button className="primary" data-action="restoreDeleted" data-kind={kind} data-id={x.id} disabled={!!blocked} title={blocked ? `Restore its request ${o.number} first` : undefined} onClick={() => actions.restoreForm(x.id, kind)}>Restore</button>
                          </div>
                          {blocked ? <small className="secondary">{`Restore ${o.number} first`}</small> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          ) : <Empty title="Nothing is deleted" note="Requests and payment requests that Admin deletes appear here until they are restored." />}
        </section>
      </RegionLabel.Provider>
      <RegionLabel.Provider value="Deletion log">
        <section className="panel section-gap">
          <header className="card-head"><h2>Deletion log</h2><small>{events.length}</small></header>
          {events.length ? (
            <TableWrap>
              <table className="work-table deletion-log">
                <thead><tr><th scope="col">Date / Time</th><th scope="col">Event</th><th scope="col">Record</th><th scope="col">By</th><th scope="col">Reason</th></tr></thead>
                <tbody>
                  {events.map((e, i) => (
                    <tr key={i}>
                      <td data-label="Date / Time">{date(e.at)}</td>
                      <td data-label="Event"><Badge status={e.event} /></td>
                      <td data-label="Record"><strong>{e.x.number}</strong><span className="secondary">{(isOrder(e.x) ? "Request" : "Payment request") + (e.withOrder ? ` · with ${everyOrder.find((o) => o.id === e.withOrder)?.number || "its request"}` : "")}</span></td>
                      <td data-label="By">{e.by}</td>
                      <td data-label="Reason">{e.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ) : <p className="help">No deletions recorded yet.</p>}
        </section>
      </RegionLabel.Provider>
    </>
  );
}
