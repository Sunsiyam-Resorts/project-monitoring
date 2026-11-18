// Record tables shared by the Requests page and the record dialogs (shadcn Table).
import { Fragment } from "react";
import { Minus, Plus } from "lucide-react";
import { remainingToRequest } from "../domain/domain.js";
import { Badge, BusyButton, DataTable, Empty, Help, RegionLabel, RowAction, text } from "./ui.jsx";
import { Money, Sub, TableBody, TableCell, TableHead, TableHeader, TableRow, WORK_TABLE } from "./tables.jsx";
import { fmt, date } from "../lib/format.js";
import { attention, nameOf } from "../lib/selectors.js";
import { useApp, useAppState, useData } from "../lib/store.js";
import { Button } from "@/components/ui/button";

const Actions = () => <TableHead scope="col"><span className="sr-only">Actions</span></TableHead>;

export function RequestTable({ rs }) {
  const { actions } = useApp();
  const { state } = useData();
  if (!rs.length) return <Empty title="Nothing in this view" note="Change your filters, or create a main request to begin a new payment workflow." />;
  return (
    <DataTable className={WORK_TABLE}>
      <TableHeader><TableRow><TableHead scope="col">Payment request</TableHead><TableHead scope="col">Supplier / PO</TableHead><TableHead scope="col">Project / Company</TableHead><TableHead scope="col" className="text-right">Requested amount</TableHead><TableHead scope="col">Status</TableHead><Actions /></TableRow></TableHeader>
      <TableBody>
        {rs.map((r) => {
          const o = state.orders.find((o) => o.id === r.orderId);
          const currency = r.currency || o.currency;
          return (
            <TableRow key={r.id}>
              <TableCell data-label="Payment request"><strong className="font-semibold">{r.number}</strong><Sub>{`${text(r.date)} · ${r.percent}% instalment`}</Sub></TableCell>
              <TableCell data-label="Supplier / PO">{nameOf(state, "suppliers", o.supplierId)}<Sub>{o.po}</Sub></TableCell>
              <TableCell data-label="Project / Company">{nameOf(state, "projects", o.projectId)}<Sub>{nameOf(state, "companies", o.companyId)}</Sub></TableCell>
              <TableCell data-label="Requested amount" className="text-right">
                <Money currency={currency} value={r.amount} strong />
                {currency !== "USD" ? <Sub>{`USD ${fmt(r.amount / (r.rate || o.rate))}`}</Sub> : null}
              </TableCell>
              <TableCell data-label="Status"><Badge status={r.status} /></TableCell>
              <TableCell className="w-16 text-right"><RowAction action="openRequest" id={r.id} label={"Open " + r.number} busy onRun={() => actions.openRequest(r.id)} /></TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </DataTable>
  );
}

export function OrdersTable({ os, view = "requests", all }) {
  const { actions } = useApp();
  const { state, user } = useData();
  const { expanded } = useAppState();
  if (!os.length) return <Empty title="Nothing in this view" note="Adjust your filters or check another tab." />;
  const balance = view === "balance";
  return (
    <DataTable className={WORK_TABLE}>
      <TableHeader><TableRow><TableHead scope="col">Request Reference</TableHead><TableHead scope="col">Supplier / PO</TableHead><TableHead scope="col">Project / Company</TableHead><TableHead scope="col" className="text-right">Total Amount</TableHead>{balance ? <TableHead scope="col" className="text-right">Balance Amount</TableHead> : null}<Actions /></TableRow></TableHeader>
      <TableBody>
        {os.map((o) => {
          const open = expanded.includes(o.id);
          const rs = all.filter((r) => r.orderId === o.id && (view !== "inbox" || attention(user, r)));
          return (
            <Fragment key={o.id}>
              <TableRow data-state={open ? "selected" : undefined}>
                <TableCell data-label="Request Reference"><BusyButton variant="link" className="linkbtn" data-action="openOrder" data-id={o.id} onRun={() => actions.openOrder(o.id)}>{o.number}</BusyButton></TableCell>
                <TableCell data-label="Supplier / PO">{nameOf(state, "suppliers", o.supplierId)}<Sub>{o.po}</Sub></TableCell>
                <TableCell data-label="Project / Company">{nameOf(state, "projects", o.projectId)}<Sub>{nameOf(state, "companies", o.companyId)}</Sub></TableCell>
                <TableCell data-label="Total Amount" className="text-right"><Money currency={o.currency} value={o.total} /></TableCell>
                {balance ? <TableCell data-label="Balance Amount" className="text-right"><Money currency={o.currency} value={remainingToRequest(state, o)} strong /></TableCell> : null}
                <TableCell className="w-16 text-right">
                  {balance
                    ? <RowAction action="openOrder" id={o.id} label={"Open " + o.number} busy onRun={() => actions.openOrder(o.id)} />
                    : <Button variant="secondary" size="icon" className="row-action expand-control rounded-xl" data-action="expand" data-id={o.id} aria-expanded={String(open)} aria-label={`${open ? "Collapse" : "Expand"} ${o.number}`} onClick={() => actions.toggleExpand(o.id)}>{open ? <Minus /> : <Plus />}</Button>}
                </TableCell>
              </TableRow>
              {open && !balance ? (
                <TableRow className="children-row hover:bg-transparent">
                  <TableCell colSpan={5} className="bg-muted/60 px-4 pt-0 pb-4">
                    <div className="nested-requests overflow-hidden rounded-xl border border-border bg-card p-1.5">
                      {o.amendment ? <BusyButton className="m-2" data-action="openOrder" data-id={o.id} onRun={() => actions.openOrder(o.id)}>{`Amendment · ${o.amendment.status}`}</BusyButton> : null}
                      <RequestTable rs={rs} />
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          );
        })}
      </TableBody>
    </DataTable>
  );
}

export function CategoryTable({ o }) {
  const { state } = useData();
  const b = state.budgets.find((b) => b.id === o.budgetId);
  return (
    <DataTable containerClassName="rounded-xl border border-border">
      <TableHeader><TableRow><TableHead scope="col">Budget category</TableHead><TableHead scope="col" className="text-right">{`Order allocation ${o.currency}`}</TableHead><TableHead scope="col" className="text-right">USD equivalent</TableHead></TableRow></TableHeader>
      <TableBody>
        {o.allocations.map((a, i) => (
          <TableRow key={i}><TableCell>{b?.categories.find((c) => c.id === a.categoryId)?.name || a.categoryId}</TableCell><TableCell className="text-right">{fmt(a.amount)}</TableCell><TableCell className="text-right">{fmt(a.amount / o.rate)}</TableCell></TableRow>
        ))}
      </TableBody>
    </DataTable>
  );
}

export function ReviewHistory({ history = [] }) {
  return (
    <RegionLabel.Provider value="Review history">
      <section className="detail-section mt-7 grid gap-3">
        <h3 className="text-[15px] font-bold">Review history</h3>
        {history.length ? (
          <DataTable containerClassName="rounded-xl border border-border">
            <TableHeader><TableRow><TableHead scope="col">Stage / Action</TableHead><TableHead scope="col">Name</TableHead><TableHead scope="col">Date / Time</TableHead><TableHead scope="col">Reason</TableHead></TableRow></TableHeader>
            <TableBody>
              {history.map((h, i) => <TableRow key={i}><TableCell>{`${text(h.stage)} · ${text(h.action)}`}</TableCell><TableCell>{h.by}</TableCell><TableCell className="whitespace-nowrap">{date(h.at)}</TableCell><TableCell>{h.reason || "—"}</TableCell></TableRow>)}
            </TableBody>
          </DataTable>
        ) : <Help>No review actions recorded yet.</Help>}
      </section>
    </RegionLabel.Provider>
  );
}
