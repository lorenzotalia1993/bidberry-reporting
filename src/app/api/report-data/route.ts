import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const breakdown = searchParams.get('breakdown') ?? 'daily'
  const provider = searchParams.get('provider') ?? 'enki'
  const dbBreakdown = breakdown === 'trend' ? 'daily' : breakdown

  if (!from || !to) {
    return NextResponse.json([], { status: 200 })
  }

  if (breakdown === 'keyword-insights') {
    if (provider === 'nexify') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const allowedTags = session.isAdmin ? null : session.allowedTags
    if (!session.isAdmin && (!allowedTags || allowedTags.length === 0)) {
      return NextResponse.json([])
    }
    return NextResponse.json(await queryKeywordInsights(allowedTags, from, to))
  }

  // Non-admin users: no nexify, only allowed tags
  if (!session.isAdmin) {
    if (provider === 'nexify') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const allowedTags = session.allowedTags
    if (!allowedTags || allowedTags.length === 0) {
      return NextResponse.json([])
    }
    return NextResponse.json(await queryEnki(from, to, breakdown, dbBreakdown, allowedTags))
  }

  // ── Admin: full access ──────────────────────────────────────────────────────

  // ── Nexify path ─────────────────────────────────────────────────────────────
  if (provider === 'nexify') {
    if (breakdown === 'trend') {
      const data = await sql`
        SELECT report_date::text as report_date,
               COALESCE(SUM(revenue), 0)::float as revenue,
               COALESCE(SUM(clicks), 0)::int as clicks,
               COALESCE(SUM(searches), 0)::int as searches,
               COALESCE(SUM(bidded_searches), 0)::int as bidded_searches
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
               COALESCE(SUM(coverage), 0)::float as coverage,
               COALESCE(SUM(ctr), 0)::float as ctr,
               COALESCE(SUM(revenue), 0)::float as revenue,
               COALESCE(SUM(amount_eur), 0)::float as amount_eur,
               COALESCE(SUM(clicks), 0)::int as clicks,
               COALESCE(SUM(searches), 0)::int as searches,
               COALESCE(SUM(bidded_searches), 0)::int as bidded_searches,
               COALESCE(SUM(bidded_results), 0)::int as bidded_results
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
             COALESCE(SUM(coverage), 0)::float as coverage,
             COALESCE(SUM(ctr), 0)::float as ctr,
             COALESCE(SUM(revenue), 0)::float as revenue,
             COALESCE(SUM(amount_eur), 0)::float as amount_eur,
             COALESCE(SUM(clicks), 0)::int as clicks,
             COALESCE(SUM(searches), 0)::int as searches,
             COALESCE(SUM(bidded_searches), 0)::int as bidded_searches,
             COALESCE(SUM(bidded_results), 0)::int as bidded_results
      FROM report_data
      WHERE provider = 'nexify'
        AND breakdown = 'hourly'
        AND report_date >= ${from}
        AND report_date <= ${to}
      GROUP BY report_date, report_hour, config_name, domain, market, device, ads_query, source_type, tq_score
      ORDER BY report_date DESC, report_hour ASC, domain ASC
      LIMIT 10000
    `
    return NextResponse.json(data)
  }

  // ── ENKI path (admin, no tag filter) ────────────────────────────────────────
  return NextResponse.json(await queryEnki(from, to, breakdown, dbBreakdown, null))
}

