import { NextRequest, NextResponse } from 'next/server'
import { fetchNexifyDaily, fetchNexifyHourly } from '@/lib/nexify'
import sql from '@/lib/db'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function yesterdayStr() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

// GET /api/cron/nexify?date=today|yesterday|YYYY-MM-DD&breakdown=daily|hourly|both&secret=...
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const secret = req.nextUrl.searchParams.get('secret')
  const envSecret = (process.env.CRON_SECRET ?? 'bidberry2026').trim()
  if (auth !== `Bearer ${envSecret}` && (secret ?? '').trim() !== envSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rawDate = req.nextUrl.searchParams.get('date') ?? 'today'
  const date = rawDate === 'yesterday' ? yesterdayStr() : rawDate === 'today' ? todayStr() : rawDate
  const breakdown = req.nextUrl.searchParams.get('breakdown') ?? 'both'

  const log: string[] = []

  async function runBreakdown(type: 'daily' | 'hourly') {
    // Check if already fetched today for this date+breakdown
    const [existing] = await sql`
      SELECT id FROM nexify_fetches
      WHERE date = ${date} AND breakdown = ${type}
    `

    // For daily: only re-fetch if no record at all (daily data is final once available)
    // For hourly: always re-fetch (intraday data keeps updating)
    if (type === 'daily' && existing) {
      log.push(`nexify daily ${date} already fetched (${existing.id}), skipping`)
      return
    }

    try {
      const rows = type === 'daily'
        ? await fetchNexifyDaily(date)
        : await fetchNexifyHourly(date)

      if (rows.length === 0) {
        log.push(`nexify ${type} ${date}: 0 rows (data not available yet)`)
        return
      }

      const toInsert = rows.map((row) => ({
        job_id: null,
        provider: 'nexify',
        breakdown: type,
        report_date: row.date || date,
        report_hour: type === 'hourly' ? (row.hour != null ? row.hour : null) : null,
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
        raw: row,
      }))

      // Delete previous data for this date+breakdown+provider before re-inserting
      await sql`
        DELETE FROM report_data
        WHERE provider = 'nexify' AND breakdown = ${type} AND report_date = ${date}
      `
      await sql`INSERT INTO report_data ${sql(toInsert)}`

      // Upsert fetch tracking
      await sql`
        INSERT INTO nexify_fetches (date, breakdown, status, records)
        VALUES (${date}, ${type}, 'SUCCESS', ${rows.length})
        ON CONFLICT (date, breakdown) DO UPDATE
          SET status = 'SUCCESS', records = ${rows.length}, fetched_at = NOW()
      `

      log.push(`nexify ${type} ${date}: ${rows.length} rows inserted`)
    } catch (e) {
      log.push(`nexify ${type} ${date} error: ${String(e)}`)
    }
  }

  if (breakdown === 'daily' || breakdown === 'both') await runBreakdown('daily')
  if (breakdown === 'hourly' || breakdown === 'both') await runBreakdown('hourly')

  return NextResponse.json({ ok: true, date, log })
}
