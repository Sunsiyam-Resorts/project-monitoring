// Display formatting shared by every page. Values match the legacy templates exactly.
export const fmt = (v) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Number(v) || 0);

export const date = (v) =>
  v ? new Date(v).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";

export const shortDate = (iso) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

export const word = (n, one, many) => (n === 1 ? one : many);

export const ACTION_LABELS = {
  "order.create": "Order created", "order.edit": "Order edited", "order.amend": "Amendment submitted", "order.reject": "Order rejected",
  "amendment.approve": "Amendment approved", "amendment.return": "Amendment returned", "amendment.reject": "Amendment rejected", "amendment.resubmit": "Amendment resubmitted",
  "request.create": "Payment request created", "request.edit": "Payment request edited", "request.submit": "Payment request submitted",
  "request.approve": "Payment request approved", "request.return": "Payment request returned", "request.reject": "Payment request rejected",
  "request.hold": "Put on hold", "request.resume": "Hold released", "request.pay": "Payment recorded", "request.support": "Documents supplied",
  "request.remark": "Remark added", "master.save": "Master data saved", "user.save": "User saved", "settings.save": "Settings saved",
  "import.create": "Records imported", lock: "Record locked", unlock: "Record unlocked",
  "task.save": "Task saved", "task.delete": "Task deleted", "workflow.migrated": "Moved to Finance", "user.migrated": "Role retired",
  "order.delete": "Request deleted", "request.delete": "Payment request deleted",
  "order.restore": "Request restored", "request.restore": "Payment request restored",
};

// Stored audit codes such as request.pay read as "Payment recorded"; unknown dotted codes are spelled out.
export const actionLabel = (code) =>
  ACTION_LABELS[code] ||
  (/^[a-z]+\.[a-zA-Z]+$/.test(code)
    ? code.replace(".", " ").replace(/([A-Z])/g, " $1").toLowerCase().replace(/^./, (c) => c.toUpperCase())
    : code);

// Stat figures: the decimals (".00") render at half size; figureLength counts them at half width.
export const figureLength = (formatted) => {
  const [whole, dec] = String(formatted).split(".");
  return whole.length + (dec === undefined ? 0 : (dec.length + 1) * 0.5);
};
