/**
 * Backfill daily reports for July 2026 — both ENKI and Nexify
 * Run: node scripts/backfill-july-daily.mjs
 */

import crypto from 'crypto'
import { gunzipSync } from 'zlib'
import postgres from 'postgres'

const DB_URL = 'postgresql://neondb_owner:npg_U3mNRSoM8qeO@ep-super-cherry-an833n71.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require'
const sql = postgres(DB_URL, { ssl: 'require' })

// ── Dates to backfill ─────────────────────────────────────────────
// July 1–13 (today is July 14, so yesterday is July 13)
const DATES = []
for (let d = 1; d <= 13; d++) {
  DATES.push(`2026-07-${String(d).padStart(2, '0')}`)
}

// ── ENKI ─────────────────────────────────────────────────────────
const ENKI_CLIENT_CODE = '7811574897'
const ENKI_SECRET = 'heEMF07Hj2vmSRUr+a1VWldspU12d88L/+HpWstqfcg='
const ENKI_CONFIG_ID = '762'
const ENKI_MARKET = 'us'
const ENKI_SERVICE = 'reports'
const ENKI_BASE = 'https://www.enkiads.com/ws/v1'

function enkiToken(timestamp) {
  const string = [ENKI_SERVICE, ENKI_MARKET, ENKI_CONFIG_ID, timestamp, 'ws', 'v1'].join('|')
  const hmac = crypto.createHmac('sha256', ENKI_SECRET)
  hmac.update(string)
  return `${ENKI_CLIENT_CODE}:${hmac.digest('base64')}`
}

async function enkiFetch(params) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const url = new URL(`${ENKI_BASE}/${ENKI_CLIENT_CODE}/${ENKI_MARKET}/${ENKI_SERVICE}/${ENKI_CONFIG_ID}/${timestamp}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${enkiToken(timestamp)}` } })
  if (!res.ok) throw new Error(`ENKI ${res.status}: ${await res.text()}`)
  return res.json()
}

async function enkiRequestReport(date) {
  const data = await enkiFetch({ f: 'requestReport', service: 'yads', time_breakdown: 'daily', date_from: date, date_to: date })
  return data.data.jobId
}

async function enkiGetJobStatus(jobId) {
  const data = await enkiFetch({ f: 'getJobStatus', jobId: String(jobId) })
  const d = data.data
  return { status: d.status, downloadLink: d.response?.download_link }
}

function parseCsv(text) {
  const stripped = text.replace(/^\uFEFF/, '')
  const lines = stripped.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (lines.length < 2) return []
  const headers = splitCsvLine(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i])
    if (!values.length) continue
    const row = {}
    headers.forEach((h, idx) => { row[h] = values[idx] ?? '' })
    rows.push(row)
  }
  return rows
}

function splitCsvLine(line) {
  const fields = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      fields.push(current); current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

async function enkiDownload(downloadLink) {
  const res = await fetch(downloadLink)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  let text
  try { text = gunzipSync(buffer).toString('utf-8') } catch { text = buffer.toString('utf-8') }
  text = text.replace(/^\uFEFF/, '')
  const trimmed = text.trimStart()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const json = JSON.parse(trimmed)
    const arr = Array.isArray(json) ? json : [json]
    return arr.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')])))
  }
  return parseCsv(text)
}

// ── Nexify ────────────────────────────────────────────────────────
const NX_CLIENT_ID = '0000277'
const NX_TS = '1751292375'
const NX_HASH = '9d3679f7bfff9e9af079c2eee57bb24d'
const NX_BASE = 'https://api.nexify.io/v1/reports/nexify'

async function nexifyFetchDaily(date) {
  const url = `${NX_BASE}/yahoo_daily?client_id=${NX_CLIENT_ID}&ts=${NX_TS}&hash=${NX_HASH}&date=${date}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Nexify ${res.status}: ${await res.text()}`)
  return res.json()
}

