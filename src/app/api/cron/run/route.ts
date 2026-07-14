import { NextRequest, NextResponse } from 'next/server'
import { getJobStatus, requestReport } from '@/lib/enki'
import { downloadReport } from '@/lib/enki'
import sql from '@/lib/db'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function yesterdayStr() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
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

  // Step 2: request hourly report for the given date (default: today)
  // Supports date=yesterday as a keyword so cronjob.org can use a static URL
  const rawDate = req.nextUrl.searchParams.get('date') ?? 'today'
  const date = rawDate === 'yesterday' ? yesterdayStr() : rawDate === 'today' ? todayStr() : rawDate

  const [existing] = await sql`
    SELECT job_id, status,
           (created_at::date > date_from::date) AS is_next_day
    FROM report_jobs
    WHERE breakdown = 'hourly' AND date_from = ${date} AND date_to = ${date}
    ORDER BY created_at DESC
    LIMIT 1
  `

  let newJobId: number | null = null
  const status = existing?.status as string | undefined
  const isActive = status === 'QUEUED' || status === 'RUNNING'
  // A SUCCESS job is "complete" only if it was created the day after the report date
  // (meaning it captured the full day). Same-day SUCCESS = intraday snapshot.
  const isCompleteSuccess = status === 'SUCCESS' && existing?.is_next_day

  if (!existing || (!isActive && !isCompleteSuccess)) {
    try {
      const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook?jobId={JOBID}&jobStatus={JOBSTATUS}&secret=${process.env.CRON_SECRET}`
      const { jobId } = await requestReport(date, date, 'hourly', webhookUrl)
      await sql`
        INSERT INTO report_jobs (job_id, status, breakdown, date_from, date_to)
        VALUES (${jobId}, 'QUEUED', 'hourly', ${date}, ${date})
        ON CONFLICT (job_id) DO UPDATE SET status = 'QUEUED', updated_at = NOW()
      `
      newJobId = jobId
      const reason = !existing ? 'no job' : `prev job ${existing.job_id} was ${status}${status === 'SUCCESS' ? ' (intraday)' : ''}`
      log.push(`requested hourly job ${jobId} for ${date} (${reason})`)
    } catch (e) {
      log.push(`error requesting report: ${String(e)}`)
    }
  } else if (isActive) {
    log.push(`hourly ${date} already active (${existing.job_id}), skipping`)
  } else {
    log.push(`hourly ${date} already complete (${existing.job_id}, ${existing.is_next_day ? 'full day' : 'same day'}), skipping`)
  }

  // Step 3: request daily report for yesterday (data is final once the day ends)
  const yesterday = yesterdayStr()
  const [existingDaily] = await sql`
    SELECT job_id, status FROM report_jobs
    WHERE breakdown = 'daily' AND date_from = ${yesterday} AND date_to = ${yesterday}
    ORDER BY created_at DESC
    LIMIT 1
  `
  const dailyStatus = existingDaily?.status as string | undefined
  if (!existingDaily || (dailyStatus !== 'QUEUED' && dailyStatus !== 'RUNNING' && dailyStatus !== 'SUCCESS')) {
    try {
      const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook?jobId={JOBID}&jobStatus={JOBSTATUS}&secret=${process.env.CRON_SECRET}`
      const { jobId: dailyJobId } = await requestReport(yesterday, yesterday, 'daily', webhookUrl)
      await sql`
        INSERT INTO report_jobs (job_id, status, breakdown, date_from, date_to)
        VALUES (${dailyJobId}, 'QUEUED', 'daily', ${yesterday}, ${yesterday})
        ON CONFLICT (job_id) DO UPDATE SET status = 'QUEUED', updated_at = NOW()
      `
      log.push(`requested daily job ${dailyJobId} for ${yesterday}`)
    } catch (e) {
      log.push(`error requesting daily report: ${String(e)}`)
    }
  } else {
    log.push(`daily ${yesterday} already ${dailyStatus} (${existingDaily.job_id}), skipping`)
  }

  return NextResponse.json({ ok: true, date, newJobId, log })
}
