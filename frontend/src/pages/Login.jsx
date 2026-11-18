// Sign-in: password, then authenticator code (with first-time enrolment by QR code or setup
// key), and password reset by email OTP. The demo workspace is browser-local sample data.
import { useEffect, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { Brand, Field, Input } from "../components/ui.jsx";
import { Form, SubmitButton } from "../components/Form.jsx";
import { ThemePicker } from "../components/Shell.jsx";
import { useApp, useAppState } from "../lib/store.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

function EnrollmentOptions() {
  const { actions } = useApp();
  const { enrollKey, enrollQr, enrollMethod } = useAppState();
  if (!enrollKey) return null;
  return (
    <section id="enrollmentOptions" className="auth-enrollment grid gap-3 rounded-xl border border-border bg-muted/50 p-4" aria-labelledby="enrollmentTitle">
      <h3 id="enrollmentTitle" className="text-sm font-bold">Add your authenticator</h3>
      <p className="text-xs text-muted-foreground">Choose how to add this account to your authenticator app, then enter its six-digit code below.</p>
      <div className="actions flex flex-wrap gap-2" role="group" aria-label="Authenticator setup method">
        <Button type="button" size="sm" variant={enrollMethod === "qr" ? "default" : "outline"} data-action="enrollMethod" data-method="qr" aria-pressed={String(enrollMethod === "qr")} disabled={!enrollQr} onClick={() => actions.chooseEnrollment("qr")}>Scan QR code</Button>
        <Button type="button" size="sm" variant={enrollMethod === "key" ? "default" : "outline"} data-action="enrollMethod" data-method="key" aria-pressed={String(enrollMethod === "key")} onClick={() => actions.chooseEnrollment("key")}>Enter setup key</Button>
      </div>
      {enrollMethod === "qr" && enrollQr ? (
        <div className="auth-qr grid justify-items-center gap-2 rounded-xl bg-white p-4">
          <img src={enrollQr} width="280" height="280" alt="Scan this QR code with your authenticator app to add your Sun Siyam account" className="size-[220px]" />
          <p className="text-xs text-neutral-600">In your authenticator app, add an account and select Scan QR code.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">In your authenticator app, add an account with a setup key. Select a time-based code.</p>
          <div className="secret rounded-lg border border-border bg-card px-3 py-2.5 font-mono text-sm tracking-wider break-all" aria-label="Authenticator setup key">{enrollKey}</div>
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
    <Form kind="login" className="grid gap-5" onSubmit={(fd) => actions.submitLogin(Object.fromEntries(fd))} onError={(e) => setError(e.message)}>
      {fields}
      <SubmitButton type={null} className="w-full">{label}<Icon name="arrow" /></SubmitButton>
      {error ? (
        <Alert id="loginError" role="alert" variant="destructive" className="notice error"><AlertDescription>{error}</AlertDescription></Alert>
      ) : <div id="loginError" role="alert" className="help sr-only"></div>}
    </Form>
  );
}

export function Login() {
  const { actions } = useApp();
  const { loginStep, loginSeq, loginNotice } = useAppState();
  const reset = loginStep.startsWith("reset");
  // A failed ERP single sign-on returns here with ?sso=failed.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("sso") === "failed") {
      history.replaceState(null, "", location.pathname);
      actions.toast("ERP sign-in failed — sign in with your portal account.", "error");
    }
  }, [actions, loginSeq]);
  return (
    <div className="login grid min-h-dvh grid-cols-[1.05fr_1fr] gap-5 bg-background p-5 max-md:grid-cols-1 max-md:p-3">
      <div className="login-art relative flex flex-col overflow-hidden rounded-2xl bg-sidebar px-[9%] py-12 text-sidebar-foreground max-md:hidden">
        <Brand className="[&_.brand-label]:text-sidebar-muted" />
        <div className="login-message my-auto py-16">
          <h1 className="max-w-[450px] font-display text-[clamp(32px,3.3vw,52px)] leading-[1.12] font-bold tracking-[-0.03em]">Every commitment.<br />Every payment.<br />One clear picture.</h1>
          <p className="mt-6 max-w-[360px] text-sm leading-relaxed text-sidebar-muted">Your workspace for project budgets, Purchasing and Planning approvals, and Finance visibility.</p>
        </div>
        <div className="login-foot border-t border-sidebar-border pt-6 text-xs text-sidebar-muted">{"SUN SIYAM GROUP   /   PROJECT MONITORING"}</div>
      </div>
      <Card className="login-panel relative justify-center rounded-2xl px-6 py-12 max-md:min-h-[calc(100dvh-24px)]">
        <div className="login-appearance absolute top-6 right-6"><ThemePicker id="loginAppearance" /></div>
        <CardContent className="login-card mx-auto grid w-full max-w-[380px] gap-6 px-0">
          <div className="login-mobile-brand hidden max-md:block"><Brand className="text-foreground dark:[&_img]:invert" /></div>
          <div>
            <h2 id="pageTitle" className="font-display text-[32px] leading-tight font-bold tracking-[-0.025em]">{reset ? "Reset password" : loginStep === "totp" ? "Verify your identity" : "Welcome back"}</h2>
            <p className="sub mt-2 text-[13px] text-muted-foreground">{loginStep === "totp" ? "Enter the six-digit code from your authenticator." : reset ? "Recover access to your project workspace." : "Sign in to your project workspace."}</p>
          </div>
          {loginNotice ? (
            <Alert id="loginNotice" role="status" className="login-notice"><AlertDescription>{loginNotice}</AlertDescription></Alert>
          ) : null}
          <LoginForm key={loginSeq} />
          <div className="actions -mt-2 flex justify-center">
            {loginStep === "password"
              ? <Button variant="link" className="linkbtn" data-action="resetPassword" onClick={() => actions.resetPassword()}>Forgot password?</Button>
              : <Button variant="link" className="linkbtn" data-action="backLogin" onClick={() => actions.backLogin()}>Back to sign in</Button>}
          </div>
          <Separator />
          <div className="login-demo grid gap-3 text-center">
            <Button variant="outline" className="w-full" data-action="demo" onClick={() => actions.enterDemo()}>Explore demo workspace <Icon name="arrow" /></Button>
            <p className="help text-xs text-muted-foreground">Sample data only. Explore the portal and test workflows without changing live records.</p>
          </div>
          <div className="login-security flex items-center justify-center gap-2 text-xs text-muted-foreground"><Icon name="shield" className="size-4" />Password + authenticator verification</div>
        </CardContent>
      </Card>
    </div>
  );
}
