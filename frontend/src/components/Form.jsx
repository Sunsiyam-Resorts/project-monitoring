// Every form carries an alert region (shadcn Alert) for validation and server messages as its
// first child. Fields stay uncontrolled and are read with FormData on submit.
import { createContext, useContext, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Icon } from "./Icon.jsx";
import { NONE } from "./ui.jsx";
import { useApp } from "../lib/store.js";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const FormState = createContext({ pending: false });

// A control's visible label: its own <label>, the shadcn Field label around it (selects keep
// their value in a hidden native select), or its accessible name.
function labelOf(control) {
  const own = control.labels?.[0]?.textContent;
  const field = control.closest?.("[data-slot=field]")?.querySelector("[data-slot=field-label]")?.textContent;
  return (own || field || control.getAttribute("aria-label") || "This field").replace(/\s*\*$/, "").trim();
}

export function Form({ kind, onSubmit, onError, onInput, onChange, className, children, ...rest }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState({ message: "", hidden: true });
  const errorRef = useRef(null);

  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    setPending(true);
    setError((x) => ({ ...x, hidden: true }));
    try {
      const data = new FormData(form);
      // A cleared shadcn Select submits as an empty value, as a native blank option did.
      for (const [key, value] of [...data.entries()]) if (value === NONE) data.set(key, "");
      await onSubmit(data, form);
    } catch (err) {
      if (onError) onError(err);
      else {
        flushSync(() => setError({ message: err.message, hidden: false }));
        errorRef.current?.focus();
      }
    } finally {
      setPending(false);
    }
  }

  // Native validation: mark the control and name it in the form's alert.
  function invalid(e) {
    const control = e.target;
    control.setAttribute("aria-invalid", "true");
    const trigger = control.closest?.("[data-slot=field]")?.querySelector("[data-slot=select-trigger]");
    trigger?.setAttribute("aria-invalid", "true");
    setError({ message: labelOf(control) + ": " + (control.validationMessage || "Select an option."), hidden: false });
  }

  function input(e) {
    e.target.removeAttribute?.("aria-invalid");
    e.target.setCustomValidity?.("");
    onInput?.(e);
  }

  return (
    <form data-form={kind} onSubmit={submit} onInvalid={invalid} onInput={input} onChange={onChange} className={cn("flex min-h-0 flex-1 flex-col", className)} {...rest}>
      <Alert variant="destructive" className="form-error mb-5 whitespace-pre-line" tabIndex={-1} hidden={error.hidden} ref={errorRef}>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
      <FormState.Provider value={{ pending }}>{children}</FormState.Provider>
    </form>
  );
}

// The form's submit button is disabled while the submission runs.
export function SubmitButton({ children, variant = "default", className, type = "submit" }) {
  const { pending } = useContext(FormState);
  return (
    <Button variant={variant} className={className} type={type || undefined} disabled={pending} aria-busy={pending ? "true" : undefined}>
      {pending ? <Spinner /> : null}{children}
    </Button>
  );
}

// A dialog form's footer: an optional note, Cancel and the submit button (shadcn DialogFooter).
export function Footer({ label, note = "", cancel = true }) {
  const { actions } = useApp();
  return (
    <DialogFooter className="form-footer sticky -bottom-6 z-10 -mx-7 -mb-6 mt-7 bg-card max-md:-mx-5">
      {note ? <small className="mr-auto text-[11px] text-muted-foreground max-md:basis-full">{note}</small> : null}
      {cancel ? <Button type="button" variant="outline" data-action="close" onClick={() => actions.closeModal()}>Cancel</Button> : null}
      <SubmitButton>{label}<Icon name="arrow" /></SubmitButton>
    </DialogFooter>
  );
}
