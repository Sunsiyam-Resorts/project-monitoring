// Short dialogs: reasons for workflow decisions, payment recording, requested documents,
// restoring deleted records and project tasks.
import { TASK_STATUSES, today } from "../domain/domain.js";
import { DateInput, Field, FieldGrid, FormSelect, Input, Section, TextArea, text } from "../components/ui.jsx";
import { Notice, RecordLead } from "../components/detail.jsx";
import { Footer, Form } from "../components/Form.jsx";
import { fmt } from "../lib/format.js";
import { deletedRecord, nameOf } from "../lib/selectors.js";
import { useApp, useData } from "../lib/store.js";
import { Input as ShadcnInput } from "@/components/ui/input";
import { Modal } from "./ModalHost.jsx";

const Intro = ({ children }) => <p className="form-intro mb-5 text-[13px] text-muted-foreground">{children}</p>;
const PDFs = ({ required }) => <ShadcnInput name="files" type="file" accept="application/pdf,.pdf" multiple required={required} />;

const TITLES = {
  return: "Return to requester", reject: "Reject request", hold: "Place payment on hold", remark: "Add Finance remark",
  documents: "Request additional supporting", deletePayment: "Delete Payment", deleteOrder: "Delete request",
  deleteRequest: "Delete payment request", parentReject: "Reject request", amendReturn: "Return amendment", amendReject: "Reject amendment",
};

export function ReasonForm({ id, action }) {
  const { actions } = useApp();
  const { state } = useData();
  const r = state.requests.find((r) => r.id === id) || state.orders.find((o) => o.id === id);
  if (!r) return null;
  const intro = action === "documents" ? "Describe the documents needed. The requester can upload them directly back to Finance; existing approvals stay valid."
    : action === "deletePayment" ? "Payment details and payment supporting PDFs will be permanently cleared. The approved request returns to Pending Payment. A reason is mandatory and remains in the audit trail."
      : action === "deleteOrder" ? `The request${state.requests.some((x) => x.orderId === id) ? " and its draft payment requests" : ""} move to the Deleted page. They stop counting in the dashboard, balances and lists until an Admin restores them.`
        : action === "deleteRequest" ? `The payment request moves to the Deleted page with its ${text(r.status)} status and payment details intact. It stops counting in the dashboard, balances and lists until an Admin restores it.`
          : action === "parentReject" ? "All child payment requests must be rejected first. Paid children require Admin payment deletion before rejection."
            : action === "return" ? "The requester can correct the request and resubmit it to Finance."
              : action === "reject" ? "Record a clear reason for rejecting this payment request."
                : action === "hold" ? "Explain what needs to be resolved before payment can proceed."
                  : "Leave context for the Finance team and requester.";
  return (
    <Modal title={TITLES[action]}>
      <Form kind="reason" data-id={id} data-action-type={action} onSubmit={(fd) => actions.submitReason(id, action, fd)}>
        <Intro>{`${text(r.number)} · ${intro}`}</Intro>
        <Field label={action === "remark" ? "Remark" : "Reason"}>
          <TextArea name="reason" required maxLength={2000} placeholder="Give the team a clear explanation and next step." />
        </Field>
        <Footer label={action === "remark" ? "Add remark" : TITLES[action]} note="This action is recorded in the audit trail." />
      </Form>
    </Modal>
  );
}

