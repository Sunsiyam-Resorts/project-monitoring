// Interface icons: the Lucide set (the icon library the shadcn components use), one stroke
// weight everywhere. Icons are decorative; icon-only controls carry their own accessible name.
import { Printer,
  ArrowRight, ChartColumn, ChevronRight, Clock, Download, FileText, Files, FolderKanban, Funnel,
  House, LayoutGrid, LogOut, Menu, Moon, PauseCircle, PieChart, Plus, Search, Settings2, ShieldCheck,
  SlidersHorizontal, Sun, Trash2, Users, X, Check, Database, Upload, CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  dashboard: House,
  projects: FolderKanban,
  budgets: PieChart,
  requests: Files,
  master: Database,
  users: Users,
  audit: FileText,
  deleted: Trash2,
  settings: SlidersHorizontal,
  filter: Funnel,
  search: Search,
  arrow: ArrowRight,
  chevron: ChevronRight,
  download: Download,
  plus: Plus,
  clock: Clock,
  shield: ShieldCheck,
  close: X,
  check: Check,
  hold: PauseCircle,
  chart: ChartColumn,
  menu: Menu,
  logout: LogOut,
  sun: Sun,
  print: Printer,
  moon: Moon,
  grid: LayoutGrid,
  tune: Settings2,
  upload: Upload,
  calendar: CalendarDays,
  file: FileText,
};

export function Icon({ name, className }) {
  const Glyph = ICONS[name] || ChartColumn;
  return <Glyph className={cn("ui-icon size-[18px] shrink-0", className)} strokeWidth={1.75} aria-hidden="true" focusable="false" />;
}
