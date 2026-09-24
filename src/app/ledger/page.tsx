import styles from "@/app/page.module.css";
import prisma from "@/lib/prisma";

export default async function LedgerPage() {
  // Fetch all movements, ordered by oldest first to calculate running balance
  const ledgerEntries = await prisma.inventoryLedger.findMany({
    include: { sku: true, godown: true },
    orderBy: { createdAt: 'asc' },
  });

  // Calculate running balances per SKU per Godown
  const balances: Record<string, number> = {};
  
  const processedEntries = ledgerEntries.map(entry => {
    const key = `${entry.skuId}-${entry.godownId}`;
    const prevBalance = balances[key] || 0;
    const isPositive = ['OPENING', 'INWARD', 'TRANSFER_IN', 'RETURN_IN'].includes(entry.movementType);
    const isNegative = ['OUTWARD', 'TRANSFER_OUT', 'RETURN_OUT'].includes(entry.movementType);
    // REVERSAL cancels out the original. Since we don't have the original here, we just use reasonCode logic, but for simplicity let's assume it negates whatever reasonCode says, but wait, REVERSAL could be both. For now, let's just use movementType.
    
    let directionQty = entry.quantity;
    if (entry.movementType === 'REVERSAL') {
      const reversedIsPositive = ['OPENING', 'INWARD', 'TRANSFER_IN', 'RETURN_IN'].includes(entry.reasonCode || '');
      directionQty = reversedIsPositive ? -entry.quantity : entry.quantity;
    } else if (isNegative) {
      directionQty = -entry.quantity;
    }

    const newBalance = prevBalance + directionQty;
    balances[key] = newBalance;

    return {
      ...entry,
      balance: newBalance,
      inQty: directionQty > 0 ? directionQty : null,
      outQty: directionQty < 0 ? Math.abs(directionQty) : null,
    };
  });

  // Reverse to show newest on top
  processedEntries.reverse();

  return (
    <div className={styles.layout}>
      <main className={styles.mainContent}>
        <header className={styles.pageHeader}>
          <div className={styles.pageTitle}>Stock Ledger</div>
          <div className={styles.headerActions}>
            <button className="btn-outline">
              Filter by Godown ▾
            </button>
            <button className="btn-primary">
              Export CSV
            </button>
          </div>
        </header>

        <div className="card">
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Document</th>
                <th>Type</th>
                <th>Item</th>
                <th>Warehouse</th>
                <th>IN</th>
                <th>OUT</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {processedEntries.map(entry => (
                <tr key={entry.id}>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                    {entry.createdAt.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ fontFamily: "monospace" }}>{entry.referenceId}</td>
                  <td>
                    <span className={`badge ${['INWARD', 'OPENING', 'RETURN_IN', 'TRANSFER_IN'].includes(entry.movementType) ? 'badge-success' : ['OUTWARD', 'RETURN_OUT', 'TRANSFER_OUT'].includes(entry.movementType) ? 'badge-danger' : 'badge-warning'}`}>
                      {entry.movementType}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{entry.sku.productCode}</td>
                  <td>{entry.godown.name}</td>
                  <td style={{ color: "var(--success-color)", fontWeight: "bold" }}>
                    {entry.inQty ? `+${entry.inQty}` : '-'}
                  </td>
                  <td style={{ color: "var(--danger-color)", fontWeight: "bold" }}>
                    {entry.outQty ? `-${entry.outQty}` : '-'}
                  </td>
                  <td style={{ fontWeight: "bold" }}>
                    {entry.balance}
                  </td>
                </tr>
              ))}
              {processedEntries.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No ledger entries found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
