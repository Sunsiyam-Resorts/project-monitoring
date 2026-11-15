// Shared presentation: page headers, form fields, tables, badges and other small building blocks.
import { Children, cloneElement, createContext, isValidElement, useContext, useId, useState } from "react";
import { Icon } from "./Icon.jsx";
import { useApp, useAppState } from "../lib/store.js";

// Legacy templates escaped optional values to "" rather than "undefined".
export const text = (v) => String(v ?? "");

export const Brand = () => (
  <div className="brand"><img className="brand-logo" src="/logo.svg" alt="Sun Siyam" width="110" height="88" /><span className="brand-label">PROJECT MONITORING</span></div>
);

export function PageHeader({ eyebrow, title, description, actions = null }) {
  return (
    <div className="page-head">
      <div><div className="eyebrow">{eyebrow}</div><h1 id="pageTitle" tabIndex={-1}>{title}</h1><p className="sub">{description}</p></div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export const Badge = ({ status }) => (
  <span className={`badge ${status.replaceAll(" ", "")}`}>{status === "Finance" ? "Pending Payment" : status}</span>
);

export const Empty = ({ title, note = "" }) => (
  <div className="empty"><div className="empty-icon"><Icon name="requests" /></div><h3>{title}</h3>{note ? <p>{note}</p> : null}</div>
);

// A labelled detail value in a .detail-grid.
export const Detail = ({ label, children }) => <div><label>{label}</label>{children}</div>;

// Table regions are keyboard-scrollable and named after their section heading
// (the nearest section's first heading, or "Data table").
export const RegionLabel = createContext("Data table");
export function TableWrap({ className = "", children }) {
  const label = useContext(RegionLabel);
  return (
    <div className={className ? `table-wrap ${className}` : "table-wrap"} tabIndex={0} role="region" aria-label={`${label} · scroll for more columns`}>
      {children}
    </div>
  );
}

export const Tabs = ({ children }) => <div className="tabs" role="group" aria-label="View selection">{children}</div>;

// A breakdown row: title and description, a headline figure, then the table on expand.
// The open state is remembered per page for the session.
export function Disclosure({ title, description, id, figure = "", unit = "", children }) {
  const { actions } = useApp();
  const { page, disclosures } = useAppState();
  const key = page + ":" + id;
  return (
    <details className="report-disclosure" data-disclosure={id} open={disclosures[key] || false} onToggle={(e) => actions.setDisclosure(key, e.currentTarget.open)}>
      <summary>
        <span className="report-text"><strong>{title}</strong><small>{description}</small></span>
        {figure === "" ? null : <span className="report-figure"><b>{figure}</b><small>{unit}</small></span>}
        <Icon name="chevron" />
      </summary>
      <div className="report-body">{children}</div>
    </details>
  );
}

export const LoadingSkeleton = () => (
  <div className="loading-skeleton" role="status" aria-label="Loading workspace">
    <div className="skeleton-line"></div><div className="skeleton-line short"></div>
    <div className="skeleton-grid"><div></div><div></div><div></div></div>
    <span className="sr-only">Loading workspace…</span>
  </div>
);

// `<option value="">blank</option>` followed by one option per record.
export const Options = ({ items, blank = "Select…" }) => (
  <>
    <option value="">{blank}</option>
    {items.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
  </>
);

// Buttons that open or change a record show they are busy until the action completes.
export function BusyButton({ onRun, disabled = false, children, ...rest }) {
  const [busy, setBusy] = useState(false);
  const run = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await onRun(e); } finally { setBusy(false); }
  };
  return <button {...rest} disabled={busy || disabled} aria-busy={busy ? "true" : undefined} onClick={run}>{children}</button>;
}

export function RowAction({ action, id, label, onRun, busy = false }) {
  const props = { className: "row-action", "data-action": action, "data-id": id, "aria-label": label, title: label };
  return busy
    ? <BusyButton {...props} onRun={onRun}><Icon name="arrow" /></BusyButton>
    : <button {...props} onClick={onRun}><Icon name="arrow" /></button>;
}

export function FileList({ files, kind, id, version = "", side = "data" }) {
  const { actions } = useApp();
  return (files || []).map((f, i) => (
    <BusyButton key={i} className="document-link" data-action="file" data-kind={kind} data-id={id} data-index={i} data-version={version} data-side={side}
      onRun={() => actions.fileDownload({ action: "file", kind, id, index: String(i), version: text(version), side })}>
      <Icon name="requests" /><span className="document-name">{f.name}<small>PDF</small></span><Icon name="download" />
    </BusyButton>
  ));
}

// ---- Forms --------------------------------------------------------------------------------
const CONTROLS = ["input", "select", "textarea"];

// A labelled form field. The label is tied to the first control, a .help child describes it,
// and controls marked required show the required mark.
export function Field({ label, wide = false, children }) {
  const autoId = useId(), helpAutoId = useId();
  const items = Children.toArray(children);
  const controlAt = items.findIndex((c) => isValidElement(c) && (c.type === Input || CONTROLS.includes(c.type)));
  const helpAt = items.findIndex((c) => isValidElement(c) && /(^|\s)help(\s|$)/.test(c.props.className || ""));
  const controlId = controlAt >= 0 ? items[controlAt].props.id || autoId : undefined;
  const helpId = helpAt >= 0 ? items[helpAt].props.id || helpAutoId : undefined;
  const required = items.some((c) => isValidElement(c) && c.props.required);
  const content = items.map((c, i) =>
    i === controlAt ? cloneElement(c, { id: controlId, ...(helpId && controlAt >= 0 ? { "aria-describedby": helpId } : {}) })
      : i === helpAt ? cloneElement(c, { id: helpId }) : c);
  return (
    <div className={wide ? "field wide" : "field"}>
      <label htmlFor={controlId}>{label}{required ? <span className="required-mark" aria-hidden="true"> *</span> : null}</label>
      {content}
    </div>
  );
}

export const Section = ({ number, title, description = "", children }) => (
  <fieldset className="form-section"><legend><span>{number}</span>{title}</legend>{description ? <p>{description}</p> : null}{children}</fieldset>
);

// A text input with the legacy defaults: always a value, type text unless given.
export const Input = ({ name, value, type = "text", ...rest }) => <input name={name} defaultValue={text(value)} type={type} {...rest} />;
