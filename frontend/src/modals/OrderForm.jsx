// New request (with its first payment request) or an amendment of an existing request.
import { useId, useState } from "react";
import { Field, Input, Options, Section, text } from "../components/ui.jsx";
import { Footer, Form } from "../components/Form.jsx";
import { fmt } from "../lib/format.js";
import { useApp, useData } from "../lib/store.js";
import { Modal } from "./ModalHost.jsx";
import { PaymentFields, syncPayment, syncsPayment } from "./PaymentForm.jsx";

function AllocationRow({ budget, category, value }) {
  const id = useId();
  return (
    <div className="category-row">
      <label htmlFor={id}>{category.name}<br /><small>{`Approved ${budget.currency || "USD"} ${fmt(category.amount)}`}</small></label>
      <input id={id} name={`allocation_${category.id}`} type="number" min="0" step="0.01" placeholder="Amount" defaultValue={value} aria-label={`${category.name} amount`} />
      <span></span>
    </div>
  );
}

function AllocationInputs({ budgetId, allocations = [] }) {
  const { state } = useData();
  const b = state.budgets.find((b) => b.id === budgetId);
  return b ? b.categories.map((c) => <AllocationRow key={c.id} budget={b} category={c} value={allocations.find((a) => a.categoryId === c.id)?.amount || ""} />) : null;
}

// preset: { companyId, projectId } fills the company, project and (when the project has
// only one) the approved budget for a new request raised from a project page.
export function OrderForm({ id, preset }) {
  const { actions } = useApp();
  const { state } = useData();
  const effective = id ? state.orders.find((o) => o.id === id) : null;
  const o = effective?.amendment?.status === "Draft" ? { ...effective, ...effective.amendment.data } : effective;
  const presetBudgets = !o && preset ? state.budgets.filter((b) => b.projectId === preset.projectId) : [];
  const scope = o || (preset ? { ...preset, budgetId: presetBudgets.length === 1 ? presetBudgets[0].id : "" } : null);
  // Company, project and budget narrow each other; changing one clears the allocations below it.
  const [pick, setPick] = useState(() => ({
    companyId: text(scope?.companyId), projectId: text(scope?.projectId), budgetId: text(scope?.budgetId),
    allocations: o ? "order" : scope?.budgetId ? "budget" : "notice",
  }));
  const [readout, setReadout] = useState(null);
  const choose = (patch) => setPick((p) => ({ ...p, ...patch }));
  const fixed = o ? { disabled: true, "aria-describedby": "identityNote" } : {};
  const live = () => actions.get().state;

  function onInput(e) {
    const form = e.currentTarget;
    const total = Number(form.elements.total.value);
    const allocated = [...form.querySelectorAll("[name^=allocation_]")].reduce((n, x) => n + Number(x.value || 0), 0);
    setReadout({ text: form.elements.currency.value + " " + fmt(allocated) + " / " + fmt(total), mismatch: String(Math.abs(allocated - total) > 0.005) });
    if (syncsPayment(e.target)) syncPayment(e.target, live());
  }

  function onChange(e) {
    const t = e.target;
    if (t.id === "paymentCurrency") syncPayment(t, live());
    else if (t.name === "currency" && !id) {
      t.form.querySelector("#paymentCurrency").value = t.value;
      syncPayment(t, live());
    }
  }

  return (
    <Modal title={o ? "Amend request" : "New Request"}>
      <Form kind="order" data-id={id || ""} onSubmit={(fd) => actions.submitOrder(id || "", fd)} onInput={onInput} onChange={onChange}>
        <div className="form-intro">
          <p>Enter the order details and its first payment request. Each payment request is submitted to Finance separately.</p>
          {o ? <p className="help" id="identityNote">Company, project and order currency stay fixed to preserve references and saved payment conversions.</p> : null}
        </div>
        <Section number="01" title="Company & budget">
          <div className="grid2">
            <Field label="Company">
              <select name="companyId" id="formCompany" required value={pick.companyId} {...fixed}
                onChange={(e) => choose({ companyId: e.target.value, projectId: "", budgetId: "", allocations: "empty" })}>
                <Options items={state.companies} />
              </select>
            </Field>
            <Field label="Project">
              <select name="projectId" id="formProject" required value={pick.projectId} {...fixed}
                onChange={(e) => choose({ projectId: e.target.value, budgetId: "", allocations: "empty" })}>
                <Options items={state.projects.filter((p) => p.companyId === pick.companyId)} />
              </select>
            </Field>
            <Field label="Approved budget">
              <select name="budgetId" id="formBudget" required value={pick.budgetId}
                onChange={(e) => choose({ budgetId: e.target.value, allocations: "budget" })}>
                <Options items={state.budgets.filter((b) => b.projectId === pick.projectId)} />
              </select>
            </Field>
            <Field label="Supplier"><select name="supplierId" required defaultValue={text(o?.supplierId)}><Options items={state.suppliers} /></select></Field>
          </div>
        </Section>
        <Section number="02" title="Order details">
          <div className="grid2">
            <Field label="PO number"><Input name="po" value={o?.po} required maxLength={100} /></Field>
            <Field label="Invoice number · optional for advance"><Input name="invoice" value={o?.invoice} maxLength={100} /></Field>
            <Field label="Currency">
              <select name="currency" required defaultValue={o?.currency || "USD"} {...fixed}><Options items={state.currencies.map((c) => ({ ...c, name: c.id + " — " + c.name }))} /></select>
            </Field>
            <Field label="Full order amount"><Input name="total" value={o?.total} type="number" required min="0.01" step="0.01" /></Field>
            <Field label="Description" wide>
              <textarea name="description" required maxLength={3000} placeholder="Describe the goods, services or works covered by this order." defaultValue={text(o?.description)}></textarea>
            </Field>
          </div>
        </Section>
        <Section number="03" title="Budget category allocations">
          <div id="allocations">
            {pick.allocations === "order" ? <AllocationInputs budgetId={o.budgetId} allocations={o.allocations} />
              : pick.allocations === "budget" ? <AllocationInputs budgetId={pick.budgetId} />
                : pick.allocations === "notice" ? <div className="notice">Select an approved budget above to see its categories.</div> : null}
          </div>
          <div className="allocation-total"><span>Total allocated</span><span id="allocationReadout" data-mismatch={readout?.mismatch}>{readout ? readout.text : fmt(o?.total || 0)}</span></div>
          <p className="help">Allocate the full amount in the selected order currency. Category totals must match the order. Budget overruns warn without blocking submission.</p>
        </Section>
        <Section number="04" title="Supporting documents">
          <Field label="Supporting PDFs · optional · combined limit 2 MB">
            <input type="file" name="files" accept="application/pdf,.pdf" multiple />
            <div className="help">{o ? "Choose whether new uploads supplement or replace existing supporting." : "Attach the order’s supporting evidence if you have it. Files belong to this main request."}</div>
            {o ? <select name="fileMode" aria-label="Supporting file update"><option value="append">Add to existing documents</option><option value="replace">Replace existing documents</option></select> : null}
          </Field>
        </Section>
        {o ? (
          <Section number="05" title="Amendment reason"><Field label="Reason"><textarea name="reason" required></textarea></Field></Section>
        ) : (
          <Section number="05" title="First payment request"><PaymentFields o={null} r={null} combined /></Section>
        )}
        <Footer label={o ? "Submit amendment" : "Create Request"} note={o ? "Finance reviews the amendment before it takes effect." : "The first payment request goes straight to Finance."} />
      </Form>
    </Modal>
  );
}
