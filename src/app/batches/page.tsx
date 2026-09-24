import styles from "@/app/page.module.css";
import prisma from "@/lib/prisma";

export default async function BatchesPage() {
  const batches = await prisma.batch.findMany({
    include: {
      sku: true,
      movements: true
    },
    orderBy: {
      expiryDate: 'asc'
    }
  });

  const batchesWithStock = batches.map(batch => {
    const totalStock = batch.movements.reduce((acc, curr) => acc + curr.quantity, 0);
    
    // Check if expired or expiring soon (within 30 days)
    const now = new Date();
    const expiry = batch.expiryDate ? new Date(batch.expiryDate) : null;
    let status = 'OK';
    
    if (expiry) {
      const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 3600 * 24));
      if (daysUntilExpiry <= 0) {
        status = 'EXPIRED';
      } else if (daysUntilExpiry <= 30) {
        status = 'EXPIRING_SOON';
      }
    }

    return {
      ...batch,
      currentStock: totalStock,
      status
    };
  });

  // Filter out batches with 0 stock unless they are expired
  const activeBatches = batchesWithStock.filter(b => b.currentStock > 0 || b.status === 'EXPIRED');

  return (
    <div className={styles.layout}>
      <main className={styles.mainContent}>
        <header className={styles.pageHeader}>
          <div className={styles.pageTitle}>Batches & Lots Control</div>
          <div className={styles.headerActions}>
            <button className="btn-outline">
              Filter by Status ▾
            </button>
            <button className="btn-primary">
              Export Report
            </button>
          </div>
        </header>

        <div className="card">
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Batch #</th>
                <th>Item (SKU)</th>
                <th>Mfg Date</th>
                <th>Expiry Date</th>
                <th>Status</th>
                <th>Current Stock</th>
              </tr>
            </thead>
            <tbody>
              {activeBatches.map(batch => (
                <tr key={batch.id}>
                  <td style={{ fontWeight: 600, fontFamily: "monospace" }}>{batch.batchNumber}</td>
                  <td>{batch.sku.productCode} - {batch.sku.name}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                    {batch.manufacturingDate ? batch.manufacturingDate.toLocaleDateString() : 'N/A'}
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.875rem", fontWeight: batch.status !== 'OK' ? 600 : 400 }}>
                    {batch.expiryDate ? batch.expiryDate.toLocaleDateString() : 'N/A'}
                  </td>
                  <td>
                    {batch.status === 'EXPIRED' ? (
                      <span className="badge badge-danger">Expired</span>
                    ) : batch.status === 'EXPIRING_SOON' ? (
                      <span className="badge badge-warning">Expiring Soon</span>
                    ) : (
                      <span className="badge badge-success">Good</span>
                    )}
                  </td>
                  <td style={{ fontWeight: "bold" }}>
                    {batch.currentStock}
                  </td>
                </tr>
              ))}
              {activeBatches.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No active batches found.
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
