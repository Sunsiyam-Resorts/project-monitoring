// New request (with its first payment request) or an amendment of an existing request.
import { useEffect, useId, useRef, useState } from "react";
import { Field, FieldGrid, FormSelect, Help, Input, Section, TextArea, text } from "../components/ui.jsx";
import { Notice } from "../components/detail.jsx";
import { Footer, Form } from "../components/Form.jsx";
import { fmt } from "../lib/format.js";
import { useApp, useData } from "../lib/store.js";
import { Input as ShadcnInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "./ModalHost.jsx";
import { PaymentFields, syncPayment, syncsPayment } from "./PaymentForm.jsx";

const named = (list) => list.map((x) => ({ value: String(x.id), label: x.name }));

function AllocationRow({ budget, category, value }) {
  const id = useId();
  return (
    <div className="category-row grid grid-cols-[minmax(0,1fr)_minmax(140px,220px)] items-center gap-4 border-b border-border py-3 last:border-b-0 max-sm:grid-cols-1 max-sm:gap-2">
      <Label htmlFor={id} className="flex flex-col items-start gap-0.5">{category.name}<small className="text-[11px] font-normal text-muted-foreground">{`Approved ${budget.currency || "USD"} ${fmt(category.amount)}`}</small></Label>
      <ShadcnInput id={id} name={`allocation_${category.id}`} type="number" min="0" step="0.01" placeholder="Amount" defaultValue={value} aria-label={`${category.name} amount`} className="text-right tabular" />
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
  // A new request's first payment currency follows the order currency until changed.
  const [currency, setCurrency] = useState(() => ({ order: o?.currency || "USD", payment: o?.currency || "USD" }));
  const [readout, setReadout] = useState(null);
  const choose = (patch) => setPick((p) => ({ ...p, ...patch }));
  const fixed = o ? { disabled: true, "aria-describedby": "identityNote" } : {};
  const live = () => actions.get().state;

  const form = useRef(null);

  function tally(f) {
    const total = Number(f.elements.total.value);
    const allocated = [...f.querySelectorAll("[name^=allocation_]")].reduce((n, x) => n + Number(x.value || 0), 0);
    setReadout({ text: f.elements.currency.value + " " + fmt(allocated) + " / " + fmt(total), mismatch: String(Math.abs(allocated - total) > 0.005) });
  }

  function onInput(e) {
    tally(e.currentTarget);
    if (syncsPayment(e.target)) syncPayment(e.target, live());
  }

  // After a currency changes (the selects' hidden native selects already hold the new values),
  // recompute the payment amount from its percentage and refresh the allocation total.
  const shown = useRef(currency);
  useEffect(() => {
    const f = form.current;
    if (shown.current === currency || !f) return;
    shown.current = currency;
    tally(f);
    if (!id) syncPayment(f.elements.total, live());
  }, [currency]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal title={o ? "Amend request" : "New Request"}>
      <Form kind="order" data-id={id || ""} ref={form} onSubmit={(fd) => actions.submitOrder(id || "", fd)} onInput={onInput}>
        <div className="form-intro mb-6 grid gap-1.5 text-[13px] text-muted-foreground">
          <p>Enter the order details and its first payment request. Each payment request is submitted to Finance separately.</p>
          {o ? <Help id="identityNote">Company, project and order currency stay fixed to preserve references and saved payment conversions.</Help> : null}
        </div>
        <div className="grid gap-7">
          <Section number="01" title="Company & budget">
            <FieldGrid>
              <Field label="Company">
                <FormSelect name="companyId" id="formCompany" required value={pick.companyId} {...fixed} options={named(state.companies)}
                  onValueChange={(v) => choose({ companyId: v, projectId: "", budgetId: "", allocations: "empty" })} />
              </Field>
              <Field label="Project">
                <FormSelect name="projectId" id="formProject" required value={pick.projectId} {...fixed} options={named(state.projects.filter((p) => p.companyId === pick.companyId))}
                  onValueChange={(v) => choose({ projectId: v, budgetId: "", allocations: "empty" })} />
              </Field>
              <Field label="Approved budget">
                <FormSelect name="budgetId" id="formBudget" required value={pick.budgetId} options={named(state.budgets.filter((b) => b.projectId === pick.projectId))}
                  onValueChange={(v) => choose({ budgetId: v, allocations: "budget" })} />
              </Field>
              <Field label="Supplier"><FormSelect name="supplierId" id="formSupplier" required defaultValue={text(o?.supplierId)} options={named(state.suppliers)} /></Field>
            </FieldGrid>
          </Section>
          <Section number="02" title="Order details">
            <FieldGrid>
              <Field label="PO number"><Input name="po" value={o?.po} required maxLength={100} /></Field>
              <Field label="Invoice number · optional for advance"><Input name="invoice" value={o?.invoice} maxLength={100} /></Field>
              <Field label="Currency">
                <FormSelect name="currency" id="formCurrency" required value={currency.order} {...fixed}
                  options={state.currencies.map((c) => ({ value: c.id, label: c.id + " — " + c.name }))}
                  onValueChange={(v) => setCurrency({ order: v, payment: v })} />
              </Field>
              <Field label="Full order amount"><Input name="total" value={o?.total} type="number" required min="0.01" step="0.01" /></Field>
              <Field label="Description" wide>
                <TextArea name="description" required maxLength={3000} placeholder="Describe the goods, services or works covered by this order." value={text(o?.description)} />
              </Field>
            </FieldGrid>
          </Section>
          <Section number="03" title="Budget category allocations">
            <div id="allocations" className="grid">
              {pick.allocations === "order" ? <AllocationInputs budgetId={o.budgetId} allocations={o.allocations} />
                : pick.allocations === "budget" ? <AllocationInputs budgetId={pick.budgetId} />
                  : pick.allocations === "notice" ? <Notice className="mt-0">Select an approved budget above to see its categories.</Notice> : null}
            </div>
            <div className="allocation-total flex items-center justify-between rounded-xl bg-muted px-4 py-3 text-[13px] font-semibold">
              <span>Total allocated</span>
              <span id="allocationReadout" data-mismatch={readout?.mismatch} className="tabular data-[mismatch=true]:text-danger">{readout ? readout.text : fmt(o?.total || 0)}</span>
            </div>
            <Help>Allocate the full amount in the selected order currency. Category totals must match the order. Budget overruns warn without blocking submission.</Help>
          </Section>
          <Section number="04" title="Supporting documents">
            <Field label="Supporting PDFs · optional · combined limit 2 MB">
              <ShadcnInput type="file" name="files" accept="application/pdf,.pdf" multiple />
              <Help>{o ? "Choose whether new uploads supplement or replace existing supporting." : "Attach the order’s supporting evidence if you have it. Files belong to this main request."}</Help>
            </Field>
            {o ? (
              <div className="max-w-sm">
                <FormSelect name="fileMode" aria-label="Supporting file update" defaultValue="append"
                  options={[{ value: "append", label: "Add to existing documents" }, { value: "replace", label: "Replace existing documents" }]} />
              </div>
            ) : null}
          </Section>
          {o ? (
            <Section number="05" title="Amendment reason"><Field label="Reason"><TextArea name="reason" required /></Field></Section>
          ) : (
            <Section number="05" title="First payment request">
              <PaymentFields o={null} r={null} combined currency={currency.payment} onCurrency={(v) => setCurrency((c) => ({ ...c, payment: v }))} />
            </Section>
          )}
        </div>
        <Footer label={o ? "Submit amendment" : "Create Request"} note={o ? "Finance reviews the amendment before it takes effect." : "The first payment request goes straight to Finance."} />
      </Form>
    </Modal>
  );
}
