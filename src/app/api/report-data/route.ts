import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const breakdown = searchParams.get('breakdown') ?? 'daily'

  if (!from || !to) {
    return NextResponse.json([], { status: 200 })
  }

  const data = await sql`
    SELECT config_name, market, device, ads_query, report_date, report_hour,
           revenue, amount_eur, clicks, searches, bidded_searches, bidded_results
    FROM report_data
    WHERE breakdown = ${breakdown}
      AND report_date >= ${from}
      AND report_date <= ${to}
    ORDER BY report_date DESC
  `

  type AggRow = {
    config_name: string; market: string; device: string; ads_query: string
    revenue: number; amount_eur: number; clicks: number
    searches: number; bidded_searches: number; bidded_results: number
  }

  if (breakdown === 'daily') {
    const agg: Record<string, AggRow> = {}
    for (const row of data) {
      const key = [row.config_name, row.market, row.device, row.ads_query].join('|__|')
      if (!agg[key]) {
        agg[key] = {
          config_name: row.config_name ?? '(unknown)',
          market: row.market ?? '',
          device: row.device ?? '',
          ads_query: row.ads_query ?? '',
          revenue: 0, amount_eur: 0, clicks: 0, searches: 0, bidded_searches: 0, bidded_results: 0,
        }
      }
      agg[key].revenue += Number(row.revenue ?? 0)
      agg[key].amount_eur += Number(row.amount_eur ?? 0)
      agg[key].clicks += Number(row.clicks ?? 0)
      agg[key].searches += Number(row.searches ?? 0)
      agg[key].bidded_searches += Number(row.bidded_searches ?? 0)
      agg[key].bidded_results += Number(row.bidded_results ?? 0)
    }
    const result = Object.values(agg).sort((a, b) => b.revenue - a.revenue || b.searches - a.searches)
    return NextResponse.json(result)
  }

  const result = data.map(row => ({
    config_name: row.config_name ?? '(unknown)',
    market: row.market ?? '',
    device: row.device ?? '',
    ads_query: row.ads_query ?? '',
    report_date: row.report_date,
    report_hour: row.report_hour ?? 0,
    revenue: Number(row.revenue ?? 0),
    amount_eur: Number(row.amount_eur ?? 0),
    clicks: Number(row.clicks ?? 0),
    searches: Number(row.searches ?? 0),
    bidded_searches: Number(row.bidded_searches ?? 0),
    bidded_results: Number(row.bidded_results ?? 0),
  })).sort((a, b) => {
    if (a.report_date !== b.report_date) return String(b.report_date).localeCompare(String(a.report_date))
    if (a.report_hour !== b.report_hour) return a.report_hour - b.report_hour
    return a.config_name.localeCompare(b.config_name)
  })
  return NextResponse.json(result)
}
