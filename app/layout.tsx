import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'DealFly — Alertes deals vols',
  description: 'Trouvez les meilleurs deals aériens avec jusqu\'à -50% sur les prix habituels.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={inter.className}>
        <nav className="border-b border-gray-200 bg-white sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <a href="/" className="font-bold text-xl text-blue-600">✈️ DealFly</a>
            <div className="flex gap-6 text-sm font-medium text-gray-600">
              <a href="/search" className="hover:text-blue-600 transition-colors">Rechercher</a>
              <a href="/deals" className="hover:text-blue-600 transition-colors">Top Deals</a>
            </div>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  )
}
