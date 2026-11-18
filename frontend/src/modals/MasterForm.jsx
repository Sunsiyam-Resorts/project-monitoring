// Companies, projects, approved budgets (with revisions), suppliers and currencies.
import { useState } from "react";
import { randomId } from "../domain/domain.js";
import { Icon } from "../components/Icon.jsx";
import { Field, FieldGrid, FormSelect, Input, Section, TextArea, text } from "../components/ui.jsx";
import { Notice } from "../components/detail.jsx";
import { Footer, Form } from "../components/Form.jsx";
import { useApp, useData } from "../lib/store.js";
import { Button } from "@/components/ui/button";
import { Input as ShadcnInput } from "@/components/ui/input";
import { Modal } from "./ModalHost.jsx";
import { BudgetHistory } from "./parts.jsx";

const named = (list) => list.map((x) => ({ value: String(x.id), label: x.name }));

const BudgetRow = ({ c }) => (
  <div className="category-row grid grid-cols-[minmax(0,1fr)_minmax(140px,220px)] gap-3 max-sm:grid-cols-1" data-category={c.id}>
    <ShadcnInput name="categoryName" defaultValue={text(c.name)} required placeholder="Category name" aria-label="Category name" />
    <ShadcnInput name="categoryAmount" defaultValue={text(c.amount)} required type="number" min="0.01" step="0.01" placeholder="Approved amount" aria-label="Approved category amount" className="text-right tabular" />
  </div>
);

export function MasterForm({ kind, id }) {
  const { actions } = useApp();
  const { state } = useData();
  const r = id ? state[kind].find((x) => x.id === id) : null;
  // The project list follows the chosen company; category rows can be added.
  const [companyId, setCompanyId] = useState(r?.companyId || "");
  const [categories, setCategories] = useState(() => r?.categories || [{ id: randomId(), name: "", amount: "" }]);
  const currencies = state.currencies.map((c) => ({ value: c.id, label: c.id }));
  return (
    <Modal title={r ? "Edit / Revise master record" : "Add master record"}>
      <Form kind="master" data-id={id || ""} onSubmit={(fd, form) => actions.submitMaster(kind, id || "", fd, form)}>
        <div className="grid gap-7">
          <Section number="01" title="Record details">
            <FieldGrid>
              <Field label="Name"><Input name="name" value={r?.name} required maxLength={150} /></Field>
              {["companies", "projects"].includes(kind) ? <Field label="Short code"><Input name="code" value={r?.code} required pattern="[A-Za-z0-9]{2,12}" maxLength={12} /></Field> : null}
              {kind === "budgets" ? <Field label="Budget currency"><FormSelect name="currency" id="masterCurrency" required defaultValue={r?.currency || "USD"} options={currencies} /></Field> : null}
              {kind === "projects" || kind === "budgets" ? (
                <Field label="Company">
                  <FormSelect name="companyId" id="masterCompany" required disabled={!!r} value={companyId} onValueChange={setCompanyId} options={named(state.companies)} />
                </Field>
              ) : null}
              {kind === "budgets" ? (
                <Field label="Project">
                  <FormSelect key={companyId} name="projectId" id="masterProject" required disabled={!!r} defaultValue={r && companyId === r.companyId ? text(r.projectId) : ""}
                    options={named(r || companyId ? state.projects.filter((p) => p.companyId === companyId) : [])} />
                </Field>
              ) : null}
              {kind === "suppliers" ? <Field label="Email · optional"><Input name="email" value={r?.email} type="email" /></Field> : null}
              {kind === "currencies" ? (
                <>
                  <Field label="Currency code"><Input name="code" value={r?.id} required minLength={3} maxLength={3} readOnly={!!r} /></Field>
                  <Field label="Currency units per USD 1"><Input name="rate" value={r?.rate} type="number" required min="0.000001" step="0.000001" /></Field>
                </>
              ) : null}
            </FieldGrid>
          </Section>
          {kind === "budgets" ? (
            <Section number="02" title="Approved category amounts · selected budget currency">
              <div id="budgetCategories" className="grid gap-3">{categories.map((c) => <BudgetRow key={c.id} c={c} />)}</div>
              <div>
                <Button type="button" variant="outline" size="sm" data-action="addCategory" onClick={() => setCategories((cs) => [...cs, { id: randomId(), name: "", amount: "" }])}><Icon name="plus" />Add category</Button>
              </div>
              {r ? (
                <>
                  <Field label="Revision reason"><TextArea name="reason" required placeholder="Record why the approved budget is being revised." /></Field>
                  <Notice className="mt-0">The original budget and all prior revisions will be preserved.</Notice>
                </>
              ) : null}
            </Section>
          ) : null}
        </div>
        <BudgetHistory budget={r} />
        <Footer label="Save record" note={kind === "suppliers" ? "Suppliers are shared across all companies." : kind === "currencies" ? "USD is the base reporting currency." : "Managed by Finance and Admin."} />
      </Form>
    </Modal>
  );
}
