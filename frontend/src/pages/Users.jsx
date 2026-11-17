import { Icon } from "../components/Icon.jsx";
import { Badge, Empty, PageHeader, RegionLabel, RowAction, TableWrap } from "../components/ui.jsx";
import { nameOf } from "../lib/selectors.js";
import { useApp, useAppState, useData } from "../lib/store.js";

export function Users() {
  const { actions } = useApp();
  const { state } = useData();
  const { userSearch } = useAppState();
  const users = state.users.filter((u) => !userSearch || [u.name, u.username, u.email, u.role].join(" ").toLowerCase().includes(userSearch.toLowerCase()));
  return (
    <>
      <PageHeader eyebrow="ACCESS & IDENTITY" title="User Manager" description="Clear responsibilities. The right access for every member of the team."
        actions={<button className="primary" data-action="newUser" onClick={() => actions.newUser()}><Icon name="plus" />Create user</button>} />
      <div className="admin-stats">
        <div><strong>{state.users.length}</strong><span>Total users</span></div>
        <div><strong>{state.users.filter((u) => u.active).length}</strong><span>Active accounts</span></div>
        <div><strong>{state.users.filter((u) => u.groupAccess).length}</strong><span>Full group access</span></div>
      </div>
      <div className="admin-intro">
        <span className="op-icon"><Icon name="shield" /></span>
        <div><strong>One role per user. Mandatory two-factor authentication.</strong><br /><small>Admin creates accounts. Password resets use email OTP; authenticator verification stays required.</small></div>
      </div>
      <div className="list-toolbar">
        <div className="searchbox"><Icon name="search" /><input id="userSearch" aria-label="Search users" value={userSearch} onChange={(e) => actions.setSearch("userSearch", e.target.value)} placeholder="Search name, username, email or role" /></div>
        <small>{`${users.length} users`}</small>
      </div>
      <RegionLabel.Provider value={users.length ? "Data table" : "No matching users"}>
        <section className="panel flush">
          <TableWrap>
            <table>
              <thead><tr><th scope="col">User</th><th scope="col">Role</th><th scope="col">Company access</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td><div className="user-cell"><span className="avatar" aria-hidden="true">{u.name.slice(0, 1)}</span><div><strong>{u.name}</strong><span className="secondary">{`${u.username} · ${u.email}`}</span></div></div></td>
                    <td>{u.role}</td>
                    <td><div className="access-chips">{u.groupAccess ? <span className="access-chip">Full group</span> : u.companies.map((c) => <span key={c} className="access-chip">{nameOf(state, "companies", c)}</span>)}</div></td>
                    <td><Badge status={u.active ? "Active" : "Inactive"} /></td>
                    <td><RowAction action="editUser" id={u.id} label={"Manage " + u.name} onRun={() => actions.editUser(u.id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {!users.length ? <Empty title="No matching users" note="Try a different name, role or email address." /> : null}
          <div className="table-footer"><span>{`${users.length} accounts shown`}</span><span>Role controls actions · Company access controls visibility</span></div>
        </section>
      </RegionLabel.Provider>
    </>
  );
}
