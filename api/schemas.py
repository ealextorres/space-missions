from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field


class MultiFilterModel(BaseModel):
    all: bool = True
    values: List[str] = Field(default_factory=list)


class DashboardAggregateRequest(BaseModel):
    company_filter: MultiFilterModel = Field(default_factory=MultiFilterModel)
    status_filter: MultiFilterModel = Field(default_factory=MultiFilterModel)
    country_filter: MultiFilterModel = Field(default_factory=MultiFilterModel)
    start_date: str = ""
    end_date: str = ""
