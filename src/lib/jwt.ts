import { SignJWT, jwtVerify } from 'jose'

const encodedKey = new TextEncoder().encode(process.env.SESSION_SECRET)

export interface SessionPayload {
  userId: number
  email: string
  isAdmin: boolean
  allowedTags: string[]
  expiresAt: Date
}

export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encodedKey)
}

export async function decrypt(session: string | undefined = ''): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(session!, encodedKey, {
      algorithms: ['HS256'],
    })
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}
