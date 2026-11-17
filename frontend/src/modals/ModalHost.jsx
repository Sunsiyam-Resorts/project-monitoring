// The workspace dialog lives in <dialog id="modal"> (index.html), outside the React root.
// Each show remounts the view from a snapshot of the workspace taken at that moment, so a
// dialog changes only when an action shows it again.
import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../components/Icon.jsx";
import { DataContext, useApp, useAppState } from "../lib/store.js";
import { OrderDetail } from "./OrderDetail.jsx";
import { RequestDetail } from "./RequestDetail.jsx";
import { DeletedDetail } from "./DeletedDetail.jsx";
import { DocumentView } from "./DocumentView.jsx";
import { OrderForm } from "./OrderForm.jsx";
import { PaymentForm } from "./PaymentForm.jsx";
import { MasterForm } from "./MasterForm.jsx";
import { UserForm } from "./UserForm.jsx";
import { ImportForm } from "./ImportForm.jsx";
import { PayForm, ReasonForm, RestoreForm, SupplyForm, TaskDeleteForm, TaskForm } from "./SmallForms.jsx";

const VIEWS = {
  orderDetail: OrderDetail, requestDetail: RequestDetail, deletedDetail: DeletedDetail, documentView: DocumentView,
  orderForm: OrderForm, paymentForm: PaymentForm, masterForm: MasterForm, userForm: UserForm, importForm: ImportForm,
  reasonForm: ReasonForm, payForm: PayForm, supply: SupplyForm, restoreForm: RestoreForm, taskForm: TaskForm, taskDelete: TaskDeleteForm,
};

const Feedback = createContext(null);

// The dialog frame every view renders: title row with the close button, then the body.
// A toast shown while the dialog is open is repeated at the top of the body.
export function Modal({ title, children }) {
  const { actions } = useApp();
  const feedback = useContext(Feedback);
  return (
    <>
      <div className="modal-head">
        <div><div className="eyebrow">PROJECT WORKSPACE</div><h2 id="modalTitle">{title}</h2></div>
        <button type="button" className="close" data-action="close" aria-label="Close dialog" onClick={() => actions.closeModal()}><Icon name="close" /></button>
      </div>
      <div className="modal-body">
        {feedback ? <div id="modalFeedback" role="status" className={"notice " + (feedback.kind === "error" ? "error" : "success") + " modal-feedback"}>{feedback.message}</div> : null}
        {children}
      </div>
    </>
  );
}

function hostElement(id, tag, attrs) {
  let el = document.getElementById(id);
  if (!el) {
    el = Object.assign(document.createElement(tag), { id });
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    document.body.append(el);
  }
  return el;
}

export function ModalHost() {
  const { actions } = useApp();
  const { modal } = useAppState();
  const [dialog] = useState(() => hostElement("modal", "dialog", { "aria-modal": "true" }));
  const seq = modal?.seq;

  // Escape closes through the same path as the close button (releasing the record lock).
  useEffect(() => {
    const cancel = (e) => { e.preventDefault(); actions.closeModal(); };
    dialog.addEventListener("cancel", cancel);
    return () => dialog.removeEventListener("cancel", cancel);
  }, [dialog, actions]);

  useLayoutEffect(() => {
    if (!seq) {
      if (dialog.open) dialog.close();
      return;
    }
    dialog.setAttribute("aria-labelledby", "modalTitle");
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    const first = dialog.querySelector("input:not([readonly]):not([disabled]),select:not([disabled]),textarea") || dialog.querySelector(".close");
    first?.focus({ preventScroll: true });
  }, [dialog, seq]);

  if (!modal) return null;
  const View = VIEWS[modal.view];
  return createPortal(
    <DataContext.Provider value={modal.snap}>
      <Feedback.Provider value={modal.feedback}>
        <View key={modal.seq} {...modal.props} />
      </Feedback.Provider>
    </DataContext.Provider>,
    dialog,
  );
}

// The toast region (#toast in index.html) announces results politely and hides after 5 s.
export function ToastHost() {
  const { toast } = useAppState();
  const [region] = useState(() => hostElement("toast", "div", { role: "status", "aria-live": "polite", "aria-atomic": "true" }));
  useLayoutEffect(() => {
    if (!toast) return;
    region.dataset.kind = toast.kind;
    region.style.display = toast.visible ? "block" : "none";
  }, [region, toast]);
  return toast ? createPortal(toast.message, region) : null;
}
