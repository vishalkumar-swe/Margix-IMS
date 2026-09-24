import styles from "@/app/page.module.css";
import prisma from "@/lib/prisma";
import CreateMovementModal from "@/components/CreateMovementModal";

export default async function OutwardPage() {
  const skus = await prisma.sKU.findMany({ include: { company: true } });
  const godowns = await prisma.godown.findMany();

  const outwardMovements = await prisma.inventoryLedger.findMany({
    where: { movementType: "OUTWARD" },
    include: { sku: true, godown: true },
    orderBy: { createdAt: 'desc' },
  });

  const batches = await prisma.batch.findMany();

  return (
    <div className={styles.layout}>
      <main className={styles.mainContent}>
        <header className={styles.pageHeader}>
          <div className={styles.pageTitle}>Outward (Dispatch) History</div>
          <div className={styles.headerActions}>
            <CreateMovementModal skus={skus} godowns={godowns} batches={batches} />
          </div>
        </header>

        <div className="card">
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>SKU</th>
                <th>Godown</th>
                <th>Quantity</th>
                <th>Reference</th>
                <th>Sync Status</th>
              </tr>
            </thead>
            <tbody>
              {outwardMovements.map(mov => (
                <tr key={mov.id}>
                  <td>{mov.createdAt.toLocaleString()}</td>
                  <td style={{ fontWeight: 600 }}>{mov.sku.productCode}</td>
                  <td>{mov.godown.name}</td>
                  <td style={{ color: "var(--danger-color)", fontWeight: "bold" }}>{mov.quantity}</td>
                  <td>{mov.referenceType}: {mov.referenceId}</td>
                  <td>
                    {mov.syncStatus === 'SYNCED' ? (
                      <span className="badge badge-success">Synced</span>
                    ) : mov.syncStatus === 'FAILED' ? (
                      <span className="badge badge-danger">Failed</span>
                    ) : (
                      <span className="badge badge-warning">Pending</span>
                    )}
                  </td>
                </tr>
              ))}
              {outwardMovements.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No outward movements found.
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
