import { isFinanceAdmin, kpis, projectProgress } from "../domain/domain.js";
import { Icon } from "../components/Icon.jsx";
import { Empty, PageHeader } from "../components/ui.jsx";
import { ListToolbar, SearchBox } from "../components/Toolbar.jsx";
import { ProgressBar } from "../components/Activity.jsx";
import { fmt } from "../lib/format.js";
import { isPlanning, nameOf } from "../lib/selectors.js";
import { useApp, useAppState, useData } from "../lib/store.js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Projects: every visible project as a card with its task progress and budget position.
export function Projects() {
  const { actions } = useApp();
  const { state, user } = useData();
  const { company, projectSearch } = useAppState();
  const q = projectSearch.trim().toLowerCase();
  const all = state.projects.filter((p) => !company || p.companyId === company);
  const planning = isPlanning(user);
  const ps = all.filter((p) => !q || [p.name, p.code, nameOf(state, "companies", p.companyId)].join(" ").toLowerCase().includes(q));
  return (
    <>
      <PageHeader title="Projects" description={planning ? "Progress from each project’s tasks." : "Progress from each project’s tasks, beside its budget position."}
        actions={isFinanceAdmin(user) ? <Button data-action="newProject" onClick={() => actions.newProject()}><Icon name="plus" />Add project</Button> : null} />
      <ListToolbar>
        <SearchBox id="projectSearch" label="Search projects" placeholder="Search project, code or company" value={projectSearch} onChange={(v) => actions.setSearch("projectSearch", v)} />
        <small className="text-xs text-muted-foreground">{`${ps.length} of ${all.length} projects${planning ? "" : " · budgets in USD"}`}</small>
      </ListToolbar>
      {ps.length ? (
        <div className="project-grid grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-4">
          {ps.map((p) => {
            const g = projectProgress(state, p.id), k = kpis(state, p.companyId, p.id);
            // The whole card opens the project; the title button is its keyboard stop.
            return (
              <Card key={p.id} className="project-card cursor-pointer gap-[18px] px-6 pt-[22px] pb-5 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-input/50 has-[.project-link:focus-visible]:ring-2 has-[.project-link:focus-visible]:ring-ring"
                data-action="openProject" data-id={p.id} onClick={() => actions.openProject(p.id)}>
                <div className="project-card-head flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-[17px] leading-snug font-semibold tracking-[-0.015em]">
                      <button className="project-link cursor-pointer text-left outline-none" data-action="openProject" data-id={p.id}>{p.name}</button>
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">{nameOf(state, "companies", p.companyId) + (p.code ? " · " + p.code : "")}</p>
                  </div>
                  <b className="project-pct font-display text-[40px] leading-[0.9] font-semibold tracking-[-0.035em] whitespace-nowrap tabular max-sm:text-[34px]">
                    {g.pct === null ? "—" : <>{g.pct}<span className="ml-0.5 text-[0.5em] tracking-normal text-muted-foreground">%</span></>}
                  </b>
                </div>
                <ProgressBar g={g} />
                <div className="project-foot flex justify-between gap-3 text-xs text-muted-foreground tabular">
                  <span>{g.total ? `${g.done} of ${g.total} done` : "No tasks yet"}{g.overdue ? <>{" · "}<span className="project-late inline-flex items-center gap-1 align-bottom font-semibold text-warning"><Icon name="clock" className="size-3.5" />{`${g.overdue} overdue`}</span></> : null}</span>
                  {planning ? null : <span className="whitespace-nowrap"><strong className="font-semibold text-foreground">{fmt(k.available)}</strong> available</span>}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="py-0">
          {all.length ? <Empty title="No matching projects" note="Try a different name, code or company." /> : <Empty title="No projects in this view" note="Choose another company to see its projects." />}
        </Card>
      )}
    </>
  );
}
