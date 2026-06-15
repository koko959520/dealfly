import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/src/lib/auth'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/admin/login')

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-gray-900 text-white h-14 flex items-center px-6 gap-6 sticky top-0 z-50">
        <span className="font-bold text-white">✈️ DealFly Admin</span>
        <div className="flex gap-4 text-sm text-gray-300 ml-4">
          <a href="/admin/dashboard"   className="hover:text-white transition-colors">Dashboard</a>
          <a href="/admin/deals"       className="hover:text-white transition-colors">Deals</a>
          <a href="/admin/newsletter"  className="hover:text-white transition-colors">Newsletter</a>
          <a href="/admin/subscribers" className="hover:text-white transition-colors">Abonnés</a>
        </div>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-gray-400">{session.user?.email}</span>
          <a href="/api/auth/signout" className="text-red-400 hover:text-red-300 transition-colors">Déconnexion</a>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
