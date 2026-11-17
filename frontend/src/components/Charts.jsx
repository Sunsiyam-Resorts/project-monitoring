// Year-to-date dashboard charts, in the chart style of the Sun Siyam sales dashboard:
// SVG drawn at the plot's real pixel size, light gridlines with value ticks, month ticks
// with the latest month in bold, pastel fills with darker edges, and a marker line with
// ringed dots at the latest month. One point or column per month end, zero-based.
// Main card: Budget Utilized as the green band; the pale band above it up to the approved
// budget line is Available Budget.
// Payment card: each month's Budget Utilized as one column split into Paid, Outstanding,
// On Hold and Balance (the four always add up to Budget Utilized).
import { useLayoutEffect, useRef, useState } from "react";
import { useApp } from "../lib/store.js";
import { revealChart } from "../lib/motion.js";

const PAD = { top: 10, right: 12, bottom: 26, left: 44 };
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

// The plot's size in pixels, so the SVG draws 1:1 and text and lines stay crisp.
function useSize(fallback) {
  const box = useRef(null);
  const [size, setSize] = useState(fallback);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const w = Math.round(el.clientWidth), h = Math.round(el.clientHeight);
      if (w > 0 && h > 0) setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [box, size];
}

// Three to five round steps from zero to just above the largest value.
function ticks(max) {
  if (!(max > 0)) return [0, 1];
  const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const out = [];
  for (let v = 0; v < max + step * 0.999; v += step) out.push(v);
  return out;
}

function frame(size, n, max) {
  const steps = ticks(max), top = steps.at(-1);
  const plotW = Math.max(1, size.w - PAD.left - PAD.right), plotH = Math.max(1, size.h - PAD.top - PAD.bottom);
  const y = (v) => PAD.top + (1 - Math.max(0, v) / top) * plotH;
  return { steps, plotW, plotH, y, base: PAD.top + plotH };
}

function Grid({ f, size }) {
  return (
    <g>
      {f.steps.map((v) => (
        <g key={v}>
          <line className="lc-grid" x1={PAD.left} x2={size.w - PAD.right} y1={f.y(v)} y2={f.y(v)} />
          <text className="lc-tick" x={PAD.left - 8} y={f.y(v)} dy="0.32em" textAnchor="end">{compact.format(v)}</text>
        </g>
      ))}
    </g>
  );
}

// Month ticks: every month when there is room, otherwise every other one; the latest is bold.
function MonthTicks({ months, x, label, slot }) {
  const every = slot >= 34 ? 1 : 2, last = months.length - 1;
  return months.map((c, i) => ((last - i) % every === 0
    ? <text key={i} className={i === last ? "lc-tick on" : "lc-tick"} x={x(i)} y={PAD.top} dy="0" textAnchor="middle" data-month="">{label(c.start)}</text>
    : null));
}

function useReveal(key, index) {
  const { motion } = useApp();
  const svg = useRef(null);
  useLayoutEffect(() => revealChart(svg.current, key, index, motion.charts));
  return svg;
}

const area = (xs, top, bottom) =>
  `M${xs[0]} ${top[0]}` + xs.slice(1).map((x, i) => ` L${x} ${top[i + 1]}`).join("") +
  [...xs].reverse().map((x, i) => ` L${x} ${bottom[xs.length - 1 - i]}`).join("") + " Z";
const line = (xs, ys) => xs.map((x, i) => `${i ? "L" : "M"}${x} ${ys[i]}`).join(" ");

export function BudgetChart({ trend, fmt, periodLabel, monthLabel, caption, index }) {
  const [box, size] = useSize({ w: 640, h: 220 });
  const svg = useReveal("budget-overview", index);
  const b = trend?.budget || [], u = trend?.utilized || [], a = trend?.available || [];
  if (!b.length) return null;
  const n = b.length;
  const f = frame(size, n, Math.max(...b.map((c) => c.close), ...u.map((c) => c.close), 1));
  const step = n > 1 ? f.plotW / (n - 1) : 0;
  const x = (i) => +(PAD.left + (n > 1 ? i * step : f.plotW / 2)).toFixed(1);
  const xs = b.map((_, i) => x(i));
  const yU = u.map((c) => +f.y(c.close).toFixed(1)), yB = b.map((c) => +f.y(c.close).toFixed(1));
  const yTop = yB.map((v, i) => Math.min(v, yU[i])), base = xs.map(() => +f.base.toFixed(1));
  const last = n - 1;
  const summary = `Budget overview, ${caption}: approved budget USD ${fmt(b[0].open)} to USD ${fmt(b.at(-1).close)}; utilized USD ${fmt(u[0].open)} to USD ${fmt(u.at(-1).close)}; available USD ${fmt(a[0].open)} to USD ${fmt(a.at(-1).close)}`;
  return (
    <figure className="overview-chart" data-chart="budget-overview">
      <ul className="chart-key" aria-hidden="true"><li className="key-approved">Approved budget</li><li className="key-utilized">Budget Utilized</li><li className="key-available">Available Budget</li></ul>
      <div ref={box} className="chart-box">
        <svg ref={svg} className="lc kpi-trend-overview" data-sig={[...b, ...u].map((c) => c.close).join(",")} width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} role="img" aria-label={summary}>
          <title>{summary}</title>
          <Grid f={f} size={size} />
          <g className="lc-plot">
            <path className="lc-band lc-available" d={area(xs, yTop, yU)} />
            <path className="lc-band lc-utilized" d={area(xs, yU, base)} />
            <path className="lc-edge lc-utilized" d={line(xs, yU)} />
            <path className="lc-edge lc-approved top" d={line(xs, yB)} />
          </g>
          <line className="lc-cross" x1={x(last)} x2={x(last)} y1={PAD.top} y2={f.base} />
          <circle className="lc-mark lc-approved" cx={x(last)} cy={yB[last]} r="4" />
          <circle className="lc-mark lc-utilized" cx={x(last)} cy={yU[last]} r="4" />
          <g transform={`translate(0 ${f.base + 8})`}><MonthTicks months={b} x={x} label={monthLabel} slot={step || f.plotW} /></g>
          {b.map((c, i) => (
            <rect key={i} className="lc-hit" x={(x(i) - (step || f.plotW) / 2).toFixed(1)} y={PAD.top} width={(step || f.plotW).toFixed(1)} height={f.plotH}>
              <title>{`${periodLabel(c.start)}: approved USD ${fmt(c.close)} · utilized USD ${fmt(u[i].close)} · available USD ${fmt(a[i].close)}`}</title>
            </rect>
          ))}
        </svg>
      </div>
      <figcaption>Month-end totals in USD. The green band is Budget Utilized; the pale band above it, up to the approved budget line, is Available Budget.</figcaption>
    </figure>
  );
}

