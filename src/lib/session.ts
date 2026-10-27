import 'server-only'
import { cookies } from 'next/headers'
import { encrypt, decrypt, type SessionPayload } from './jwt'

export type { SessionPayload }
export { encrypt, decrypt }

export async function createSession(user: { id: number; email: string; is_admin: boolean }, allowedTags: string[]) {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const session = await encrypt({
    userId: user.id,
    email: user.email,
    isAdmin: user.is_admin,
    allowedTags,
    expiresAt,
  })
  const cookieStore = await cookies()

  cookieStore.set('session', session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    sameSite: 'lax',
    path: '/',
  })
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const session = cookieStore.get('session')?.value
  if (!session) return null
  return decrypt(session)
}

export async function deleteSession() {
  const cookieStore = await cookies()
  cookieStore.delete('session')
}
