import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Papa from 'papaparse'
import spaceMissionsCsvUrl from '../../space_missions.csv?url'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import './App.css'

const STATUS_COLORS = {
  Success: '#16a34a',
  Failure: '#dc2626',
  'Partial Failure': '#f97316',
  'Prelaunch Failure': '#6b7280',
}

const MISSION_STATUS_OPTIONS = ['Success', 'Failure', 'Partial Failure', 'Prelaunch Failure']

const EMPTY_MULTI_FILTER = { all: true, values: [] }

function useClickOutside(ref, handler, active) {
  useEffect(() => {
    if (!active) return
    function onPointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) handler()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [ref, handler, active])
}

function CheckboxMultiDropdown({ id, label, options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const close = useCallback(() => setOpen(false), [])
  useClickOutside(wrapRef, close, open)

  const summary = value.all
    ? 'All'
    : value.values.length === 0
      ? 'None selected'
      : value.values.length === 1
        ? value.values[0]
        : `${value.values.length} selected`

  const toggleAll = (checked) => {
    onChange(checked ? { all: true, values: [] } : { all: false, values: [] })
  }

  const toggleOption = (opt, checked) => {
    if (value.all && checked) {
      onChange({ all: false, values: [opt] })
      return
    }
    if (!checked) {
      onChange({ all: false, values: value.values.filter((x) => x !== opt) })
      return
    }
    onChange({ all: false, values: [...new Set([...value.values, opt])] })
  }

  return (
    <div className="filter-group filter-multiselect" ref={wrapRef}>
      <span className="filter-multiselect-label" id={`${id}-label`}>
        {label}
      </span>
      <button
        type="button"
        id={id}
        className="filter-multiselect-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={`${id}-label`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="filter-multiselect-summary">{summary}</span>
        <span className="filter-multiselect-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="filter-multiselect-panel" role="listbox" aria-multiselectable="true">
          <label className="filter-multiselect-row filter-multiselect-row--all">
            <input
              type="checkbox"
              checked={value.all}
              onChange={(e) => toggleAll(e.target.checked)}
            />
            <span>ALL</span>
          </label>
          <div className="filter-multiselect-scroll">
            {options.map((opt) => (
              <label key={opt} className="filter-multiselect-row">
                <input
                  type="checkbox"
                  checked={!value.all && value.values.includes(opt)}
                  onChange={(e) => toggleOption(opt, e.target.checked)}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Last segment of Location is usually the country; fix known edge cases. */
const LAUNCH_COUNTRY_OVERRIDES = {
  'New Mexico': 'USA',
  'Gran Canaria': 'Spain',
  'Pacific Missile Range Facility': 'USA',
  'Shahrud Missile Test Site': 'Iran',
}

const LAUNCH_SEA_OR_OCEAN = new Set(['Pacific Ocean', 'Barents Sea', 'Yellow Sea'])

function getLaunchCountry(location) {
  if (!location || typeof location !== 'string') return 'Unknown'
  const parts = location
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (!parts.length) return 'Unknown'
  let raw = parts[parts.length - 1]
  if (LAUNCH_COUNTRY_OVERRIDES[raw]) return LAUNCH_COUNTRY_OVERRIDES[raw]
  if (LAUNCH_SEA_OR_OCEAN.has(raw)) return 'International waters'
  return raw
}

const RADIAN = Math.PI / 180

/** External % labels with elbow lines so slice labels do not stack on the pie. */
function renderMissionOutcomePercentLabel({ cx, cy, midAngle, outerRadius, percent }) {
  if (percent == null || percent <= 0) return null
  if (percent < 0.012) return null

  const label = `${(percent * 100).toFixed(1)}%`
  const sin = Math.sin(-RADIAN * midAngle)
  const cos = Math.cos(-RADIAN * midAngle)
  const sx = cx + (outerRadius + 2) * cos
  const sy = cy + (outerRadius + 2) * sin
  const mx = cx + (outerRadius + 10) * cos
  const my = cy + (outerRadius + 10) * sin
  const isRight = cos >= 0
  const ex = mx + (isRight ? 1 : -1) * 14
  const ey = my
  const textX = ex + (isRight ? 3 : -3)
  const textAnchor = isRight ? 'start' : 'end'

  return (
    <g className="pie-outcome-label-group">
      <path
        d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`}
        className="pie-outcome-label-connector"
        fill="none"
        strokeLinecap="round"
      />
      <text
        x={textX}
        y={ey}
        dy="0.35em"
        textAnchor={textAnchor}
        className="pie-outcome-label-text"
      >
        {label}
      </text>
    </g>
  )
}

const CHART_PANEL_IDS = ['year', 'companies', 'outcomes', 'countries']

const CHART_TITLES = {
  year: 'Launches per year',
  companies: 'Top companies by mission count',
  outcomes: 'Mission outcomes',
  countries: 'Launches per country',
}

function parseChartOrderFromStorage() {
  try {
    const raw = localStorage.getItem('dashboard-chart-order')
    if (!raw) return [...CHART_PANEL_IDS]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length !== CHART_PANEL_IDS.length) {
      return [...CHART_PANEL_IDS]
    }
    const valid = new Set(CHART_PANEL_IDS)
    if (!parsed.every((x) => valid.has(x))) return [...CHART_PANEL_IDS]
    return parsed
  } catch {
    return [...CHART_PANEL_IDS]
  }
}

function SortableChartCard({ id, title, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 4 : undefined,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`chart-card${isDragging ? ' chart-card--dragging' : ''}`}
    >
      <div
        className="chart-card-drag"
        title="Drag to reorder charts"
        {...attributes}
        {...listeners}
      >
        <span className="chart-drag-handle" aria-hidden="true">
          ⋮⋮
        </span>
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  )
}

const MissionOutcomesChart = memo(function MissionOutcomesChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <Pie
          data={data}
          dataKey="value"
          nameKey="status"
          cx="50%"
          cy="50%"
          outerRadius={72}
          paddingAngle={1.2}
          labelLine={false}
          label={renderMissionOutcomePercentLabel}
          isAnimationActive
          animationBegin={0}
          animationDuration={280}
          animationEasing="ease-out"
        >
          {data.map((entry) => (
            <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || '#9ca3af'} />
          ))}
        </Pie>
        <Tooltip isAnimationActive={false} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
})

function App() {
  const [missions, setMissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [theme, setTheme] = useState('dark')

  const [companyFilter, setCompanyFilter] = useState(EMPTY_MULTI_FILTER)
  const [statusFilter, setStatusFilter] = useState(EMPTY_MULTI_FILTER)
  const [countryFilter, setCountryFilter] = useState(EMPTY_MULTI_FILTER)
  const [startDateFilter, setStartDateFilter] = useState('')
  const [endDateFilter, setEndDateFilter] = useState('')
  const [sortField, setSortField] = useState('Date')
  const [sortDirection, setSortDirection] = useState('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [chartOrder, setChartOrder] = useState(parseChartOrderFromStorage)

  const chartSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )

  useEffect(() => {
    localStorage.setItem('dashboard-chart-order', JSON.stringify(chartOrder))
  }, [chartOrder])

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('dashboard-theme')
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme)
      return
    }

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    setTheme(prefersDark ? 'dark' : 'light')
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem('dashboard-theme', theme)
  }, [theme])

  useEffect(() => {
    Papa.parse(spaceMissionsCsvUrl, {
      header: true,
      download: true,
      skipEmptyLines: true,
      complete: (result) => {
        const enriched = result.data
          .filter((row) => row.Date)
          .map((row) => {
            const dateObj = new Date(`${row.Date}T${row.Time || '00:00:00'}`)
            return {
              ...row,
              DateObj: dateObj,
              Year: dateObj.getFullYear(),
              LaunchCountry: getLaunchCountry(row.Location),
            }
          })
        setMissions(enriched)
        setLoading(false)
      },
      error: (err) => {
        setError(err.message || 'Failed to load data')
        setLoading(false)
      },
    })
  }, [])

  const companyOptions = useMemo(
    () => Array.from(new Set(missions.map((m) => m.Company))).sort(),
    [missions],
  )

  const countryOptions = useMemo(
    () => Array.from(new Set(missions.map((m) => m.LaunchCountry))).sort(),
    [missions],
  )

  function parsePrice(priceValue) {
    if (!priceValue || !priceValue.trim()) return Number.POSITIVE_INFINITY
    const normalized = priceValue.replace(/[$,]/g, '')
    const parsed = Number.parseFloat(normalized)
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
  }

  const filteredMissions = useMemo(() => {
    return missions
      .filter((m) => {
        if (!companyFilter.all) {
          if (companyFilter.values.length === 0) return false
          if (!companyFilter.values.includes(m.Company)) return false
        }
        if (!statusFilter.all) {
          if (statusFilter.values.length === 0) return false
          if (!statusFilter.values.includes(m.MissionStatus)) return false
        }
        if (!countryFilter.all) {
          if (countryFilter.values.length === 0) return false
          if (!countryFilter.values.includes(m.LaunchCountry)) return false
        }
        if (startDateFilter) {
          const start = new Date(`${startDateFilter}T00:00:00`)
          if (m.DateObj < start) return false
        }
        if (endDateFilter) {
          const end = new Date(`${endDateFilter}T23:59:59`)
          if (m.DateObj > end) return false
        }
        return true
      })
      .sort((a, b) => {
        const dir = sortDirection === 'asc' ? 1 : -1
        if (sortField === 'Date') {
          return (a.DateObj - b.DateObj) * dir
        }
        if (sortField === 'Company') {
          return a.Company.localeCompare(b.Company) * dir
        }
        if (sortField === 'MissionStatus') {
          return a.MissionStatus.localeCompare(b.MissionStatus) * dir
        }
        if (sortField === 'Price') {
          return (parsePrice(a.Price) - parsePrice(b.Price)) * dir
        }
        return 0
      })
  }, [
    missions,
    companyFilter,
    statusFilter,
    countryFilter,
    startDateFilter,
    endDateFilter,
    sortField,
    sortDirection,
  ])

  const totalMissions = filteredMissions.length
  const successfulMissions = filteredMissions.filter(
    (m) => m.MissionStatus === 'Success',
  ).length
  const overallSuccessRate = totalMissions
    ? ((successfulMissions / totalMissions) * 100).toFixed(2)
    : '0.00'

  const uniqueCompanies = new Set(filteredMissions.map((m) => m.Company)).size

  const yearRange = useMemo(() => {
    if (!filteredMissions.length) return ''
    const years = filteredMissions.map((m) => m.Year)
    return `${Math.min(...years)}–${Math.max(...years)}`
  }, [filteredMissions])

  const missionsByYear = useMemo(() => {
    const counts = new Map()
    filteredMissions.forEach((m) => {
      counts.set(m.Year, (counts.get(m.Year) || 0) + 1)
    })
    return Array.from(counts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, count]) => ({ year, count }))
  }, [filteredMissions])

  const missionsByCompany = useMemo(() => {
    const counts = new Map()
    filteredMissions.forEach((m) => {
      counts.set(m.Company, (counts.get(m.Company) || 0) + 1)
    })
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [filteredMissions])

  const missionsByStatus = useMemo(() => {
    const counts = new Map()
    filteredMissions.forEach((m) => {
      counts.set(m.MissionStatus, (counts.get(m.MissionStatus) || 0) + 1)
    })
    return Array.from(counts.entries()).map(([status, value]) => ({
      status,
      value,
    }))
  }, [filteredMissions])

  function handleChartsDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setChartOrder((items) => {
      const oldIndex = items.indexOf(active.id)
      const newIndex = items.indexOf(over.id)
      if (oldIndex === -1 || newIndex === -1) return items
      return arrayMove(items, oldIndex, newIndex)
    })
  }

  const missionsByLaunchCountry = useMemo(() => {
    const TOP_N = 12
    const counts = new Map()
    filteredMissions.forEach((m) => {
      const c = m.LaunchCountry || 'Unknown'
      counts.set(c, (counts.get(c) || 0) + 1)
    })
    const items = Array.from(counts.entries()).map(([name, count]) => ({ name, count }))
    items.sort((a, b) => b.count - a.count)
    if (items.length <= TOP_N) {
      return [...items].reverse()
    }
    const top = items.slice(0, TOP_N)
    const otherSum = items.slice(TOP_N).reduce((sum, row) => sum + row.count, 0)
    if (otherSum > 0) top.push({ name: 'Other', count: otherSum })
    return [...top].reverse()
  }, [filteredMissions])

  const totalPages = Math.max(1, Math.ceil(filteredMissions.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedMissions = filteredMissions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  )

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const formatPrice = (priceValue) => {
    if (!priceValue || !priceValue.trim()) return 'N/A'
    return priceValue
  }

  const formatDateTime = (dateObj) => {
    if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return 'N/A'
    const year = dateObj.getFullYear()
    const month = String(dateObj.getMonth() + 1).padStart(2, '0')
    const day = String(dateObj.getDate()).padStart(2, '0')
    const hour = String(dateObj.getHours()).padStart(2, '0')
    const minute = String(dateObj.getMinutes()).padStart(2, '0')
    const second = String(dateObj.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`
  }

  function renderChartPanel(panelId) {
    switch (panelId) {
      case 'year':
        return (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={missionsByYear} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="year" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#4f46e5" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )
      case 'companies':
        return (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={missionsByCompany}
              margin={{ top: 10, right: 10, left: 0, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                angle={-40}
                textAnchor="end"
                interval={0}
              />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#0ea5e9" />
            </BarChart>
          </ResponsiveContainer>
        )
      case 'outcomes':
        return <MissionOutcomesChart data={missionsByStatus} />
      case 'countries':
        return (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              layout="vertical"
              data={missionsByLaunchCountry}
              margin={{ top: 6, right: 16, left: 4, bottom: 6 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={118}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip formatter={(value) => [value, 'Launches']} labelFormatter={(label) => label} />
              <Bar dataKey="count" fill="#7c3aed" name="Launches" radius={[0, 4, 4, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        )
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="app-root">
        <header className="app-header">
          <div className="logo-mark" aria-hidden="true">
            <span className="orb orb-1" />
            <span className="orb orb-2" />
            <span className="orb orb-3" />
          </div>
          <div>
            <h1>Space Missions Explorer</h1>
            <p>Loading historical launch data…</p>
          </div>
        </header>
      </div>
    )
  }

  if (error) {
    return (
      <div className="app-root">
        <header className="app-header">
          <div className="logo-mark" aria-hidden="true">
            <span className="orb orb-1" />
            <span className="orb orb-2" />
            <span className="orb orb-3" />
          </div>
          <div>
            <h1>Space Missions Explorer</h1>
            <p className="error-text">{error}</p>
          </div>
        </header>
      </div>
    )
  }

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="header-brand">
          <div className="logo-mark" aria-hidden="true">
            <span className="orb orb-1" />
            <span className="orb orb-2" />
            <span className="orb orb-3" />
          </div>
          <div>
            <h1>Space Missions Explorer</h1>
            <p>Visualize and analyze launches from 1957 onwards.</p>
          </div>
        </div>
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          aria-label="Toggle dark mode"
        >
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
      </header>

      <section className="filters">
        <CheckboxMultiDropdown
          id="filter-company"
          label="Company"
          options={companyOptions}
          value={companyFilter}
          onChange={(next) => {
            setCompanyFilter(next)
            setPage(1)
          }}
        />

        <CheckboxMultiDropdown
          id="filter-status"
          label="Mission status"
          options={MISSION_STATUS_OPTIONS}
          value={statusFilter}
          onChange={(next) => {
            setStatusFilter(next)
            setPage(1)
          }}
        />

        <CheckboxMultiDropdown
          id="filter-country"
          label="Launch country"
          options={countryOptions}
          value={countryFilter}
          onChange={(next) => {
            setCountryFilter(next)
            setPage(1)
          }}
        />

        <div className="filter-group">
          <label htmlFor="start-date">Start date</label>
          <input
            id="start-date"
            type="date"
            value={startDateFilter}
            onChange={(e) => {
              setStartDateFilter(e.target.value)
              setPage(1)
            }}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="end-date">End date</label>
          <input
            id="end-date"
            type="date"
            value={endDateFilter}
            onChange={(e) => {
              setEndDateFilter(e.target.value)
              setPage(1)
            }}
          />
        </div>

        <button
          type="button"
          className="clear-filters"
          onClick={() => {
            setCompanyFilter(EMPTY_MULTI_FILTER)
            setStatusFilter(EMPTY_MULTI_FILTER)
            setCountryFilter(EMPTY_MULTI_FILTER)
            setStartDateFilter('')
            setEndDateFilter('')
            setPage(1)
          }}
        >
          Reset filters
        </button>
      </section>

      <section className="summary-grid">
        <div className="summary-card">
          <span className="summary-label">Total missions</span>
          <span className="summary-value">{totalMissions.toLocaleString()}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Overall success rate</span>
          <span className="summary-value">{overallSuccessRate}%</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Active companies</span>
          <span className="summary-value">{uniqueCompanies}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Year span</span>
          <span className="summary-value">{yearRange || '—'}</span>
        </div>
      </section>

      <DndContext
        sensors={chartSensors}
        collisionDetection={closestCorners}
        onDragEnd={handleChartsDragEnd}
      >
        <SortableContext items={chartOrder} strategy={rectSortingStrategy}>
          <section className="charts-grid">
            {chartOrder.map((panelId) => (
              <SortableChartCard key={panelId} id={panelId} title={CHART_TITLES[panelId]}>
                {renderChartPanel(panelId)}
              </SortableChartCard>
            ))}
          </section>
        </SortableContext>
      </DndContext>

      <section className="table-section">
        <header className="table-header">
          <h2>Missions</h2>
          <span className="table-count">
            Showing {(currentPage - 1) * pageSize + (pagedMissions.length ? 1 : 0)}-
            {(currentPage - 1) * pageSize + pagedMissions.length} of{' '}
            {filteredMissions.length.toLocaleString()} missions
          </span>
        </header>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th onClick={() => handleSort('Date')}>
                  Date & Time{' '}
                  {sortField === 'Date' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th onClick={() => handleSort('Company')}>
                  Company {sortField === 'Company' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th>Mission</th>
                <th>Rocket</th>
                <th onClick={() => handleSort('Price')}>
                  Price {sortField === 'Price' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th>Location</th>
                <th onClick={() => handleSort('MissionStatus')}>
                  Status{' '}
                  {sortField === 'MissionStatus'
                    ? sortDirection === 'asc'
                      ? '↑'
                      : '↓'
                    : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {pagedMissions.map((m, idx) => (
                <tr key={`${m.Date}-${m.Mission}-${idx}`}>
                  <td>{formatDateTime(m.DateObj)}</td>
                  <td>{m.Company}</td>
                  <td>{m.Mission}</td>
                  <td>{m.Rocket}</td>
                  <td>{formatPrice(m.Price)}</td>
                  <td>{m.Location}</td>
                  <td>
                    <span
                      className={`status-pill status-${(m.MissionStatus || '')
                        .toLowerCase()
                        .replace(/\s+/g, '-')}`}
                    >
                      {m.MissionStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <label htmlFor="rows-per-page" className="rows-per-page">
            Rows:
            <select
              id="rows-per-page"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
            >
              <option value={15}>15</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      </section>
    </div>
  )
}

export default App
