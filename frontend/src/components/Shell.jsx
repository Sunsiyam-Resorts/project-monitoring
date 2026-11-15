// The workspace frame: sidebar (and its copy in the mobile drawer), phone top bar, demo banner.
import { Component, useLayoutEffect, useRef } from "react";
import { isFinanceAdmin } from "../domain/domain.js";
import { Icon } from "./Icon.jsx";
import { Brand } from "./ui.jsx";
import { useApp, useAppState } from "../lib/store.js";
import { pendingCount } from "../lib/selectors.js";
import { animateTables, snapshotTables } from "../lib/motion.js";

const OPERATIONAL = ["dashboard", "projects", "project", "requests"];

// public/theme.js owns the appearance preference: it updates these controls in place, so
// they only take their starting values from the document here.
const themePreference = () => document.documentElement.dataset.themePreference || "system";
const themeLabel = () => (document.documentElement.dataset.theme === "dark" ? "Switch to light theme" : "Switch to dark theme");

export function ThemePicker({ id }) {
  return (
    <div className="appearance-control">
      <label htmlFor={id}>Appearance</label>
      <select id={id} data-theme-picker="" defaultValue={themePreference()}>
        <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
      </select>
    </div>
  );
}

function ThemeToggle() {
  const label = themeLabel();
  return (
    <button type="button" className="icon-button theme-toggle" data-theme-toggle="" aria-label={label} title={label}>
      <span className="theme-moon"><Icon name="moon" /></span><span className="theme-sun"><Icon name="sun" /></span>
    </button>
  );
}

function AccountControls({ user, drawer }) {
  const { actions } = useApp();
  return (
    <div className="sidebar-account">
      <details className="profile-menu">
        <summary aria-label={`User menu for ${user.name}`}>
          <span className="avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span>
          <span className="profile-name"><strong>{user.name}</strong><small>{user.role}</small></span>
          <Icon name="chevron" />
        </summary>
        <div className="profile-popover">
          <strong>{user.name}</strong><small>{user.role}</small>
          <ThemePicker id={drawer ? "drawerAppearance" : "accountAppearance"} />
          <button data-action="logout" onClick={() => actions.logout()}><Icon name="logout" />Sign out</button>
        </div>
      </details>
      <ThemeToggle />
    </div>
  );
}

function PropertySwitcher({ id }) {
  const { actions } = useApp();
  const { state, company } = useAppState();
  return (
    <div className="property-switcher">
      <label htmlFor={id}>Company</label>
      <select id={id} value={company} onChange={(e) => actions.setFilter(id, e.target.value)}>
        <button type="button" className="select-button"><selectedcontent></selectedcontent></button>
        <option value="">All accessible companies</option>
        {state.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
}

function Sidebar({ drawer = false }) {
  const { actions } = useApp();
  const { state, user, raw, demo, page } = useAppState();
  const admin = user.role === "Admin", manage = isFinanceAdmin(user);
  const pending = pendingCount(state, user);
  const actorId = drawer ? "drawerActor" : "actor";
  const item = (key, label) => (
    <button data-page={key} className={page === key ? "active" : ""} aria-current={page === key ? "page" : undefined} onClick={() => actions.navigate(key, drawer)}>
      <Icon name={key} /><span>{label}</span>
      {key === "requests" && pending ? <span className="nav-count">{pending}<span className="sr-only"> awaiting your action</span></span> : null}
    </button>
  );
  return (
    <aside className={drawer ? "sidebar drawer-sidebar" : "sidebar"}>
      <div className="sidebar-brand">
        <Brand />
        {drawer ? <button data-action="closeNavigation" className="icon-button" aria-label="Close navigation" onClick={() => actions.closeNavigation()}><Icon name="close" /></button> : null}
      </div>
      <div className="sidebar-scope">
        {OPERATIONAL.includes(page) ? <PropertySwitcher id={drawer ? "drawerCompany" : "company"} /> : <span className="admin-scope">Group administration</span>}
      </div>
      <nav className="nav" aria-label={`${drawer ? "Mobile" : "Main"} navigation`}>
        <span className="nav-label">Workspace</span>
        {item("dashboard", "Dashboard")}{item("projects", "Projects")}{item("requests", "Requests")}
        {manage ? (
          <>
            <span className="nav-label nav-group">Administration</span>
            {item("master", "Master Data")}{admin ? item("users", "User Manager") : null}{item("audit", "Audit Log")}
            {admin ? item("deleted", "Deleted") : null}{admin ? item("settings", "Settings") : null}
          </>
        ) : null}
      </nav>
      <div className="sidebar-foot">
        {demo ? (
          <div className="sidebar-demo">
            <label htmlFor={actorId}>Demo user <span>· testing only, not secure login</span></label>
            <select id={actorId} aria-label="Demo user — role switching for testing only" value={user.id} onChange={(e) => actions.switchActor(e.target.value)}>
              {raw.users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        ) : null}
        <AccountControls user={user} drawer={drawer} />
      </div>
    </aside>
  );
}

// Pages carry their own titles, so the top bar exists only on phones to open the navigation drawer.
function Header() {
  const { actions } = useApp();
  const { drawerOpen } = useAppState();
  return (
    <header className="topbar">
      <button className="icon-button menu-toggle" data-action="openNavigation" aria-label="Open navigation" aria-controls="navigationDrawer" aria-expanded={drawerOpen ? "true" : "false"} onClick={() => actions.openNavigation()}>
        <Icon name="menu" />
      </button>
    </header>
  );
}

function DemoBanner() {
  const { actions } = useApp();
  return (
    <div className="demo-banner">
      <span><strong>Demo workspace</strong>Sample data · browser-local changes<span className="demo-explanation"> · Role switching is for testing only.</span></span>
      <a href="#" data-action="resetDemo" onClick={(e) => { e.preventDefault(); actions.resetDemo(); }}>Reset sample data</a>
    </div>
  );
}

// Measures table rows just before React changes the page and animates them just after
// (getSnapshotBeforeUpdate has no hook equivalent).
class TableMotion extends Component {
  getSnapshotBeforeUpdate() { return snapshotTables(); }
  componentDidUpdate(_props, _state, snapshot) { animateTables(snapshot); }
  render() { return this.props.children; }
}

export function Shell({ children }) {
  const { actions } = useApp();
  const { page, demo, drawerOpen } = useAppState();
  const drawer = useRef(null);
  useLayoutEffect(() => {
    const d = drawer.current;
    if (drawerOpen && !d.open) d.showModal();
    else if (!drawerOpen && d.open) d.close();
  }, [drawerOpen]);
  return (
    <>
      <a className="skip-link" href="#workspace">Skip to workspace</a>
      <div className="shell">
        <Sidebar />
        <main className="main" id="workspace" tabIndex={-1} data-view={page}>
          <Header />
          <div className="content" aria-labelledby="pageTitle">
            <TableMotion>{demo ? <DemoBanner /> : null}{children}</TableMotion>
          </div>
        </main>
      </div>
      <dialog id="navigationDrawer" className="navigation-drawer" aria-label="Workspace navigation" aria-modal="true" ref={drawer} onClose={() => actions.drawerClosed()}>
        <Sidebar drawer />
      </dialog>
    </>
  );
}
