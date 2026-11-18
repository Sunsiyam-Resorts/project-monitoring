// Pieces shared by the record dialogs: amendments, budget versions and document references.
import { budgetAmount, stageActor } from "../domain/domain.js";
import { DataTable, Detail, DetailGrid, FileList, Help, RegionLabel, text } from "../components/ui.jsx";
import { ActionRow, DecisionPanel, DetailSection, MoreDetails, Notice, SectionTitle } from "../components/detail.jsx";
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "../components/tables.jsx";
import { CategoryTable, ReviewHistory } from "../components/Records.jsx";
import { date, fmt } from "../lib/format.js";
import { nameOf } from "../lib/selectors.js";
import { useApp, useData } from "../lib/store.js";
import { Button } from "@/components/ui/button";

export function Warnings({ list }) {
  return list.map((w, i) => <Notice key={i} tone="warning">{w}</Notice>);
}

export function AmendmentView({ o }) {
  const { actions } = useApp();
  const { state, user } = useData();
  const m = o.amendment, review = stageActor(user, m);
  return (
    <RegionLabel.Provider value={`Proposed amendment · ${text(m.status)}`}>
      <DecisionPanel title={`Proposed amendment · ${text(m.status)}`} note={m.reason} className="grid gap-4">
        <DetailGrid>
          {["total", "po", "invoice", "description"].map((k) => <Detail key={k} label={k}><span className="secondary text-muted-foreground">{text(o[k])}</span>{` → ${text(m.data[k])}`}</Detail>)}
        </DetailGrid>
        <p className="text-xs">{`Supplier: ${nameOf(state, "suppliers", m.data.supplierId)} · Budget: ${nameOf(state, "budgets", m.data.budgetId)}`}</p>
        <CategoryTable o={m.data} />
        <FileList files={m.data.files} kind="amendment" id={o.id} />
        <ReviewHistory history={m.history} />
        <Help>Effective details stay unchanged until Finance approves the amendment.</Help>
        {review ? (
          <ActionRow className="mt-0">
            <Button data-action="amendApprove" data-id={o.id} onClick={() => actions.amendApprove(o.id)}>Approve amendment</Button>
            <Button variant="outline" data-action="amendReturn" data-id={o.id} onClick={() => actions.reasonForm(o.id, "amendReturn")}>Return to requester</Button>
            <Button variant="destructive" data-action="amendReject" data-id={o.id} onClick={() => actions.reasonForm(o.id, "amendReject")}>Reject amendment</Button>
          </ActionRow>
        ) : null}
      </DecisionPanel>
    </RegionLabel.Provider>
  );
}

function AmendmentDetails({ o, data, title, kind, version, side }) {
  const { state } = useData();
  if (!data) return null;
  return (
    <RegionLabel.Provider value="Data table">
      <DetailSection title={title} className="mt-3 pt-4">
        <DetailGrid>
          <Detail label="Supplier">{nameOf(state, "suppliers", data.supplierId)}</Detail>
          <Detail label="PO">{text(data.po)}</Detail>
          <Detail label="Invoice">{data.invoice || "—"}</Detail>
          <Detail label="Approved budget">{nameOf(state, "budgets", data.budgetId)}</Detail>
          <Detail label="Full order amount">{`${text(data.currency)} ${fmt(data.total)}`}</Detail>
          <Detail label="Saved exchange rate">{`1 USD = ${fmt(data.rate)} ${text(data.currency)}`}</Detail>
        </DetailGrid>
        <p className="text-[13px]">{data.description}</p>
        <CategoryTable o={data} />
        <SectionTitle as="h4" className="text-[13px]">Supporting documents</SectionTitle>
        {data.files?.length ? <FileList files={data.files} kind={kind} id={o.id} version={version} side={side} /> : <Help>No supporting documents recorded.</Help>}
      </DetailSection>
    </RegionLabel.Provider>
  );
}

export function AmendmentHistory({ o }) {
  const versions = [
    ...(o.amendments || []).map((m) => ({ m, kind: "amendment-history", status: "Approved" })),
    ...(o.amendmentAttempts || []).map((m) => ({ m, kind: "amendment-attempt", status: m.status === "Draft" ? "Returned for correction" : m.status })),
  ].sort((a, b) => (b.m.createdAt || "").localeCompare(a.m.createdAt || ""));
  if (!versions.length) return null;
  return (
    <MoreDetails title="Amendment history" count={versions.length}>
      {versions.map(({ m, kind, status }, i) => (
        <MoreDetails key={i} title={`${text(status)} · ${date(m.createdAt)}`} className="mt-0 pl-2">
          <p className="text-[13px]">{m.reason}</p>
          {m.approvedAt ? <p className="text-xs text-muted-foreground">{`Effective from ${date(m.approvedAt)}`}</p> : null}
          <AmendmentDetails o={o} data={m.previous} title="Previous effective details" kind={kind} version={m.id} side="previous" />
          <AmendmentDetails o={o} data={m.data} title={status === "Approved" ? "Approved details" : "Proposed details"} kind={kind} version={m.id} side="data" />
          <ReviewHistory history={m.history} />
        </MoreDetails>
      ))}
    </MoreDetails>
  );
}

export function BudgetHistory({ budget }) {
  if (!budget?.revisions?.length) return null;
  return (
    <MoreDetails title="Previous budget versions" count={budget.revisions.length}>
      {budget.revisions.map((v, i) => {
        const currency = v.currency || "USD", rate = v.rate || 1;
        const heading = `${date(v.at)} · ${text(v.by)}`;
        return (
          <RegionLabel.Provider key={i} value={heading}>
            <DetailSection title={heading} className="mt-2 pt-4">
              <p className="text-[13px]">{v.reason}</p>
              <p className="text-xs text-muted-foreground">{`Saved exchange rate: 1 USD = ${fmt(rate)} ${currency}`}</p>
              <DataTable containerClassName="rounded-xl border border-border">
                <TableHeader><TableRow><TableHead scope="col">Category</TableHead><TableHead scope="col" className="text-right">{`Approved ${currency}`}</TableHead><TableHead scope="col" className="text-right">USD equivalent</TableHead></TableRow></TableHeader>
                <TableBody>{v.categories.map((c, j) => <TableRow key={j}><TableCell>{c.name}</TableCell><TableCell className="text-right">{`${currency} ${fmt(c.amount)}`}</TableCell><TableCell className="text-right">{`USD ${fmt(c.amount / rate)}`}</TableCell></TableRow>)}</TableBody>
                <TableFooter><TableRow><TableCell>Total</TableCell><TableCell className="text-right">{`${currency} ${fmt(v.categories.reduce((n, c) => n + Number(c.amount), 0))}`}</TableCell><TableCell className="text-right">{`USD ${fmt(budgetAmount(v))}`}</TableCell></TableRow></TableFooter>
              </DataTable>
            </DetailSection>
          </RegionLabel.Provider>
        );
      })}
    </MoreDetails>
  );
}

export function SupportingReferences({ o, r }) {
  const groups = [["Order supporting", o.files], ["Additional supporting", r.files], ["Payment evidence", r.payment?.files]];
  return (
    <DetailSection title="Supporting document references">
      <p className="text-[13px]">{`Order reference: ${text(o.number)}`}</p>
      {groups.map(([label, files]) => [
        <SectionTitle key={label + ":h"} as="h4" className="text-[13px]">{label}</SectionTitle>,
        files?.length ? <ul key={label} className="list-disc pl-5 text-[13px]">{files.map((f, i) => <li key={i}>{f.name}</li>)}</ul> : <Help key={label}>None recorded.</Help>,
      ])}
    </DetailSection>
  );
}
