import { approved, canCreateRequests, remainingToRequest } from "../domain/domain.js";
import { Icon } from "../components/Icon.jsx";
import { FormSelect, PageHeader, RegionLabel } from "../components/ui.jsx";
import { Filters } from "../components/Filters.jsx";
import { OrdersTable, RequestTable } from "../components/Records.jsx";
import { ListToolbar, SearchBox, TabCount } from "../components/Toolbar.jsx";
import { amendmentAttention, attention, filteredRequests, orderMatch, sortRequests } from "../lib/selectors.js";
import { useApp, useAppState, useData } from "../lib/store.js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
      <PageHeader title="Requests" description="One order, with every payment request submitted to Finance separately."
        actions={canCreateRequests(user) && tab === "requests" ? (
          <>
            <Button variant="outline" data-action="import" onClick={() => actions.importForm()}>Import CSV / Excel</Button>
            <Button data-action="newOrder" onClick={() => actions.newOrder()}><Icon name="plus" />New Request</Button>
          </>
        ) : null} />
      <Tabs value={tab} onValueChange={(v) => actions.setTab(v)} className="mb-6">
        <TabsList aria-label="View selection" className="tabs">
          {TABS.map(([v, t]) => (
            <TabsTrigger key={v} value={v} data-tab={v} className={tab === v ? "active" : ""} aria-pressed={String(tab === v)}>{t}<TabCount active={tab === v}>{lists[v].length}</TabCount></TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Filters dates />
      <ListToolbar>
        <SearchBox id="search" label="Search requests" placeholder="Search reference, supplier, PO or invoice" value={search} onChange={(v) => actions.setSearch("search", v)} />
        <FormSelect id="sortOrder" aria-label="Sort payment requests" value={sortOrder} onValueChange={(v) => actions.setSortOrder(v)}
          options={SORTS.map(([value, label]) => ({ value, label }))} className="list-options w-auto min-w-[200px] max-sm:w-full" />
      </ListToolbar>
      <RegionLabel.Provider value={emptyNested ? "Nothing in this view" : "Data table"}>
        <Card className="gap-0 overflow-hidden py-0">
          {tab === "finance" ? <RequestTable rs={lists.finance} /> : <OrdersTable os={shown} view={tab} all={all} />}
          <div className="table-footer flex flex-wrap justify-between gap-2 border-t border-border px-6 py-4 text-[11px] text-muted-foreground"><span>{`${lists[tab]?.length || 0} records`}</span><span>Company access applies to every record</span></div>
        </Card>
      </RegionLabel.Provider>
    </>
  );
}
