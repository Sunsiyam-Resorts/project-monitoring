// Year-to-date dashboard charts. Main card: approved budget (line), utilized (ink line) and
// available as the hatched band between them, one point per month end, zero-based. Payment
// card: Paid, Outstanding, On Hold and Balance as four lines on one zero-based scale.
import { useLayoutEffect, useRef } from "react";
import { useApp } from "../lib/store.js";
import { revealChart } from "../lib/motion.js";

const W = 1000, H = 160, TOP = 8;
const path = (p) => p.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
const pointsOf = (s, slot, y) => [[0, y(s[0].open)], ...s.map((c, i) => [(i + 1) * slot, y(c.close)])];
const EndMark = ({ points, className }) => {
  const [ex, ey] = points.at(-1);
  return <line className={className} x1={(ex - 1).toFixed(1)} x2={(ex - 1).toFixed(1)} y1={ey.toFixed(1)} y2={ey.toFixed(1)} />;
};

// Wipes the chart in when it is first drawn or its data changes.
function useReveal(key, index) {
  const { motion } = useApp();
  const svg = useRef(null);
  useLayoutEffect(() => revealChart(svg.current, key, index, motion.charts));
  return svg;
}

export function BudgetChart({ trend, fmt, periodLabel, monthLabel, caption, index }) {
  const svg = useReveal("budget-overview", index);
  const b = trend?.budget || [], u = trend?.utilized || [], a = trend?.available || [];
  if (!b.length) return null;
  const slot = W / b.length;
  const max = Math.max(...b.map((c) => c.high), ...u.map((c) => c.high), 1) * 1.04;
  const y = (v) => TOP + (1 - v / max) * (H - TOP);
  const pb = pointsOf(b, slot, y), pu = pointsOf(u, slot, y);
  const band = path(pb) + " " + [...pu].reverse().map(([px, py]) => `L${px.toFixed(1)} ${py.toFixed(1)}`).join(" ") + " Z";
  const summary = `Budget overview, ${caption}: approved budget USD ${fmt(b[0].open)} to USD ${fmt(b.at(-1).close)}; utilized USD ${fmt(u[0].open)} to USD ${fmt(u.at(-1).close)}; available USD ${fmt(a[0].open)} to USD ${fmt(a.at(-1).close)}`;
  // The available area is hatched by an HTML layer masked to the band, so the hatching
  // stays a true 45° in screen pixels however the chart stretches.
  const mask = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${band}"/></svg>`)}")`;
  return (
    <figure className="overview-chart" data-chart="budget-overview">
      <div className="overview-legend" aria-hidden="true"><span className="key-approved">Approved budget</span><span className="key-utilized">Utilized</span><span className="key-available">Available</span></div>
      <div className="overview-plot">
        <div className="overview-hatch" aria-hidden="true" style={{ WebkitMaskImage: mask, maskImage: mask }}></div>
        <svg ref={svg} className="kpi-trend kpi-trend-overview" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={summary}>
          <title>{summary}</title>
          <path className="overview-approved" d={path(pb)} /><path className="overview-utilized" d={path(pu)} />
          <EndMark points={pb} className="overview-end-approved" /><EndMark points={pu} className="overview-end-utilized" />
          {b.map((c, i) => (
            <rect key={i} className="trend-hit" x={(i * slot).toFixed(1)} y="0" width={slot.toFixed(1)} height={H}>
              <title>{`${periodLabel(c.start)}: approved USD ${fmt(c.close)} · utilized USD ${fmt(u[i].close)} · available USD ${fmt(a[i].close)}`}</title>
            </rect>
          ))}
        </svg>
      </div>
      <div className="overview-months" aria-hidden="true">{b.map((c, i) => <span key={i}>{monthLabel(c.start)}</span>)}</div>
    </figure>
  );
}

export function PaymentChart({ trend, series, fmt, periodLabel, monthLabel, caption, index }) {
  const svg = useReveal("payment-overview", index);
  const first = trend?.[series[0][0]] || [];
  if (!first.length) return null;
  const slot = W / first.length;
  const max = Math.max(...series.flatMap(([key]) => trend[key].map((c) => c.high)), 1) * 1.04;
  const y = (v) => TOP + (1 - v / max) * (H - TOP);
  const summary = `Payment overview, ${caption}: ${series.map(([key, label]) => `${label} USD ${fmt(trend[key][0].open)} to USD ${fmt(trend[key].at(-1).close)}`).join("; ")}`;
  return (
    <figure className="overview-chart" data-chart="payment-overview">
      <div className="overview-plot">
        <svg ref={svg} className="kpi-trend kpi-trend-payments" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={summary}>
          <title>{summary}</title>
          {series.map(([key]) => {
            const p = pointsOf(trend[key], slot, y);
            return [<path key={key} className={`pay-line pay-${key}`} d={path(p)} />, <EndMark key={key + "-end"} points={p} className={`pay-end pay-${key}`} />];
          })}
          {first.map((c, i) => (
            <rect key={i} className="trend-hit" x={(i * slot).toFixed(1)} y="0" width={slot.toFixed(1)} height={H}>
              <title>{`${periodLabel(c.start)}: ${series.map(([key, label]) => `${label} USD ${fmt(trend[key][i].close)}`).join(" · ")}`}</title>
            </rect>
          ))}
        </svg>
      </div>
      <div className="overview-months" aria-hidden="true">{first.map((c, i) => <span key={i}>{monthLabel(c.start)}</span>)}</div>
    </figure>
  );
}
