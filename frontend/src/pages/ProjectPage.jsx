// One project: the Dashboard's overview for this project, its progress, tasks and details.
import {
  TASK_STATUSES, access, canCreateRequests, canEditTasks, canManageRequest, categoryUsed, isFinanceAdmin,
  projectProgress, remainingToRequest, today,
} from "../domain/domain.js";
import { Icon } from "../components/Icon.jsx";
import { Badge, BusyButton, Disclosure, Empty, PageHeader, RegionLabel, text } from "../components/ui.jsx";
import { Overview } from "../components/Overview.jsx";
import { ActivityCard, ProgressBar } from "../components/Activity.jsx";
import { DashboardTable } from "./Dashboard.jsx";
import { fmt, shortDate, word } from "../lib/format.js";
import { nameOf } from "../lib/selectors.js";
import { useApp, useAppState, useData } from "../lib/store.js";

const TASK_ORDER = { "In progress": 0, "To do": 1, Done: 2 };

function ProgressCard({ g }) {
  return (
    <section className="panel progress-card" aria-labelledby="progressTitle">
      <header className="progress-head"><h2 id="progressTitle">Project progress</h2><small>{g.total ? `${g.done} of ${g.total} tasks done` : "No tasks yet"}</small></header>
      <div className="progress-figure"><b>{g.pct === null ? "—" : g.pct}</b>{g.pct === null ? null : <span>%</span>}</div>
      <ProgressBar g={g} />
      <dl className="progress-counts">
        <div><dt><i className="key done" aria-hidden="true"></i>Done</dt><dd>{g.done}</dd></div>
        <div><dt><i className="key doing" aria-hidden="true"></i>In progress</dt><dd>{g.inProgress}</dd></div>
        <div><dt><i className="key todo" aria-hidden="true"></i>To do</dt><dd>{g.todo}</dd></div>
      </dl>
      {g.overdue ? <p className="project-flag"><Icon name="clock" />{`${g.overdue} overdue ${g.overdue === 1 ? "task" : "tasks"}`}</p> : null}
    </section>
  );
}

