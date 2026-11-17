import { budgetAmount } from "../domain/domain.js";
import { Icon } from "../components/Icon.jsx";
import { Empty, PageHeader, RegionLabel, TableWrap, Tabs, text } from "../components/ui.jsx";
import { fmt } from "../lib/format.js";
import { nameOf } from "../lib/selectors.js";
import { useApp, useAppState, useData } from "../lib/store.js";

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
      : masterTab === "budgets" ? <>{nameOf(state, "projects", r.projectId)}<span className="secondary">{`USD ${fmt(budgetAmount(r))} · ${r.currency || "USD"} ${fmt(r.categories.reduce((a, c) => a + Number(c.amount), 0))} original · ${r.categories.length} categories · ${r.revisions.length} revisions`}</span></>
        : masterTab === "currencies" ? <><span className="currency">1 USD =</span>{` ${fmt(r.rate)} ${r.id}`}</>
          : text(r.email || "—");
  return (
    <>
      <PageHeader eyebrow="ADMINISTRATION" title="Master data" description="The shared foundation for accurate budgets, requests and reporting."
        actions={<><button data-action="import" onClick={() => actions.importForm()}>Import CSV / Excel</button><button className="primary" data-action="newMaster" onClick={() => actions.newMaster()}><Icon name="plus" />{`Add ${SINGULAR[masterTab]}`}</button></>} />
      <Tabs>
        {Object.entries(LABELS).map(([v, t]) => (
          <button key={v} data-master={v} className={masterTab === v ? "active" : ""} aria-pressed={String(masterTab === v)} onClick={() => actions.setMasterTab(v)}>{t}<span className="count">{state[v].length}</span></button>
        ))}
      </Tabs>
      <div className="list-toolbar">
        <div className="searchbox"><Icon name="search" /><input id="masterSearch" value={masterSearch} onChange={(e) => actions.setSearch("masterSearch", e.target.value)} aria-label={`Search ${label}`} placeholder={`Search ${label}`} /></div>
        <small>{`${rows.length} ${label}`}</small>
      </div>
      <RegionLabel.Provider value={rows.length ? "Data table" : emptyTitle}>
        <section className="panel flush">
          <TableWrap>
            <table>
              <thead><tr><th scope="col">{masterTab === "currencies" ? "Currency" : "Name"}</th><th scope="col">{masterTab === "budgets" ? "Project / Approved amount" : masterTab === "currencies" ? "Rate against USD" : "Details"}</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong>{r.code ? <span className="secondary">{r.code}</span> : null}{masterTab === "currencies" ? <span className="secondary">{r.id}</span> : null}</td>
                    <td>{details(r)}</td>
                    <td className="right"><button className="linkbtn" data-action="editMaster" data-id={r.id} onClick={() => actions.editMaster(r.id)}>{masterTab === "budgets" ? "Edit / Revise" : "Edit"} <Icon name="arrow" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {!rows.length ? <Empty title={emptyTitle} note="Add a record or adjust your search." /> : null}
          <div className="table-footer"><span>{`${LABELS[masterTab]} · ${rows.length} records`}</span><span>{masterTab === "suppliers" ? "Shared across all companies" : masterTab === "budgets" ? "Revision history is preserved" : "Admin-managed master data"}</span></div>
        </section>
      </RegionLabel.Provider>
    </>
  );
}
