import { NextRequest, NextResponse } from 'next/server'
import { getJobStatus } from '@/lib/enki'
import { processJob } from '@/app/api/webhook/route'
import sql from '@/lib/db'

// Development sync endpoint — polls pending jobs only.
// Does NOT request new reports (use /api/cron/enki for that).
export async function GET(req: NextRequest) {
  const log: string[] = []

  // Poll pending jobs and process completed ones
  const pendingJobs = await sql`
    SELECT job_id, breakdown, created_at FROM report_jobs
    WHERE status IN ('QUEUED', 'RUNNING')
    ORDER BY created_at ASC
    LIMIT 10
  `

  for (const job of pendingJobs) {
    try {
      const ageMs = Date.now() - new Date(job.created_at).getTime()
      if (ageMs > 3 * 60 * 60 * 1000) {
        await sql`UPDATE report_jobs SET status = 'EXPIRED', updated_at = NOW() WHERE job_id = ${job.job_id}`
        log.push(`expired stale job ${job.job_id}`)
        continue
      }

      const jobData = await getJobStatus(job.job_id)
      if (jobData.status === 'SUCCESS' && jobData.downloadLink) {
        await processJob(job.job_id)
        log.push(`processed job ${job.job_id}`)
      } else if (jobData.status === 'FAILED' || (jobData.status === 'SUCCESS' && !jobData.downloadLink)) {
        await sql`UPDATE report_jobs SET status = 'FAILED', updated_at = NOW() WHERE job_id = ${job.job_id}`
        log.push(`job ${job.job_id} → FAILED`)
      } else {
        log.push(`job ${job.job_id} still ${jobData.status}`)
      }
    } catch (e) {
      log.push(`error job ${job.job_id}: ${String(e)}`)
    }
  }

  return NextResponse.json({ ok: true, log })
}
