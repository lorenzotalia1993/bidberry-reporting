import { NextRequest, NextResponse } from 'next/server'
import { requestReport, TimeBreakdown } from '@/lib/enki'
import sql from '@/lib/db'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

// GET /api/cron/request-report?breakdown=daily|hourly&secret=...
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const secret = req.nextUrl.searchParams.get('secret')
  const validBearer = auth === `Bearer ${process.env.CRON_SECRET}`
  const validQuery = secret === process.env.CRON_SECRET
  if (!validBearer && !validQuery) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const breakdown = (req.nextUrl.searchParams.get('breakdown') ?? 'daily') as TimeBreakdown
  const date = req.nextUrl.searchParams.get('date') ?? todayStr()

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook?jobId={JOBID}&jobStatus={JOBSTATUS}&secret=${process.env.CRON_SECRET}`

  try {
    // Don't create a new job if one already exists for this date+breakdown
    const existing = await sql`
      SELECT job_id FROM report_jobs
      WHERE breakdown = ${breakdown} AND date_from = ${date} AND date_to = ${date}
      LIMIT 1
    `
    if (existing.length > 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'already exists', jobId: existing[0].job_id, breakdown, date })
    }

    const { jobId } = await requestReport(date, date, breakdown, webhookUrl)

    await sql`
      INSERT INTO report_jobs (job_id, status, breakdown, date_from, date_to)
      VALUES (${jobId}, 'QUEUED', ${breakdown}, ${date}, ${date})
    `

    return NextResponse.json({ ok: true, jobId, breakdown, date })
  } catch (err) {
    console.error('request-report error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
