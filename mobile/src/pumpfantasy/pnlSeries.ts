export type PnlPeriod = "1D" | "1W" | "1M" | "1Y" | "YTD" | "ALL";

export const PNL_PERIODS: PnlPeriod[] = ["1D", "1W", "1M", "1Y", "YTD", "ALL"];

export const PNL_PERIOD_LABEL: Record<PnlPeriod, string> = {
  "1D": "Past Day",
  "1W": "Past Week",
  "1M": "Past Month",
  "1Y": "Past Year",
  YTD: "Year to Date",
  ALL: "All Time",
};

const DAY = 86400;
const POINTS = 48;

export interface PnlSeries {
  points: { t: number; v: number }[];
  /** Profit or loss over the whole period, USD. */
  total: number;
}

/** Profit/loss over a period: the running sum of settled results, starting from zero at the period's start. */
export function buildPnlSeries(events: { t: number; usd: number }[], period: PnlPeriod, nowSec: number): PnlSeries {
  let start: number;
  switch (period) {
    case "1D":
      start = nowSec - DAY;
      break;
    case "1W":
      start = nowSec - 7 * DAY;
      break;
    case "1M":
      start = nowSec - 30 * DAY;
      break;
    case "1Y":
      start = nowSec - 365 * DAY;
      break;
    case "YTD":
      start = Math.floor(new Date(new Date(nowSec * 1000).getFullYear(), 0, 1).getTime() / 1000);
      break;
    default:
      start = events.length > 0 ? events[0].t - DAY / 4 : nowSec - DAY;
  }
  const inRange = events.filter((e) => e.t > start && e.t <= nowSec);
  const points: { t: number; v: number }[] = [];
  let i = 0;
  let sum = 0;
  for (let k = 0; k < POINTS; k++) {
    const t = start + ((nowSec - start) * k) / (POINTS - 1);
    while (i < inRange.length && inRange[i].t <= t) sum += inRange[i++].usd;
    points.push({ t, v: sum });
  }
  return { points, total: sum };
}

export const formatUsd = (v: number): string => (v < 0 ? "-" : "") + "$" + Math.abs(v).toFixed(2);
