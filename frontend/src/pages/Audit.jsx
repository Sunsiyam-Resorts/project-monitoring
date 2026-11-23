// Audit Log: filters by action, user, company and date range plus a search; newest first,
// PAGE_SIZE entries per page (shadcn Select, Input, Table and Pagination).
import { DataTable, DateInput, Empty, FormSelect, PageHeader, RegionLabel } from "../components/ui.jsx";
import { TableBody, TableCell, TableHead, TableHeader, TableRow, WORK_TABLE } from "../components/tables.jsx";
import { ListToolbar, SearchBox } from "../components/Toolbar.jsx";
import { TableFooterNote } from "../components/TableFooterNote.jsx";
import { actionLabel, date } from "../lib/format.js";
import { nameOf } from "../lib/selectors.js";
import { useApp, useAppState, useData } from "../lib/store.js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

const PAGE_SIZE = 20;
const day = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort((m, n) => m.localeCompare(n));
const options = (list) => list.map(([value, label]) => ({ value, label }));

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
  const set = (id) => (value) => actions.setAuditFilter(id, value);
  const go = (n) => (e) => { e.preventDefault(); actions.auditGo(n); };
  const emptyTitle = active ? "No matching entries" : "No audit entries yet";
  const select = (id, label, list, blank) => (
    <div className="grid min-w-[150px] flex-1 gap-1.5 sm:max-w-[220px]"><Label htmlFor={id} className="text-xs">{label}</Label><FormSelect id={id} value={f[id.replace("audit", "").toLowerCase()]} onValueChange={set(id)} clearable blank={blank} options={options(list)} /></div>
  );
  return (
    <>
      <PageHeader title="Audit Log" description="Every recorded action, newest first. Entries cannot be edited or removed in the portal." />
      <div className="filters audit-filters mb-6 flex flex-wrap items-end gap-3">
        {select("auditAction", "Action", actionsList, "All actions")}
        {select("auditUser", "User", users, "All users")}
        {select("auditCompany", "Company", companies, "All companies")}
        <div className="grid gap-1.5"><Label htmlFor="auditFrom" className="text-xs">From</Label><DateInput id="auditFrom" value={f.from} onChange={(v) => actions.setAuditFilter("auditFrom", v)} className="w-[168px]" /></div>
        <div className="grid gap-1.5"><Label htmlFor="auditTo" className="text-xs">To</Label><DateInput id="auditTo" value={f.to} onChange={(v) => actions.setAuditFilter("auditTo", v)} className="w-[168px]" /></div>
        {active ? <Button variant="link" className="linkbtn self-center" data-action="auditClear" onClick={() => actions.auditClear()}>Clear filters</Button> : null}
      </div>
      <ListToolbar>
        <SearchBox id="auditSearch" label="Search the audit log" placeholder="Search action, user, reference or detail" value={auditSearch} onChange={(v) => actions.setSearch("auditSearch", v)} />
        <small className="text-xs text-muted-foreground">{`${rows.length ? `${start + 1}–${start + shown.length} of ${rows.length}` : "0"} entries${rows.length !== all.length ? ` · ${all.length} in total` : ""}`}</small>
      </ListToolbar>
      <RegionLabel.Provider value={rows.length ? "Data table" : emptyTitle}>
        <Card className="gap-0 overflow-hidden py-0">
          <DataTable className={`audit-table ${WORK_TABLE}`}>
            <TableHeader><TableRow><TableHead scope="col">Date and time</TableHead><TableHead scope="col">Action</TableHead><TableHead scope="col">User</TableHead><TableHead scope="col">Detail</TableHead><TableHead scope="col">Company</TableHead></TableRow></TableHeader>
            <TableBody>
              {shown.map((x, i) => (
                <TableRow key={x.id || i}>
                  <TableCell data-label="Date and time" className="audit-when whitespace-nowrap text-muted-foreground">{date(x.at)}</TableCell>
                  <TableCell data-label="Action"><strong className="font-semibold">{actionLabel(x.action)}</strong></TableCell>
                  <TableCell data-label="User">{x.user}</TableCell>
                  <TableCell data-label="Detail" className="break-words whitespace-normal">{x.detail || "—"}</TableCell>
                  <TableCell data-label="Company">{x.companyId ? nameOf(state, "companies", x.companyId) : "Group"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
          {!rows.length ? <Empty title={emptyTitle} note={active ? "Adjust or clear the filters." : "Recorded actions will appear here."} /> : null}
          <TableFooterNote left={`Page ${current} of ${pages} · ${PAGE_SIZE} per page`} right="Application audit trail · read-only" />
        </Card>
      </RegionLabel.Provider>
      {pages > 1 ? (
        <Pagination className="pager mt-4" aria-label="Audit log pages">
          <PaginationContent className="flex-wrap justify-center">
            <PaginationItem><PaginationPrevious href="#" data-action="auditGo" data-n={current - 1} aria-disabled={current === 1 ? "true" : undefined} aria-label="Previous page" onClick={go(current - 1)} /></PaginationItem>
            {nums.map((n, i) => [
              i && n - nums[i - 1] > 1 ? <PaginationItem key={`gap${n}`}><PaginationEllipsis className="pager-gap" /></PaginationItem> : null,
              <PaginationItem key={n}><PaginationLink href="#" data-action="auditGo" data-n={n} isActive={n === current} className={n === current ? "current" : undefined} aria-label={`Page ${n}`} onClick={go(n)}>{n}</PaginationLink></PaginationItem>,
            ])}
            <PaginationItem><PaginationNext href="#" data-action="auditGo" data-n={current + 1} aria-disabled={current === pages ? "true" : undefined} aria-label="Next page" onClick={go(current + 1)} /></PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </>
  );
}
