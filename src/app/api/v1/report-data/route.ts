import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import sql from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'

const apiLimiter = rateLimit({ name: 'api', max: 60, windowSec: 60 })

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 401 })
  }

  const keyPlain = auth.slice(7)
  const keyHash = createHash('sha256').update(keyPlain).digest('hex')

  const [apiKey] = await sql`
    SELECT ak.user_id, ak.revoked_at
    FROM api_keys ak
    WHERE ak.key_hash = ${keyHash}
  `

  if (!apiKey || apiKey.revoked_at) {
    return NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 })
  }

  const rl = apiLimiter.check(keyHash)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    )
  }

  // Get user email and allowed tags
  const [user] = await sql`SELECT email FROM users WHERE id = ${apiKey.user_id}`
  const tags = await sql`SELECT config_name FROM user_tag_permissions WHERE user_id = ${apiKey.user_id}`
  const allowedTags = tags.map((t) => (t as { config_name: string }).config_name)
  const fullColumns = user?.email === 'diego@intraprendenza.io'

  if (allowedTags.length === 0) {
    return NextResponse.json([])
  }

  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const breakdown = searchParams.get('breakdown') ?? 'daily'
  const dbBreakdown = breakdown === 'trend' ? 'daily' : breakdown

  if (!from || !to) {
    return NextResponse.json([])
  }

  if (breakdown === 'trend') {
    const data = await sql`
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
        AND config_name = ANY(${allowedTags}::text[])
      GROUP BY report_date
      ORDER BY report_date ASC
    `
    return NextResponse.json(data)
  }

  // Full columns mode: return raw row-level data with all ENKI fields
  if (fullColumns) {
    if (breakdown === 'daily') {
      const data = await sql`
        SELECT report_date::text as date,
               raw->>'config_id' as config_id,
               config_name, market, device,
               raw->>'ad_type' as ad_type,
               ads_query as "adsQuery",
               raw->>'source' as source,
               raw->>'adid' as adid,
               raw->>'adsetid' as adsetid,
               raw->>'campaignid' as campaignid,
               placement,
               raw->>'network' as network,
               raw->>'campaign' as campaign,
               raw->>'ad' as ad,
               raw->>'pla' as pla,
               raw->>'lyt' as lyt,
               raw->>'tscroll' as tscroll,
               raw->>'tq_score' as tq_score,
               searches,
               bidded_searches,
               bidded_results,
               clicks as bidded_clicks,
               amount_eur,
               revenue as amount_usd
        FROM report_data
        WHERE provider = 'enki'
          AND breakdown = 'daily'
          AND report_date >= ${from}
          AND report_date <= ${to}
          AND config_name = ANY(${allowedTags}::text[])
        ORDER BY report_date DESC, revenue DESC
      `
      return NextResponse.json(data)
    }

    // hourly - full columns
    const data = await sql`
      SELECT report_date::text as date,
             report_hour as hour,
             raw->>'config_id' as config_id,
             config_name, market, device,
             raw->>'ad_type' as ad_type,
             ads_query as "adsQuery",
             raw->>'source' as source,
             raw->>'adid' as adid,
             raw->>'adsetid' as adsetid,
             raw->>'campaignid' as campaignid,
             placement,
             raw->>'network' as network,
             raw->>'campaign' as campaign,
             raw->>'ad' as ad,
             raw->>'pla' as pla,
             raw->>'lyt' as lyt,
             raw->>'tscroll' as tscroll,
             raw->>'tq_score' as tq_score,
             searches,
             bidded_searches,
             bidded_results,
             clicks as bidded_clicks,
             amount_eur,
             revenue as amount_usd
      FROM report_data
      WHERE provider = 'enki'
        AND breakdown = 'hourly'
        AND report_date >= ${from}
        AND report_date <= ${to}
        AND config_name = ANY(${allowedTags}::text[])
      ORDER BY report_date DESC, report_hour ASC, config_name ASC
    `
    return NextResponse.json(data)
  }

  // Standard columns mode
  if (breakdown === 'daily') {
    const data = await sql`
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
        AND config_name = ANY(${allowedTags}::text[])
      GROUP BY config_name, market, device, ads_query
      ORDER BY SUM(revenue) DESC, SUM(searches) DESC
    `
    return NextResponse.json(data)
  }

  // hourly
  const data = await sql`
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
      AND config_name = ANY(${allowedTags}::text[])
    GROUP BY report_date, report_hour, config_name, market, device, ads_query
    ORDER BY report_date DESC, report_hour ASC, config_name ASC
  `
  return NextResponse.json(data)
}
