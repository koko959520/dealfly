'use client'

import { useState } from 'react'

interface Props {
  disabled: boolean
  dealCount: number
}

export default function SendNewsletterButton({ disabled, dealCount }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ sent: number } | null>(null)

  async function handleSend() {
    if (!confirm(`Envoyer la newsletter avec ${dealCount} deals à tous les abonnés confirmés ?`)) return

    setStatus('loading')
    try {
      const res = await fetch('/api/admin/newsletter/send', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data)
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'done' && result) {
    return (
      <div className="bg-green-100 text-green-800 text-sm font-semibold px-5 py-2.5 rounded-xl">
        ✓ Envoyé à {result.sent} abonnés
      </div>
    )
  }

  return (
    <button
      onClick={handleSend}
      disabled={disabled || status === 'loading'}
      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl transition-colors"
    >
      {status === 'loading' ? 'Envoi en cours…' : `📧 Envoyer à tous les abonnés`}
    </button>
  )
}
