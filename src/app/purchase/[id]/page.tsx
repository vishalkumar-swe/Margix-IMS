'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Box, CheckCircle2, Factory } from 'lucide-react';
import { format } from 'date-fns';

export default function PurchaseOrderDetail() {
  const params = useParams();
  const router = useRouter();
  const poId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  
  const [godowns, setGodowns] = useState<any[]>([]);
  const [selectedGodown, setSelectedGodown] = useState('');
  const [receiptData, setReceiptData] = useState<Record<string, { qty: string, batch: string, expiry: string }>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [res, godownsRes] = await Promise.all([
          fetch(`/api/po/${poId}`),
          fetch('/api/grn') // We don't have a direct godowns API, wait, maybe I can just hardcode for demo or I'll create one? Let's just fetch from /api/overview or something. Actually, I can just fetch it in a tiny route, or pass it. For now, let's just make a mock godown dropdown if it's too hard, or I'll build an API for godowns later. Wait, `/api/po` could return godowns? I'll build a quick godown fetch via `prisma.godown` in the same API later if needed. For now, I'll fetch `/api/godowns` (which I will create).
        ]);
        
        const json = await res.json();
        setData(json);

        // Pre-fill receipt data state for each item
        if (json.po && json.po.items) {
          const initial: any = {};
          json.po.items.forEach((item: any) => {
            initial[item.skuId] = { qty: '', batch: '', expiry: '' };
          });
          setReceiptData(initial);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    
    // Quick inline fetch for godowns
    fetch('/api/godowns').then(r => r.json()).then(g => {
      setGodowns(g);
      if (g.length > 0) setSelectedGodown(g[0].id);
    }).catch(console.error);
    
  }, [poId]);

  const handlePostGrn = async () => {
    if (!selectedGodown) return alert("Please select a Godown to receive into.");
    
    // Construct payload
    const receivedItems = Object.keys(receiptData).map(skuId => {
      const row = receiptData[skuId];
      return {
        skuId,
        quantity: Number(row.qty) || 0,
        batchNumber: row.batch || null,
        expiryDate: row.expiry || null,
      };
    }).filter(i => i.quantity > 0);

    if (receivedItems.length === 0) {
      return alert("Please enter at least one quantity to receive.");
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/po/${poId}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          godownId: selectedGodown,
          receivedItems,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert('Error: ' + err.error);
        return;
      }
      
      alert('GRN Posted Successfully!');
      router.refresh();
      window.location.reload(); // Quick refresh of the whole page
    } catch (err) {
      alert("Failed to post GRN");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-8 flex items-center justify-center min-h-screen text-slate-400">Loading Purchase Order...</div>;
  }

  if (!data || data.error) {
    return <div className="p-8 flex items-center justify-center min-h-screen text-red-500">Failed to load Purchase Order.</div>;
  }

  const { po, receivedBySku } = data;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/purchase')}>
          <ArrowLeft className="w-5 h-5 text-slate-400" />
        </Button>
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-3xl font-bold tracking-tight text-white">{po.poNumber}</h1>
            <Badge variant="outline" className="border-indigo-500/30 text-indigo-400 bg-indigo-500/10">
              {po.status}
            </Badge>
          </div>
          <p className="text-slate-400 mt-1 flex items-center space-x-2">
            <Factory className="w-4 h-4" />
            <span>Supplier: {po.supplier?.name}</span>
            <span>•</span>
            <span>Date: {format(new Date(po.createdAt), 'dd MMM yyyy')}</span>
          </p>
        </div>
      </div>

      <Card className="bg-slate-900/60 border-slate-800/60 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-white">Goods Receipt Note (GRN)</CardTitle>
          <CardDescription className="text-slate-400">Record incoming stock against this Purchase Order.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          
          <div className="w-64">
            <label className="block text-sm font-medium text-slate-400 mb-2">Destination Godown</label>
            <select 
              value={selectedGodown} 
              onChange={e => setSelectedGodown(e.target.value)}
              className="w-full p-2 bg-slate-900 border border-slate-700 rounded-md text-white focus:border-indigo-500 outline-none"
            >
              {godowns.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="text-slate-400">SKU</TableHead>
                <TableHead className="text-right text-slate-400">Ordered</TableHead>
                <TableHead className="text-right text-slate-400">Previously Received</TableHead>
                <TableHead className="text-right text-slate-400">Pending</TableHead>
                <TableHead className="text-right text-indigo-400">Receive Now</TableHead>
                <TableHead className="text-slate-400">Batch / Expiry (Optional)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {po.items.map((item: any) => {
                const prevReceived = receivedBySku[item.skuId] || 0;
                const pending = item.orderedQty - prevReceived;
                const isFullyReceived = pending <= 0;

                return (
                  <TableRow key={item.id} className="border-slate-800 hover:bg-slate-800/50">
                    <TableCell>
                      <div className="font-medium text-white">{item.sku?.productCode}</div>
                      <div className="text-xs text-slate-500">{item.sku?.name}</div>
                    </TableCell>
                    <TableCell className="text-right text-slate-300 font-mono">{item.orderedQty}</TableCell>
                    <TableCell className="text-right text-emerald-400 font-mono">{prevReceived}</TableCell>
                    <TableCell className="text-right text-amber-400 font-mono">{pending > 0 ? pending : 0}</TableCell>
                    <TableCell className="text-right w-32">
                      <input 
                        type="number" 
                        min="0"
                        max={pending > 0 ? pending : 0}
                        disabled={isFullyReceived || po.status === 'FULLY_RECEIVED'}
                        className="w-20 p-1 text-right bg-slate-900 border border-slate-700 rounded text-white"
                        value={receiptData[item.skuId]?.qty || ''}
                        onChange={e => setReceiptData(prev => ({
                          ...prev,
                          [item.skuId]: { ...prev[item.skuId], qty: e.target.value }
                        }))}
                      />
                    </TableCell>
                    <TableCell className="w-64 space-y-2">
                      <input 
                        type="text" 
                        placeholder="Batch No (e.g. B-001)"
                        disabled={isFullyReceived || po.status === 'FULLY_RECEIVED'}
                        className="w-full p-1 text-sm bg-slate-900 border border-slate-700 rounded text-white"
                        value={receiptData[item.skuId]?.batch || ''}
                        onChange={e => setReceiptData(prev => ({
                          ...prev,
                          [item.skuId]: { ...prev[item.skuId], batch: e.target.value }
                        }))}
                      />
                      <input 
                        type="date" 
                        disabled={isFullyReceived || po.status === 'FULLY_RECEIVED'}
                        className="w-full p-1 text-sm bg-slate-900 border border-slate-700 rounded text-slate-400"
                        value={receiptData[item.skuId]?.expiry || ''}
                        onChange={e => setReceiptData(prev => ({
                          ...prev,
                          [item.skuId]: { ...prev[item.skuId], expiry: e.target.value }
                        }))}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="flex justify-end pt-4 border-t border-slate-800">
            <Button 
              onClick={handlePostGrn} 
              disabled={submitting || po.status === 'FULLY_RECEIVED'}
              className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {submitting ? 'Posting Ledger...' : 'Post GRN'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
