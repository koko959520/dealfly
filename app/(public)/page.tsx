'use client'

import { useState } from 'react'

const AIRPORTS = [
  { code: 'CDG', label: 'Paris CDG' },
  { code: 'ORY', label: 'Paris Orly' },
  { code: 'LYS', label: 'Lyon' },
  { code: 'NCE', label: 'Nice' },
  { code: 'MRS', label: 'Marseille' },
]

export default function HomePage() {
  const [email, setEmail]         = useState('')
  const [origin, setOrigin]       = useState('CDG')
  const [budget, setBudget]       = useState('')
  const [status, setStatus]       = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage]     = useState('')

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          origin,
          budget_max: budget ? parseInt(budget) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erreur')
      setStatus('success')
      setMessage(data.message)
      setEmail('')
    } catch (err: unknown) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-600 to-blue-800 text-white py-24 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-block bg-white/10 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            ✈️ Alertes deals aériens en temps réel
          </div>
          <h1 className="text-5xl font-black mb-6 leading-tight">
            Ne ratez plus jamais un vol à <span className="text-yellow-300">−50%</span>
          </h1>
          <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto">
            Notre radar analyse les prix toutes les 6h et vous alerte dès qu'une anomalie tarifaire
            est détectée — avant que tout le monde ne la repère.
          </p>

          {/* Stats */}
          <div className="flex flex-wrap justify-center gap-8 mb-12">
            {[
              { n: '6h', label: 'Fréquence de scan' },
              { n: '−35%', label: 'Réduction minimum' },
              { n: '48h', label: 'Newsletter cadencée' },
            ].map(({ n, label }) => (
              <div key={label} className="text-center">
                <div className="text-3xl font-black text-yellow-300">{n}</div>
                <div className="text-sm text-blue-200">{label}</div>
              </div>
            ))}
          </div>

          {/* Formulaire d'inscription */}
          {status === 'success' ? (
            <div className="bg-green-500/20 border border-green-400 rounded-2xl px-8 py-6 max-w-md mx-auto">
              <div className="text-2xl mb-2">📬</div>
              <p className="font-semibold">{message}</p>
            </div>
          ) : (
            <form
              onSubmit={handleSubscribe}
              className="bg-white rounded-2xl p-6 max-w-lg mx-auto shadow-2xl text-left"
            >
              <h2 className="text-gray-900 font-bold text-lg mb-4">Recevoir les alertes</h2>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vous@exemple.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                      Aéroport de départ
                    </label>
                    <select
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {AIRPORTS.map((a) => (
                        <option key={a.code} value={a.code}>{a.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                      Budget max (€)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={5000}
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      placeholder="500"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                {status === 'error' && (
                  <p className="text-sm text-red-600">{message}</p>
                )}

                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors mt-1"
                >
                  {status === 'loading' ? 'Inscription…' : 'Recevoir les alertes gratuitement →'}
                </button>

                <p className="text-center text-xs text-gray-400">
                  Double opt-in · Désinscription en 1 clic · Zéro spam
                </p>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Comment ça marche</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: '🔍',
                title: 'Scan continu',
                desc: 'Notre moteur interroge Amadeus, Kiwi et Skyscanner toutes les 6h pour détecter les anomalies de prix.',
              },
              {
                icon: '🧠',
                title: 'Algorithme de scoring',
                desc: 'Chaque deal est scoré sur 100 points en combinant le niveau de réduction, la flexibilité des dates et la fraîcheur.',
              },
              {
                icon: '📧',
                title: 'Alerte toutes les 48h',
                desc: 'Seuls les meilleurs deals validés par notre équipe vous sont envoyés — pas de bruit, que du signal.',
              },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="text-4xl mb-4">{icon}</div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA secondaire */}
      <section className="py-16 px-4 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Envie d'explorer ?</h2>
        <p className="text-gray-500 mb-8">Consultez notre calendrier de prix pour trouver les meilleurs jours de voyage.</p>
        <a
          href="/search"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
        >
          Explorer les prix →
        </a>
      </section>
    </div>
  )
}
