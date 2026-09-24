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
  const [jobRow] = await sql`SELECT breakdown, date_from::text as date_from, date_to::text as date_to FROM report_jobs WHERE job_id = ${jobId}`
  const breakdown = jobRow?.breakdown ?? 'daily'
  const expectedDate = jobRow?.date_from // used for validation

  const jobData = await getJobStatus(jobId)
  if (jobData.status !== 'SUCCESS' || !jobData.downloadLink) return

  const rows = await downloadReport(jobData.downloadLink)

  const toInsert = rows.map((row) => ({
    job_id: jobId,
    breakdown,
    config_name: row.config_name || null,
    report_date: row.date || null,
    report_hour: breakdown === 'hourly' ? (row.hour != null && row.hour !== '' ? parseInt(row.hour, 10) : null) : null,
    revenue: parseFloat(row.amount_usd || '0') || 0,
    amount_eur: parseFloat(row.amount_eur || '0') || 0,
    clicks: parseInt(row.bidded_clicks || '0', 10) || 0,
    searches: parseInt(row.searches || '0', 10) || 0,
    bidded_searches: parseInt(row.bidded_searches || '0', 10) || 0,
    bidded_results: parseInt(row.bidded_results || '0', 10) || 0,
    ads_query: row.adsQuery || null,
    market: row.market || null,
    device: row.device || null,
    placement: row.placement || null,
    raw: row,
  }))

  // Filter to only rows matching the expected date range (guard against ENKI returning stale data)
  const filtered = expectedDate
    ? toInsert.filter(r => r.report_date === expectedDate)
    : toInsert

  if (filtered.length > 0) {
    const dates = [...new Set(filtered.map(r => r.report_date).filter(Boolean))]
    if (dates.length > 0) {
      await sql`DELETE FROM report_data WHERE provider = 'enki' AND breakdown = ${breakdown} AND report_date = ANY(${dates})`
    }
    // Insert in batches of 500 to avoid Postgres parameter limit (65534)
    for (let i = 0; i < filtered.length; i += 500) {
      await sql`INSERT INTO report_data ${sql(filtered.slice(i, i + 500))}`
    }
  }

  await sql`
    UPDATE report_jobs
    SET status = 'SUCCESS', records = ${filtered.length}, updated_at = NOW()
    WHERE job_id = ${jobId}
  `
}
