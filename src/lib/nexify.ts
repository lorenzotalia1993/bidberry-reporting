const BASE = 'https://api.nexify.io/v1/reports/nexify'

function buildUrl(endpoint: string, date: string): string {
  const clientId = process.env.NEXIFY_CLIENT_ID!
  const ts = process.env.NEXIFY_TS!
  const hash = process.env.NEXIFY_HASH!
  return `${BASE}/${endpoint}?client_id=${clientId}&ts=${ts}&hash=${hash}&date=${date}`
}

export interface NexifyRow {
  domain: string
  feed: string
  bidded_clicks: number
  bidded_results: number
  bidded_searches: number
  channel: string
  coverage: number
  ctr: number
  date: string
  device_type: string
  hour?: number
  market: string
  net_revenue_eur: number
  net_revenue_usd: number
  searches: number
  source_type: string
  tq_score: string
  tz: string
}

async function nexifyFetch(endpoint: string, date: string): Promise<NexifyRow[]> {
  const url = buildUrl(endpoint, date)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Nexify API error: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function fetchNexifyDaily(date: string): Promise<NexifyRow[]> {
  return nexifyFetch('yahoo_daily', date)
}

export async function fetchNexifyHourly(date: string): Promise<NexifyRow[]> {
  return nexifyFetch('yahoo_hourly_fast', date)
}
