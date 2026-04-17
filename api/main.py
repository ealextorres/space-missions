from __future__ import annotations

from contextlib import asynccontextmanager
import analysis as analysis_mod
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from api.data import (
    build_dashboard_payload,
    filter_missions,
    load_enriched_missions,
    resolve_csv_path,
)
from api.schemas import DashboardAggregateRequest


@asynccontextmanager
async def lifespan(app: FastAPI):
    csv_path = str(resolve_csv_path())
    analysis_mod.CSV_PATH = csv_path
    analysis_mod._load_missions.cache_clear()
    yield


app = FastAPI(title="Space missions API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True, "csv": str(resolve_csv_path())}


@app.post("/api/dashboard/aggregate")
def dashboard_aggregate(body: DashboardAggregateRequest):
    missions = load_enriched_missions()
    filtered = filter_missions(
        missions,
        {"all": body.company_filter.all, "values": body.company_filter.values},
        {"all": body.status_filter.all, "values": body.status_filter.values},
        {"all": body.country_filter.all, "values": body.country_filter.values},
        {"all": body.rocket_status_filter.all, "values": body.rocket_status_filter.values},
        body.start_date.strip(),
        body.end_date.strip(),
    )
    return build_dashboard_payload(filtered)


@app.get("/api/analysis/mission-count")
def analysis_mission_count(company: str = Query(..., min_length=1)):
    return {"company": company, "count": analysis_mod.getMissionCountByCompany(company)}


@app.get("/api/analysis/success-rate")
def analysis_success_rate(company: str = Query(..., min_length=1)):
    return {"company": company, "success_rate": analysis_mod.getSuccessRate(company)}


@app.get("/api/analysis/missions-by-date-range")
def analysis_missions_by_date_range(
    start: str = Query(..., description="YYYY-MM-DD"),
    end: str = Query(..., description="YYYY-MM-DD"),
):
    try:
        names = analysis_mod.getMissionsByDateRange(start, end)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"start": start, "end": end, "missions": names}


@app.get("/api/analysis/top-companies")
def analysis_top_companies(n: int = Query(10, ge=1, le=500)):
    items = analysis_mod.getTopCompaniesByMissionCount(n)
    return {"n": n, "companies": [{"name": name, "count": c} for name, c in items]}


@app.get("/api/analysis/mission-status-count")
def analysis_mission_status_count():
    return analysis_mod.getMissionStatusCount()


@app.get("/api/analysis/missions-by-year")
def analysis_missions_by_year(year: int = Query(...)):
    return {"year": year, "count": analysis_mod.getMissionsByYear(year)}


@app.get("/api/analysis/most-used-rocket")
def analysis_most_used_rocket():
    return {"rocket": analysis_mod.getMostUsedRocket()}


@app.get("/api/analysis/average-missions-per-year")
def analysis_average_missions_per_year(
    start_year: int = Query(...),
    end_year: int = Query(...),
):
    return {
        "start_year": start_year,
        "end_year": end_year,
        "average": analysis_mod.getAverageMissionsPerYear(start_year, end_year),
    }
