// View Payment Request: the printable A4 document. Print / Save as PDF uses the browser.
import { parentAmount } from "../domain/domain.js";
import { Icon } from "../components/Icon.jsx";
import { Badge, BusyButton, DataTable, Detail, DetailGrid, text } from "../components/ui.jsx";
import { ActionRow, SectionTitle } from "../components/detail.jsx";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/tables.jsx";
import { CategoryTable, ReviewHistory } from "../components/Records.jsx";
import { date, fmt, shortDate } from "../lib/format.js";
import { nameOf } from "../lib/selectors.js";
import { useApp, useData } from "../lib/store.js";
import { Button } from "@/components/ui/button";
import { Modal } from "./ModalHost.jsx";
import { SupportingReferences } from "./parts.jsx";

const BOXED = "rounded-xl border border-border";

export function DocumentView({ id, generatedAt }) {
  const { actions } = useApp();
  const { state, demo } = useData();
  const r = state.requests.find((r) => r.id === id);
  const o = r && state.orders.find((o) => o.id === r.orderId);
  if (!r || !o) return null;
  const prior = state.requests.filter((x) => x.orderId === o.id && x.id !== r.id && x.status === "Paid").reduce((a, x) => a + parentAmount(x), 0);
  const currency = r.currency || o.currency;
  return (
    <Modal title="View Payment Request">
      <ActionRow className="noprint mt-0 mb-5">
        <Button data-action="print" onClick={() => actions.print()}><Icon name="print" />Print / Save as PDF</Button>
        <BusyButton data-action="openRequest" data-id={id} onRun={() => actions.openRequest(id)}>Back to request</BusyButton>
      </ActionRow>
      <article className="printdoc grid gap-4 rounded-xl border border-border p-8 text-[12px] leading-normal max-sm:p-5">
        <div className="docbrand"><img src="/logo.svg" alt="Sun Siyam" width="94" height="75" className="h-[75px] w-[94px] object-contain object-left" /></div>
        <small className="text-[10px] font-semibold tracking-[0.13em] text-muted-foreground">GROUP PROJECT MONITORING</small>
        <h1 className="font-display text-2xl font-bold tracking-[0.02em]">PAYMENT REQUEST</h1>
        <div className="detail-top flex items-center justify-between gap-4 border-y border-border py-3"><strong className="text-[15px]">{r.number}</strong><Badge status={r.status} /></div>
        <DetailGrid>
          <Detail label="Company">{nameOf(state, "companies", o.companyId)}</Detail>
          <Detail label="Project">{nameOf(state, "projects", o.projectId)}</Detail>
          <Detail label="Date">{shortDate(r.date)}</Detail>
          <Detail label="Supplier">{nameOf(state, "suppliers", o.supplierId)}</Detail>
          <Detail label="PO number">{text(o.po)}</Detail>
          <Detail label="Invoice number">{o.invoice || "—"}</Detail>
          <Detail label="Order currency">{`${o.currency}`}</Detail>
          <Detail label="Payment currency">{`${currency}`}</Detail>
          <Detail label="Saved payment rate">{`1 USD = ${fmt(r.rate)} ${currency}`}</Detail>
          <Detail label="Approved budget">{nameOf(state, "budgets", o.budgetId)}</Detail>
        </DetailGrid>
        <SectionTitle className="mt-2">Description</SectionTitle>
        <p className="text-[13px]">{o.description}</p>
        <CategoryTable o={o} />
        <DataTable containerClassName={BOXED}>
          <TableBody>
            <TableRow><TableCell>Full order amount</TableCell><TableCell className="text-right">{`${o.currency} ${fmt(o.total)}`}</TableCell></TableRow>
            <TableRow><TableCell>Other instalments paid to date</TableCell><TableCell className="text-right">{`${o.currency} ${fmt(prior)}`}</TableCell></TableRow>
            <TableRow><TableCell><strong>{`This payment request · ${r.percent}% at creation`}</strong></TableCell><TableCell className="text-right"><strong>{`${currency} ${fmt(r.amount)}`}</strong></TableCell></TableRow>
            <TableRow><TableCell>Payment terms</TableCell><TableCell className="whitespace-normal">{text(r.terms)}</TableCell></TableRow>
          </TableBody>
        </DataTable>
        <SectionTitle className="mt-2">Request & payment · this payment request only</SectionTitle>
        <DataTable containerClassName={BOXED}>
          <TableHeader><TableRow><TableHead scope="col">Stage</TableHead><TableHead scope="col">Name</TableHead><TableHead scope="col">Date / Time</TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow><TableCell>Requested by</TableCell><TableCell>{nameOf(state, "users", r.requestedBy)}</TableCell><TableCell>{date(r.createdAt)}</TableCell></TableRow>
            {r.approvals.map((x, i) => <TableRow key={i}><TableCell>{x.stage === "Reviewer" ? "Checked by" : text(x.stage)}</TableCell><TableCell>{text(x.by)}</TableCell><TableCell>{date(x.at)}</TableCell></TableRow>)}
            {r.finalApprovedAt ? <TableRow><TableCell>Submitted to Finance</TableCell><TableCell>{nameOf(state, "users", r.requestedBy)}</TableCell><TableCell>{date(r.finalApprovedAt)}</TableCell></TableRow> : null}
            {r.payment ? <TableRow><TableCell>Paid by</TableCell><TableCell>{text(r.payment.by)}</TableCell><TableCell>{`${shortDate(r.payment.date)} · ${r.payment.type}`}</TableCell></TableRow> : null}
          </TableBody>
        </DataTable>
        {r.remarks.length ? (
          <>
            <SectionTitle className="mt-2">Finance remarks</SectionTitle>
            {r.remarks.map((m, i) => <p key={i} className="text-[13px]">{`${text(m.text)} — ${text(m.by)}`}</p>)}
          </>
        ) : null}
        <SupportingReferences o={o} r={r} />
        <ReviewHistory history={r.history} />
        <div className="docfooter mt-4 border-t border-border pt-3 text-[10px] text-muted-foreground">{`System-generated document · ${r.number} · Generated ${date(generatedAt)}${demo ? " · DEMO SAMPLE — FOR TESTING ONLY" : ""}`}</div>
      </article>
    </Modal>
  );
}

