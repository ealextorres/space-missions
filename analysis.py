import csv
from collections import Counter, defaultdict
from datetime import date, datetime
from functools import lru_cache
from typing import Dict, List, Optional, Tuple


CSV_PATH = "space_missions.csv"
REQUIRED_COLUMNS = ("Date", "Company", "MissionStatus", "Mission", "Rocket")
NORMALIZED_TEXT_FIELDS = ("Company", "MissionStatus", "Rocket", "Mission", "Location")
KNOWN_MISSION_STATUSES = (
  "Success",
  "Failure",
  "Partial Failure",
  "Prelaunch Failure",
)
_KNOWN_MISSION_STATUSES_SET = set(KNOWN_MISSION_STATUSES)
_MISSION_STATUS_ALIASES = {
  "success": "Success",
  "failure": "Failure",
  "partial failure": "Partial Failure",
  "prelaunch failure": "Prelaunch Failure",
}
_last_load_stats: Dict[str, object] = {}


def _empty_load_stats() -> Dict[str, object]:
  return {
    "missing_required_columns": [],
    "total_rows": 0,
    "loaded_rows": 0,
    "dropped_rows": 0,
    "missing_date_count": 0,
    "invalid_date_count": 0,
    "unknown_status_count": 0,
  }


def _parse_iso_date(value: str) -> Optional[date]:
  if not isinstance(value, str):
    return None
  normalized = value.strip()
  if not normalized:
    return None
  try:
    return datetime.strptime(normalized, "%Y-%m-%d").date()
  except ValueError:
    return None


def _normalize_mission_status(value: str) -> str:
  normalized = _normalize_non_empty_string(value)
  if normalized is None:
    return "Unknown"
  alias = _MISSION_STATUS_ALIASES.get(normalized.casefold())
  if alias is not None:
    return alias
  if normalized in _KNOWN_MISSION_STATUSES_SET:
    return normalized
  return "Unknown"


@lru_cache(maxsize=1)
def _load_missions() -> List[Dict[str, str]]:
  global _last_load_stats
  stats = _empty_load_stats()
  missions: List[Dict[str, str]] = []
  with open(CSV_PATH, encoding="utf-8") as f:
    reader = csv.DictReader(f)
    fieldnames = [name.strip() for name in (reader.fieldnames or []) if isinstance(name, str)]
    missing_required = [name for name in REQUIRED_COLUMNS if name not in fieldnames]
    if missing_required:
      stats["missing_required_columns"] = missing_required
      _last_load_stats = stats
      return missions

    for row in reader:
      stats["total_rows"] += 1
      normalized_row = {
        key: (value.strip() if isinstance(value, str) else value) for key, value in row.items()
      }
      for field in NORMALIZED_TEXT_FIELDS:
        value = normalized_row.get(field)
        normalized_row[field] = value if isinstance(value, str) else ""

      if _parse_iso_date(normalized_row.get("Date", "")) is None:
        if normalized_row.get("Date"):
          stats["invalid_date_count"] += 1
        else:
          stats["missing_date_count"] += 1
        stats["dropped_rows"] += 1
        continue
      normalized_row["MissionStatus"] = _normalize_mission_status(normalized_row.get("MissionStatus"))
      if normalized_row["MissionStatus"] == "Unknown":
        stats["unknown_status_count"] += 1
      missions.append(normalized_row)
      stats["loaded_rows"] += 1
  _last_load_stats = stats
  return missions


def getLoadValidationStats() -> Dict[str, object]:
  _load_missions()
  return dict(_last_load_stats)


def GetLoadValidationStats() -> Dict[str, object]:
  return getLoadValidationStats()


def getMissionCountByCompany(companyName: str) -> int:
  missions = _load_missions()
  normalized_company = _normalize_non_empty_string(companyName)
  if normalized_company is None:
    return 0
  return sum(1 for m in missions if m.get("Company") == normalized_company)


def GetMissionCountByCompany(companyName: str) -> int:
  return getMissionCountByCompany(companyName)


def getSuccessRate(companyName: str) -> float:
  missions = _load_missions()
  normalized_company = _normalize_non_empty_string(companyName)
  if normalized_company is None:
    return 0.0
  company_missions = [m for m in missions if m.get("Company") == normalized_company]
  if not company_missions:
    return 0.0
  successes = sum(1 for m in company_missions if m.get("MissionStatus") == "Success")
  rate = (successes / len(company_missions)) * 100.0
  return float(f"{rate:.5f}")


