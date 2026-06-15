import { curateDeals } from '@/src/newsletter/deal-curator'
import SendNewsletterButton from './SendNewsletterButton'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export const revalidate = 0

export default async function NewsletterAdminPage() {
  const deals = await curateDeals(10)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Newsletter</h1>
        <SendNewsletterButton disabled={deals.length === 0} dealCount={deals.length} />
      </div>

      {deals.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-6 py-5 text-amber-800">
          Aucun deal APPROVED disponible. Approuvez des deals dans l'onglet Deals d'abord.
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-5">
            Prévisualisation — {deals.length} deal{deals.length > 1 ? 's' : ''} sélectionné{deals.length > 1 ? 's' : ''} par le curateur (diversité géographique appliquée).
          </p>

          <div className="space-y-4">
            {deals.map((deal, i) => (
              <div key={deal.id} className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-wrap gap-4 items-center">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="font-bold text-gray-900">{deal.origin} → {deal.destination}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{deal.zone} · {deal.airline ?? 'Compagnie inconnue'}</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-black text-gray-900">{deal.priceEur}€</div>
                  <div className="text-sm text-green-600 font-semibold">−{Math.round(deal.discountPct)}%</div>
                </div>
                <div className="text-sm text-gray-500">
                  <div>{format(new Date(deal.optimalDepart), 'd MMM yyyy', { locale: fr })}</div>
                  {deal.optimalReturn && (
                    <div>→ {format(new Date(deal.optimalReturn), 'd MMM yyyy', { locale: fr })}</div>
                  )}
                </div>
                <div className="text-sm font-bold text-blue-600">{deal.score}/100</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
