import { NextRequest, NextResponse } from 'next/server'
import { getJobStatus, requestReport } from '@/lib/enki'
import { processJob } from '@/app/api/webhook/route'
import { fetchNexifyDaily } from '@/lib/nexify'
import sql from '@/lib/db'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function yesterdayStr() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

// Unified sync endpoint — called by the browser every 2 minutes in dev.
// 1. Processes all pending/running jobs (check status → download if SUCCESS)
// 2. Requests new hourly report for today if none active
// 3. Requests new daily report for today if none active
export async function GET(req: NextRequest) {
  const log: string[] = []
  const date = req.nextUrl.searchParams.get('date') ?? todayStr()

  // ── Step 1: process pending jobs ──────────────────────────────
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
        await processJob(job.job_id)
        log.push(`processed job ${job.job_id}`)
      } else if (jobData.status === 'FAILED') {
        await sql`UPDATE report_jobs SET status = 'FAILED', updated_at = NOW() WHERE job_id = ${job.job_id}`
        log.push(`job ${job.job_id} failed`)
      } else if (jobData.status === 'SUCCESS' && !jobData.downloadLink) {
        await sql`UPDATE report_jobs SET status = 'FAILED', updated_at = NOW() WHERE job_id = ${job.job_id}`
        log.push(`job ${job.job_id} link expired`)
      } else {
        // If still QUEUED/RUNNING for more than 30 minutes, mark as stale so we re-request
        const [dbJob] = await sql`SELECT created_at FROM report_jobs WHERE job_id = ${job.job_id}`
        const ageMs = Date.now() - new Date(dbJob.created_at).getTime()
        if (ageMs > 30 * 60 * 1000) {
          await sql`UPDATE report_jobs SET status = 'FAILED', updated_at = NOW() WHERE job_id = ${job.job_id}`
          log.push(`job ${job.job_id} stale (${Math.round(ageMs / 60000)}min), marked FAILED`)
        } else {
          log.push(`job ${job.job_id} still ${jobData.status} (${Math.round(ageMs / 60000)}min)`)
        }
      }
    } catch (e) {
      log.push(`error job ${job.job_id}: ${String(e)}`)
    }
  }

  // ── Step 2: request missing reports for last 7 days ──────────────
  const webhookUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook?jobId={JOBID}&jobStatus={JOBSTATUS}&secret=${process.env.CRON_SECRET ?? 'bidberry2026'}`
    : undefined

  // ?force=YYYY-MM-DD[:hourly|:daily] — re-request even if already SUCCESS
  const forceParam = req.nextUrl.searchParams.get('force')
  const [forceDate, forceBreakdown] = forceParam ? forceParam.split(':') : [null, null]

  // Build list of dates: today + last 6 days
  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().split('T')[0])
  }

  for (const breakdown of ['hourly', 'daily'] as const) {
    for (const d of dates) {
      try {
        const isForced = forceDate === d && (!forceBreakdown || forceBreakdown === breakdown)

        const existing = await sql`
          SELECT job_id, status FROM report_jobs
          WHERE breakdown = ${breakdown} AND date_from = ${d} AND date_to = ${d}
          ORDER BY created_at DESC
          LIMIT 1
        `
        const hasActive = existing.some(j => j.status === 'QUEUED' || j.status === 'RUNNING')
        const hasSuccess = existing.some(j => j.status === 'SUCCESS')

        // Skip if already done, unless forced
        if ((hasSuccess || hasActive) && !isForced) {
          if (!hasActive) log.push(`${breakdown} ${d} already done (${existing[0]?.job_id})`)
          continue
        }

        if (isForced && hasActive) {
          log.push(`${breakdown} ${d} force skipped — job already active (${existing[0]?.job_id})`)
          continue
        }

        const { jobId } = await requestReport(d, d, breakdown, webhookUrl)
        await sql`
          INSERT INTO report_jobs (job_id, status, breakdown, date_from, date_to)
          VALUES (${jobId}, 'QUEUED', ${breakdown}, ${d}, ${d})
          ON CONFLICT (job_id) DO UPDATE SET status = 'QUEUED', updated_at = NOW()
        `
        log.push(`requested ${breakdown} job ${jobId} for ${d}`)
      } catch (e) {
        log.push(`error requesting ${breakdown} ${d}: ${String(e)}`)
      }
    }
  }

  // ── Step 3: fetch Nexify daily for yesterday if not already done ──
  try {
    const yesterday = yesterdayStr()
    const [nxFetch] = await sql`
      SELECT id FROM nexify_fetches WHERE date = ${yesterday} AND breakdown = 'daily'
    `
    if (!nxFetch) {
      const rows = await fetchNexifyDaily(yesterday)
      if (rows.length > 0) {
        const toInsert = rows.map((row) => ({
          job_id: null,
          provider: 'nexify',
          breakdown: 'daily',
          report_date: row.date || yesterday,
          report_hour: null,
          config_name: row.feed || null,
          domain: row.domain || null,
          market: row.market || null,
          device: row.device_type || null,
          ads_query: row.channel || null,
          source_type: row.source_type || null,
          tq_score: row.tq_score || null,
          coverage: row.coverage ?? null,
          ctr: row.ctr ?? null,
          revenue: row.net_revenue_usd ?? 0,
          amount_eur: row.net_revenue_eur ?? 0,
          clicks: row.bidded_clicks ?? 0,
          searches: row.searches ?? 0,
          bidded_searches: row.bidded_searches ?? 0,
          bidded_results: row.bidded_results ?? 0,
          placement: null,
          raw: JSON.parse(JSON.stringify(row)),
        }))
        await sql`DELETE FROM report_data WHERE provider = 'nexify' AND breakdown = 'daily' AND report_date = ${yesterday}`
        await sql`INSERT INTO report_data ${sql(toInsert)}`
        await sql`
          INSERT INTO nexify_fetches (date, breakdown, status, records)
          VALUES (${yesterday}, 'daily', 'SUCCESS', ${rows.length})
          ON CONFLICT (date, breakdown) DO UPDATE SET status = 'SUCCESS', records = ${rows.length}, fetched_at = NOW()
        `
        log.push(`nexify daily ${yesterday}: ${rows.length} rows inserted`)
      } else {
        log.push(`nexify daily ${yesterday}: 0 rows (not available yet)`)
      }
    } else {
      log.push(`nexify daily ${yesterday}: already fetched`)
    }
  } catch (e) {
    log.push(`nexify daily error: ${String(e)}`)
  }

  return NextResponse.json({ ok: true, date, log })
}
