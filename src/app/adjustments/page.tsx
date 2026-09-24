import styles from "@/app/page.module.css";
import prisma from "@/lib/prisma";
import CreateMovementModal from "@/components/CreateMovementModal";
import AdjustmentActions from "@/components/AdjustmentActions";

export default async function AdjustmentsPage() {
  const skus = await prisma.sKU.findMany({ include: { company: true } });
  const godowns = await prisma.godown.findMany();

  // Fetch pending and past adjustments, but let's join manually to get SKU/Godown names 
  // since the PRD architecture links skuId to the SKU table implicitly but Prisma schema 
  // currently has them as loose String fields in AdjustmentRequest.
  // Wait, in schema.prisma, skuId and godownId are strings in AdjustmentRequest but no relations are defined.
  // I will fetch them directly and manually map them for this view.
  const adjustmentsRaw = await prisma.adjustmentRequest.findMany({
    orderBy: { createdAt: 'desc' },
  });

  const adjustments = adjustmentsRaw.map(adj => {
    const sku = skus.find(s => s.id === adj.skuId);
    const godown = godowns.find(g => g.id === adj.godownId);
    return {
      ...adj,
      skuCode: sku?.productCode || 'Unknown SKU',
      godownName: godown?.name || 'Unknown Godown'
    };
  });

  return (
    <div className={styles.layout}>
      <main className={styles.mainContent}>
        <header className={styles.pageHeader}>
          <div className={styles.pageTitle}>Adjustment Requests & Approvals</div>
          <div className={styles.headerActions}>
            <CreateMovementModal skus={skus} godowns={godowns} />
          </div>
        </header>

        <div className="card">
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date Submitted</th>
                <th>SKU</th>
                <th>Godown</th>
                <th>Quantity</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map(adj => (
                <tr key={adj.id}>
                  <td>{adj.createdAt.toLocaleString()}</td>
                  <td style={{ fontWeight: 600 }}>{adj.skuCode}</td>
                  <td>{adj.godownName}</td>
                  <td style={{ fontWeight: "bold" }}>{(adj.quantity || 0) > 0 ? `+${adj.quantity}` : adj.quantity}</td>
                  <td>{adj.reason}</td>
                  <td>
                    {adj.status === 'APPROVED' ? (
                      <span className="badge badge-success">Approved</span>
                    ) : adj.status === 'REJECTED' ? (
                      <span className="badge badge-danger">Rejected</span>
                    ) : (
                      <span className="badge badge-warning">Pending Review</span>
                    )}
                  </td>
                  <td>
                    {adj.status === 'SUBMITTED' ? (
                      <AdjustmentActions requestId={adj.id} />
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Processed by {adj.approvedById || 'System'}</span>
                    )}
                  </td>
                </tr>
              ))}
              {adjustments.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No adjustment requests found.
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
