// One small external store per mounted app. Components read it through useAppState()
// (useSyncExternalStore); the action layer (actions.js) is the only writer.
import { createContext, useContext, useSyncExternalStore } from "react";
import { allowedPages } from "./selectors.js";

export const emptyAuditFilter = () => ({ action: "", user: "", company: "", from: "", to: "" });

export function initialState() {
  return {
    boot: true,
    // Session: the workspace visible to the signed-in (or demo) user.
    state: null, user: null, raw: null, demo: false,
    // Sign-in flow.
    loginStep: "password", loginChallenge: "", enrollKey: "", enrollQr: "", enrollMethod: "qr", loginSeq: 0,
    // Navigation, scope and list controls (kept for the session, like the legacy module variables).
    page: "dashboard", tab: "requests", masterTab: "companies",
    company: "", project: "", from: "", to: "", search: "", statusFilter: "", financeOnly: false,
    sortOrder: "date-desc", masterSearch: "", userSearch: "", projectSearch: "", budgetSearch: "", projectId: "",
    auditSearch: "", auditFilter: emptyAuditFilter(), auditPageNo: 1,
    filtersExpanded: false,
    expanded: [],
    disclosures: {},
    drawerOpen: false,
    // The open dialog: { seq, view, props, snap, feedback }. `snap` is the workspace as it was
    // when the dialog was (re)shown; dialogs refresh only when an action shows them again.
    modal: null,
    toast: null,
  };
}

// The selected company must stay visible to the user; a vanished project page falls back to
// the list; a page the user's role may not open falls back to the role's first page.
function normalise(s) {
  if (!s.state) return s;
  const pages = allowedPages(s.user);
  if (s.user && !pages.includes(s.page)) s = { ...s, page: pages[0] };
  if (s.company && !s.state.companies.some((c) => c.id === s.company)) s = { ...s, company: "", project: "" };
  if (s.page === "project" && !s.state.projects.some((p) => p.id === s.projectId)) s = { ...s, page: "projects" };
  return s;
}

export function createStore(initial = initialState()) {
  let current = initial;
  const listeners = new Set();
  return {
    get: () => current,
    set(patch) {
      const next = typeof patch === "function" ? patch(current) : patch;
      current = normalise({ ...current, ...next });
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);
export function useAppState() {
  const { store } = useApp();
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

// The data a component renders from: the live workspace on pages, the dialog's snapshot inside the dialog.
export const DataContext = createContext(null);
export const useData = () => useContext(DataContext);
