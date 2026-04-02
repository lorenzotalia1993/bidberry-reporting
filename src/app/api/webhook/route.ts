import { NextRequest, NextResponse } from 'next/server'
import { getJobStatus, downloadReport } from '@/lib/enki'
import sql from '@/lib/db'

// GET /api/webhook?jobId=...&jobStatus=...&secret=...
// Called by ENKI when a job completes
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const secret = searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const jobId = Number(searchParams.get('jobId'))
  const jobStatus = searchParams.get('jobStatus')

  if (!jobId || jobStatus !== 'SUCCESS') {
    if (jobId && jobStatus) {
      await sql`
        UPDATE report_jobs SET status = ${jobStatus}, updated_at = NOW()
        WHERE job_id = ${jobId}
      `
    }
    return NextResponse.json({ ok: true, skipped: true })
  }

  await processJob(jobId)
  return NextResponse.json({ ok: true, jobId })
}

export async function processJob(jobId: number) {
  const [jobRow] = await sql`SELECT breakdown FROM report_jobs WHERE job_id = ${jobId}`
  const breakdown = jobRow?.breakdown ?? 'daily'

  const jobData = await getJobStatus(jobId)
  if (jobData.status !== 'SUCCESS' || !jobData.downloadLink) return

  const rows = await downloadReport(jobData.downloadLink)

  const toInsert = rows.map((row) => ({
    job_id: jobId,
    breakdown,
    config_name: row.config_name || null,
    report_date: row.date || null,
    report_hour: breakdown === 'hourly' ? (parseInt(row.hour || '0', 10) || null) : null,
    revenue: parseFloat(row.amount_usd || '0') || 0,
    amount_eur: parseFloat(row.amount_eur || '0') || 0,
    clicks: parseInt(row.bidded_clicks || '0', 10) || 0,
    searches: parseInt(row.searches || '0', 10) || 0,
    bidded_searches: parseInt(row.bidded_searches || '0', 10) || 0,
    bidded_results: parseInt(row.bidded_results || '0', 10) || 0,
    ads_query: row.adsQuery || null,
    market: row.market || null,
    device: row.device || null,
    raw: row,
  }))

  if (toInsert.length > 0) {
    await sql`INSERT INTO report_data ${sql(toInsert)}`
  }

  await sql`
    UPDATE report_jobs
    SET status = 'SUCCESS', records = ${rows.length}, updated_at = NOW()
    WHERE job_id = ${jobId}
  `
}
