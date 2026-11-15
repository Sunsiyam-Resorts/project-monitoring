// Companies, projects, approved budgets (with revisions), suppliers and currencies.
import { useState } from "react";
import { randomId } from "../domain/domain.js";
import { Icon } from "../components/Icon.jsx";
import { Field, Input, Options, Section, text } from "../components/ui.jsx";
import { Footer, Form } from "../components/Form.jsx";
import { useApp, useData } from "../lib/store.js";
import { Modal } from "./ModalHost.jsx";
import { BudgetHistory } from "./parts.jsx";

const BudgetRow = ({ c }) => (
  <div className="category-row" data-category={c.id}>
    <input name="categoryName" defaultValue={text(c.name)} required placeholder="Category name" aria-label="Category name" />
    <input name="categoryAmount" defaultValue={text(c.amount)} required type="number" min="0.01" step="0.01" placeholder="Approved amount" aria-label="Approved category amount" />
    <span></span>
  </div>
);

export function MasterForm({ kind, id }) {
  const { actions } = useApp();
  const { state } = useData();
  const r = id ? state[kind].find((x) => x.id === id) : null;
  // The project list follows the chosen company; category rows can be added.
  const [companyId, setCompanyId] = useState(r?.companyId || "");
  const [categories, setCategories] = useState(() => r?.categories || [{ id: randomId(), name: "", amount: "" }]);
  const currencies = state.currencies.map((c) => ({ ...c, name: c.id }));
  return (
    <Modal title={r ? "Edit / Revise master record" : "Add master record"}>
      <Form kind="master" data-id={id || ""} onSubmit={(fd, form) => actions.submitMaster(kind, id || "", fd, form)}>
        <Section number="01" title="Record details">
          <div className="grid2">
            <Field label="Name"><Input name="name" value={r?.name} required maxLength={150} /></Field>
            {["companies", "projects"].includes(kind) ? <Field label="Short code"><Input name="code" value={r?.code} required pattern="[A-Za-z0-9]{2,12}" maxLength={12} /></Field> : null}
            {kind === "budgets" ? <Field label="Budget currency"><select name="currency" required defaultValue={r?.currency || "USD"}><Options items={currencies} /></select></Field> : null}
            {kind === "projects" || kind === "budgets" ? (
              <Field label="Company">
                <select name="companyId" id="masterCompany" required disabled={!!r} defaultValue={text(r?.companyId)} onChange={(e) => setCompanyId(e.target.value)}><Options items={state.companies} /></select>
              </Field>
            ) : null}
            {kind === "budgets" ? (
              <Field label="Project">
                <select key={companyId} name="projectId" id="masterProject" required disabled={!!r} defaultValue={r && companyId === r.companyId ? text(r.projectId) : ""}>
                  <Options items={r || companyId ? state.projects.filter((p) => p.companyId === companyId) : []} />
                </select>
              </Field>
            ) : null}
            {kind === "suppliers" ? <Field label="Email · optional"><Input name="email" value={r?.email} type="email" /></Field> : null}
            {kind === "currencies" ? (
              <>
                <Field label="Currency code"><Input name="code" value={r?.id} required minLength={3} maxLength={3} readOnly={!!r} /></Field>
                <Field label="Currency units per USD 1"><Input name="rate" value={r?.rate} type="number" required min="0.000001" step="0.000001" /></Field>
              </>
            ) : null}
          </div>
        </Section>
        {kind === "budgets" ? (
          <Section number="02" title="Approved category amounts · selected budget currency">
            <div id="budgetCategories">{categories.map((c) => <BudgetRow key={c.id} c={c} />)}</div>
            <div className="actions">
              <button type="button" data-action="addCategory" onClick={() => setCategories((cs) => [...cs, { id: randomId(), name: "", amount: "" }])}><Icon name="plus" />Add category</button>
            </div>
            {r ? (
              <>
                <div className="section-gap"><Field label="Revision reason"><textarea name="reason" required placeholder="Record why the approved budget is being revised."></textarea></Field></div>
                <div className="notice">The original budget and all prior revisions will be preserved.</div>
              </>
            ) : null}
          </Section>
        ) : null}
        <BudgetHistory budget={r} />
        <Footer label="Save record" note={kind === "suppliers" ? "Suppliers are shared across all companies." : kind === "currencies" ? "USD is the base reporting currency." : "Managed by Finance and Admin."} />
      </Form>
    </Modal>
  );
}
