// Inactivity sign-out. A signed-in (live) user is signed out after 15 minutes with no
// activity — no pointer, key, wheel, touch or scroll input — in any of the portal's tabs, and
// never while active. Activity is shared between tabs through localStorage. While the user is
// active, a keep-alive at most once a minute tells the server, which ends sessions on the same
// rule (backend store.SessionIdleMinutes); the 30-second background refresh does not count.
export const IDLE_MINUTES = 15;
export const IDLE_MS = IDLE_MINUTES * 60 * 1000;
const KEY = "ss-project-monitoring-activity";
const EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"];
const KEEP_ALIVE_MS = 60 * 1000;
const WRITE_MS = 5 * 1000;

const stored = () => {
  try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; }
};

// active(): a live session is signed in. onIdle(): sign out. keepAlive(): report activity.
export function startIdleWatch({ active, onIdle, keepAlive, now = () => Date.now(), every = 15 * 1000 }) {
  let last = now(), sent = last, written = 0, idle = false;

  const touch = () => {
    last = now();
    if (last - written < WRITE_MS) return;
    written = last;
    try { localStorage.setItem(KEY, String(last)); } catch { /* storage unavailable: this tab still counts */ }
  };

  const check = () => {
    const t = now();
    if (!active()) { last = sent = t; idle = false; return; } // the idle period starts at sign-in
    const at = Math.max(last, stored());
    if (t - at >= IDLE_MS) {
      if (!idle) { idle = true; onIdle(); }
      return;
    }
    if (at > sent && t - sent >= KEEP_ALIVE_MS) { sent = t; keepAlive(); }
  };

  // A sleeping computer runs no timers: check as soon as the page is visible again.
  const visible = () => { if (document.visibilityState === "visible") check(); };
  for (const e of EVENTS) window.addEventListener(e, touch, { capture: true, passive: true });
  document.addEventListener("visibilitychange", visible);
  const timer = setInterval(check, every);
  return {
    check,
    stop() {
      clearInterval(timer);
      for (const e of EVENTS) window.removeEventListener(e, touch, { capture: true });
      document.removeEventListener("visibilitychange", visible);
    },
  };
}
