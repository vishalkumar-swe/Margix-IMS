'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Button } from './ui/button';

export default function AdjustmentActions({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    if (!confirm('Approve this adjustment? This will permanently post it to the ledger.')) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/adjustments/${requestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedBy: 'admin_user_id_123' }) // Hardcoded for demo
      });

      if (!res.ok) {
        const err = await res.json();
        alert('Failed to approve: ' + err.error);
        return;
      }

      router.refresh();
    } catch (e) {
      alert('Failed to approve adjustment.');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    // Rejection can just update status in a real app. For MVP we'll just alert.
    alert('Rejection flow would update status to REJECTED.');
  };

  return (
    <div className="flex space-x-2">
      <Button 
        size="sm" 
        variant="ghost" 
        className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
        onClick={handleApprove}
        disabled={loading}
      >
        <CheckCircle2 className="w-4 h-4 mr-1" />
        Approve
      </Button>
      <Button 
        size="sm" 
        variant="ghost" 
        className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
        onClick={handleReject}
        disabled={loading}
      >
        <XCircle className="w-4 h-4 mr-1" />
        Reject
      </Button>
    </div>
  );
}
