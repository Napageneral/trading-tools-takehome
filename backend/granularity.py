from dataclasses import dataclass
from typing import Optional, Dict

@dataclass
class Granularity:
    symbol: str  # e.g. "1t", "1s", "1m", "1mon"
    name: str    # e.g. "1 tick", "1 sec", "1 min", "1 month"
    min_val: int
    max_val: int
    size: int
    ns_size: int  # size in nanoseconds
    down: Optional['Granularity'] = None
    up: Optional['Granularity'] = None

    def __repr__(self):
        return f"<Granularity {self.symbol} ({self.name})>"

# Create granularity instances
tick = Granularity('1t', '1 tick', 1, 400, 2000, 1)
one_s = Granularity('1s', '1 second', 2, 120, 2400, 1_000_000_000, down=tick)
tick.up = one_s

one_min = Granularity('1m', '1 minute', 2, 10, 2400, 60_000_000_000, down=one_s)
one_s.up = one_min

five_min = Granularity('5m', '5 minutes', 2, 24, 1344, 300_000_000_000, down=one_min)
one_min.up = five_min

hour = Granularity('1h', '1 hour', 2, 24, 1344, 3_600_000_000_000, down=five_min)
five_min.up = hour

day = Granularity('1d', '1 day', 2, 14, 112, 86_400_000_000_000, down=hour)
hour.up = day

week = Granularity('1w', '1 week', 2, 8, 192, 604_800_000_000_000, down=day)
day.up = week

month = Granularity('1mon', '1 month', 2, 24, 240, 2_592_000_000_000_000, down=week)
week.up = month

year = Granularity('1y', '1 year', 2, 10, 100, 31_536_000_000_000_000, down=month)
month.up = year

# Create a lookup dictionary for easy access by symbol
GRANULARITIES: Dict[str, Granularity] = {
    g.symbol: g for g in [
        tick, one_s, one_min, five_min, hour, day, week, month, year
    ]
}

# Default granularity
DEFAULT_GRANULARITY = one_min 