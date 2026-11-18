import { Icon } from "../components/Icon.jsx";
import { Badge, DataTable, Empty, PageHeader, RegionLabel, RowAction, UserAvatar } from "../components/ui.jsx";
import { Sub, TableBody, TableCell, TableHead, TableHeader, TableRow, WORK_TABLE } from "../components/tables.jsx";
import { ListToolbar, SearchBox } from "../components/Toolbar.jsx";
import { TableFooterNote } from "../components/TableFooterNote.jsx";
import { nameOf } from "../lib/selectors.js";
import { useApp, useAppState, useData } from "../lib/store.js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge as ShadcnBadge } from "@/components/ui/badge";

export function Users() {
  const { actions } = useApp();
  const { state } = useData();
  const { userSearch } = useAppState();
  const users = state.users.filter((u) => !userSearch || [u.name, u.username, u.email, u.role].join(" ").toLowerCase().includes(userSearch.toLowerCase()));
  const stats = [[state.users.length, "Total users"], [state.users.filter((u) => u.active).length, "Active accounts"], [state.users.filter((u) => u.groupAccess).length, "Full group access"]];
  return (
    <>
      <PageHeader title="User Manager" description="Clear responsibilities. The right access for every member of the team."
        actions={<Button data-action="newUser" onClick={() => actions.newUser()}><Icon name="plus" />Create user</Button>} />
      <div className="admin-stats mb-5 flex flex-wrap gap-x-9 gap-y-3 border-t border-border pt-5">
        {stats.map(([n, label]) => <div key={label}><strong className="block font-display text-2xl font-semibold tabular">{n}</strong><span className="text-xs text-muted-foreground">{label}</span></div>)}
      </div>
      <Alert className="admin-intro mb-6 border-0 bg-transparent px-0">
        <AlertTitle className="text-xs text-foreground">One role per user. Mandatory two-factor authentication.</AlertTitle>
        <AlertDescription>Admin creates accounts. Password resets use email OTP; authenticator verification stays required.</AlertDescription>
      </Alert>
      <ListToolbar>
        <SearchBox id="userSearch" label="Search users" placeholder="Search name, username, email or role" value={userSearch} onChange={(v) => actions.setSearch("userSearch", v)} />
        <small className="text-xs text-muted-foreground">{`${users.length} users`}</small>
      </ListToolbar>
      <RegionLabel.Provider value={users.length ? "Data table" : "No matching users"}>
        <Card className="gap-0 overflow-hidden py-0">
          <DataTable className={WORK_TABLE}>
            <TableHeader><TableRow><TableHead scope="col">User</TableHead><TableHead scope="col">Role</TableHead><TableHead scope="col">Company access</TableHead><TableHead scope="col">Status</TableHead><TableHead scope="col"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell data-label="User">
                    <div className="user-cell flex items-center gap-3"><UserAvatar name={u.name} tone="soft" /><div className="min-w-0"><strong className="font-semibold">{u.name}</strong><Sub>{`${u.username} · ${u.email}`}</Sub></div></div>
                  </TableCell>
                  <TableCell data-label="Role">{u.role}</TableCell>
                  <TableCell data-label="Company access">
                    <div className="access-chips flex flex-wrap gap-1.5">{u.groupAccess ? <ShadcnBadge className="access-chip rounded-full">Full group</ShadcnBadge> : u.companies.map((c) => <ShadcnBadge key={c} className="access-chip rounded-full">{nameOf(state, "companies", c)}</ShadcnBadge>)}</div>
                  </TableCell>
                  <TableCell data-label="Status"><Badge status={u.active ? "Active" : "Inactive"} /></TableCell>
                  <TableCell className="w-16 text-right"><RowAction action="editUser" id={u.id} label={"Manage " + u.name} onRun={() => actions.editUser(u.id)} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
          {!users.length ? <Empty title="No matching users" note="Try a different name, role or email address." /> : null}
          <TableFooterNote left={`${users.length} accounts shown`} right="Role controls actions · Company access controls visibility" />
        </Card>
      </RegionLabel.Provider>
    </>
  );
}
