import { useEffect, useMemo, useState } from "react";
import { createActions } from "./lib/actions.js";
import { AppContext, DataContext, createStore, useApp, useAppState } from "./lib/store.js";
import { startPageMotion } from "./lib/motion.js";
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

const PAGES = { dashboard: Dashboard, projects: Projects, project: ProjectPage, requests: Requests, master: MasterData, users: Users, audit: Audit, deleted: Deleted };

// Background behaviour: start-up, 30-second refresh, cross-tab demo sync, closing menus on
// Escape or outside clicks, the drawer on wide screens, and page scroll motion.
function useWorkspaceEffects() {
  const { actions } = useApp();
  useEffect(() => {
    let alive = true;
    actions.boot(() => alive);
    const timer = setInterval(actions.poll, 30000);
    const menus = () => document.querySelectorAll(".profile-menu[open], .demo-actor[open]");
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      menus().forEach((menu) => { menu.open = false; menu.querySelector("summary")?.focus(); });
    };
    const onClick = (e) => menus().forEach((menu) => { if (!menu.contains(e.target)) menu.open = false; });
    const wide = window.matchMedia?.("(min-width: 761px)");
    const onWide = (e) => { if (e.matches) actions.drawerClosed(); };
    window.addEventListener("storage", actions.storageSync);
    window.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    wide?.addEventListener?.("change", onWide);
    const stopMotion = startPageMotion();
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("storage", actions.storageSync);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
      wide?.removeEventListener?.("change", onWide);
      stopMotion();
      actions.dispose();
    };
  }, [actions]);
}

function Workspace() {
  const { state, user, demo, page } = useAppState();
  const data = useMemo(() => ({ state, user, demo }), [state, user, demo]);
  const Page = PAGES[page] || Settings;
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
