"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Sidebar.module.css";

export default function Sidebar() {
  const pathname = usePathname();

  const inventoryLinks = [
    { name: "Dashboard", path: "/" },
    { name: "Stock Overview", path: "/overview" },
    { name: "Stock Ledger", path: "/ledger" },
    { name: "Batches & Lots", path: "/batches" },
  ];

  const operationsLinks = [
    { name: "GRN / Receiving", path: "/inward" },
    { name: "Dispatch", path: "/outward" },
    { name: "Transfers", path: "#" },
  ];

  const controlLinks = [
    { name: "Adjustments", path: "/adjustments" },
    { name: "Approvals", path: "#" },
    { name: "Audit Trail", path: "#" },
  ];

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <h1>COMMAND CENTER</h1>
      </div>

      <nav className={styles.sidebarNav}>
        <div className={styles.navSection}>
          <h2 className={styles.sectionTitle}>INVENTORY</h2>
          <Link href="/" className={`${styles.navLink} ${pathname === "/" ? styles.active : ""}`}>Dashboard</Link>
          <Link href="/overview" className={`${styles.navLink} ${pathname === "/overview" ? styles.active : ""}`}>Stock Overview</Link>
          <Link href="/ledger" className={`${styles.navLink} ${pathname === "/ledger" ? styles.active : ""}`}>Stock Ledger</Link>
          <Link href="/batches" className={`${styles.navLink} ${pathname === "/batches" ? styles.active : ""}`}>Batches</Link>
        </div>

        <div className={styles.navSection}>
          <h2 className={styles.sectionTitle}>PURCHASE</h2>
          <Link href="#" className={styles.navLink}>Purchase Orders</Link>
          <Link href="/inward" className={styles.navLink}>GRN / Inward</Link>
        </div>

        <div className={styles.navSection}>
          <h2 className={styles.sectionTitle}>WAREHOUSE</h2>
          <Link href="#" className={styles.navLink}>Transfers</Link>
          <Link href="/adjustments" className={`${styles.navLink} ${pathname === "/adjustments" ? styles.active : ""}`}>Adjustments</Link>
          <Link href="#" className={styles.navLink}>Returns</Link>
        </div>

        <div className={styles.navSection}>
          <h2 className={styles.sectionTitle}>SALES</h2>
          <Link href="#" className={styles.navLink}>Orders</Link>
          <Link href="/outward" className={styles.navLink}>Outward / Dispatch</Link>
        </div>
        
        <div className={styles.navSection}>
          <h2 className={styles.sectionTitle}>REPORTS</h2>
          <Link href="#" className={styles.navLink}>Stock Report</Link>
          <Link href="#" className={styles.navLink}>Movement Report</Link>
          <Link href="#" className={styles.navLink}>Audit Trail</Link>
        </div>

        <div className={styles.navSection}>
          <h2 className={styles.sectionTitle}>SETTINGS</h2>
          <Link href="#" className={styles.navLink}>Products</Link>
          <Link href="#" className={styles.navLink}>Warehouses</Link>
        </div>
      </nav>
      
      <div className={styles.sidebarFooter}>
        <div className={styles.userProfile}>
          <div className={styles.avatar}>WM</div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>Warehouse Manager</span>
            <span className={styles.userRole}>Main Godown</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