export function PayForm({ id }) {
  const { actions } = useApp();
  const { state } = useData();
  const r = state.requests.find((r) => r.id === id);
  const o = r && state.orders.find((o) => o.id === r.orderId);
  if (!r || !o) return null;
  return (
    <Modal title="Record completed payment">
      <Form kind="pay" data-id={id} onSubmit={(fd) => actions.submitPay(id, fd)}>
        <RecordLead eyebrow="Exact payment required" currency={r.currency || o.currency} amount={fmt(r.amount)}
          side={<><strong>{r.number}</strong><small>{nameOf(state, "suppliers", o.supplierId)}</small></>} />
        <div className="grid gap-7">
        <Section number="01" title="Payment details">
          <FieldGrid>
            <Field label="Payment date"><DateInput name="paymentDate" value={today()} required max={today()} /></Field>
            <Field label="Payment type"><FormSelect name="paymentType" id="paymentType" required defaultValue="Transfer" options={["Transfer", "Cheque", "TT"].map((x) => ({ value: x, label: x }))} /></Field>
          </FieldGrid>
        </Section>
        <Section number="02" title="Payment evidence">
          <Field label="Payment supporting PDFs · optional · combined limit 2 MB"><PDFs /></Field>
        </Section>
        </div>
        <Notice>Attach evidence for this payment if you have it. The amount must be settled in full before marking it Paid.</Notice>
        <Footer label="Mark as Paid" note="Only Admin can delete a completed payment, with mandatory remarks." />
      </Form>
    </Modal>
  );
}

export function SupplyForm({ id }) {
  const { actions } = useApp();
  return (
    <Modal title="Supply requested documents">
      <Form kind="support" data-id={id} onSubmit={(fd) => actions.submitSupport(id, fd)}>
        <Field label="Supporting PDFs · combined limit 2 MB"><PDFs required /></Field>
        <Footer label="Submit to Finance" note="Document upload goes directly back to Finance." />
      </Form>
    </Modal>
  );
}

export function RestoreForm({ id, kind }) {
  const { actions } = useApp();
  const { state } = useData();
  const x = deletedRecord(state, id, kind);
  if (!x) return null;
  const drafts = kind === "order" ? (state.deletedRequests || []).filter((r) => r.deleted.withOrder === id && r.deleted.id === x.deleted.id) : [];
  const title = kind === "order" ? "Restore request" : "Restore payment request";
  const what = kind === "order"
    ? `The request${drafts.length ? ` and its draft payment request${drafts.length === 1 ? "" : "s"} ${drafts.map((r) => r.number).join(", ")}` : ""} return to how they were before deletion.`
    : `The payment request returns with its ${text(x.status)} status, approvals and payment details.`;
  return (
    <Modal title={title}>
      <Form kind="restore" data-id={id} data-kind={kind} onSubmit={() => actions.submitRestore(id, kind)}>
        <Intro>{`${text(x.number)} · ${what} It counts again in the dashboard, balances and lists.`}</Intro>
        <Footer label={title} note="This action is recorded in the audit trail." />
      </Form>
    </Modal>
  );
}

export function TaskForm({ projectId, id }) {
  const { actions } = useApp();
  const { state } = useData();
  const t = id ? state.tasks.find((x) => x.id === id) : null;
  const p = state.projects.find((x) => x.id === (t?.projectId || projectId));
  if (!p) return null;
  return (
    <Modal title={t ? "Edit task" : "Add task"}>
      <Form kind="task" data-id={id || ""} data-project={p.id} onSubmit={(fd) => actions.submitTask(id || "", p.id, fd)}>
        <Section number="01" title="Task">
          <FieldGrid>
            <Field label="Task name" wide><Input name="name" value={t?.name} required maxLength={120} /></Field>
            <Field label="Status"><FormSelect name="status" id="taskStatus" defaultValue={t?.status || "To do"} options={TASK_STATUSES.map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="Due date · optional"><DateInput name="due" value={t?.due} /></Field>
            <Field label="Owner · optional" wide><Input name="owner" value={t?.owner} maxLength={80} /></Field>
          </FieldGrid>
        </Section>
        <Footer label={t ? "Save task" : "Add task"} note={`${p.name} · progress counts the tasks marked Done.`} />
      </Form>
    </Modal>
  );
}

export function TaskDeleteForm({ id }) {
  const { actions } = useApp();
  const { state } = useData();
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return null;
  return (
    <Modal title="Delete task">
      <Form kind="taskDelete" data-id={id} onSubmit={() => actions.submitTaskDelete(id)}>
        <Intro>{`Delete “${t.name}”? Project progress is recalculated without it. The deletion is recorded in the audit log.`}</Intro>
        <Footer label="Delete task" note="This cannot be undone." />
      </Form>
    </Modal>
  );
}
