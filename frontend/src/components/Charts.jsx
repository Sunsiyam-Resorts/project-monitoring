// Year-to-date dashboard charts: shadcn Chart (Recharts), styled after the Sun Siyam sales
// dashboard — light gridlines with value ticks, month ticks with the latest month in bold, a
// marker line at the latest month, and pastel fills with darker edges. One point or column
// per month end, zero-based. Every figure is also written in the cards and tooltips, so colour
// is never the only signal.
// Main card: Budget Utilized as the green band; the pale band above it up to the approved
// budget line is Available Budget.
// Payment card: each month's Budget Utilized as one column split into Paid, Outstanding, On
// Hold and Balance (the four always add up to Budget Utilized).
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import { motionOff } from "../lib/motion.js";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

// The four payment buckets and project progress share the sales palette (chart-1..4).
export const PARTS = {
  paid: { color: "var(--chart-1)", edge: "var(--chart-1-line)" },
  outstanding: { color: "var(--chart-2)", edge: "var(--chart-2-line)" },
  hold: { color: "var(--chart-3)", edge: "var(--chart-3-line)" },
  balance: { color: "var(--chart-4)", edge: "var(--chart-4-line)" },
  done: { color: "var(--chart-1)", edge: "var(--chart-1-line)" },
  doing: { color: "var(--chart-2)", edge: "var(--chart-2-line)" },
};

// Month ticks: the latest month in bold.
const MonthTick = ({ x, y, payload, last }) => (
  <text x={x} y={y} dy={12} textAnchor="middle" fontSize={11} fontWeight={payload.value === last ? 700 : 500}
    className={payload.value === last ? "fill-foreground" : "fill-muted-foreground"}>{payload.value}</text>
);

// A white-ringed dot on the latest month only.
const lastDot = (lastIndex, color) => function LastDot({ cx, cy, index }) {
  return index === lastIndex && Number.isFinite(cy)
    ? <circle key={index} cx={cx} cy={cy} r={4} fill={color} stroke="var(--card)" strokeWidth={2} />
    : <g key={index} />;
};

const axes = (last) => [
  <CartesianGrid key="grid" vertical={false} stroke="var(--chart-grid)" />,
  <XAxis key="x" dataKey="month" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} tick={<MonthTick last={last} />} />,
  <YAxis key="y" tickLine={false} axisLine={false} width={44} tickMargin={6} fontSize={11} tickFormatter={(v) => compact.format(v)} className="[&_text]:fill-muted-foreground" />,
  <ReferenceLine key="cross" x={last} stroke="var(--chart-cross)" />,
];

// Legend keys: small squares with the fill and edge, or a line for a line series.
export const ChartKey = ({ items }) => (
  <ul className="chart-key mb-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground" aria-hidden="true">
    {items.map(([label, color, edge, line]) => (
      <li key={label} className="inline-flex items-center gap-1.5">
        {line ? <span className="h-0 w-3.5 rounded-sm border-t-[2.25px]" style={{ borderColor: color }} />
          : <span className="size-2.5 rounded-[3px]" style={{ background: color, boxShadow: `inset 0 0 0 1.5px ${edge}` }} />}
        {label}
      </li>
    ))}
  </ul>
);

