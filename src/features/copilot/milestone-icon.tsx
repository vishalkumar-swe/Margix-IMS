import { Boxes, CheckCircle2, ClipboardList, FileText, Package, RefreshCw, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MilestoneIcon } from "@/lib/copilot/types";

const ICONS: Record<MilestoneIcon, LucideIcon> = {
  package: Package,
  truck: Truck,
  box: Boxes,
  file: FileText,
  tally: RefreshCw,
  check: CheckCircle2,
};

export function MilestoneIconView({ icon, className }: { icon: MilestoneIcon; className?: string }) {
  const Icon = ICONS[icon] ?? ClipboardList;
  return <Icon className={className} aria-hidden />;
}
