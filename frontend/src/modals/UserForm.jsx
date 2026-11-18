import { ROLES } from "../domain/domain.js";
import { Check, Field, FieldGrid, FormSelect, Help, Input, Section } from "../components/ui.jsx";
import { Footer, Form } from "../components/Form.jsx";
import { useApp, useData } from "../lib/store.js";
import { Modal } from "./ModalHost.jsx";

export function UserForm({ id }) {
  const { actions } = useApp();
  const { state } = useData();
  const u = id ? state.users.find((u) => u.id === id) : null;
  return (
    <Modal title={u ? "Manage user" : "Create user"}>
      <Form kind="user" data-id={id || ""} onSubmit={(fd) => actions.submitUser(id || "", fd)}>
        <div className="grid gap-7">
          <Section number="01" title="Account identity">
            <FieldGrid>
              <Field label="Full name"><Input name="name" value={u?.name} required /></Field>
              <Field label="Username"><Input name="username" value={u?.username} required /></Field>
              <Field label="Email for password reset"><Input name="email" value={u?.email} type="email" required /></Field>
              <Field label={u ? "New password · leave blank to keep" : "Initial password"}>
                <Input name="password" value="" type="password" minLength={12} maxLength={256} autoComplete="new-password" required={!u} />
              </Field>
            </FieldGrid>
          </Section>
          <Section number="02" title="Role & responsibility">
            <FieldGrid>
              <Field label="Single role"><FormSelect name="role" id="userRole" defaultValue={u?.role || ROLES[0]} options={ROLES.map((r) => ({ value: r, label: r }))} /></Field>
            </FieldGrid>
            <Help>Finance raises requests and payment requests, reviews and pays them (never one they raised themselves), and manages budgets and master data. Planning manages project tasks only. Viewers can only read.</Help>
          </Section>
          <Section number="03" title="Company access">
            <div className="checks grid gap-3 sm:grid-cols-2">
              <Check name="groupAccess" defaultChecked={!!u?.groupAccess} className="group-access font-semibold sm:col-span-2">Full group access</Check>
              {state.companies.map((c) => <Check key={c.id} name="companies" value={c.id} defaultChecked={!!u?.companies.includes(c.id)}>{c.name}</Check>)}
            </div>
          </Section>
          <div className="checks"><Check name="active" defaultChecked={u?.active !== false}>Active account</Check></div>
        </div>
        <Footer label="Save user" note="Mandatory 2FA is enrolled at first sign-in." />
      </Form>
    </Modal>
  );
}