export function PaymentChart({ trend, series, fmt, periodLabel, monthLabel, caption, index }) {
  const [box, size] = useSize({ w: 320, h: 150 });
  const svg = useReveal("payment-overview", index);
  const first = trend?.[series[0][0]] || [];
  if (!first.length) return null;
  const n = first.length;
  const value = (key, i) => Math.max(0, trend[key][i].close);
  const total = (i) => series.reduce((sum, [key]) => sum + value(key, i), 0);
  const f = frame(size, n, Math.max(...first.map((_, i) => total(i)), 1));
  const slot = f.plotW / n, w = Math.max(4, Math.min(22, slot * 0.6));
  const x = (i) => +(PAD.left + slot * (i + 0.5)).toFixed(1);
  const summary = `Payment overview, ${caption}: ${series.map(([key, label]) => `${label} USD ${fmt(trend[key][0].open)} to USD ${fmt(trend[key].at(-1).close)}`).join("; ")}`;
  return (
    <figure className="overview-chart" data-chart="payment-overview">
      <div ref={box} className="chart-box">
        <svg ref={svg} className="lc kpi-trend-payments" data-sig={series.flatMap(([key]) => trend[key].map((c) => c.close)).join(",")} width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} role="img" aria-label={summary}>
          <title>{summary}</title>
          <Grid f={f} size={size} />
          <line className="lc-cross" x1={x(n - 1)} x2={x(n - 1)} y1={PAD.top} y2={f.base} />
          <g className="lc-plot">
            {first.map((c, i) => {
              let top = f.base;
              return (
                <g key={i} className="lc-column" data-col="">
                  {series.map(([key]) => {
                    const v = value(key, i);
                    if (!v) return null;
                    const h = Math.max(1.5, f.base - f.y(v) - 1), yy = top - h;
                    top = yy - 1;
                    return <rect key={key} className={`lc-col seg-${key}`} x={(x(i) - w / 2).toFixed(1)} y={yy.toFixed(1)} width={w.toFixed(1)} height={h.toFixed(1)} rx="2" />;
                  })}
                  {total(i) ? null : <line className="lc-none" x1={x(i) - w / 2} x2={x(i) + w / 2} y1={f.base - 1} y2={f.base - 1} />}
                </g>
              );
            })}
          </g>
          <g transform={`translate(0 ${f.base + 8})`}><MonthTicks months={first} x={x} label={monthLabel} slot={slot} /></g>
          {first.map((c, i) => (
            <rect key={i} className="lc-hit" x={(x(i) - slot / 2).toFixed(1)} y={PAD.top} width={slot.toFixed(1)} height={f.plotH}>
              <title>{`${periodLabel(c.start)}: ${series.map(([key, label]) => `${label} USD ${fmt(trend[key][i].close)}`).join(" · ")}`}</title>
            </rect>
          ))}
        </svg>
      </div>
    </figure>
  );
}

// One bar split into the given parts, in order, on a light track. With `max`, the parts
// fill their share of it and the rest of the track stays empty.
export function SegmentBar({ parts, label, max = 0 }) {
  const total = Math.max(max, parts.reduce((sum, p) => sum + Math.max(0, p.value), 0)) || 1;
  return (
    <div className="stack-bar" role="img" aria-label={label}>
      {parts.filter((p) => p.value > 0).map((p) => <i key={p.key} className={`seg seg-${p.key}`} style={{ width: `${((p.value / total) * 100).toFixed(2)}%` }} title={p.title}></i>)}
    </div>
  );
}
