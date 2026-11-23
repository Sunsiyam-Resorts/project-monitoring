// Display formatting shared by every page.
export const fmt = (v) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Number(v) || 0);

// Dates show day first, DD/MM/YYYY, on every page; times use the 24-hour clock.
const pad = (n) => String(n).padStart(2, "0");

// A moment (ISO timestamp) in local time: 23/11/2026, 14:05.
export const date = (v) => {
  const d = v ? new Date(v) : null;
  if (!d) return "—";
  if (Number.isNaN(d.getTime())) return "Invalid Date";
  return `${dayOf(d)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// A Date's local calendar day: 23/11/2026.
export const dayOf = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

// A stored day (YYYY-MM-DD) as 23/11/2026. It is rewritten as text, so no time zone can shift it.
export const shortDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso ? String(iso) : "";
};

// Typed DD/MM/YYYY text (day and month may be one digit) as a stored day, or null when it is
// not a real date.
export const parseDay = (value) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const days = mo === 2 ? (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(mo) ? 30 : 31;
  return mo >= 1 && mo <= 12 && d >= 1 && d <= days ? `${m[3]}-${pad(mo)}-${pad(d)}` : null;
};

// A Date's local calendar day as a stored day: 2026-11-23.
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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
