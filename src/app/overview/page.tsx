import styles from "@/app/page.module.css";
import prisma from "@/lib/prisma";
import { getStockBreakdown } from "@/lib/inventory/stock";

export default async function OverviewPage() {
  const skus = await prisma.sKU.findMany({
    orderBy: { productCode: 'asc' }
  });
  
  const godowns = await prisma.godown.findMany();

  // Fetch breakdown for every SKU
  const inventoryData = await Promise.all(
    skus.map(async (sku) => {
      const breakdown = await getStockBreakdown(sku.id);
      
      // Calculate total stock across all godowns
      const totalStock = breakdown.reduce((acc, curr) => acc + curr.quantity, 0);
      
      // Map breakdown to Godown names
      const godownStocks = godowns.reduce((acc, godown) => {
        const found = breakdown.find(b => b.godownId === godown.id);
        acc[godown.id] = found ? found.quantity : 0;
        return acc;
      }, {} as Record<string, number>);

      return {
        ...sku,
        totalStock,
        godownStocks,
      };
    })
  );

  return (
    <div className={styles.layout}>
      <main className={styles.mainContent}>
        <header className={styles.pageHeader}>
          <div className={styles.pageTitle}>Global Stock Overview</div>
          <div className={styles.headerActions}>
            <button className="btn-primary">
              Export Excel
            </button>
          </div>
        </header>

        <div className="card">
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Description</th>
                <th style={{ borderLeft: '1px solid var(--border-color)' }}>Total Stock</th>
                {godowns.map(g => (
                  <th key={g.id} style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{g.name}</th>
                ))}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {inventoryData.map(item => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600, fontFamily: "monospace" }}>{item.productCode}</td>
                  <td>{item.name}</td>
                  <td style={{ fontWeight: "bold", borderLeft: '1px solid var(--border-color)' }}>
                    {item.totalStock}
                  </td>
                  {godowns.map(g => (
                    <td key={g.id} style={{ color: item.godownStocks[g.id] === 0 ? 'var(--text-muted)' : 'inherit' }}>
                      {item.godownStocks[g.id]}
                    </td>
                  ))}
                  <td>
                    {item.totalStock < 20 ? (
                      <span className="badge badge-danger">Low Stock</span>
                    ) : (
                      <span className="badge badge-success">Healthy</span>
                    )}
                  </td>
                </tr>
              ))}
              {inventoryData.length === 0 && (
                <tr>
                  <td colSpan={4 + godowns.length} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No items found.
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
