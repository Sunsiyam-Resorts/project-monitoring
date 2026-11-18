// List toolbars composed from shadcn components: the search box (InputGroup with a search
// icon), the toolbar row, and the count chip inside a tab.
import { Icon } from "./Icon.jsx";
import { cn } from "@/lib/utils";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Badge } from "@/components/ui/badge";

export const ListToolbar = ({ className, children }) => (
  <div className={cn("list-toolbar mb-5 flex flex-wrap items-center justify-between gap-4", className)}>{children}</div>
);

export function SearchBox({ id, label, placeholder, value, onChange, className }) {
  return (
    <InputGroup className={cn("searchbox max-w-[440px] flex-1 max-sm:max-w-none max-sm:basis-full", className)}>
      <InputGroupAddon><Icon name="search" /></InputGroupAddon>
      <InputGroupInput id={id} aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className="text-[13px]" />
    </InputGroup>
  );
}

export const TabCount = ({ active, children }) => (
  <Badge className={cn("count min-w-5 justify-center rounded-full px-1.5", active && "bg-foreground text-background")}>{children}</Badge>
);
