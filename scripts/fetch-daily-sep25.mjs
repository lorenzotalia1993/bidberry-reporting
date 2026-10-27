// Fetch ENKI daily data for Sep 25, 2026
import postgres from 'postgres'
import crypto from 'crypto'
import { gunzipSync } from 'zlib'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1) }
const sql = postgres(DATABASE_URL, { ssl: 'require' })

const CLIENT_CODE = process.env.ENKI_CLIENT_CODE
const SECRET = process.env.ENKI_SECRET
const CONFIG_ID = process.env.ENKI_CONFIG_ID
const MARKET = 'us'
const SERVICE = 'reports'
const BASE = 'https://www.enkiads.com/ws/v1'

function getToken(timestamp) {
  const string = [SERVICE, MARKET, CONFIG_ID, timestamp, 'ws', 'v1'].join('|')
  return `${CLIENT_CODE}:${crypto.createHmac('sha256', SECRET).update(string).digest('base64')}`
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
  const data = await enkiFetch({ f: 'requestReport', service: 'yads', time_breakdown: 'daily', date_from: date, date_to: date })
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

const DATE = '2026-09-25'

async function main() {
  // Check if already have data
  const [has] = await sql`SELECT 1 FROM report_data WHERE provider = 'enki' AND breakdown = 'daily' AND report_date = ${DATE} LIMIT 1`
  if (has) {
    console.log(`Data for ${DATE} already exists. Skipping.`)
    await sql.end()
    return
  }

  console.log(`Requesting daily report for ${DATE}...`)
  const jobId = await requestReport(DATE)
  console.log(`Job ${jobId} created, polling...`)

  await sql`
    INSERT INTO report_jobs (job_id, status, breakdown, date_from, date_to)
    VALUES (${jobId}, 'QUEUED', 'daily', ${DATE}, ${DATE})
    ON CONFLICT (job_id) DO UPDATE SET status = 'QUEUED', updated_at = NOW()
  `

  const maxWait = 10 * 60 * 1000
  const start = Date.now()
  let result

  while (Date.now() - start < maxWait) {
    await sleep(30000)
    result = await getJobStatus(jobId)
    console.log(`  Status: ${result.status}`)
    if (result.status === 'SUCCESS' || result.status === 'FAILED') break
  }

  if (!result || result.status !== 'SUCCESS' || !result.downloadLink) {
    console.error(`Job did not complete: ${result?.status}`)
    await sql`UPDATE report_jobs SET status = 'FAILED', updated_at = NOW() WHERE job_id = ${jobId}`
    await sql.end()
    process.exit(1)
  }

  const rows = await downloadReport(result.downloadLink)
  console.log(`Downloaded ${rows.length} rows`)

  if (rows.length > 0) {
    const toInsert = rows.filter(row => row.date === DATE).map(row => ({
      job_id: jobId, breakdown: 'daily',
      config_name: row.config_name || null,
      report_date: row.date || DATE,
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

    if (toInsert.length === 0) {
      console.error('No rows matched date validation!')
      await sql.end()
      process.exit(1)
    }

    await sql`DELETE FROM report_data WHERE provider = 'enki' AND breakdown = 'daily' AND report_date = ${DATE}`
    for (let i = 0; i < toInsert.length; i += 500) {
      await sql`INSERT INTO report_data ${sql(toInsert.slice(i, i + 500))}`
    }
    await sql`UPDATE report_jobs SET status = 'SUCCESS', records = ${toInsert.length}, updated_at = NOW() WHERE job_id = ${jobId}`
    console.log(`✓ Inserted ${toInsert.length} rows for ${DATE}`)
  }

  await sql.end()
}

main().catch(e => { console.error(e); process.exit(1) })
