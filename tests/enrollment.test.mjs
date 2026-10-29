import test from "node:test";
import assert from "node:assert/strict";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { authenticatorEnrollment } from "../lib/enrollment.mjs";
import { secret, totp, totpOK } from "../lib/auth.mjs";

test("Authenticator QR decodes to the same account and key used for manual enrollment and verification", async () => {
  const key = secret();
  const username = "Fictional user + & / ?";
  const { uri, qrCode } = await authenticatorEnrollment(username, key);
  assert.ok(qrCode.startsWith("data:image/png;base64,"));
  const png = PNG.sync.read(Buffer.from(qrCode.split(",")[1], "base64"));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.equal(decoded?.data, uri);
  const account = new URL(decoded.data);
  assert.equal(account.protocol, "otpauth:");
  assert.equal(account.host, "totp");
  assert.equal(decodeURIComponent(account.pathname), "/Sun Siyam:" + username);
  assert.equal(account.searchParams.get("secret"), key);
  assert.equal(account.searchParams.get("issuer"), "Sun Siyam");
  assert.equal(account.searchParams.get("algorithm"), "SHA1");
  assert.equal(account.searchParams.get("digits"), "6");
  assert.equal(account.searchParams.get("period"), "30");
  assert.ok(totpOK(account.searchParams.get("secret"), totp(key, 59000), 59000));
});
