// @vitest-environment happy-dom
// Inactivity sign-out (src/lib/idle.js): only 15 minutes without activity signs a live user
// out; activity in any tab counts, and keep-alives report it to the server once a minute.
import { afterEach, beforeEach, test } from "vitest";
import assert from "node:assert/strict";
import { IDLE_MS, startIdleWatch } from "../src/lib/idle.js";

let watch, t, calls, signedIn;
const MIN = 60 * 1000;
beforeEach(() => {
  localStorage.clear();
  t = 1_000_000;
  calls = { idle: 0, keepAlive: 0 };
  signedIn = true;
  watch = startIdleWatch({ active: () => signedIn, onIdle: () => calls.idle++, keepAlive: () => calls.keepAlive++, now: () => t, every: 1e9 });
});
afterEach(() => watch.stop());
const act = (type = "keydown") => window.dispatchEvent(new Event(type));

test("An idle user is signed out at 15 minutes, once", () => {
  t += IDLE_MS - 1;
  watch.check();
  assert.equal(calls.idle, 0);
  t += 1;
  watch.check();
  watch.check();
  assert.equal(calls.idle, 1);
});

test("An active user is never signed out, and keep-alives are sent at most once a minute", () => {
  for (let minute = 1; minute <= 60; minute++) {
    t += MIN;
    act(minute % 2 ? "pointermove" : "keydown");
    watch.check();
  }
  assert.equal(calls.idle, 0);
  assert.equal(calls.keepAlive, 60);
  // Several checks within the same minute send one keep-alive.
  act();
  t += 10 * 1000; watch.check();
  t += 10 * 1000; watch.check();
  assert.equal(calls.keepAlive, 60);
  // Idle again: no keep-alives, then signed out 15 minutes after the last activity.
  t += IDLE_MS - 20 * 1000 - 1;
  watch.check();
  assert.equal(calls.keepAlive, 60);
  assert.equal(calls.idle, 0);
  t += 1;
  watch.check();
  assert.equal(calls.idle, 1);
});

test("Activity in another tab counts", () => {
  t += 14 * MIN;
  localStorage.setItem("ss-project-monitoring-activity", String(t)); // written by the other tab
  t += 14 * MIN;
  watch.check();
  assert.equal(calls.idle, 0);
  assert.equal(calls.keepAlive, 1);
  t += MIN;
  watch.check();
  assert.equal(calls.idle, 1);
});

test("The idle period starts at sign-in, and returning to the page after sleep checks at once", () => {
  signedIn = false;
  t += 60 * MIN;
  watch.check(); // signed out: nothing happens, and the clock restarts
  signedIn = true;
  t += 14 * MIN;
  watch.check();
  assert.equal(calls.idle, 0);
  t += 2 * MIN;
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(calls.idle, 1);
});
