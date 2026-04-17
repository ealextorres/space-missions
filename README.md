# Space Missions Explorer

A full-stack space missions analytics app with:

- a React + Vite dashboard in `dashboard/`
- a FastAPI backend in `api/`
- reusable Python analysis helpers in `analysis.py`

The app uses `space_missions.csv` in the repository root as its primary dataset.

## What Is In This Repository

- `dashboard/` - React dashboard UI (charts, filters, sortable table, pagination)
- `api/` - FastAPI service that provides aggregated data and `analysis.py` endpoints
- `analysis.py` - Python stats functions for mission analytics
- `space_missions.csv` - main mission dataset
- `start-dev.ps1` - convenience script to start backend and frontend in separate PowerShell windows

## Dashboard Overview

The dashboard is implemented in `dashboard/src/App.jsx` and includes:

- **Header and theme toggle** - switches dark/light mode
- **Filter bar**:
  - company (multi-select)
  - mission status (multi-select)
  - launch country (multi-select)
  - rocket status (multi-select)
  - start date / end date
  - reset filters action
- **Summary cards**:
  - total missions
  - overall success rate
  - active companies
  - year span
- **Charts** (drag-and-drop reorderable):
  - launches per year
  - top companies by mission count
  - mission outcomes
  - launches per country
- **Missions table**:
  - sortable columns
  - rocket status column
  - status badges
  - pagination and page-size selector

The dashboard computes local filtered results and also posts filter state to the API aggregate endpoint.

## How To Run The App

## Prerequisites

- Python 3.10+ (`py` available in PATH)
- Node.js + npm
- PowerShell (Windows)

## Option A: One-command startup (recommended on Windows)

From the repository root:

```powershell
.\start-dev.ps1
```

This starts:

- FastAPI backend at `http://127.0.0.1:8000`
- Vite dashboard at `http://127.0.0.1:5173`

If script execution is blocked:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\start-dev.ps1
```

## Option B: Start services manually

### 1) Install API dependencies

```powershell
py -m pip install -r requirements-api.txt
```

### 2) Start FastAPI backend (repo root)

```powershell
py -m uvicorn api.main:app --reload --host 127.0.0.1 --port 8000
```

### 3) Install frontend dependencies

```powershell
cd dashboard
npm install
```

### 4) Start dashboard

```powershell
npm run dev
```

### Useful URLs

- Dashboard: `http://127.0.0.1:5173`
- API health: `http://127.0.0.1:8000/health`
- API docs: `http://127.0.0.1:8000/docs`

## API Notes

- Dev proxy is configured in `dashboard/vite.config.js`, so `/api/*` and `/health` calls from the dashboard are forwarded to the FastAPI server.
- The aggregate endpoint accepts filter payloads and returns pre-computed chart/summary data:
  - `POST /api/dashboard/aggregate`
- Analysis endpoints are also exposed, for example:
  - `GET /api/analysis/mission-count`
  - `GET /api/analysis/success-rate`
  - `GET /api/analysis/top-companies`
  - `GET /api/analysis/missions-by-year`

## How To Use `analysis.py`

`analysis.py` provides reusable mission stats functions that load and cache CSV data.

## Available functions

- `getMissionCountByCompany(companyName: str) -> int`
- `getSuccessRate(companyName: str) -> float`
- `getMissionsByDateRange(startDate: str, endDate: str) -> list[str]`
- `getTopCompaniesByMissionCount(n: int) -> list[tuple[str, int]]`
- `getMissionStatusCount() -> dict[str, int]`
- `getMissionsByYear(year: int) -> int`
- `getMostUsedRocket() -> str`
- `getAverageMissionsPerYear(startYear: int, endYear: int) -> float`
- `getLoadValidationStats() -> dict[str, object]`

PascalCase aliases are also available (for example `GetSuccessRate`).

## Basic usage example

```python
import analysis

print(analysis.getMissionCountByCompany("SpaceX"))
print(analysis.getSuccessRate("NASA"))
print(analysis.getMissionsByDateRange("2020-01-01", "2020-12-31"))
print(analysis.getTopCompaniesByMissionCount(10))
print(analysis.getMissionStatusCount())
print(analysis.getMissionsByYear(2019))
print(analysis.getMostUsedRocket())
print(analysis.getAverageMissionsPerYear(2010, 2020))
print(analysis.getLoadValidationStats())
```

## Data path and cache behavior

- Default CSV path: `analysis.CSV_PATH = "space_missions.csv"`
- Mission rows are cached by `_load_missions()` with `lru_cache(maxsize=1)`
- If you change `CSV_PATH`, clear cache before querying:

```python
import analysis

analysis.CSV_PATH = "space_missions_invalid.csv"
analysis._load_missions.cache_clear()
```

## Validation behavior in `analysis.py`

- Required columns are validated when loading the CSV.
- Text fields are normalized (trimmed).
- Mission statuses are normalized to known values; unknown values become `"Unknown"`.
- Invalid/missing mission dates are skipped during load.
- Most invalid inputs return safe defaults instead of raising:
  - empty list (`[]`) for invalid date-range queries
  - `0`/`0.0` for invalid numeric or empty-string cases
  - empty list for invalid top-N requests

Use `getLoadValidationStats()` to inspect row-level quality counters such as dropped rows, invalid date count, and unknown status count.

## Troubleshooting

- **PowerShell blocks scripts**  
  Run:
  ```powershell
  Set-ExecutionPolicy -Scope Process Bypass
  .\start-dev.ps1
  ```

- **`py` or `npm` command not found**  
  Install Python/Node.js and reopen your terminal so PATH is refreshed.

- **Port already in use (`8000` or `5173`)**  
  Stop the process using that port, or start with a different port:
  ```powershell
  py -m uvicorn api.main:app --reload --host 127.0.0.1 --port 8001
  ```
  Then point the frontend API base/proxy to the same backend port.

- **Frontend starts but API calls fail**  
  Confirm backend health:
  ```powershell
  curl http://127.0.0.1:8000/health
  ```
  Also verify `dashboard/vite.config.js` proxy target matches the backend port.

- **Dependency/import errors (`ModuleNotFoundError`)**  
  Reinstall API deps:
  ```powershell
  py -m pip install -r requirements-api.txt
  ```
  Reinstall frontend deps:
  ```powershell
  cd dashboard
  npm install
  ```

- **Dashboard looks stale after CSV/path changes**  
  `analysis.py` caches loaded rows. If testing in Python REPL/scripts:
  ```python
  import analysis
  analysis._load_missions.cache_clear()
  ```
  Restarting uvicorn also refreshes state.
