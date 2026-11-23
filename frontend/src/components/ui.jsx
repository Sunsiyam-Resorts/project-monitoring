// Shared app compositions, built only from the shadcn components in ./ui (customised to the
// portal theme): page headers, status chips, empty states, tables, disclosures, form fields
// and selects. Add new building blocks here by composing shadcn components, never from scratch.
import { Children, cloneElement, createContext, isValidElement, useContext, useEffect, useId, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Icon } from "./Icon.jsx";
import { useApp, useAppState } from "../lib/store.js";
import { isoDay, parseDay, shortDate } from "../lib/format.js";
import { cn } from "@/lib/utils";
import { Badge as ShadcnBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Empty as ShadcnEmpty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Table } from "@/components/ui/table";
import { Field as ShadcnField, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input as ShadcnInput } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

// Legacy templates escaped optional values to "" rather than "undefined".
export const text = (v) => String(v ?? "");

export const Brand = ({ className }) => (
  <div className={cn("brand flex flex-col items-start gap-1.5", className)}>
    <img className="brand-logo h-[72px] w-[90px] object-contain object-left" src="/logo.svg" alt="Sun Siyam" width="110" height="88" />
    <span className="brand-label text-[9px] font-semibold tracking-[0.13em]">PROJECT MONITORING</span>
  </div>
);

