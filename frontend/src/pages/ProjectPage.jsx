// One project: the Dashboard's overview for this project, its progress, tasks and details.
import { Check, ChevronLeft } from "lucide-react";
import {
  TASK_STATUSES, access, canCreateRequests, canEditTasks, canManageRequest, categoryUsed, isFinanceAdmin,
  projectProgress, remainingToRequest, today,
} from "../domain/domain.js";
import { Icon } from "../components/Icon.jsx";
import { Badge, BusyButton, Disclosure, Empty, FormSelect, PageHeader, RegionLabel, text } from "../components/ui.jsx";
import { FiguresTable, Sub, TableCell, TableRow } from "../components/tables.jsx";
import { Overview } from "../components/Overview.jsx";
import { ActivityCard, ProgressBar } from "../components/Activity.jsx";
import { SegmentKey } from "../components/Charts.jsx";
import { fmt, shortDate, word } from "../lib/format.js";
import { isPlanning, nameOf } from "../lib/selectors.js";
import { useApp, useAppState, useData } from "../lib/store.js";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TASK_ORDER = { "In progress": 0, "To do": 1, Done: 2 };

function ProgressCard({ g }) {
  return (
    <Card className="progress-card gap-3.5 px-5 py-5" aria-labelledby="progressTitle">
      <header className="progress-head flex items-baseline justify-between gap-3">
        <h2 id="progressTitle" className="text-[13px] font-medium">Project progress</h2>
        <small className="text-xs whitespace-nowrap text-muted-foreground">{g.total ? `${g.done} of ${g.total} tasks done` : "No tasks yet"}</small>
      </header>
      <div className="progress-figure flex items-baseline font-display">
        <b className="text-[clamp(48px,16cqi,72px)] leading-[0.9] font-semibold tracking-[-0.035em] tabular">{g.pct === null ? "—" : g.pct}</b>
        {g.pct === null ? null : <span className="ml-0.5 text-[26px] text-muted-foreground">%</span>}
      </div>
      <ProgressBar g={g} className="h-2.5" />
      <dl className="progress-counts grid grid-cols-3">
        {[["done", "Done", g.done], ["doing", "In progress", g.inProgress], ["todo", "To do", g.todo]].map(([key, label, n], i) => (
          <div key={key} className={cn(i && "border-l border-border pl-3.5")}>
            <dt className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground"><SegmentKey part={key} className={`key ${key}`} />{label}</dt>
            <dd className="mt-1 font-display text-[22px] leading-tight font-semibold tabular">{n}</dd>
          </div>
        ))}
      </dl>
      {g.overdue ? <p className="project-flag flex items-center gap-1.5 text-xs font-semibold text-warning"><Icon name="clock" className="size-3.5" />{`${g.overdue} overdue ${g.overdue === 1 ? "task" : "tasks"}`}</p> : null}
    </Card>
  );
}

function TaskRow({ t, canEdit, day }) {
  const { actions } = useApp();
  const late = t.status !== "Done" && t.due && t.due < day;
  const key = t.status.toLowerCase().replace(" ", "-");
  return (
    <li className="task-row grid grid-cols-[148px_minmax(0,1fr)_auto] items-center gap-4 border-t border-border px-6 py-3.5 max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-3.5 max-sm:gap-y-2.5 max-sm:px-5" data-status={key}>
      {canEdit ? (
        <FormSelect className="task-status h-10 max-sm:col-span-full max-sm:w-auto max-sm:min-w-[150px] max-sm:justify-self-start" data-task={t.id} aria-label={`Status of ${t.name}`} value={t.status}
          onValueChange={(v) => actions.taskStatus(t.id, v)} options={TASK_STATUSES.map((x) => ({ value: x, label: x }))} />
      ) : (
        <span className={cn("task-badge inline-flex items-center gap-1.5 text-xs font-semibold max-sm:col-span-full", key === "to-do" && "text-muted-foreground", key === "done" && "text-success")} data-status={key}>
          {t.status === "Done" ? <Check className="size-3.5" /> : <SegmentKey part={key === "in-progress" ? "doing" : "todo"} />}{t.status}
        </span>
      )}
      <div className="task-main min-w-0">
        <strong className={cn("block text-sm font-semibold break-words", t.status === "Done" && "text-muted-foreground")}>{t.name}</strong>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t.owner || "No owner"}{t.due ? ` · Due ${shortDate(t.due)}` : ""}
          {late ? <>{" · "}<span className="task-overdue inline-flex items-center gap-1 align-bottom font-semibold text-warning"><Icon name="clock" className="size-3.5" />Overdue</span></> : null}
        </p>
      </div>
      {canEdit ? (
        <div className="task-actions flex gap-3.5">
          <Button variant="link" className="linkbtn" data-action="editTask" data-id={t.id} aria-label={`Edit ${t.name}`} onClick={() => actions.editTask(t.id)}>Edit</Button>
          <Button variant="link" className="linkbtn danger-link text-danger" data-action="deleteTask" data-id={t.id} aria-label={`Delete ${t.name}`} onClick={() => actions.deleteTask(t.id)}>Delete</Button>
        </div>
      ) : null}
    </li>
  );
}

