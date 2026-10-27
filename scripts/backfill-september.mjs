// Backfill missing ENKI daily data for September 2026.
// Run: node scripts/backfill-september.mjs
//
// This script:
// 1. Cleans up all stale QUEUED/RUNNING jobs (marks as EXPIRED)
// 2. For each missing daily date, requests a report from ENKI
// 3. Polls until SUCCESS, then downloads and inserts data
// 4. Processes one date at a time to avoid overloading ENKI

import postgres from 'postgres'
import crypto from 'crypto'
import { gunzipSync } from 'zlib'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set. Run with: source .env.local && node scripts/backfill-september.mjs')
  process.exit(1)
}

const sql = postgres(DATABASE_URL, { ssl: 'require' })

// ENKI config
const CLIENT_CODE = process.env.ENKI_CLIENT_CODE
const SECRET = process.env.ENKI_SECRET
const CONFIG_ID = process.env.ENKI_CONFIG_ID
const MARKET = 'us'
const SERVICE = 'reports'
const BASE = 'https://www.enkiads.com/ws/v1'

function getToken(timestamp) {
  const string = [SERVICE, MARKET, CONFIG_ID, timestamp, 'ws', 'v1'].join('|')
  const hmac = crypto.createHmac('sha256', SECRET)
  hmac.update(string)
  return `${CLIENT_CODE}:${hmac.digest('base64')}`
}

async function enkiFetch(params) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const token = getToken(timestamp)
  const url = new URL(`${BASE}/${CLIENT_CODE}/${MARKET}/${SERVICE}/${CONFIG_ID}/${timestamp}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`ENKI API ${res.status}: ${await res.text()}`)
  return res.json()
}

async function requestReport(date) {
  const data = await enkiFetch({
    f: 'requestReport', service: 'yads', time_breakdown: 'daily',
    date_from: date, date_to: date,
  })
  return data.data.jobId
}

async function getJobStatus(jobId) {
  const data = await enkiFetch({ f: 'getJobStatus', jobId: String(jobId) })
  const d = data.data
  return { status: d.status, downloadLink: d.response?.download_link, records: d.response?.records }
}

async function downloadReport(downloadLink) {
  const res = await fetch(downloadLink)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  let text
  try { text = gunzipSync(buffer).toString('utf-8') } catch { text = buffer.toString('utf-8') }
  text = text.replace(/^\uFEFF/, '')
  const trimmed = text.trimStart()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const arr = Array.isArray(JSON.parse(trimmed)) ? JSON.parse(trimmed) : [JSON.parse(trimmed)]
    return arr.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v ?? '')])))
  }
  // CSV
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',')
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(',')
    const row = {}
    headers.forEach((h, i) => row[h.trim()] = (vals[i] ?? '').trim())
    return row
  })
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log('=== Step 1: Clean up stale QUEUED/RUNNING jobs ===')
  const expired = await sql`
    UPDATE report_jobs SET status = 'EXPIRED', updated_at = NOW()
    WHERE status IN ('QUEUED', 'RUNNING')
    RETURNING job_id, breakdown, date_from::text
  `
  console.log(`Expired ${expired.length} stale jobs`)

  console.log('\n=== Step 2: Find missing daily dates in September ===')
  // Check Sep 1-24 (yesterday is Sep 24)
  const checkEnd = 24
  const missingDates = []
  for (let d = 1; d <= checkEnd; d++) {
    const date = `2026-09-${String(d).padStart(2, '0')}`
    const [has] = await sql`
      SELECT 1 FROM report_data
      WHERE provider = 'enki' AND breakdown = 'daily' AND report_date = ${date}
      LIMIT 1
    `
    if (!has) missingDates.push(date)
  }

  if (missingDates.length === 0) {
    console.log('No missing dates! All good.')
    await sql.end()
    return
  }
  console.log(`Missing: ${missingDates.join(', ')}`)

  console.log('\n=== Step 3: Backfill each date ===')
  for (const date of missingDates) {
    console.log(`\n--- ${date} ---`)

    // Check if there's a recent job we can reuse (e.g. from a previous failed run)
    const [recentJob] = await sql`
      SELECT job_id FROM report_jobs
      WHERE breakdown = 'daily' AND date_from = ${date}
        AND created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC LIMIT 1
    `

    let jobId
    if (recentJob) {
      jobId = recentJob.job_id
      console.log(`Reusing recent job ${jobId}`)
      const check = await getJobStatus(jobId)
      if (check.status === 'SUCCESS' && check.downloadLink) {
        console.log(`  Already SUCCESS, downloading directly`)
        var result = check
      }
    }

    if (!jobId || !result) {
      // Request new report
      try {
        jobId = await requestReport(date)
        console.log(`Requested new job ${jobId}`)
      } catch (e) {
        console.error(`Failed to request: ${e.message}`)
        continue
      }

      await sql`
        INSERT INTO report_jobs (job_id, status, breakdown, date_from, date_to)
        VALUES (${jobId}, 'QUEUED', 'daily', ${date}, ${date})
        ON CONFLICT (job_id) DO UPDATE SET status = 'QUEUED', updated_at = NOW()
      `

      // Poll until done (max 10 min per job)
      const maxWait = 10 * 60 * 1000
      const start = Date.now()

      while (Date.now() - start < maxWait) {
        await sleep(30000)
        var result = await getJobStatus(jobId)
        console.log(`  Status: ${result.status}`)
        if (result.status === 'SUCCESS') break
        if (result.status === 'FAILED') break
      }
    }

    if (!result || result.status !== 'SUCCESS' || !result.downloadLink) {
      console.error(`  Job ${jobId} did not complete (${result?.status})`)
      await sql`UPDATE report_jobs SET status = 'FAILED', updated_at = NOW() WHERE job_id = ${jobId}`
      continue
    }

    // Download and insert
    const rows = await downloadReport(result.downloadLink)
    console.log(`  Downloaded ${rows.length} rows`)

    if (rows.length > 0) {
      const toInsert = rows.map(row => ({
        job_id: jobId, breakdown: 'daily',
        config_name: row.config_name || null,
        report_date: row.date || date,
        report_hour: null,
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

      await sql`DELETE FROM report_data WHERE provider = 'enki' AND breakdown = 'daily' AND report_date = ${date}`
      // Insert in batches of 500 to avoid parameter limit
      for (let i = 0; i < toInsert.length; i += 500) {
        const batch = toInsert.slice(i, i + 500)
        await sql`INSERT INTO report_data ${sql(batch)}`
      }
      await sql`UPDATE report_jobs SET status = 'SUCCESS', records = ${rows.length}, updated_at = NOW() WHERE job_id = ${jobId}`
      console.log(`  ✓ Inserted ${rows.length} rows for ${date}`)
    }

    // Small delay between dates to be nice to ENKI
    await sleep(5000)
  }

  console.log('\n=== Done! ===')
  await sql.end()
}

main().catch(e => { console.error(e); process.exit(1) })
