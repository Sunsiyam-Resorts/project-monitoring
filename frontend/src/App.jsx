import { useEffect, useMemo, useState } from "react";
import { createActions } from "./lib/actions.js";
import { AppContext, DataContext, createStore, useApp, useAppState } from "./lib/store.js";
import { startPageMotion } from "./lib/motion.js";
import { startHistory } from "./lib/history.js";
import { startIdleWatch } from "./lib/idle.js";
import { LoadingSkeleton } from "./components/ui.jsx";
import { Shell } from "./components/Shell.jsx";
import { ModalHost, ToastHost } from "./modals/ModalHost.jsx";
import { Login } from "./pages/Login.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";
import { Projects } from "./pages/Projects.jsx";
import { ProjectPage } from "./pages/ProjectPage.jsx";
import { Requests } from "./pages/Requests.jsx";
import { MasterData } from "./pages/MasterData.jsx";
import { Users } from "./pages/Users.jsx";
import { Audit } from "./pages/Audit.jsx";
import { Deleted } from "./pages/Deleted.jsx";
import { Settings } from "./pages/Settings.jsx";
import { Budgets } from "./pages/Budgets.jsx";

const PAGES = { dashboard: Dashboard, projects: Projects, project: ProjectPage, budgets: Budgets, requests: Requests, master: MasterData, users: Users, audit: Audit, deleted: Deleted, settings: Settings };

// Background behaviour: start-up, browser history for pages, 30-second refresh, cross-tab demo sync, the drawer on
// wide screens, and page scroll motion. Menus, selects and dialogs (Radix) close themselves on Escape or outside clicks.
function useWorkspaceEffects() {
  const { actions, store } = useApp();
  useEffect(() => {
    let alive = true;
    const stopHistory = startHistory(store, actions.restorePage);
    actions.boot(() => alive);
    const timer = setInterval(actions.poll, 30000);
    // The sidebar is a drawer below 768px (shadcn Sidebar); widening the window closes the drawer.
    const wide = window.matchMedia?.("(min-width: 768px)");
    const onWide = (e) => { if (e.matches) actions.drawerClosed(); };
    window.addEventListener("storage", actions.storageSync);
    wide?.addEventListener?.("change", onWide);
    const stopMotion = startPageMotion();
    // Sign a live session out after 15 minutes of inactivity (lib/idle.js).
    const idle = startIdleWatch({
      active: () => { const s = store.get(); return Boolean(s.user) && !s.demo; },
      onIdle: actions.idleSignOut,
      keepAlive: actions.keepAlive,
    });
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("storage", actions.storageSync);
      wide?.removeEventListener?.("change", onWide);
      stopMotion();
      idle.stop();
      stopHistory();
      actions.dispose();
    };
  }, [actions, store]);
}

function Workspace() {
  const { state, user, demo, page } = useAppState();
  const data = useMemo(() => ({ state, user, demo }), [state, user, demo]);
  const Page = PAGES[page] || Dashboard;
  return (
    <DataContext.Provider value={data}>
      <Shell><Page /></Shell>
    </DataContext.Provider>
  );
}

function Root() {
  useWorkspaceEffects();
  const { boot, user } = useAppState();
  return (
    <>
      {boot ? <LoadingSkeleton /> : user ? <Workspace /> : <Login />}
      <ModalHost />
      <ToastHost />
    </>
  );
}

export function App() {
  // One store per mounted app; motion remembers the figures and charts already shown.
  const [app] = useState(() => {
    const store = createStore();
    return { store, actions: createActions(store), motion: { figures: new Map(), charts: new Map() } };
  });
  return (
    <AppContext.Provider value={app}>
      <Root />
    </AppContext.Provider>
  );
}
