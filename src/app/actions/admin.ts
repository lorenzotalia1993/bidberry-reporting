'use server'

import { randomBytes, createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import sql from '@/lib/db'
import { getSession } from '@/lib/session'

async function requireAdmin() {
  const session = await getSession()
  if (!session?.isAdmin) throw new Error('Unauthorized')
  return session
}

export async function createUser(formData: FormData) {
  await requireAdmin()
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const password = formData.get('password') as string

  if (!email || !password || password.length < 6) {
    return { error: 'Email e password (min 6 char) richiesti' }
  }

  const passwordHash = await bcrypt.hash(password, 10)

  try {
    await sql`INSERT INTO users (email, password_hash) VALUES (${email}, ${passwordHash})`
  } catch {
    return { error: 'Utente già esistente' }
  }

  return { success: true }
}

export async function updateTagPermissions(userId: number, configNames: string[]) {
  await requireAdmin()

  await sql.begin(async (tx) => {
    await tx`DELETE FROM user_tag_permissions WHERE user_id = ${userId}`
    if (configNames.length > 0) {
      const rows = configNames.map(name => ({ user_id: userId, config_name: name }))
      await tx`INSERT INTO user_tag_permissions ${sql(rows)}`
    }
  })

  return { success: true }
}

export async function updateUserPassword(userId: number, newPassword: string) {
  await requireAdmin()
  if (!newPassword || newPassword.length < 6) {
    return { error: 'Password min 6 caratteri' }
  }
  const passwordHash = await bcrypt.hash(newPassword, 10)
  await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${userId}`
  return { success: true }
}

export async function deleteUser(userId: number) {
  await requireAdmin()
  // Prevent self-deletion
  const session = await getSession()
  if (session!.userId === userId) return { error: 'Non puoi eliminare te stesso' }
  await sql`DELETE FROM users WHERE id = ${userId}`
  return { success: true }
}

export async function generateApiKey(userId: number) {
  await requireAdmin()

  const raw = randomBytes(32)
  const prefix = 'bbrry_'
  const keyPlain = prefix + raw.toString('hex')
  const keyHash = createHash('sha256').update(keyPlain).digest('hex')
  const keyPrefix = keyPlain.slice(0, 12) + '...'

  await sql`INSERT INTO api_keys (user_id, key_hash, key_prefix) VALUES (${userId}, ${keyHash}, ${keyPrefix})`

  return { key: keyPlain }
}

export async function revokeApiKey(keyId: number) {
  await requireAdmin()
  await sql`UPDATE api_keys SET revoked_at = NOW() WHERE id = ${keyId}`
  return { success: true }
}

export async function listUsers() {
  await requireAdmin()
  return sql`
    SELECT u.id, u.email, u.is_admin, u.created_at,
      COALESCE(
        (SELECT json_agg(utp.config_name) FROM user_tag_permissions utp WHERE utp.user_id = u.id),
        '[]'::json
      ) as tags
    FROM users u
    ORDER BY u.created_at ASC
  `
}

export async function getUser(userId: number) {
  await requireAdmin()
  const [user] = await sql`SELECT id, email, is_admin, created_at FROM users WHERE id = ${userId}`
  if (!user) return null

  const tags = await sql`SELECT config_name FROM user_tag_permissions WHERE user_id = ${userId}`
  const apiKeys = await sql`SELECT id, key_prefix, created_at, revoked_at FROM api_keys WHERE user_id = ${userId} ORDER BY created_at DESC`

  return { ...user, tags: tags.map((t) => (t as { config_name: string }).config_name), apiKeys }
}

export async function getAvailableTags(): Promise<string[]> {
  await requireAdmin()
  const rows = await sql`SELECT DISTINCT config_name FROM report_data WHERE provider = 'enki' AND config_name IS NOT NULL ORDER BY config_name`
  return rows.map((r) => (r as { config_name: string }).config_name)
}
