import { randomBytes, randomInt } from "node:crypto";
import { configured, transaction, query, throttle } from "../lib/store.mjs";
import {
  passwordHash,
  passwordOK,
  hash,
  secret,
  encrypt,
  decrypt,
  totpOK,
} from "../lib/auth.mjs";
import { apply, visibleState, supportingFile } from "../public/domain.js";
import { authenticatorEnrollment } from "../lib/enrollment.mjs";
const token = () => randomBytes(32).toString("hex");
const safeUser = (u) => ({
  id: u.id,
  name: u.name,
  username: u.username,
  role: u.role,
  team: u.team,
  approvalLevel: u.approvalLevel,
  companies: u.companies,
  groupAccess: u.groupAccess,
  active: u.active,
});
async function challenge(data, c) {
  const t = token();
  await c.query(
    "INSERT INTO portal_challenges(token,data,expires) VALUES($1,$2,now()+interval '10 minutes')",
    [hash(t), data],
  );
  return t;
}
async function session(c, u, res) {
  const t = token();
  await c.query(
    "INSERT INTO portal_sessions(token,user_id,expires) VALUES($1,$2,now()+interval '8 hours')",
    [hash(t), u.id],
  );
  res.setHeader(
    "Set-Cookie",
    `portal_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
}
async function auth(c, s, req) {
  const cookie = (req.headers.cookie || "").match(
    /(?:^|;\s*)portal_session=([a-f0-9]{64})(?:;|$)/,
  )?.[1];
  if (!cookie) throw Error("Sign in required");
  const { rows } = await c.query(
    "SELECT user_id FROM portal_sessions WHERE token=$1 AND expires>now()",
    [hash(cookie)],
  );
  const u = s.users.find((u) => u.id === rows[0]?.user_id && u.active);
  if (!u) throw Error("Sign in required");
  return u;
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  const url = new URL(req.url, "http://localhost");
  const action = url.searchParams.get("action") || "state";
  const send = (status, body) => {
    res.statusCode = status;
    res.end(JSON.stringify(body));
  };
  if (action === "config")
    return send(200, {
      configured: configured(),
      demo: !configured(),
      emailReset: !!process.env.RESEND_API_KEY,
    });
  if (!configured())
    return send(503, {
      error: "Database not connected. Use the labelled demo for testing.",
    });
  try {
    if (req.method !== "GET" && req.method !== "POST")
      return send(405, { error: "Method not allowed" });
    if (req.method === "GET" && !["state", "config", "file"].includes(action))
      return send(405, { error: "POST required" });
    if (req.method === "POST") {
      const origin = req.headers.origin;
      const host = req.headers.host;
      if (!origin || new URL(origin).host !== host)
        return send(403, { error: "Same-origin request required" });
    }
    const b =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    if (["login", "verify", "reset-start", "reset-finish"].includes(action))
      await throttle(
        `${action}:${req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown"}`,
      );
    if (action === "login") {
      const outcome = await transaction(async (s, c) => {
        const u = s.users.find(
          (u) =>
            u.username.toLowerCase() === String(b.username).toLowerCase() &&
            u.active,
        );
        if (!u || !passwordOK(b.password, u.passwordHash))
          throw Error("Invalid username or password");
        if (!u.totpSecret) {
          const key = secret();
          const enrollment = await authenticatorEnrollment(u.username, key);
          return {
            challenge: await challenge(
              { userId: u.id, key: encrypt(key), kind: "enroll" },
              c,
            ),
            enroll: true,
            secret: key,
            ...enrollment,
          };
        }
        return {
          challenge: await challenge({ userId: u.id, kind: "login" }, c),
        };
      });
      return send(200, outcome);
    }
    if (action === "verify") {
      const outcome = await transaction(async (s, c) => {
        const { rows } = await c.query(
          "SELECT data FROM portal_challenges WHERE token=$1 AND expires>now() FOR UPDATE",
          [hash(String(b.challenge))],
        );
        const ch = rows[0]?.data,
          u = s.users.find((u) => u.id === ch?.userId && u.active);
        if (!u || !["login", "enroll"].includes(ch.kind))
          throw Error("Sign-in challenge expired");
        const key = ch.kind === "enroll" ? ch.key : u.totpSecret;
        if (!totpOK(decrypt(key), String(b.code)))
          throw Error("Invalid authenticator code");
        if (u.lastTotp === String(b.code))
          throw Error("Code already used. Wait for a new code.");
        u.lastTotp = String(b.code);
        if (ch.kind === "enroll") u.totpSecret = key;
        await c.query("DELETE FROM portal_challenges WHERE token=$1", [
          hash(String(b.challenge)),
        ]);
        await session(c, u, res);
        return { user: safeUser(u), state: visibleState(s, u) };
      });
      return send(200, outcome);
    }
    if (action === "reset-start") {
      const result = await transaction(async (s, c) => {
        const u = s.users.find(
          (u) =>
            u.email.toLowerCase() === String(b.email).toLowerCase() && u.active,
        );
        if (!u) return {};
        if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM)
          throw Error("Email password reset is not configured");
        const otp = String(randomInt(100000, 1000000));
        const t = await challenge(
          { userId: u.id, kind: "reset", otp: hash(otp) },
          c,
        );
        return { t, otp, email: u.email };
      });
      if (result.t) {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.MAIL_FROM,
            to: [result.email],
            subject: "Sun Siyam portal password reset",
            text: `Your password reset OTP is ${result.otp}. It expires in 10 minutes. Your authenticator remains required.`,
          }),
        });
        if (!r.ok) throw Error("Unable to send reset email");
      }
      return send(200, {
        challenge: result.t || token(),
        message:
          "If the email matches an active account, an OTP has been sent.",
      });
    }
    if (action === "reset-finish") {
      await transaction(async (s, c) => {
        const { rows } = await c.query(
          "SELECT data FROM portal_challenges WHERE token=$1 AND expires>now() FOR UPDATE",
          [hash(String(b.challenge))],
        );
        const ch = rows[0]?.data,
          u = s.users.find((u) => u.id === ch?.userId && u.active);
        if (!u || ch.kind !== "reset" || ch.otp !== hash(String(b.code)))
          throw Error("Invalid or expired OTP");
        u.passwordHash = passwordHash(b.password);
        await c.query("DELETE FROM portal_sessions WHERE user_id=$1", [u.id]);
        await c.query(
          "DELETE FROM portal_challenges WHERE token=$1 OR data->>'userId'=$2",
          [hash(String(b.challenge)), u.id],
        );
        s.audit.push({
          id: token(),
          at: new Date().toISOString(),
          userId: u.id,
          user: u.name,
          action: "Password reset",
          entity: u.id,
          detail: "All previous sessions revoked",
        });
      });
      return send(200, { ok: true });
    }
    const outcome = await transaction(async (s, c) => {
      const u = await auth(c, s, req);
      if (action === "logout") {
        await c.query("DELETE FROM portal_sessions WHERE user_id=$1", [u.id]);
        res.setHeader(
          "Set-Cookie",
          "portal_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        );
        return { ok: true };
      }
      if (action === "file") {
        return { file: supportingFile(s, u, {
          id: url.searchParams.get("id"),
          kind: url.searchParams.get("kind"),
          index: url.searchParams.get("index") || 0,
          version: url.searchParams.get("version"),
          side: url.searchParams.get("side") || "data",
        }) };
      }
      if (action === "command") {
        const cmd = b;
        let old;
        if (cmd.type === "user.save") {
          if (u.role !== "Admin") throw Error("Admin required");
          old = s.users.find((x) => x.id === cmd.data?.record?.id);
          if (!old && !cmd.data?.password)
            throw Error("Initial password required");
        }
        apply(s, u, cmd);
        if (cmd.type === "user.save") {
          const x = s.users.find(
            (x) => x.id === (cmd.data.record.id || s.audit.at(-1).entity),
          );
          if (cmd.data.password)
            x.passwordHash = passwordHash(cmd.data.password);
          await c.query("DELETE FROM portal_sessions WHERE user_id=$1", [x.id]);
          await c.query(
            "DELETE FROM portal_challenges WHERE data->>'userId'=$1",
            [x.id],
          );
        }
      } else if (action !== "state") throw Error("Unknown endpoint");
      return { user: safeUser(u), state: visibleState(s, u) };
    });
    return send(200, outcome);
  } catch (e) {
    const msg = e.message;
    const setup =
      /configured|connect|relation|password must|Initial admin/i.test(msg);
    send(msg === "Sign in required" ? 401 : setup ? 503 : 400, {
      error: setup
        ? "Portal setup incomplete. Check database and environment configuration."
        : msg,
    });
  }
}
