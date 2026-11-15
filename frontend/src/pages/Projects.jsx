import { isFinanceAdmin, kpis, projectProgress } from "../domain/domain.js";
import { Icon } from "../components/Icon.jsx";
import { Empty, PageHeader } from "../components/ui.jsx";
import { ProgressBar } from "../components/Activity.jsx";
import { fmt } from "../lib/format.js";
import { nameOf } from "../lib/selectors.js";
import { useApp, useAppState, useData } from "../lib/store.js";

// Projects: every visible project as a card with its task progress and budget position.
export function Projects() {
  const { actions } = useApp();
  const { state, user } = useData();
  const { company, projectSearch } = useAppState();
  const q = projectSearch.trim().toLowerCase();
  const all = state.projects.filter((p) => !company || p.companyId === company);
  const ps = all.filter((p) => !q || [p.name, p.code, nameOf(state, "companies", p.companyId)].join(" ").toLowerCase().includes(q));
  return (
    <>
      <PageHeader eyebrow="PORTFOLIO" title="Projects" description="Progress from each project’s tasks, beside its budget position."
        actions={isFinanceAdmin(user) ? <button className="primary" data-action="newProject" onClick={() => actions.newProject()}><Icon name="plus" />Add project</button> : null} />
      <div className="list-toolbar">
        <div className="searchbox"><Icon name="search" /><input id="projectSearch" value={projectSearch} onChange={(e) => actions.setSearch("projectSearch", e.target.value)} aria-label="Search projects" placeholder="Search project, code or company" /></div>
        <small>{`${ps.length} of ${all.length} projects · budgets in USD`}</small>
      </div>
      {ps.length ? (
        <div className="project-grid">
          {ps.map((p) => {
            const g = projectProgress(state, p.id), k = kpis(state, p.companyId, p.id);
            // The whole card opens the project; the title button is its keyboard stop.
            return (
              <article key={p.id} className="panel project-card" data-action="openProject" data-id={p.id} onClick={() => actions.openProject(p.id)}>
                <div className="project-card-head">
                  <div><h2><button className="project-link" data-action="openProject" data-id={p.id}>{p.name}</button></h2><p>{nameOf(state, "companies", p.companyId) + (p.code ? " · " + p.code : "")}</p></div>
                  <b className="project-pct">{g.pct === null ? "—" : <>{g.pct}<span>%</span></>}</b>
                </div>
                <ProgressBar g={g} />
                <div className="project-foot">
                  <span>{g.total ? `${g.done} of ${g.total} done` : "No tasks yet"}{g.overdue ? <>{" · "}<span className="project-late"><Icon name="clock" />{`${g.overdue} overdue`}</span></> : null}</span>
                  <span><strong>{fmt(k.available)}</strong> available</span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="panel">
          {all.length ? <Empty title="No matching projects" note="Try a different name, code or company." /> : <Empty title="No projects in this view" note="Choose another company to see its projects." />}
        </section>
      )}
    </>
  );
}
