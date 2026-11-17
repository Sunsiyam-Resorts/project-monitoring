import { currencyStats, categoryUsed, kpis } from "../domain/domain.js";
import { Icon } from "../components/Icon.jsx";
import { Disclosure, Empty, PageHeader, RegionLabel, TableWrap } from "../components/ui.jsx";
import { Filters } from "../components/Filters.jsx";
import { Overview } from "../components/Overview.jsx";
import { ActivityCard } from "../components/Activity.jsx";
import { SegmentBar } from "../components/Charts.jsx";
import { fmt, word } from "../lib/format.js";
import { nameOf } from "../lib/selectors.js";
import { useApp, useAppState, useData } from "../lib/store.js";

const PAYMENT_PARTS = [["paid", "Paid"], ["outstanding", "Outstanding Payments"], ["hold", "On Hold"], ["balance", "Balance Payments Pending"]];

export function DashboardTable({ headings, children, footer = null }) {
  return (
    <TableWrap className="dashboard-table">
      <table>
        <thead><tr>{headings.map((h, i) => <th key={i} scope="col" className={i ? "right" : ""}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
        {footer}
      </table>
    </TableWrap>
  );
}

// Amounts below half a cent read as zero; negative amounts are flagged.
const numbers = (values) => values.map((v, i) =>
  Math.abs(v) < 0.005 ? <td key={i} className="right zero">{fmt(0)}</td>
    : v < 0 ? <td key={i} className="right"><span className="negative">{fmt(v)}</span></td>
      : <td key={i} className="right">{fmt(v)}</td>);
const metrics = (x) => [x.budget, x.utilized, x.available, x.paid, x.outstanding, x.balance, x.hold];

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
  const summary = (items, heading) => (
    <DashboardTable headings={[heading, "Approved Budget", "Utilized", "Available"]}>
      {items.map((item, i) => {
        const x = kpis(state, item.companyId, item.projectId);
        return <tr key={i}><td>{item.name}{item.sub ? <span className="secondary">{item.sub}</span> : null}</td>{numbers([x.budget, x.utilized, x.available])}</tr>;
      })}
    </DashboardTable>
  );

  return (
    <>
      <PageHeader eyebrow="Portfolio overview" title="Project dashboard" description="Your budgets, commitments and payments at a glance." />
      <Filters compact actions={<button className="filter-action" data-action="export" onClick={() => actions.exportSummary()}><Icon name="download" />Export summary</button>} />
      <Overview company={company} project={project} after={
        <section className="panel workspace-actions" aria-label="Shortcuts">
          <button className="action-tile" data-action="queue" data-target="Finance" onClick={() => actions.queue("Finance")}>Finance payments<Icon name="arrow" /></button>
          <button className="action-tile" data-page="projects" onClick={() => actions.navigate("projects")}>Projects<Icon name="arrow" /></button>
          <button className="action-tile primary" data-page="budgets" onClick={() => actions.navigate("budgets")}>Budgets<Icon name="arrow" /></button>
        </section>
      } />
      <RegionLabel.Provider value="Project Financial Overview">
        <section className="panel flush section-gap">
          <div className="section-title"><div><h2>Project Financial Overview</h2><p className="help">{`${ps.length} project${ps.length === 1 ? "" : "s"} · consolidated in USD`}</p></div><span className="unit-label">USD</span></div>
          {ps.length ? (
            <DashboardTable headings={["Project / Company", "Approved Budget", "Utilized", "Available", "Paid", "Outstanding Payments", "Balance Payments Pending", "On Hold"]}
              footer={<tfoot><tr className="total-row"><td>Total</td>{numbers(metrics(k))}</tr></tfoot>}>
              {ps.map((p) => (
                <tr key={p.id}>
                  <td><button className="linkbtn" data-action="openProject" data-id={p.id} onClick={() => actions.openProject(p.id)}>{p.name}</button><span className="secondary">{nameOf(state, "companies", p.companyId)}</span></td>
                  {numbers(metrics(kpis(state, p.companyId, p.id)))}
                </tr>
              ))}
            </DashboardTable>
          ) : <Empty title="No projects in this view" note="Choose another company or project to see its financial position." />}
        </section>
      </RegionLabel.Provider>
      <div className="dashboard-bottom section-gap">
        <RegionLabel.Provider value="Explore the details">
          <section className="panel explore-card" aria-labelledby="exploreTitle">
            <header className="card-head"><h2 id="exploreTitle">Explore the details</h2><small>Expand a breakdown</small></header>
            <Disclosure title="Budget Summary by Company" description="Compare approved, utilized and available budgets · USD" id="company" figure={companies.length} unit={word(companies.length, "company", "companies")}>
              {summary(companies.map((c) => ({ name: c.name, companyId: c.id, projectId: project })), "Company")}
            </Disclosure>
            <Disclosure title="Budget Summary by Project" description="A focused view of project budget balances · USD" id="project" figure={ps.length} unit={word(ps.length, "project", "projects")}>
              {summary(ps.map((p) => ({ name: p.name, sub: nameOf(state, "companies", p.companyId), companyId: p.companyId, projectId: p.id })), "Project / Company")}
            </Disclosure>
            <Disclosure title="Currency Summary" description="Original currencies and saved exchange rates" id="currency" figure={currencies.length} unit={word(currencies.length, "currency", "currencies")}>
              <DashboardTable headings={["Currency", "Approved Budget", "Utilized", "Paid", "Outstanding Payments", "On Hold"]}>
                {currencies.map((c) => <tr key={c.currency}><td>{c.currency}</td>{numbers([c.budget, c.utilized, c.paid, c.outstanding, c.hold])}</tr>)}
              </DashboardTable>
              <p className="help">Budget and utilization use their original currencies; payment figures use each payment request’s currency. Saved exchange rates determine consolidated USD totals.</p>
            </Disclosure>
            <Disclosure title="Payment Status" description="Payment completion and the remaining commitment" id="payments" figure={completion + "%"} unit="paid of utilized">
              <div className="coverage-heading"><strong>{completion + "%"}</strong><span>Payments Completed</span></div>
              <SegmentBar label={`Budget utilized USD ${fmt(k.utilized)}: ${PAYMENT_PARTS.map(([key, label]) => `${label} USD ${fmt(k[key])}`).join("; ")}`}
                parts={PAYMENT_PARTS.map(([key, label]) => ({ key, value: k[key], title: `${label}: USD ${fmt(k[key])}` }))} />
              {PAYMENT_PARTS.map(([key, label]) =>
                <div key={key} className="stats-line" data-key={key}><span>{label}</span><strong>{`USD ${fmt(k[key])}`}</strong></div>)}
            </Disclosure>
            <Disclosure title="Budget Categories" description="Review allocations and category balances · USD" id="categories" figure={categoryRows.length} unit={word(categoryRows.length, "category", "categories")}>
              <DashboardTable headings={["Category / Project", "Approved", "Utilized", "Available"]}>
                {categoryRows.map(({ b, c }) => {
                  const used = categoryUsed(state, b.id, c.id), amount = c.amount / (b.rate || 1);
                  return <tr key={b.id + ":" + c.id}><td>{c.name}<span className="secondary">{nameOf(state, "projects", b.projectId)}</span></td>{numbers([amount, used, amount - used])}</tr>;
                })}
              </DashboardTable>
            </Disclosure>
          </section>
        </RegionLabel.Provider>
        <ActivityCard activity={activity} />
      </div>
    </>
  );
}
