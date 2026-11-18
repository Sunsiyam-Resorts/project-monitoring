// The muted note row under a table card: record count on the left, a scope note on the right.
export const TableFooterNote = ({ left, right }) => (
  <div className="table-footer flex flex-wrap justify-between gap-2 border-t border-border px-6 py-4 text-[11px] text-muted-foreground max-sm:px-5">
    <span>{left}</span><span>{right}</span>
  </div>
);
