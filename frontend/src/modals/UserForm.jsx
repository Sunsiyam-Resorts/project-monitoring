import { ROLES } from "../domain/domain.js";
import { Field, Input, Section } from "../components/ui.jsx";
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
        <Section number="01" title="Account identity">
          <div className="grid2">
            <Field label="Full name"><Input name="name" value={u?.name} required /></Field>
            <Field label="Username"><Input name="username" value={u?.username} required /></Field>
            <Field label="Email for password reset"><Input name="email" value={u?.email} type="email" required /></Field>
            <Field label={u ? "New password · leave blank to keep" : "Initial password"}>
              <Input name="password" value="" type="password" minLength={12} maxLength={256} autoComplete="new-password" required={!u} />
            </Field>
          </div>
        </Section>
        <Section number="02" title="Role & responsibility">
          <div className="grid2">
            <Field label="Single role"><select name="role" id="userRole" defaultValue={u?.role || ROLES[0]}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
          </div>
          <p className="help">Finance raises requests and payment requests, reviews and pays them (never one they raised themselves), and manages budgets and master data. Planning manages project tasks only. Viewers can only read.</p>
        </Section>
        <Section number="03" title="Company access">
          <div className="checks">
            <label className="group-access"><input name="groupAccess" type="checkbox" defaultChecked={!!u?.groupAccess} />Full group access</label>
            {state.companies.map((c) => <label key={c.id}><input name="companies" type="checkbox" value={c.id} defaultChecked={!!u?.companies.includes(c.id)} />{c.name}</label>)}
          </div>
        </Section>
        <div className="checks"><label><input name="active" type="checkbox" defaultChecked={u?.active !== false} />Active account</label></div>
        <Footer label="Save user" note="Mandatory 2FA is enrolled at first sign-in." />
      </Form>
    </Modal>
  );
}
