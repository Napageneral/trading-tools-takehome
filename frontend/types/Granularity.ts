export class Granularity {
    constructor(
        public symbol: string,  // e.g. "1t", "1s", "1m", "1mon"
        public name: string,    // e.g. "1 tick", "1 sec", "1 min", "1 month"
        public minVal: number,
        public maxVal: number,
        public size: number,
        public nsSize: number,  // size in nanoseconds
        public down: Granularity | null = null,
        public up: Granularity | null = null
    ) {}

    toString(): string {
        return `<Granularity ${this.symbol} (${this.name})>`;
    }
}

// Create granularity instances
export const tick = new Granularity('1t', '1 tick', 1, 400, 2000, 1);
export const oneSecond = new Granularity('1s', '1 second', 2, 120, 2400, 1_000_000_000, tick);
tick.up = oneSecond;

export const oneMinute = new Granularity('1m', '1 minute', 2, 10, 2400, 60_000_000_000, oneSecond);
oneSecond.up = oneMinute;

export const fiveMinutes = new Granularity('5m', '5 minutes', 2, 24, 1344, 300_000_000_000, oneMinute);
oneMinute.up = fiveMinutes;

export const hour = new Granularity('1h', '1 hour', 2, 24, 1344, 3_600_000_000_000, fiveMinutes);
fiveMinutes.up = hour;

export const day = new Granularity('1d', '1 day', 2, 14, 112, 86_400_000_000_000, hour);
hour.up = day;

export const week = new Granularity('1w', '1 week', 2, 8, 192, 604_800_000_000_000, day);
day.up = week;

export const month = new Granularity('1mon', '1 month', 2, 24, 240, 2_592_000_000_000_000, week);
week.up = month;

export const year = new Granularity('1y', '1 year', 2, 10, 100, 31_536_000_000_000_000, month);
month.up = year;

// Create a lookup object for easy access by symbol
export const GRANULARITIES: { [key: string]: Granularity } = {
    [tick.symbol]: tick,
    [oneSecond.symbol]: oneSecond,
    [oneMinute.symbol]: oneMinute,
    [fiveMinutes.symbol]: fiveMinutes,
    [hour.symbol]: hour,
    [day.symbol]: day,
    [week.symbol]: week,
    [month.symbol]: month,
    [year.symbol]: year,
};

// Default granularity
export const DEFAULT_GRANULARITY = oneMinute;

// Add interval mapping helper function
export function getIntervalForGranularity(gran: Granularity): { timeUnit: "millisecond" | "second" | "minute" | "hour" | "day" | "week" | "month" | "year", count: number } {
    switch (gran.symbol) {
        case "1t":
            return { timeUnit: "millisecond", count: 1 };
        case "1s":
            return { timeUnit: "second", count: 1 };
        case "1m":
            return { timeUnit: "minute", count: 1 };
        case "5m":
            return { timeUnit: "minute", count: 5 };
        case "1h":
            return { timeUnit: "hour", count: 1 };
        case "1d":
            return { timeUnit: "day", count: 1 };
        case "1w":
            return { timeUnit: "week", count: 1 };
        case "1mon":
            return { timeUnit: "month", count: 1 };
        case "1y":
            return { timeUnit: "year", count: 1 };
        default:
            return { timeUnit: "second", count: 1 };
    }
} 