function TaskRow({ t, canEdit, day }) {
  const { actions } = useApp();
  const late = t.status !== "Done" && t.due && t.due < day;
  const key = t.status.toLowerCase().replace(" ", "-");
  return (
    <li className="task-row" data-status={key}>
      {canEdit ? (
        <select className="task-status" data-task={t.id} aria-label={`Status of ${t.name}`} defaultValue={t.status} onChange={(e) => actions.taskStatus(t.id, e.target.value, e.target)}>
          {TASK_STATUSES.map((x) => <option key={x}>{x}</option>)}
        </select>
      ) : <span className="task-badge" data-status={key}>{t.status === "Done" ? <Icon name="check" /> : null}{t.status}</span>}
      <div className="task-main">
        <strong>{t.name}</strong>
        <p>{t.owner || "No owner"}{t.due ? ` · Due ${shortDate(t.due)}` : ""}{late ? <>{" · "}<span className="task-overdue"><Icon name="clock" />Overdue</span></> : null}</p>
      </div>
      {canEdit ? (
        <div className="task-actions">
          <button className="linkbtn" data-action="editTask" data-id={t.id} aria-label={`Edit ${t.name}`} onClick={() => actions.editTask(t.id)}>Edit</button>
          <button className="linkbtn danger-link" data-action="deleteTask" data-id={t.id} aria-label={`Delete ${t.name}`} onClick={() => actions.deleteTask(t.id)}>Delete</button>
        </div>
      ) : null}
    </li>
  );
}

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

  return (
    <>
      <button className="back-link" data-action="backProjects" onClick={() => actions.backProjects()}><span className="pager-back"><Icon name="chevron" /></span>All projects</button>
      <PageHeader eyebrow={`${companyName}${p.code ? " · " + p.code : ""}`} title={p.name} description="Budget, payments and progress for this project."
        actions={isFinanceAdmin(user) ? <button data-action="editProject" data-id={p.id} onClick={() => actions.editProject(p.id)}>Edit project</button> : null} />
      <Overview company={p.companyId} project={p.id} before={<ProgressCard g={g} />} />
      <div className="dashboard-bottom section-gap">
        <div className="project-main">
          <section className="panel task-card" aria-labelledby="tasksTitle">
            <header className="card-head">
              <h2 id="tasksTitle">Tasks</h2>
              {canEdit ? <button className="primary" data-action="newTask" data-id={p.id} onClick={() => actions.newTask(p.id)}><Icon name="plus" />Add task</button> : <small>{`${ts.length} ${ts.length === 1 ? "task" : "tasks"}`}</small>}
            </header>
            {ts.length
              ? <ol className="task-list">{ts.map((t) => <TaskRow key={t.id} t={t} canEdit={canEdit} day={day} />)}</ol>
              : <Empty title="No tasks yet" note={canEdit ? "Add the first task to start tracking progress." : "Finance adds tasks to track this project’s progress."} />}
          </section>
          <section className="panel requests-card" aria-labelledby="requestsTitle">
            <header className="card-head">
              <h2 id="requestsTitle">Requests</h2>
              {canRaise ? <button className="primary" data-action="projectOrder" data-id={p.id} onClick={() => actions.projectOrder(p.id)}><Icon name="plus" />New request</button> : <small>{`${orders.length} ${orders.length === 1 ? "request" : "requests"}`}</small>}
            </header>
            {orders.length ? (
              <ol className="request-list">
                {orders.map((o) => {
                  const left = o.rejectedAt ? 0 : remainingToRequest(state, o);
                  const can = canRaise && !o.rejectedAt && left > 0.005 && canManageRequest(user, o);
                  const count = state.requests.filter((r) => r.orderId === o.id).length;
                  return (
                    <li key={o.id} className="request-row">
                      <div className="request-main">
                        <BusyButton className="linkbtn" data-action="openOrder" data-id={o.id} onRun={() => actions.openOrder(o.id)}>{o.number}</BusyButton>
                        <p>{`${nameOf(state, "suppliers", o.supplierId)} · ${text(o.po)} · ${count} ${count === 1 ? "payment" : "payments"}`}</p>
                      </div>
                      <div className="request-figures">
                        <strong>{`${o.currency} ${fmt(o.total)}`}</strong>
                        <small>{o.rejectedAt ? "Rejected" : left > 0.005 ? `${o.currency} ${fmt(left)} left to request` : "Fully requested"}</small>
                      </div>
                      {can
                        ? <button data-action="projectPayment" data-id={o.id} aria-label={`Create payment request for ${o.number}`} onClick={() => actions.projectPayment(o.id)}><Icon name="plus" />Payment request</button>
                        : <span className="request-spacer" aria-hidden="true"></span>}
                    </li>
                  );
                })}
              </ol>
            ) : <Empty title="No requests yet" note={canRaise ? "Raise the first request for this project; it includes its first payment request." : "Requests raised for this project will appear here."} />}
          </section>
          <RegionLabel.Provider value="Explore the details">
            <section className="panel explore-card" aria-labelledby="exploreTitle">
              <header className="card-head"><h2 id="exploreTitle">Explore the details</h2><small>Expand a breakdown</small></header>
              <Disclosure title="Budget Categories" description="Allocations and category balances · USD" id="categories" figure={categoryRows.length} unit={word(categoryRows.length, "category", "categories")}>
                {categoryRows.length ? (
                  <DashboardTable headings={["Category", "Approved", "Utilized", "Available"]}>
                    {categoryRows.map(({ b, c }) => {
                      const used = categoryUsed(state, b.id, c.id), amount = c.amount / (b.rate || 1);
                      return <tr key={b.id + ":" + c.id}><td>{c.name}<span className="secondary">{b.name}</span></td><td className="right">{fmt(amount)}</td><td className="right">{fmt(used)}</td><td className="right">{fmt(amount - used)}</td></tr>;
                    })}
                  </DashboardTable>
                ) : <Empty title="No budget yet" note="Finance adds this project’s approved budget in Master Data." />}
              </Disclosure>
              <Disclosure title="Payment Requests" description="Every payment request and where it stands" id="payments" figure={requests.length} unit={word(requests.length, "payment", "payments")}>
                {requests.length ? (
                  <DashboardTable headings={["Payment request", "Amount", "Status"]}>
                    {requests.map((r) => (
                      <tr key={r.id}>
                        <td><BusyButton className="linkbtn" data-action="openRequest" data-id={r.id} onRun={() => actions.openRequest(r.id)}>{r.number}</BusyButton><span className="secondary">{r.date || ""}</span></td>
                        <td className="right">{`${r.currency} ${fmt(r.amount)}`}</td>
                        <td className="right"><Badge status={r.status} /></td>
                      </tr>
                    ))}
                  </DashboardTable>
                ) : <Empty title="No payment requests yet" />}
              </Disclosure>
            </section>
          </RegionLabel.Provider>
        </div>
        <ActivityCard activity={activity} note="Task changes, requests and payments for this project will appear here." />
      </div>
    </>
  );
}
