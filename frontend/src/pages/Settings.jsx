import { Field, Input, PageHeader, Section, BusyButton, text } from "../components/ui.jsx";
import { Footer, Form } from "../components/Form.jsx";
import { allOrders, allRequests } from "../lib/selectors.js";
import { useApp, useData } from "../lib/store.js";

export function Settings() {
  const { actions } = useApp();
  const { state } = useData();
  const locks = Object.entries(state.locks).filter(([, l]) => l.expires > Date.now());
  const recordNumber = (id) => allOrders(state).find((o) => o.id === id)?.number || allRequests(state).find((r) => r.id === id)?.number || id;
  return (
    <>
      <PageHeader eyebrow="ADMINISTRATION" title="Settings" description="Reference formats and operational controls." />
      <Form kind="settings" onSubmit={(fd) => actions.submitSettings(fd)}>
        <section className="panel">
          <Section number="01" title="Reference numbering">
            <div className="grid2">
              <Field label="Request reference format"><Input name="orderFormat" value={state.settings.orderFormat} required maxLength={100} /></Field>
              <Field label="Payment request reference format"><Input name="numberFormat" value={state.settings.numberFormat} required maxLength={100} /></Field>
            </div>
            <p className="help">{"Required tokens: {COMPANY}, {PROJECT}, {SEQ}. Optional: {YYYY}. Separate permanent sequences run for each company and project. Issued references never change."}</p>
          </Section>
          <Section number="02" title="Record locks">
            <Field label="Lock duration · minutes"><Input name="lockMinutes" value={10} type="number" readOnly /></Field>
          </Section>
          <Footer label="Save settings" note="Sequence counters cannot be edited or reset." />
        </section>
      </Form>
      <section className="panel section-gap">
        <div className="section-title"><h2>Active locks</h2></div>
        {locks.length ? locks.map(([id, l]) => (
          <div key={id} className="stats-line">
            <span>{`${text(recordNumber(id))} · ${text(l.name)}`}</span>
            <BusyButton data-action="unlock" data-id={id} onRun={() => actions.unlock(id)}>Unlock</BusyButton>
          </div>
        )) : <p className="help">No active locks.</p>}
      </section>
    </>
  );
}