export function BudgetChart({ trend, fmt, periodLabel, monthLabel, caption }) {
  const b = trend?.budget || [], u = trend?.utilized || [], a = trend?.available || [];
  if (!b.length) return null;
  const data = b.map((c, i) => ({
    month: monthLabel(c.start), period: periodLabel(c.start),
    utilized: u[i].close, available: Math.max(0, c.close - u[i].close), approved: c.close, availableValue: a[i].close,
  }));
  const last = data.at(-1).month, lastIndex = data.length - 1, animate = !motionOff();
  const config = {
    utilized: { label: "Budget Utilized", color: "var(--chart-1)" },
    available: { label: "Available Budget", color: "var(--chart-available)" },
    approved: { label: "Approved budget", color: "var(--chart-approved)" },
  };
  const summary = `Budget overview, ${caption}: approved budget USD ${fmt(b[0].open)} to USD ${fmt(b.at(-1).close)}; utilized USD ${fmt(u[0].open)} to USD ${fmt(u.at(-1).close)}; available USD ${fmt(a[0].open)} to USD ${fmt(a.at(-1).close)}`;
  return (
    <figure className="overview-chart mt-5 flex min-h-0 flex-1 flex-col" data-chart="budget-overview">
      <ChartKey items={[["Approved budget", "var(--chart-approved)", null, true], ["Budget Utilized", "var(--chart-1)", "var(--chart-1-line)"], ["Available Budget", "var(--chart-available)", "var(--border)"]]} />
      <ChartContainer config={config} className="kpi-trend-overview aspect-auto min-h-[200px] w-full flex-1" role="img" aria-label={summary} data-months={data.length}>
        <ComposedChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
          {axes(last)}
          <ChartTooltip cursor={{ stroke: "var(--chart-cross)" }} content={
            <ChartTooltipContent labelKey="period" labelFormatter={(_, p) => p?.[0]?.payload?.period}
              formatter={(value, name, item, _i, row) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-muted-foreground"><span className="size-2.5 rounded-[3px]" style={{ background: item.color }} />{config[name]?.label}</span>
                  <span className="font-semibold tabular-nums">{`USD ${fmt(name === "available" ? row.availableValue : value)}`}</span>
                </div>
              )} />
          } />
          <Area dataKey="utilized" stackId="budget" type="linear" fill="var(--chart-1)" fillOpacity={1} stroke="var(--chart-1-line)" strokeWidth={1.5}
            dot={lastDot(lastIndex, "var(--chart-1-line)")} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={animate} />
          <Area dataKey="available" stackId="budget" type="linear" fill="var(--chart-available)" fillOpacity={1} stroke="none" activeDot={false} isAnimationActive={animate} />
          <Line dataKey="approved" type="linear" stroke="var(--chart-approved)" strokeWidth={2.25}
            dot={lastDot(lastIndex, "var(--chart-approved)")} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={animate} />
        </ComposedChart>
      </ChartContainer>
      <figcaption className="mt-2.5 text-xs leading-relaxed text-muted-foreground">Month-end totals in USD. The green band is Budget Utilized; the pale band above it, up to the approved budget line, is Available Budget.</figcaption>
    </figure>
  );
}

export function PaymentChart({ trend, series, fmt, periodLabel, monthLabel, caption }) {
  const first = trend?.[series[0][0]] || [];
  if (!first.length) return null;
  const data = first.map((c, i) => ({
    month: monthLabel(c.start), period: periodLabel(c.start),
    ...Object.fromEntries(series.map(([key]) => [key, Math.max(0, trend[key][i].close)])),
  }));
  const last = data.at(-1).month, animate = !motionOff();
  const config = Object.fromEntries(series.map(([key, label]) => [key, { label, color: PARTS[key].color }]));
  const summary = `Payment overview, ${caption}: ${series.map(([key, label]) => `${label} USD ${fmt(trend[key][0].open)} to USD ${fmt(trend[key].at(-1).close)}`).join("; ")}`;
  return (
    <figure className="overview-chart mt-4 flex min-h-0 flex-1 flex-col" data-chart="payment-overview">
      <ChartContainer config={config} className="kpi-trend-payments aspect-auto min-h-[150px] w-full flex-1" role="img" aria-label={summary} data-months={data.length}>
        <BarChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }} barCategoryGap="30%">
          {axes(last)}
          <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={
            <ChartTooltipContent labelKey="period" labelFormatter={(_, p) => p?.[0]?.payload?.period} valueFormatter={(v) => `USD ${fmt(v)}`} />
          } />
          {series.map(([key]) => (
            <Bar key={key} dataKey={key} stackId="utilized" fill={PARTS[key].color} stroke={PARTS[key].edge} strokeWidth={1} radius={2} maxBarSize={22} isAnimationActive={animate} />
          ))}
        </BarChart>
      </ChartContainer>
    </figure>
  );
}

// A square key for one part, matching its segment.
export const SegmentKey = ({ part, className }) => (
  <span className={cn("inline-block size-2.5 shrink-0 rounded-[3px]", className)} style={{ background: PARTS[part]?.color || "var(--chart-track)", boxShadow: `inset 0 0 0 1.5px ${PARTS[part]?.edge || "var(--border)"}` }} />
);

// One bar split into the given parts, in order, on a light track (the sales dashboard's segment
// bar). With `max`, the parts fill their share of it and the rest of the track stays empty.
export function SegmentBar({ parts, label, max = 0, className }) {
  const total = Math.max(max, parts.reduce((sum, p) => sum + Math.max(0, p.value), 0)) || 1;
  return (
    <div className={cn("stack-bar flex h-3 gap-0.5 overflow-hidden rounded-[4px] bg-chart-track", className)} role="img" aria-label={label}>
      {parts.filter((p) => p.value > 0).map((p) => (
        <i key={p.key} className={`seg seg-${p.key} block h-full flex-none rounded-[3px]`} title={p.title}
          style={{ width: `${((p.value / total) * 100).toFixed(2)}%`, background: PARTS[p.key].color, boxShadow: `inset 0 0 0 1.5px ${PARTS[p.key].edge}` }} />
      ))}
    </div>
  );
}
