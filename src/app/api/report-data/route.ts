import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const breakdown = searchParams.get('breakdown') ?? 'daily'
  const provider = searchParams.get('provider') ?? 'enki'
  const dbBreakdown = breakdown === 'trend' ? 'daily' : breakdown

  if (!from || !to) {
    return NextResponse.json([], { status: 200 })
  }

  // ── Nexify path ─────────────────────────────────────────────────────────────
  if (provider === 'nexify') {
    if (breakdown === 'trend') {
      const data = await sql`
        SELECT report_date::text as report_date,
               SUM(revenue) as revenue, SUM(clicks) as clicks,
               SUM(searches) as searches, SUM(bidded_searches) as bidded_searches
        FROM report_data
        WHERE provider = 'nexify'
          AND breakdown = ${dbBreakdown}
          AND report_date >= ${from}
          AND report_date <= ${to}
        GROUP BY report_date
        ORDER BY report_date ASC
      `
      return NextResponse.json(data)
    }

    if (breakdown === 'daily') {
      const data = await sql`
        SELECT config_name, domain, market, device, ads_query, source_type, tq_score,
               SUM(coverage) as coverage, SUM(ctr) as ctr,
               SUM(revenue) as revenue, SUM(amount_eur) as amount_eur,
               SUM(clicks) as clicks, SUM(searches) as searches,
               SUM(bidded_searches) as bidded_searches, SUM(bidded_results) as bidded_results
        FROM report_data
        WHERE provider = 'nexify'
          AND breakdown = 'daily'
          AND report_date >= ${from}
          AND report_date <= ${to}
        GROUP BY config_name, domain, market, device, ads_query, source_type, tq_score
        ORDER BY SUM(revenue) DESC, SUM(searches) DESC
      `
      return NextResponse.json(data)
    }

    // Nexify hourly
    const data = await sql`
      SELECT report_date::text as report_date, report_hour,
             config_name, domain, market, device, ads_query, source_type, tq_score,
             SUM(coverage) as coverage, SUM(ctr) as ctr,
             SUM(revenue) as revenue, SUM(amount_eur) as amount_eur,
             SUM(clicks) as clicks, SUM(searches) as searches,
             SUM(bidded_searches) as bidded_searches, SUM(bidded_results) as bidded_results
      FROM report_data
      WHERE provider = 'nexify'
        AND breakdown = 'hourly'
        AND report_date >= ${from}
        AND report_date <= ${to}
      GROUP BY report_date, report_hour, config_name, domain, market, device, ads_query, source_type, tq_score
      ORDER BY report_date DESC, report_hour ASC, domain ASC
    `
    return NextResponse.json(data)
  }

  // ── ENKI path (default) ──────────────────────────────────────────────────────
  if (breakdown === 'trend') {
    const data = await sql`
      SELECT report_date::text as report_date,
             SUM(revenue) as revenue, SUM(clicks) as clicks,
             SUM(searches) as searches, SUM(bidded_searches) as bidded_searches
      FROM report_data
      WHERE provider = 'enki'
        AND breakdown = ${dbBreakdown}
        AND report_date >= ${from}
        AND report_date <= ${to}
      GROUP BY report_date
      ORDER BY report_date ASC
    `
    return NextResponse.json(data)
  }

  if (breakdown === 'daily') {
    const data = await sql`
      SELECT config_name, market, device, ads_query,
             SUM(revenue) as revenue, SUM(amount_eur) as amount_eur,
             SUM(clicks) as clicks, SUM(searches) as searches,
             SUM(bidded_searches) as bidded_searches, SUM(bidded_results) as bidded_results
      FROM report_data
      WHERE provider = 'enki'
        AND breakdown = 'daily'
        AND report_date >= ${from}
        AND report_date <= ${to}
      GROUP BY config_name, market, device, ads_query
      ORDER BY SUM(revenue) DESC, SUM(searches) DESC
    `
    return NextResponse.json(data)
  }

  // ENKI hourly
  const data = await sql`
    SELECT report_date::text as report_date, report_hour,
           config_name, market, device, ads_query,
           SUM(revenue) as revenue, SUM(amount_eur) as amount_eur,
           SUM(clicks) as clicks, SUM(searches) as searches,
           SUM(bidded_searches) as bidded_searches, SUM(bidded_results) as bidded_results
    FROM report_data
    WHERE provider = 'enki'
      AND breakdown = 'hourly'
      AND report_date >= ${from}
      AND report_date <= ${to}
    GROUP BY report_date, report_hour, config_name, market, device, ads_query
    ORDER BY report_date DESC, report_hour ASC, config_name ASC
  `
  return NextResponse.json(data)
}
