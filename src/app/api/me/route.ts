import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import sql from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Re-check from DB to pick up permission changes immediately
  const [user] = await sql`SELECT id, email, is_admin FROM users WHERE id = ${session.userId}`
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 })
  }

  const tags = await sql`SELECT config_name FROM user_tag_permissions WHERE user_id = ${user.id}`
  const allowedTags = tags.map((t) => (t as { config_name: string }).config_name)

  return NextResponse.json({
    email: user.email,
    isAdmin: user.is_admin,
    allowedTags,
  })
}
