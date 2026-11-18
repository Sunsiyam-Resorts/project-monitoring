import { budgetAmount } from "../domain/domain.js";
import { Icon } from "../components/Icon.jsx";
import { DataTable, Empty, PageHeader, RegionLabel, text } from "../components/ui.jsx";
import { Sub, TableBody, TableCell, TableHead, TableHeader, TableRow, WORK_TABLE } from "../components/tables.jsx";
import { ListToolbar, SearchBox, TabCount } from "../components/Toolbar.jsx";
import { TableFooterNote } from "../components/TableFooterNote.jsx";
import { fmt } from "../lib/format.js";
import { nameOf } from "../lib/selectors.js";
import { useApp, useAppState, useData } from "../lib/store.js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const LABELS = { companies: "Companies", projects: "Projects", budgets: "Approved Budgets", suppliers: "Suppliers", currencies: "Currencies" };
const SINGULAR = { companies: "company", projects: "project", budgets: "budget", suppliers: "supplier", currencies: "currency" };

export function MasterData() {
  const { actions } = useApp();
  const { state } = useData();
  const { masterTab, masterSearch } = useAppState();
  const label = LABELS[masterTab].toLowerCase();
  const rows = state[masterTab].filter((r) => !masterSearch ||
    [r.name, r.email, nameOf(state, "companies", r.companyId), nameOf(state, "projects", r.projectId), r.id].join(" ").toLowerCase().includes(masterSearch.toLowerCase()));
  const emptyTitle = "No matching " + label;
  const details = (r) =>
    masterTab === "projects" ? nameOf(state, "companies", r.companyId)
      : masterTab === "budgets" ? <>{nameOf(state, "projects", r.projectId)}<Sub>{`USD ${fmt(budgetAmount(r))} · ${r.currency || "USD"} ${fmt(r.categories.reduce((a, c) => a + Number(c.amount), 0))} original · ${r.categories.length} categories · ${r.revisions.length} revisions`}</Sub></>
        : masterTab === "currencies" ? <><span className="currency mr-1 text-xs text-muted-foreground">1 USD =</span>{` ${fmt(r.rate)} ${r.id}`}</>
          : text(r.email || "—");
  return (
    <>
      <PageHeader title="Master data" description="The shared foundation for accurate budgets, requests and reporting."
        actions={<><Button variant="outline" data-action="import" onClick={() => actions.importForm()}>Import CSV / Excel</Button><Button data-action="newMaster" onClick={() => actions.newMaster()}><Icon name="plus" />{`Add ${SINGULAR[masterTab]}`}</Button></>} />
      <Tabs value={masterTab} onValueChange={(v) => actions.setMasterTab(v)} className="mb-6">
        <TabsList aria-label="View selection" className="tabs">
          {Object.entries(LABELS).map(([v, t]) => (
            <TabsTrigger key={v} value={v} data-master={v} className={masterTab === v ? "active" : ""} aria-pressed={String(masterTab === v)}>{t}<TabCount active={masterTab === v}>{state[v].length}</TabCount></TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <ListToolbar>
        <SearchBox id="masterSearch" label={`Search ${label}`} placeholder={`Search ${label}`} value={masterSearch} onChange={(v) => actions.setSearch("masterSearch", v)} />
        <small className="text-xs text-muted-foreground">{`${rows.length} ${label}`}</small>
      </ListToolbar>
      <RegionLabel.Provider value={rows.length ? "Data table" : emptyTitle}>
        <Card className="gap-0 overflow-hidden py-0">
          <DataTable className={WORK_TABLE}>
            <TableHeader><TableRow><TableHead scope="col">{masterTab === "currencies" ? "Currency" : "Name"}</TableHead><TableHead scope="col">{masterTab === "budgets" ? "Project / Approved amount" : masterTab === "currencies" ? "Rate against USD" : "Details"}</TableHead><TableHead scope="col"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell data-label="Name"><strong className="font-semibold">{r.name}</strong>{r.code ? <Sub>{r.code}</Sub> : null}{masterTab === "currencies" ? <Sub>{r.id}</Sub> : null}</TableCell>
                  <TableCell data-label="Details">{details(r)}</TableCell>
                  <TableCell className="text-right"><Button variant="link" className="linkbtn" data-action="editMaster" data-id={r.id} onClick={() => actions.editMaster(r.id)}>{masterTab === "budgets" ? "Edit / Revise" : "Edit"} <Icon name="arrow" className="size-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
          {!rows.length ? <Empty title={emptyTitle} note="Add a record or adjust your search." /> : null}
          <TableFooterNote left={`${LABELS[masterTab]} · ${rows.length} records`} right={masterTab === "suppliers" ? "Shared across all companies" : masterTab === "budgets" ? "Revision history is preserved" : "Admin-managed master data"} />
        </Card>
      </RegionLabel.Provider>
    </>
  );
}
