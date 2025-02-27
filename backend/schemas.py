from pydantic import BaseModel
from typing import List, Optional

class DataPoint(BaseModel):
    """Schema for a single data point."""
    timestamp_ns: int
    value: int

class DataPointResponse(BaseModel):
    """Schema for data point response."""
    data: List[DataPoint]

class TimeRangeRequest(BaseModel):
    """Schema for time range request."""
    start_ns: int
    end_ns: int
    granularity: Optional[str] = None 