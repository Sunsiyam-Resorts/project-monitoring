// The budget card (three figures over the YTD chart) and, on the right, the payment card
// (four figures over one combined chart). Shared by the Dashboard and each project page;
// `before` / `after` add cards above or below the payment card in the right-hand column.
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { kpis, kpiTrend } from "../domain/domain.js";
import { fmt, figureLength } from "../lib/format.js";
import { useApp, useData } from "../lib/store.js";
import { motionOff } from "../lib/motion.js";
import { BudgetChart, PaymentChart, SegmentKey } from "./Charts.jsx";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Figure sizes fit the card: each row's longest value sets one size for the row (container
// query units), so decimals never wrap.
const SIZE = {
  budget: "clamp(16px, calc((100cqi - 144px) / 3 / (var(--row-len) * 0.58)), 48px)",
  budgetNarrow: "clamp(22px, calc((100cqi - 8px) / (var(--row-len) * 0.58)), 40px)",
  payment: "clamp(18px, calc((100cqi - 64px) / 2 / (var(--row-len) * 0.58)), 30px)",
};

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
function KpiValue({ kpi, formatted, size, narrow }) {
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
    <div className="dashboard-kpi-value mt-auto font-display leading-[1.2] font-semibold tracking-[-0.035em] whitespace-nowrap tabular text-(length:--fs) max-md:text-(length:--fs-narrow)" style={{ "--fs": size, "--fs-narrow": narrow || size }}>
      {roll && roll.to === formatted ? <Odometer {...roll} /> : <Figure formatted={formatted} />}
    </div>
  );
}

function StatCard({ label, formatted, kpi, level, size, narrow, keyed = false, className }) {
  const Heading = `h${level}`;
  return (
    <article className={cn("dashboard-kpi flex min-w-0 flex-col", className)} aria-labelledby={`kpi-title-${kpi}`} data-kpi={kpi}>
      <Heading id={`kpi-title-${kpi}`} className={cn("mb-2.5 flex items-start gap-2 text-[13px] leading-snug font-medium", level === 3 && "mb-1.5 text-xs")}>
        {keyed ? <SegmentKey part={kpi} className="mt-[3px]" /> : null}{label}
      </Heading>
      <KpiValue kpi={kpi} formatted={formatted} size={size} narrow={narrow} />
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
    <div className="kpi-layout mb-6 grid grid-cols-[minmax(0,1fr)_minmax(320px,0.46fr)] items-stretch gap-4 max-xl:grid-cols-1">
      <Card className="dashboard-kpis budget-kpis budget-overview @container gap-0 px-6 pt-6 pb-5 max-md:p-5" aria-label="Budget overview" style={{ "--row-len": rowLength([k.budget, k.utilized, k.available]) }}>
        <div className="overview-figures grid grid-cols-3 max-md:grid-cols-1 max-md:gap-3.5">
          {[["Total Approved Budget", k.budget, "budget"], ["Budget Utilized", k.utilized, "utilized"], ["Available Budget", k.available, "available"]].map(([label, value, key]) => (
            <StatCard key={key} label={label} formatted={fmt(value)} kpi={key} level={2}
              size={SIZE.budget} narrow={SIZE.budgetNarrow}
              className="border-r border-border px-6 first:pl-0 last:border-r-0 last:pr-0 max-md:border-r-0 max-md:border-b max-md:px-0 max-md:pb-3.5 max-md:last:border-b-0 max-md:last:pb-0" />
          ))}
        </div>
        <BudgetChart trend={trend} {...chart} />
      </Card>
      <div className="kpi-side @container flex min-w-0 flex-col gap-4">
        {before}
        <Card className="dashboard-kpis budget-kpis payment-overview @container flex-1 gap-0 px-5 pt-5 pb-4" aria-label="Payment overview" style={{ "--row-len": rowLength([k.paid, k.outstanding, k.hold, k.balance]) }}>
          <div className="overview-figures grid grid-cols-2 gap-y-4 @[640px]:grid-cols-4">
            {PAYMENT_SERIES.map(([key, label]) => (
              <StatCard key={key} label={label} formatted={fmt(k[key])} kpi={key} level={3} keyed size={SIZE.payment}
                className="px-4 odd:border-r odd:border-border odd:pl-0 even:pr-0 @[640px]:border-r @[640px]:px-5 @[640px]:first:pl-0 @[640px]:last:border-r-0 @[640px]:last:pr-0" />
            ))}
          </div>
          <PaymentChart trend={trend} series={PAYMENT_SERIES} {...chart} />
        </Card>
        {after}
      </div>
    </div>
  );
}
