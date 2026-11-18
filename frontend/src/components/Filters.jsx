// Scope filters. compact (Dashboard): the Project label is for screen readers only, the
// blank option reads "All projects", and there is no Clear filters link.
import { Icon } from "./Icon.jsx";
import { FormSelect } from "./ui.jsx";
import { useApp, useAppState, useData } from "../lib/store.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const STATUSES = ["Draft", "Finance", "On Hold", "Paid", "Rejected", "Documents Required"].map((x) => ({ id: x, name: x }));

export function Filters({ dates = false, actions: extraActions = null, compact = false }) {
  const { actions } = useApp();
  const { state } = useData();
  const { company, project, from, to, statusFilter, filtersExpanded } = useAppState();
  const extra = Boolean(from || to || statusFilter);
  const set = (id) => (value) => actions.setFilter(id, value);
  return (
    <Collapsible open={!!filtersExpanded} onOpenChange={() => actions.toggleFilters()} className="filters mb-6 flex flex-wrap items-end gap-3">
      <div className={cn("grid gap-1.5", compact && "flex items-center")}>
        <Label htmlFor="project" className={compact ? "sr-only" : "text-xs"}>Project</Label>
        <FormSelect id="project" value={project} onValueChange={set("project")} clearable blank={compact ? "All projects" : "All"}
          items={state.projects.filter((p) => !company || p.companyId === company)} className="min-w-[190px]" />
      </div>
      {dates ? (
        <Button variant="outline" data-action="toggleFilters" aria-expanded={String(!!filtersExpanded)} aria-controls="extraFilters" onClick={() => actions.toggleFilters()}>
          <Icon name="filter" />Filters{extra ? <Badge variant="success" className="count">Active</Badge> : null}
        </Button>
      ) : null}
      <div className={cn("filter-end flex items-center gap-2 text-[11px] text-muted-foreground", compact ? "order-first mr-auto self-center" : "ml-auto self-center")}>
        Reporting currency <Badge className="currency-label rounded-full px-2.5">USD</Badge>
      </div>
      {!compact && (company || project || extra) ? <Button variant="link" className="linkbtn self-center" data-action="clearFilters" onClick={() => actions.clearFilters()}>Clear filters</Button> : null}
      {extraActions}
      {dates ? (
        <CollapsibleContent id="extraFilters" className="advanced-filters basis-full">
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
            <div className="grid gap-1.5"><Label htmlFor="from" className="text-xs">Request date · From</Label><Input id="from" type="date" value={from} onChange={(e) => actions.setFilter("from", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="to" className="text-xs">To</Label><Input id="to" type="date" value={to} onChange={(e) => actions.setFilter("to", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="statusFilter" className="text-xs">Status</Label>
              <FormSelect id="statusFilter" value={statusFilter} onValueChange={set("statusFilter")} clearable blank="All" items={STATUSES} /></div>
          </div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}
