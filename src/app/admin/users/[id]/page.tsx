'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  getUser,
  getAvailableTags,
  updateTagPermissions,
  updateUserPassword,
  generateApiKey,
  revokeApiKey,
  deleteUser,
} from '@/app/actions/admin'

interface ApiKey {
  id: number
  key_prefix: string
  created_at: string
  revoked_at: string | null
}

interface UserData {
  id: number
  email: string
  is_admin: boolean
  tags: string[]
  apiKeys: ApiKey[]
}

export default function EditUserPage() {
  const params = useParams()
  const router = useRouter()
  const userId = Number(params.id)

  const [user, setUser] = useState<UserData | null>(null)
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [newPassword, setNewPassword] = useState('')
  const [tagSearch, setTagSearch] = useState('')
  const [msg, setMsg] = useState('')
  const [newKey, setNewKey] = useState('')

  const load = useCallback(async () => {
    const [u, tags] = await Promise.all([getUser(userId), getAvailableTags()])
    if (!u) { router.push('/admin'); return }
    setUser(u as unknown as UserData)
    setSelectedTags(u.tags)
    setAvailableTags(tags)
  }, [userId, router])

  useEffect(() => { load() }, [load])

  if (!user) return <div style={{ padding: 24 }}>Caricamento...</div>

  async function handleTagSave() {
    await updateTagPermissions(userId, selectedTags)
    setMsg('Tag aggiornati')
    setTimeout(() => setMsg(''), 2000)
  }

  async function handlePasswordSave() {
    const r = await updateUserPassword(userId, newPassword)
    if (r.error) { setMsg(r.error); return }
    setNewPassword('')
    setMsg('Password aggiornata')
    setTimeout(() => setMsg(''), 2000)
  }

  async function handleGenKey() {
    const r = await generateApiKey(userId)
    if (r.key) {
      setNewKey(r.key)
      load()
    }
  }

  async function handleRevoke(keyId: number) {
    await revokeApiKey(keyId)
    load()
  }

  async function handleDelete() {
    if (!confirm(`Eliminare ${user!.email}?`)) return
    const r = await deleteUser(userId)
    if (r.error) { setMsg(r.error); return }
    router.push('/admin')
  }

  const s = sectionStyle

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{user.email}</h1>
        {!user.is_admin && (
          <button onClick={handleDelete} style={{ background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
            Elimina utente
          </button>
        )}
      </div>

      {msg && (
        <div style={{ background: '#14532d', border: '1px solid #166534', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#86efac', marginBottom: 16 }}>
          {msg}
        </div>
      )}

      {/* Tag Permissions */}
      {!user.is_admin && (
        <div style={s}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Tag Permissions</h2>
            <span style={{ fontSize: 12, color: '#888' }}>
              {selectedTags.length} / {availableTags.length} assegnati
            </span>
          </div>
          <input
            type="text"
            value={tagSearch}
            onChange={e => setTagSearch(e.target.value)}
            placeholder="Cerca tag..."
            style={{ ...inputStyle, width: '100%', marginBottom: 16, boxSizing: 'border-box' }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Assegnati */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#86efac', textTransform: 'uppercase', marginBottom: 8 }}>
                ✓ Assegnati ({selectedTags.filter(t => t.toLowerCase().includes(tagSearch.toLowerCase())).length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
                {selectedTags
                  .filter(t => t.toLowerCase().includes(tagSearch.toLowerCase()))
                  .sort()
                  .map(tag => (
                    <button
                      key={tag}
                      onClick={() => setSelectedTags(prev => prev.filter(t => t !== tag))}
                      style={{
                        background: '#14532d', color: '#86efac',
                        border: '1px solid #166534', borderRadius: 6,
                        padding: '5px 10px', fontSize: 12, cursor: 'pointer',
                        textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}
                    >
                      <span>{tag}</span>
                      <span style={{ opacity: 0.6, fontSize: 10 }}>rimuovi ✕</span>
                    </button>
                  ))}
                {selectedTags.filter(t => t.toLowerCase().includes(tagSearch.toLowerCase())).length === 0 && (
                  <div style={{ fontSize: 12, color: '#525252', fontStyle: 'italic', padding: '4px 0' }}>Nessun tag assegnato</div>
                )}
              </div>
            </div>
            {/* Disponibili */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>
                Disponibili ({availableTags.filter(t => !selectedTags.includes(t) && t.toLowerCase().includes(tagSearch.toLowerCase())).length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
                {availableTags
                  .filter(t => !selectedTags.includes(t) && t.toLowerCase().includes(tagSearch.toLowerCase()))
                  .sort()
                  .map(tag => (
                    <button
                      key={tag}
                      onClick={() => setSelectedTags(prev => [...prev, tag])}
                      style={{
                        background: '#1e293b', color: '#94a3b8',
                        border: '1px solid #334155', borderRadius: 6,
                        padding: '5px 10px', fontSize: 12, cursor: 'pointer',
                        textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}
                    >
                      <span>{tag}</span>
                      <span style={{ opacity: 0.5, fontSize: 10 }}>aggiungi +</span>
                    </button>
                  ))}
                {availableTags.filter(t => !selectedTags.includes(t) && t.toLowerCase().includes(tagSearch.toLowerCase())).length === 0 && (
                  <div style={{ fontSize: 12, color: '#525252', fontStyle: 'italic', padding: '4px 0' }}>Tutti i tag sono assegnati</div>
                )}
              </div>
            </div>
          </div>
          <button onClick={handleTagSave} style={btnStyle}>Salva tag</button>
        </div>
      )}

      {/* Password */}
      <div style={s}>
        <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Cambia Password</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="Nuova password (min 6)"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={handlePasswordSave} style={btnStyle}>Salva</button>
        </div>
      </div>

      {/* API Keys */}
      {!user.is_admin && (
        <div style={s}>
          <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>API Keys</h2>

          {newKey && (
            <div style={{
              background: '#14532d',
              border: '1px solid #166534',
              borderRadius: 8,
              padding: 12,
              fontSize: 13,
              color: '#86efac',
              marginBottom: 12,
              wordBreak: 'break-all',
            }}>
              <strong>Nuova chiave (copia ora, non sarà più visibile):</strong><br />
              <code style={{ fontSize: 12 }}>{newKey}</code>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {user.apiKeys.map((k: ApiKey) => (
              <div key={k.id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#1a1a1a',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 13,
              }}>
                <span>
                  <code>{k.key_prefix}</code>
                  <span style={{ color: '#525252', marginLeft: 8 }}>
                    {new Date(k.created_at).toLocaleDateString()}
                  </span>
                  {k.revoked_at && <span style={{ color: '#ef4444', marginLeft: 8 }}>Revocata</span>}
                </span>
                {!k.revoked_at && (
                  <button onClick={() => handleRevoke(k.id)} style={{ background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}>
                    Revoca
                  </button>
                )}
              </div>
            ))}
          </div>

          <button onClick={handleGenKey} style={btnStyle}>Genera API Key</button>
        </div>
      )}
    </div>
  )
}

const sectionStyle: React.CSSProperties = {
  background: '#141414',
  border: '1px solid #262626',
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
}

const btnStyle: React.CSSProperties = {
  background: '#c2800a',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
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
