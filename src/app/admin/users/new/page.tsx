'use client'

import { useState } from 'react'
import { createUser } from '@/app/actions/admin'
import { useRouter } from 'next/navigation'

export default function NewUserPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError('')
    const fd = new FormData(e.currentTarget)
    const result = await createUser(fd)
    if (result?.error) {
      setError(result.error)
      setPending(false)
    } else {
      router.push('/admin')
    }
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 24px', fontSize: 20, fontWeight: 600 }}>Nuovo Utente</h1>
      <form onSubmit={handleSubmit} style={{
        background: '#141414',
        border: '1px solid #262626',
        borderRadius: 12,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        maxWidth: 400,
      }}>
        {error && (
          <div style={{ background: '#3b1111', border: '1px solid #7f1d1d', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#fca5a5' }}>
            {error}
          </div>
        )}
        <label style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
          Email
          <input name="email" type="email" required style={inputStyle} />
        </label>
        <label style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
          Password
          <input name="password" type="password" required minLength={6} style={inputStyle} />
        </label>
        <button type="submit" disabled={pending} style={{
          background: pending ? '#333' : '#c2800a',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '10px 16px',
          fontSize: 14,
          fontWeight: 600,
          cursor: pending ? 'not-allowed' : 'pointer',
        }}>
          {pending ? 'Creazione...' : 'Crea Utente'}
        </button>
      </form>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: '#1a1a1a',
  border: '1px solid #333',
  borderRadius: 6,
  padding: '8px 12px',
  color: '#e5e5e5',
  fontSize: 14,
  outline: 'none',
}
