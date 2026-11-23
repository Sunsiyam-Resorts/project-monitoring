// Inactivity sign-out. A signed-in (live) user is signed out after 15 minutes of inactivity in
// all of the portal's tabs, and never while active. Activity is pointer, key, wheel, touch or
// scroll input, or a portal tab that stays visible on screen (someone reading a record counts
// as active). It is shared between tabs through localStorage. While the user is active, a
// keep-alive at most once a minute silently renews the session stored on the server, which
// ends sessions on the same rule (backend store.SessionIdleMinutes); the 30-second background
// refresh does not count.
export const IDLE_MINUTES = 15;
export const IDLE_MS = IDLE_MINUTES * 60 * 1000;
const KEY = "ss-project-monitoring-activity";
const EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"];
const KEEP_ALIVE_MS = 60 * 1000;
const WRITE_MS = 5 * 1000;

const stored = () => {
  try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; }
};
const visible = () => document.visibilityState === "visible";

// active(): a live session is signed in. onIdle(): sign out. keepAlive(): report activity.
export function startIdleWatch({ active, onIdle, keepAlive, now = () => Date.now(), every = 15 * 1000 }) {
  let last = now(), sent = last, written = 0, idle = false;
  let checked = null, shown = false; // the previous check, and whether the page was visible then

  const record = (at) => {
    last = Math.max(last, at);
    if (last - written < WRITE_MS) return;
    written = last;
    try { localStorage.setItem(KEY, String(last)); } catch { /* storage unavailable: this tab still counts */ }
  };
  const touch = () => record(now());

  const check = () => {
    const t = now(), showing = visible();
    // A page visible at this check and the previous one was on screen in between: that time
    // counts as activity. Only the time up to the previous check counts, so a computer that
    // slept (and ran no checks) is not treated as active while asleep.
    const seen = showing && shown && checked !== null ? checked : null;
    checked = t;
    shown = showing;
    if (!active()) { last = sent = t; idle = false; return; } // the idle period starts at sign-in
    if (seen !== null) record(seen);
    const at = Math.max(last, stored());
    if (t - at >= IDLE_MS) {
      if (!idle) { idle = true; onIdle(); }
      return;
    }
    if (at > sent && t - sent >= KEEP_ALIVE_MS) { sent = t; keepAlive(); }
  };

  // A sleeping computer runs no timers: check as soon as the page is visible again.
  // Hiding the page: it was on screen from the previous check until now, so now counts.
  const onVisibility = () => {
    if (visible()) return check();
    const t = now();
    if (shown && checked !== null && active()) record(t);
    checked = t;
    shown = false;
  };
  for (const e of EVENTS) window.addEventListener(e, touch, { capture: true, passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  const timer = setInterval(check, every);
  return {
    check,
    stop() {
      clearInterval(timer);
      for (const e of EVENTS) window.removeEventListener(e, touch, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
