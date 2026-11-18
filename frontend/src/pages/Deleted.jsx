// Deleted page (Admin only). Lists the requests and payment requests Admin deleted, newest
// first, and the full log of deletions and restorations. A deleted record counts nowhere
// until it is restored; its draft payment requests deleted with it come back with it.
import { Badge, DataTable, Empty, PageHeader, RegionLabel, text } from "../components/ui.jsx";
import { Money, Sub, TableBody, TableCell, TableHead, TableHeader, TableRow, WORK_TABLE } from "../components/tables.jsx";
import { date } from "../lib/format.js";
import { allOrders, allRequests, nameOf } from "../lib/selectors.js";
import { useApp, useData } from "../lib/store.js";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const Head = ({ title, count, note }) => (
  <CardHeader className="card-head border-b border-border px-6 py-5">
    <CardTitle className="flex items-center gap-2.5">{title}<span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground tabular">{count}</span></CardTitle>
    {note ? <CardDescription className="help">{note}</CardDescription> : null}
  </CardHeader>
);

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
      <PageHeader title="Deleted" description="Requests and payment requests deleted by Admin. They count nowhere in the portal until restored." />
      <RegionLabel.Provider value="Deleted records">
        <Card className="gap-0 overflow-hidden py-0">
          <Head title="Deleted records" count={rows.length} note="A request can be deleted only after its processed payment requests are deleted; its drafts go with it. Restore a request before any payment request deleted under it." />
          {rows.length ? (
            <DataTable className={`deleted-table ${WORK_TABLE}`}>
              <TableHeader><TableRow><TableHead scope="col">Record</TableHead><TableHead scope="col">Supplier / PO</TableHead><TableHead scope="col">Project / Company</TableHead><TableHead scope="col" className="text-right">Amount</TableHead><TableHead scope="col">Status</TableHead><TableHead scope="col">Deleted</TableHead><TableHead scope="col"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.map(({ kind, x, o }) => {
                  const drafts = kind === "order" ? requests.filter((r) => r.deleted.withOrder === x.id && r.deleted.id === x.deleted.id) : [];
                  const blocked = kind === "request" && o?.deleted;
                  return (
                    <TableRow key={kind + x.id}>
                      <TableCell data-label="Record"><strong className="font-semibold">{x.number}</strong><Sub>{(kind === "order" ? "Request" : `Payment request · ${text(o?.number)}`) + (drafts.length ? ` · with draft ${drafts.map((r) => r.number).join(", ")}` : "")}</Sub></TableCell>
                      <TableCell data-label="Supplier / PO">{nameOf(state, "suppliers", o?.supplierId)}<Sub>{o?.po || ""}</Sub></TableCell>
                      <TableCell data-label="Project / Company">{nameOf(state, "projects", o?.projectId)}<Sub>{nameOf(state, "companies", o?.companyId)}</Sub></TableCell>
                      <TableCell data-label="Amount" className="text-right"><Money strong currency={text(kind === "order" ? x.currency : x.currency || o?.currency)} value={kind === "order" ? x.total : x.amount} /></TableCell>
                      <TableCell data-label="Status">{kind === "order" ? (x.rejectedAt ? <Badge status="Rejected" /> : <span className="text-muted-foreground">—</span>) : <Badge status={x.status} />}</TableCell>
                      <TableCell data-label="Deleted" className="whitespace-normal">{date(x.deleted.at)}<Sub>{`${text(x.deleted.by)} · ${text(x.deleted.reason)}`}</Sub></TableCell>
                      <TableCell data-label="Actions">
                        <div className="actions flex justify-end gap-2">
                          <Button variant="outline" size="sm" data-action="openDeleted" data-kind={kind} data-id={x.id} onClick={() => actions.openDeleted(x.id, kind)}>Review</Button>
                          <Button size="sm" className="primary" data-action="restoreDeleted" data-kind={kind} data-id={x.id} disabled={!!blocked} title={blocked ? `Restore its request ${o.number} first` : undefined} onClick={() => actions.restoreForm(x.id, kind)}>Restore</Button>
                        </div>
                        {blocked ? <Sub className="text-right">{`Restore ${o.number} first`}</Sub> : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </DataTable>
          ) : <Empty title="Nothing is deleted" icon="deleted" note="Requests and payment requests that Admin deletes appear here until they are restored." />}
        </Card>
      </RegionLabel.Provider>
      <RegionLabel.Provider value="Deletion log">
        <Card className="mt-6 gap-0 overflow-hidden py-0">
          <Head title="Deletion log" count={events.length} />
          {events.length ? (
            <DataTable className={`deletion-log ${WORK_TABLE}`}>
              <TableHeader><TableRow><TableHead scope="col">Date / Time</TableHead><TableHead scope="col">Event</TableHead><TableHead scope="col">Record</TableHead><TableHead scope="col">By</TableHead><TableHead scope="col">Reason</TableHead></TableRow></TableHeader>
              <TableBody>
                {events.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell data-label="Date / Time" className="text-muted-foreground">{date(e.at)}</TableCell>
                    <TableCell data-label="Event"><Badge status={e.event} /></TableCell>
                    <TableCell data-label="Record"><strong className="font-semibold">{e.x.number}</strong><Sub>{(isOrder(e.x) ? "Request" : "Payment request") + (e.withOrder ? ` · with ${everyOrder.find((o) => o.id === e.withOrder)?.number || "its request"}` : "")}</Sub></TableCell>
                    <TableCell data-label="By">{e.by}</TableCell>
                    <TableCell data-label="Reason" className="whitespace-normal">{e.reason || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          ) : <p className="help px-6 py-5 text-xs text-muted-foreground">No deletions recorded yet.</p>}
        </Card>
      </RegionLabel.Provider>
    </>
  );
}
