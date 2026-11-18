// The workspace frame (shadcn Sidebar): the sage rail with company scope, navigation and the
// black account card; on phones the same rail opens as a sheet from the top bar.
import { Component } from "react";
import { ChevronsUpDown, LogOut, Moon, Sun } from "lucide-react";
import { isFinanceAdmin } from "../domain/domain.js";
import { Icon } from "./Icon.jsx";
import { Brand, FormSelect, UserAvatar } from "./ui.jsx";
import { useApp, useAppState } from "../lib/store.js";
import { isPlanning, pendingCount } from "../lib/selectors.js";
import { animateTables, snapshotTables } from "../lib/motion.js";
import { setAppearance, toggleAppearance, useAppearance } from "../lib/appearance.js";
import { Button } from "@/components/ui/button";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPERATIONAL = ["dashboard", "projects", "project", "budgets", "requests"];
const APPEARANCES = [["system", "System"], ["light", "Light"], ["dark", "Dark"]];

// Appearance as a shadcn Select (sign-in page).
export function ThemePicker({ id }) {
  const { preference } = useAppearance();
  return (
    <div className="appearance-control flex items-center gap-2.5">
      <label htmlFor={id} className="text-xs font-semibold max-md:sr-only">Appearance</label>
      <FormSelect id={id} value={preference} onValueChange={setAppearance} className="h-10 w-[120px]"
        options={APPEARANCES.map(([value, label]) => ({ value, label }))} />
    </div>
  );
}

