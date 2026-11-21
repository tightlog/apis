import { describe, expect, test } from 'vitest';
import {
  dayPressures,
  findTideExtremes,
  tidePointsOf,
  pressureTrendOf,
  riverTrend,
  toolResult,
  toolResultValue,
  wmoGroup,
} from '../src/http';
import type { DayPressure, TidePoint } from '../src/http';

const BASE = Date.UTC(2026, 5, 12, 0, 0, 0);

function iso(hoursFromBase: number): string {
  return new Date(BASE + hoursFromBase * 3_600_000).toISOString();
}

function sineTide(hours: number, peakHour: number, periodH = 12): TidePoint[] {
  const points: TidePoint[] = [];
  for (let h = 0; h < hours; h++) {
    const height = Math.cos(((h - peakHour) / periodH) * 2 * Math.PI) * 1.5;
    points.push({ time: iso(h), heightM: Math.round(height * 1000) / 1000 });
  }

  return points;
}

describe('tidePointsOf', () => {
  test('drops missing heights and rounds to the centimetre', () => {
    expect(
      tidePointsOf([iso(0), iso(1), iso(2)], [0.123, null, -1.456]),
    ).toEqual<TidePoint[]>([
      { time: iso(0), heightM: 0.12 },
      { time: iso(2), heightM: -1.46 },
    ]);
  });
});

describe('findTideExtremes', () => {
  test('finds alternating highs and lows on a semidiurnal curve', () => {
    const extremes = findTideExtremes(sineTide(48, 3));
    expect(extremes.length).toBeGreaterThanOrEqual(7);

    expect(extremes[0]!.kind).toBe('high');
    for (let i = 1; i < extremes.length; i++) {
      expect(extremes[i]!.kind).not.toBe(extremes[i - 1]!.kind);
    }
  });

  test('parabola fit recovers a peak that falls between hourly samples', () => {
    const extremes = findTideExtremes(sineTide(24, 3.5));
    const firstHigh = extremes.find(e => e.kind === 'high')!;
    const peakHour = (new Date(firstHigh.time).getTime() - BASE) / 3_600_000;
    expect(Math.abs(peakHour - 3.5)).toBeLessThan(0.25);

    expect(firstHigh.heightM).toBeCloseTo(1.5, 1);
  });

  test('flat curve produces no extremes', () => {
    const flat: TidePoint[] = Array.from({ length: 24 }, (_, i) => ({
      time: iso(i),
      heightM: 0.4,
    }));
    expect(findTideExtremes(flat)).toHaveLength(0);
  });
});

describe('dayPressures', () => {
  test('buckets hourly pressure by local calendar day and rounds the mean', () => {
    expect(
      dayPressures(['2026-07-08', '2026-07-09'], {
        time: [
          '2026-07-08T00:00',
          '2026-07-08T12:00',
          '2026-07-09T00:00',
          '2026-07-09T12:00',
        ],
        surface_pressure: [1000, 1010, 1020, 1022],
      }).map(day => day.meanHpa),
    ).toEqual([1005, 1021]);
  });

  test('skips null samples and gives no mean for a day with no readings', () => {
    expect(
      dayPressures(['2026-07-08', '2026-07-09'], {
        time: ['2026-07-08T00:00', '2026-07-08T12:00', '2026-07-09T00:00'],
        surface_pressure: [null, 1008, null],
      }).map(day => day.meanHpa),
    ).toEqual([1008, null]);
  });

  test('gives no mean or trend when there is no hourly series', () => {
    expect(dayPressures(['2026-07-08'], undefined)).toEqual<DayPressure[]>([
      { meanHpa: null, trend: null },
    ]);
  });

  test('reads a change over 2 hPa as rising or falling and a small change as steady', () => {
    const trends = (pressures: number[]) =>
      dayPressures(
        pressures.map((_, index) => `2026-07-0${index + 1}`),
        {
          time: pressures.map((_, index) => `2026-07-0${index + 1}T00:00`),
          surface_pressure: pressures,
        },
      ).map(day => day.trend);

    expect(trends([1010, 1005, 1010, 1009])).toEqual([
      null,
      'falling',
      'rising',
      'steady',
    ]);
  });

  test('compares each day with the last day that had readings', () => {
    expect(
      dayPressures(['2026-07-08', '2026-07-09', '2026-07-10'], {
        time: ['2026-07-08T00:00', '2026-07-09T00:00', '2026-07-10T00:00'],
        surface_pressure: [1012, null, 1006],
      }),
    ).toEqual<DayPressure[]>([
      { meanHpa: 1012, trend: null },
      { meanHpa: null, trend: null },
      { meanHpa: 1006, trend: 'falling' },
    ]);
  });
});

describe('river trend', () => {
  test('a change under a centimetre is steady, a larger one has a direction', () => {
    expect(riverTrend(0.5, 0.505)).toBe('steady');

    expect(riverTrend(0.5, 0.62)).toBe('rising');

    expect(riverTrend(0.62, 0.5)).toBe('falling');
  });
});

describe('pressure trend', () => {
  test('a change under 2 hPa is steady, a larger one has a direction', () => {
    expect(pressureTrendOf(1.9)).toBe('steady');

    expect(pressureTrendOf(2)).toBe('rising');

    expect(pressureTrendOf(-2)).toBe('falling');
  });
});

describe('WMO weather codes', () => {
  test('each documented code falls in its group', () => {
    expect([0, 1, 2, 3, 45, 51, 61, 71, 80, 85, 95].map(wmoGroup)).toEqual([
      'clear',
      'mainly clear',
      'partly cloudy',
      'overcast',
      'fog',
      'drizzle',
      'rain',
      'snow',
      'rain showers',
      'snow showers',
      'thunderstorm',
    ]);
  });

  test('a code outside the table has no group', () => {
    expect(wmoGroup(100)).toBeNull();

    expect(wmoGroup(-1)).toBeNull();
  });
});

describe('coach', () => {
  test('a tool result round-trips through one text part', () => {
    expect(toolResultValue(toolResult({ available: false }))).toEqual({
      available: false,
    });
  });

  test('an error result becomes an error object', () => {
    expect(
      toolResultValue({
        content: [{ type: 'text', text: 'no sea nearby' }],
        isError: true,
      }),
    ).toEqual({ error: 'no sea nearby' });

    expect(toolResultValue({ content: [], isError: true })).toEqual({
      error: 'tool failed',
    });
  });
});