// ── Main ─────────────────────────────────────────────────────────
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log(`Backfilling ${DATES.length} dates: ${DATES[0]} → ${DATES[DATES.length - 1]}\n`)

  // ── ENKI: check which dates already have SUCCESS ──────────────
  const existingEnki = await sql`
    SELECT date_from, status FROM report_jobs
    WHERE breakdown = 'daily'
      AND date_from = ANY(${DATES})
      AND status = 'SUCCESS'
  `
  const doneEnki = new Set(existingEnki.map(r => {
    const d = r.date_from
    if (d instanceof Date) return d.toISOString().slice(0, 10)
    return String(d).slice(0, 10)
  }))
  console.log(`ENKI: ${doneEnki.size} dates already done, ${DATES.length - doneEnki.size} to request`)

  // ── ENKI: request missing daily jobs ─────────────────────────
  const enkiJobs = [] // { date, jobId }
  for (const date of DATES) {
    if (doneEnki.has(date)) { console.log(`  [ENKI] ${date} — already SUCCESS, skip`); continue }
    try {
      const jobId = await enkiRequestReport(date)
      await sql`
        INSERT INTO report_jobs (job_id, status, breakdown, date_from, date_to)
        VALUES (${jobId}, 'QUEUED', 'daily', ${date}, ${date})
        ON CONFLICT (job_id) DO UPDATE SET status = 'QUEUED', updated_at = NOW()
      `
      enkiJobs.push({ date, jobId })
      console.log(`  [ENKI] ${date} — job ${jobId} requested`)
    } catch (e) {
      console.error(`  [ENKI] ${date} — error requesting: ${e.message}`)
    }
    await sleep(300)
  }

  // ── ENKI: poll until all jobs are done ───────────────────────
  if (enkiJobs.length > 0) {
    console.log(`\nPolling ${enkiJobs.length} ENKI jobs...`)
    const pending = [...enkiJobs]
    let attempts = 0
    while (pending.length > 0 && attempts < 60) {
      await sleep(5000)
      attempts++
      for (let i = pending.length - 1; i >= 0; i--) {
        const { date, jobId } = pending[i]
        try {
          const { status, downloadLink } = await enkiGetJobStatus(jobId)
          if (status === 'SUCCESS' && downloadLink) {
            const rows = await enkiDownload(downloadLink)
            const toInsert = rows.map(row => ({
              job_id: jobId,
              provider: 'enki',
              breakdown: 'daily',
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
            if (toInsert.length > 0) {
              await sql`DELETE FROM report_data WHERE provider = 'enki' AND breakdown = 'daily' AND report_date = ${date}`
              await sql`INSERT INTO report_data ${sql(toInsert)}`
            }
            await sql`UPDATE report_jobs SET status = 'SUCCESS', records = ${rows.length}, updated_at = NOW() WHERE job_id = ${jobId}`
            console.log(`  [ENKI] ${date} — ${rows.length} rows inserted`)
            pending.splice(i, 1)
          } else if (status === 'FAILED') {
            await sql`UPDATE report_jobs SET status = 'FAILED', updated_at = NOW() WHERE job_id = ${jobId}`
            console.error(`  [ENKI] ${date} — job ${jobId} FAILED`)
            pending.splice(i, 1)
          } else {
            console.log(`  [ENKI] ${date} — still ${status} (attempt ${attempts})`)
          }
        } catch (e) {
          console.error(`  [ENKI] ${date} — poll error: ${e.message}`)
        }
      }
    }
    if (pending.length > 0) {
      console.warn(`  [ENKI] ${pending.length} jobs still pending after timeout`)
    }
  }

  // ── Nexify: check which dates already have SUCCESS ────────────
  const existingNx = await sql`
    SELECT date FROM nexify_fetches
    WHERE breakdown = 'daily' AND date = ANY(${DATES}) AND status = 'SUCCESS'
  `
  const doneNx = new Set(existingNx.map(r => {
    const d = r.date
    if (d instanceof Date) return d.toISOString().slice(0, 10)
    return String(d).slice(0, 10)
  }))
  console.log(`\nNexify: ${doneNx.size} dates already done, ${DATES.length - doneNx.size} to fetch`)

  // ── Nexify: fetch missing dates ───────────────────────────────
  for (const date of DATES) {
    if (doneNx.has(date)) { console.log(`  [Nexify] ${date} — already done, skip`); continue }
    try {
      const rows = await nexifyFetchDaily(date)
      if (rows.length === 0) {
        console.log(`  [Nexify] ${date} — 0 rows (not available yet)`)
        continue
      }
      const toInsert = rows.map(row => ({
        job_id: null,
        provider: 'nexify',
        breakdown: 'daily',
        report_date: row.date || date,
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
      await sql`DELETE FROM report_data WHERE provider = 'nexify' AND breakdown = 'daily' AND report_date = ${date}`
      await sql`INSERT INTO report_data ${sql(toInsert)}`
      await sql`
        INSERT INTO nexify_fetches (date, breakdown, status, records)
        VALUES (${date}, 'daily', 'SUCCESS', ${rows.length})
        ON CONFLICT (date, breakdown) DO UPDATE SET status = 'SUCCESS', records = ${rows.length}, fetched_at = NOW()
      `
      console.log(`  [Nexify] ${date} — ${rows.length} rows inserted`)
    } catch (e) {
      console.error(`  [Nexify] ${date} — error: ${e.message}`)
    }
    await sleep(300)
  }

  console.log('\nDone.')
  await sql.end()
}

main().catch(e => { console.error(e); process.exit(1) })
