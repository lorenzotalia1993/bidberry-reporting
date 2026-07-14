'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, AreaChart, Area, Cell,
} from 'recharts'

// ── Types ──────────────────────────────────────────────────────────
type ActiveProvider = 'enki' | 'nexify'
type ActiveView = 'daily' | 'hourly' | 'analytics'

interface DailyRow {
  config_name: string
  market: string
  device: string
  ads_query: string
  revenue: number
  amount_eur: number
  clicks: number
  searches: number
  bidded_searches: number
  bidded_results: number
}

interface HourlyRow extends DailyRow {
  report_date: string
  report_hour: number
}

interface TrendRow {
  report_date: string
  revenue: number
  clicks: number
  searches: number
  bidded_searches: number
}

interface NexifyDailyRow {
  config_name: string
  domain: string
  market: string
  device: string
  ads_query: string
  source_type: string
  tq_score: string
  coverage: number
  ctr: number
  revenue: number
  amount_eur: number
  clicks: number
  searches: number
  bidded_searches: number
  bidded_results: number
}

interface NexifyHourlyRow extends NexifyDailyRow {
  report_date: string
  report_hour: number
}

// ── Helpers ────────────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtInt(n: number) {
  return n.toLocaleString('en-US')
}
function toStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function parseStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function displayDate(s: string) {
  if (!s) return '—'
  const d = parseStr(s)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa']

// ── Calendar Popover ───────────────────────────────────────────────
function Calendar({ value, onChange, maxDate, onShortcut }: {
  value: string
  onChange: (v: string) => void
  maxDate?: string
  onShortcut?: (from: string, to: string) => void
}) {
  const today = new Date()
  const todayStr = toStr(today)
  const init = value ? parseStr(value) : today
  const [cursor, setCursor] = useState({ year: init.getFullYear(), month: init.getMonth() })

  const firstDay = new Date(cursor.year, cursor.month, 1).getDay()
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let i = 1; i <= daysInMonth; i++) cells.push(i)

  function select(day: number) {
    const d = new Date(cursor.year, cursor.month, day)
    const s = toStr(d)
    if (maxDate && s > maxDate) return
    onChange(s)
  }

  function prev() {
    setCursor(c => ({ year: c.month === 0 ? c.year - 1 : c.year, month: c.month === 0 ? 11 : c.month - 1 }))
  }
  function next() {
    setCursor(c => ({ year: c.month === 11 ? c.year + 1 : c.year, month: c.month === 11 ? 0 : c.month + 1 }))
  }

  const shortcuts = onShortcut ? [
    { label: 'Today', action: () => onShortcut(todayStr, todayStr) },
    { label: 'Yesterday', action: () => { const d = new Date(); d.setDate(d.getDate()-1); const s=toStr(d); onShortcut(s,s) } },
    { label: 'Last 7d', action: () => { const d = new Date(); d.setDate(d.getDate()-6); onShortcut(toStr(d), todayStr) } },
    { label: 'Last 30d', action: () => { const d = new Date(); d.setDate(d.getDate()-29); onShortcut(toStr(d), todayStr) } },
    { label: 'This month', action: () => { const d = new Date(); d.setDate(1); onShortcut(toStr(d), todayStr) } },
  ] : []

  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 100,
      background: '#fff', border: '1px solid #dddcd8', borderRadius: 6,
      padding: 16, width: 256, boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
    }}>
      {shortcuts.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #e8e7e2' }}>
          {shortcuts.map(s => (
            <button key={s.label} onClick={s.action} style={{
              padding: '3px 8px', background: '#f0efe9', border: '1px solid #dddcd8',
              borderRadius: 3, color: '#555', fontSize: 11, fontFamily: "'Syne',sans-serif",
              fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em',
            }}
              onMouseEnter={e => (e.target as HTMLElement).style.color = '#c2800a'}
              onMouseLeave={e => (e.target as HTMLElement).style.color = '#555'}
            >{s.label}</button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={prev} style={navBtn}>‹</button>
        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>
          {MONTHS[cursor.month]} {cursor.year}
        </span>
        <button onClick={next} style={navBtn}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
        {DAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: '#bbb', letterSpacing: '0.08em', padding: '2px 0' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const s = toStr(new Date(cursor.year, cursor.month, day))
          const isSelected = s === value
          const isTodayCell = s === todayStr
          const isDisabled = !!maxDate && s > maxDate
          return (
            <button key={i} onClick={() => !isDisabled && select(day)} style={{
              height: 30, borderRadius: 3, border: 'none', cursor: isDisabled ? 'default' : 'pointer',
              background: isSelected ? '#1a1a1a' : isTodayCell ? '#f0efe9' : 'transparent',
              color: isDisabled ? '#ccc' : isSelected ? '#fff' : '#555',
              fontFamily: "'DM Mono',monospace", fontSize: 12, fontWeight: isSelected ? 700 : 400,
              transition: 'background 0.1s',
            }}
              onMouseEnter={e => { if (!isSelected && !isDisabled) (e.target as HTMLElement).style.background = '#f0efe9' }}
              onMouseLeave={e => { if (!isSelected && !isDisabled) (e.target as HTMLElement).style.background = isTodayCell ? '#f0efe9' : 'transparent' }}
            >{day}</button>
          )
        })}
      </div>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer',
  fontSize: 18, lineHeight: 1, padding: '0 4px', fontFamily: 'monospace',
}

// ── Date Picker ────────────────────────────────────────────────────
function DatePicker({ label, value, onChange, maxDate, onShortcut }: {
  label: string
  value: string
  onChange: (v: string) => void
  maxDate?: string
  onShortcut?: (from: string, to: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: '#aaa', fontFamily: "'Syne',sans-serif" }}>{label}</span>
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, color: '#1a1a1a' }}>
          {displayDate(value)}
        </span>
        <span style={{ color: '#bbb', fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <Calendar value={value} onChange={v => { onChange(v); setOpen(false) }} maxDate={maxDate}
          onShortcut={onShortcut ? (f, t) => { onShortcut(f, t); setOpen(false) } : undefined} />
      )}
    </div>
  )
}