export function PageHeader({ title, description, actions = null }) {
  return (
    <div className="page-head mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <h1 id="pageTitle" tabIndex={-1} className="font-display text-[26px] leading-tight font-bold tracking-[-0.025em] outline-none">{title}</h1>
        {description ? <p className="sub mt-1.5 text-[13px] text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}

// Status chips: shadcn Badge variants. The status is always written, so colour is never the
// only signal; "Finance" reads "Pending Payment".
const STATUS_VARIANT = {
  Paid: "success", Active: "success", Committed: "success",
  Finance: "info", Reviewer: "info", "Approval 1": "info", "Approval 2": "info",
  "On Hold": "warning", "Documents Required": "warning",
  Rejected: "danger", Deleted: "danger", Restored: "success",
};
export const Badge = ({ status }) => (
  <ShadcnBadge variant={STATUS_VARIANT[status] || "default"} data-status={status} className={`badge ${String(status).replaceAll(" ", "")}`}>
    {status === "Finance" ? "Pending Payment" : status}
  </ShadcnBadge>
);

export const Empty = ({ title, note = "", icon = "requests" }) => (
  <ShadcnEmpty className="empty">
    <EmptyHeader>
      <EmptyMedia variant="icon"><Icon name={icon} /></EmptyMedia>
      <EmptyTitle className="text-[15px] font-semibold">{title}</EmptyTitle>
      {note ? <EmptyDescription>{note}</EmptyDescription> : null}
    </EmptyHeader>
  </ShadcnEmpty>
);

// A person's initial in a round avatar (shadcn Avatar).
export const UserAvatar = ({ name, className, tone = "primary" }) => (
  <Avatar className={cn("avatar size-9", className)}>
    <AvatarFallback className={cn("text-xs font-bold", tone === "primary" ? "bg-primary text-primary-foreground" : "bg-soft text-link")}>{String(name || "?").slice(0, 1).toUpperCase()}</AvatarFallback>
  </Avatar>
);

// A labelled detail value in a DetailGrid.
export const Detail = ({ label, children }) => (
  <div className="min-w-0">
    <div className="mb-1 text-xs text-muted-foreground">{label}</div>
    <div className="text-[13px] font-medium break-words">{children}</div>
  </div>
);
export const DetailGrid = ({ className, children }) => (
  <div className={cn("detail-grid grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-3", className)}>{children}</div>
);

// Tables: the shadcn Table in a keyboard-scrollable region named after its section heading
// (the nearest RegionLabel, or "Data table").
export const RegionLabel = createContext("Data table");
export function DataTable({ className, containerClassName, children }) {
  const label = useContext(RegionLabel);
  return (
    <Table className={className} containerClassName={cn("table-wrap", containerClassName)}
      containerProps={{ tabIndex: 0, role: "region", "aria-label": `${label} · scroll for more columns` }}>
      {children}
    </Table>
  );
}

// A breakdown row: title and description, a headline figure, then its content on expand (shadcn
// Collapsible). The open state is remembered per page for the session.
export function Disclosure({ title, description, id, figure = "", unit = "", children }) {
  const { actions } = useApp();
  const { page, disclosures } = useAppState();
  const key = page + ":" + id;
  const open = disclosures[key] || false;
  return (
    <Collapsible open={open} onOpenChange={(o) => actions.setDisclosure(key, o)} data-disclosure={id} className="report-disclosure border-t border-border">
      <CollapsibleTrigger className="group/disclosure grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto_18px] items-center gap-6 px-6 py-4 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:ring-inset max-sm:gap-3.5 max-sm:px-5">
        <span className="report-text min-w-0">
          <strong className="block text-sm font-semibold">{title}</strong>
          <small className="mt-1 block text-xs text-muted-foreground">{description}</small>
        </span>
        {figure === "" ? <span /> : (
          <span className="report-figure flex flex-col items-end text-right">
            <b className="font-display text-[28px] leading-none font-semibold tracking-tight tabular max-sm:text-2xl">{figure}</b>
            <small className="mt-1 text-[11px] whitespace-nowrap text-muted-foreground">{unit}</small>
          </span>
        )}
        <ChevronRight className="size-[18px] text-muted-foreground transition-transform duration-200 group-data-[state=open]/disclosure:rotate-90 group-data-[state=open]/disclosure:text-foreground" />
      </CollapsibleTrigger>
      <CollapsibleContent forceMount className="report-body border-t border-border bg-muted/40 data-[state=closed]:hidden">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export const LoadingSkeleton = () => (
  <div className="loading-skeleton mx-auto max-w-[1440px] px-[max(24px,8vw)] py-20" role="status" aria-label="Loading workspace">
    <Skeleton className="mb-4 h-7 w-60" />
    <Skeleton className="h-3 w-[340px] max-w-full opacity-65" />
    <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-3"><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
    <span className="sr-only">Loading workspace…</span>
  </div>
);

// Buttons that open or change a record show a spinner until the action completes.
export function BusyButton({ onRun, disabled = false, children, variant = "outline", size, className, ...rest }) {
  const [busy, setBusy] = useState(false);
  const run = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await onRun(e); } finally { setBusy(false); }
  };
  return (
    <Button variant={variant} size={size} className={className} {...rest} disabled={busy || disabled} aria-busy={busy ? "true" : undefined} onClick={run}>
      {busy && variant !== "link" ? <Spinner /> : null}{children}
    </Button>
  );
}

export function RowAction({ action, id, label, onRun, busy = false, icon = "arrow" }) {
  const props = { variant: "secondary", size: "icon", className: "row-action rounded-xl", "data-action": action, "data-id": id, "aria-label": label, title: label };
  return busy
    ? <BusyButton {...props} onRun={onRun}><Icon name={icon} /></BusyButton>
    : <Button {...props} onClick={onRun}><Icon name={icon} /></Button>;
}

export function FileList({ files, kind, id, version = "", side = "data" }) {
  const { actions } = useApp();
  return (
    <div className="flex flex-wrap gap-2.5">
      {(files || []).map((f, i) => (
        <BusyButton key={i} variant="outline" className="document-link h-auto justify-start gap-3 rounded-xl py-2.5 pr-3 pl-3.5"
          data-action="file" data-kind={kind} data-id={id} data-index={i} data-version={version} data-side={side}
          onRun={() => actions.fileDownload({ action: "file", kind, id, index: String(i), version: text(version), side })}>
          <Icon name="audit" className="text-muted-foreground" />
          <span className="document-name flex min-w-0 flex-col items-start text-left">
            <span className="max-w-[260px] truncate">{f.name}</span>
            <small className="text-[11px] font-medium text-muted-foreground">PDF</small>
          </span>
          <Icon name="download" className="text-link" />
        </BusyButton>
      ))}
    </div>
  );
}

// Help text under a field.
export const Help = ({ id, className, children }) => (
  <FieldDescription id={id} className={cn("help", className)}>{children}</FieldDescription>
);

// ---- Forms --------------------------------------------------------------------------------
// Dropdowns use the shadcn Select. Its value "" shows the placeholder; when `clearable`, a
// first item (the `blank` label, e.g. "All") clears the choice again. In a form the Select
// carries `name` and `required` on its hidden native select, so FormData and validation work.
export const NONE = "__none";
export function FormSelect({
  id, name, value, defaultValue, onValueChange, items = [], options, blank = "Select…", clearable = false,
  required, disabled, className, size, "aria-label": ariaLabel, "aria-describedby": describedBy, ...rest
}) {
  const list = options || items.map((x) => ({ value: String(x.id), label: x.name }));
  const controlled = value !== undefined;
  const toRadix = (v) => (v === "" || v == null ? (clearable ? NONE : "") : String(v));
  const fromRadix = (v) => (v === NONE ? "" : v);
  return (
    <Select name={name} required={required} disabled={disabled}
      {...(controlled ? { value: toRadix(value) } : { defaultValue: defaultValue == null || defaultValue === "" ? undefined : String(defaultValue) })}
      onValueChange={(v) => onValueChange?.(fromRadix(v))}>
      <SelectTrigger id={id} size={size} className={cn("select-trigger", className)} aria-label={ariaLabel} aria-describedby={describedBy}
        data-value={controlled ? String(value ?? "") : undefined} {...rest}>
        <SelectValue placeholder={blank} />
      </SelectTrigger>
      <SelectContent>
        {clearable ? <SelectItem value={NONE} data-value="">{blank}</SelectItem> : null}
        {list.map((o) => <SelectItem key={o.value} value={o.value} data-value={o.value} disabled={o.disabled}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

const CONTROLS = ["input", "textarea"];
const isControl = (c) => isValidElement(c) && (c.type === Input || c.type === FormSelect || c.type === TextArea || c.type === FileDrop || c.type === DateInput || c.type === ShadcnInput || c.type === Textarea || CONTROLS.includes(c.type));

const fileSize = (bytes) => (bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`);

// A file drop area: a dashed shadcn Empty around a visually hidden shadcn Input of type file.
// Clicking the area opens the file picker; the hidden input keeps keyboard focus and the field
// label. Picked and dropped files go to onFiles, and the form keeps them in its own state (the
// input is cleared after each pick so the same file can be chosen again). `required` only
// shows the field's required mark: the form checks for the files itself.
export function FileDrop({ id, name, accept, title, note, invalid = false, onFiles, "aria-describedby": describedBy }) {
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);

  function take(list) {
    const files = [...(list || [])];
    if (files.length) onFiles?.(files);
  }

  return (
    <ShadcnEmpty data-slot="file-drop" data-dragging={dragging || undefined} data-invalid={invalid || undefined}
      onClick={(e) => { if (e.target !== input.current) input.current?.click(); }}
      onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); take(e.dataTransfer?.files); }}
      className={cn("file-drop min-h-44 w-full flex-none cursor-pointer gap-3 border border-dashed border-input bg-card p-6 transition-[background-color,border-color,box-shadow] md:p-8",
        "hover:border-foreground/45 hover:bg-accent/40 data-[dragging]:border-solid data-[dragging]:border-primary data-[dragging]:bg-soft",
        "has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/20",
        "data-[invalid]:border-danger data-[invalid]:bg-danger-soft")}>
      <ShadcnInput ref={input} id={id} name={name} type="file" accept={accept} multiple aria-invalid={invalid || undefined}
        aria-describedby={describedBy} className="sr-only"
        onChange={(e) => { take(e.currentTarget.files); e.currentTarget.value = ""; }} />
      <EmptyHeader className="max-w-md gap-1.5">
        <EmptyMedia variant="icon" className={cn("mb-1 size-11 rounded-full", dragging ? "bg-primary text-primary-foreground" : "bg-soft text-link")}>
          <Icon name="upload" />
        </EmptyMedia>
        <EmptyTitle className="text-sm font-semibold">{dragging ? "Release to add the files" : title}</EmptyTitle>
        <EmptyDescription className="text-xs">{note}</EmptyDescription>
      </EmptyHeader>
    </ShadcnEmpty>
  );
}

// Files added through a FileDrop, before upload: one shadcn Item per file with its role, size and a remove button.
export const UploadList = ({ label, files }) => (
  <ItemGroup aria-label={label} className="upload-list gap-2">
    {files.map(({ file, role, onRemove }) => (
      <Item key={role + file.name} role="listitem" variant="outline" size="sm">
        <ItemMedia variant="icon"><Icon name="file" /></ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="block w-full truncate">{file.name}</ItemTitle>
          <ItemDescription>{`${role} · ${fileSize(file.size)}`}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${file.name}`} onClick={onRemove}><Icon name="close" /></Button>
        </ItemActions>
      </Item>
    ))}
  </ItemGroup>
);

// A labelled form field (shadcn Field). The label is tied to the first control, Help text
// describes it, and required controls show the required mark.
export function Field({ label, wide = false, children }) {
  const autoId = useId(), helpAutoId = useId();
  const items = Children.toArray(children);
  const controlAt = items.findIndex(isControl);
  const helpAt = items.findIndex((c) => isValidElement(c) && (c.type === Help || /(^|\s)help(\s|$)/.test(c.props.className || "")));
  const controlId = controlAt >= 0 ? items[controlAt].props.id || autoId : undefined;
  const helpId = helpAt >= 0 ? items[helpAt].props.id || helpAutoId : undefined;
  const required = items.some((c) => isValidElement(c) && c.props.required);
  const content = items.map((c, i) =>
    i === controlAt ? cloneElement(c, { id: controlId, ...(helpId ? { "aria-describedby": helpId } : {}) })
      : i === helpAt ? cloneElement(c, { id: helpId }) : c);
  return (
    <ShadcnField className={cn("field min-w-0", wide && "wide sm:col-span-2")}>
      <FieldLabel htmlFor={controlId}>{label}{required ? <span className="required-mark text-muted-foreground" aria-hidden="true"> *</span> : null}</FieldLabel>
      {content}
    </ShadcnField>
  );
}

// A numbered form section (shadcn FieldSet + FieldLegend).
export const Section = ({ number, title, description = "", children }) => (
  <FieldSet className="form-section border-b border-border pb-7 last-of-type:border-b-0">
    <FieldLegend className="mb-1 flex items-center gap-2.5">
      <span className="text-[10px] font-semibold text-muted-foreground tabular">{number}</span>{title}
    </FieldLegend>
    {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    {children}
  </FieldSet>
);

export const FieldGrid = ({ className, children }) => (
  <div className={cn("grid2 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2", className)}>{children}</div>
);

// A day-first date field (shadcn InputGroup, Popover and Calendar): type DD/MM/YYYY or pick a
// day from the calendar button. The day is kept as YYYY-MM-DD in a hidden input named `name`,
// so forms submit it as before. With onChange it is controlled by `value` (filters); without,
// `value` is the starting day (forms). Text that is not a real date in range blocks the form
// with a message naming the field; in a filter it is simply not applied.
const toDate = (iso) => (iso ? new Date(`${iso}T00:00:00`) : undefined);
export function DateInput({ id, name, value, onChange, required, min, max, disabled, className, "aria-label": ariaLabel, "aria-describedby": describedBy }) {
  const [own, setOwn] = useState(value == null ? "" : String(value));
  const day = onChange ? (value == null ? "" : String(value)) : own;
  const [draft, setDraft] = useState(null);
  const [open, setOpen] = useState(false);
  const field = useRef(null);
  const inRange = (d) => (!min || d >= min) && (!max || d <= max);
  const typed = draft === null ? null : draft.trim() ? parseDay(draft) : "";
  const problem = draft === null || typed === "" || (typed && inRange(typed)) ? ""
    : typed && max && typed > max ? `Enter a date no later than ${shortDate(max)}`
    : typed && min && typed < min ? `Enter a date no earlier than ${shortDate(min)}`
    : "Enter the date as DD/MM/YYYY, for example 23/11/2026";
  // Runs after every render, so after the form's input handler has cleared custom messages.
  useEffect(() => { field.current?.setCustomValidity(problem); });

  function set(next) {
    if (onChange) onChange(next);
    else setOwn(next);
  }
  function type(entry) {
    setDraft(entry);
    const next = entry.trim() ? parseDay(entry) : "";
    if (next === "" || (next && inRange(next))) set(next);
  }
  function pick(d) {
    setOpen(false);
    setDraft(null);
    if (d) set(isoDay(d));
    field.current?.focus();
  }

  return (
    <>
      <InputGroup className={cn("date-input h-11", className)} data-disabled={disabled || undefined}>
        <InputGroupInput ref={field} id={id} inputMode="numeric" autoComplete="off" placeholder="DD/MM/YYYY" required={required} disabled={disabled}
          value={draft ?? shortDate(day)} onChange={(e) => type(e.target.value)} onBlur={() => { if (!problem) setDraft(null); }}
          aria-label={ariaLabel} aria-describedby={describedBy} aria-invalid={problem ? "true" : undefined} className="text-[13px] tabular" />
        <InputGroupAddon align="inline-end">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <InputGroupButton size="icon-sm" disabled={disabled} aria-label="Choose a date from the calendar"><Icon name="calendar" /></InputGroupButton>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto overflow-hidden p-0">
              <Calendar mode="single" captionLayout="dropdown" selected={toDate(typed || day)} defaultMonth={toDate(typed || day || max)}
                startMonth={new Date(2015, 0)} endMonth={new Date(new Date().getFullYear() + 5, 11)}
                disabled={[min && { before: toDate(min) }, max && { after: toDate(max) }].filter(Boolean)} onSelect={pick} />
            </PopoverContent>
          </Popover>
        </InputGroupAddon>
      </InputGroup>
      {name ? <input type="hidden" name={name} value={day} /> : null}
    </>
  );
}

// A text input with the legacy defaults: always a value, type text unless given.
export const Input = ({ name, value, type = "text", className, ...rest }) => (
  <ShadcnInput name={name} defaultValue={text(value)} type={type} className={className} {...rest} />
);
export const TextArea = ({ value, className, ...rest }) => (
  <Textarea defaultValue={value === undefined ? undefined : text(value)} className={className} {...rest} />
);

// A labelled shadcn Checkbox; in a form it submits `value` (default "on") under `name` when checked.
export function Check({ name, value, defaultChecked, className, children }) {
  const id = useId();
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Checkbox id={id} name={name} value={value} defaultChecked={defaultChecked} />
      <Label htmlFor={id} className="font-medium">{children}</Label>
    </div>
  );
}
