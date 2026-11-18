import { currencyStats, categoryUsed, kpis } from "../domain/domain.js";
import { Icon } from "../components/Icon.jsx";
import { Disclosure, Empty, Help, PageHeader, RegionLabel } from "../components/ui.jsx";
import { FiguresTable, Sub, TableCell, TableFooter, TableRow, amountCells } from "../components/tables.jsx";
import { Filters } from "../components/Filters.jsx";
import { Overview } from "../components/Overview.jsx";
import { ActivityCard } from "../components/Activity.jsx";
import { SegmentBar, SegmentKey } from "../components/Charts.jsx";
import { fmt, word } from "../lib/format.js";
import { nameOf } from "../lib/selectors.js";
import { useApp, useAppState, useData } from "../lib/store.js";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge as ShadcnBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PAYMENT_PARTS = [["paid", "Paid"], ["outstanding", "Outstanding Payments"], ["hold", "On Hold"], ["balance", "Balance Payments Pending"]];

// Kept for the pages that import the figures table from here.
export const DashboardTable = FiguresTable;

// Shortcut tiles (shadcn Button, large): Budgets is the green call to action.
function Shortcut({ primary = false, children, ...rest }) {
  return (
    <Button variant={primary ? "default" : "secondary"} {...rest}
      className={cn("action-tile relative h-auto min-h-[120px] items-start justify-start rounded-xl border-0 p-4 pb-11 text-left font-display text-[clamp(16px,2.2cqi,26px)] leading-[1.05] font-extrabold tracking-[-0.025em] whitespace-normal",
        !primary && "bg-muted hover:bg-accent dark:bg-secondary dark:hover:bg-secondary-hover", primary && "primary")}>
      {children}
      <Icon name="arrow" className="absolute right-4 bottom-4" />
    </Button>
  );
}

