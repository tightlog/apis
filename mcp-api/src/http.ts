import type { JsonValue } from '@tightlog/worker-utils/http/json';
import { z } from 'zod';

export const COACH_TOOL_NAMES = [
  'get_solunar',
  'get_current_conditions',
  'get_hourly_forecast',
  'get_weather_forecast',
  'get_tides',
  'get_marine_conditions',
  'get_river_level',
] as const;

export type CoachToolName = (typeof COACH_TOOL_NAMES)[number];

export function isCoachToolName(name: string): name is CoachToolName {
  return COACH_TOOL_NAMES.some(tool => tool === name);
}

export const coachContextInput = {
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  utcOffsetMinutes: z.number().int().min(-720).max(840),
};

export interface ToolTextResult {
  content: { type: string; text?: string }[];
  isError?: boolean;
}

export function toolResult<Output>(value: Output) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  } satisfies ToolTextResult;
}

export function toolResultValue(result: ToolTextResult): JsonValue {
  const text = result.content
    .flatMap(part => (part.type === 'text' && part.text ? [part.text] : []))
    .join('');
  if (result.isError) {
    return { error: text || 'tool failed' };
  }

  // SAFETY: toolResult is the only writer and it serializes JSON.
  return JSON.parse(text) as JsonValue;
}

export const RIVER_GAUGE_SEARCH_KM = 12;

export const RIVER_READING_COUNT = 12;

const RIVER_STEADY_M = 0.01;

const PRESSURE_STEADY_HPA = 2;

type Trend = 'rising' | 'falling' | 'steady';

export type RiverTrend = Trend;

export type PressureTrend = Trend;

function trendOf(change: number, steadyBelow: number): Trend {
  if (Math.abs(change) < steadyBelow) {
    return 'steady';
  }

  return change > 0 ? 'rising' : 'falling';
}

export function riverTrend(fromM: number, toM: number): RiverTrend {
  return trendOf(toM - fromM, RIVER_STEADY_M);
}

export function pressureTrendOf(deltaHpa: number): PressureTrend {
  return trendOf(deltaHpa, PRESSURE_STEADY_HPA);
}

export type WmoGroup =
  | 'clear'
  | 'mainly clear'
  | 'partly cloudy'
  | 'overcast'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'rain showers'
  | 'snow showers'
  | 'thunderstorm';

// https://open-meteo.com/en/docs - WMO weather interpretation codes
const WMO_GROUPS: readonly [maxCode: number, group: WmoGroup][] = [
  [0, 'clear'],
  [1, 'mainly clear'],
  [2, 'partly cloudy'],
  [3, 'overcast'],
  [48, 'fog'],
  [57, 'drizzle'],
  [67, 'rain'],
  [77, 'snow'],
  [82, 'rain showers'],
  [86, 'snow showers'],
  [99, 'thunderstorm'],
];

export function wmoGroup(code: number | null | undefined): WmoGroup | null {
  if (code == null || code < 0) {
    return null;
  }

  return WMO_GROUPS.find(([maxCode]) => code <= maxCode)?.[1] ?? null;
}

export interface TidePoint {
  time: string;
  heightM: number;
}

export interface TideExtreme extends TidePoint {
  kind: 'high' | 'low';
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function tidePointsOf(
  times: readonly (string | null | undefined)[],
  heights: readonly (number | null | undefined)[],
): TidePoint[] {
  const points: TidePoint[] = [];
  for (let i = 0; i < times.length; i++) {
    const height = heights[i];
    const time = times[i];
    if (time != null && height != null && Number.isFinite(height)) {
      points.push({ time, heightM: round2(height) });
    }
  }

  return points;
}

export function findTideExtremes(points: readonly TidePoint[]): TideExtreme[] {
  const extremes: TideExtreme[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const prevPoint = points[i - 1];
    const currPoint = points[i];
    const nextPoint = points[i + 1];
    if (!prevPoint || !currPoint || !nextPoint) {
      continue;
    }

    const prev = prevPoint.heightM;
    const curr = currPoint.heightM;
    const next = nextPoint.heightM;
    const isHigh = curr >= prev && curr > next;
    const isLow = curr <= prev && curr < next;
    if (!isHigh && !isLow) {
      continue;
    }

    const curvature = prev - 2 * curr + next;
    let offset = 0;
    let heightM = curr;
    if (curvature !== 0) {
      offset = Math.max(-1, Math.min(1, (prev - next) / (2 * curvature)));
      heightM = curr - ((prev - next) * offset) / 4;
    }

    const stepMs =
      new Date(nextPoint.time).getTime() - new Date(currPoint.time).getTime();
    const time = new Date(
      new Date(currPoint.time).getTime() + offset * stepMs,
    ).toISOString();
    extremes.push({
      time,
      heightM: round2(heightM),
      kind: isHigh ? 'high' : 'low',
    });
  }

  return extremes;
}

interface HourlySurfacePressure {
  time?: readonly (string | null)[];
  surface_pressure?: readonly (number | null)[];
}

function dailyMeanPressures(
  hourly: HourlySurfacePressure | undefined,
): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>();
  const times = hourly?.time ?? [];
  for (let i = 0; i < times.length; i++) {
    const pressure = hourly?.surface_pressure?.[i];
    const time = times[i];
    if (pressure == null || !Number.isFinite(pressure) || time == null) {
      continue;
    }

    const day = time.slice(0, 10);
    const bucket = sums.get(day) ?? { total: 0, count: 0 };
    bucket.total += pressure;
    bucket.count += 1;
    sums.set(day, bucket);
  }

  const means = new Map<string, number>();
  for (const [day, { total, count }] of sums) {
    means.set(day, Math.round(total / count));
  }

  return means;
}

function dayPressureTrend(
  previous: number | null,
  pressure: number | null,
): PressureTrend | null {
  if (previous == null || pressure == null) {
    return null;
  }

  return pressureTrendOf(pressure - previous);
}

export interface DayPressure {
  meanHpa: number | null;
  trend: PressureTrend | null;
}

export function dayPressures(
  dates: readonly (string | null | undefined)[],
  hourly: HourlySurfacePressure | undefined,
): DayPressure[] {
  const means = dailyMeanPressures(hourly);
  let previous: number | null = null;
  return dates.map(date => {
    const meanHpa = (date == null ? null : means.get(date)) ?? null;
    const trend = dayPressureTrend(previous, meanHpa);
    previous = meanHpa ?? previous;
    return { meanHpa, trend };
  });
}
