import { NextResponse } from 'next/server'
import sql from '@/lib/db'

export async function GET() {
  try {
    const [{ total }] = await sql`SELECT COUNT(*) as total FROM report_data`

    const breakdowns = await sql`
      SELECT breakdown, COUNT(*) as count
      FROM report_data
      GROUP BY breakdown
    `

    const jobs = await sql`
      SELECT job_id, breakdown, status, date_from, records, created_at, updated_at
      FROM report_jobs
      ORDER BY created_at DESC
      LIMIT 20
    `

    // Sample hourly rows: check if report_hour is null
    const hourlyNullCheck = await sql`
      SELECT
        COUNT(*) FILTER (WHERE report_hour IS NULL) as null_hours,
        COUNT(*) FILTER (WHERE report_hour IS NOT NULL) as non_null_hours
      FROM report_data
      WHERE breakdown = 'hourly'
    `

    // Raw sample of an hourly row to see original ENKI columns
    const hourlySample = await sql`
      SELECT id, report_date, report_hour, revenue, raw
      FROM report_data
      WHERE breakdown = 'hourly'
      ORDER BY created_at DESC
      LIMIT 3
    `

    return NextResponse.json({
      total: Number(total),
      breakdowns,
      jobs,
      hourlyNullCheck,
      hourlySample,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
