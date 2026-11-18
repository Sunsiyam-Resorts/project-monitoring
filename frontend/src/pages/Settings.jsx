import { BusyButton, Field, FieldGrid, Help, Input, PageHeader, Section, text } from "../components/ui.jsx";
import { Footer, Form } from "../components/Form.jsx";
import { allOrders, allRequests } from "../lib/selectors.js";
import { useApp, useData } from "../lib/store.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function Settings() {
  const { actions } = useApp();
  const { state } = useData();
  const locks = Object.entries(state.locks).filter(([, l]) => l.expires > Date.now());
  const recordNumber = (id) => allOrders(state).find((o) => o.id === id)?.number || allRequests(state).find((r) => r.id === id)?.number || id;
  return (
    <>
      <PageHeader title="Settings" description="Reference formats and operational controls." />
      <Card className="overflow-hidden py-0">
        <Form kind="settings" className="px-7 pt-6 pb-6 max-md:px-5" onSubmit={(fd) => actions.submitSettings(fd)}>
          <div className="grid gap-7">
            <Section number="01" title="Reference numbering">
              <FieldGrid>
                <Field label="Request reference format"><Input name="orderFormat" value={state.settings.orderFormat} required maxLength={100} /></Field>
                <Field label="Payment request reference format"><Input name="numberFormat" value={state.settings.numberFormat} required maxLength={100} /></Field>
              </FieldGrid>
              <Help>{"Required tokens: {COMPANY}, {PROJECT}, {SEQ}. Optional: {YYYY}. Separate permanent sequences run for each company and project. Issued references never change."}</Help>
            </Section>
            <Section number="02" title="Record locks">
              <div className="max-w-xs"><Field label="Lock duration · minutes"><Input name="lockMinutes" value={10} type="number" readOnly /></Field></div>
            </Section>
          </div>
          <Footer label="Save settings" note="Sequence counters cannot be edited or reset." cancel={false} />
        </Form>
      </Card>
      <Card className="mt-6 gap-0 py-0">
        <CardHeader className="border-b border-border px-6 py-5"><CardTitle>Active locks</CardTitle></CardHeader>
        <CardContent className="px-6 py-2">
          {locks.length ? locks.map(([id, l]) => (
            <div key={id} className="stats-line flex items-center justify-between gap-4 border-b border-border py-3 text-[13px] last:border-b-0">
              <span>{`${text(recordNumber(id))} · ${text(l.name)}`}</span>
              <BusyButton size="sm" data-action="unlock" data-id={id} onRun={() => actions.unlock(id)}>Unlock</BusyButton>
            </div>
          )) : <p className="help py-3 text-xs text-muted-foreground">No active locks.</p>}
        </CardContent>
      </Card>
    </>
  );
}