const CardHead = ({ id, title, children }) => (
  <CardHeader className="card-head flex flex-row items-center justify-between gap-4 px-6 pt-5 pb-4">
    <CardTitle id={id}>{title}</CardTitle>{children}
  </CardHeader>
);

export function ProjectPage() {
  const { actions } = useApp();
  const { state, user } = useData();
  const { projectId } = useAppState();
  const p = state.projects.find((x) => x.id === projectId);
  if (!p) return null;
  const g = projectProgress(state, p.id);
  const canEdit = canEditTasks(user, p.companyId);
  const day = today();
  const ts = state.tasks.filter((t) => t.projectId === p.id)
    .sort((x, y) => TASK_ORDER[x.status] - TASK_ORDER[y.status] || (x.due || "9999").localeCompare(y.due || "9999") || x.name.localeCompare(y.name));
  const budgets = state.budgets.filter((b) => b.projectId === p.id);
  const categoryRows = budgets.flatMap((b) => b.categories.map((c) => ({ b, c })));
  const orders = state.orders.filter((o) => o.projectId === p.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  const orderIds = new Set(orders.map((o) => o.id));
  const requests = state.requests.filter((r) => orderIds.has(r.orderId)).sort((x, y) => (y.createdAt || "").localeCompare(x.createdAt || ""));
  // Requests: each order with what is left to request and, for whoever may raise one, a
  // button that opens the payment request form for that order.
  const canRaise = canCreateRequests(user) && access(user, p.companyId);
  const taskIds = new Set(state.tasks.filter((t) => t.projectId === p.id).map((t) => t.id));
  const requestIds = new Set(requests.map((r) => r.id));
  const activity = state.audit
    .filter((x) => orderIds.has(x.entity) || requestIds.has(x.entity) || taskIds.has(x.entity) ||
      (x.action === "task.delete" && x.companyId === p.companyId && (x.detail || "").startsWith(p.name + ":")))
    .sort((x, y) => Date.parse(y.at) - Date.parse(x.at)).slice(0, 6);
  const companyName = nameOf(state, "companies", p.companyId);
  const back = (
    <Button variant="ghost" size="sm" className="back-link -ml-3 mb-1 text-muted-foreground hover:text-foreground" data-action="backProjects" onClick={() => actions.backProjects()}>
      <ChevronLeft />All projects
    </Button>
  );
  const subtitle = `${companyName}${p.code ? " · " + p.code : ""}`;
  const taskCard = (
    <Card className="task-card gap-0 overflow-hidden py-0" aria-labelledby="tasksTitle">
      <CardHead id="tasksTitle" title="Tasks">
        {canEdit ? <Button size="sm" data-action="newTask" data-id={p.id} onClick={() => actions.newTask(p.id)}><Icon name="plus" />Add task</Button> : <small className="text-xs text-muted-foreground">{`${ts.length} ${ts.length === 1 ? "task" : "tasks"}`}</small>}
      </CardHead>
      {ts.length
        ? <ol className="task-list">{ts.map((t) => <TaskRow key={t.id} t={t} canEdit={canEdit} day={day} />)}</ol>
        : <div className="border-t border-border"><Empty title="No tasks yet" note={canEdit ? "Add the first task to start tracking progress." : "Planning adds tasks to track this project’s progress."} /></div>}
    </Card>
  );

  // Planning works on tasks only: progress, tasks and task activity, without budget figures.
  if (isPlanning(user)) return (
    <>
      {back}
      <PageHeader title={p.name} description={`${subtitle} · Tasks and progress for this project.`} />
      <div className="dashboard-bottom grid grid-cols-[minmax(0,1fr)_minmax(320px,0.46fr)] items-start gap-4 max-xl:grid-cols-1">
        <div className="project-main min-w-0">{taskCard}</div>
        <div className="kpi-side @container flex min-w-0 flex-col gap-4"><ProgressCard g={g} /><ActivityCard activity={activity} note="Task changes for this project will appear here." /></div>
      </div>
    </>
  );

  return (
    <>
      {back}
      <PageHeader title={p.name} description={`${subtitle} · Budget, payments and progress for this project.`}
        actions={isFinanceAdmin(user) ? <Button variant="outline" data-action="editProject" data-id={p.id} onClick={() => actions.editProject(p.id)}>Edit project</Button> : null} />
      <Overview company={p.companyId} project={p.id} before={<ProgressCard g={g} />} />
      <div className="dashboard-bottom grid grid-cols-[minmax(0,1fr)_minmax(320px,0.46fr)] items-start gap-4 max-xl:grid-cols-1">
        <div className="project-main flex min-w-0 flex-col gap-4">
          {taskCard}
          <Card className="requests-card gap-0 overflow-hidden py-0" aria-labelledby="requestsTitle">
            <CardHead id="requestsTitle" title="Requests">
              {canRaise ? <Button size="sm" data-action="projectOrder" data-id={p.id} onClick={() => actions.projectOrder(p.id)}><Icon name="plus" />New request</Button> : <small className="text-xs text-muted-foreground">{`${orders.length} ${orders.length === 1 ? "request" : "requests"}`}</small>}
            </CardHead>
            {orders.length ? (
              <ol className="request-list">
                {orders.map((o) => {
                  const left = o.rejectedAt ? 0 : remainingToRequest(state, o);
                  const can = canRaise && !o.rejectedAt && left > 0.005 && canManageRequest(user, o);
                  const count = state.requests.filter((r) => r.orderId === o.id).length;
                  return (
                    <li key={o.id} className="request-row grid grid-cols-[minmax(0,1fr)_auto_168px] items-center gap-4 border-t border-border px-6 py-3.5 max-sm:grid-cols-1 max-sm:gap-2 max-sm:px-5">
                      <div className="request-main min-w-0">
                        <BusyButton variant="link" className="linkbtn text-sm" data-action="openOrder" data-id={o.id} onRun={() => actions.openOrder(o.id)}>{o.number}</BusyButton>
                        <p className="mt-1 text-xs break-words text-muted-foreground">{`${nameOf(state, "suppliers", o.supplierId)} · ${text(o.po)} · ${count} ${count === 1 ? "payment" : "payments"}`}</p>
                      </div>
                      <div className="request-figures flex flex-col items-end text-right tabular max-sm:flex-row max-sm:flex-wrap max-sm:items-baseline max-sm:gap-x-2.5 max-sm:text-left">
                        <strong className="text-sm font-semibold whitespace-nowrap">{`${o.currency} ${fmt(o.total)}`}</strong>
                        <small className="mt-1 text-xs whitespace-nowrap text-muted-foreground max-sm:mt-0">{o.rejectedAt ? "Rejected" : left > 0.005 ? `${o.currency} ${fmt(left)} left to request` : "Fully requested"}</small>
                      </div>
                      {can
                        ? <Button variant="outline" size="sm" data-action="projectPayment" data-id={o.id} aria-label={`Create payment request for ${o.number}`} onClick={() => actions.projectPayment(o.id)}><Icon name="plus" />Payment request</Button>
                        : <span className="request-spacer max-sm:hidden" aria-hidden="true"></span>}
                    </li>
                  );
                })}
              </ol>
            ) : <div className="border-t border-border"><Empty title="No requests yet" note={canRaise ? "Raise the first request for this project; it includes its first payment request." : "Requests raised for this project will appear here."} /></div>}
          </Card>
          <RegionLabel.Provider value="Explore the details">
            <Card className="explore-card gap-0 overflow-hidden py-0" aria-labelledby="exploreTitle">
              <CardHead id="exploreTitle" title="Explore the details"><small className="text-xs text-muted-foreground">Expand a breakdown</small></CardHead>
              <Disclosure title="Budget Categories" description="Allocations and category balances · USD" id="categories" figure={categoryRows.length} unit={word(categoryRows.length, "category", "categories")}>
                {categoryRows.length ? (
                  <FiguresTable headings={["Category", "Approved", "Utilized", "Available"]}>
                    {categoryRows.map(({ b, c }) => {
                      const used = categoryUsed(state, b.id, c.id), amount = c.amount / (b.rate || 1);
                      return <TableRow key={b.id + ":" + c.id}><TableCell>{c.name}<Sub>{b.name}</Sub></TableCell><TableCell className="text-right">{fmt(amount)}</TableCell><TableCell className="text-right">{fmt(used)}</TableCell><TableCell className="text-right">{fmt(amount - used)}</TableCell></TableRow>;
                    })}
                  </FiguresTable>
                ) : <Empty title="No budget yet" note="Finance adds this project’s approved budget in Master Data." />}
              </Disclosure>
              <Disclosure title="Payment Requests" description="Every payment request and where it stands" id="payments" figure={requests.length} unit={word(requests.length, "payment", "payments")}>
                {requests.length ? (
                  <FiguresTable headings={["Payment request", "Amount", "Status"]}>
                    {requests.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell><BusyButton variant="link" className="linkbtn" data-action="openRequest" data-id={r.id} onRun={() => actions.openRequest(r.id)}>{r.number}</BusyButton><Sub>{shortDate(r.date)}</Sub></TableCell>
                        <TableCell className="text-right">{`${r.currency} ${fmt(r.amount)}`}</TableCell>
                        <TableCell className="text-right"><Badge status={r.status} /></TableCell>
                      </TableRow>
                    ))}
                  </FiguresTable>
                ) : <Empty title="No payment requests yet" />}
              </Disclosure>
            </Card>
          </RegionLabel.Provider>
        </div>
        <ActivityCard activity={activity} note="Task changes, requests and payments for this project will appear here." />
      </div>
    </>
  );
}
