// Browser history for workspace pages. Each page the user opens (and each project) becomes
// a history entry with a hash URL (#budgets, #project/<id>), so Back and Forward move
// between portal pages instead of leaving the portal, and a reload or bookmark reopens the
// same page. Pages a role may not open, and projects it cannot see, fall back as usual
// (store.js). Dialogs, tabs and filters are not history entries.
const ENTRY = "portalPage";

export const pageKey = ({ page, projectId }) =>
  page === "project" ? `project/${encodeURIComponent(projectId || "")}` : page;

export function parseHash(hash) {
  const [page, id] = String(hash || "").replace(/^#\/?/, "").split("/");
  if (!/^[a-z]+$/.test(page || "")) return null;
  if (page !== "project") return { page };
  return id ? { page, projectId: decodeURIComponent(id) } : null;
}

const entryOf = (state) => (state && typeof state === "object" && state[ENTRY]) || null;

// `restore` opens a page the user went Back or Forward to.
export function startHistory(store, restore) {
  let current = null; // the page key last written while signed in; null when signed out
  function sync() {
    const s = store.get();
    if (!s.user || !s.state) {
      // Signed out: the sign-in screen keeps no page history and no page in its URL.
      if (current !== null) history.replaceState(null, "", location.pathname + location.search);
      current = null;
      return;
    }
    if (current === null) {
      current = "";
      // First workspace view after loading or signing in: open the page the URL names.
      const target = entryOf(history.state) || parseHash(location.hash);
      if (target && pageKey(target) !== pageKey(s)) {
        store.set(target);
        return;
      }
    }
    const key = pageKey(s);
    if (key === current) return;
    const entry = { [ENTRY]: { page: s.page, projectId: s.page === "project" ? s.projectId : "" } };
    // The first view, or arriving by Back/Forward, updates the current entry; opening a
    // page adds a new one.
    const here = entryOf(history.state);
    if (current === "" || (here && pageKey(here) === key)) history.replaceState(entry, "", "#" + key);
    else history.pushState(entry, "", "#" + key);
    current = key;
  }
  function onPop(event) {
    if (!store.get().user) return;
    const target = entryOf(event.state) || parseHash(location.hash);
    if (target) restore(target);
  }
  const unsubscribe = store.subscribe(sync);
  window.addEventListener("popstate", onPop);
  sync();
  return () => {
    unsubscribe();
    window.removeEventListener("popstate", onPop);
  };
}
