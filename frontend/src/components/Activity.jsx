import { actionLabel } from "../lib/format.js";
import { Empty } from "./ui.jsx";

// Recent activity: a dated ledger, newest first.
export function ActivityCard({ activity, note = "Approvals, payments and changes in this view will appear here." }) {
  return (
    <section className="panel activity-card" aria-labelledby="activityTitle">
      <header className="card-head"><h2 id="activityTitle">Recent activity</h2><small>{`Latest ${activity.length}`}</small></header>
      {activity.length ? (
        <ol className="activity-list">
          {activity.map((x, i) => {
            const d = new Date(x.at);
            return (
              <li key={x.id || i} className="activity-entry">
                <time dateTime={x.at}>
                  <b>{d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</b>
                  <small>{`${String(d.getDate()).padStart(2, "0")} ${d.toLocaleString("en-GB", { month: "short" })} ${d.getFullYear()}`}</small>
                </time>
                <div><strong>{actionLabel(x.action)}</strong><p>{`${x.user ?? ""}${x.detail ? " · " + x.detail : ""}`}</p></div>
              </li>
            );
          })}
        </ol>
      ) : <Empty title="No activity yet" note={note} />}
    </section>
  );
}

// Task progress on a light track: Done, then In progress; the empty rest is To do.
export function ProgressBar({ g, label = "" }) {
  const pct = (n) => (g.total ? (n / g.total) * 100 : 0).toFixed(2);
  return (
    <span className="progress-track stack-bar" role="img" aria-label={label || (g.total ? `${g.done} done, ${g.inProgress} in progress, ${g.todo} to do` : "No tasks yet")}>
      {g.done ? <i className="seg done" style={{ width: `${pct(g.done)}%` }}></i> : null}
      {g.inProgress ? <i className="seg doing" style={{ width: `${pct(g.inProgress)}%` }}></i> : null}
    </span>
  );
}
