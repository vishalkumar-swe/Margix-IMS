'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { Button } from './ui/button';

type CreatePOModalProps = {
  suppliers: { id: string; name: string }[];
  skus: { id: string; productCode: string; name: string }[];
};

export default function CreatePOModal({ suppliers, skus }: CreatePOModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [supplierId, setSupplierId] = useState('');
  const [items, setItems] = useState([{ skuId: '', orderedQty: '', rate: '' }]);
  
  const router = useRouter();

  const handleAddItem = () => {
    setItems([...items, { skuId: '', orderedQty: '', rate: '' }]);
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const handleItemChange = (index: number, field: string, value: string) => {
    const newItems = [...items] as any;
    newItems[index][field] = value;
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId || items.some(i => !i.skuId || !i.orderedQty)) {
      alert("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId, items })
      });

      if (res.ok) {
        setIsOpen(false);
        router.refresh();
      } else {
        const err = await res.json();
        alert('Error: ' + err.error);
      }
    } catch (e) {
      alert('Failed to create PO');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button 
        className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_20px_rgba(79,70,229,0.3)]"
        onClick={() => setIsOpen(true)}
      >
        <Plus className="w-4 h-4 mr-2" />
        Create PO
      </Button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Create Purchase Order</h2>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm text-slate-300 mb-2">Supplier *</label>
                <select 
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-white"
                  required
                >
                  <option value="">Select a supplier...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm text-slate-300">Items *</label>
                  <Button type="button" variant="ghost" size="sm" onClick={handleAddItem} className="text-indigo-400 hover:bg-indigo-500/10">
                    <Plus className="w-4 h-4 mr-1" /> Add Line
                  </Button>
                </div>
                
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div key={index} className="flex gap-3 items-start bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                      <div className="flex-1">
                        <select
                          value={item.skuId}
                          onChange={(e) => handleItemChange(index, 'skuId', e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-white text-sm"
                          required
                        >
                          <option value="">Select SKU...</option>
                          {skus.map(s => (
                            <option key={s.id} value={s.id}>{s.productCode} - {s.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-24">
                        <input
                          type="number"
                          placeholder="Qty"
                          min="1"
                          step="0.01"
                          value={item.orderedQty}
                          onChange={(e) => handleItemChange(index, 'orderedQty', e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-white text-sm"
                          required
                        />
                      </div>
                      <div className="w-24">
                        <input
                          type="number"
                          placeholder="Rate"
                          min="0"
                          step="0.01"
                          value={item.rate}
                          onChange={(e) => handleItemChange(index, 'rate', e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-white text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-md mt-1"
                        disabled={items.length === 1}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} className="text-slate-300 hover:bg-slate-800">
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-500 text-white">
                  {loading ? "Creating..." : "Create PO"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
