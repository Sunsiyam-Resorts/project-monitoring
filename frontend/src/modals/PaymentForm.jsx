import { money, parentAmount, reservation, today } from "../domain/domain.js";
import { Field, Input, Options, Section, text } from "../components/ui.jsx";
import { Footer, Form } from "../components/Form.jsx";
import { fmt } from "../lib/format.js";
import { useApp, useData } from "../lib/store.js";
import { Modal } from "./ModalHost.jsx";

// Percent and amount follow each other both ways, converting through the order and
// payment currencies (a saved payment rate is kept while its currency is unchanged).
export function syncPayment(target, state) {
  const f = target.form;
  if (!f || !f.querySelector("#paymentAmount")) return;
  const o = state.orders.find((o) => o.id === f.dataset.order),
    total = o?.total || Number(f.elements.total?.value),
    orderCurrency = o?.currency || f.elements.currency?.value,
    orderRate = o?.rate || state.currencies.find((c) => c.id === orderCurrency)?.rate || 1,
    cur = f.querySelector("#paymentCurrency").value,
    existing = state.requests.find((r) => r.id === f.dataset.id),
    rate = existing?.currency === cur ? existing.rate : cur === orderCurrency ? orderRate : state.currencies.find((c) => c.id === cur)?.rate || 1,
    p = f.querySelector("#paymentPercent"),
    a = f.querySelector("#paymentAmount");
  if (target.id === "paymentAmount") p.value = total ? Number(((((Number(a.value) / rate) * orderRate) / total) * 100).toFixed(6)) : "";
  else a.value = money(((total * Number(p.value)) / 100 / orderRate) * rate);
}

export const syncsPayment = (t) => ["paymentPercent", "paymentAmount", "paymentCurrency"].includes(t.id) || ["total", "currency"].includes(t.name);

// The payment request fields, also used for the first payment in the new request form.
export function PaymentFields({ o, r, combined = false }) {
  const { state } = useData();
  const prefix = combined ? "first" : "";
  const currency = r?.currency || o?.currency || "USD";
  const terms = r?.terms || (o ? state.requests.filter((x) => x.orderId === o.id && x.status !== "Rejected").at(-1)?.terms : "") || "";
  return (
    <div className="grid2">
      <Field label="Payment request date"><Input name={prefix + "date"} value={r?.date || today()} type="date" required /></Field>
      <Field label="Payment currency">
        <select id="paymentCurrency" name={prefix + "currency"} required defaultValue={currency}><Options items={state.currencies.map((c) => ({ ...c, name: c.id }))} /></select>
      </Field>
      <Field label="Payment request %"><Input name={prefix + "percent"} value={r && o ? Number((parentAmount(r) / o.total * 100).toFixed(6)) : ""} type="number" required min="0.000001" max="100" step="any" id="paymentPercent" /></Field>
      <Field label="Payment Amount"><Input name={prefix + "amount"} value={r?.amount || ""} type="number" required min="0.01" step="0.01" id="paymentAmount" /></Field>
      <Field label="Payment terms" wide><textarea name={prefix + "terms"} maxLength={1000} defaultValue={text(terms)}></textarea></Field>
    </div>
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
        onChange={(e) => { if (e.target.id === "paymentCurrency") syncPayment(e.target, live()); }}>
        <div className="detail-lead">
          <div><strong>{o.number}</strong><p>{`Full order ${o.currency} ${fmt(o.total)}`}</p></div>
          <div className="lead-side"><small>Remaining to request</small><strong>{`${o.currency} ${fmt(o.total - reservation(state, o, id))}`}</strong></div>
        </div>
        <Section number="01" title="Payment details"><PaymentFields o={o} r={r} /></Section>
        <Footer label="Save draft" note="Submit the draft to start its independent approval workflow." />
      </Form>
    </Modal>
  );
}
