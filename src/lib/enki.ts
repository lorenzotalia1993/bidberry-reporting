import crypto from 'crypto'

const CLIENT_CODE = process.env.ENKI_CLIENT_CODE!
const SECRET = process.env.ENKI_SECRET!
const CONFIG_ID = process.env.ENKI_CONFIG_ID!
const MARKET = 'us'
const SERVICE = 'reports'
const BASE = 'https://www.enkiads.com/ws/v1'

function getToken(timestamp: string): string {
  const string = [SERVICE, MARKET, CONFIG_ID, timestamp, 'ws', 'v1'].join('|')
  const hmac = crypto.createHmac('sha256', SECRET)
  hmac.update(string)
  return `${CLIENT_CODE}:${hmac.digest('base64')}`
}

function buildUrl(timestamp: string): string {
  return `${BASE}/${CLIENT_CODE}/${MARKET}/${SERVICE}/${CONFIG_ID}/${timestamp}`
}

async function enkiFetch(params: Record<string, string>) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const token = getToken(timestamp)
  const url = new URL(buildUrl(timestamp))
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) throw new Error(`ENKI API error: ${res.status} ${await res.text()}`)
  return res.json()
}

export type TimeBreakdown = 'none' | 'daily' | 'hourly'

export async function requestReport(
  dateFrom: string,
  dateTo: string,
  timeBreakdown: TimeBreakdown,
  webhookUrl?: string
): Promise<{ jobId: number }> {
  const params: Record<string, string> = {
    f: 'requestReport',
    service: 'yads',
    time_breakdown: timeBreakdown,
    date_from: dateFrom,
    date_to: dateTo,
  }
  if (webhookUrl) params.webhook = webhookUrl

  const data = await enkiFetch(params)
  return { jobId: data.data.jobId }
}

export type JobStatus = 'QUEUED' | 'RUNNING' | 'FAILED' | 'SUCCESS'

export interface JobStatusResponse {
  jobId: number
  status: JobStatus
  downloadLink?: string
  downloadLinkExpiration?: string
  records?: number
}

export async function getJobStatus(jobId: number): Promise<JobStatusResponse> {
  const data = await enkiFetch({ f: 'getJobStatus', jobId: String(jobId) })
  const d = data.data
  return {
    jobId: d.jobId,
    status: d.status,
    downloadLink: d.response?.download_link,
    downloadLinkExpiration: d.response?.download_link_expiration_date,
    records: d.response?.records,
  }
}

export async function downloadReport(downloadLink: string): Promise<Record<string, string>[]> {
  const res = await fetch(downloadLink)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)

  const buffer = Buffer.from(await res.arrayBuffer())

  // Try to gunzip; if it fails, use raw buffer
  let text: string
  try {
    const { gunzipSync } = await import('zlib')
    text = gunzipSync(buffer).toString('utf-8')
  } catch {
    text = buffer.toString('utf-8')
  }

  // Strip BOM
  text = text.replace(/^\uFEFF/, '')

  // Detect JSON vs CSV
  const trimmed = text.trimStart()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const json = JSON.parse(trimmed)
    const arr: Record<string, unknown>[] = Array.isArray(json) ? json : [json]
    return arr.map(row =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v ?? '')]))
    )
  }

  return parseCsv(text)
}

function parseCsv(text: string): Record<string, string>[] {
  const stripped = text.replace(/^\uFEFF/, '')
  const lines = stripped.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (lines.length < 2) return []

  const headers = splitCsvLine(lines[0])
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i])
    if (values.length === 0) continue
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = values[idx] ?? '' })
    rows.push(row)
  }

  return rows
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}
