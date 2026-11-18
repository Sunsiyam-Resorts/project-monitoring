// Table helpers composed from the shadcn Table: a headed figures table, amount cells and the
// small secondary line under a cell's main text.
import { DataTable } from "./ui.jsx";
import { fmt } from "../lib/format.js";
import { cn } from "@/lib/utils";
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow };

// The muted second line under a cell's main text.
export const Sub = ({ className, children }) => <span className={cn("secondary mt-0.5 block text-[11px] text-muted-foreground", className)}>{children}</span>;

// Headings: the first is left-aligned, the rest are figures (right-aligned).
export function FiguresTable({ headings, children, footer = null, className }) {
  return (
    <DataTable className={cn("dashboard-table [&_:is(th,td)]:px-3.5 [&_th]:leading-tight [&_th]:whitespace-normal [&_th:not(:first-child)]:min-w-[92px]", className)}>
      <TableHeader><TableRow>{headings.map((h, i) => <TableHead key={i} scope="col" className={i ? "text-right" : ""}>{h}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{children}</TableBody>
      {footer}
    </DataTable>
  );
}

// Amount cells: below half a cent reads as zero (muted); negative amounts are flagged.
export const amountCells = (values) => values.map((v, i) =>
  Math.abs(v) < 0.005 ? <TableCell key={i} className="zero text-right text-muted-foreground">{fmt(0)}</TableCell>
    : v < 0 ? <TableCell key={i} className="text-right"><span className="negative font-semibold text-danger">{fmt(v)}</span></TableCell>
      : <TableCell key={i} className="text-right">{fmt(v)}</TableCell>);

// Work tables (requests, users, master data…): on phones each row becomes a card and each cell
// is labelled from its data-label.
export const WORK_TABLE = cn(
  "work-table",
  "max-sm:block max-sm:[&_tbody]:block max-sm:[&_thead]:hidden",
  "max-sm:[&_tbody>tr]:relative max-sm:[&_tbody>tr]:m-3 max-sm:[&_tbody>tr]:block max-sm:[&_tbody>tr]:rounded-xl max-sm:[&_tbody>tr]:border max-sm:[&_tbody>tr]:bg-card max-sm:[&_tbody>tr]:py-2",
  "max-sm:[&_tbody>tr>td]:block max-sm:[&_tbody>tr>td]:px-4 max-sm:[&_tbody>tr>td]:py-1.5 max-sm:[&_tbody>tr>td]:text-left",
  "max-sm:[&_td[data-label]]:before:mb-0.5 max-sm:[&_td[data-label]]:before:block max-sm:[&_td[data-label]]:before:text-[11px] max-sm:[&_td[data-label]]:before:text-muted-foreground max-sm:[&_td[data-label]]:before:content-[attr(data-label)]",
  "max-sm:[&_tbody>tr>td:first-child]:pr-16 max-sm:[&_tbody>tr>td:last-child]:absolute max-sm:[&_tbody>tr>td:last-child]:top-2 max-sm:[&_tbody>tr>td:last-child]:right-1",
  "max-sm:[&_tr.children-row]:mt-0 max-sm:[&_tr.children-row]:border-0 max-sm:[&_tr.children-row]:bg-transparent max-sm:[&_tr.children-row>td]:static",
);

// A currency code before an amount.
export const Money = ({ currency, value, strong = false }) => (
  <span className={cn("whitespace-nowrap", strong && "font-semibold")}><span className="currency mr-1 text-xs font-normal text-muted-foreground">{currency}</span>{fmt(value)}</span>
);
