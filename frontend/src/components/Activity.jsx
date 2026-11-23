import { actionLabel, dayOf } from "../lib/format.js";
import { Empty } from "./ui.jsx";
import { SegmentBar } from "./Charts.jsx";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Recent activity: a dated ledger, newest first (shadcn Card).
export function ActivityCard({ activity, note = "Approvals, payments and changes in this view will appear here.", className }) {
  return (
    <Card className={cn("activity-card gap-0 overflow-hidden py-0", className)} aria-labelledby="activityTitle">
      <CardHeader className="card-head flex items-baseline justify-between px-6 pt-5 pb-4">
        <CardTitle id="activityTitle">Recent activity</CardTitle><small className="text-xs text-muted-foreground">{`Latest ${activity.length}`}</small>
      </CardHeader>
      {activity.length ? (
        <ol className="activity-list">
          {activity.map((x, i) => {
            const d = new Date(x.at);
            return (
              <li key={x.id || i} className="activity-entry grid grid-cols-[80px_minmax(0,1fr)] items-start gap-4 border-t border-border px-6 py-4 max-sm:grid-cols-[70px_minmax(0,1fr)] max-sm:px-5">
                <time dateTime={x.at} className="flex flex-col">
                  <b className="font-display text-2xl leading-none font-semibold tracking-tight tabular max-sm:text-[21px]">{d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</b>
                  <small className="mt-1 text-[11px] whitespace-nowrap text-muted-foreground tabular">{dayOf(d)}</small>
                </time>
                <div className="min-w-0">
                  <strong className="block pt-0.5 text-sm font-semibold">{actionLabel(x.action)}</strong>
                  <p className="mt-1 text-xs leading-relaxed break-words text-muted-foreground">{`${x.user ?? ""}${x.detail ? " · " + x.detail : ""}`}</p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : <div className="border-t border-border"><Empty title="No activity yet" note={note} /></div>}
    </Card>
  );
}

// Task progress on a light track (the segment bar): Done, then In progress; the empty rest is
// To do.
export function ProgressBar({ g, label = "", className }) {
  return (
    <SegmentBar className={cn("progress-track h-2", className)} max={g.total}
      label={label || (g.total ? `${g.done} done, ${g.inProgress} in progress, ${g.todo} to do` : "No tasks yet")}
      parts={[{ key: "done", value: g.done, title: `Done: ${g.done}` }, { key: "doing", value: g.inProgress, title: `In progress: ${g.inProgress}` }]} />
  );
}
