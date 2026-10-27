/**
 * Backfill hourly data: requests ENKI reports in date-range chunks,
 * polls until SUCCESS, downloads and inserts into DB.
 */

import crypto from 'crypto'
import postgres from 'postgres'
import { createGunzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

// ---- Config ----
const ENKI_CLIENT_CODE = '7811574897'
const ENKI_CONFIG_ID = '762'
const ENKI_SECRET = 'heEMF07Hj2vmSRUr+a1VWldspU12d88L/+HpWstqfcg='
const DB_URL = 'postgresql://neondb_owner:npg_U3mNRSoM8qeO@ep-super-cherry-an833n71.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require'

const MARKET = 'us'
const SERVICE = 'reports'
const BASE = 'https://www.enkiads.com/ws/v1'

const sql = postgres(DB_URL, { ssl: 'require', max: 5 })

// ---- ENKI helpers ----
function getToken(timestamp) {
  const string = [SERVICE, MARKET, ENKI_CONFIG_ID, timestamp, 'ws', 'v1'].join('|')
  const hmac = crypto.createHmac('sha256', ENKI_SECRET)
  hmac.update(string)
  return `${ENKI_CLIENT_CODE}:${hmac.digest('base64')}`
}

function buildUrl(timestamp) {
  return `${BASE}/${ENKI_CLIENT_CODE}/${MARKET}/${SERVICE}/${ENKI_CONFIG_ID}/${timestamp}`
}

async function enkiFetch(params) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const token = getToken(timestamp)
  const url = new URL(buildUrl(timestamp))
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`ENKI error: ${res.status} ${await res.text()}`)
  return res.json()
}

async function requestReport(dateFrom, dateTo) {
  const data = await enkiFetch({
    f: 'requestReport',
    service: 'yads',
    time_breakdown: 'hourly',
    date_from: dateFrom,
    date_to: dateTo,
  })
  return data.data.jobId
}

async function getJobStatus(jobId) {
  const data = await enkiFetch({ f: 'getJobStatus', jobId: String(jobId) })
  const d = data.data
  return {
    status: d.status,
    downloadLink: d.response?.download_link,
    records: d.response?.records,
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function pollUntilDone(jobId, label) {
  console.log(`  [${label}] Polling job ${jobId}...`)
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(10_000)
    const { status, downloadLink, records } = await getJobStatus(jobId)
    console.log(`  [${label}] attempt ${attempt + 1}: ${status}`)
    if (status === 'SUCCESS') return { downloadLink, records }
    if (status === 'FAILED') throw new Error(`Job ${jobId} FAILED`)
  }
  throw new Error(`Job ${jobId} timed out`)
}

// ---- CSV helpers ----
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

async function downloadReport(downloadLink) {
  const res = await fetch(downloadLink)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)

  const buffer = Buffer.from(await res.arrayBuffer())
  let text
  try {
    const { gunzipSync } = await import('zlib')
    text = gunzipSync(buffer).toString('utf-8')
  } catch {
    text = buffer.toString('utf-8')
  }

  text = text.replace(/^\uFEFF/, '')
  const trimmed = text.trimStart()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const json = JSON.parse(trimmed)
    const arr = Array.isArray(json) ? json : [json]
    return arr.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v ?? '')])))
  }
  return parseCsv(text)
}

// ---- DB insert ----
async function insertRows(jobId, rows, dateFrom, dateTo) {
  if (!rows.length) { console.log('  No rows to insert'); return }

  const toInsert = rows.map(row => ({
    job_id: jobId,
    breakdown: 'hourly',
    config_name: row.config_name || null,
    report_date: row.date || null,
    report_hour: row.hour != null && row.hour !== '' ? parseInt(row.hour, 10) : null,
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

  // Insert job FIRST (FK parent), then data
  await sql`
    INSERT INTO report_jobs (job_id, status, breakdown, date_from, date_to, records, updated_at)
    VALUES (${jobId}, 'SUCCESS', 'hourly', ${dateFrom}, ${dateTo}, ${rows.length}, NOW())
    ON CONFLICT (job_id) DO UPDATE SET status = 'SUCCESS', records = ${rows.length}, updated_at = NOW()
  `

  const dates = [...new Set(toInsert.map(r => r.report_date).filter(Boolean))]
  if (dates.length > 0) {
    await sql`DELETE FROM report_data WHERE breakdown = 'hourly' AND report_date = ANY(${dates})`
  }

  // Insert in chunks to avoid huge queries
  const chunkSize = 500
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    await sql`INSERT INTO report_data ${sql(toInsert.slice(i, i + chunkSize))}`
  }

  console.log(`  Inserted ${toInsert.length} rows for dates: ${dates[0]} → ${dates[dates.length - 1]}`)
}

// ---- Main ----
// Process chunks: [dateFrom, dateTo] pairs covering Apr 1 – Jul 2, 2026
const chunks = [
  ['2026-06-16', '2026-06-30'],
  ['2026-07-01', '2026-07-02'],
]

console.log(`Starting backfill: ${chunks.length} chunks`)
console.log('Today:', new Date().toISOString().split('T')[0])
console.log()

for (const [dateFrom, dateTo] of chunks) {
  const label = `${dateFrom} → ${dateTo}`
  try {
    console.log(`\n=== Chunk: ${label} ===`)
    const jobId = await requestReport(dateFrom, dateTo)
    console.log(`  Job requested: ${jobId}`)

    const { downloadLink, records } = await pollUntilDone(jobId, label)
    console.log(`  SUCCESS! Records: ${records}, downloading...`)

    const rows = await downloadReport(downloadLink)
    console.log(`  Downloaded ${rows.length} rows`)

    await insertRows(jobId, rows, dateFrom, dateTo)
  } catch (err) {
    console.error(`  ERROR on chunk ${label}:`, err.message)
    console.error('  Continuing with next chunk...')
  }
}

console.log('\nBackfill complete!')
await sql.end()
