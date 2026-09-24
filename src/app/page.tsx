import styles from "./page.module.css";
import prisma from "@/lib/prisma";
import { getCurrentStock } from "@/lib/inventory/stock";
import CreateMovementModal from "@/components/CreateMovementModal";
import RetrySyncButton from "@/components/RetrySyncButton";

// This is a Server Component, meaning we can fetch data directly from Prisma!
export default async function Home() {
  // 1. Fetch SKUs and calculate live stock for each
  const skus = await prisma.sKU.findMany({
    include: { company: true },
  });

  const godowns = await prisma.godown.findMany();
  const batches = await prisma.batch.findMany();

  const skusWithStock = await Promise.all(
    skus.map(async (sku) => {
      // Fetching stock for "Main Warehouse" for now as default view
      const mainGodown = await prisma.godown.findFirst({ where: { name: 'Main Warehouse' }});
      const stock = mainGodown ? await getCurrentStock(sku.id, mainGodown.id) : 0;
      return { ...sku, currentStock: stock, godownName: mainGodown?.name || 'Unknown' };
    })
  );

  // 2. Fetch pending adjustments for the stats card
  const pendingAdjustments = await prisma.adjustmentRequest.count({
    where: { status: 'SUBMITTED' }
  });

  // 3. Fetch failed sync alerts
  const failedSyncs = await prisma.inventoryLedger.findMany({
    where: { syncStatus: 'FAILED' },
    include: { sku: true },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });

  // 4. Fetch recent movements
  const recentMovements = await prisma.inventoryLedger.findMany({
    include: { sku: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  return (
    <div className={styles.layout}>
      <main className={styles.mainContent}>
        {/* Header */}
        <header className={styles.pageHeader}>
          <div className={styles.pageTitle}>
            Control Tower 
            <select className={styles.btnOutline} style={{ border: 'none', fontSize: '0.875rem', color: 'var(--text-secondary)'}}>
              <option>Main Warehouse ▾</option>
              <option>Secondary Godown</option>
            </select>
          </div>
          <div className={styles.headerActions}>
            <button className="btn-outline">
              📅 {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} ▾
            </button>
            <CreateMovementModal skus={skus} godowns={godowns} batches={batches} />
          </div>
        </header>

        {/* Stats Row */}
        <div className={styles.statsGrid}>
          <div className="card statCard">
            <span className={styles.statTitle}>Active SKUs</span>
            <div className={styles.statValue}>
              {skus.length} <span className={styles.statSub}>In database</span>
            </div>
          </div>
          <div className="card statCard">
            <span className={styles.statTitle}>Low Stock Items</span>
            <div className={styles.statValue}>
              {skusWithStock.filter(s => s.currentStock < 20).length} <span className={styles.statSub}>Require reorder</span>
            </div>
          </div>
          <div className="card statCard">
            <span className={styles.statTitle}>Pending Approvals</span>
            <div className={styles.statValue}>
              {pendingAdjustments} <span className={styles.statSub}>Adjustments</span>
            </div>
          </div>
          <div className="card statCard">
            <span className={styles.statTitle}>Tally Sync Alerts</span>
            <div className={styles.statValue}>
              {failedSyncs.length} <span className={styles.statSub}>Requires attention</span>
            </div>
          </div>
        </div>

        {/* Main Layout */}
        <div className={styles.dashboardLayout}>
          {/* Left Column - Stock Overview */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className={styles.sectionHeader}>
              <span>Stock Overview <span style={{ color: 'var(--success-color)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>● Live Data</span></span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-outline" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem'}}>Chart</button>
                <button className="btn-outline" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem'}}>List</button>
              </div>
            </div>
            
            <div style={{ flex: 1, backgroundColor: '#f9fafb', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', border: '1px dashed var(--border-color)' }}>
              <span style={{ color: 'var(--text-muted)' }}>[Stock Movement Visualizer Placeholder]</span>
            </div>
          </div>

          {/* Right Column - Alerts */}
          <div>
            <div className={styles.sectionHeader}>
              <span>Needs attention <span className="badge badge-danger">{failedSyncs.length}</span></span>
              <a href="#" style={{ fontSize: '0.875rem', color: 'var(--primary-color)'}}>View all →</a>
            </div>
            
            <div className={styles.alertList}>
              {failedSyncs.map(sync => (
                <div key={sync.id} className={styles.alertItem}>
                  <div style={{ color: 'var(--danger-color)', fontSize: '1.25rem'}}>!</div>
                  <div className={styles.alertContent} style={{ flex: 1 }}>
                    <h4>Sync Failed</h4>
                    <p>{sync.sku.productCode} • {sync.syncError || 'Unknown Error'}</p>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)'}}>
                      {sync.createdAt.toLocaleTimeString()}
                    </span>
                  </div>
                  <div>
                    <RetrySyncButton />
                  </div>
                </div>
              ))}
              {failedSyncs.length === 0 && (
                <div style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'white' }}>
                   <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>All systems healthy. No failed syncs.</p>
                </div>
              )}
            </div>

            <div className={styles.sectionHeader} style={{ marginTop: '2rem' }}>
              <span>Recent movements</span>
            </div>
            <div style={{ fontSize: '0.875rem' }}>
              {recentMovements.map(mov => (
                <div key={mov.id} style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
                  <span style={{ color: 'var(--text-muted)', width: '60px' }}>
                    {mov.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span style={{ color: ['INWARD', 'OPENING', 'TRANSFER_IN'].includes(mov.movementType) ? 'var(--success-color)' : 'var(--danger-color)' }}>●</span>
                  <span>{mov.movementType} ({mov.quantity}) for {mov.sku.productCode}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Section - Table */}
        <div className="card">
          <div className={styles.sectionHeader}>
            <span>Live Stock <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400}}>{skus.length} items</span></span>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <input type="text" placeholder="Search SKUs..." style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)'}} />
              <button className="btn-outline">Y Filters</button>
            </div>
          </div>
          
          <table className={styles.table}>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Description</th>
                <th>Godown</th>
                <th>Status</th>
                <th>Current Stock</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {skusWithStock.map(sku => (
                <tr key={sku.id}>
                  <td style={{ fontWeight: 600 }}>{sku.productCode}</td>
                  <td>{sku.name}</td>
                  <td>{sku.godownName}</td>
                  <td>
                    {sku.currentStock < 20 ? (
                      <span className="badge badge-danger">Low Stock</span>
                    ) : (
                      <span className="badge badge-success">Healthy</span>
                    )}
                  </td>
                  <td>{sku.currentStock} units</td>
                  <td><a href={`/inventory/sku/${sku.id}`} style={{ color: 'var(--primary-color)' }}>View →</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
