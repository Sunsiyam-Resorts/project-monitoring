// Motion. Same feel as the smooth page scroll: a strong ease-out over ~0.65–0.9s.
// Reduced-motion users get instant updates. Nothing here changes text content, so
// figures stay exactly as rendered for tests and assistive technology.
export const MOTION_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
export const motionOff = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

// Table rows animate as separate items between renders of the same page: rows that stay
// glide to their new position, rows that leave slide out to the right, and new rows rise
// from below into place.
const topTables = () => [...document.querySelectorAll(".content table")].filter((t) => !t.parentElement.closest("table"));
const tableKey = (t, i) => (document.querySelector(".main")?.dataset.view || "") + ":" +
  (t.closest("[data-disclosure]")?.dataset.disclosure || t.closest("[data-slot=card], section[aria-label]")?.querySelector("h2, [data-slot=card-title]")?.textContent || i);
const rowKey = (tr) => tr.dataset.rowKey || tr.cells[0]?.textContent.trim().replace(/\s+/g, " ");
const rowsOf = (t) => [...(t.tBodies[0]?.rows || []), ...(t.tFoot?.rows || [])];
const keyOf = (tr) => (tr.parentElement.tagName === "TFOOT" ? "tfoot:" : "") + rowKey(tr);

export function snapshotTables() {
  const snap = new Map();
  if (motionOff()) return snap;
  topTables().forEach((t, i) => {
    const rows = new Map();
    for (const tr of rowsOf(t)) {
      const k = keyOf(tr);
      const rect = tr.getBoundingClientRect();
      if (!k || rows.has(k) || !rect.height) continue;
      rows.set(k, { tr, rect, widths: [...tr.cells].map((c) => c.getBoundingClientRect().width) });
    }
    const wrap = t.closest(".table-wrap");
    snap.set(tableKey(t, i), { rows, wrapClass: wrap?.className || "table-wrap", height: wrap?.getBoundingClientRect().height || 0 });
  });
  return snap;
}

// A row that left the table slides out from where it was. React has already detached it,
// so the node is reused for the ghost; a node React kept for other content is never moved.
function ghostRow(old, wrapClass) {
  const r = old.rect;
  if (old.tr.isConnected || r.bottom < 0 || r.top > window.innerHeight) return;
  const wrap = document.createElement("div");
  wrap.className = wrapClass + " row-ghost";
  wrap.setAttribute("aria-hidden", "true");
  Object.assign(wrap.style, { position: "fixed", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
  const table = document.createElement("table");
  const body = document.createElement("tbody");
  [...old.tr.cells].forEach((c, i) => { c.style.width = old.widths[i] + "px"; });
  body.append(old.tr);
  table.append(body);
  wrap.append(table);
  document.body.append(wrap);
  const done = () => wrap.remove();
  wrap.animate([{ transform: "none", opacity: 1 }, { transform: `translateX(${Math.round(Math.min(r.width * 0.6, 520))}px)`, opacity: 0 }],
    { duration: 600, easing: MOTION_EASE, fill: "forwards" }).finished.then(done, done);
}

export function animateTables(snap) {
  if (!snap?.size || motionOff()) return;
  topTables().forEach((t, i) => {
    const before = snap.get(tableKey(t, i));
    if (!before) return;
    const kept = new Set();
    let entering = 0;
    // The table eases from its old height to the new one so content below never jumps.
    const wrap = t.closest(".table-wrap");
    const height = wrap?.getBoundingClientRect().height || 0;
    if (wrap?.animate && before.height && Math.abs(before.height - height) > 1)
      wrap.animate([{ height: before.height + "px", overflow: "hidden" }, { height: height + "px", overflow: "hidden" }], { duration: 650, easing: MOTION_EASE });
    for (const tr of rowsOf(t)) {
      if (!tr.animate) return;
      const k = keyOf(tr);
      const old = k && before.rows.get(k);
      if (old) {
        kept.add(k);
        const dy = old.rect.top - tr.getBoundingClientRect().top;
        if (Math.abs(dy) > 1) tr.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 650, easing: MOTION_EASE });
      } else {
        tr.animate([{ transform: "translateY(28px)", opacity: 0 }, { transform: "none", opacity: 1 }],
          { duration: 650, delay: Math.min(entering++, 12) * 40, easing: MOTION_EASE, fill: "backwards" });
      }
    }
    before.rows.forEach((old, k) => { if (!kept.has(k)) ghostRow(old, before.wrapClass); });
  });
}

// Smooth wheel scrolling for the page. Keyboard, scrollbar, links, zoom (Ctrl+wheel),
// horizontal scrolling, inner scroll areas and open dialogs stay native, and
// reduced-motion users keep instant scrolling. Returns a cleanup function.
export function startPageMotion() {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const ease = 0.14;
  let target = window.scrollY, current = window.scrollY, animating = false, frame = 0;
  const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
  const handledInside = (node, dy) => {
    for (let el = node instanceof Element ? node : node?.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      if (el.matches("[role=dialog], [role=listbox], [role=menu], select, textarea, [contenteditable=true]")) return true;
      const overflowY = getComputedStyle(el).overflowY;
      if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1) {
        const canUp = el.scrollTop > 0;
        const canDown = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
        if ((dy < 0 && canUp) || (dy > 0 && canDown)) return true;
      }
    }
    return false;
  };
  const step = () => {
    current += (target - current) * ease;
    if (Math.abs(target - current) < 0.5) {
      current = target;
      animating = false;
    }
    window.scrollTo(0, current);
    if (animating) frame = requestAnimationFrame(step);
  };
  const onWheel = (event) => {
    if (event.defaultPrevented || reduce?.matches || event.ctrlKey || event.shiftKey) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (document.querySelector("[role=dialog], [role=listbox], [role=menu]") || handledInside(event.target, event.deltaY)) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    if (!animating) current = target = window.scrollY;
    target = Math.max(0, Math.min(maxScroll(), target + event.deltaY * unit));
    if (!animating) {
      animating = true;
      frame = requestAnimationFrame(step);
    }
  };
  // Keyboard, scrollbar and link scrolling move the page natively; follow them.
  const onScroll = () => {
    if (!animating) current = target = window.scrollY;
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    cancelAnimationFrame(frame);
    animating = false;
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("wheel", onWheel);
  };
}
