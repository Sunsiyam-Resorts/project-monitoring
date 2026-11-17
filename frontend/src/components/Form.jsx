// Every form carries an alert region for validation and server messages as its first child.
// Fields stay uncontrolled and are read with FormData on submit, as in the legacy client.
import { createContext, useContext, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Icon } from "./Icon.jsx";
import { useApp } from "../lib/store.js";

const FormState = createContext({ pending: false });

export function Form({ kind, onSubmit, onError, onInput, onChange, children, ...rest }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState({ message: "", hidden: true });
  const errorRef = useRef(null);

  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    setPending(true);
    setError((x) => ({ ...x, hidden: true }));
    try {
      await onSubmit(new FormData(form), form);
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
    const label = control.labels?.[0]?.textContent?.trim() || control.getAttribute("aria-label") || "This field";
    setError({ message: label + ": " + control.validationMessage, hidden: false });
  }

  function input(e) {
    e.target.removeAttribute("aria-invalid");
    e.target.setCustomValidity?.("");
    onInput?.(e);
  }

  return (
    <form data-form={kind} onSubmit={submit} onInvalid={invalid} onInput={input} onChange={onChange} {...rest}>
      <div className="form-error" role="alert" tabIndex={-1} hidden={error.hidden} ref={errorRef}>{error.message}</div>
      <FormState.Provider value={{ pending }}>{children}</FormState.Provider>
    </form>
  );
}

// The form's submit button is disabled while the submission runs.
export function SubmitButton({ children, className = "primary", type = "submit" }) {
  const { pending } = useContext(FormState);
  return <button className={className} type={type || undefined} disabled={pending} aria-busy={pending ? "true" : undefined}>{children}</button>;
}

export function Footer({ label, note = "" }) {
  const { actions } = useApp();
  return (
    <div className="form-footer">
      {note ? <small>{note}</small> : null}
      <button type="button" data-action="close" onClick={() => actions.closeModal()}>Cancel</button>
      <SubmitButton>{label}<Icon name="arrow" /></SubmitButton>
    </div>
  );
}
