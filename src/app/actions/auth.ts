'use server'

import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import sql from '@/lib/db'
import { createSession, deleteSession } from '@/lib/session'

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email e password richiesti' }
  }

  const [user] = await sql`SELECT id, email, password_hash, is_admin FROM users WHERE email = ${email}`

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return { error: 'Credenziali non valide' }
  }

  const tags = await sql`SELECT config_name FROM user_tag_permissions WHERE user_id = ${user.id}`
  const allowedTags = tags.map((t) => (t as { config_name: string }).config_name)

  await createSession(user as { id: number; email: string; is_admin: boolean }, allowedTags)
  redirect('/')
}

export async function logout() {
  await deleteSession()
  redirect('/login')
}