export function Dashboard() {
  const { actions } = useApp();
  const { state } = useData();
  const { company, project } = useAppState();
  const k = kpis(state, company, project);
  const ps = state.projects.filter((p) => (!company || p.companyId === company) && (!project || p.id === project));
  const completion = k.utilized ? Math.round((k.paid / k.utilized) * 100) : 0;
  const companies = state.companies.filter((c) => !company || c.id === company);
  const currencies = currencyStats(state, company, project);
  const categoryRows = state.budgets
    .filter((b) => (!company || b.companyId === company) && (!project || b.projectId === project))
    .flatMap((b) => b.categories.map((c) => ({ b, c })));
  const activity = state.audit
    .filter((a) => (!company || a.companyId === company) &&
      (!project || state.orders.some((o) => o.projectId === project && (o.id === a.entity || state.requests.some((r) => r.orderId === o.id && r.id === a.entity)))))
    .sort((x, y) => Date.parse(y.at) - Date.parse(x.at)).slice(0, 6);
  const metrics = (x) => [x.budget, x.utilized, x.available, x.paid, x.outstanding, x.balance, x.hold];
  const summary = (items, heading) => (
    <FiguresTable headings={[heading, "Approved Budget", "Utilized", "Available"]}>
      {items.map((item, i) => {
        const x = kpis(state, item.companyId, item.projectId);
        return <TableRow key={i}><TableCell>{item.name}{item.sub ? <Sub>{item.sub}</Sub> : null}</TableCell>{amountCells([x.budget, x.utilized, x.available])}</TableRow>;
      })}
    </FiguresTable>
  );

  return (
    <>
      <PageHeader title="Project dashboard" description="Your budgets, commitments and payments at a glance." />
      <Filters compact actions={<Button variant="outline" className="filter-action" data-action="export" onClick={() => actions.exportSummary()}><Icon name="download" />Export summary</Button>} />
      <Overview company={company} project={project} after={
        <Card className="workspace-actions grid grid-cols-3 gap-3 p-3 [container-type:inline-size]" aria-label="Shortcuts">
          <Shortcut data-action="queue" data-target="Finance" onClick={() => actions.queue("Finance")}>Finance payments</Shortcut>
          <Shortcut data-page="projects" onClick={() => actions.navigate("projects")}>Projects</Shortcut>
          <Shortcut primary data-page="budgets" onClick={() => actions.navigate("budgets")}>Budgets</Shortcut>
        </Card>
      } />
      <RegionLabel.Provider value="Project Financial Overview">
        <Card className="mt-6 gap-0 py-0">
          <CardHeader className="section-title flex items-start justify-between gap-4 px-6 pt-6 pb-4">
            <div><CardTitle>Project Financial Overview</CardTitle><CardDescription className="help mt-1">{`${ps.length} project${ps.length === 1 ? "" : "s"} · consolidated in USD`}</CardDescription></div>
            <ShadcnBadge className="unit-label rounded-full px-2.5">USD</ShadcnBadge>
          </CardHeader>
          {ps.length ? (
            <FiguresTable headings={["Project / Company", "Approved Budget", "Utilized", "Available", "Paid", "Outstanding Payments", "Balance Payments Pending", "On Hold"]}
              footer={<TableFooter><TableRow className="total-row hover:bg-transparent"><TableCell>Total</TableCell>{amountCells(metrics(k))}</TableRow></TableFooter>}>
              {ps.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Button variant="link" className="linkbtn" data-action="openProject" data-id={p.id} onClick={() => actions.openProject(p.id)}>{p.name}</Button>
                    <Sub>{nameOf(state, "companies", p.companyId)}</Sub>
                  </TableCell>
                  {amountCells(metrics(kpis(state, p.companyId, p.id)))}
                </TableRow>
              ))}
            </FiguresTable>
          ) : <Empty title="No projects in this view" note="Choose another company or project to see its financial position." />}
        </Card>
      </RegionLabel.Provider>
      <div className="dashboard-bottom mt-6 grid grid-cols-[minmax(0,1fr)_minmax(320px,0.46fr)] items-start gap-4 max-xl:grid-cols-1">
        <RegionLabel.Provider value="Explore the details">
          <Card className="explore-card gap-0 overflow-hidden py-0" aria-labelledby="exploreTitle">
            <CardHeader className="card-head flex items-baseline justify-between px-6 pt-5 pb-4">
              <CardTitle id="exploreTitle">Explore the details</CardTitle><small className="text-xs text-muted-foreground">Expand a breakdown</small>
            </CardHeader>
            <Disclosure title="Budget Summary by Company" description="Compare approved, utilized and available budgets · USD" id="company" figure={companies.length} unit={word(companies.length, "company", "companies")}>
              {summary(companies.map((c) => ({ name: c.name, companyId: c.id, projectId: project })), "Company")}
            </Disclosure>
            <Disclosure title="Budget Summary by Project" description="A focused view of project budget balances · USD" id="project" figure={ps.length} unit={word(ps.length, "project", "projects")}>
              {summary(ps.map((p) => ({ name: p.name, sub: nameOf(state, "companies", p.companyId), companyId: p.companyId, projectId: p.id })), "Project / Company")}
            </Disclosure>
            <Disclosure title="Currency Summary" description="Original currencies and saved exchange rates" id="currency" figure={currencies.length} unit={word(currencies.length, "currency", "currencies")}>
              <FiguresTable headings={["Currency", "Approved Budget", "Utilized", "Paid", "Outstanding Payments", "On Hold"]}>
                {currencies.map((c) => <TableRow key={c.currency}><TableCell>{c.currency}</TableCell>{amountCells([c.budget, c.utilized, c.paid, c.outstanding, c.hold])}</TableRow>)}
              </FiguresTable>
              <Help className="mx-6 my-4">Budget and utilization use their original currencies; payment figures use each payment request’s currency. Saved exchange rates determine consolidated USD totals.</Help>
            </Disclosure>
            <Disclosure title="Payment Status" description="Payment completion and the remaining commitment" id="payments" figure={completion + "%"} unit="paid of utilized">
              <div className="grid gap-4 px-6 py-5">
                <div className="coverage-heading flex items-baseline gap-2.5"><strong className="font-display text-4xl leading-none font-semibold tracking-tight">{completion + "%"}</strong><span className="text-xs text-muted-foreground">Payments Completed</span></div>
                <SegmentBar label={`Budget utilized USD ${fmt(k.utilized)}: ${PAYMENT_PARTS.map(([key, label]) => `${label} USD ${fmt(k[key])}`).join("; ")}`}
                  parts={PAYMENT_PARTS.map(([key, label]) => ({ key, value: k[key], title: `${label}: USD ${fmt(k[key])}` }))} />
                <div className="divide-y divide-border">
                  {PAYMENT_PARTS.map(([key, label]) => (
                    <div key={key} className="stats-line flex items-center justify-between py-2.5 text-[13px]" data-key={key}>
                      <span className="flex items-center gap-2"><SegmentKey part={key} />{label}</span><strong className="font-semibold tabular">{`USD ${fmt(k[key])}`}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </Disclosure>
            <Disclosure title="Budget Categories" description="Review allocations and category balances · USD" id="categories" figure={categoryRows.length} unit={word(categoryRows.length, "category", "categories")}>
              <FiguresTable headings={["Category / Project", "Approved", "Utilized", "Available"]}>
                {categoryRows.map(({ b, c }) => {
                  const used = categoryUsed(state, b.id, c.id), amount = c.amount / (b.rate || 1);
                  return <TableRow key={b.id + ":" + c.id}><TableCell>{c.name}<Sub>{nameOf(state, "projects", b.projectId)}</Sub></TableCell>{amountCells([amount, used, amount - used])}</TableRow>;
                })}
              </FiguresTable>
            </Disclosure>
          </Card>
        </RegionLabel.Provider>
        <ActivityCard activity={activity} />
      </div>
    </>
  );
}
