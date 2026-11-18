// The workspace dialog: one shadcn Dialog (content id "modal"). Each show remounts the view
// from a snapshot of the workspace taken at that moment, so a dialog changes only when an
// action shows it again. Closing (close button, Escape, outside click) goes through
// actions.closeModal, which releases the record lock and returns focus.
import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";
import { toast as sonner } from "sonner";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Toaster } from "@/components/ui/sonner";

const VIEWS = {
  orderDetail: OrderDetail, requestDetail: RequestDetail, deletedDetail: DeletedDetail, documentView: DocumentView,
  orderForm: OrderForm, paymentForm: PaymentForm, masterForm: MasterForm, userForm: UserForm, importForm: ImportForm,
  reasonForm: ReasonForm, payForm: PayForm, supply: SupplyForm, restoreForm: RestoreForm, taskForm: TaskForm, taskDelete: TaskDeleteForm,
};

const Feedback = createContext(null);

// The dialog frame every view renders: the title row, then the scrolling body. A toast shown
// while the dialog is open is repeated at the top of the body.
export function Modal({ title, children }) {
  const feedback = useContext(Feedback);
  return (
    <>
      <DialogHeader className="modal-head">
        <DialogTitle id="modalTitle">{title}</DialogTitle>
      </DialogHeader>
      <div className="modal-body flex min-h-0 flex-1 flex-col overflow-y-auto px-7 py-6 max-md:px-5">
        {feedback ? (
          <Alert id="modalFeedback" role="status" variant={feedback.kind === "error" ? "destructive" : "success"} className="modal-feedback mb-5">
            <AlertDescription>{feedback.message}</AlertDescription>
          </Alert>
        ) : null}
        {children}
      </div>
    </>
  );
}

export function ModalHost() {
  const { actions } = useApp();
  const { modal } = useAppState();
  const content = useRef(null);
  const seq = modal?.seq;

  // Each show starts at the top with focus on the first field (or the close button).
  useLayoutEffect(() => {
    const el = content.current;
    if (!seq || !el) return;
    el.querySelector(".modal-body")?.scrollTo?.(0, 0);
    const first = el.querySelector("input:not([readonly]):not([disabled]):not([type=hidden]):not([aria-hidden=true]),[data-slot=select-trigger]:not([disabled]),textarea")
      || el.querySelector("[data-slot=dialog-close]");
    first?.focus({ preventScroll: true });
  }, [seq]);

  const View = modal ? VIEWS[modal.view] : null;
  return (
    <Dialog open={!!modal} onOpenChange={(open) => { if (!open) actions.closeModal(); }}>
      {modal ? (
        <DialogContent ref={content} id="modal" aria-labelledby="modalTitle" aria-describedby={undefined}
          className={View.dialogClass} onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()}>
          <DataContext.Provider value={modal.snap}>
            <Feedback.Provider value={modal.feedback}>
              <View key={modal.seq} {...modal.props} />
            </Feedback.Provider>
          </DataContext.Provider>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

// Results are announced with Sonner toasts (one at a time; a new message replaces the last).
export function ToastHost() {
  const { toast } = useAppState();
  useEffect(() => {
    if (!toast?.visible) return;
    const show = toast.kind === "error" ? sonner.error : sonner.success;
    show(toast.message, { id: "portal-toast", duration: 5000 });
  }, [toast?.seq, toast?.visible]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Toaster position="bottom-right" closeButton={false} />;
}
