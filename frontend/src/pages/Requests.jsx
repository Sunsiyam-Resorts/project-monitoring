import { approved, canCreateRequests, remainingToRequest } from "../domain/domain.js";
import { Icon } from "../components/Icon.jsx";
import { PageHeader, RegionLabel, Tabs } from "../components/ui.jsx";
import { Filters } from "../components/Filters.jsx";
import { OrdersTable, RequestTable } from "../components/Records.jsx";
import { amendmentAttention, attention, filteredRequests, orderMatch, sortRequests } from "../lib/selectors.js";
import { useApp, useAppState, useData } from "../lib/store.js";

const TABS = [["requests", "Requests"], ["finance", "Finance"], ["balance", "Balance to request"], ["inbox", "My Actions"]];
const SORTS = [["date-desc", "Date: newest first"], ["date-asc", "Date: oldest first"], ["amount-desc", "Amount: highest USD"], ["number", "Request number"]];

export function Requests() {
  const { actions } = useApp();
  const { state, user } = useData();
  const ui = useAppState();
  const { tab, sortOrder, search, from, to, statusFilter, expanded } = ui;
  const all = sortRequests(state, filteredRequests(state, ui), sortOrder);
  const os = state.orders.filter((o) => orderMatch(state, ui, o)).sort((a, b) =>
    sortOrder === "amount-desc" ? b.total / b.rate - a.total / a.rate
      : sortOrder === "number" ? a.number.localeCompare(b.number)
        : sortOrder === "date-asc" ? a.createdAt.localeCompare(b.createdAt)
          : b.createdAt.localeCompare(a.createdAt));
  const children = (o) => all.filter((r) => r.orderId === o.id);
  const lists = {
    requests: os.filter((o) => (!from && !to && !statusFilter) || children(o).length),
    finance: all.filter(approved),
    balance: os.filter((o) => !o.rejectedAt && remainingToRequest(state, o) > 0.005),
    inbox: os.filter((o) => children(o).some((r) => attention(user, r)) || amendmentAttention(user, o)),
  };
  const shown = lists[tab] || lists.requests;
  // The table region is named after the first heading in its section, which is an empty
  // nested list's heading when an expanded order shows no payment requests.
  const emptyNested = tab !== "finance" && tab !== "balance" &&
    shown.some((o) => expanded.includes(o.id) && !all.some((r) => r.orderId === o.id && (tab !== "inbox" || attention(user, r))));
  return (
    <>
      <PageHeader eyebrow="REQUEST WORKSPACE" title="Requests" description="One order, with every payment request submitted to Finance separately."
        actions={canCreateRequests(user) && tab === "requests" ? (
          <>
            <button data-action="import" onClick={() => actions.importForm()}>Import CSV / Excel</button>
            <button className="primary" data-action="newOrder" onClick={() => actions.newOrder()}><Icon name="plus" />New Request</button>
          </>
        ) : null} />
      <Tabs>
        {TABS.map(([v, t]) => (
          <button key={v} data-tab={v} className={tab === v ? "active" : ""} aria-pressed={String(tab === v)} onClick={() => actions.setTab(v)}>{t}<span className="count">{lists[v].length}</span></button>
        ))}
      </Tabs>
      <Filters dates />
      <div className="list-toolbar">
        <div className="searchbox"><Icon name="search" /><input id="search" aria-label="Search requests" placeholder="Search reference, supplier, PO or invoice" value={search} onChange={(e) => actions.setSearch("search", e.target.value)} /></div>
        <div className="list-options">
          <select id="sortOrder" aria-label="Sort payment requests" value={sortOrder} onChange={(e) => actions.setSortOrder(e.target.value)}>
            {SORTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
      </div>
      <RegionLabel.Provider value={emptyNested ? "Nothing in this view" : "Data table"}>
        <section className="panel flush">
          {tab === "finance" ? <RequestTable rs={lists.finance} /> : <OrdersTable os={shown} view={tab} all={all} />}
          <div className="table-footer"><span>{`${lists[tab]?.length || 0} records`}</span><span>Company access applies to every record</span></div>
        </section>
      </RegionLabel.Provider>
    </>
  );
}
