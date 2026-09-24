import {
  ArrowLeftRight,
  BellRing,
  Boxes,
  Building2,
  ChartColumn,
  ClipboardCheck,
  ClipboardList,
  CornerDownLeft,
  CornerUpRight,
  FileText,
  History,
  LayoutDashboard,
  Package,
  PackageCheck,
  RefreshCw,
  ScrollText,
  SlidersHorizontal,
  Store,
  Tag,
  Truck,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/permissions";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: Permission;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** Single source for the sidebar; items are filtered by the user's permissions. */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Inventory",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard, permission: "dashboard.view" },
      { label: "Stock", href: "/stock", icon: Boxes, permission: "stock.view" },
      { label: "Stock ledger", href: "/ledger", icon: ScrollText, permission: "ledger.view" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Purchase orders", href: "/purchase-orders", icon: ClipboardList, permission: "po.view" },
      { label: "Goods receipts", href: "/grns", icon: PackageCheck, permission: "grn.view" },
      { label: "Invoices", href: "/invoices", icon: FileText, permission: "invoice.view" },
      { label: "Dispatches", href: "/dispatches", icon: Truck, permission: "dispatch.view" },
      { label: "Transfers", href: "/transfers", icon: ArrowLeftRight, permission: "transfer.view" },
      { label: "Customer returns", href: "/sales-returns", icon: CornerDownLeft, permission: "return.view" },
      { label: "Supplier returns", href: "/purchase-returns", icon: CornerUpRight, permission: "return.view" },
      { label: "Adjustments", href: "/adjustments", icon: SlidersHorizontal, permission: "adjustment.view" },
      { label: "Opening stock", href: "/opening-stock", icon: ClipboardCheck, permission: "opening.post" },
    ],
  },
  {
    title: "Insight",
    items: [
      { label: "Stock alerts", href: "/alerts", icon: BellRing, permission: "alert.view" },
      { label: "Reports", href: "/reports", icon: ChartColumn, permission: "report.view" },
    ],
  },
  {
    title: "Master data",
    items: [
      { label: "Products (SKUs)", href: "/masters/skus", icon: Package, permission: "master.view" },
      { label: "Godowns", href: "/masters/godowns", icon: Warehouse, permission: "master.view" },
      { label: "Suppliers", href: "/masters/suppliers", icon: Building2, permission: "master.view" },
      { label: "Customers", href: "/masters/customers", icon: Store, permission: "master.view" },
      { label: "Categories & units", href: "/masters/categories", icon: Tag, permission: "master.view" },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Tally sync", href: "/tally", icon: RefreshCw, permission: "tally.view" },
      { label: "Users", href: "/admin/users", icon: Users, permission: "user.manage" },
      { label: "Audit trail", href: "/audit", icon: History, permission: "audit.view" },
    ],
  },
];
