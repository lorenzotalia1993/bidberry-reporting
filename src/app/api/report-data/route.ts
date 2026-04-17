import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

type AggRow = {
  config_name: string; market: string; device: string; ads_query: string
  revenue: number; amount_eur: number; clicks: number
  searches: number; bidded_searches: number; bidded_results: number
}

function aggregate(data: Record<string, unknown>[], keyFields: string[]): AggRow[] {
  const agg: Record<string, AggRow> = {}
  for (const row of data) {
    const key = keyFields.map(f => String(row[f] ?? '')).join('|__|')
    if (!agg[key]) {
      agg[key] = {
        config_name: String(row.config_name ?? '(unknown)'),
        market: String(row.market ?? ''),
        device: String(row.device ?? ''),
        ads_query: String(row.ads_query ?? ''),
        revenue: 0, amount_eur: 0, clicks: 0, searches: 0, bidded_searches: 0, bidded_results: 0,
        ...Object.fromEntries(keyFields.filter(f => !['config_name','market','device','ads_query'].includes(f)).map(f => [f, row[f]])),
      } as AggRow
    }
    agg[key].revenue += Number(row.revenue ?? 0)
    agg[key].amount_eur += Number(row.amount_eur ?? 0)
    agg[key].clicks += Number(row.clicks ?? 0)
    agg[key].searches += Number(row.searches ?? 0)
    agg[key].bidded_searches += Number(row.bidded_searches ?? 0)
    agg[key].bidded_results += Number(row.bidded_results ?? 0)
  }
  return Object.values(agg)
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const breakdown = searchParams.get('breakdown') ?? 'daily'
  const dbBreakdown = breakdown === 'trend' ? 'daily' : breakdown

  if (!from || !to) {
    return NextResponse.json([], { status: 200 })
  }

  const data = await sql`
    SELECT config_name, market, device, ads_query, report_date, report_hour,
           revenue, amount_eur, clicks, searches, bidded_searches, bidded_results
    FROM report_data
    WHERE breakdown = ${dbBreakdown}
      AND report_date >= ${from}
      AND report_date <= ${to}
    ORDER BY report_date ASC
  `

  if (breakdown === 'trend') {
    const agg: Record<string, { report_date: string; revenue: number; clicks: number; searches: number; bidded_searches: number }> = {}
    for (const row of data as Record<string, unknown>[]) {
      const dateStr = String(row.report_date).split('T')[0]
      if (!agg[dateStr]) agg[dateStr] = { report_date: dateStr, revenue: 0, clicks: 0, searches: 0, bidded_searches: 0 }
      agg[dateStr].revenue += Number(row.revenue ?? 0)
      agg[dateStr].clicks += Number(row.clicks ?? 0)
      agg[dateStr].searches += Number(row.searches ?? 0)
      agg[dateStr].bidded_searches += Number(row.bidded_searches ?? 0)
    }
    return NextResponse.json(Object.values(agg).sort((a, b) => a.report_date.localeCompare(b.report_date)))
  }

  if (breakdown === 'daily') {
    // Aggregate by (config, market, device, query) across all placements and dates
    const result = aggregate(data as Record<string, unknown>[], ['config_name', 'market', 'device', 'ads_query'])
      .sort((a, b) => b.revenue - a.revenue || b.searches - a.searches)
    return NextResponse.json(result)
  }

  // Hourly: aggregate by (date, hour, config, market, device, query) to merge placements
  type HourlyAggRow = AggRow & { report_date: unknown; report_hour: number }
  const agg: Record<string, HourlyAggRow> = {}
  for (const row of data) {
    const dateStr = String(row.report_date).split('T')[0]
    const key = [dateStr, row.report_hour, row.config_name, row.market, row.device, row.ads_query].join('|__|')
    if (!agg[key]) {
      agg[key] = {
        report_date: dateStr,
        report_hour: Number(row.report_hour ?? 0),
        config_name: String(row.config_name ?? '(unknown)'),
        market: String(row.market ?? ''),
        device: String(row.device ?? ''),
        ads_query: String(row.ads_query ?? ''),
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

  const result = Object.values(agg).sort((a, b) => {
    if (a.report_date !== b.report_date) return String(b.report_date).localeCompare(String(a.report_date))
    if (a.report_hour !== b.report_hour) return a.report_hour - b.report_hour
    return a.config_name.localeCompare(b.config_name)
  })
  return NextResponse.json(result)
}
