import { NextRequest, NextResponse } from 'next/server'
import { getJobStatus, requestReport } from '@/lib/enki'
import { downloadReport } from '@/lib/enki'
import sql from '@/lib/db'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

// Single endpoint: process pending jobs first, then request a new hourly report
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const secret = req.nextUrl.searchParams.get('secret')
  const validBearer = auth === `Bearer ${process.env.CRON_SECRET}`
  const validQuery = secret === process.env.CRON_SECRET
  if (!validBearer && !validQuery) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const log: string[] = []

  // Step 1: process any pending/running jobs
  const pendingJobs = await sql`
    SELECT job_id FROM report_jobs
    WHERE status IN ('QUEUED', 'RUNNING')
    ORDER BY created_at ASC
    LIMIT 20
  `

  for (const job of pendingJobs) {
    try {
      const jobData = await getJobStatus(job.job_id)
      if (jobData.status === 'SUCCESS' && jobData.downloadLink) {
        const rows = await downloadReport(jobData.downloadLink)
        const [jobRow] = await sql`SELECT breakdown FROM report_jobs WHERE job_id = ${job.job_id}`
        const breakdown = jobRow?.breakdown ?? 'daily'

        const toInsert = rows.map((row) => ({
          job_id: job.job_id, breakdown,
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
          placement: row.placement || null,
          raw: row,
        }))

        if (toInsert.length > 0) {
          const dates = [...new Set(toInsert.map(r => r.report_date).filter(Boolean))]
          if (dates.length > 0) {
            await sql`DELETE FROM report_data WHERE breakdown = ${breakdown} AND report_date = ANY(${dates})`
          }
          await sql`INSERT INTO report_data ${sql(toInsert)}`
        }

        await sql`UPDATE report_jobs SET status = 'SUCCESS', records = ${rows.length}, updated_at = NOW() WHERE job_id = ${job.job_id}`
        log.push(`processed job ${job.job_id}: ${rows.length} rows`)
      } else if (jobData.status === 'FAILED') {
        await sql`UPDATE report_jobs SET status = 'FAILED', updated_at = NOW() WHERE job_id = ${job.job_id}`
        log.push(`job ${job.job_id} failed`)
      } else {
        log.push(`job ${job.job_id} still ${jobData.status}`)
      }
    } catch (e) {
      log.push(`error on job ${job.job_id}: ${String(e)}`)
    }
  }

  // Step 2: request new hourly report if not already done today
  const date = todayStr()
  const existing = await sql`
    SELECT job_id FROM report_jobs
    WHERE breakdown = 'hourly' AND date_from = ${date} AND date_to = ${date}
    LIMIT 1
  `

  let newJobId: number | null = null
  if (existing.length === 0) {
    try {
      const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook?jobId={JOBID}&jobStatus={JOBSTATUS}&secret=${process.env.CRON_SECRET}`
      const { jobId } = await requestReport(date, date, 'hourly', webhookUrl)
      await sql`INSERT INTO report_jobs (job_id, status, breakdown, date_from, date_to) VALUES (${jobId}, 'QUEUED', 'hourly', ${date}, ${date})`
      newJobId = jobId
      log.push(`requested new hourly job ${jobId} for ${date}`)
    } catch (e) {
      log.push(`error requesting report: ${String(e)}`)
    }
  } else {
    // Re-request to get updated hourly data (overwrite existing)
    try {
      const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook?jobId={JOBID}&jobStatus={JOBSTATUS}&secret=${process.env.CRON_SECRET}`
      const { jobId } = await requestReport(date, date, 'hourly', webhookUrl)
      await sql`INSERT INTO report_jobs (job_id, status, breakdown, date_from, date_to) VALUES (${jobId}, 'QUEUED', 'hourly', ${date}, ${date})`
      newJobId = jobId
      log.push(`re-requested hourly job ${jobId} for ${date} (update)`)
    } catch (e) {
      log.push(`error re-requesting report: ${String(e)}`)
    }
  }

  return NextResponse.json({ ok: true, date, newJobId, log })
}
