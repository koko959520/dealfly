'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  dealId: string
  currentStatus: string
}

export default function DealActions({ dealId, currentStatus }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const router = useRouter()

  async function updateStatus(status: string) {
    setLoading(status)
    await fetch(`/api/admin/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setLoading(null)
    router.refresh()
  }

  return (
    <div className="flex gap-2">
      {currentStatus === 'PENDING' && (
        <button
          onClick={() => updateStatus('APPROVED')}
          disabled={loading !== null}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          {loading === 'APPROVED' ? '…' : '✓ Approuver'}
        </button>
      )}
      {currentStatus === 'APPROVED' && (
        <button
          onClick={() => updateStatus('PENDING')}
          disabled={loading !== null}
          className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-700 text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          {loading === 'PENDING' ? '…' : '↩ Annuler'}
        </button>
      )}
      <button
        onClick={() => updateStatus('REJECTED')}
        disabled={loading !== null}
        className="bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-700 text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
      >
        {loading === 'REJECTED' ? '…' : '✗ Rejeter'}
      </button>
    </div>
  )
}
