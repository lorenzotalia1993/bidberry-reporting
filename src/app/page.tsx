'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

// ── Types ──────────────────────────────────────────────────────────
type Breakdown = 'daily' | 'hourly'

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

// ── Main Dashboard ─────────────────────────────────────────────────
function defaultRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 6)
  return { from: toStr(from), to: toStr(to) }
}

export default function Dashboard() {
  const [breakdown, setBreakdown] = useState<Breakdown>('daily')
  const [range, setRange] = useState(defaultRange)
  const [dailyData, setDailyData] = useState<DailyRow[]>([])
  const [hourlyData, setHourlyData] = useState<HourlyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState({ config: '', query: '', device: '', hour: '' })

  const fetchData = useCallback(async () => {
    if (!range.from || !range.to) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to, breakdown })
      const res = await fetch(`/api/report-data?${params}`)
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      if (breakdown === 'daily') setDailyData(json)
      else setHourlyData(json)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to, breakdown])

  useEffect(() => { fetchData() }, [fetchData])

  const dailyTotals = dailyData.reduce(
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

  const filteredHourly = hourlyData.filter(r =>
    (!filters.config || r.config_name === filters.config) &&
    (!filters.query || r.ads_query === filters.query) &&
    (!filters.device || r.device === filters.device) &&
    (!filters.hour || r.report_hour === Number(filters.hour))
  )

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
          </div>
        </header>

        <div className="tabs">
          <button className={`tab ${breakdown === 'daily' ? 'active' : ''}`} onClick={() => setBreakdown('daily')}>Daily</button>
          <button className={`tab ${breakdown === 'hourly' ? 'active' : ''}`} onClick={() => setBreakdown('hourly')}>Hourly</button>
        </div>

        {error && <div className="error-msg">{error}</div>}

        {breakdown === 'daily' && (
          <>
            <div className="summary">
              {[
                { label: 'Revenue (USD)', value: `$${fmt(dailyTotals.revenue)}`, amber: true },
                { label: 'Revenue (EUR)', value: `€${fmt(dailyTotals.amount_eur)}` },
                { label: 'Clicks', value: fmtInt(dailyTotals.clicks) },
                { label: 'Searches', value: fmtInt(dailyTotals.searches) },
                { label: 'Bidded Searches', value: fmtInt(dailyTotals.bidded_searches) },
                { label: 'Bidded Results', value: fmtInt(dailyTotals.bidded_results) },
              ].map(({ label, value, amber }) => (
                <div key={label} className="summary-cell">
                  <span className="summary-label">{label}</span>
                  <span className={`summary-value${amber ? ' amber' : ''}`}>{value}</span>
                </div>
              ))}
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
                    <th>Rev (EUR)</th>
                    <th>Clicks</th>
                    <th>Searches</th>
                    <th>Bidded Srch</th>
                    <th>Bidded Res</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={10}><div className="state-row"><span className="spinner" />Loading…</div></td></tr>
                  ) : dailyData.length === 0 ? (
                    <tr><td colSpan={10}><div className="state-row">No data for this period</div></td></tr>
                  ) : dailyData.map((row, i) => (
                    <tr key={i}>
                      <td><span className="config-tag">{row.config_name}</span></td>
                      <td style={{textAlign:'left', color:'#666', fontSize:12}}>{row.market}</td>
                      <td style={{textAlign:'left', color:'#666', fontSize:12}}>{row.device}</td>
                      <td style={{textAlign:'left', fontFamily:"'DM Mono',monospace", fontSize:12, color:'#aaa', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis'}}>{row.ads_query}</td>
                      <td className="revenue">${fmt(row.revenue)}</td>
                      <td style={{textAlign:'right', fontFamily:"'DM Mono',monospace", fontSize:13, color:'#a3a3a3'}}>€{fmt(row.amount_eur)}</td>
                      <td className="clicks">{fmtInt(row.clicks)}</td>
                      <td>{fmtInt(row.searches)}</td>
                      <td>{fmtInt(row.bidded_searches)}</td>
                      <td>{fmtInt(row.bidded_results)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {breakdown === 'hourly' && (
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
                { label: 'Revenue (EUR)', value: `€${fmt(hourlyTotals.amount_eur)}` },
                { label: 'Clicks', value: fmtInt(hourlyTotals.clicks) },
                { label: 'Searches', value: fmtInt(hourlyTotals.searches) },
                { label: 'Bidded Searches', value: fmtInt(hourlyTotals.bidded_searches) },
                { label: 'Bidded Results', value: fmtInt(hourlyTotals.bidded_results) },
              ].map(({ label, value, amber }) => (
                <div key={label} className="summary-cell">
                  <span className="summary-label">{label}</span>
                  <span className={`summary-value${amber ? ' amber' : ''}`}>{value}</span>
                </div>
              ))}
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
                    <th>Rev (EUR)</th>
                    <th>Clicks</th>
                    <th>Searches</th>
                    <th>Bidded Srch</th>
                    <th>Bidded Res</th>
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
                      <td style={{textAlign:'right', fontFamily:"'DM Mono',monospace", fontSize:13, color:'#a3a3a3'}}>€{fmt(row.amount_eur)}</td>
                      <td className="clicks">{fmtInt(row.clicks)}</td>
                      <td>{fmtInt(row.searches)}</td>
                      <td>{fmtInt(row.bidded_searches)}</td>
                      <td>{fmtInt(row.bidded_results)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  )
}
