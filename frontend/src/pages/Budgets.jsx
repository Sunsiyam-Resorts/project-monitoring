import { budgetAmount, categoryUsed, isFinanceAdmin } from "../domain/domain.js";
import { Icon } from "../components/Icon.jsx";
import { Empty, PageHeader, RegionLabel } from "../components/ui.jsx";
import { SegmentBar } from "../components/Charts.jsx";
import { DashboardTable } from "./Dashboard.jsx";
import { fmt, shortDate } from "../lib/format.js";
import { nameOf } from "../lib/selectors.js";
import { useApp, useAppState, useData } from "../lib/store.js";

// Amounts below half a cent read as zero; negative amounts (over budget) are flagged.
const amount = (v) => (Math.abs(v) < 0.005 ? fmt(0) : v < 0 ? <span className="negative">{fmt(v)}</span> : fmt(v));
const pct = (used, approved) => (approved > 0 ? Math.round((used / approved) * 100) : null);

// One approved budget: its figures in USD, utilized against available, and each category.
function BudgetCard({ b, canManage }) {
  const { actions } = useApp();
  const { state } = useData();
  const rows = b.categories.map((c) => {
    const approved = c.amount / (b.rate || 1), used = categoryUsed(state, b.id, c.id);
    return { c, approved, used, available: approved - used };
  });
  const approved = budgetAmount(b), used = rows.reduce((a, x) => a + x.used, 0), available = approved - used;
  const share = pct(used, approved);
  const last = (b.revisions || []).at(-1);
  const currency = b.currency || "USD";
  return (
    <section className="panel flush budget-card" aria-labelledby={`budget-${b.id}`}>
      <header className="card-head">
        <div>
          <h2 id={`budget-${b.id}`}>{b.name}</h2>
          <small>{`${nameOf(state, "projects", b.projectId)} · ${nameOf(state, "companies", b.companyId)}`}</small>
        </div>
        {canManage ? <button data-action="editBudget" data-id={b.id} onClick={() => actions.editBudget(b.id)}>Edit / Revise</button> : null}
      </header>
      <dl className="budget-figures">
        <div><dt>Approved Budget</dt><dd>{fmt(approved)}</dd></div>
        <div><dt>Budget Utilized</dt><dd>{fmt(used)}</dd></div>
        <div><dt>Available Budget</dt><dd>{amount(available)}</dd></div>
        <div><dt>Utilized</dt><dd>{share === null ? "—" : `${share}%`}</dd></div>
      </dl>
      <div className="budget-bar">
        <SegmentBar label={`${b.name}: utilized USD ${fmt(used)} of USD ${fmt(approved)} approved`}
          max={approved} parts={[{ key: "paid", value: used, title: `Utilized: USD ${fmt(used)}` }]} />
        <p className="help">
          {`USD · ${currency === "USD" ? "approved in USD" : `approved in ${currency} at ${fmt(b.rate)} per USD 1`}`}
          {available < -0.005 ? <span className="negative">{` · Over budget by USD ${fmt(-available)}; inform Finance`}</span> : null}
          {last ? ` · ${b.revisions.length} ${b.revisions.length === 1 ? "revision" : "revisions"}, last ${shortDate(String(last.at).slice(0, 10))}` : " · No revisions"}
        </p>
      </div>
      {rows.length ? (
        <DashboardTable headings={["Category", "Approved", "Utilized", "Available", "Utilized %"]}>
          {rows.map(({ c, approved: a, used: u, available: v }) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td className="right">{amount(a)}</td>
              <td className="right">{amount(u)}</td>
              <td className="right">{amount(v)}</td>
              <td className="right">{pct(u, a) === null ? "—" : `${pct(u, a)}%`}</td>
            </tr>
          ))}
        </DashboardTable>
      ) : <Empty title="No categories" note="Add categories to this budget in Master Data." />}
    </section>
  );
}

// Budgets: every approved budget in the selected company, largest first.
export function Budgets() {
  const { actions } = useApp();
  const { state, user } = useData();
  const { company, budgetSearch } = useAppState();
  const canManage = isFinanceAdmin(user);
  const q = budgetSearch.trim().toLowerCase();
  const all = state.budgets.filter((b) => !company || b.companyId === company);
  const shown = all
    .filter((b) => !q || [b.name, nameOf(state, "projects", b.projectId), nameOf(state, "companies", b.companyId)].join(" ").toLowerCase().includes(q))
    .sort((x, y) => budgetAmount(y) - budgetAmount(x));
  return (
    <>
      <PageHeader eyebrow="PORTFOLIO" title="Budgets" description="Each approved budget with what is utilized and still available, by category."
        actions={canManage ? <button className="primary" data-action="newBudget" onClick={() => actions.newBudget()}><Icon name="plus" />Add budget</button> : null} />
      <div className="list-toolbar">
        <div className="searchbox"><Icon name="search" /><input id="budgetSearch" value={budgetSearch} onChange={(e) => actions.setSearch("budgetSearch", e.target.value)} aria-label="Search budgets" placeholder="Search budget, project or company" /></div>
        <small>{`${shown.length} of ${all.length} budgets · amounts in USD`}</small>
      </div>
      {shown.length ? (
        <RegionLabel.Provider value="Budget categories">
          <div className="budget-list">{shown.map((b) => <BudgetCard key={b.id} b={b} canManage={canManage} />)}</div>
        </RegionLabel.Provider>
      ) : (
        <section className="panel">
          {all.length ? <Empty title="No matching budgets" note="Try a different budget, project or company name." /> : <Empty title="No budgets in this view" note={canManage ? "Add the first approved budget." : "Choose another company to see its budgets."} />}
        </section>
      )}
    </>
  );
}
