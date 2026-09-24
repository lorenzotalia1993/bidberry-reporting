import { NextRequest, NextResponse } from 'next/server'
import { getJobStatus, requestReport } from '@/lib/enki'
import { processJob } from '@/app/api/webhook/route'
import sql from '@/lib/db'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function yesterdayStr() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

// GET /api/cron/enki?secret=...
// Single endpoint called every hour by cronjob.org.
// Minimizes ENKI API calls: daily data downloaded ONCE (immutable), hourly only when stale.
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  const envSecret = (process.env.CRON_SECRET ?? 'bidberry2026').trim()
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${envSecret}` && (secret ?? '').trim() !== envSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const log: string[] = []
  const today = todayStr()
  const yesterday = yesterdayStr()

  // ─── Phase 1: Poll pending jobs (getJobStatus is lightweight) ───
  const pendingJobs = await sql`
    SELECT job_id, breakdown, created_at FROM report_jobs
    WHERE status IN ('QUEUED', 'RUNNING')
    ORDER BY created_at ASC
    LIMIT 10
  `

  for (const job of pendingJobs) {
    const ageMs = Date.now() - new Date(job.created_at).getTime()
    const ageH = ageMs / (1000 * 60 * 60)

    // Auto-expire jobs stuck for more than 3 hours
    if (ageH > 3) {
      await sql`UPDATE report_jobs SET status = 'EXPIRED', updated_at = NOW() WHERE job_id = ${job.job_id}`
      log.push(`expired stale job ${job.job_id} (${Math.round(ageH)}h old)`)
      continue
    }

    try {
      const jobData = await getJobStatus(job.job_id)

      if (jobData.status === 'SUCCESS' && jobData.downloadLink) {
        await processJob(job.job_id)
        log.push(`downloaded job ${job.job_id} (${job.breakdown})`)
      } else if (jobData.status === 'SUCCESS' && !jobData.downloadLink) {
        await sql`UPDATE report_jobs SET status = 'FAILED', updated_at = NOW() WHERE job_id = ${job.job_id}`
        log.push(`job ${job.job_id} SUCCESS but link expired → FAILED`)
      } else if (jobData.status === 'FAILED') {
        await sql`UPDATE report_jobs SET status = 'FAILED', updated_at = NOW() WHERE job_id = ${job.job_id}`
        log.push(`job ${job.job_id} FAILED`)
      } else {
        log.push(`job ${job.job_id} still ${jobData.status} (${Math.round(ageH * 60)}min)`)
      }
    } catch (e) {
      log.push(`error polling job ${job.job_id}: ${String(e)}`)
    }
  }

  // ─── Phase 2: Daily report for yesterday (IMMUTABLE — request only once) ───
  const [hasDaily] = await sql`
    SELECT 1 FROM report_data
    WHERE provider = 'enki' AND breakdown = 'daily' AND report_date = ${yesterday}
    LIMIT 1
  `

  if (hasDaily) {
    log.push(`daily ${yesterday}: already in DB, skipping`)
  } else {
    // Check if there's an active job already
    const [activeDaily] = await sql`
      SELECT job_id, status FROM report_jobs
      WHERE breakdown = 'daily' AND date_from = ${yesterday}
        AND status IN ('QUEUED', 'RUNNING')
      LIMIT 1
    `

    if (activeDaily) {
      log.push(`daily ${yesterday}: job ${activeDaily.job_id} still ${activeDaily.status}, waiting`)
    } else {
      // Check if we already tried and failed — retry once
      const [failedDaily] = await sql`
        SELECT COUNT(*)::int AS cnt FROM report_jobs
        WHERE breakdown = 'daily' AND date_from = ${yesterday}
          AND status IN ('FAILED', 'EXPIRED')
      `
      const retries = failedDaily?.cnt ?? 0

      if (retries >= 2) {
        log.push(`daily ${yesterday}: already failed ${retries}x, not retrying`)
      } else {
        try {
          const { jobId } = await requestReport(yesterday, yesterday, 'daily')
          await sql`
            INSERT INTO report_jobs (job_id, status, breakdown, date_from, date_to)
            VALUES (${jobId}, 'QUEUED', 'daily', ${yesterday}, ${yesterday})
            ON CONFLICT (job_id) DO UPDATE SET status = 'QUEUED', updated_at = NOW()
          `
          log.push(`daily ${yesterday}: requested job ${jobId}`)
        } catch (e) {
          log.push(`daily ${yesterday}: request error — ${String(e)}`)
        }
      }
    }
  }

  // ─── Phase 3: Hourly report for today (re-request only if stale >1h) ───
  const [activeHourly] = await sql`
    SELECT job_id FROM report_jobs
    WHERE breakdown = 'hourly' AND date_from = ${today}
      AND status IN ('QUEUED', 'RUNNING')
    LIMIT 1
  `

  if (activeHourly) {
    log.push(`hourly ${today}: job ${activeHourly.job_id} still active, waiting`)
  } else {
    // Check when the last successful hourly data was inserted
    const [lastSuccess] = await sql`
      SELECT updated_at FROM report_jobs
      WHERE breakdown = 'hourly' AND date_from = ${today} AND status = 'SUCCESS'
      ORDER BY updated_at DESC
      LIMIT 1
    `

    const lastAge = lastSuccess
      ? (Date.now() - new Date(lastSuccess.updated_at).getTime()) / (1000 * 60)
      : Infinity

    if (lastAge < 55) {
      log.push(`hourly ${today}: last update ${Math.round(lastAge)}min ago, still fresh`)
    } else {
      try {
        const { jobId } = await requestReport(today, today, 'hourly')
        await sql`
          INSERT INTO report_jobs (job_id, status, breakdown, date_from, date_to)
          VALUES (${jobId}, 'QUEUED', 'hourly', ${today}, ${today})
          ON CONFLICT (job_id) DO UPDATE SET status = 'QUEUED', updated_at = NOW()
        `
        log.push(`hourly ${today}: requested job ${jobId}`)
      } catch (e) {
        log.push(`hourly ${today}: request error — ${String(e)}`)
      }
    }
  }

  return NextResponse.json({ ok: true, today, yesterday, log })
}
