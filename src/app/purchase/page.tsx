'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import CreatePOModal from '@/components/CreatePOModal';

export default function PurchaseOrderDashboard() {
  const router = useRouter();
  const [pos, setPos] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [poRes, supRes, skuRes] = await Promise.all([
          fetch('/api/po'),
          fetch('/api/suppliers'), // Need to build this or just fetch in server component. Wait, this is a client component!
          fetch('/api/skus')
        ]);
        
        if (poRes.ok) setPos(await poRes.json());
        if (supRes.ok) setSuppliers(await supRes.json());
        if (skuRes.ok) setSkus(await skuRes.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center space-x-3">
            <FileText className="w-8 h-8 text-indigo-400" />
            <span>Procurement (Purchase Orders)</span>
          </h1>
          <p className="text-slate-400 mt-1">
            Manage incoming stock and generate Goods Receipt Notes (GRN).
          </p>
        </div>
        <CreatePOModal suppliers={suppliers} skus={skus} />
      </div>

      {/* PO List */}
      <Card className="bg-slate-900/60 border-slate-800/60 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-white">Active Purchase Orders</CardTitle>
          <CardDescription className="text-slate-400">Click into a PO to receive stock (GRN).</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-slate-500">Loading orders...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400">PO Number</TableHead>
                  <TableHead className="text-slate-400">Date</TableHead>
                  <TableHead className="text-slate-400">Supplier</TableHead>
                  <TableHead className="text-slate-400">Items</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                  <TableHead className="text-right text-slate-400">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pos.map(po => {
                  let statusBadge = "bg-slate-500/10 text-slate-400 border-slate-500/30";
                  if (po.status === 'OPEN') statusBadge = "bg-indigo-500/10 text-indigo-400 border-indigo-500/30";
                  if (po.status === 'PARTIALLY_RECEIVED') statusBadge = "bg-amber-500/10 text-amber-400 border-amber-500/30";
                  if (po.status === 'FULLY_RECEIVED') statusBadge = "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";

                  return (
                    <TableRow key={po.id} className="border-slate-800 hover:bg-slate-800/50 cursor-pointer" onClick={() => router.push(`/purchase/${po.id}`)}>
                      <TableCell className="font-mono font-medium text-white">{po.poNumber}</TableCell>
                      <TableCell className="text-slate-400">{format(new Date(po.createdAt), 'dd MMM yyyy')}</TableCell>
                      <TableCell className="text-slate-300">{po.supplier?.name}</TableCell>
                      <TableCell className="text-slate-400">{po.items?.length || 0} line(s)</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusBadge}>
                          {po.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10">
                          View <ArrowRight className="w-4 h-4 ml-1" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {pos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-slate-500 py-12">No Purchase Orders found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
