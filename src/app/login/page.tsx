'use client'

import { useActionState } from 'react'
import { login } from '@/app/actions/auth'

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined)

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0a0a',
      color: '#e5e5e5',
      fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
    }}>
      <form action={action} style={{
        background: '#141414',
        border: '1px solid #262626',
        borderRadius: 12,
        padding: 32,
        width: 360,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, textAlign: 'center' }}>
          BidBerry Login
        </h1>

        {state?.error && (
          <div style={{
            background: '#3b1111',
            border: '1px solid #7f1d1d',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            color: '#fca5a5',
          }}>
            {state.error}
          </div>
        )}

        <label style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            style={{
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: 6,
              padding: '8px 12px',
              color: '#e5e5e5',
              fontSize: 14,
              outline: 'none',
            }}
          />
        </label>

        <label style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            style={{
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: 6,
              padding: '8px 12px',
              color: '#e5e5e5',
              fontSize: 14,
              outline: 'none',
            }}
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          style={{
            background: pending ? '#333' : '#c2800a',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '10px 16px',
            fontSize: 14,
            fontWeight: 600,
            cursor: pending ? 'not-allowed' : 'pointer',
            marginTop: 4,
          }}
        >
          {pending ? 'Accesso...' : 'Accedi'}
        </button>
      </form>
    </div>
  )
}
