'use client'

import { useState } from 'react'
import { getDaysInMonth, startOfMonth, getDay, format } from 'date-fns'
import { fr } from 'date-fns/locale'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CalendarDay {
  date: string
  price: number | null
  isOptimal: boolean
  discount?: number
}

interface Props {
  month: string        // YYYY-MM
  days: CalendarDay[]
  onSelectDepart?: (date: string) => void
  onSelectReturn?: (date: string) => void
  selectedDepart?: string
  selectedReturn?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Détermine la classe CSS selon le percentile de prix */
function getPriceClass(price: number, min: number, max: number): string {
  if (max === min) return 'price-normal'
  const ratio = (price - min) / (max - min)
  if (ratio < 0.25) return 'price-hot'
  if (ratio < 0.5)  return 'price-warm'
  if (ratio < 0.75) return 'price-normal'
  return 'price-cold'
}

const DAYS_OF_WEEK = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

// ── Composant ─────────────────────────────────────────────────────────────────

export default function PriceCalendar({
  month,
  days,
  onSelectDepart,
  onSelectReturn,
  selectedDepart,
  selectedReturn,
}: Props) {
  const [tooltip, setTooltip] = useState<{ date: string; x: number; y: number } | null>(null)

  const monthDate = new Date(`${month}-01`)
  const monthLabel = format(monthDate, 'MMMM yyyy', { locale: fr })

  // Prix disponibles pour le min/max
  const prices = days.filter((d) => d.price !== null).map((d) => d.price as number)
  const minPrice = prices.length ? Math.min(...prices) : 0
  const maxPrice = prices.length ? Math.max(...prices) : 0

  // Index ISO : lundi = 0 → dimanche = 6
  const firstDayOfWeek = (getDay(startOfMonth(monthDate)) + 6) % 7
  const totalDays = getDaysInMonth(monthDate)

  const dayMap = new Map(days.map((d) => [d.date, d]))

  function handleClick(dateStr: string) {
    if (!onSelectDepart || !onSelectReturn) return
    if (!selectedDepart || (selectedDepart && selectedReturn)) {
      onSelectDepart(dateStr)
      onSelectReturn('')
    } else {
      if (dateStr < selectedDepart) {
        onSelectReturn(selectedDepart)
        onSelectDepart(dateStr)
      } else {
        onSelectReturn(dateStr)
      }
    }
  }

  function isInRange(dateStr: string) {
    if (!selectedDepart || !selectedReturn) return false
    return dateStr > selectedDepart && dateStr < selectedReturn
  }

  const tooltipDay = tooltip ? dayMap.get(tooltip.date) : null

  return (
    <div className="relative select-none">
      <h3 className="text-center font-semibold text-gray-700 mb-3 capitalize">{monthLabel}</h3>

      {/* En-tête jours de la semaine */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_OF_WEEK.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Grille des jours */}
      <div className="grid grid-cols-7 gap-0.5">
        {/* Cellules vides avant le premier jour */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {/* Jours du mois */}
        {Array.from({ length: totalDays }).map((_, i) => {
          const dayNum = i + 1
          const dateStr = `${month}-${String(dayNum).padStart(2, '0')}`
          const data = dayMap.get(dateStr)
          const price = data?.price ?? null
          const isOptimal = data?.isOptimal ?? false

          const isDepart  = selectedDepart === dateStr
          const isReturn  = selectedReturn === dateStr
          const inRange   = isInRange(dateStr)

          let cellClass = 'price-empty'
          if (price !== null) {
            cellClass = getPriceClass(price, minPrice, maxPrice)
          }

          return (
            <div
              key={dateStr}
              className={[
                'relative rounded cursor-pointer transition-all duration-100',
                'flex flex-col items-center justify-center min-h-[52px] text-center px-0.5',
                price !== null ? cellClass : 'price-empty cursor-default',
                isOptimal ? 'ring-2 ring-blue-400 ring-offset-1 scale-105 z-10' : '',
                isDepart  ? 'ring-2 ring-blue-600 ring-offset-1 z-10' : '',
                isReturn  ? 'ring-2 ring-purple-600 ring-offset-1 z-10' : '',
                inRange   ? 'opacity-80 bg-blue-100' : '',
                price !== null ? 'hover:scale-105 hover:z-10' : '',
              ].join(' ')}
              onMouseEnter={(e) => {
                if (price !== null) {
                  setTooltip({ date: dateStr, x: e.clientX, y: e.clientY })
                }
              }}
              onMouseLeave={() => setTooltip(null)}
              onClick={() => price !== null && handleClick(dateStr)}
            >
              <span className="text-[10px] font-medium opacity-80 leading-none">{dayNum}</span>
              {price !== null && (
                <span className="text-[11px] font-bold leading-none mt-0.5">
                  {price}€
                </span>
              )}
              {isOptimal && (
                <span className="absolute -top-1 -right-1 text-[8px] bg-blue-600 text-white rounded-full w-3 h-3 flex items-center justify-center">
                  ★
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Tooltip */}
      {tooltip && tooltipDay && tooltipDay.price !== null && (
        <div
          className="fixed z-50 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl pointer-events-none animate-fade-in"
          style={{ top: tooltip.y - 80, left: tooltip.x - 60 }}
        >
          <div className="font-semibold">{format(new Date(tooltip.date), 'd MMMM', { locale: fr })}</div>
          <div className="text-green-300 font-bold text-sm">{tooltipDay.price}€</div>
          {tooltipDay.discount && tooltipDay.discount > 0 && (
            <div className="text-yellow-300">−{tooltipDay.discount}% vs médiane</div>
          )}
          {tooltipDay.isOptimal && (
            <div className="text-blue-300">★ Date optimale</div>
          )}
        </div>
      )}

      {/* Légende */}
      <div className="flex items-center gap-3 mt-4 justify-center text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-600 inline-block"/> Très bon</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-lime-500 inline-block"/> Bon</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400 inline-block"/> Moyen</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block"/> Élevé</span>
      </div>
    </div>
  )
}