def GetSuccessRate(companyName: str) -> float:
  return getSuccessRate(companyName)


def _parse_year(value: int) -> Optional[int]:
  try:
    year = int(value)
  except (TypeError, ValueError):
    return None
  if year < 1 or year > 9999:
    return None
  return year


def _parse_non_negative_int(value: int) -> Optional[int]:
  try:
    parsed = int(value)
  except (TypeError, ValueError):
    return None
  return parsed if parsed >= 0 else None


def _normalize_non_empty_string(value: str) -> Optional[str]:
  if not isinstance(value, str):
    return None
  normalized = value.strip()
  return normalized if normalized else None


def _parse_mission_row_date(row: Dict[str, str]) -> Optional[date]:
  return _parse_iso_date(row.get("Date"))


def getMissionsByDateRange(startDate: str, endDate: str) -> List[str]:
  missions = _load_missions()
  start = _parse_iso_date(startDate)
  end = _parse_iso_date(endDate)
  if start is None or end is None:
    return []
  if start > end:
    return []

  result: List[Tuple[date, str]] = []
  for m in missions:
    date_obj = _parse_mission_row_date(m)
    if date_obj is None:
      continue
    if start <= date_obj <= end:
      result.append((date_obj, m.get("Mission", "")))

  result.sort(key=lambda x: x[0])
  return [name for _, name in result]


def GetMissionsByDateRange(startDate: str, endDate: str) -> List[str]:
  return getMissionsByDateRange(startDate, endDate)


def getTopCompaniesByMissionCount(n: int) -> List[Tuple[str, int]]:
  missions = _load_missions()
  limit = _parse_non_negative_int(n)
  if limit is None or limit == 0:
    return []
  counter: Counter[str] = Counter()
  for m in missions:
    company = m.get("Company")
    if company:
      counter[company] += 1

  items = list(counter.items())
  items.sort(key=lambda x: (-x[1], x[0]))
  return items[:limit]


def GetTopCompaniesByMissionCount(n: int) -> List[Tuple[str, int]]:
  return getTopCompaniesByMissionCount(n)


def getMissionStatusCount() -> Dict[str, int]:
  missions = _load_missions()
  counts: Dict[str, int] = defaultdict(int)
  for m in missions:
    status = m.get("MissionStatus")
    if status:
      counts[status] += 1

  return {
    "Success": counts.get("Success", 0),
    "Failure": counts.get("Failure", 0),
    "Partial Failure": counts.get("Partial Failure", 0),
    "Prelaunch Failure": counts.get("Prelaunch Failure", 0),
  }


def GetMissionStatusCount() -> Dict[str, int]:
  return getMissionStatusCount()


def getMissionsByYear(year: int) -> int:
  missions = _load_missions()
  parsed_year = _parse_year(year)
  if parsed_year is None:
    return 0
  count = 0
  for m in missions:
    date_obj = _parse_mission_row_date(m)
    if date_obj is None:
      continue
    if date_obj.year == parsed_year:
      count += 1
  return count


def GetMissionsByYear(year: int) -> int:
  return getMissionsByYear(year)


def getMostUsedRocket() -> str:
  missions = _load_missions()
  counter: Counter[str] = Counter()
  for m in missions:
    rocket = m.get("Rocket")
    if rocket:
      counter[rocket] += 1

  if not counter:
    return ""

  max_count = max(counter.values())
  candidates = [name for name, count in counter.items() if count == max_count]
  return sorted(candidates)[0]


def GetMostUsedRocket() -> str:
  return getMostUsedRocket()


def getAverageMissionsPerYear(startYear: int, endYear: int) -> float:
  missions = _load_missions()
  start = _parse_year(startYear)
  end = _parse_year(endYear)
  if start is None or end is None:
    return 0.0
  if end < start:
    start, end = end, start

  years_span = end - start + 1
  if years_span <= 0:
    return 0.0

  counts_by_year: Dict[int, int] = defaultdict(int)
  for m in missions:
    date_obj = _parse_mission_row_date(m)
    if date_obj is None:
      continue
    year = date_obj.year
    if start <= year <= end:
      counts_by_year[year] += 1

  total = sum(counts_by_year.get(y, 0) for y in range(start, end + 1))
  avg = total / years_span
  return float(f"{avg:.5f}")


def GetAverageMissionsPerYear(startYear: int, endYear: int) -> float:
  return getAverageMissionsPerYear(startYear, endYear)

