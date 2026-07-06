'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, AreaChart, Area, Cell,
} from 'recharts'

// ── Types ──────────────────────────────────────────────────────────
type Breakdown = 'daily' | 'hourly'
type ActiveTab = 'daily' | 'hourly' | 'analytics' | 'nexify'
type NexifySubTab = 'daily' | 'hourly'

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
      {/* Shortcuts */}
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
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={prev} style={navBtn}>‹</button>
        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>
          {MONTHS[cursor.month]} {cursor.year}
        </span>
        <button onClick={next} style={navBtn}>›</button>
      </div>
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
        {DAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: '#bbb', letterSpacing: '0.08em', padding: '2px 0' }}>{d}</div>
        ))}
      </div>
      {/* Day cells */}
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
  const [breakdown, setBreakdown] = useState<Breakdown>('daily')
  const [activeTab, setActiveTab] = useState<ActiveTab>('daily')
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
  // Nexify state
  const [nexifySubTab, setNexifySubTab] = useState<NexifySubTab>('daily')
  const [nexifyDailyData, setNexifyDailyData] = useState<NexifyDailyRow[]>([])
  const [nexifyHourlyData, setNexifyHourlyData] = useState<NexifyHourlyRow[]>([])
  const [nexifyLoading, setNexifyLoading] = useState(false)
  const [nexifyFilters, setNexifyFilters] = useState({ domain: '', source: '', device: '', hour: '' })

  const fetchAll = useCallback(async (from: string, to: string, bd: Breakdown) => {
    if (!from || !to) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ from, to, breakdown: bd })
      const res = await fetch(`/api/report-data?${params}`)
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      if (bd === 'daily') setDailyData(json)
      else setHourlyData(json)

      // Always also refresh daily + trend
      const [dailyRes, trendRes] = await Promise.all([
        fetch(`/api/report-data?${new URLSearchParams({ from, to, breakdown: 'daily' })}`),
        fetch(`/api/report-data?${new URLSearchParams({ from, to, breakdown: 'trend' })}`),
      ])
      if (dailyRes.ok) setDailyData(await dailyRes.json())
      if (trendRes.ok) setTrendData(await trendRes.json())

      setLastUpdated(new Date())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchData = useCallback(() => {
    fetchAll(range.from, range.to, breakdown)
  }, [fetchAll, range.from, range.to, breakdown])

  const fetchNexify = useCallback(async (from: string, to: string) => {
    if (!from || !to) return
    setNexifyLoading(true)
    try {
      const [dailyRes, hourlyRes] = await Promise.all([
        fetch(`/api/report-data?${new URLSearchParams({ from, to, breakdown: 'daily', provider: 'nexify' })}`),
        fetch(`/api/report-data?${new URLSearchParams({ from, to, breakdown: 'hourly', provider: 'nexify' })}`),
      ])
      if (dailyRes.ok) setNexifyDailyData(await dailyRes.json())
      if (hourlyRes.ok) setNexifyHourlyData(await hourlyRes.json())
    } catch {
      // silent
    } finally {
      setNexifyLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchNexify(range.from, range.to) }, [fetchNexify, range.from, range.to])

  // Auto-refresh display every 5 minutes
  useEffect(() => {
    const id = setInterval(() => { fetchData() }, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchData])

  // Sync with Enki every 2 minutes: request reports + process pending jobs
  const runSync = useCallback(async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/sync')
      const json = await res.json()
      setSyncLog(json.log ?? [])
      // After sync, refresh data to pick up newly processed reports
      await fetchAll(range.from, range.to, breakdown)
    } catch {
      // silent
    } finally {
      setSyncing(false)
    }
  }, [fetchAll, range.from, range.to, breakdown])

  useEffect(() => {
    runSync() // run immediately on mount
    const id = setInterval(runSync, 2 * 60 * 1000)
    return () => clearInterval(id)
  }, [runSync])

  // ── Analytics computed data ────────────────────────────────────
  const revenueByDate = useMemo(() =>
    trendData.map(r => ({
      date: r.report_date.slice(5), // MM-DD
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
      color: i < Math.ceil(n * 0.25)
        ? '#22c55e'
        : i >= Math.floor(n * 0.75)
          ? '#ef4444'
          : '#c2800a',
    }))
  }, [queryRPCData])

  const pushQueries = useMemo(() =>
    queryRPCWithColors.filter(q => q.color === '#22c55e').slice(0, 5)
  , [queryRPCWithColors])

  const stopQueries = useMemo(() =>
    queryRPCWithColors.filter(q => q.color === '#ef4444').slice(-5).reverse()
  , [queryRPCWithColors])

  // ── Daily/Hourly derived ──────────────────────────────────────
  const uniqueDailyConfigs = [...new Set(dailyData.map(r => r.config_name))].filter(Boolean).sort()
  const uniqueDailyQueries = [...new Set(dailyData.map(r => r.ads_query))].filter(Boolean).sort()

  const filteredDaily = dailyData.filter(r =>
    (!dailyFilters.config || r.config_name === dailyFilters.config) &&
    (!dailyFilters.query || r.ads_query === dailyFilters.query)
  )

  const dailyTotals = filteredDaily.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      amount_eur: acc.amount_eur + r.amount_eur,
      clicks: acc.clicks + r.clicks,
      searches: acc.searches + r.searches,
      bidded_searches: acc.bidded_searches + r.bidded_searches,
      bidded_results: acc.bidded_results + r.bidded_results,
    }),
    { revenue: 0, amount_eur: 0, clicks: 0, searches: 0, bidded_searches: 0, bidded_results: 0 }
  )

  // Hourly filters
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
      revenue: acc.revenue + r.revenue,
      amount_eur: acc.amount_eur + r.amount_eur,
      clicks: acc.clicks + r.clicks,
      searches: acc.searches + r.searches,
      bidded_searches: acc.bidded_searches + r.bidded_searches,
      bidded_results: acc.bidded_results + r.bidded_results,
    }),
    { revenue: 0, amount_eur: 0, clicks: 0, searches: 0, bidded_searches: 0, bidded_results: 0 }
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f5f4f0; color: #1a1a1a; font-family: 'Syne', sans-serif; min-height: 100vh; }

        .shell { max-width: 1400px; margin: 0 auto; padding: 0 16px 80px; }
        @media (min-width: 640px) { .shell { padding: 0 32px 80px; } }

        .header {
          display: flex; align-items: flex-start; justify-content: space-between;
          padding: 28px 0 24px; border-bottom: 1px solid #e0dfd9; gap: 16px; flex-wrap: wrap;
        }
        @media (min-width: 640px) { .header { padding: 40px 0 32px; align-items: flex-end; } }
        .brand { display: flex; flex-direction: column; gap: 4px; }
        .brand-title { font-size: 11px; font-weight: 600; letter-spacing: 0.18em;
          text-transform: uppercase; color: #c2800a; }
        .brand-name { font-size: 22px; font-weight: 800; color: #111;
          letter-spacing: -0.02em; line-height: 1; }
        @media (min-width: 640px) { .brand-name { font-size: 28px; } }

        .controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; width: 100%; }
        @media (min-width: 640px) { .controls { width: auto; gap: 12px; } }
        .date-group {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          background: #fff; border: 1px solid #dddcd8; border-radius: 4px;
          padding: 0 12px; height: auto; min-height: 38px; flex: 1;
        }
        @media (min-width: 640px) { .date-group { gap: 16px; flex: unset; height: 38px; flex-wrap: nowrap; } }
        .date-sep { display: none; }
        @media (min-width: 640px) { .date-sep { display: block; width: 1px; height: 16px; background: #dddcd8; } }

        .apply-btn {
          height: 38px; padding: 0 16px; background: #1a1a1a; color: #fff;
          border: none; border-radius: 4px; font-family: 'Syne', sans-serif;
          font-size: 12px; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; cursor: pointer; transition: opacity 0.15s; white-space: nowrap;
        }
        .apply-btn:hover { opacity: 0.75; }

        .tabs { display: flex; margin-top: 20px; border-bottom: 1px solid #e0dfd9; }
        @media (min-width: 640px) { .tabs { margin-top: 28px; } }
        .tab {
          padding: 10px 16px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
          text-transform: uppercase; color: #aaa; cursor: pointer; border: none;
          background: transparent; border-bottom: 2px solid transparent; margin-bottom: -1px;
          transition: color 0.15s, border-color 0.15s; font-family: 'Syne', sans-serif;
        }
        @media (min-width: 640px) { .tab { padding: 10px 24px; font-size: 12px; } }
        .tab:hover { color: #555; }
        .tab.active { color: #1a1a1a; border-bottom-color: #1a1a1a; }

        .summary {
          display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #e0dfd9;
          border: 1px solid #e0dfd9; border-radius: 4px; overflow: hidden; margin-top: 16px;
        }
        @media (min-width: 768px) { .summary { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 1024px) { .summary { grid-template-columns: repeat(6, 1fr); } }
        .summary-cell { background: #fff; padding: 12px 14px;
          display: flex; flex-direction: column; gap: 6px; }
        @media (min-width: 640px) { .summary-cell { padding: 16px 20px; } }
        .summary-label { font-size: 8px; font-weight: 700; letter-spacing: 0.16em;
          text-transform: uppercase; color: #aaa; }
        .summary-value { font-family: 'DM Mono', monospace; font-size: 16px; font-weight: 500;
          color: #1a1a1a; letter-spacing: -0.02em; }
        @media (min-width: 640px) { .summary-value { font-size: 22px; } }
        .summary-value.amber { color: #c2800a; }

        .my-cut {
          display: flex; align-items: center; gap: 6px; justify-content: flex-end;
          margin-top: 8px; padding-right: 2px;
        }
        .my-cut-label { font-size: 9px; font-weight: 600; letter-spacing: 0.12em;
          text-transform: uppercase; color: #bbb; font-family: 'Syne', sans-serif; }
        .my-cut-value { font-family: 'DM Mono', monospace; font-size: 12px; color: #999; }

        .table-wrap { margin-top: 2px; border: 1px solid #e0dfd9; border-radius: 4px;
          overflow-x: auto; -webkit-overflow-scrolling: touch; }
        table { width: 100%; border-collapse: collapse; min-width: 600px; }
        thead tr { background: #f0efe9; border-bottom: 1px solid #e0dfd9; }
        th { padding: 10px 12px; text-align: right; font-size: 9px; font-weight: 700;
          letter-spacing: 0.14em; text-transform: uppercase; color: #aaa; white-space: nowrap; }
        @media (min-width: 640px) { th { padding: 10px 16px; } }
        th:first-child { text-align: left; }
        tbody tr { border-bottom: 1px solid #eeede8; background: #fff; transition: background 0.1s; }
        tbody tr:last-child { border-bottom: none; }
        tbody tr:hover { background: #faf9f6; }
        td { padding: 10px 12px; text-align: right; font-family: 'DM Mono', monospace;
          font-size: 12px; color: #888; white-space: nowrap; }
        @media (min-width: 640px) { td { padding: 12px 16px; font-size: 13px; } }
        td:first-child { text-align: left; font-family: 'Syne', sans-serif;
          font-size: 12px; font-weight: 500; color: #1a1a1a; }
        @media (min-width: 640px) { td:first-child { font-size: 13px; } }
        td.revenue { color: #c2800a; font-weight: 500; }
        td.clicks { color: #1a1a1a; }

        .config-tag { display: inline-block; padding: 2px 8px; background: #f0efe9;
          border: 1px solid #dddcd8; border-radius: 2px; font-family: 'DM Mono', monospace;
          font-size: 12px; color: #555; }

        .state-row { padding: 64px 0; text-align: center; color: #bbb; font-size: 13px; letter-spacing: 0.06em; }
        .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #ddd;
          border-top-color: #1a1a1a; border-radius: 50%; animation: spin 0.7s linear infinite;
          margin-right: 10px; vertical-align: middle; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .error-msg { margin-top: 16px; padding: 12px 16px; background: #fef2f2;
          border: 1px solid #fecaca; border-radius: 4px; color: #dc2626;
          font-family: 'DM Mono', monospace; font-size: 12px; }

        .hour-badge { display: inline-flex; align-items: center; justify-content: center;
          width: 32px; height: 20px; background: #f0efe9; border: 1px solid #dddcd8;
          border-radius: 2px; font-size: 11px; color: #888; }

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

        /* ── Analytics ─────────────────────────────── */
        .analytics-grid {
          display: grid; grid-template-columns: 1fr; gap: 16px; margin-top: 20px;
        }
        @media (min-width: 900px) { .analytics-grid { grid-template-columns: 1fr 1fr; } }

        .chart-card {
          background: #fff; border: 1px solid #e0dfd9; border-radius: 4px;
          padding: 20px 20px 16px;
        }
        .chart-card.full { grid-column: 1 / -1; }

        .chart-title {
          font-size: 10px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
          color: #888; margin-bottom: 16px;
        }
        .chart-title span { color: #1a1a1a; }

        .push-stop-grid {
          display: grid; grid-template-columns: 1fr; gap: 16px; margin-top: 16px;
        }
        @media (min-width: 700px) { .push-stop-grid { grid-template-columns: 1fr 1fr; } }

        .signal-card {
          background: #fff; border: 1px solid #e0dfd9; border-radius: 4px; overflow: hidden;
        }
        .signal-header {
          padding: 12px 16px; font-size: 10px; font-weight: 700; letter-spacing: 0.14em;
          text-transform: uppercase; display: flex; align-items: center; gap: 8px;
        }
        .signal-header.push { background: #f0fdf4; color: #16a34a; border-bottom: 1px solid #dcfce7; }
        .signal-header.stop { background: #fef2f2; color: #dc2626; border-bottom: 1px solid #fecaca; }
        .signal-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

        .signal-row {
          padding: 10px 16px; border-bottom: 1px solid #f5f4f0; display: flex;
          align-items: center; gap: 8px;
        }
        .signal-row:last-child { border-bottom: none; }
        .signal-rank {
          font-family: 'DM Mono', monospace; font-size: 10px; color: #ccc;
          width: 16px; flex-shrink: 0;
        }
        .signal-query {
          font-family: 'DM Mono', monospace; font-size: 11px; color: #555;
          flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .signal-rpc {
          font-family: 'DM Mono', monospace; font-size: 12px; font-weight: 500;
          flex-shrink: 0;
        }
        .signal-meta {
          font-family: 'DM Mono', monospace; font-size: 10px; color: #bbb;
          flex-shrink: 0;
        }

        .analytics-empty {
          text-align: center; padding: 64px 0; color: #bbb;
          font-size: 13px; letter-spacing: 0.06em;
        }

        .refresh-badge {
          display: flex; align-items: center; gap: 6px;
          padding: 4px 10px; background: #f0efe9; border: 1px solid #dddcd8;
          border-radius: 3px; font-family: 'DM Mono', monospace; font-size: 11px;
          color: #aaa; white-space: nowrap;
        }
        .refresh-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #22c55e; flex-shrink: 0;
          animation: pulse 2s ease-in-out infinite;
        }
        .refresh-dot.syncing {
          background: #c2800a;
          animation: spin 0.7s linear infinite;
          border-radius: 0;
          clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .sync-log {
          margin-top: 8px; padding: 8px 12px; background: #f0efe9;
          border: 1px solid #e0dfd9; border-radius: 3px;
          font-family: 'DM Mono', monospace; font-size: 10px; color: #888;
          max-height: 80px; overflow-y: auto;
        }
        .sync-log-line { line-height: 1.6; }

        .legend { display: flex; gap: 16px; margin-bottom: 12px; flex-wrap: wrap; }
        .legend-item { display: flex; align-items: center; gap: 6px; }
        .legend-dot { width: 8px; height: 8px; border-radius: 50%; }
        .legend-label { font-size: 10px; color: #888; font-family: 'Syne', sans-serif;
          font-weight: 600; letter-spacing: 0.08em; }

        .rpc-legend { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
        .rpc-legend-item { display: flex; align-items: center; gap: 5px;
          font-size: 9px; color: #999; font-family: 'Syne', sans-serif;
          font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; }
        .rpc-legend-swatch { width: 10px; height: 10px; border-radius: 2px; }
      `}</style>

      <div className="shell">
        <header className="header">
          <div className="brand">
            <span className="brand-title">Reporting</span>
            <span className="brand-name">Bidberry</span>
          </div>
          <div className="controls">
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
            <div className="refresh-badge" title={syncLog.join('\n')}>
              <span className={`refresh-dot${syncing ? ' syncing' : ''}`} />
              {syncing ? 'syncing…' : lastUpdated
                ? lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : '—'}
            </div>
            <button className="apply-btn" style={{ background: '#555' }} onClick={runSync} disabled={syncing}>
              Sync
            </button>
          </div>
        </header>

        <div className="tabs">
          <button
            className={`tab ${activeTab === 'daily' ? 'active' : ''}`}
            onClick={() => { setActiveTab('daily'); setBreakdown('daily') }}
          >Daily</button>
          <button
            className={`tab ${activeTab === 'hourly' ? 'active' : ''}`}
            onClick={() => { setActiveTab('hourly'); setBreakdown('hourly') }}
          >Hourly</button>
          <button
            className={`tab ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >Analytics</button>
          <button
            className={`tab ${activeTab === 'nexify' ? 'active' : ''}`}
            onClick={() => setActiveTab('nexify')}
          >Nexify</button>
        </div>

        {error && <div className="error-msg">{error}</div>}

        {activeTab === 'daily' && (
          <>
            {/* Daily Filters */}
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
                <thead>
                  <tr>
                    <th>Config</th>
                    <th>Market</th>
                    <th>Device</th>
                    <th>Query</th>
                    <th>Rev (USD)</th>
                    <th>Clicks</th>
                    <th>Searches</th>
                    <th>Bidded Srch</th>
                    <th>RPC</th>
                    <th>CTR</th>
                    <th>RPM</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={11}><div className="state-row"><span className="spinner" />Loading…</div></td></tr>
                  ) : filteredDaily.length === 0 ? (
                    <tr><td colSpan={11}><div className="state-row">No data for this period</div></td></tr>
                  ) : filteredDaily.map((row, i) => (
                    <tr key={i}>
                      <td><span className="config-tag">{row.config_name}</span></td>
                      <td style={{textAlign:'left', color:'#666', fontSize:12}}>{row.market}</td>
                      <td style={{textAlign:'left', color:'#666', fontSize:12}}>{row.device}</td>
                      <td style={{textAlign:'left', fontFamily:"'DM Mono',monospace", fontSize:12, color:'#aaa', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis'}}>{row.ads_query}</td>
                      <td className="revenue">${fmt(row.revenue)}</td>
                      <td className="clicks">{fmtInt(row.clicks)}</td>
                      <td>{fmtInt(row.searches)}</td>
                      <td>{fmtInt(row.bidded_searches)}</td>
                      <td style={{textAlign:'right', fontFamily:"'DM Mono',monospace", fontSize:13, color:'#c2800a'}}>
                        {row.clicks > 0 ? `$${fmt(row.revenue / row.clicks)}` : '—'}
                      </td>
                      <td style={{textAlign:'right', fontFamily:"'DM Mono',monospace", fontSize:13, color:'#555'}}>
                        {row.bidded_searches > 0 ? `${fmt(row.clicks / row.bidded_searches * 100)}%` : '—'}
                      </td>
                      <td style={{textAlign:'right', fontFamily:"'DM Mono',monospace", fontSize:13, color:'#888'}}>
                        {row.searches > 0 ? `$${fmt(row.revenue / row.searches * 1000)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'hourly' && (
          <>
            {/* Filters */}
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

            {/* Totals */}
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
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Hour</th>
                    <th>Config</th>
                    <th>Market</th>
                    <th>Device</th>
                    <th>Query</th>
                    <th>Rev (USD)</th>
                    <th>Clicks</th>
                    <th>Bidded Srch</th>
                    <th>RPC</th>
                    <th>CTR</th>
                    <th>RPM</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={12}><div className="state-row"><span className="spinner" />Loading…</div></td></tr>
                  ) : filteredHourly.length === 0 ? (
                    <tr><td colSpan={12}><div className="state-row">No data for this period</div></td></tr>
                  ) : filteredHourly.map((row, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily:"'DM Mono',monospace", textAlign:'left', color:'#666' }}>{String(row.report_date).split('T')[0]}</td>
                      <td><span className="hour-badge">{String(row.report_hour).padStart(2,'0')}</span></td>
                      <td style={{ textAlign:'left' }}><span className="config-tag">{row.config_name}</span></td>
                      <td style={{textAlign:'left', color:'#666', fontSize:12}}>{row.market}</td>
                      <td style={{textAlign:'left', color:'#666', fontSize:12}}>{row.device}</td>
                      <td style={{textAlign:'left', fontFamily:"'DM Mono',monospace", fontSize:12, color:'#aaa', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis'}}>{row.ads_query}</td>
                      <td className="revenue">${fmt(row.revenue)}</td>
                      <td className="clicks">{fmtInt(row.clicks)}</td>
                      <td>{fmtInt(row.bidded_searches)}</td>
                      <td style={{textAlign:'right', fontFamily:"'DM Mono',monospace", fontSize:13, color:'#c2800a'}}>
                        {row.clicks > 0 ? `$${fmt(row.revenue / row.clicks)}` : '—'}
                      </td>
                      <td style={{textAlign:'right', fontFamily:"'DM Mono',monospace", fontSize:13, color:'#555'}}>
                        {row.bidded_searches > 0 ? `${fmt(row.clicks / row.bidded_searches * 100)}%` : '—'}
                      </td>
                      <td style={{textAlign:'right', fontFamily:"'DM Mono',monospace", fontSize:13, color:'#888'}}>
                        {row.searches > 0 ? `$${fmt(row.revenue / row.searches * 1000)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'analytics' && (
          <>
            {trendData.length === 0 && queryRPCData.length === 0 ? (
              <div className="analytics-empty">No data for this period</div>
            ) : (
              <>
                {/* Row 1: Revenue + Traffic trends */}
                <div className="analytics-grid">
                  {/* Revenue Over Time */}
                  <div className="chart-card">
                    <div className="chart-title">Revenue Over Time <span style={{color:'#aaa', fontWeight:400, textTransform:'none', letterSpacing:0}}>(USD)</span></div>
                    <div className="legend">
                      <div className="legend-item">
                        <div className="legend-dot" style={{background:'#c2800a'}} />
                        <span className="legend-label">Total Revenue</span>
                      </div>
                      <div className="legend-item">
                        <div className="legend-dot" style={{background:'#d4b896', border:'1px dashed #c2800a'}} />
                        <span className="legend-label">My Cut (20%)</span>
                      </div>
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

                  {/* Traffic Over Time */}
                  <div className="chart-card">
                    <div className="chart-title">Traffic Over Time</div>
                    <div className="legend">
                      <div className="legend-item">
                        <div className="legend-dot" style={{background:'#1a1a1a'}} />
                        <span className="legend-label">Clicks</span>
                      </div>
                      <div className="legend-item">
                        <div className="legend-dot" style={{background:'#c8c7c0'}} />
                        <span className="legend-label">Searches</span>
                      </div>
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

                {/* Row 2: Query RPC Ranking */}
                {queryRPCWithColors.length > 0 && (
                  <div className="chart-card full" style={{ marginTop: 16 }}>
                    <div className="chart-title">Query RPC Ranking — <span>top {Math.min(queryRPCWithColors.length, 20)} queries by revenue per click</span></div>
                    <div className="rpc-legend">
                      <div className="rpc-legend-item">
                        <div className="rpc-legend-swatch" style={{background:'#22c55e'}} />
                        Push (top 25%)
                      </div>
                      <div className="rpc-legend-item">
                        <div className="rpc-legend-swatch" style={{background:'#c2800a'}} />
                        Monitor (mid 50%)
                      </div>
                      <div className="rpc-legend-item">
                        <div className="rpc-legend-swatch" style={{background:'#ef4444'}} />
                        Stop (bottom 25%)
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={Math.max(180, Math.min(queryRPCWithColors.length, 20) * 28)}>
                      <BarChart
                        layout="vertical"
                        data={queryRPCWithColors.slice(0, 20)}
                        margin={{ top: 0, right: 48, bottom: 0, left: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f5f4f0" horizontal={false} />
                        <XAxis
                          type="number"
                          tick={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fill: '#aaa' }}
                          tickLine={false} axisLine={false}
                          tickFormatter={v => `$${v.toFixed(3)}`}
                        />
                        <YAxis
                          type="category"
                          dataKey="queryShort"
                          width={160}
                          tick={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fill: '#666' }}
                          tickLine={false} axisLine={false}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            const d = payload[0].payload
                            return (
                              <div style={{
                                background: '#fff', border: '1px solid #dddcd8', borderRadius: 4,
                                padding: '8px 12px', fontFamily: "'DM Mono',monospace", fontSize: 12,
                                boxShadow: '0 4px 16px rgba(0,0,0,0.07)', maxWidth: 260,
                              }}>
                                <div style={{ color: '#555', fontSize: 11, marginBottom: 6, wordBreak: 'break-all' }}>{d.query}</div>
                                <div style={{ color: '#c2800a' }}>RPC: ${fmt(d.rpc)}</div>
                                <div style={{ color: '#888', fontSize: 11 }}>Revenue: ${fmt(d.revenue)} · Clicks: {fmtInt(d.clicks)}</div>
                              </div>
                            )
                          }}
                        />
                        <Bar dataKey="rpc" name="RPC" radius={[0, 2, 2, 0]}>
                          {queryRPCWithColors.slice(0, 20).map((entry, i) => (
                            <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Row 3: Push / Stop signals */}
                {(pushQueries.length > 0 || stopQueries.length > 0) && (
                  <div className="push-stop-grid">
                    {/* Push */}
                    <div className="signal-card">
                      <div className="signal-header push">
                        <div className="signal-dot" style={{ background: '#22c55e' }} />
                        Queries to Push
                        <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 4 }}>— high RPC, scale up</span>
                      </div>
                      {pushQueries.length === 0 ? (
                        <div style={{ padding: '16px', color: '#bbb', fontSize: 12, fontFamily: "'Syne',sans-serif" }}>Not enough data</div>
                      ) : pushQueries.map((q, i) => (
                        <div key={i} className="signal-row">
                          <span className="signal-rank">#{i + 1}</span>
                          <span className="signal-query">{q.query}</span>
                          <span className="signal-rpc" style={{ color: '#16a34a' }}>${fmt(q.rpc)}</span>
                          <span className="signal-meta">{fmtInt(q.clicks)} clk</span>
                        </div>
                      ))}
                    </div>

                    {/* Stop */}
                    <div className="signal-card">
                      <div className="signal-header stop">
                        <div className="signal-dot" style={{ background: '#ef4444' }} />
                        Queries to Stop
                        <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 4 }}>— low RPC, cut spend</span>
                      </div>
                      {stopQueries.length === 0 ? (
                        <div style={{ padding: '16px', color: '#bbb', fontSize: 12, fontFamily: "'Syne',sans-serif" }}>Not enough data</div>
                      ) : stopQueries.map((q, i) => (
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
        {activeTab === 'nexify' && (() => {
          const uniqueDomains = [...new Set(nexifyDailyData.map(r => r.domain))].filter(Boolean).sort()
          const uniqueSources = [...new Set(nexifyDailyData.map(r => r.source_type))].filter(Boolean).sort()
          const uniqueHDomains = [...new Set(nexifyHourlyData.map(r => r.domain))].filter(Boolean).sort()
          const uniqueHSources = [...new Set(nexifyHourlyData.map(r => r.source_type))].filter(Boolean).sort()
          const uniqueHDevices = [...new Set(nexifyHourlyData.map(r => r.device))].filter(Boolean).sort()
          const uniqueHHours = [...new Set(nexifyHourlyData.map(r => r.report_hour))].sort((a, b) => a - b)

          const filteredNexifyDaily = nexifyDailyData.filter(r =>
            (!nexifyFilters.domain || r.domain === nexifyFilters.domain) &&
            (!nexifyFilters.source || r.source_type === nexifyFilters.source)
          )
          const filteredNexifyHourly = nexifyHourlyData.filter(r =>
            (!nexifyFilters.domain || r.domain === nexifyFilters.domain) &&
            (!nexifyFilters.source || r.source_type === nexifyFilters.source) &&
            (!nexifyFilters.device || r.device === nexifyFilters.device) &&
            (!nexifyFilters.hour || r.report_hour === Number(nexifyFilters.hour))
          )

          const nxDailyTotals = filteredNexifyDaily.reduce(
            (acc, r) => ({
              revenue: acc.revenue + r.revenue, amount_eur: acc.amount_eur + r.amount_eur,
              clicks: acc.clicks + r.clicks, searches: acc.searches + r.searches,
              bidded_searches: acc.bidded_searches + r.bidded_searches,
              bidded_results: acc.bidded_results + r.bidded_results,
            }),
            { revenue: 0, amount_eur: 0, clicks: 0, searches: 0, bidded_searches: 0, bidded_results: 0 }
          )
          const nxHourlyTotals = filteredNexifyHourly.reduce(
            (acc, r) => ({
              revenue: acc.revenue + r.revenue, amount_eur: acc.amount_eur + r.amount_eur,
              clicks: acc.clicks + r.clicks, searches: acc.searches + r.searches,
              bidded_searches: acc.bidded_searches + r.bidded_searches,
              bidded_results: acc.bidded_results + r.bidded_results,
            }),
            { revenue: 0, amount_eur: 0, clicks: 0, searches: 0, bidded_searches: 0, bidded_results: 0 }
          )
          const totals = nexifySubTab === 'daily' ? nxDailyTotals : nxHourlyTotals

          return (
            <>
              {/* Sub-tabs */}
              <div style={{ display: 'flex', gap: 0, marginTop: 20, borderBottom: '1px solid #e0dfd9' }}>
                {(['daily', 'hourly'] as NexifySubTab[]).map(t => (
                  <button key={t} className={`tab ${nexifySubTab === t ? 'active' : ''}`}
                    onClick={() => setNexifySubTab(t)}
                    style={{ fontSize: 10, padding: '8px 16px' }}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              {/* Filters */}
              <div className="filters">
                {(nexifySubTab === 'daily' ? uniqueDomains : uniqueHDomains).length > 0 && (
                  <select className="filter-select" value={nexifyFilters.domain}
                    onChange={e => setNexifyFilters(f => ({ ...f, domain: e.target.value }))}>
                    <option value="">All Domains</option>
                    {(nexifySubTab === 'daily' ? uniqueDomains : uniqueHDomains).map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
                {(nexifySubTab === 'daily' ? uniqueSources : uniqueHSources).length > 0 && (
                  <select className="filter-select" value={nexifyFilters.source}
                    onChange={e => setNexifyFilters(f => ({ ...f, source: e.target.value }))}>
                    <option value="">All Sources</option>
                    {(nexifySubTab === 'daily' ? uniqueSources : uniqueHSources).map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
                {nexifySubTab === 'hourly' && uniqueHDevices.length > 0 && (
                  <select className="filter-select" value={nexifyFilters.device}
                    onChange={e => setNexifyFilters(f => ({ ...f, device: e.target.value }))}>
                    <option value="">All Devices</option>
                    {uniqueHDevices.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
                {nexifySubTab === 'hourly' && uniqueHHours.length > 0 && (
                  <select className="filter-select" value={nexifyFilters.hour}
                    onChange={e => setNexifyFilters(f => ({ ...f, hour: e.target.value }))}>
                    <option value="">All Hours</option>
                    {uniqueHHours.map(h => <option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>)}
                  </select>
                )}
                {(nexifyFilters.domain || nexifyFilters.source || nexifyFilters.device || nexifyFilters.hour) && (
                  <button className="filter-clear" onClick={() => setNexifyFilters({ domain: '', source: '', device: '', hour: '' })}>Clear</button>
                )}
              </div>

              {/* Summary */}
              <div className="summary">
                {[
                  { label: 'Revenue (USD)', value: `$${fmt(totals.revenue)}`, amber: true },
                  { label: 'Revenue (EUR)', value: `€${fmt(totals.amount_eur)}` },
                  { label: 'Clicks', value: fmtInt(totals.clicks) },
                  { label: 'Searches', value: fmtInt(totals.searches) },
                  { label: 'RPC', value: totals.clicks > 0 ? `$${fmt(totals.revenue / totals.clicks)}` : '—' },
                  { label: 'CTR', value: totals.bidded_searches > 0 ? `${fmt(totals.clicks / totals.bidded_searches * 100)}%` : '—' },
                ].map(({ label, value, amber }) => (
                  <div key={label} className="summary-cell">
                    <span className="summary-label">{label}</span>
                    <span className={`summary-value${amber ? ' amber' : ''}`}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Daily table */}
              {nexifySubTab === 'daily' && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Domain</th>
                        <th>Market</th>
                        <th>Device</th>
                        <th>Channel</th>
                        <th>Source</th>
                        <th>TQ</th>
                        <th>Rev (USD)</th>
                        <th>Rev (EUR)</th>
                        <th>Clicks</th>
                        <th>Searches</th>
                        <th>RPC</th>
                        <th>CTR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nexifyLoading ? (
                        <tr><td colSpan={12}><div className="state-row"><span className="spinner" />Loading…</div></td></tr>
                      ) : filteredNexifyDaily.length === 0 ? (
                        <tr><td colSpan={12}><div className="state-row">No data for this period</div></td></tr>
                      ) : filteredNexifyDaily.map((row, i) => (
                        <tr key={i}>
                          <td><span className="config-tag">{row.domain}</span></td>
                          <td style={{textAlign:'left', color:'#666', fontSize:12}}>{row.market}</td>
                          <td style={{textAlign:'left', color:'#666', fontSize:12}}>{row.device}</td>
                          <td style={{textAlign:'left', fontFamily:"'DM Mono',monospace", fontSize:12, color:'#aaa', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis'}}>{row.ads_query}</td>
                          <td style={{textAlign:'left', color:'#666', fontSize:12}}>{row.source_type}</td>
                          <td style={{textAlign:'right', fontFamily:"'DM Mono',monospace", fontSize:12, color:'#888'}}>{row.tq_score || '—'}</td>
                          <td className="revenue">${fmt(row.revenue)}</td>
                          <td style={{textAlign:'right', fontFamily:"'DM Mono',monospace", fontSize:13, color:'#888'}}>€{fmt(row.amount_eur)}</td>
                          <td className="clicks">{fmtInt(row.clicks)}</td>
                          <td>{fmtInt(row.searches)}</td>
                          <td style={{textAlign:'right', fontFamily:"'DM Mono',monospace", fontSize:13, color:'#c2800a'}}>
                            {row.clicks > 0 ? `$${fmt(row.revenue / row.clicks)}` : '—'}
                          </td>
                          <td style={{textAlign:'right', fontFamily:"'DM Mono',monospace", fontSize:13, color:'#555'}}>
                            {row.bidded_searches > 0 ? `${fmt(row.clicks / row.bidded_searches * 100)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Hourly table */}
              {nexifySubTab === 'hourly' && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Hour</th>
                        <th>Domain</th>
                        <th>Market</th>
                        <th>Device</th>
                        <th>Channel</th>
                        <th>Source</th>
                        <th>Rev (USD)</th>
                        <th>Clicks</th>
                        <th>Searches</th>
                        <th>RPC</th>
                        <th>CTR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nexifyLoading ? (
                        <tr><td colSpan={12}><div className="state-row"><span className="spinner" />Loading…</div></td></tr>
                      ) : filteredNexifyHourly.length === 0 ? (
                        <tr><td colSpan={12}><div className="state-row">No data for this period</div></td></tr>
                      ) : filteredNexifyHourly.map((row, i) => (
                        <tr key={i}>
                          <td style={{ fontFamily:"'DM Mono',monospace", textAlign:'left', color:'#666' }}>{String(row.report_date).split('T')[0]}</td>
                          <td><span className="hour-badge">{String(row.report_hour).padStart(2,'0')}</span></td>
                          <td style={{ textAlign:'left' }}><span className="config-tag">{row.domain}</span></td>
                          <td style={{textAlign:'left', color:'#666', fontSize:12}}>{row.market}</td>
                          <td style={{textAlign:'left', color:'#666', fontSize:12}}>{row.device}</td>
                          <td style={{textAlign:'left', fontFamily:"'DM Mono',monospace", fontSize:12, color:'#aaa', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis'}}>{row.ads_query}</td>
                          <td style={{textAlign:'left', color:'#666', fontSize:12}}>{row.source_type}</td>
                          <td className="revenue">${fmt(row.revenue)}</td>
                          <td className="clicks">{fmtInt(row.clicks)}</td>
                          <td>{fmtInt(row.searches)}</td>
                          <td style={{textAlign:'right', fontFamily:"'DM Mono',monospace", fontSize:13, color:'#c2800a'}}>
                            {row.clicks > 0 ? `$${fmt(row.revenue / row.clicks)}` : '—'}
                          </td>
                          <td style={{textAlign:'right', fontFamily:"'DM Mono',monospace", fontSize:13, color:'#555'}}>
                            {row.bidded_searches > 0 ? `${fmt(row.clicks / row.bidded_searches * 100)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )
        })()}

      </div>
    </>
  )
}
