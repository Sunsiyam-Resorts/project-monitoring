import { money, parentAmount, reservation, today } from "../domain/domain.js";
import { DateInput, Field, FieldGrid, FormSelect, Input, Section, TextArea, text } from "../components/ui.jsx";
import { Footer, Form } from "../components/Form.jsx";
import { fmt } from "../lib/format.js";
import { useApp, useData } from "../lib/store.js";
import { Modal } from "./ModalHost.jsx";

// The payment currency's form field: "firstcurrency" in the new request form (where
// "currency" is the order's), "currency" in the payment request form.
const paymentCurrencyName = (f) => (f.dataset.form === "order" ? "firstcurrency" : "currency");

// Percent and amount follow each other both ways, converting through the order and
// payment currencies (a saved payment rate is kept while its currency is unchanged).
// Selects keep their value in the shadcn Select's hidden native select (form.elements).
export function syncPayment(target, state) {
  const f = target.form;
  if (!f || !f.querySelector("#paymentAmount")) return;
  const o = state.orders.find((o) => o.id === f.dataset.order),
    total = o?.total || Number(f.elements.total?.value),
    orderCurrency = o?.currency || f.elements.currency?.value,
    orderRate = o?.rate || state.currencies.find((c) => c.id === orderCurrency)?.rate || 1,
    cur = f.elements[paymentCurrencyName(f)]?.value,
    existing = state.requests.find((r) => r.id === f.dataset.id),
    rate = existing?.currency === cur ? existing.rate : cur === orderCurrency ? orderRate : state.currencies.find((c) => c.id === cur)?.rate || 1,
    p = f.querySelector("#paymentPercent"),
    a = f.querySelector("#paymentAmount");
  if (target.id === "paymentAmount") p.value = total ? Number(((((Number(a.value) / rate) * orderRate) / total) * 100).toFixed(6)) : "";
  else a.value = money(((total * Number(p.value)) / 100 / orderRate) * rate);
}

export const syncsPayment = (t) => ["paymentPercent", "paymentAmount"].includes(t.id) || ["total", "currency", "firstcurrency"].includes(t.name);

// The payment request fields, also used for the first payment in the new request form, where
// the payment currency follows the order currency (`currency` and `onCurrency`).
export function PaymentFields({ o, r, combined = false, currency: chosen, onCurrency }) {
  const { state } = useData();
  const prefix = combined ? "first" : "";
  const currency = r?.currency || o?.currency || "USD";
  const terms = r?.terms || (o ? state.requests.filter((x) => x.orderId === o.id && x.status !== "Rejected").at(-1)?.terms : "") || "";
  const options = state.currencies.map((c) => ({ value: c.id, label: c.id }));
  return (
    <FieldGrid>
      <Field label="Payment request date"><DateInput name={prefix + "date"} value={r?.date || today()} required /></Field>
      <Field label="Payment currency">
        {onCurrency
          ? <FormSelect id="paymentCurrency" name={prefix + "currency"} required value={chosen} onValueChange={onCurrency} options={options} />
          : <FormSelect id="paymentCurrency" name={prefix + "currency"} required defaultValue={currency} options={options} />}
      </Field>
      <Field label="Payment request %"><Input name={prefix + "percent"} value={r && o ? Number((parentAmount(r) / o.total * 100).toFixed(6)) : ""} type="number" required min="0.000001" max="100" step="any" id="paymentPercent" /></Field>
      <Field label="Payment Amount"><Input name={prefix + "amount"} value={r?.amount || ""} type="number" required min="0.01" step="0.01" id="paymentAmount" /></Field>
      <Field label="Payment terms" wide><TextArea name={prefix + "terms"} maxLength={1000} value={terms} /></Field>
    </FieldGrid>
  );
}

export function PaymentForm({ orderId, id }) {
  const { actions } = useApp();
  const { state } = useData();
  const o = state.orders.find((o) => o.id === orderId);
  const r = id ? state.requests.find((r) => r.id === id) : null;
  if (!o) return null;
  const live = () => actions.get().state;
  return (
    <Modal title={r ? "Edit payment request" : "Create Payment Request"}>
      <Form kind="payment" data-id={id || ""} data-order={orderId} onSubmit={(fd) => actions.submitPayment(id || "", orderId, fd)}
        onInput={(e) => { if (syncsPayment(e.target)) syncPayment(e.target, live()); }}
        onChange={(e) => { if (e.target.name === "currency") syncPayment(e.target, live()); }}>
        <div className="detail-lead mb-6 flex items-center justify-between gap-5 rounded-xl bg-muted p-6 max-sm:block max-sm:p-5">
          <div><strong className="font-display text-lg font-bold">{o.number}</strong><p className="mt-1 text-xs text-muted-foreground">{`Full order ${o.currency} ${fmt(o.total)}`}</p></div>
          <div className="lead-side flex flex-col text-right text-xs text-muted-foreground max-sm:mt-4 max-sm:text-left"><small>Remaining to request</small><strong className="text-[15px] font-semibold text-foreground tabular">{`${o.currency} ${fmt(o.total - reservation(state, o, id))}`}</strong></div>
        </div>
        <Section number="01" title="Payment details"><PaymentFields o={o} r={r} /></Section>
        {/* A new payment request goes straight to Finance; a corrected (returned) one goes back to it. */}
        <Footer label="Submit to Finance" note={r ? "The corrected payment request goes back to Finance." : "The payment request goes straight to Finance."} />
      </Form>
    </Modal>
  );
}
