import csv
from collections import Counter, defaultdict
from datetime import datetime
from functools import lru_cache
from typing import Dict, List, Tuple


CSV_PATH = "space_missions.csv"


@lru_cache(maxsize=1)
def _load_missions() -> List[Dict[str, str]]:
  missions: List[Dict[str, str]] = []
  with open(CSV_PATH, encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
      if not row.get("Date"):
        continue
      missions.append(row)
  return missions


def getMissionCountByCompany(companyName: str) -> int:
  missions = _load_missions()
  return sum(1 for m in missions if m.get("Company") == companyName)


def GetMissionCountByCompany(companyName: str) -> int:
  return getMissionCountByCompany(companyName)


def getSuccessRate(companyName: str) -> float:
  missions = _load_missions()
  company_missions = [m for m in missions if m.get("Company") == companyName]
  if not company_missions:
    return 0.0
  successes = sum(1 for m in company_missions if m.get("MissionStatus") == "Success")
  rate = (successes / len(company_missions)) * 100.0
  return float(f"{rate:.5f}")


def GetSuccessRate(companyName: str) -> float:
  return getSuccessRate(companyName)


def getMissionsByDateRange(startDate: str, endDate: str) -> List[str]:
  missions = _load_missions()
  start = datetime.strptime(startDate, "%Y-%m-%d").date()
  end = datetime.strptime(endDate, "%Y-%m-%d").date()

  result: List[Tuple[datetime, str]] = []
  for m in missions:
    date_str = m.get("Date")
    if not date_str:
      continue
    date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
    if start <= date_obj <= end:
      result.append((date_obj, m.get("Mission", "")))

  result.sort(key=lambda x: x[0])
  return [name for _, name in result]


def GetMissionsByDateRange(startDate: str, endDate: str) -> List[str]:
  return getMissionsByDateRange(startDate, endDate)


def getTopCompaniesByMissionCount(n: int) -> List[Tuple[str, int]]:
  missions = _load_missions()
  counter: Counter[str] = Counter()
  for m in missions:
    company = m.get("Company")
    if company:
      counter[company] += 1

  items = list(counter.items())
  items.sort(key=lambda x: (-x[1], x[0]))
  return items[: max(0, n)]


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
  return sum(
    1
    for m in missions
    if m.get("Date")
    and datetime.strptime(m["Date"], "%Y-%m-%d").year == int(year)
  )


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
  start = int(startYear)
  end = int(endYear)
  if end < start:
    start, end = end, start

  years_span = end - start + 1
  if years_span <= 0:
    return 0.0

  counts_by_year: Dict[int, int] = defaultdict(int)
  for m in missions:
    if not m.get("Date"):
      continue
    year = datetime.strptime(m["Date"], "%Y-%m-%d").year
    if start <= year <= end:
      counts_by_year[year] += 1

  total = sum(counts_by_year.get(y, 0) for y in range(start, end + 1))
  avg = total / years_span
  return float(f"{avg:.5f}")


def GetAverageMissionsPerYear(startYear: int, endYear: int) -> float:
  return getAverageMissionsPerYear(startYear, endYear)

