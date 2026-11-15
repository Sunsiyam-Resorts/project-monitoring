// Audit Log: filters by action, user, company and date range plus a search; newest first,
// PAGE_SIZE entries per page.
import { Icon } from "../components/Icon.jsx";
import { Empty, PageHeader, RegionLabel, TableWrap } from "../components/ui.jsx";
import { actionLabel, date } from "../lib/format.js";
import { nameOf } from "../lib/selectors.js";
import { useApp, useAppState, useData } from "../lib/store.js";

const PAGE_SIZE = 20;
const day = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort((m, n) => m.localeCompare(n));
const Choices = ({ list, blank }) => <><option value="">{blank}</option>{list.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</>;

export function Audit() {
  const { actions } = useApp();
  const { state } = useData();
  const { auditSearch, auditFilter: f, auditPageNo } = useAppState();
  const q = auditSearch.trim().toLowerCase();
  const all = state.audit.slice().sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
  const rows = all.filter((x) =>
    (!f.action || actionLabel(x.action) === f.action) &&
    (!f.user || x.user === f.user) &&
    (!f.company || (f.company === "group" ? !x.companyId : x.companyId === f.company)) &&
    (!f.from || day(x.at) >= f.from) &&
    (!f.to || day(x.at) <= f.to) &&
    (!q || [actionLabel(x.action), x.action, x.user, x.detail, x.entity, x.companyId && nameOf(state, "companies", x.companyId)].join(" ").toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(Math.max(1, auditPageNo), pages);
  const start = (current - 1) * PAGE_SIZE;
  const shown = rows.slice(start, start + PAGE_SIZE);
  const actionsList = uniq(all.map((x) => actionLabel(x.action))).map((v) => [v, v]);
  const users = uniq(all.map((x) => x.user)).map((v) => [v, v]);
  const companies = [...state.companies.map((c) => [c.id, c.name]), ["group", "Group (no company)"]];
  const active = Boolean(f.action || f.user || f.company || f.from || f.to || q);
  // Page numbers: first, last, and two either side of the current page.
  const nums = [...new Set([1, pages, ...[-2, -1, 0, 1, 2].map((d) => current + d)])].filter((n) => n >= 1 && n <= pages).sort((m, n) => m - n);
  const change = (e) => actions.setAuditFilter(e.target.id, e.target.value);
  const emptyTitle = active ? "No matching entries" : "No audit entries yet";
  return (
    <>
      <PageHeader eyebrow="ADMINISTRATION" title="Audit Log" description="Every recorded action, newest first. Entries cannot be edited or removed in the portal." />
      <div className="filters audit-filters">
        <div><label htmlFor="auditAction">Action</label><select id="auditAction" value={f.action} onChange={change}><Choices list={actionsList} blank="All actions" /></select></div>
        <div><label htmlFor="auditUser">User</label><select id="auditUser" value={f.user} onChange={change}><Choices list={users} blank="All users" /></select></div>
        <div><label htmlFor="auditCompany">Company</label><select id="auditCompany" value={f.company} onChange={change}><Choices list={companies} blank="All companies" /></select></div>
        <div><label htmlFor="auditFrom">From</label><input id="auditFrom" type="date" value={f.from} onChange={change} /></div>
        <div><label htmlFor="auditTo">To</label><input id="auditTo" type="date" value={f.to} onChange={change} /></div>
        {active ? <button className="linkbtn" data-action="auditClear" onClick={() => actions.auditClear()}>Clear filters</button> : null}
      </div>
      <div className="list-toolbar">
        <div className="searchbox"><Icon name="search" /><input id="auditSearch" value={auditSearch} onChange={(e) => actions.setSearch("auditSearch", e.target.value)} aria-label="Search the audit log" placeholder="Search action, user, reference or detail" /></div>
        <small>{`${rows.length ? `${start + 1}–${start + shown.length} of ${rows.length}` : "0"} entries${rows.length !== all.length ? ` · ${all.length} in total` : ""}`}</small>
      </div>
      <RegionLabel.Provider value={rows.length ? "Data table" : emptyTitle}>
        <section className="panel flush">
          <TableWrap>
            <table className="audit-table">
              <thead><tr><th scope="col">Date and time</th><th scope="col">Action</th><th scope="col">User</th><th scope="col">Detail</th><th scope="col">Company</th></tr></thead>
              <tbody>
                {shown.map((x, i) => (
                  <tr key={x.id || i}>
                    <td className="audit-when">{date(x.at)}</td><td><strong>{actionLabel(x.action)}</strong></td><td>{x.user}</td>
                    <td>{x.detail || "—"}</td><td>{x.companyId ? nameOf(state, "companies", x.companyId) : "Group"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {!rows.length ? <Empty title={emptyTitle} note={active ? "Adjust or clear the filters." : "Recorded actions will appear here."} /> : null}
          <div className="table-footer"><span>{`Page ${current} of ${pages} · ${PAGE_SIZE} per page`}</span><span>Application audit trail · read-only</span></div>
        </section>
      </RegionLabel.Provider>
      {pages > 1 ? (
        <nav className="pager" aria-label="Audit log pages">
          <button data-action="auditGo" data-n={current - 1} disabled={current === 1} aria-label="Previous page" onClick={() => actions.auditGo(current - 1)}><span className="pager-back"><Icon name="chevron" /></span>Previous</button>
          <span className="pager-pages">
            {nums.map((n, i) => [
              i && n - nums[i - 1] > 1 ? <span key={`gap${n}`} className="pager-gap" aria-hidden="true">…</span> : null,
              <button key={n} data-action="auditGo" data-n={n} aria-current={n === current ? "page" : undefined} className={n === current ? "current" : undefined} aria-label={`Page ${n}`} onClick={() => actions.auditGo(n)}>{n}</button>,
            ])}
          </span>
          <button data-action="auditGo" data-n={current + 1} disabled={current === pages} aria-label="Next page" onClick={() => actions.auditGo(current + 1)}>Next<Icon name="chevron" /></button>
        </nav>
      ) : null}
    </>
  );
}
