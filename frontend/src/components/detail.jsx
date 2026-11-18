// Record-dialog compositions built from shadcn components: the reference row, the amount
// lead, sections, decision panels, notices, collapsible "more" sections and the progress steps.
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export const RecordTop = ({ number, children }) => (
  <div className="detail-top mb-5 flex items-center justify-between gap-4">
    <div className="detail-number font-display text-xl font-bold tracking-[-0.02em]">{number}</div>
    {children}
  </div>
);

// The headline amount with its currency, and a figure on the side.
export const RecordLead = ({ eyebrow, currency, amount, note, side }) => (
  <div className="detail-lead mb-6 flex items-center justify-between gap-5 rounded-xl bg-muted p-6 max-sm:block max-sm:p-5">
    <div className="min-w-0">
      <div className="eyebrow mb-2 text-xs text-muted-foreground">{eyebrow}</div>
      <div className="amount font-display text-4xl leading-tight font-semibold tracking-[-0.03em] tabular max-sm:text-3xl"><span className="mr-2 text-xs font-medium tracking-normal text-muted-foreground">{currency}</span>{amount}</div>
      {note ? <small className="mt-1 block text-xs text-muted-foreground">{note}</small> : null}
    </div>
    {side ? <div className="lead-side flex flex-col text-right text-xs text-muted-foreground max-sm:mt-5 max-sm:text-left [&_strong]:text-[13px] [&_strong]:font-semibold [&_strong]:text-foreground">{side}</div> : null}
  </div>
);

export const ActionRow = ({ className, children }) => (
  <div className={cn("actions mt-5 flex flex-wrap items-center gap-2.5 max-sm:[&>button]:flex-1", className)}>{children}</div>
);

export const SectionTitle = ({ as: H = "h3", className, children }) => (
  <H className={cn("font-display text-[15px] font-bold", className)}>{children}</H>
);

export const DetailSection = ({ title, aside, className, children }) => (
  <section className={cn("detail-section mt-7 grid gap-3 border-t border-border pt-6", className)}>
    {title ? <div className="section-title flex flex-wrap items-baseline justify-between gap-2"><SectionTitle>{title}</SectionTitle>{aside ? <small className="text-xs text-muted-foreground">{aside}</small> : null}</div> : null}
    {children}
  </section>
);

// What the reader can do next on this record.
export const DecisionPanel = ({ title, note, children, className }) => (
  <section className={cn("decision-panel mt-6 rounded-xl bg-soft p-6 max-sm:p-5", className)}>
    <SectionTitle className="mb-1.5 text-sm">{title}</SectionTitle>
    {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    {children}
  </section>
);

// A notice (shadcn Alert): default, warning, success or destructive.
const TONE_CLASS = { warning: "warn", success: "success", destructive: "error", default: "" };
export const Notice = ({ tone = "default", title, children, className }) => (
  <Alert variant={tone} className={cn("notice mt-4", TONE_CLASS[tone], className)}>
    {title ? <AlertTitle>{title}</AlertTitle> : null}
    {children ? <AlertDescription>{children}</AlertDescription> : null}
  </Alert>
);

// A collapsible section, closed by default. Its content stays in the page while closed (hidden),
// so it is found by in-page search and by the record's text.
export const MoreDetails = ({ title, count, children, className, defaultOpen = false }) => (
  <Collapsible defaultOpen={defaultOpen} className={cn("details-disclosure mt-6 border-t border-border pt-4", className)}>
    <CollapsibleTrigger className="group/more flex w-full cursor-pointer items-center gap-2 rounded-lg py-1.5 text-left text-[13px] font-semibold text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none">
      <ChevronRight className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]/more:rotate-90" />
      {title}
      {count !== undefined ? <span className="count rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground tabular">{count}</span> : null}
    </CollapsibleTrigger>
    <CollapsibleContent forceMount className="mt-3 grid gap-3 data-[state=closed]:hidden">{children}</CollapsibleContent>
  </Collapsible>
);

// Progress through the stages: done stages in green, the current one in amber.
export const Steps = ({ label, steps }) => (
  <ol className="steps my-5 grid gap-1.5 max-sm:gap-0" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label={label}>
    {steps.map((s) => (
      <li key={s.name} aria-current={s.current ? "step" : undefined}
        className={cn("step relative border-t-2 pt-3.5 text-xs leading-relaxed text-muted-foreground",
          s.done ? "done border-success" : s.current ? "current border-warning" : "border-border")}>
        <span aria-hidden="true" className={cn("step-dot absolute -top-[5px] left-0 size-2 rounded-full",
          s.done ? "bg-success" : s.current ? "bg-warning ring-[3px] ring-warning-soft" : "bg-border")} />
        <strong className={cn("mb-1 block text-xs font-semibold", s.done ? "text-success" : s.current ? "text-warning" : "text-foreground")}>{s.name}</strong>
        {s.by}
        {s.at ? <span className="secondary block text-[11px]">{s.at}</span> : null}
      </li>
    ))}
  </ol>
);

// A dated entry in a history list.
export const HistoryEntry = ({ title, meta, children }) => (
  <div className="activity flex gap-3 border-b border-border py-3 last:border-b-0">
    <i className="dot mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
    <div className="min-w-0 text-xs">
      <strong className="block text-[13px] font-semibold">{title}</strong>
      <p className="mt-0.5 text-muted-foreground">{meta}</p>
      {children ? <p className="mt-1 break-words">{children}</p> : null}
    </div>
  </div>
);
