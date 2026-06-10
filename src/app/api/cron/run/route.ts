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
  const envSecret = (process.env.CRON_SECRET ?? 'bidberry2026').trim()
  const validBearer = auth === `Bearer ${envSecret}`
  const validQuery = (secret ?? '').trim() === envSecret
  if (!validBearer && !validQuery) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const log: string[] = []

  // Step 1: process pending/running jobs created in the last 7 days only
  // (older jobs with expired download links would clog the queue forever)
  const pendingJobs = await sql`
    SELECT job_id FROM report_jobs
    WHERE status IN ('QUEUED', 'RUNNING')
      AND created_at >= NOW() - INTERVAL '7 days'
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

        if (toInsert.length > 0) {
          await sql`DELETE FROM report_data WHERE job_id = ${job.job_id}`
          await sql`INSERT INTO report_data ${sql(toInsert)}`
        }

        await sql`UPDATE report_jobs SET status = 'SUCCESS', records = ${rows.length}, updated_at = NOW() WHERE job_id = ${job.job_id}`
        log.push(`processed job ${job.job_id}: ${rows.length} rows`)
      } else if (jobData.status === 'FAILED') {
        await sql`UPDATE report_jobs SET status = 'FAILED', updated_at = NOW() WHERE job_id = ${job.job_id}`
        log.push(`job ${job.job_id} failed`)
      } else if (jobData.status === 'SUCCESS' && !jobData.downloadLink) {
        // Link expired — mark stale so it doesn't block the queue
        await sql`UPDATE report_jobs SET status = 'FAILED', updated_at = NOW() WHERE job_id = ${job.job_id}`
        log.push(`job ${job.job_id} SUCCESS but link expired, marked FAILED`)
      } else {
        log.push(`job ${job.job_id} still ${jobData.status}`)
      }
    } catch (e) {
      log.push(`error on job ${job.job_id}: ${String(e)}`)
    }
  }

  // Step 2: request new hourly report for the given date (default: today)
  const date = req.nextUrl.searchParams.get('date') ?? todayStr()
  const existing = await sql`
    SELECT job_id, status FROM report_jobs
    WHERE breakdown = 'hourly' AND date_from = ${date} AND date_to = ${date}
    ORDER BY created_at DESC
    LIMIT 1
  `

  let newJobId: number | null = null
  const hasActiveJob = existing.some((j) => (j.status as string) === 'QUEUED' || (j.status as string) === 'RUNNING')

  if (existing.length === 0 || (!hasActiveJob)) {
    try {
      const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook?jobId={JOBID}&jobStatus={JOBSTATUS}&secret=${process.env.CRON_SECRET}`
      const { jobId } = await requestReport(date, date, 'hourly', webhookUrl)
      await sql`
        INSERT INTO report_jobs (job_id, status, breakdown, date_from, date_to)
        VALUES (${jobId}, 'QUEUED', 'hourly', ${date}, ${date})
        ON CONFLICT (job_id) DO UPDATE SET status = 'QUEUED', updated_at = NOW()
      `
      newJobId = jobId
      log.push(`${existing.length === 0 ? 'requested' : 're-requested'} hourly job ${jobId} for ${date}`)
    } catch (e) {
      log.push(`error requesting report: ${String(e)}`)
    }
  } else {
    log.push(`hourly job for ${date} already active (${existing[0].job_id}), skipping re-request`)
  }

  return NextResponse.json({ ok: true, date, newJobId, log })
}
