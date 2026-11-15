// Record tables shared by the Requests page and the record dialogs.
import { Fragment } from "react";
import { Badge, BusyButton, Empty, RegionLabel, RowAction, TableWrap, text } from "./ui.jsx";
import { fmt, date } from "../lib/format.js";
import { attention, nameOf } from "../lib/selectors.js";
import { useApp, useAppState, useData } from "../lib/store.js";

export function RequestTable({ rs }) {
  const { actions } = useApp();
  const { state } = useData();
  if (!rs.length) return <Empty title="Nothing in this view" note="Change your filters, or create a main request to begin a new payment workflow." />;
  return (
    <TableWrap>
      <table className="work-table">
        <thead><tr><th scope="col">Payment request</th><th scope="col">Supplier / PO</th><th scope="col">Project / Company</th><th scope="col" className="right">Requested amount</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {rs.map((r) => {
            const o = state.orders.find((o) => o.id === r.orderId);
            const currency = r.currency || o.currency;
            return (
              <tr key={r.id}>
                <td data-label="Payment request"><strong>{r.number}</strong><span className="secondary">{`${text(r.date)} · ${r.percent}% instalment`}</span></td>
                <td data-label="Supplier / PO">{nameOf(state, "suppliers", o.supplierId)}<span className="secondary">{o.po}</span></td>
                <td data-label="Project / Company">{nameOf(state, "projects", o.projectId)}<span className="secondary">{nameOf(state, "companies", o.companyId)}</span></td>
                <td data-label="Requested amount" className="right">
                  <strong><span className="currency">{currency}</span>{fmt(r.amount)}</strong>
                  {currency !== "USD" ? <span className="secondary">{`USD ${fmt(r.amount / (r.rate || o.rate))}`}</span> : null}
                </td>
                <td data-label="Status"><Badge status={r.status} /></td>
                <td><RowAction action="openRequest" id={r.id} label={"Open " + r.number} busy onRun={() => actions.openRequest(r.id)} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}

export function OrdersTable({ os, view = "requests", all }) {
  const { actions } = useApp();
  const { state, user } = useData();
  const { expanded } = useAppState();
  if (!os.length) return <Empty title="Nothing in this view" note="Adjust your filters or check another tab." />;
  return (
    <TableWrap>
      <table className="work-table">
        <thead><tr><th scope="col">Request Reference</th><th scope="col">Supplier / PO</th><th scope="col">Project / Company</th><th scope="col" className="right">Total Amount</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {os.map((o) => {
            const open = expanded.includes(o.id);
            const rs = all.filter((r) => r.orderId === o.id && (view !== "inbox" || attention(user, r)));
            return (
              <Fragment key={o.id}>
                <tr>
                  <td data-label="Request Reference"><BusyButton className="linkbtn" data-action="openOrder" data-id={o.id} onRun={() => actions.openOrder(o.id)}>{o.number}</BusyButton></td>
                  <td data-label="Supplier / PO">{nameOf(state, "suppliers", o.supplierId)}<span className="secondary">{o.po}</span></td>
                  <td data-label="Project / Company">{nameOf(state, "projects", o.projectId)}<span className="secondary">{nameOf(state, "companies", o.companyId)}</span></td>
                  <td data-label="Total Amount" className="right"><span className="currency">{o.currency}</span>{fmt(o.total)}</td>
                  <td>
                    {view === "balance"
                      ? <RowAction action="openOrder" id={o.id} label={"Open " + o.number} busy onRun={() => actions.openOrder(o.id)} />
                      : <button className="row-action expand-control" data-action="expand" data-id={o.id} aria-expanded={String(open)} aria-label={`${open ? "Collapse" : "Expand"} ${o.number}`} onClick={() => actions.toggleExpand(o.id)}>{open ? "−" : "+"}</button>}
                  </td>
                </tr>
                {open && view !== "balance" ? (
                  <tr className="children-row">
                    <td colSpan={5}>
                      <div className="nested-requests">
                        {o.amendment ? <BusyButton data-action="openOrder" data-id={o.id} onRun={() => actions.openOrder(o.id)}>{`Amendment · ${o.amendment.status}`}</BusyButton> : null}
                        <RequestTable rs={rs} />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}

export function CategoryTable({ o }) {
  const { state } = useData();
  const b = state.budgets.find((b) => b.id === o.budgetId);
  return (
    <TableWrap>
      <table>
        <thead><tr><th scope="col">Budget category</th><th scope="col" className="right">{`Order allocation ${o.currency}`}</th><th scope="col" className="right">USD equivalent</th></tr></thead>
        <tbody>
          {o.allocations.map((a, i) => (
            <tr key={i}><td>{b?.categories.find((c) => c.id === a.categoryId)?.name || a.categoryId}</td><td className="right">{fmt(a.amount)}</td><td className="right">{fmt(a.amount / o.rate)}</td></tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

export function ReviewHistory({ history = [] }) {
  return (
    <RegionLabel.Provider value="Review history">
      <section className="detail-section">
        <h3>Review history</h3>
        {history.length ? (
          <TableWrap>
            <table>
              <thead><tr><th scope="col">Stage / Action</th><th scope="col">Name</th><th scope="col">Date / Time</th><th scope="col">Reason</th></tr></thead>
              <tbody>
                {history.map((h, i) => <tr key={i}><td>{`${text(h.stage)} · ${text(h.action)}`}</td><td>{h.by}</td><td>{date(h.at)}</td><td>{h.reason || "—"}</td></tr>)}
              </tbody>
            </table>
          </TableWrap>
        ) : <p className="help">No review actions recorded yet.</p>}
      </section>
    </RegionLabel.Provider>
  );
}
