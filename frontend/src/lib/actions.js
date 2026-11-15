// The action layer: every workflow step the UI can take. It mirrors the legacy controller —
// commands, record locks, dialogs, toasts and focus — and is the only writer of the store.
// Components call the guarded entry points (errors become toasts); dialog forms call the
// submit* functions, which throw so the form can show the message.
import { flushSync } from "react-dom";
import { apply, migrateState, visibleState, supportingFile, isFinanceAdmin } from "../domain/domain.js";
import { demoState } from "../domain/demo.js";
import { api } from "./api.js";
import { csvExport, downloadPDF, readFiles, readPDF } from "./files.js";
import { importTemplate } from "./excel.js";
import { deletedRecord } from "./selectors.js";
import { emptyAuditFilter } from "./store.js";

export const STORE_KEY = "ss-project-monitoring-demo-v1";
const ACTOR_KEY = "demo-actor";

export function createActions(store) {
  const { get, set } = store;
  // Record lock held by the open dialog, the element to refocus when it closes, and the
  // payment a request was opened from (its "Back to Payment Request" link).
  let busy = false, selected = null, focusReturn = null, returnPaymentId = null;
  let toastTimer = null, modalSeq = 0, toastSeq = 0;

  const $ = (s) => document.querySelector(s);
  const focus = (el) => el?.focus({ preventScroll: true });
  // Commit now when the next step needs the updated DOM (focus, scrolling, dialog state).
  const commit = (patch) => flushSync(() => { if (patch) set(patch); });

  // Click entry points report failures as error toasts; change handlers use the default kind.
  const guard = (fn, kind = "error") => async (...args) => {
    try { return await fn(...args); } catch (e) { toast(e.message, kind); }
  };

  function toast(message, kind = "success") {
    clearTimeout(toastTimer);
    const s = get();
    set({
      toast: { seq: ++toastSeq, message, kind, visible: true },
      // An open dialog repeats the message at the top of its body.
      modal: s.modal ? { ...s.modal, feedback: { message, kind } } : s.modal,
    });
    toastTimer = setTimeout(() => set({ toast: { ...get().toast, visible: false } }), 5000);
  }

  async function command(a) {
    if (busy) throw Error("Please wait for the current action");
    busy = true;
    try {
      const s = get();
      if (s.demo) {
        const next = structuredClone(s.raw);
        apply(next, s.user, a);
        localStorage.setItem(STORE_KEY, JSON.stringify(next));
        const user = next.users.find((u) => u.id === s.user.id);
        set({ raw: next, user, state: visibleState(next, user) });
      } else {
        const out = await api("command", a);
        set({ state: out.state, user: out.user });
      }
      return true;
    } finally {
      busy = false;
    }
  }

  // ---- Start-up, refresh and cross-tab sync -------------------------------------------
  async function boot(alive) {
    try {
      const c = await api("config");
      if (c.configured) {
        try {
          const r = await api("state");
          if (alive()) set({ boot: false, user: r.user, state: r.state });
          return;
        } catch { /* not signed in */ }
      }
    } catch { /* API unavailable: sign-in and demo still work */ }
    if (alive()) set({ boot: false });
  }

  async function poll() {
    const s = get();
    if (!s.user || s.modal || s.drawerOpen || $(".profile-menu[open], .demo-actor[open]") || document.activeElement?.matches("input,select,textarea")) return;
    try {
      if (s.demo) {
        const saved = localStorage.getItem(STORE_KEY);
        const raw = saved ? JSON.parse(saved) : get().raw;
        set({ raw, state: visibleState(raw, get().user) });
      } else {
        const r = await api("state");
        set({ state: r.state, user: r.user });
      }
    } catch (e) {
      if (e.message === "Sign in required") set({ user: null, loginSeq: get().loginSeq + 1 });
    }
  }

  function storageSync(e) {
    const s = get();
    if (s.demo && e.key === STORE_KEY && e.newValue) {
      const raw = JSON.parse(e.newValue);
      const user = raw.users.find((u) => u.id === s.user.id) || raw.users[0];
      set({ raw, user, state: visibleState(raw, user), drawerOpen: false });
    }
  }

  // ---- Sign-in ------------------------------------------------------------------------
  function enterDemo() {
    let raw;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { /* replaced below */ }
    // A demo saved from older sample data is replaced with the current sample.
    if (!raw || raw.sampleVersion !== demoState().sampleVersion) raw = demoState({ history: true });
    migrateState(raw);
    localStorage.setItem(STORE_KEY, JSON.stringify(raw));
    const user = raw.users.find((u) => u.id === sessionStorage.getItem(ACTOR_KEY)) || raw.users[0];
    set({ demo: true, raw, user, state: visibleState(raw, user) });
  }

  const loginView = (patch) => set({ ...patch, loginSeq: get().loginSeq + 1 });

  async function submitLogin(d) {
    const s = get();
    if (s.loginStep === "password") {
      const r = await api("login", d);
      loginView({ loginChallenge: r.challenge, enrollKey: r.secret || "", enrollQr: r.qrCode || "", enrollMethod: r.qrCode ? "qr" : "key", loginStep: "totp" });
    } else if (s.loginStep === "totp") {
      const r = await api("verify", { challenge: s.loginChallenge, code: d.code });
      set({ user: r.user, state: r.state, enrollKey: "", enrollQr: "", loginChallenge: "", demo: false });
      if (!r.user) loginView({});
    } else if (s.loginStep === "reset-start") {
      const r = await api("reset-start", d);
      loginView({ loginChallenge: r.challenge, loginStep: "reset-finish" });
      toast(r.message);
    } else {
      await api("reset-finish", { challenge: s.loginChallenge, code: d.code, password: d.password });
      loginView({ loginStep: "password" });
      toast("Password reset. Sign in with your new password and authenticator.");
    }
  }

  function chooseEnrollment(method) {
    const s = get();
    if (s.loginStep !== "totp" || !s.enrollKey) return;
    const enrollMethod = method === "qr" && s.enrollQr ? "qr" : "key";
    commit({ enrollMethod });
    $(`[data-method="${enrollMethod}"]`)?.focus();
  }

  async function logout() {
    await closeModal();
    if (!get().demo) await api("logout", {});
    loginView({ demo: false, user: null, state: null, raw: null, page: "dashboard", loginStep: "password", drawerOpen: false });
  }

  async function resetDemo() {
    await closeModal();
    const raw = demoState({ history: true });
    localStorage.setItem(STORE_KEY, JSON.stringify(raw));
    const user = raw.users[0];
    set({ raw, user, state: visibleState(raw, user), drawerOpen: false });
    toast("Demo data reset");
  }

  // Demo role switching is for testing only; it is not a secure login.
  async function switchActor(id) {
    await closeModal();
    const s = get();
    const user = s.raw.users.find((u) => u.id === id);
    sessionStorage.setItem(ACTOR_KEY, user.id);
    const allowed = ["dashboard", "projects", "project", "requests", ...(isFinanceAdmin(user) ? ["master", "audit"] : []), ...(user.role === "Admin" ? ["users", "deleted", "settings"] : [])];
    set({ user, state: visibleState(s.raw, user), page: allowed.includes(get().page) ? get().page : "dashboard", company: "", project: "", drawerOpen: false });
  }

  // ---- Navigation and list controls -----------------------------------------------------
  function navigate(page, fromDrawer = false) {
    commit({ page, drawerOpen: false });
    window.scrollTo({ top: 0, behavior: "instant" });
    focus(fromDrawer ? $("#pageTitle") : $(`[data-page="${page}"]`));
  }

  function setTab(tab) {
    commit({ tab });
    focus($(`[data-tab="${tab}"]`));
  }

  function setMasterTab(masterTab) {
    commit({ masterTab, masterSearch: "" });
    focus($(`[data-master="${masterTab}"]`));
  }

  function toggleExpand(id) {
    const expanded = get().expanded;
    commit({ expanded: expanded.includes(id) ? expanded.filter((x) => x !== id) : [...expanded, id] });
    $(`[data-action="expand"][data-id="${id}"]`)?.focus();
  }

  function openProject(projectId) {
    commit({ projectId, page: "project" });
    window.scrollTo({ top: 0, behavior: "instant" });
    focus($("#pageTitle"));
  }

  function backProjects() {
    const from = get().projectId;
    commit({ page: "projects" });
    focus($(`[data-action="openProject"][data-id="${from}"]`));
  }

  function toggleFilters() {
    commit({ filtersExpanded: !get().filtersExpanded });
    focus($('[data-action="toggleFilters"]'));
  }

  function auditGo(n) {
    commit({ auditPageNo: Number(n) || 1 });
    focus($(".pager .current"));
    $(".audit-table")?.scrollIntoView({ block: "start" });
  }

  function auditClear() {
    commit({ auditFilter: emptyAuditFilter(), auditSearch: "", auditPageNo: 1 });
    focus($("#auditAction"));
  }

  const clearFilters = () => set({ company: "", project: "", from: "", to: "", statusFilter: "", search: "", financeOnly: false });

  function queue(target) {
    const tab = target === "Finance" ? "finance" : target === "commitments" ? "balance" : target === "inbox" ? "inbox" : "requests";
    commit({ page: "requests", search: "", from: "", to: "", statusFilter: "", financeOnly: false, tab });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  // Scope and filter selects keep focus where the user left it.
  function setFilter(id, value) {
    if (id === "company" || id === "drawerCompany") commit({ company: value, project: "", drawerOpen: false });
    else if (id === "project") commit({ project: value });
    else if (id === "from") commit({ from: value });
    else if (id === "to") commit({ to: value });
    else if (id === "statusFilter") commit({ statusFilter: value, financeOnly: false });
    focus(document.getElementById(id));
  }

  function setAuditFilter(id, value) {
    const key = { auditAction: "action", auditUser: "user", auditCompany: "company", auditFrom: "from", auditTo: "to" }[id];
    commit({ auditFilter: { ...get().auditFilter, [key]: value }, auditPageNo: 1 });
    focus(document.getElementById(id));
  }

  // Search boxes filter as you type and keep focus (and the caret) in the box.
  function setSearch(id, value) {
    if (id === "masterSearch") set({ masterSearch: value });
    else if (id === "projectSearch") set({ projectSearch: value });
    else if (id === "auditSearch") set({ auditSearch: value, auditPageNo: 1 });
    else if (id === "userSearch") set({ userSearch: value });
    else set({ search: value });
    const box = document.getElementById(id);
    if (box && document.activeElement !== box) box.focus();
  }

  const setSortOrder = (sortOrder) => commit({ sortOrder });
  const setDisclosure = (key, open) => { if (Boolean(get().disclosures[key]) !== open) set({ disclosures: { ...get().disclosures, [key]: open } }); };

  // ---- Mobile navigation drawer ---------------------------------------------------------
  const openNavigation = () => set({ drawerOpen: true });
  function closeNavigation() {
    commit({ drawerOpen: false });
    $("[data-action=openNavigation]")?.focus();
  }
  const drawerClosed = () => { if (get().drawerOpen) set({ drawerOpen: false }); };

  // ---- Dialogs ----------------------------------------------------------------------------
  // Every show replaces the dialog's content with a fresh view of the workspace as it is now.
  function showModal(view, props = {}) {
    const s = get();
    if (!s.modal && document.activeElement !== document.body) focusReturn = document.activeElement;
    set({ modal: { seq: ++modalSeq, view, props, snap: { state: s.state, user: s.user, demo: s.demo, raw: s.raw }, feedback: null } });
  }

  async function closeModal() {
    const id = selected;
    selected = null;
    returnPaymentId = null;
    commit({ modal: null });
    document.body.classList.remove("document-mode");
    if (id)
      try { await command({ type: "unlock", id }); } catch (e) { toast(e.message, "error"); }
    commit();
    const action = focusReturn?.dataset?.action;
    const restored = action ? $(`[data-action="${action}"]${focusReturn.dataset.id ? '[data-id="' + focusReturn.dataset.id + '"]' : ""}`) : null;
    if (focusReturn?.isConnected) focus(focusReturn);
    else if (restored) focus(restored);
    else focus($(`[data-page="${get().page}"]`));
  }

  async function openRecord(id, kind, paymentId = null) {
    if (selected && selected !== id) await closeModal();
    if (!get().modal) focusReturn = document.activeElement;
    await command({ type: "lock", id });
    selected = id;
    returnPaymentId = kind === "order" && get().state.requests.some((r) => r.id === paymentId && r.orderId === id) ? paymentId : null;
    kind === "order" ? orderDetail(id) : requestDetail(id);
  }

  const orderDetail = (id) => showModal("orderDetail", { id, returnPaymentId });
  const requestDetail = (id) => showModal("requestDetail", { id });
  const orderForm = (id, preset = null) => showModal("orderForm", { id, preset });
  const paymentForm = (orderId, id) => showModal("paymentForm", { orderId, id });
  const masterForm = (id) => showModal("masterForm", { kind: get().masterTab, id });
  const taskForm = (projectId, id) => showModal("taskForm", { projectId, id });
  const reasonForm = (id, action) => showModal("reasonForm", { id, action });

  async function openDeleted(id, kind) {
    if (selected && selected !== id) await closeModal();
    if (!get().modal) focusReturn = document.activeElement;
    await command({ type: "lock", id });
    selected = id;
    deletedDetail(id, kind);
  }

  function deletedDetail(id, kind) {
    if (!deletedRecord(get().state, id, kind)) return closeModal();
    showModal("deletedDetail", { id, kind });
  }

  function restoreForm(id, kind) {
    if (deletedRecord(get().state, id, kind)) showModal("restoreForm", { id, kind });
  }

  function newProject(id) {
    set({ masterTab: "projects" });
    masterForm(id);
  }

  function projectOrder(projectId) {
    const pr = get().state.projects.find((x) => x.id === projectId);
    orderForm(undefined, { companyId: pr.companyId, projectId: pr.id });
  }

  // A payment request needs the order's lock, as when it is raised from the order itself.
  async function projectPayment(orderId) {
    await command({ type: "lock", id: orderId });
    selected = orderId;
    paymentForm(orderId);
  }

  async function amendApprove(id) {
    await command({ type: "amendment.approve", id });
    orderDetail(id);
  }

  async function advance(id, step) {
    await command({ type: "request." + step, id });
    requestDetail(id);
    toast(step === "submit" ? "Submitted to Finance" : "Hold released");
  }

  async function unlock(id) {
    await command({ type: "unlock", id });
    toast("Lock released");
  }

  async function taskStatus(taskId, status, select) {
    const task = get().state.tasks.find((x) => x.id === taskId);
    try {
      await command({ type: "task.save", data: { record: { ...task, status } } });
      toast(`${task.name}: ${status}`);
    } catch (error) {
      toast(error.message, "error");
      select.value = task.status;
    }
    focus($(`[data-task="${task.id}"]`));
  }

  async function fileDownload(b) {
    const s = get();
    const f = s.demo
      ? supportingFile(s.raw, s.user, b)
      : (await api("file&" + new URLSearchParams({ id: b.id, kind: b.kind, index: b.index || 0, version: b.version || "", side: b.side || "data" }))).file;
    downloadPDF(f);
  }

  // ---- Dialog form submissions (they throw; the form shows the message) ------------------
  async function submitOrder(id, fd) {
    const d = Object.fromEntries(fd);
    const { state, demo, raw } = get();
    const old = id ? state.orders.find((o) => o.id === id) : null;
    if (old) {
      d.companyId = old.companyId;
      d.projectId = old.projectId;
      d.currency = old.currency;
    }
    const source = old?.amendment?.status === "Draft" ? old.amendment.data : old;
    const files = fd.getAll("files").filter((x) => x.size);
    if (files.reduce((a, f) => a + f.size, 0) > 2000000) throw Error("Combined supporting PDFs must not exceed 2 MB");
    let keep;
    if (old && (!files.length || d.fileMode === "append")) {
      if (demo) {
        const rec = raw.orders.find((o) => o.id === id);
        keep = rec.amendment?.status === "Draft" ? rec.amendment.data.files : rec.files;
      } else
        keep = await Promise.all(source.files.map((_, i) =>
          api("file&id=" + id + "&kind=" + (old.amendment?.status === "Draft" ? "amendment" : "order") + "&index=" + i).then((r) => r.file)));
    }
    d.files = files.length ? [...(d.fileMode === "append" ? keep || [] : []), ...(await Promise.all(files.map(readPDF)))] : keep || [];
    d.allocations = state.budgets.find((b) => b.id === d.budgetId).categories
      .map((c) => ({ categoryId: c.id, amount: Number(fd.get("allocation_" + c.id)) }))
      .filter((c) => c.amount > 0);
    if (!id) d.payment = { date: d.firstdate, currency: d.firstcurrency, percent: d.firstpercent, amount: d.firstamount, terms: d.firstterms };
    await command({ type: id ? "order.amend" : "order.create", id, data: d });
    await closeModal();
    if (!id) await openRecord(get().state.requests.at(-1).id, "request");
    toast(id ? "Amendment submitted to Finance" : "Request and first payment request created");
  }

  async function submitPayment(id, orderId, fd) {
    const d = Object.fromEntries(fd);
    await command({ type: id ? "request.edit" : "request.create", id, data: { ...d, orderId } });
    const s = get();
    await openRecord(id || (s.demo ? s.raw.requests.at(-1).id : s.state.requests.at(-1).id), "request");
    toast("Payment request saved as draft");
  }

  async function submitReason(id, action, fd) {
    const d = Object.fromEntries(fd);
    const type = action === "parentReject" ? "order.reject"
      : action === "deleteOrder" ? "order.delete"
        : action === "deleteRequest" ? "request.delete"
          : action === "amendReturn" ? "amendment.return"
            : action === "amendReject" ? "amendment.reject"
              : "request." + action;
    await command({ type, id, data: d });
    if (type.endsWith(".delete")) {
      await closeModal();
      toast(`${type === "order.delete" ? "Request" : "Payment request"} deleted. Admin can restore it from the Deleted page.`);
    } else {
      if (type.startsWith("order.") || type.startsWith("amendment.")) orderDetail(id);
      else requestDetail(id);
      toast("Request updated");
    }
  }

  async function submitRestore(id, kind) {
    await command({ type: `${kind}.restore`, id });
    await closeModal();
    toast(`${kind === "order" ? "Request" : "Payment request"} restored. It counts again in the dashboard and balances.`);
  }

  async function submitSupport(id, fd) {
    const d = Object.fromEntries(fd);
    d.files = await readFiles(fd);
    await command({ type: "request.support", id, data: d });
    requestDetail(id);
    toast("Documents submitted to Finance");
  }

  async function submitPay(id, fd) {
    const d = Object.fromEntries(fd);
    d.files = await readFiles(fd, false);
    await command({ type: "request.pay", id, data: d });
    requestDetail(id);
    toast("Payment recorded");
  }

  async function submitMaster(kind, id, fd, form) {
    const d = Object.fromEntries(fd);
    const old = id ? get().state[kind].find((x) => x.id === id) : null;
    const record = { id: id || undefined, name: d.name };
    if (["companies", "projects"].includes(kind)) record.code = d.code;
    if (kind === "budgets") record.currency = d.currency;
    if (kind === "projects" || kind === "budgets") record.companyId = old?.companyId || d.companyId;
    if (kind === "suppliers") record.email = d.email;
    if (kind === "currencies") {
      record.id = d.code;
      record.rate = Number(d.rate);
    }
    if (kind === "budgets") {
      record.projectId = old?.projectId || d.projectId;
      record.categories = [...form.querySelectorAll("[data-category]")].map((row) => ({
        id: row.dataset.category,
        name: row.querySelector("[name=categoryName]").value,
        amount: Number(row.querySelector("[name=categoryAmount]").value),
      }));
    }
    await command({ type: "master.save", data: { kind, record, reason: d.reason } });
    await closeModal();
    toast("Master data saved");
  }

  async function submitTask(id, projectId, fd) {
    const d = Object.fromEntries(fd);
    await command({ type: "task.save", data: { record: { id: id || undefined, projectId, name: d.name, status: d.status, owner: d.owner, due: d.due } } });
    await closeModal();
    toast(id ? "Task saved" : "Task added");
  }

  async function submitTaskDelete(id) {
    await command({ type: "task.delete", id });
    await closeModal();
    toast("Task deleted");
  }

  async function submitUser(id, fd) {
    const d = Object.fromEntries(fd);
    const record = { ...d, id: id || undefined, companies: fd.getAll("companies"), groupAccess: fd.has("groupAccess"), active: fd.has("active") };
    delete record.password;
    await command({ type: "user.save", data: { record, password: d.password } });
    await closeModal();
    toast("User saved");
  }

  async function submitSettings(fd) {
    await command({ type: "settings.save", data: Object.fromEntries(fd) });
    toast("Settings saved");
  }

  async function previewImport(data) {
    await command({ type: "import.preview", data });
  }

  async function confirmImport(data) {
    if (!data) throw Error("Validate the file first");
    await command({ type: "import.create", data });
    await closeModal();
    toast("Import completed");
  }

  const g = guard;
  return {
    get, toast, command,
    // Background work started by the app shell.
    boot, poll, storageSync, drawerClosed, setDisclosure,
    // Sign-in.
    enterDemo: g(enterDemo), submitLogin, chooseEnrollment: g(chooseEnrollment), logout: g(logout),
    resetPassword: () => loginView({ loginStep: "reset-start" }),
    backLogin: () => loginView({ loginStep: "password", enrollKey: "", enrollQr: "", loginChallenge: "" }),
    resetDemo: g(resetDemo), switchActor: g(switchActor, "success"),
    // Navigation and lists.
    navigate: g(navigate), setTab: g(setTab), setMasterTab: g(setMasterTab), toggleExpand: g(toggleExpand),
    openProject: g(openProject), backProjects: g(backProjects), toggleFilters: g(toggleFilters),
    auditGo: g(auditGo), auditClear: g(auditClear), clearFilters: g(clearFilters), queue: g(queue),
    setFilter: g(setFilter, "success"), setAuditFilter: g(setAuditFilter, "success"), setSearch, setSortOrder: g(setSortOrder, "success"),
    openNavigation, closeNavigation: g(closeNavigation),
    exportSummary: g(() => { const s = get(); csvExport(s.state, s.company, s.project); }),
    // Records and dialogs.
    closeModal: g(closeModal),
    openOrder: g((id, paymentId) => openRecord(id, "order", paymentId)),
    openRequest: g((id) => openRecord(id, "request")),
    openDeleted: g(openDeleted), restoreForm: g(restoreForm),
    newOrder: g(() => orderForm()), editOrder: g((id) => orderForm(id)),
    newPayment: g((orderId) => paymentForm(orderId)),
    editPayment: g((id) => paymentForm(get().state.requests.find((r) => r.id === id).orderId, id)),
    submitRequest: g((id) => advance(id, "submit")), resume: g((id) => advance(id, "resume")),
    reasonForm: g(reasonForm), payForm: g((id) => showModal("payForm", { id })),
    supply: g((id) => showModal("supply", { id })),
    documentView: g((id) => showModal("documentView", { id, generatedAt: Date.now() })),
    print: g(() => window.print()),
    amendApprove: g(amendApprove),
    newProject: g(() => newProject()), editProject: g((id) => newProject(id)),
    projectOrder: g(projectOrder), projectPayment: g(projectPayment),
    newTask: g((projectId) => taskForm(projectId)), editTask: g((id) => taskForm(null, id)),
    deleteTask: g((id) => showModal("taskDelete", { id })),
    taskStatus: g(taskStatus, "success"),
    importForm: g(() => { const s = get(); showModal("importForm", { kinds: s.page === "master" ? [s.masterTab] : ["orders", "payments"] }); }),
    importTemplate: g(importTemplate),
    newMaster: g(() => masterForm()), editMaster: g((id) => masterForm(id)),
    newUser: g(() => showModal("userForm", {})), editUser: g((id) => showModal("userForm", { id })),
    unlock: g(unlock), fileDownload: g(fileDownload),
    // Form submissions.
    submitOrder, submitPayment, submitReason, submitRestore, submitSupport, submitPay, submitMaster,
    submitTask, submitTaskDelete, submitUser, submitSettings, previewImport, confirmImport: g(confirmImport),
    dispose: () => clearTimeout(toastTimer),
  };
}
