import { listUsers } from '@/app/actions/admin'
import Link from 'next/link'

export default async function AdminPage() {
  const users = await listUsers()

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Utenti</h1>
        <Link
          href="/admin/users/new"
          style={{
            background: '#c2800a',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: 6,
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          + Nuovo utente
        </Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(users as unknown as { id: number; email: string; is_admin: boolean; tags: string[] }[]).map(u => (
          <Link
            key={u.id}
            href={`/admin/users/${u.id}`}
            style={{
              background: '#141414',
              border: '1px solid #262626',
              borderRadius: 8,
              padding: '12px 16px',
              textDecoration: 'none',
              color: '#e5e5e5',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <span style={{ fontWeight: 500 }}>{u.email}</span>
              {u.is_admin && (
                <span style={{
                  marginLeft: 8,
                  background: '#c2800a',
                  color: '#fff',
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                }}>
                  ADMIN
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {(u.tags || []).map((tag: string) => (
                <span key={tag} style={{
                  background: '#1e293b',
                  color: '#94a3b8',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                }}>
                  {tag}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