async function queryKeywordInsights(allowedTags: string[] | null, from: string | null, to: string | null) {
  const tagFilter = allowedTags ? sql`AND config_name = ANY(${allowedTags}::text[])` : sql``
  const dateFilter = (from && to) ? sql`AND report_date >= ${from} AND report_date <= ${to}` : sql``

  const rows = await sql`
    WITH daily AS (
      SELECT ads_query, market,
             SUM(revenue)::float  AS revenue,
             SUM(clicks)::int     AS clicks,
             SUM(searches)::int   AS searches
      FROM report_data
      WHERE provider = 'enki'
        AND breakdown = 'daily'
        AND ads_query IS NOT NULL AND ads_query <> ''
        AND market   IS NOT NULL AND market   <> ''
        ${tagFilter}
        ${dateFilter}
      GROUP BY ads_query, market
      HAVING SUM(clicks) >= 15
    ),
    hourly_rpc AS (
      SELECT ads_query, market, report_hour,
             SUM(revenue)::float / NULLIF(SUM(clicks), 0) AS rpc
      FROM report_data
      WHERE provider = 'enki'
        AND breakdown = 'hourly'
        AND ads_query IS NOT NULL AND ads_query <> ''
        AND market   IS NOT NULL AND market   <> ''
        ${tagFilter}
        ${dateFilter}
      GROUP BY ads_query, market, report_hour
      HAVING SUM(clicks) >= 5
    ),
    hourly_stats AS (
      SELECT ads_query, market,
             AVG(rpc)                           AS mean_rpc,
             STDDEV_POP(rpc)                    AS std_rpc,
             COUNT(*)::int                      AS hour_count
      FROM hourly_rpc
      GROUP BY ads_query, market
    ),
    best_hours AS (
      SELECT h.ads_query, h.market,
             h.report_hour AS hour,
             h.rpc,
             CASE WHEN s.std_rpc > 0 THEN (h.rpc - s.mean_rpc) / s.std_rpc ELSE 0 END AS z
      FROM hourly_rpc h
      JOIN hourly_stats s USING (ads_query, market)
      WHERE s.hour_count >= 8
        AND s.mean_rpc > 0
        AND s.std_rpc / s.mean_rpc >= 0.35
        AND CASE WHEN s.std_rpc > 0 THEN (h.rpc - s.mean_rpc) / s.std_rpc ELSE 0 END >= 0.75
    ),
    ranked_hours AS (
      SELECT ads_query, market, hour, rpc,
             ROW_NUMBER() OVER (PARTITION BY ads_query, market ORDER BY rpc DESC) AS rn
      FROM best_hours
    ),
    aggregated_hours AS (
      SELECT ads_query, market,
             JSON_AGG(JSON_BUILD_OBJECT('hour', hour, 'rpc', rpc) ORDER BY rpc DESC) AS best_hours
      FROM ranked_hours
      WHERE rn <= 4
      GROUP BY ads_query, market
    )
    SELECT d.ads_query,
           d.market,
           d.revenue,
           d.clicks,
           d.searches,
           d.revenue / NULLIF(d.clicks, 0)        AS rpc,
           (ah.best_hours IS NOT NULL)::bool       AS has_hourly_trend,
           COALESCE(ah.best_hours, '[]'::json)     AS best_hours
    FROM daily d
    LEFT JOIN aggregated_hours ah USING (ads_query, market)
    ORDER BY rpc DESC NULLS LAST
  ` as unknown as {
    ads_query: string; market: string; revenue: number; clicks: number; searches: number;
    rpc: number; has_hourly_trend: boolean; best_hours: { hour: number; rpc: number }[]
  }[]

  return rows.map(r => ({
    ads_query: r.ads_query,
    market: r.market,
    revenue: r.revenue,
    clicks: r.clicks,
    searches: r.searches,
    rpc: r.rpc ?? 0,
    hasHourlyTrend: r.has_hourly_trend,
    bestHours: r.best_hours ?? [],
  }))
}

async function queryEnki(from: string, to: string, breakdown: string, dbBreakdown: string, allowedTags: string[] | null) {
  const tagFilter = allowedTags ? sql`AND config_name = ANY(${allowedTags}::text[])` : sql``

  if (breakdown === 'trend') {
    return sql`
      SELECT report_date::text as report_date,
             COALESCE(SUM(revenue), 0)::float as revenue,
             COALESCE(SUM(clicks), 0)::int as clicks,
             COALESCE(SUM(searches), 0)::int as searches,
             COALESCE(SUM(bidded_searches), 0)::int as bidded_searches
      FROM report_data
      WHERE provider = 'enki'
        AND breakdown = ${dbBreakdown}
        AND report_date >= ${from}
        AND report_date <= ${to}
        ${tagFilter}
      GROUP BY report_date
      ORDER BY report_date ASC
    `
  }

  if (breakdown === 'daily') {
    return sql`
      SELECT config_name, market, device, ads_query,
             COALESCE(SUM(revenue), 0)::float as revenue,
             COALESCE(SUM(amount_eur), 0)::float as amount_eur,
             COALESCE(SUM(clicks), 0)::int as clicks,
             COALESCE(SUM(searches), 0)::int as searches,
             COALESCE(SUM(bidded_searches), 0)::int as bidded_searches,
             COALESCE(SUM(bidded_results), 0)::int as bidded_results
      FROM report_data
      WHERE provider = 'enki'
        AND breakdown = 'daily'
        AND report_date >= ${from}
        AND report_date <= ${to}
        ${tagFilter}
      GROUP BY config_name, market, device, ads_query
      ORDER BY SUM(revenue) DESC, SUM(searches) DESC
    `
  }

  // hourly
  return sql`
    SELECT report_date::text as report_date, report_hour,
           config_name, market, device, ads_query,
           COALESCE(SUM(revenue), 0)::float as revenue,
           COALESCE(SUM(amount_eur), 0)::float as amount_eur,
           COALESCE(SUM(clicks), 0)::int as clicks,
           COALESCE(SUM(searches), 0)::int as searches,
           COALESCE(SUM(bidded_searches), 0)::int as bidded_searches,
           COALESCE(SUM(bidded_results), 0)::int as bidded_results
    FROM report_data
    WHERE provider = 'enki'
      AND breakdown = 'hourly'
      AND report_date >= ${from}
      AND report_date <= ${to}
      ${tagFilter}
    GROUP BY report_date, report_hour, config_name, market, device, ads_query
    ORDER BY report_date DESC, report_hour ASC, config_name ASC
    LIMIT 10000
  `
}
