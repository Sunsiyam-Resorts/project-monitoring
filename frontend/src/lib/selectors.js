// Read-only derivations over the visible workspace state, shared by pages and dialogs.
import { canManageRequest, isFinanceAdmin, masterKinds, stageActor } from "../domain/domain.js";
import { PAYMENT_UPDATE_TEMPLATE_ROWS } from "../domain/import-data.js";

// Planning works on project tasks only; every other role sees the financial workspace.
export const isPlanning = (user) => user?.role === "Planning";

// The pages a role may open, the first being where it lands. The server sends Planning no
// financial records, so these pages would be empty for it anyway.
export function allowedPages(user) {
  if (isPlanning(user)) return ["projects", "project"];
  return ["dashboard", "projects", "project", "budgets", "requests",
    ...(isFinanceAdmin(user) ? ["master"] : []),
    ...(user?.role === "Admin" ? ["users", "audit", "deleted", "settings"] : [])];
}

// The Master Data tabs a role may open: every kind for Admin, Suppliers only for Finance.
export const masterTabs = (user) => masterKinds(user);

export const nameOf = (state, kind, id) => state[kind].find((x) => x.id === id)?.name || "—";

export function amendmentAttention(user, o) {
  return !o.rejectedAt && o.amendment && (stageActor(user, o.amendment) ||
    (o.amendment.status === "Draft" && canManageRequest(user, o)));
}

export function attention(user, r) {
  return (["Draft", "Documents Required"].includes(r.status) && canManageRequest(user, r)) || stageActor(user, r);
}

// The payment update template's rows: each payment request the user can process now (with
// Finance or On Hold), by its system-generated reference, with read-only context to find it.
export function paymentUpdateRows(state, user) {
  return state.requests
    .filter((r) => stageActor(user, r) && !state.orders.find((o) => o.id === r.orderId)?.rejectedAt)
    .sort((a, b) => a.number.localeCompare(b.number))
    .slice(0, PAYMENT_UPDATE_TEMPLATE_ROWS)
    .map((r) => {
      const o = state.orders.find((x) => x.id === r.orderId);
      return [r.number, o?.number || "", nameOf(state, "suppliers", o?.supplierId), r.currency, r.amount, r.status, "", "", "", ""];
    });
}

export const pendingCount = (state, user) =>
  state.requests.filter((r) => attention(user, r)).length + state.orders.filter((o) => amendmentAttention(user, o)).length;

export function sortRequests(state, rs, sortOrder) {
  return rs.slice().sort((a, b) => {
    if (sortOrder === "amount-desc") {
      const oa = state.orders.find((o) => o.id === a.orderId), ob = state.orders.find((o) => o.id === b.orderId);
      return b.amount / (b.rate || ob.rate) - a.amount / (a.rate || oa.rate);
    }
    if (sortOrder === "date-asc") return a.date.localeCompare(b.date) || a.number.localeCompare(b.number);
    if (sortOrder === "number") return a.number.localeCompare(b.number);
    return b.date.localeCompare(a.date) || b.number.localeCompare(a.number);
  });
}

export function orderMatch(state, ui, o) {
  const { company, project, search } = ui;
  return (!company || o.companyId === company) &&
    (!project || o.projectId === project) &&
    (!search ||
      [o.number, o.po, o.invoice, o.description, nameOf(state, "suppliers", o.supplierId),
        ...state.requests.filter((r) => r.orderId === o.id).map((r) => r.number)]
        .join(" ").toLowerCase().includes(search.toLowerCase()));
}

export function filteredRequests(state, ui) {
  const { from, to, statusFilter, financeOnly } = ui;
  return state.requests.filter((r) => {
    const o = state.orders.find((o) => o.id === r.orderId);
    return o && orderMatch(state, ui, o) &&
      (!from || r.date >= from) && (!to || r.date <= to) &&
      (!statusFilter || r.status === statusFilter) &&
      (!financeOnly || ["Finance", "On Hold"].includes(r.status));
  });
}

// Deleted records (Admin only) sit beside the live ones.
export const allOrders = (state) => [...state.orders, ...(state.deletedOrders || [])];
export const allRequests = (state) => [...state.requests, ...(state.deletedRequests || [])];
export const deletedRecord = (state, id, kind) =>
  (kind === "order" ? state.deletedOrders : state.deletedRequests)?.find((x) => x.id === id);
