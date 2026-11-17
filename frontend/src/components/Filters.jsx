// Scope filters. compact (Dashboard): the Project label is for screen readers only, the
// blank option reads "All projects", and there is no Clear filters link.
import { Icon } from "./Icon.jsx";
import { Options } from "./ui.jsx";
import { useApp, useAppState, useData } from "../lib/store.js";

const STATUSES = ["Draft", "Finance", "On Hold", "Paid", "Rejected", "Documents Required"].map((x) => ({ id: x, name: x }));

export function Filters({ dates = false, actions: extraActions = null, compact = false }) {
  const { actions } = useApp();
  const { state } = useData();
  const { company, project, from, to, statusFilter, filtersExpanded } = useAppState();
  const extra = Boolean(from || to || statusFilter);
  const change = (e) => actions.setFilter(e.target.id, e.target.value);
  return (
    <div className="filters">
      <div>
        <label htmlFor="project" className={compact ? "sr-only" : undefined}>Project</label>
        <select id="project" value={project} onChange={change}>
          <Options items={state.projects.filter((p) => !company || p.companyId === company)} blank={compact ? "All projects" : "All"} />
        </select>
      </div>
      {dates ? (
        <>
          <button data-action="toggleFilters" aria-expanded={String(filtersExpanded)} aria-controls="extraFilters" onClick={() => actions.toggleFilters()}>
            <Icon name="filter" />Filters{extra ? <span className="count">Active</span> : null}
          </button>
          <div className="advanced-filters wide" id="extraFilters" hidden={!filtersExpanded}>
            <div><label htmlFor="from">Request date · From</label><input id="from" type="date" value={from} onChange={change} /></div>
            <div><label htmlFor="to">To</label><input id="to" type="date" value={to} onChange={change} /></div>
            <div><label htmlFor="statusFilter">Status</label><select id="statusFilter" value={statusFilter} onChange={change}><Options items={STATUSES} blank="All" /></select></div>
          </div>
        </>
      ) : null}
      <div className="filter-end"><span className="currency-label">Reporting currency <strong>USD</strong></span></div>
      {!compact && (company || project || extra) ? <button className="linkbtn" data-action="clearFilters" onClick={() => actions.clearFilters()}>Clear filters</button> : null}
      {extraActions}
    </div>
  );
}