function ThemeToggle() {
  const { theme } = useAppearance();
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  return (
    <Button type="button" size="icon" variant="ghost" className="theme-toggle size-10 shrink-0 border border-white/15 bg-white/5 text-sidebar-primary-foreground hover:bg-white/10 hover:text-sidebar-primary-foreground"
      data-theme-toggle="" aria-label={label} title={label} onClick={toggleAppearance}>
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}

// The signed-in user's menu (shadcn DropdownMenu): appearance and sign out.
function AccountMenu({ user }) {
  const { actions } = useApp();
  const { preference } = useAppearance();
  return (
    <div className="sidebar-account flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger className="profile-menu flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl p-1 pr-2 text-left outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-primary data-[state=open]:bg-white/10" aria-label={`User menu for ${user.name}`}>
          <UserAvatar name={user.name} />
          <span className="profile-name min-w-0 flex-1">
            <strong className="block truncate text-xs font-semibold">{user.name}</strong>
            <small className="block truncate text-[11px] text-white/65">{user.role}</small>
          </span>
          <ChevronsUpDown className="size-3.5 text-white/60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-60">
          <DropdownMenuLabel className="font-normal"><strong className="block text-[13px]">{user.name}</strong><small className="text-xs text-muted-foreground">{user.role}</small></DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="pb-1 text-xs text-muted-foreground">Appearance</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={preference} onValueChange={setAppearance} aria-label="Appearance">
            {APPEARANCES.map(([value, label]) => <DropdownMenuRadioItem key={value} value={value} data-appearance={value}>{label}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem data-action="logout" onSelect={() => actions.logout()}><LogOut />Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ThemeToggle />
    </div>
  );
}

function CompanyScope() {
  const { actions } = useApp();
  const { state, company, page } = useAppState();
  if (!OPERATIONAL.includes(page)) {
    return <span className="admin-scope block rounded-xl border border-sidebar-foreground/20 px-3 py-2.5 text-xs font-semibold">Group administration</span>;
  }
  return (
    <div className="property-switcher grid gap-1.5">
      <label htmlFor="company" className="px-1 text-[11px] font-semibold text-sidebar-muted">Company</label>
      <FormSelect id="company" value={company} onValueChange={(v) => actions.setFilter("company", v)} clearable blank="All accessible companies" items={state.companies}
        className="border-transparent bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 data-[placeholder]:text-sidebar-primary-foreground [&_svg]:text-sidebar-primary-foreground/80" />
    </div>
  );
}

function AppSidebar() {
  const { actions } = useApp();
  const { state, user, raw, demo, page } = useAppState();
  const admin = user.role === "Admin", manage = isFinanceAdmin(user);
  const pending = pendingCount(state, user);
  // From the phone drawer, focus moves to the new page's title; on the sidebar it stays put.
  const { isMobile } = useSidebar();
  const item = (key, label) => (
    <SidebarMenuItem key={key}>
      <SidebarMenuButton data-page={key} isActive={page === key} aria-current={page === key ? "page" : undefined} onClick={() => actions.navigate(key, isMobile)}>
        <Icon name={key} /><span>{label}</span>
      </SidebarMenuButton>
      {key === "requests" && pending ? <SidebarMenuBadge className="nav-count">{pending}<span className="sr-only"> awaiting your action</span></SidebarMenuBadge> : null}
    </SidebarMenuItem>
  );
  return (
    <Sidebar className="sidebar">
      <SidebarHeader className="gap-0 px-6 pt-7 pb-5">
        <Brand className="text-sidebar-foreground [&_.brand-label]:text-sidebar-muted" />
      </SidebarHeader>
      <div className="sidebar-scope mx-4 mb-3 border-b border-sidebar-border pb-4"><CompanyScope /></div>
      <SidebarContent className="nav gap-0" aria-label="Main navigation" role="navigation">
        <SidebarGroup>
          <SidebarGroupLabel className="nav-label">Workspace</SidebarGroupLabel>
          <SidebarMenu>
            {isPlanning(user) ? item("projects", "Projects")
              : [item("dashboard", "Dashboard"), item("projects", "Projects"), item("budgets", "Budgets"), item("requests", "Requests")]}
          </SidebarMenu>
        </SidebarGroup>
        {manage ? (
          <SidebarGroup className="pt-4">
            <SidebarGroupLabel className="nav-label">Administration</SidebarGroupLabel>
            <SidebarMenu>
              {item("master", "Master Data")}{admin ? item("users", "User Manager") : null}{item("audit", "Audit Log")}
              {admin ? item("deleted", "Deleted") : null}{admin ? item("settings", "Settings") : null}
            </SidebarMenu>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarFooter className="p-3">
        <div className="sidebar-foot grid gap-3 rounded-2xl bg-sidebar-primary p-3 text-sidebar-primary-foreground">
          {demo ? (
            <div className="sidebar-demo grid gap-1.5">
              <label htmlFor="actor" className="px-1 text-[11px] leading-snug font-semibold text-white/70">Demo user <span className="font-normal">· testing only, not secure login</span></label>
              <FormSelect id="actor" aria-label="Demo user — role switching for testing only" value={user.id} onValueChange={(v) => actions.switchActor(v)}
                items={raw.users.filter((u) => u.active)} size="sm"
                className="border-white/15 bg-white/5 text-sidebar-primary-foreground hover:bg-white/10 [&_svg]:text-white/70" />
            </div>
          ) : null}
          <AccountMenu user={user} />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function DemoBanner() {
  const { actions } = useApp();
  return (
    <div className="demo-banner mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border/80 bg-card px-4 py-2.5 text-xs text-muted-foreground dark:border-white/[0.04]">
      <span><strong className="mr-2 font-bold text-foreground">Demo workspace</strong>Sample data · browser-local changes<span className="demo-explanation max-md:hidden"> · Role switching is for testing only.</span></span>
      <Button variant="link" size="xs" className="ml-auto" data-action="resetDemo" onClick={() => actions.resetDemo()}>Reset sample data</Button>
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
  return (
    <SidebarProvider openMobile={drawerOpen} onOpenMobileChange={(open) => (open ? actions.openNavigation() : actions.closeNavigation())}>
      <a className="skip-link sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground" href="#workspace">Skip to workspace</a>
      <AppSidebar />
      <SidebarInset className="main min-w-0" id="workspace" tabIndex={-1} data-view={page}>
        <header className="topbar sticky top-0 z-20 flex h-14 items-center border-b border-border bg-background px-4 md:hidden">
          <SidebarTrigger className="menu-toggle size-11 rounded-full border border-border bg-card" data-action="openNavigation" aria-label="Open navigation" aria-expanded={drawerOpen} />
        </header>
        <div className="content mx-auto w-full max-w-[1576px] px-9 pt-6 pb-14 max-xl:px-6 max-md:px-4 max-md:pt-5" aria-labelledby="pageTitle">
          <TableMotion>{demo ? <DemoBanner /> : null}{children}</TableMotion>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
