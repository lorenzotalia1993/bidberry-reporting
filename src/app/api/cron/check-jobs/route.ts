import { NextRequest, NextResponse } from 'next/server'
import { getJobStatus } from '@/lib/enki'
import sql from '@/lib/db'
import { processJob } from '@/app/api/webhook/route'

// GET /api/cron/check-jobs?secret=...
// Fallback poller: checks all QUEUED/RUNNING jobs and processes SUCCESS ones
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const secret = req.nextUrl.searchParams.get('secret')
  const validBearer = auth === `Bearer ${process.env.CRON_SECRET}`
  const validQuery = secret === process.env.CRON_SECRET
  if (!validBearer && !validQuery) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pendingJobs = await sql`
    SELECT job_id, status FROM report_jobs
    WHERE status IN ('QUEUED', 'RUNNING')
    ORDER BY created_at ASC
    LIMIT 20
  `

  if (pendingJobs.length === 0) {
    return NextResponse.json({ ok: true, checked: 0 })
  }

  const results = await Promise.allSettled(
    pendingJobs.map(async (job) => {
      const { status } = await getJobStatus(job.job_id)

      if (status === 'SUCCESS') {
        await processJob(job.job_id)
      } else {
        await sql`
          UPDATE report_jobs
          SET status = ${status}, updated_at = NOW()
          WHERE job_id = ${job.job_id}
        `
      }

      return { jobId: job.job_id, status }
    })
  )

  return NextResponse.json({ ok: true, checked: pendingJobs.length, results })
}
