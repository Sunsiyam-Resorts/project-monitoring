// Sign-in: password, then authenticator code (with first-time enrolment by QR code or setup
// key), and password reset by email OTP. The demo workspace is browser-local sample data.
import { useEffect, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { Brand, Field, Input } from "../components/ui.jsx";
import { Form, SubmitButton } from "../components/Form.jsx";
import { ThemePicker } from "../components/Shell.jsx";
import { useApp, useAppState } from "../lib/store.js";

function EnrollmentOptions() {
  const { actions } = useApp();
  const { enrollKey, enrollQr, enrollMethod } = useAppState();
  if (!enrollKey) return null;
  return (
    <section id="enrollmentOptions" className="auth-enrollment" aria-labelledby="enrollmentTitle">
      <h3 id="enrollmentTitle">Add your authenticator</h3>
      <p>Choose how to add this account to your authenticator app, then enter its six-digit code below.</p>
      <div className="actions" role="group" aria-label="Authenticator setup method">
        <button type="button" data-action="enrollMethod" data-method="qr" aria-pressed={String(enrollMethod === "qr")} disabled={!enrollQr} onClick={() => actions.chooseEnrollment("qr")}>Scan QR code</button>
        <button type="button" data-action="enrollMethod" data-method="key" aria-pressed={String(enrollMethod === "key")} onClick={() => actions.chooseEnrollment("key")}>Enter setup key</button>
      </div>
      {enrollMethod === "qr" && enrollQr ? (
        <div className="auth-qr">
          <img src={enrollQr} width="280" height="280" alt="Scan this QR code with your authenticator app to add your Sun Siyam account" />
          <p>In your authenticator app, add an account and select Scan QR code.</p>
        </div>
      ) : (
        <>
          <p>In your authenticator app, add an account with a setup key. Select a time-based code.</p>
          <div className="secret" aria-label="Authenticator setup key">{enrollKey}</div>
        </>
      )}
    </section>
  );
}

const CODE = { required: true, pattern: "[0-9]{6}", inputMode: "numeric", autoComplete: "one-time-code" };

function LoginForm() {
  const { actions } = useApp();
  const { loginStep } = useAppState();
  const [error, setError] = useState("");
  const fields = loginStep === "password" ? (
    <>
      <Field label="Username"><Input name="username" required autoComplete="username" /></Field>
      <Field label="Password"><Input name="password" type="password" required autoComplete="current-password" /></Field>
    </>
  ) : loginStep === "totp" ? (
    <>
      <EnrollmentOptions />
      <Field label="Authenticator code"><Input name="code" {...CODE} /></Field>
    </>
  ) : loginStep === "reset-start" ? (
    <Field label="Account email"><Input name="email" type="email" required autoComplete="email" /></Field>
  ) : (
    <>
      <Field label="Email OTP"><Input name="code" {...CODE} /></Field>
      <Field label="New password"><Input name="password" type="password" required minLength={12} maxLength={256} autoComplete="new-password" /></Field>
    </>
  );
  const label = loginStep === "password" ? "Sign in" : loginStep === "reset-start" ? "Send email OTP" : loginStep === "reset-finish" ? "Reset password" : "Verify & continue";
  return (
    <Form kind="login" onSubmit={(fd) => actions.submitLogin(Object.fromEntries(fd))} onError={(e) => setError(e.message)}>
      {fields}
      <SubmitButton type={null}>{label}<Icon name="arrow" /></SubmitButton>
      <div id="loginError" role="alert" className={error ? "notice error" : "help"}>{error}</div>
    </Form>
  );
}

export function Login() {
  const { actions } = useApp();
  const { loginStep, loginSeq } = useAppState();
  const reset = loginStep.startsWith("reset");
  // A failed ERP single sign-on returns here with ?sso=failed.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("sso") === "failed") {
      history.replaceState(null, "", location.pathname);
      actions.toast("ERP sign-in failed — sign in with your portal account.", "error");
    }
  }, [actions, loginSeq]);
  return (
    <div className="login">
      <div className="login-appearance"><ThemePicker id="loginAppearance" /></div>
      <div className="login-art">
        <Brand />
        <div className="login-message">
          <div className="eyebrow">A CLEARER FINANCIAL PICTURE</div>
          <h1>Every commitment.<br />Every payment.<br />One clear picture.</h1>
          <p>Your workspace for project budgets, Purchasing and Planning approvals, and Finance visibility.</p>
          <div className="login-graphic" aria-hidden="true">
            <div className="graphic-label">FROM PLAN TO PAYMENT</div>
            <div className="graphic-line"><span>Approved budget</span><i style={{ width: "100%" }}></i></div>
            <div className="graphic-line"><span>Commitment</span><i style={{ width: "72%" }}></i></div>
            <div className="graphic-line"><span>Payment</span><i style={{ width: "44%" }}></i></div>
          </div>
        </div>
        <div className="login-foot">{"SUN SIYAM GROUP   /   PROJECT MONITORING"}</div>
      </div>
      <div className="login-panel">
        <div className="login-card">
          <div className="login-mobile-brand" style={{ display: "none" }}><Brand /></div>
          <div className="eyebrow">SECURE WORKSPACE</div>
          <h2 id="pageTitle">{reset ? "Reset password" : loginStep === "totp" ? "Verify your identity" : "Welcome back"}</h2>
          <p className="sub">{loginStep === "totp" ? "Enter the six-digit code from your authenticator." : reset ? "Recover access to your project workspace." : "Sign in to your project workspace."}</p>
          <LoginForm key={loginSeq} />
          <div className="actions">
            {loginStep === "password"
              ? <button className="linkbtn" data-action="resetPassword" onClick={() => actions.resetPassword()}>Forgot password?</button>
              : <button className="linkbtn" data-action="backLogin" onClick={() => actions.backLogin()}>Back to sign in</button>}
          </div>
          <div className="login-demo">
            <button data-action="demo" onClick={() => actions.enterDemo()}>Explore demo workspace <Icon name="arrow" /></button>
            <p className="help">Sample data only. Explore the portal and test workflows without changing live records.</p>
          </div>
          <div className="login-security"><Icon name="shield" />Password + authenticator verification</div>
        </div>
      </div>
    </div>
  );
}
