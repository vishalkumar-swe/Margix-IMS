'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Box, CheckCircle2, AlertTriangle, Layers, MapPin, Activity } from 'lucide-react';
import { format } from 'date-fns';

export default function SkuDetailScreen() {
  const params = useParams();
  const router = useRouter();
  const skuId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch(`/api/stock/${skuId}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const json = await res.json();
        setData(json);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [skuId]);

  const handleReverse = async (ledgerId: string) => {
    if (!confirm('Are you sure you want to reverse this transaction? A permanent counter-entry will be posted to the ledger.')) {
      return;
    }
    
    try {
      const res = await fetch(`/api/ledger/${ledgerId}/reverse`, {
        method: 'POST',
      });
      
      if (!res.ok) {
        const err = await res.json();
        alert('Failed to reverse: ' + err.error);
        return;
      }
      
      // Reload data
      const reloadRes = await fetch(`/api/stock/${skuId}`);
      setData(await reloadRes.json());
    } catch (e) {
      alert('Failed to reverse transaction');
    }
  };

  if (loading) {
    return <div className="p-8 flex items-center justify-center min-h-screen text-slate-400">Loading SKU data...</div>;
  }

  if (!data || data.error) {
    return <div className="p-8 flex items-center justify-center min-h-screen text-red-500">Failed to load SKU.</div>;
  }

  const { sku, totalStock, godowns, batches, recentMovements } = data;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/overview')}>
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </Button>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-3xl font-bold tracking-tight text-white">{sku.name}</h1>
              <Badge variant="outline" className="border-indigo-500/30 text-indigo-400 bg-indigo-500/10">
                {sku.productCode}
              </Badge>
            </div>
            <p className="text-slate-400 mt-1 flex items-center space-x-2">
              <span>{sku.category?.name || 'Uncategorized'}</span>
              <span>•</span>
              <span>Base UOM: {sku.baseUom?.code || 'N/A'}</span>
            </p>
          </div>
        </div>
        <div className="flex space-x-3">
          <Button variant="outline" className="border-slate-800 bg-slate-900/50 hover:bg-slate-800 text-slate-300">
            Edit SKU
          </Button>
          <Button className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_20px_rgba(79,70,229,0.3)]">
            New Movement
          </Button>
        </div>
      </div>

      {/* Panel 1: Top Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-slate-900/60 border-slate-800/60 backdrop-blur-xl">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-slate-400">Total Stock</CardTitle>
            <Box className="w-4 h-4 text-indigo-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{totalStock.toLocaleString()}</div>
            <p className="text-xs text-slate-500 mt-1">Across all Godowns</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800/60 backdrop-blur-xl">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-slate-400">Available</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{totalStock.toLocaleString()}</div>
            <p className="text-xs text-slate-500 mt-1">Ready for dispatch</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800/60 backdrop-blur-xl">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-slate-400">Reserved</CardTitle>
            <Layers className="w-4 h-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">0</div>
            <p className="text-xs text-slate-500 mt-1">Locked by open orders</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800/60 backdrop-blur-xl">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-slate-400">Damaged / Rejected</CardTitle>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">0</div>
            <p className="text-xs text-slate-500 mt-1">Quarantined stock</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Panel 2: Godown Breakdown */}
        <Card className="bg-slate-900/60 border-slate-800/60 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-white">
              <MapPin className="w-5 h-5 text-indigo-400" />
              <span>Warehouse Breakdown</span>
            </CardTitle>
            <CardDescription className="text-slate-400">Live distribution of stock across your facilities</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400">Godown</TableHead>
                  <TableHead className="text-right text-slate-400">Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {godowns.map((g: any) => (
                  <TableRow key={g.godownName} className="border-slate-800 hover:bg-slate-800/50">
                    <TableCell className="font-medium text-slate-200">{g.godownName}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-400">
                      {g.stock.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {godowns.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-slate-500 h-24">No stock found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Panel 3: Batch Breakdown */}
        <Card className="bg-slate-900/60 border-slate-800/60 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-white">
              <Layers className="w-5 h-5 text-indigo-400" />
              <span>Batch Breakdown</span>
            </CardTitle>
            <CardDescription className="text-slate-400">Stock distributed by specific batches/lots</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400">Batch Number</TableHead>
                  <TableHead className="text-slate-400">Expiry Date</TableHead>
                  <TableHead className="text-right text-slate-400">Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b: any) => (
                  <TableRow key={b.batchNumber} className="border-slate-800 hover:bg-slate-800/50">
                    <TableCell className="font-medium text-slate-200">{b.batchNumber}</TableCell>
                    <TableCell className="text-slate-400">
                      {b.expiryDate ? format(new Date(b.expiryDate), 'dd MMM yyyy') : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-emerald-400">
                      {b.stock.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {batches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-slate-500 h-24">No batches found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Panel 4: Immutable Ledger (Recent Movements) */}
      <Card className="bg-slate-900/60 border-slate-800/60 backdrop-blur-xl overflow-hidden">
        <CardHeader className="border-b border-slate-800 bg-slate-900/80">
          <CardTitle className="flex items-center justify-between text-white">
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-indigo-400" />
              <span>Immutable Ledger (Movement History)</span>
            </div>
            <Button variant="outline" size="sm" className="border-slate-700 bg-slate-800 text-slate-300">
              View Full Audit Trail
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-900/50">
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="text-slate-400 pl-6">Date</TableHead>
                <TableHead className="text-slate-400">Movement</TableHead>
                <TableHead className="text-slate-400">Reference</TableHead>
                <TableHead className="text-slate-400">Batch</TableHead>
                <TableHead className="text-slate-400">Godown</TableHead>
                <TableHead className="text-right text-slate-400">Quantity</TableHead>
                <TableHead className="text-right text-slate-400 pr-6">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentMovements.map((movement: any) => {
                const isPositive = ['OPENING', 'INWARD', 'TRANSFER_IN', 'RETURN_IN'].includes(movement.movementType);
                const isNegative = ['OUTWARD', 'TRANSFER_OUT', 'RETURN_OUT'].includes(movement.movementType);
                
                return (
                  <TableRow key={movement.id} className="border-slate-800 hover:bg-slate-800/40 transition-colors">
                    <TableCell className="pl-6 text-slate-300">
                      {format(new Date(movement.createdAt), 'dd MMM yyyy, HH:mm')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`
                        ${isPositive ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : ''}
                        ${isNegative ? 'border-rose-500/30 text-rose-400 bg-rose-500/10' : ''}
                        ${movement.movementType === 'ADJUSTMENT' ? 'border-amber-500/30 text-amber-400 bg-amber-500/10' : ''}
                      `}>
                        {movement.movementType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-slate-300">{movement.referenceId}</div>
                      <div className="text-xs text-slate-500">{movement.referenceType}</div>
                    </TableCell>
                    <TableCell className="text-slate-400">{movement.batch?.batchNumber || '-'}</TableCell>
                    <TableCell className="text-slate-400">{movement.godown?.name || '-'}</TableCell>
                    <TableCell className={`text-right font-mono font-medium ${isNegative ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {movement.movementType === 'REVERSAL' ? '' : (isNegative ? '-' : '+')}{movement.quantity}
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      {!['REVERSAL', 'OPENING'].includes(movement.movementType) && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                          onClick={() => handleReverse(movement.id)}
                        >
                          Reverse
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {recentMovements.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-500 h-32">No history available</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
