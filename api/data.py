"""Load missions CSV and build dashboard aggregates (mirrors dashboard filter/chart logic)."""

from __future__ import annotations

import csv
import os
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, TypedDict


class MultiFilterPayload(TypedDict):
    all: bool
    values: List[str]


LAUNCH_COUNTRY_OVERRIDES = {
    "New Mexico": "USA",
    "Gran Canaria": "Spain",
    "Pacific Missile Range Facility": "USA",
    "Shahrud Missile Test Site": "Iran",
}

LAUNCH_SEA_OR_OCEAN = frozenset(
    {"Pacific Ocean", "Barents Sea", "Yellow Sea"},
)


def resolve_csv_path() -> Path:
    override = os.environ.get("SPACE_MISSIONS_CSV")
    if override:
        p = Path(override).expanduser()
        return p if p.is_absolute() else (Path.cwd() / p).resolve()
    root = Path(os.environ.get("SPACE_MISSIONS_ROOT", Path(__file__).resolve().parent.parent))
    return (root / "space_missions.csv").resolve()


def get_launch_country(location: Optional[str]) -> str:
    if not location or not isinstance(location, str):
        return "Unknown"
    parts = [p.strip() for p in location.split(",") if p.strip()]
    if not parts:
        return "Unknown"
    raw = parts[-1]
    if raw in LAUNCH_COUNTRY_OVERRIDES:
        return LAUNCH_COUNTRY_OVERRIDES[raw]
    if raw in LAUNCH_SEA_OR_OCEAN:
        return "International waters"
    return raw


def get_normalized_rocket_status(row: Dict[str, Any]) -> str:
    raw = row.get("RocketStatus")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    return "N/A"


def _parse_mission_datetime(row: Dict[str, str]) -> Optional[datetime]:
    date_str = row.get("Date")
    if not date_str:
        return None
    t = (row.get("Time") or "00:00:00").strip()
    if len(t) == 5:
        t = f"{t}:00"
    try:
        return datetime.fromisoformat(f"{date_str}T{t}")
    except ValueError:
        try:
            return datetime.strptime(f"{date_str} {t}", "%Y-%m-%d %H:%M:%S")
        except ValueError:
            return datetime.strptime(date_str, "%Y-%m-%d")


def load_enriched_missions() -> List[Dict[str, Any]]:
    path = resolve_csv_path()
    out: List[Dict[str, Any]] = []
    with open(path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not row.get("Date"):
                continue
            dt = _parse_mission_datetime(row)
            if dt is None:
                continue
            m = dict(row)
            m["_dt"] = dt
            m["_year"] = dt.year
            m["_launch_country"] = get_launch_country(row.get("Location"))
            out.append(m)
    return out


def _passes_multi_filter(field_value: str, flt: MultiFilterPayload) -> bool:
    """When no specific values are selected, behave like ALL (do not exclude rows)."""
    if flt["all"]:
        return True
    if not flt["values"]:
        return True
    return field_value in flt["values"]


def filter_missions(
    missions: List[Dict[str, Any]],
    company_filter: MultiFilterPayload,
    status_filter: MultiFilterPayload,
    country_filter: MultiFilterPayload,
    rocket_status_filter: MultiFilterPayload,
    start_date: str,
    end_date: str,
) -> List[Dict[str, Any]]:
    start_dt: Optional[datetime] = None
    end_dt: Optional[datetime] = None
    if start_date:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    if end_date:
        end_dt = datetime.strptime(f"{end_date} 23:59:59", "%Y-%m-%d %H:%M:%S")

    filtered: List[Dict[str, Any]] = []
    for m in missions:
        c = m.get("Company") or ""
        st = m.get("MissionStatus") or ""
        lc = m.get("_launch_country") or "Unknown"

        if not _passes_multi_filter(c, company_filter):
            continue
        if not _passes_multi_filter(st, status_filter):
            continue
        if not _passes_multi_filter(lc, country_filter):
            continue
        rs = get_normalized_rocket_status(m)
        if not _passes_multi_filter(rs, rocket_status_filter):
            continue

        md = m["_dt"]
        if start_dt and md < start_dt:
            continue
        if end_dt and md > end_dt:
            continue
        filtered.append(m)
    return filtered


def build_dashboard_payload(filtered: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not filtered:
        return {
            "total_missions": 0,
            "successful_missions": 0,
            "overall_success_rate": "0.00",
            "unique_companies": 0,
            "year_range": "",
            "missions_by_year": [],
            "missions_by_company": [],
            "missions_by_status": [],
            "missions_by_launch_country": [],
        }

    total = len(filtered)
    successful = sum(1 for m in filtered if m.get("MissionStatus") == "Success")
    rate = f"{(successful / total) * 100:.2f}" if total else "0.00"
    unique_companies = len({m.get("Company") for m in filtered if m.get("Company")})

    years = [m["_year"] for m in filtered]
    year_range = f"{min(years)}–{max(years)}"

    by_year: Counter[int] = Counter()
    for m in filtered:
        by_year[m["_year"]] += 1
    missions_by_year = [
        {"year": y, "count": c} for y, c in sorted(by_year.items(), key=lambda x: x[0])
    ]

    by_company: Counter[str] = Counter()
    for m in filtered:
        co = m.get("Company")
        if co:
            by_company[co] += 1
    missions_by_company = [
        {"name": n, "count": c}
        for n, c in sorted(by_company.items(), key=lambda x: (-x[1], x[0]))[:10]
    ]

    by_status: Counter[str] = Counter()
    for m in filtered:
        s = m.get("MissionStatus")
        if s:
            by_status[s] += 1
    missions_by_status = [{"status": s, "value": v} for s, v in by_status.items()]

    top_n = 12
    by_ctry: Counter[str] = Counter()
    for m in filtered:
        by_ctry[m.get("_launch_country") or "Unknown"] += 1
    items = sorted(by_ctry.items(), key=lambda x: (-x[1], x[0]))
    items = [{"name": n, "count": c} for n, c in items]
    if len(items) <= top_n:
        missions_by_launch_country = list(reversed(items))
    else:
        top = items[:top_n]
        other_sum = sum(r["count"] for r in items[top_n:])
        if other_sum > 0:
            top.append({"name": "Other", "count": other_sum})
        missions_by_launch_country = list(reversed(top))

    return {
        "total_missions": total,
        "successful_missions": successful,
        "overall_success_rate": rate,
        "unique_companies": unique_companies,
        "year_range": year_range,
        "missions_by_year": missions_by_year,
        "missions_by_company": missions_by_company,
        "missions_by_status": missions_by_status,
        "missions_by_launch_country": missions_by_launch_country,
    }
