// The budget card (three figures over the YTD chart) and, on the right, the payment card
// (four figures over one combined chart). Shared by the Dashboard and each project page;
// `before` / `after` add cards above or below the payment card in the right-hand column.
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { kpis, kpiTrend } from "../domain/domain.js";
import { fmt, figureLength } from "../lib/format.js";
import { useApp, useData } from "../lib/store.js";
import { motionOff } from "../lib/motion.js";
import { BudgetChart, PaymentChart } from "./Charts.jsx";

// Stat figures: the decimals (".00") render at half size on the same baseline. The plain
// figure uses the odometer's own wrapper, so nothing moves when a roll hands over to it.
function Figure({ formatted }) {
  const [whole, dec] = String(formatted).split(".");
  return <span className="odo-number">{whole}{dec === undefined ? null : <span className="odo-dec">{"." + dec}</span>}</span>;
}

// Odometer: each digit keeps its real character as (transparent) text while CSS rolls a
// 0–9 strip from the last shown digit to the new one; decimals roll in their own group.
function Odometer({ from, to, rolled }) {
  const dot = to.indexOf(".");
  const cell = (ch, i) => /\d/.test(ch)
    ? <span key={i} className="odo" style={{ "--d": rolled ? ch : /\d/.test(from[i]) ? from[i] : "0", "--i": String(i) }} data-to={ch}>{ch}</span>
    : <span key={i}>{ch}</span>;
  const chars = [...to];
  const whole = chars.map((ch, i) => (dot >= 0 && i >= dot ? null : cell(ch, i)));
  const decimals = dot >= 0 ? chars.slice(dot).map((ch, j) => cell(ch, dot + j)) : [];
  return <span className="odo-number">{whole}{decimals.length ? <span className="odo-dec">{decimals}</span> : null}</span>;
}

// KPI figures roll digit by digit from the last shown value to the new one; on first view
// they roll up from zeros. Once rolled the figure returns to its plain markup.
function KpiValue({ kpi, formatted }) {
  const { motion } = useApp();
  const [roll, setRoll] = useState(null);
  useLayoutEffect(() => {
    if (!formatted.trim()) return;
    const prev = motion.figures.get(kpi) ?? formatted.replace(/\d/g, "0");
    motion.figures.set(kpi, formatted);
    if (prev === formatted || motionOff()) return;
    const from = prev.length >= formatted.length ? prev.slice(prev.length - formatted.length) : " ".repeat(formatted.length - prev.length) + prev;
    setRoll({ from, to: formatted, rolled: false });
  }, [kpi, formatted, motion]);
  useEffect(() => {
    if (!roll) return;
    let frame = 0, timer = 0;
    if (!roll.rolled) frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => setRoll((r) => (r === roll ? { ...r, rolled: true } : r))); });
    else timer = setTimeout(() => setRoll((r) => (r === roll ? null : r)), 1400 + roll.to.length * 22);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [roll]);
  return (
    <div className="dashboard-kpi-value">
      {roll && roll.to === formatted ? <Odometer {...roll} /> : <Figure formatted={formatted} />}
    </div>
  );
}

function StatCard({ label, formatted, kpi, level }) {
  const Heading = `h${level}`;
  return (
    <article className="dashboard-kpi" aria-labelledby={`kpi-title-${kpi}`} data-kpi={kpi}>
      <Heading id={`kpi-title-${kpi}`}>{label}</Heading>
      <KpiValue kpi={kpi} formatted={formatted} />
    </article>
  );
}

const PAYMENT_SERIES = [["paid", "Paid"], ["outstanding", "Outstanding Payments"], ["hold", "On Hold"], ["balance", "Balance Payments Pending"]];
const periodLabel = (t) => new Date(t).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const monthName = (t) => new Date(t).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
const rowLength = (values) => Math.max(...values.map((v) => figureLength(fmt(v))));

export function Overview({ company, project, before = null, after = null }) {
  const { state } = useData();
  const k = useMemo(() => kpis(state, company, project), [state, company, project]);
  const trend = useMemo(() => kpiTrend(state, company, project), [state, company, project]);
  const lastMonth = trend.budget.at(-1)?.start ?? Date.now();
  const caption = `YTD · ${monthName(trend.budget[0]?.start ?? lastMonth)}–${monthName(lastMonth)} ${new Date(lastMonth).getUTCFullYear()}`;
  const chart = { fmt, periodLabel, monthLabel: monthName, caption };
  return (
    <div className="kpi-layout">
      <section className="dashboard-kpis budget-kpis budget-overview" aria-label="Budget overview" style={{ "--row-len": rowLength([k.budget, k.utilized, k.available]) }}>
        <div className="overview-figures">
          {[["Total Approved Budget", k.budget, "budget"], ["Budget Utilized", k.utilized, "utilized"], ["Available Budget", k.available, "available"]].map(([label, value, key]) =>
            <StatCard key={key} label={label} formatted={fmt(value)} kpi={key} level={2} />)}
        </div>
        <BudgetChart trend={trend} index={0} {...chart} />
      </section>
      <div className="kpi-side">
        {before}
        <section className="dashboard-kpis budget-kpis payment-overview" aria-label="Payment overview" style={{ "--row-len": rowLength([k.paid, k.outstanding, k.hold, k.balance]) }}>
          <div className="overview-figures">
            {PAYMENT_SERIES.map(([key, label]) => <StatCard key={key} label={label} formatted={fmt(k[key])} kpi={key} level={3} />)}
          </div>
          <PaymentChart trend={trend} series={PAYMENT_SERIES} index={1} {...chart} />
        </section>
        {after}
      </div>
    </div>
  );
}
