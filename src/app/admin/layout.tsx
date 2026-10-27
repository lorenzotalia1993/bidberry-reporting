import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session?.isAdmin) redirect('/')

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#e5e5e5',
      fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
    }}>
      <header style={{
        borderBottom: '1px solid #262626',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="/" style={{ color: '#a3a3a3', textDecoration: 'none', fontSize: 13 }}>Dashboard</a>
          <span style={{ color: '#525252' }}>/</span>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Admin</span>
        </div>
      </header>
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
        {children}
      </main>
    </div>
  )
}
