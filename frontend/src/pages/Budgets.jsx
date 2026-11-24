import { budgetAmount, categoryUsed, masterKinds } from "../domain/domain.js";
import { Icon } from "../components/Icon.jsx";
import { Empty, Help, PageHeader, RegionLabel } from "../components/ui.jsx";
import { FiguresTable, TableCell, TableRow } from "../components/tables.jsx";
import { ListToolbar, SearchBox } from "../components/Toolbar.jsx";
import { SegmentBar } from "../components/Charts.jsx";
import { fmt, shortDate } from "../lib/format.js";
import { nameOf } from "../lib/selectors.js";
import { useApp, useAppState, useData } from "../lib/store.js";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Amounts below half a cent read as zero; negative amounts (over budget) are flagged.
const amount = (v) => (Math.abs(v) < 0.005 ? fmt(0) : v < 0 ? <span className="negative font-semibold text-danger">{fmt(v)}</span> : fmt(v));
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
  const figures = [["Approved Budget", fmt(approved)], ["Budget Utilized", fmt(used)], ["Available Budget", amount(available)], ["Utilized", share === null ? "—" : `${share}%`]];
  return (
    <Card className="budget-card gap-0 overflow-hidden py-0" aria-labelledby={`budget-${b.id}`}>
      <CardHeader className="card-head px-6 pt-5 pb-4">
        <CardTitle id={`budget-${b.id}`}>{b.name}</CardTitle>
        <CardDescription className="mt-1">{`${nameOf(state, "projects", b.projectId)} · ${nameOf(state, "companies", b.companyId)}`}</CardDescription>
        {canManage ? <CardAction><Button variant="outline" size="sm" data-action="editBudget" data-id={b.id} onClick={() => actions.editBudget(b.id)}>Edit / Revise</Button></CardAction> : null}
      </CardHeader>
      <dl className="budget-figures grid grid-cols-4 px-6 pt-1 max-md:grid-cols-2 max-md:gap-y-3.5">
        {figures.map(([label, value], i) => (
          <div key={label} className={i ? "border-l border-border pl-5 max-md:[&:nth-child(3)]:border-l-0 max-md:[&:nth-child(3)]:pl-0" : ""}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-display text-2xl leading-tight font-semibold tracking-[-0.02em] whitespace-nowrap tabular max-md:text-xl">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="budget-bar px-6 pt-4 pb-4.5">
        <SegmentBar label={`${b.name}: utilized USD ${fmt(used)} of USD ${fmt(approved)} approved`} max={approved}
          parts={[{ key: "paid", value: used, title: `Utilized: USD ${fmt(used)}` }]} />
        <Help className="mt-2">
          {`USD · ${currency === "USD" ? "approved in USD" : `approved in ${currency} at ${fmt(b.rate)} per USD 1`}`}
          {available < -0.005 ? <span className="negative font-semibold text-danger">{` · Over budget by USD ${fmt(-available)}; inform Finance`}</span> : null}
          {last ? ` · ${b.revisions.length} ${b.revisions.length === 1 ? "revision" : "revisions"}, last ${shortDate(String(last.at).slice(0, 10))}` : " · No revisions"}
        </Help>
      </div>
      {rows.length ? (
        <div className="border-t border-border">
          <FiguresTable headings={["Category", "Approved", "Utilized", "Available", "Utilized %"]}>
            {rows.map(({ c, approved: a, used: u, available: v }) => (
              <TableRow key={c.id}>
                <TableCell>{c.name}</TableCell>
                <TableCell className="text-right">{amount(a)}</TableCell>
                <TableCell className="text-right">{amount(u)}</TableCell>
                <TableCell className="text-right">{amount(v)}</TableCell>
                <TableCell className="text-right">{pct(u, a) === null ? "—" : `${pct(u, a)}%`}</TableCell>
              </TableRow>
            ))}
          </FiguresTable>
        </div>
      ) : <Empty title="No categories" note="Add categories to this budget in Master Data." />}
    </Card>
  );
}

// Budgets: every approved budget in the selected company, largest first.
export function Budgets() {
  const { actions } = useApp();
  const { state, user } = useData();
  const { company, budgetSearch } = useAppState();
  const canManage = masterKinds(user).includes("budgets");
  const q = budgetSearch.trim().toLowerCase();
  const all = state.budgets.filter((b) => !company || b.companyId === company);
  const shown = all
    .filter((b) => !q || [b.name, nameOf(state, "projects", b.projectId), nameOf(state, "companies", b.companyId)].join(" ").toLowerCase().includes(q))
    .sort((x, y) => budgetAmount(y) - budgetAmount(x));
  return (
    <>
      <PageHeader title="Budgets" description="Each approved budget with what is utilized and still available, by category."
        actions={canManage ? <Button data-action="newBudget" onClick={() => actions.newBudget()}><Icon name="plus" />Add budget</Button> : null} />
      <ListToolbar>
        <SearchBox id="budgetSearch" label="Search budgets" placeholder="Search budget, project or company" value={budgetSearch} onChange={(v) => actions.setSearch("budgetSearch", v)} />
        <small className="text-xs text-muted-foreground">{`${shown.length} of ${all.length} budgets · amounts in USD`}</small>
      </ListToolbar>
      {shown.length ? (
        <RegionLabel.Provider value="Budget categories">
          <div className="budget-list grid gap-4">{shown.map((b) => <BudgetCard key={b.id} b={b} canManage={canManage} />)}</div>
        </RegionLabel.Provider>
      ) : (
        <Card className="py-0">
          {all.length ? <Empty title="No matching budgets" note="Try a different budget, project or company name." /> : <Empty title="No budgets in this view" note={canManage ? "Add the first approved budget." : "Choose another company to see its budgets."} />}
        </Card>
      )}
    </>
  );
}
