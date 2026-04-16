import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
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

function App() {
  const [missions, setMissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [theme, setTheme] = useState('dark')

  const [companyFilter, setCompanyFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [startDateFilter, setStartDateFilter] = useState('')
  const [endDateFilter, setEndDateFilter] = useState('')
  const [sortField, setSortField] = useState('Date')
  const [sortDirection, setSortDirection] = useState('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

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
    Papa.parse('/space_missions.csv', {
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

  const allCompanies = useMemo(
    () => ['All', ...Array.from(new Set(missions.map((m) => m.Company))).sort()],
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
        if (companyFilter !== 'All' && m.Company !== companyFilter) return false
        if (statusFilter !== 'All' && m.MissionStatus !== statusFilter) return false
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
        <div className="filter-group">
          <label htmlFor="company-select">Company</label>
          <select
            id="company-select"
            value={companyFilter}
            onChange={(e) => {
              setCompanyFilter(e.target.value)
              setPage(1)
            }}
          >
            {allCompanies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="status-select">Mission status</label>
          <select
            id="status-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
          >
            <option value="All">All</option>
            <option value="Success">Success</option>
            <option value="Failure">Failure</option>
            <option value="Partial Failure">Partial Failure</option>
            <option value="Prelaunch Failure">Prelaunch Failure</option>
          </select>
        </div>

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
            setCompanyFilter('All')
            setStatusFilter('All')
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

      <section className="charts-grid">
        <div className="chart-card">
          <h2>Launches per year</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={missionsByYear} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="year" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#4f46e5" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h2>Top companies by mission count</h2>
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
        </div>

        <div className="chart-card">
          <h2>Mission outcomes</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={missionsByStatus}
                dataKey="value"
                nameKey="status"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={(entry) => `${entry.status} (${entry.value})`}
              >
                {missionsByStatus.map((entry) => (
                  <Cell
                    key={entry.status}
                    fill={STATUS_COLORS[entry.status] || '#9ca3af'}
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>

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