// ── Chart Tooltip ──────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, valueFormatter }: {
  active?: boolean
  payload?: Array<{ value: number; name: string; color: string }>
  label?: string
  valueFormatter?: (v: number, name: string) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#fff', border: '1px solid #dddcd8', borderRadius: 4,
      padding: '8px 12px', fontFamily: "'DM Mono',monospace", fontSize: 12,
      boxShadow: '0 4px 16px rgba(0,0,0,0.07)',
    }}>
      {label && (
        <div style={{ color: '#aaa', fontSize: 9, marginBottom: 6, fontFamily: "'Syne',sans-serif",
          letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</div>
      )}
      {payload.map(p => (
        <div key={p.name} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
          <span style={{ color: '#888', fontSize: 11 }}>{p.name}:</span>
          <span style={{ color: '#1a1a1a', fontWeight: 500 }}>
            {valueFormatter ? valueFormatter(p.value, p.name) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────
function defaultRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 6)
  return { from: toStr(from), to: toStr(to) }
}

export default function Dashboard() {
  const [activeProvider, setActiveProvider] = useState<ActiveProvider>('enki')
  const [activeView, setActiveView] = useState<ActiveView>('daily')
  const [range, setRange] = useState(defaultRange)
  const [dailyData, setDailyData] = useState<DailyRow[]>([])
  const [hourlyData, setHourlyData] = useState<HourlyRow[]>([])
  const [trendData, setTrendData] = useState<TrendRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState({ config: '', query: '', device: '', hour: '' })
  const [dailyFilters, setDailyFilters] = useState({ config: '', query: '' })
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncLog, setSyncLog] = useState<string[]>([])
  const [nexifyDailyData, setNexifyDailyData] = useState<NexifyDailyRow[]>([])
  const [nexifyHourlyData, setNexifyHourlyData] = useState<NexifyHourlyRow[]>([])
  const [nexifyTrendData, setNexifyTrendData] = useState<TrendRow[]>([])
  const [nexifyLoading, setNexifyLoading] = useState(false)
  const [nexifyFilters, setNexifyFilters] = useState({ domain: '', source: '', device: '', hour: '' })

  const fetchAll = useCallback(async (from: string, to: string) => {
    if (!from || !to) return
    setLoading(true)
    setError(null)
    try {
      const [dailyRes, hourlyRes, trendRes] = await Promise.all([
        fetch(`/api/report-data?${new URLSearchParams({ from, to, breakdown: 'daily' })}`),
        fetch(`/api/report-data?${new URLSearchParams({ from, to, breakdown: 'hourly' })}`),
        fetch(`/api/report-data?${new URLSearchParams({ from, to, breakdown: 'trend' })}`),
      ])
      if (dailyRes.ok) setDailyData(await dailyRes.json())
      if (hourlyRes.ok) setHourlyData(await hourlyRes.json())
      if (trendRes.ok) setTrendData(await trendRes.json())
      setLastUpdated(new Date())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchData = useCallback(() => {
    fetchAll(range.from, range.to)
  }, [fetchAll, range.from, range.to])

  const fetchNexify = useCallback(async (from: string, to: string) => {
    if (!from || !to) return
    setNexifyLoading(true)
    try {
      const [dailyRes, hourlyRes, trendRes] = await Promise.all([
        fetch(`/api/report-data?${new URLSearchParams({ from, to, breakdown: 'daily', provider: 'nexify' })}`),
        fetch(`/api/report-data?${new URLSearchParams({ from, to, breakdown: 'hourly', provider: 'nexify' })}`),
        fetch(`/api/report-data?${new URLSearchParams({ from, to, breakdown: 'trend', provider: 'nexify' })}`),
      ])
      if (dailyRes.ok) setNexifyDailyData(await dailyRes.json())
      if (hourlyRes.ok) setNexifyHourlyData(await hourlyRes.json())
      if (trendRes.ok) setNexifyTrendData(await trendRes.json())
    } catch {
      // silent
    } finally {
      setNexifyLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchNexify(range.from, range.to) }, [fetchNexify, range.from, range.to])

  useEffect(() => {
    const id = setInterval(() => { fetchData() }, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchData])

  const runSync = useCallback(async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/sync')
      const json = await res.json()
      setSyncLog(json.log ?? [])
      await fetchAll(range.from, range.to)
    } catch {
      // silent
    } finally {
      setSyncing(false)
    }
  }, [fetchAll, range.from, range.to])

  useEffect(() => {
    runSync()
    const id = setInterval(runSync, 2 * 60 * 1000)
    return () => clearInterval(id)
  }, [runSync])

  // ── Analytics computed data ────────────────────────────────────
  const revenueByDate = useMemo(() =>
    trendData.map(r => ({
      date: r.report_date.slice(5),
      revenue: r.revenue,
      myRevenue: parseFloat((r.revenue * 0.2).toFixed(4)),
    }))
  , [trendData])

  const trafficByDate = useMemo(() =>
    trendData.map(r => ({
      date: r.report_date.slice(5),
      clicks: r.clicks,
      searches: r.searches,
    }))
  , [trendData])

  const queryRPCData = useMemo(() => {
    const grouped: Record<string, { revenue: number; clicks: number }> = {}
    dailyData.forEach(r => {
      if (!r.ads_query) return
      if (!grouped[r.ads_query]) grouped[r.ads_query] = { revenue: 0, clicks: 0 }
      grouped[r.ads_query].revenue += r.revenue
      grouped[r.ads_query].clicks += r.clicks
    })
    return Object.entries(grouped)
      .filter(([, v]) => v.clicks >= 3)
      .map(([query, v]) => ({
        query,
        queryShort: query.length > 28 ? query.slice(0, 26) + '…' : query,
        rpc: v.clicks > 0 ? v.revenue / v.clicks : 0,
        revenue: v.revenue,
        clicks: v.clicks,
      }))
      .sort((a, b) => b.rpc - a.rpc)
  }, [dailyData])

  const queryRPCWithColors = useMemo(() => {
    if (!queryRPCData.length) return []
    const n = queryRPCData.length
    return queryRPCData.map((q, i) => ({
      ...q,
      color: i < Math.ceil(n * 0.25) ? '#22c55e' : i >= Math.floor(n * 0.75) ? '#ef4444' : '#c2800a',
    }))
  }, [queryRPCData])

  const pushQueries = useMemo(() => queryRPCWithColors.filter(q => q.color === '#22c55e').slice(0, 5), [queryRPCWithColors])
  const stopQueries = useMemo(() => queryRPCWithColors.filter(q => q.color === '#ef4444').slice(-5).reverse(), [queryRPCWithColors])

  // ── Nexify analytics computed ──────────────────────────────────
  const nexifyRevenueByDate = useMemo(() =>
    nexifyTrendData.map(r => ({ date: r.report_date.slice(5), revenue: r.revenue }))
  , [nexifyTrendData])

  const nexifyTrafficByDate = useMemo(() =>
    nexifyTrendData.map(r => ({ date: r.report_date.slice(5), clicks: r.clicks, searches: r.searches }))
  , [nexifyTrendData])

  const nexifyChannelRPCData = useMemo(() => {
    const grouped: Record<string, { revenue: number; clicks: number }> = {}
    nexifyDailyData.forEach(r => {
      if (!r.ads_query) return
      if (!grouped[r.ads_query]) grouped[r.ads_query] = { revenue: 0, clicks: 0 }
      grouped[r.ads_query].revenue += r.revenue
      grouped[r.ads_query].clicks += r.clicks
    })
    return Object.entries(grouped)
      .filter(([, v]) => v.clicks >= 3)
      .map(([query, v]) => ({
        query,
        queryShort: query.length > 28 ? query.slice(0, 26) + '…' : query,
        rpc: v.clicks > 0 ? v.revenue / v.clicks : 0,
        revenue: v.revenue,
        clicks: v.clicks,
      }))
      .sort((a, b) => b.rpc - a.rpc)
  }, [nexifyDailyData])

  const nexifyChannelRPCWithColors = useMemo(() => {
    if (!nexifyChannelRPCData.length) return []
    const n = nexifyChannelRPCData.length
    return nexifyChannelRPCData.map((q, i) => ({
      ...q,
      color: i < Math.ceil(n * 0.25) ? '#22c55e' : i >= Math.floor(n * 0.75) ? '#ef4444' : '#3b82f6',
    }))
  }, [nexifyChannelRPCData])

  const nexifyPushChannels = useMemo(() => nexifyChannelRPCWithColors.filter(q => q.color === '#22c55e').slice(0, 5), [nexifyChannelRPCWithColors])
  const nexifyStopChannels = useMemo(() => nexifyChannelRPCWithColors.filter(q => q.color === '#ef4444').slice(-5).reverse(), [nexifyChannelRPCWithColors])

  // ── ENKI derived ──────────────────────────────────────────────
  const uniqueDailyConfigs = [...new Set(dailyData.map(r => r.config_name))].filter(Boolean).sort()
  const uniqueDailyQueries = [...new Set(dailyData.map(r => r.ads_query))].filter(Boolean).sort()
  const filteredDaily = dailyData.filter(r =>
    (!dailyFilters.config || r.config_name === dailyFilters.config) &&
    (!dailyFilters.query || r.ads_query === dailyFilters.query)
  )
  const dailyTotals = filteredDaily.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue, amount_eur: acc.amount_eur + r.amount_eur,
      clicks: acc.clicks + r.clicks, searches: acc.searches + r.searches,
      bidded_searches: acc.bidded_searches + r.bidded_searches, bidded_results: acc.bidded_results + r.bidded_results,
    }),
    { revenue: 0, amount_eur: 0, clicks: 0, searches: 0, bidded_searches: 0, bidded_results: 0 }
  )
  const uniqueConfigs = [...new Set(hourlyData.map(r => r.config_name))].filter(Boolean).sort()
  const uniqueQueries = [...new Set(hourlyData.map(r => r.ads_query))].filter(Boolean).sort()
  const uniqueDevices = [...new Set(hourlyData.map(r => r.device))].filter(Boolean).sort()
  const uniqueHours = [...new Set(hourlyData.map(r => r.report_hour))].sort((a, b) => a - b)
  const filteredHourly = hourlyData
    .filter(r =>
      (!filters.config || r.config_name === filters.config) &&
      (!filters.query || r.ads_query === filters.query) &&
      (!filters.device || r.device === filters.device) &&
      (!filters.hour || r.report_hour === Number(filters.hour))
    )
    .sort((a, b) => {
      if (String(a.report_date) !== String(b.report_date)) return String(a.report_date).localeCompare(String(b.report_date))
      if (a.report_hour !== b.report_hour) return a.report_hour - b.report_hour
      return a.config_name.localeCompare(b.config_name)
    })
  const hourlyTotals = filteredHourly.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue, amount_eur: acc.amount_eur + r.amount_eur,
      clicks: acc.clicks + r.clicks, searches: acc.searches + r.searches,
      bidded_searches: acc.bidded_searches + r.bidded_searches, bidded_results: acc.bidded_results + r.bidded_results,
    }),
    { revenue: 0, amount_eur: 0, clicks: 0, searches: 0, bidded_searches: 0, bidded_results: 0 }
  )

  // ── Nexify derived ────────────────────────────────────────────
  const uniqueNxDomains = [...new Set(nexifyDailyData.map(r => r.domain))].filter(Boolean).sort()
  const uniqueNxSources = [...new Set(nexifyDailyData.map(r => r.source_type))].filter(Boolean).sort()
  const uniqueNxHDomains = [...new Set(nexifyHourlyData.map(r => r.domain))].filter(Boolean).sort()
  const uniqueNxHSources = [...new Set(nexifyHourlyData.map(r => r.source_type))].filter(Boolean).sort()
  const uniqueNxHDevices = [...new Set(nexifyHourlyData.map(r => r.device))].filter(Boolean).sort()
  const uniqueNxHHours = [...new Set(nexifyHourlyData.map(r => r.report_hour))].sort((a, b) => a - b)
  const filteredNxDaily = nexifyDailyData.filter(r =>
    (!nexifyFilters.domain || r.domain === nexifyFilters.domain) &&
    (!nexifyFilters.source || r.source_type === nexifyFilters.source)
  )
  const filteredNxHourly = nexifyHourlyData.filter(r =>
    (!nexifyFilters.domain || r.domain === nexifyFilters.domain) &&
    (!nexifyFilters.source || r.source_type === nexifyFilters.source) &&
    (!nexifyFilters.device || r.device === nexifyFilters.device) &&
    (!nexifyFilters.hour || r.report_hour === Number(nexifyFilters.hour))
  )
  const nxDailyTotals = filteredNxDaily.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue, amount_eur: acc.amount_eur + r.amount_eur,
      clicks: acc.clicks + r.clicks, searches: acc.searches + r.searches,
      bidded_searches: acc.bidded_searches + r.bidded_searches, bidded_results: acc.bidded_results + r.bidded_results,
    }),
    { revenue: 0, amount_eur: 0, clicks: 0, searches: 0, bidded_searches: 0, bidded_results: 0 }
  )
  const nxHourlyTotals = filteredNxHourly.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue, amount_eur: acc.amount_eur + r.amount_eur,
      clicks: acc.clicks + r.clicks, searches: acc.searches + r.searches,
      bidded_searches: acc.bidded_searches + r.bidded_searches, bidded_results: acc.bidded_results + r.bidded_results,
    }),
    { revenue: 0, amount_eur: 0, clicks: 0, searches: 0, bidded_searches: 0, bidded_results: 0 }
  )
  const nxTotals = activeView === 'daily' ? nxDailyTotals : nxHourlyTotals

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f5f4f0; color: #1a1a1a; font-family: 'Syne', sans-serif; }

        /* ── Layout ─────────────────────────────────────── */
        .app-layout { display: flex; min-height: 100vh; }

        .sidebar {
          width: 210px; min-width: 210px; background: #111; min-height: 100vh;
          position: sticky; top: 0; height: 100vh; overflow-y: auto;
          display: flex; flex-direction: column; flex-shrink: 0;
        }

        .sidebar-top { padding: 28px 20px 24px; border-bottom: 1px solid #222; }
        .sidebar-brand-label {
          font-size: 9px; font-weight: 600; letter-spacing: 0.2em;
          text-transform: uppercase; color: #c2800a; display: block;
          font-family: 'Syne', sans-serif; margin-bottom: 4px;
        }
        .sidebar-brand-name {
          font-size: 22px; font-weight: 800; color: #fff;
          letter-spacing: -0.02em; line-height: 1; font-family: 'Syne', sans-serif;
        }

        .sidebar-nav { padding: 20px 0; flex: 1; }
        .sidebar-section {
          padding: 0 20px 8px; font-size: 8px; font-weight: 700;
          letter-spacing: 0.22em; text-transform: uppercase; color: #3a3a3a;
          font-family: 'Syne', sans-serif;
        }
        .sidebar-section + .sidebar-section { margin-top: 20px; }

        .sidebar-btn {
          display: flex; align-items: center; gap: 10px; padding: 9px 20px;
          background: transparent; border: none; cursor: pointer;
          font-family: 'Syne', sans-serif; font-size: 12px; font-weight: 600;
          color: #555; letter-spacing: 0.03em; text-align: left; width: 100%;
          transition: color 0.12s, background 0.12s;
          border-left: 2px solid transparent;
        }
        .sidebar-btn:hover { color: #bbb; background: rgba(255,255,255,0.04); }
        .sidebar-btn.active { color: #fff; border-left-color: #c2800a; background: rgba(255,255,255,0.06); }

        .provider-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

        .sidebar-footer {
          padding: 16px 20px; border-top: 1px solid #1e1e1e;
          font-family: 'DM Mono', monospace; font-size: 11px; color: #444;
        }
        .sync-status { display: flex; align-items: center; gap: 6px; }
        .sync-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #22c55e; flex-shrink: 0;
          animation: pulse 2s ease-in-out infinite;
        }
        .sync-dot.syncing {
          background: #c2800a; animation: spin 0.7s linear infinite;
          border-radius: 0; clip-path: polygon(50% 0%,100% 50%,50% 100%,0% 50%);
        }

        /* ── Main panel ──────────────────────────────────── */
        .main-panel { flex: 1; min-width: 0; background: #f5f4f0; padding: 32px 36px 80px; }

        .top-bar {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
          margin-bottom: 28px; padding-bottom: 24px; border-bottom: 1px solid #e0dfd9;
        }
        .date-group {
          display: flex; align-items: center; gap: 16px;
          background: #fff; border: 1px solid #dddcd8; border-radius: 4px;
          padding: 0 14px; height: 38px; flex-shrink: 0;
        }
        .date-sep { width: 1px; height: 16px; background: #dddcd8; }
        .apply-btn {
          height: 38px; padding: 0 16px; background: #1a1a1a; color: #fff;
          border: none; border-radius: 4px; font-family: 'Syne', sans-serif;
          font-size: 12px; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; cursor: pointer; transition: opacity 0.15s;
        }
        .apply-btn:hover { opacity: 0.75; }
        .apply-btn:disabled { opacity: 0.4; cursor: default; }

        /* ── Summary cards ───────────────────────────────── */
        .summary {
          display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #e0dfd9;
          border: 1px solid #e0dfd9; border-radius: 4px; overflow: hidden; margin-top: 16px;
        }
        @media (min-width: 768px) { .summary { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 1100px) { .summary { grid-template-columns: repeat(6, 1fr); } }
        .summary-cell { background: #fff; padding: 14px 18px; display: flex; flex-direction: column; gap: 6px; }
        .summary-label { font-size: 8px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #aaa; }
        .summary-value { font-family: 'DM Mono', monospace; font-size: 20px; font-weight: 500; color: #1a1a1a; letter-spacing: -0.02em; }
        .summary-value.amber { color: #c2800a; }

        .my-cut { display: flex; align-items: center; gap: 6px; justify-content: flex-end; margin-top: 8px; }
        .my-cut-label { font-size: 9px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #bbb; }
        .my-cut-value { font-family: 'DM Mono', monospace; font-size: 12px; color: #999; }

        /* ── Tables ──────────────────────────────────────── */
        .table-wrap { margin-top: 16px; border: 1px solid #e0dfd9; border-radius: 4px; overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; min-width: 600px; }
        thead tr { background: #f0efe9; border-bottom: 1px solid #e0dfd9; }
        th { padding: 10px 14px; text-align: right; font-size: 9px; font-weight: 700;
          letter-spacing: 0.14em; text-transform: uppercase; color: #aaa; white-space: nowrap; }
        th:first-child { text-align: left; }
        tbody tr { border-bottom: 1px solid #eeede8; background: #fff; transition: background 0.1s; }
        tbody tr:last-child { border-bottom: none; }
        tbody tr:hover { background: #faf9f6; }
        td { padding: 11px 14px; text-align: right; font-family: 'DM Mono', monospace; font-size: 12px; color: #888; white-space: nowrap; }
        td:first-child { text-align: left; font-family: 'Syne', sans-serif; font-size: 12px; font-weight: 500; color: #1a1a1a; }
        td.revenue { color: #c2800a; font-weight: 500; }
        td.clicks { color: #1a1a1a; }

        .config-tag { display: inline-block; padding: 2px 8px; background: #f0efe9;
          border: 1px solid #dddcd8; border-radius: 2px; font-family: 'DM Mono', monospace;
          font-size: 12px; color: #555; }

        /* ── Filters ─────────────────────────────────────── */
        .filters { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
        .filter-select {
          height: 34px; padding: 0 10px; background: #fff; border: 1px solid #dddcd8;
          border-radius: 4px; font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 600;
          color: #555; cursor: pointer; letter-spacing: 0.04em; appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23aaa'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 8px center; padding-right: 24px;
        }
        .filter-select:focus { outline: none; border-color: #1a1a1a; }
        .filter-clear { height: 34px; padding: 0 12px; background: transparent; border: 1px solid #dddcd8;
          border-radius: 4px; font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700;
          color: #aaa; cursor: pointer; letter-spacing: 0.06em; text-transform: uppercase; }
        .filter-clear:hover { color: #555; border-color: #999; }

        /* ── State rows ──────────────────────────────────── */
        .state-row { padding: 64px 0; text-align: center; color: #bbb; font-size: 13px; letter-spacing: 0.06em; }
        .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #ddd;
          border-top-color: #1a1a1a; border-radius: 50%; animation: spin 0.7s linear infinite;
          margin-right: 10px; vertical-align: middle; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

        .error-msg { margin-bottom: 16px; padding: 12px 16px; background: #fef2f2;
          border: 1px solid #fecaca; border-radius: 4px; color: #dc2626;
          font-family: 'DM Mono', monospace; font-size: 12px; }

        .hour-badge { display: inline-flex; align-items: center; justify-content: center;
          width: 32px; height: 20px; background: #f0efe9; border: 1px solid #dddcd8;
          border-radius: 2px; font-size: 11px; color: #888; }

        /* ── Analytics ───────────────────────────────────── */
        .analytics-grid { display: grid; grid-template-columns: 1fr; gap: 16px; margin-top: 20px; }
        @media (min-width: 900px) { .analytics-grid { grid-template-columns: 1fr 1fr; } }
        .chart-card { background: #fff; border: 1px solid #e0dfd9; border-radius: 4px; padding: 20px 20px 16px; }
        .chart-card.full { grid-column: 1 / -1; }
        .chart-title { font-size: 10px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #888; margin-bottom: 16px; }
        .chart-title span { color: #1a1a1a; }
        .push-stop-grid { display: grid; grid-template-columns: 1fr; gap: 16px; margin-top: 16px; }
        @media (min-width: 700px) { .push-stop-grid { grid-template-columns: 1fr 1fr; } }
        .signal-card { background: #fff; border: 1px solid #e0dfd9; border-radius: 4px; overflow: hidden; }
        .signal-header { padding: 12px 16px; font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; display: flex; align-items: center; gap: 8px; }
        .signal-header.push { background: #f0fdf4; color: #16a34a; border-bottom: 1px solid #dcfce7; }
        .signal-header.stop { background: #fef2f2; color: #dc2626; border-bottom: 1px solid #fecaca; }
        .signal-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .signal-row { padding: 10px 16px; border-bottom: 1px solid #f5f4f0; display: flex; align-items: center; gap: 8px; }
        .signal-row:last-child { border-bottom: none; }
        .signal-rank { font-family: 'DM Mono', monospace; font-size: 10px; color: #ccc; width: 16px; flex-shrink: 0; }
        .signal-query { font-family: 'DM Mono', monospace; font-size: 11px; color: #555; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .signal-rpc { font-family: 'DM Mono', monospace; font-size: 12px; font-weight: 500; flex-shrink: 0; }
        .signal-meta { font-family: 'DM Mono', monospace; font-size: 10px; color: #bbb; flex-shrink: 0; }
        .analytics-empty { text-align: center; padding: 64px 0; color: #bbb; font-size: 13px; letter-spacing: 0.06em; }
        .legend { display: flex; gap: 16px; margin-bottom: 12px; flex-wrap: wrap; }
        .legend-item { display: flex; align-items: center; gap: 6px; }
        .legend-dot { width: 8px; height: 8px; border-radius: 50%; }
        .legend-label { font-size: 10px; color: #888; font-family: 'Syne', sans-serif; font-weight: 600; letter-spacing: 0.08em; }
        .rpc-legend { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
        .rpc-legend-item { display: flex; align-items: center; gap: 5px; font-size: 9px; color: #999; font-family: 'Syne', sans-serif; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; }
        .rpc-legend-swatch { width: 10px; height: 10px; border-radius: 2px; }

        /* ── Page title ──────────────────────────────────── */
        .page-title { font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #aaa; margin-bottom: 4px; }
        .page-subtitle { font-size: 20px; font-weight: 800; color: #111; letter-spacing: -0.02em; margin-right: auto; }
      `}</style>

      <div className="app-layout">

        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-top">
            <span className="sidebar-brand-label">Reporting</span>
            <span className="sidebar-brand-name">Bidberry</span>
          </div>

          <nav className="sidebar-nav">
            <div className="sidebar-section">Providers</div>
            <button
              className={`sidebar-btn ${activeProvider === 'enki' ? 'active' : ''}`}
              onClick={() => setActiveProvider('enki')}
            >
              <span className="provider-dot" style={{ background: '#c2800a' }} />
              ENKI
            </button>
            <button
              className={`sidebar-btn ${activeProvider === 'nexify' ? 'active' : ''}`}
              onClick={() => setActiveProvider('nexify')}
            >
              <span className="provider-dot" style={{ background: '#3b82f6' }} />
              Nexify
            </button>

            <div className="sidebar-section">View</div>
            <button
              className={`sidebar-btn ${activeView === 'daily' ? 'active' : ''}`}
              onClick={() => setActiveView('daily')}
            >
              Daily
            </button>
            <button
              className={`sidebar-btn ${activeView === 'hourly' ? 'active' : ''}`}
              onClick={() => setActiveView('hourly')}
            >
              Hourly
            </button>
            <button
              className={`sidebar-btn ${activeView === 'analytics' ? 'active' : ''}`}
              onClick={() => setActiveView('analytics')}
            >
              Analytics
            </button>
          </nav>

          <div className="sidebar-footer">
            <div className="sync-status" title={syncLog.join('\n')}>
              <span className={`sync-dot${syncing ? ' syncing' : ''}`} />
              <span>{syncing ? 'syncing…' : lastUpdated
                ? lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : '—'}</span>
            </div>
          </div>
        </aside>

        {/* ── Main panel ── */}
        <main className="main-panel">

          {/* Top bar */}
          <div className="top-bar">
            <div>
              <div className="page-title">{activeProvider === 'enki' ? 'ENKI' : 'Nexify'}</div>
              <div className="page-subtitle">
                {activeView === 'daily' ? 'Daily Report' : activeView === 'hourly' ? 'Hourly Report' : 'Analytics'}
              </div>
            </div>
            <div className="date-group">
              <DatePicker label="From" value={range.from}
                onChange={v => setRange(r => ({ ...r, from: v }))}
                maxDate={range.to}
                onShortcut={(f, t) => setRange({ from: f, to: t })} />
              <div className="date-sep" />
              <DatePicker label="To" value={range.to}
                onChange={v => setRange(r => ({ ...r, to: v }))} />
            </div>
            <button className="apply-btn" onClick={fetchData}>Apply</button>
          </div>

          {error && <div className="error-msg">{error}</div>}

          {/* ────────────────────────── ENKI Daily ─── */}
          {activeProvider === 'enki' && activeView === 'daily' && (
            <>
              <div className="filters">
                <select className="filter-select" value={dailyFilters.config} onChange={e => setDailyFilters(f => ({ ...f, config: e.target.value }))}>
                  <option value="">All Domains</option>
                  {uniqueDailyConfigs.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <select className="filter-select" value={dailyFilters.query} onChange={e => setDailyFilters(f => ({ ...f, query: e.target.value }))}>
                  <option value="">All Queries</option>
                  {uniqueDailyQueries.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                {(dailyFilters.config || dailyFilters.query) && (
                  <button className="filter-clear" onClick={() => setDailyFilters({ config: '', query: '' })}>Clear</button>
                )}
              </div>
              <div className="summary">
                {[
                  { label: 'Revenue (USD)', value: `$${fmt(dailyTotals.revenue)}`, amber: true },
                  { label: 'Clicks', value: fmtInt(dailyTotals.clicks) },
                  { label: 'Searches', value: fmtInt(dailyTotals.searches) },
                  { label: 'RPC', value: dailyTotals.clicks > 0 ? `$${fmt(dailyTotals.revenue / dailyTotals.clicks)}` : '—' },
                  { label: 'CTR', value: dailyTotals.bidded_searches > 0 ? `${fmt(dailyTotals.clicks / dailyTotals.bidded_searches * 100)}%` : '—' },
                  { label: 'RPM', value: dailyTotals.searches > 0 ? `$${fmt(dailyTotals.revenue / dailyTotals.searches * 1000)}` : '—' },
                ].map(({ label, value, amber }) => (
                  <div key={label} className="summary-cell">
                    <span className="summary-label">{label}</span>
                    <span className={`summary-value${amber ? ' amber' : ''}`}>{value}</span>
                  </div>
                ))}
              </div>
              <div className="my-cut">
                <span className="my-cut-label">my cut (20%)</span>
                <span className="my-cut-value">${fmt(dailyTotals.revenue * 0.2)}</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Config</th><th>Market</th><th>Device</th><th>Query</th>
                    <th>Rev (USD)</th><th>Clicks</th><th>Searches</th><th>Bidded Srch</th>
                    <th>RPC</th><th>CTR</th><th>RPM</th>
                  </tr></thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={11}><div className="state-row"><span className="spinner" />Loading…</div></td></tr>
                    ) : filteredDaily.length === 0 ? (
                      <tr><td colSpan={11}><div className="state-row">No data for this period</div></td></tr>
                    ) : filteredDaily.map((row, i) => (
                      <tr key={i}>
                        <td><span className="config-tag">{row.config_name}</span></td>
                        <td style={{textAlign:'left',color:'#666',fontSize:12}}>{row.market}</td>
                        <td style={{textAlign:'left',color:'#666',fontSize:12}}>{row.device}</td>
                        <td style={{textAlign:'left',fontFamily:"'DM Mono',monospace",fontSize:12,color:'#aaa',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis'}}>{row.ads_query}</td>
                        <td className="revenue">${fmt(row.revenue)}</td>
                        <td className="clicks">{fmtInt(row.clicks)}</td>
                        <td>{fmtInt(row.searches)}</td>
                        <td>{fmtInt(row.bidded_searches)}</td>
                        <td style={{color:'#c2800a'}}>{row.clicks > 0 ? `$${fmt(row.revenue / row.clicks)}` : '—'}</td>
                        <td>{row.bidded_searches > 0 ? `${fmt(row.clicks / row.bidded_searches * 100)}%` : '—'}</td>
                        <td>{row.searches > 0 ? `$${fmt(row.revenue / row.searches * 1000)}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ────────────────────────── ENKI Hourly ─── */}
          {activeProvider === 'enki' && activeView === 'hourly' && (
            <>
              <div className="filters">
                <select className="filter-select" value={filters.config} onChange={e => setFilters(f => ({ ...f, config: e.target.value }))}>
                  <option value="">All Configs</option>
                  {uniqueConfigs.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <select className="filter-select" value={filters.query} onChange={e => setFilters(f => ({ ...f, query: e.target.value }))}>
                  <option value="">All Queries</option>
                  {uniqueQueries.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <select className="filter-select" value={filters.device} onChange={e => setFilters(f => ({ ...f, device: e.target.value }))}>
                  <option value="">All Devices</option>
                  {uniqueDevices.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <select className="filter-select" value={filters.hour} onChange={e => setFilters(f => ({ ...f, hour: e.target.value }))}>
                  <option value="">All Hours</option>
                  {uniqueHours.map(h => <option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>)}
                </select>
                {(filters.config || filters.query || filters.device || filters.hour) && (
                  <button className="filter-clear" onClick={() => setFilters({ config: '', query: '', device: '', hour: '' })}>Clear</button>
                )}
              </div>
              <div className="summary">
                {[
                  { label: 'Revenue (USD)', value: `$${fmt(hourlyTotals.revenue)}`, amber: true },
                  { label: 'Clicks', value: fmtInt(hourlyTotals.clicks) },
                  { label: 'Bidded Searches', value: fmtInt(hourlyTotals.bidded_searches) },
                  { label: 'RPC', value: hourlyTotals.clicks > 0 ? `$${fmt(hourlyTotals.revenue / hourlyTotals.clicks)}` : '—' },
                  { label: 'CTR', value: hourlyTotals.bidded_searches > 0 ? `${fmt(hourlyTotals.clicks / hourlyTotals.bidded_searches * 100)}%` : '—' },
                  { label: 'RPM', value: hourlyTotals.searches > 0 ? `$${fmt(hourlyTotals.revenue / hourlyTotals.searches * 1000)}` : '—' },
                ].map(({ label, value, amber }) => (
                  <div key={label} className="summary-cell">
                    <span className="summary-label">{label}</span>
                    <span className={`summary-value${amber ? ' amber' : ''}`}>{value}</span>
                  </div>
                ))}
              </div>
              <div className="my-cut">
                <span className="my-cut-label">my cut (20%)</span>
                <span className="my-cut-value">${fmt(hourlyTotals.revenue * 0.2)}</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Date</th><th>Hour</th><th>Config</th><th>Market</th><th>Device</th><th>Query</th>
                    <th>Rev (USD)</th><th>Clicks</th><th>Bidded Srch</th><th>RPC</th><th>CTR</th><th>RPM</th>
                  </tr></thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={12}><div className="state-row"><span className="spinner" />Loading…</div></td></tr>
                    ) : filteredHourly.length === 0 ? (
                      <tr><td colSpan={12}><div className="state-row">No data for this period</div></td></tr>
                    ) : filteredHourly.map((row, i) => (
                      <tr key={i}>
                        <td style={{fontFamily:"'DM Mono',monospace",textAlign:'left',color:'#666'}}>{String(row.report_date).split('T')[0]}</td>
                        <td><span className="hour-badge">{String(row.report_hour).padStart(2,'0')}</span></td>
                        <td style={{textAlign:'left'}}><span className="config-tag">{row.config_name}</span></td>
                        <td style={{textAlign:'left',color:'#666',fontSize:12}}>{row.market}</td>
                        <td style={{textAlign:'left',color:'#666',fontSize:12}}>{row.device}</td>
                        <td style={{textAlign:'left',fontFamily:"'DM Mono',monospace",fontSize:12,color:'#aaa',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis'}}>{row.ads_query}</td>
                        <td className="revenue">${fmt(row.revenue)}</td>
                        <td className="clicks">{fmtInt(row.clicks)}</td>
                        <td>{fmtInt(row.bidded_searches)}</td>
                        <td style={{color:'#c2800a'}}>{row.clicks > 0 ? `$${fmt(row.revenue / row.clicks)}` : '—'}</td>
                        <td>{row.bidded_searches > 0 ? `${fmt(row.clicks / row.bidded_searches * 100)}%` : '—'}</td>
                        <td>{row.searches > 0 ? `$${fmt(row.revenue / row.searches * 1000)}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ────────────────────────── ENKI Analytics ─── */}
          {activeProvider === 'enki' && activeView === 'analytics' && (
            <>
              {trendData.length === 0 && queryRPCData.length === 0 ? (
                <div className="analytics-empty">No data for this period</div>
              ) : (
                <>
                  <div className="analytics-grid">
                    <div className="chart-card">
                      <div className="chart-title">Revenue Over Time <span style={{color:'#aaa',fontWeight:400,textTransform:'none',letterSpacing:0}}>(USD)</span></div>
                      <div className="legend">
                        <div className="legend-item"><div className="legend-dot" style={{background:'#c2800a'}} /><span className="legend-label">Total Revenue</span></div>
                        <div className="legend-item"><div className="legend-dot" style={{background:'#d4b896',border:'1px dashed #c2800a'}} /><span className="legend-label">My Cut (20%)</span></div>
                      </div>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={revenueByDate} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0efe9" />
                          <XAxis dataKey="date" tick={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fill: '#aaa' }} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fill: '#aaa' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(0)}`} width={48} />
                          <Tooltip content={<ChartTooltip valueFormatter={(v) => `$${fmt(v)}`} />} />
                          <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#c2800a" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="myRevenue" name="My cut" stroke="#d4b896" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="chart-card">
                      <div className="chart-title">Traffic Over Time</div>
                      <div className="legend">
                        <div className="legend-item"><div className="legend-dot" style={{background:'#1a1a1a'}} /><span className="legend-label">Clicks</span></div>
                        <div className="legend-item"><div className="legend-dot" style={{background:'#c8c7c0'}} /><span className="legend-label">Searches</span></div>
                      </div>
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={trafficByDate} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0efe9" />
                          <XAxis dataKey="date" tick={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fill: '#aaa' }} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fill: '#aaa' }} tickLine={false} axisLine={false} tickFormatter={v => fmtInt(v)} width={48} />
                          <Tooltip content={<ChartTooltip valueFormatter={(v) => fmtInt(v)} />} />
                          <Area type="monotone" dataKey="searches" name="Searches" stroke="#e0dfd9" fill="#f5f4f0" strokeWidth={1.5} />
                          <Area type="monotone" dataKey="clicks" name="Clicks" stroke="#1a1a1a" fill="#e8e7e2" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  {queryRPCWithColors.length > 0 && (
                    <div className="chart-card full" style={{ marginTop: 16 }}>
                      <div className="chart-title">Query RPC Ranking — <span>top {Math.min(queryRPCWithColors.length, 20)} queries by revenue per click</span></div>
                      <div className="rpc-legend">
                        <div className="rpc-legend-item"><div className="rpc-legend-swatch" style={{background:'#22c55e'}} />Push (top 25%)</div>
                        <div className="rpc-legend-item"><div className="rpc-legend-swatch" style={{background:'#c2800a'}} />Monitor (mid 50%)</div>
                        <div className="rpc-legend-item"><div className="rpc-legend-swatch" style={{background:'#ef4444'}} />Stop (bottom 25%)</div>
                      </div>
                      <ResponsiveContainer width="100%" height={Math.max(180, Math.min(queryRPCWithColors.length, 20) * 28)}>
                        <BarChart layout="vertical" data={queryRPCWithColors.slice(0, 20)} margin={{ top: 0, right: 48, bottom: 0, left: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f5f4f0" horizontal={false} />
                          <XAxis type="number" tick={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fill: '#aaa' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(3)}`} />
                          <YAxis type="category" dataKey="queryShort" width={160} tick={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fill: '#666' }} tickLine={false} axisLine={false} />
                          <Tooltip content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            const d = payload[0].payload
                            return (
                              <div style={{ background: '#fff', border: '1px solid #dddcd8', borderRadius: 4, padding: '8px 12px', fontFamily: "'DM Mono',monospace", fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.07)', maxWidth: 260 }}>
                                <div style={{ color: '#555', fontSize: 11, marginBottom: 6, wordBreak: 'break-all' }}>{d.query}</div>
                                <div style={{ color: '#c2800a' }}>RPC: ${fmt(d.rpc)}</div>
                                <div style={{ color: '#888', fontSize: 11 }}>Revenue: ${fmt(d.revenue)} · Clicks: {fmtInt(d.clicks)}</div>
                              </div>
                            )
                          }} />
                          <Bar dataKey="rpc" name="RPC" radius={[0, 2, 2, 0]}>
                            {queryRPCWithColors.slice(0, 20).map((entry, i) => (
                              <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {(pushQueries.length > 0 || stopQueries.length > 0) && (
                    <div className="push-stop-grid">
                      <div className="signal-card">
                        <div className="signal-header push"><div className="signal-dot" style={{ background: '#22c55e' }} />Queries to Push<span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 4 }}>— high RPC, scale up</span></div>
                        {pushQueries.length === 0 ? <div style={{ padding: '16px', color: '#bbb', fontSize: 12 }}>Not enough data</div>
                          : pushQueries.map((q, i) => (
                            <div key={i} className="signal-row">
                              <span className="signal-rank">#{i + 1}</span>
                              <span className="signal-query">{q.query}</span>
                              <span className="signal-rpc" style={{ color: '#16a34a' }}>${fmt(q.rpc)}</span>
                              <span className="signal-meta">{fmtInt(q.clicks)} clk</span>
                            </div>
                          ))}
                      </div>
                      <div className="signal-card">
                        <div className="signal-header stop"><div className="signal-dot" style={{ background: '#ef4444' }} />Queries to Stop<span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 4 }}>— low RPC, cut spend</span></div>
                        {stopQueries.length === 0 ? <div style={{ padding: '16px', color: '#bbb', fontSize: 12 }}>Not enough data</div>
                          : stopQueries.map((q, i) => (
                            <div key={i} className="signal-row">
                              <span className="signal-rank">#{i + 1}</span>
                              <span className="signal-query">{q.query}</span>
                              <span className="signal-rpc" style={{ color: '#dc2626' }}>${fmt(q.rpc)}</span>
                              <span className="signal-meta">{fmtInt(q.clicks)} clk</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ────────────────────────── Nexify Daily ─── */}
          {activeProvider === 'nexify' && activeView === 'daily' && (
            <>
              <div className="filters">
                {uniqueNxDomains.length > 0 && (
                  <select className="filter-select" value={nexifyFilters.domain} onChange={e => setNexifyFilters(f => ({ ...f, domain: e.target.value }))}>
                    <option value="">All Domains</option>
                    {uniqueNxDomains.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
                {uniqueNxSources.length > 0 && (
                  <select className="filter-select" value={nexifyFilters.source} onChange={e => setNexifyFilters(f => ({ ...f, source: e.target.value }))}>
                    <option value="">All Sources</option>
                    {uniqueNxSources.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
                {(nexifyFilters.domain || nexifyFilters.source) && (
                  <button className="filter-clear" onClick={() => setNexifyFilters(f => ({ ...f, domain: '', source: '' }))}>Clear</button>
                )}
              </div>
              <div className="summary">
                {[
                  { label: 'Revenue (USD)', value: `$${fmt(nxTotals.revenue)}`, amber: true },
                  { label: 'Revenue (EUR)', value: `€${fmt(nxTotals.amount_eur)}` },
                  { label: 'Clicks', value: fmtInt(nxTotals.clicks) },
                  { label: 'Searches', value: fmtInt(nxTotals.searches) },
                  { label: 'RPC', value: nxTotals.clicks > 0 ? `$${fmt(nxTotals.revenue / nxTotals.clicks)}` : '—' },
                  { label: 'CTR', value: nxTotals.bidded_searches > 0 ? `${fmt(nxTotals.clicks / nxTotals.bidded_searches * 100)}%` : '—' },
                ].map(({ label, value, amber }) => (
                  <div key={label} className="summary-cell">
                    <span className="summary-label">{label}</span>
                    <span className={`summary-value${amber ? ' amber' : ''}`}>{value}</span>
                  </div>
                ))}
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Domain</th><th>Market</th><th>Device</th><th>Channel</th>
                    <th>Source</th><th>TQ</th><th>Rev (USD)</th><th>Rev (EUR)</th>
                    <th>Clicks</th><th>Searches</th><th>RPC</th><th>CTR</th>
                  </tr></thead>
                  <tbody>
                    {nexifyLoading ? (
                      <tr><td colSpan={12}><div className="state-row"><span className="spinner" />Loading…</div></td></tr>
                    ) : filteredNxDaily.length === 0 ? (
                      <tr><td colSpan={12}><div className="state-row">No data for this period</div></td></tr>
                    ) : filteredNxDaily.map((row, i) => (
                      <tr key={i}>
                        <td><span className="config-tag">{row.domain}</span></td>
                        <td style={{textAlign:'left',color:'#666',fontSize:12}}>{row.market}</td>
                        <td style={{textAlign:'left',color:'#666',fontSize:12}}>{row.device}</td>
                        <td style={{textAlign:'left',fontFamily:"'DM Mono',monospace",fontSize:12,color:'#aaa',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis'}}>{row.ads_query}</td>
                        <td style={{textAlign:'left',color:'#666',fontSize:12}}>{row.source_type}</td>
                        <td style={{color:'#888',fontSize:12}}>{row.tq_score || '—'}</td>
                        <td className="revenue">${fmt(row.revenue)}</td>
                        <td style={{color:'#888'}}>€{fmt(row.amount_eur)}</td>
                        <td className="clicks">{fmtInt(row.clicks)}</td>
                        <td>{fmtInt(row.searches)}</td>
                        <td style={{color:'#c2800a'}}>{row.clicks > 0 ? `$${fmt(row.revenue / row.clicks)}` : '—'}</td>
                        <td>{row.bidded_searches > 0 ? `${fmt(row.clicks / row.bidded_searches * 100)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ────────────────────────── Nexify Hourly ─── */}
          {activeProvider === 'nexify' && activeView === 'hourly' && (
            <>
              <div className="filters">
                {uniqueNxHDomains.length > 0 && (
                  <select className="filter-select" value={nexifyFilters.domain} onChange={e => setNexifyFilters(f => ({ ...f, domain: e.target.value }))}>
                    <option value="">All Domains</option>
                    {uniqueNxHDomains.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
                {uniqueNxHSources.length > 0 && (
                  <select className="filter-select" value={nexifyFilters.source} onChange={e => setNexifyFilters(f => ({ ...f, source: e.target.value }))}>
                    <option value="">All Sources</option>
                    {uniqueNxHSources.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
                {uniqueNxHDevices.length > 0 && (
                  <select className="filter-select" value={nexifyFilters.device} onChange={e => setNexifyFilters(f => ({ ...f, device: e.target.value }))}>
                    <option value="">All Devices</option>
                    {uniqueNxHDevices.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
                {uniqueNxHHours.length > 0 && (
                  <select className="filter-select" value={nexifyFilters.hour} onChange={e => setNexifyFilters(f => ({ ...f, hour: e.target.value }))}>
                    <option value="">All Hours</option>
                    {uniqueNxHHours.map(h => <option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>)}
                  </select>
                )}
                {(nexifyFilters.domain || nexifyFilters.source || nexifyFilters.device || nexifyFilters.hour) && (
                  <button className="filter-clear" onClick={() => setNexifyFilters({ domain: '', source: '', device: '', hour: '' })}>Clear</button>
                )}
              </div>
              <div className="summary">
                {[
                  { label: 'Revenue (USD)', value: `$${fmt(nxTotals.revenue)}`, amber: true },
                  { label: 'Revenue (EUR)', value: `€${fmt(nxTotals.amount_eur)}` },
                  { label: 'Clicks', value: fmtInt(nxTotals.clicks) },
                  { label: 'Searches', value: fmtInt(nxTotals.searches) },
                  { label: 'RPC', value: nxTotals.clicks > 0 ? `$${fmt(nxTotals.revenue / nxTotals.clicks)}` : '—' },
                  { label: 'CTR', value: nxTotals.bidded_searches > 0 ? `${fmt(nxTotals.clicks / nxTotals.bidded_searches * 100)}%` : '—' },
                ].map(({ label, value, amber }) => (
                  <div key={label} className="summary-cell">
                    <span className="summary-label">{label}</span>
                    <span className={`summary-value${amber ? ' amber' : ''}`}>{value}</span>
                  </div>
                ))}
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Date</th><th>Hour</th><th>Domain</th><th>Market</th><th>Device</th>
                    <th>Channel</th><th>Source</th><th>Rev (USD)</th><th>Clicks</th>
                    <th>Searches</th><th>RPC</th><th>CTR</th>
                  </tr></thead>
                  <tbody>
                    {nexifyLoading ? (
                      <tr><td colSpan={12}><div className="state-row"><span className="spinner" />Loading…</div></td></tr>
                    ) : filteredNxHourly.length === 0 ? (
                      <tr><td colSpan={12}><div className="state-row">No data for this period</div></td></tr>
                    ) : filteredNxHourly.map((row, i) => (
                      <tr key={i}>
                        <td style={{fontFamily:"'DM Mono',monospace",textAlign:'left',color:'#666'}}>{String(row.report_date).split('T')[0]}</td>
                        <td><span className="hour-badge">{String(row.report_hour).padStart(2,'0')}</span></td>
                        <td style={{textAlign:'left'}}><span className="config-tag">{row.domain}</span></td>
                        <td style={{textAlign:'left',color:'#666',fontSize:12}}>{row.market}</td>
                        <td style={{textAlign:'left',color:'#666',fontSize:12}}>{row.device}</td>
                        <td style={{textAlign:'left',fontFamily:"'DM Mono',monospace",fontSize:12,color:'#aaa',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis'}}>{row.ads_query}</td>
                        <td style={{textAlign:'left',color:'#666',fontSize:12}}>{row.source_type}</td>
                        <td className="revenue">${fmt(row.revenue)}</td>
                        <td className="clicks">{fmtInt(row.clicks)}</td>
                        <td>{fmtInt(row.searches)}</td>
                        <td style={{color:'#c2800a'}}>{row.clicks > 0 ? `$${fmt(row.revenue / row.clicks)}` : '—'}</td>
                        <td>{row.bidded_searches > 0 ? `${fmt(row.clicks / row.bidded_searches * 100)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ────────────────────────── Nexify Analytics ─── */}
          {activeProvider === 'nexify' && activeView === 'analytics' && (
            <>
              {nexifyTrendData.length === 0 && nexifyChannelRPCData.length === 0 ? (
                <div className="analytics-empty">No data for this period</div>
              ) : (
                <>
                  <div className="analytics-grid">
                    <div className="chart-card">
                      <div className="chart-title">Revenue Over Time <span style={{color:'#aaa',fontWeight:400,textTransform:'none',letterSpacing:0}}>(USD)</span></div>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={nexifyRevenueByDate} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0efe9" />
                          <XAxis dataKey="date" tick={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fill: '#aaa' }} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fill: '#aaa' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(0)}`} width={48} />
                          <Tooltip content={<ChartTooltip valueFormatter={(v) => `$${fmt(v)}`} />} />
                          <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="chart-card">
                      <div className="chart-title">Traffic Over Time</div>
                      <div className="legend">
                        <div className="legend-item"><div className="legend-dot" style={{background:'#1a1a1a'}} /><span className="legend-label">Clicks</span></div>
                        <div className="legend-item"><div className="legend-dot" style={{background:'#c8c7c0'}} /><span className="legend-label">Searches</span></div>
                      </div>
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={nexifyTrafficByDate} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0efe9" />
                          <XAxis dataKey="date" tick={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fill: '#aaa' }} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fill: '#aaa' }} tickLine={false} axisLine={false} tickFormatter={v => fmtInt(v)} width={48} />
                          <Tooltip content={<ChartTooltip valueFormatter={(v) => fmtInt(v)} />} />
                          <Area type="monotone" dataKey="searches" name="Searches" stroke="#e0dfd9" fill="#f5f4f0" strokeWidth={1.5} />
                          <Area type="monotone" dataKey="clicks" name="Clicks" stroke="#1a1a1a" fill="#e8e7e2" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  {nexifyChannelRPCWithColors.length > 0 && (
                    <div className="chart-card full" style={{ marginTop: 16 }}>
                      <div className="chart-title">Channel RPC Ranking — <span>top {Math.min(nexifyChannelRPCWithColors.length, 20)} channels by revenue per click</span></div>
                      <div className="rpc-legend">
                        <div className="rpc-legend-item"><div className="rpc-legend-swatch" style={{background:'#22c55e'}} />Push (top 25%)</div>
                        <div className="rpc-legend-item"><div className="rpc-legend-swatch" style={{background:'#3b82f6'}} />Monitor (mid 50%)</div>
                        <div className="rpc-legend-item"><div className="rpc-legend-swatch" style={{background:'#ef4444'}} />Stop (bottom 25%)</div>
                      </div>
                      <ResponsiveContainer width="100%" height={Math.max(180, Math.min(nexifyChannelRPCWithColors.length, 20) * 28)}>
                        <BarChart layout="vertical" data={nexifyChannelRPCWithColors.slice(0, 20)} margin={{ top: 0, right: 48, bottom: 0, left: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f5f4f0" horizontal={false} />
                          <XAxis type="number" tick={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fill: '#aaa' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(3)}`} />
                          <YAxis type="category" dataKey="queryShort" width={160} tick={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fill: '#666' }} tickLine={false} axisLine={false} />
                          <Tooltip content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            const d = payload[0].payload
                            return (
                              <div style={{ background: '#fff', border: '1px solid #dddcd8', borderRadius: 4, padding: '8px 12px', fontFamily: "'DM Mono',monospace", fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.07)', maxWidth: 260 }}>
                                <div style={{ color: '#555', fontSize: 11, marginBottom: 6, wordBreak: 'break-all' }}>{d.query}</div>
                                <div style={{ color: '#3b82f6' }}>RPC: ${fmt(d.rpc)}</div>
                                <div style={{ color: '#888', fontSize: 11 }}>Revenue: ${fmt(d.revenue)} · Clicks: {fmtInt(d.clicks)}</div>
                              </div>
                            )
                          }} />
                          <Bar dataKey="rpc" name="RPC" radius={[0, 2, 2, 0]}>
                            {nexifyChannelRPCWithColors.slice(0, 20).map((entry, i) => (
                              <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {(nexifyPushChannels.length > 0 || nexifyStopChannels.length > 0) && (
                    <div className="push-stop-grid">
                      <div className="signal-card">
                        <div className="signal-header push"><div className="signal-dot" style={{ background: '#22c55e' }} />Channels to Push<span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 4 }}>— high RPC, scale up</span></div>
                        {nexifyPushChannels.length === 0 ? <div style={{ padding: '16px', color: '#bbb', fontSize: 12 }}>Not enough data</div>
                          : nexifyPushChannels.map((q, i) => (
                            <div key={i} className="signal-row">
                              <span className="signal-rank">#{i + 1}</span>
                              <span className="signal-query">{q.query}</span>
                              <span className="signal-rpc" style={{ color: '#16a34a' }}>${fmt(q.rpc)}</span>
                              <span className="signal-meta">{fmtInt(q.clicks)} clk</span>
                            </div>
                          ))}
                      </div>
                      <div className="signal-card">
                        <div className="signal-header stop"><div className="signal-dot" style={{ background: '#ef4444' }} />Channels to Stop<span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 4 }}>— low RPC, cut spend</span></div>
                        {nexifyStopChannels.length === 0 ? <div style={{ padding: '16px', color: '#bbb', fontSize: 12 }}>Not enough data</div>
                          : nexifyStopChannels.map((q, i) => (
                            <div key={i} className="signal-row">
                              <span className="signal-rank">#{i + 1}</span>
                              <span className="signal-query">{q.query}</span>
                              <span className="signal-rpc" style={{ color: '#dc2626' }}>${fmt(q.rpc)}</span>
                              <span className="signal-meta">{fmtInt(q.clicks)} clk</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

        </main>
      </div>
    </>
  )
}
