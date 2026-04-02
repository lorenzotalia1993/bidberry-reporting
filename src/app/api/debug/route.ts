import { NextResponse } from 'next/server'
import sql from '@/lib/db'

export async function GET() {
  try {
    const [{ count }] = await sql`SELECT COUNT(*) as count FROM report_data`
    const sample = await sql`
      SELECT id, breakdown, report_date, config_name, revenue
      FROM report_data
      LIMIT 3
    `
    return NextResponse.json({ count: Number(count), sample })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
