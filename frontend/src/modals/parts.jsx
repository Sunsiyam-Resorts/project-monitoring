// Pieces shared by the record dialogs: amendments, budget versions and document references.
import { budgetAmount, stageActor } from "../domain/domain.js";
import { Detail, FileList, RegionLabel, TableWrap, text } from "../components/ui.jsx";
import { CategoryTable, ReviewHistory } from "../components/Records.jsx";
import { date, fmt } from "../lib/format.js";
import { nameOf } from "../lib/selectors.js";
import { useApp, useData } from "../lib/store.js";

export function Warnings({ list }) {
  return list.map((w, i) => <div key={i} className="notice warn">{w}</div>);
}

export function AmendmentView({ o }) {
  const { actions } = useApp();
  const { state, user } = useData();
  const m = o.amendment, review = stageActor(user, m);
  return (
    <RegionLabel.Provider value={`Proposed amendment · ${text(m.status)}`}>
      <section className="decision-panel">
        <h3>{`Proposed amendment · ${text(m.status)}`}</h3>
        <p>{m.reason}</p>
        <div className="detail-grid">
          {["total", "po", "invoice", "description"].map((k) => <Detail key={k} label={k}><span className="secondary">{text(o[k])}</span>{` → ${text(m.data[k])}`}</Detail>)}
        </div>
        <p>{`Supplier: ${nameOf(state, "suppliers", m.data.supplierId)} · Budget: ${nameOf(state, "budgets", m.data.budgetId)}`}</p>
        <CategoryTable o={m.data} />
        <FileList files={m.data.files} kind="amendment" id={o.id} />
        <ReviewHistory history={m.history} />
        <p className="help">Effective details stay unchanged until Finance approves the amendment.</p>
        {review ? (
          <div className="actions">
            <button className="primary" data-action="amendApprove" data-id={o.id} onClick={() => actions.amendApprove(o.id)}>Approve amendment</button>
            <button data-action="amendReturn" data-id={o.id} onClick={() => actions.reasonForm(o.id, "amendReturn")}>Return to requester</button>
            <button className="danger" data-action="amendReject" data-id={o.id} onClick={() => actions.reasonForm(o.id, "amendReject")}>Reject amendment</button>
          </div>
        ) : null}
      </section>
    </RegionLabel.Provider>
  );
}

function AmendmentDetails({ o, data, title, kind, version, side }) {
  const { state } = useData();
  if (!data) return null;
  return (
    <RegionLabel.Provider value="Data table">
      <section className="detail-section">
        <h4>{title}</h4>
        <div className="detail-grid">
          <Detail label="Supplier">{nameOf(state, "suppliers", data.supplierId)}</Detail>
          <Detail label="PO">{text(data.po)}</Detail>
          <Detail label="Invoice">{data.invoice || "—"}</Detail>
          <Detail label="Approved budget">{nameOf(state, "budgets", data.budgetId)}</Detail>
          <Detail label="Full order amount">{`${text(data.currency)} ${fmt(data.total)}`}</Detail>
          <Detail label="Saved exchange rate">{`1 USD = ${fmt(data.rate)} ${text(data.currency)}`}</Detail>
        </div>
        <p>{data.description}</p>
        <CategoryTable o={data} />
        <h4>Supporting documents</h4>
        {data.files?.length ? <FileList files={data.files} kind={kind} id={o.id} version={version} side={side} /> : <p className="help">No supporting documents recorded.</p>}
      </section>
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
    <details className="details-disclosure">
      <summary>Amendment history <span className="count">{versions.length}</span></summary>
      {versions.map(({ m, kind, status }, i) => (
        <details key={i} className="details-disclosure">
          <summary>{`${text(status)} · ${date(m.createdAt)}`}</summary>
          <p>{m.reason}</p>
          {m.approvedAt ? <p>{`Effective from ${date(m.approvedAt)}`}</p> : null}
          <AmendmentDetails o={o} data={m.previous} title="Previous effective details" kind={kind} version={m.id} side="previous" />
          <AmendmentDetails o={o} data={m.data} title={status === "Approved" ? "Approved details" : "Proposed details"} kind={kind} version={m.id} side="data" />
          <ReviewHistory history={m.history} />
        </details>
      ))}
    </details>
  );
}

export function BudgetHistory({ budget }) {
  if (!budget?.revisions?.length) return null;
  return (
    <details className="details-disclosure">
      <summary>Previous budget versions <span className="count">{budget.revisions.length}</span></summary>
      {budget.revisions.map((v, i) => {
        const currency = v.currency || "USD", rate = v.rate || 1;
        const heading = `${date(v.at)} · ${text(v.by)}`;
        return (
          <RegionLabel.Provider key={i} value={heading}>
            <section className="detail-section">
              <h3>{heading}</h3>
              <p>{v.reason}</p>
              <p>{`Saved exchange rate: 1 USD = ${fmt(rate)} ${currency}`}</p>
              <TableWrap>
                <table>
                  <thead><tr><th scope="col">Category</th><th scope="col" className="right">{`Approved ${currency}`}</th><th scope="col" className="right">USD equivalent</th></tr></thead>
                  <tbody>{v.categories.map((c, j) => <tr key={j}><td>{c.name}</td><td className="right">{`${currency} ${fmt(c.amount)}`}</td><td className="right">{`USD ${fmt(c.amount / rate)}`}</td></tr>)}</tbody>
                  <tfoot><tr><td>Total</td><td className="right">{`${currency} ${fmt(v.categories.reduce((n, c) => n + Number(c.amount), 0))}`}</td><td className="right">{`USD ${fmt(budgetAmount(v))}`}</td></tr></tfoot>
                </table>
              </TableWrap>
            </section>
          </RegionLabel.Provider>
        );
      })}
    </details>
  );
}

export function SupportingReferences({ o, r }) {
  const groups = [["Order supporting", o.files], ["Additional supporting", r.files], ["Payment evidence", r.payment?.files]];
  return (
    <section className="detail-section">
      <h3>Supporting document references</h3>
      <p>{`Order reference: ${text(o.number)}`}</p>
      {groups.map(([label, files]) => [
        <h4 key={label + ":h"}>{label}</h4>,
        files?.length ? <ul key={label}>{files.map((f, i) => <li key={i}>{f.name}</li>)}</ul> : <p key={label} className="help">None recorded.</p>,
      ])}
    </section>
  );
}
