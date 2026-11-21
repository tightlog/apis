import {
  localClock,
  localDay,
  nextLunarPhases,
  solunarForecast,
  solunarOutlook,
} from '@tightlog/solunar';
import type { BiteWindow } from '@tightlog/solunar';

export function solunar(
  input: { utcOffsetMinutes: number; days: number },
  now: Date = new Date(),
) {
  const localTime = (date: Date) => localClock(date, input.utcOffsetMinutes);
  const window = ({ start, end }: BiteWindow) => ({
    start: localTime(start),
    end: localTime(end),
  });
  const today = localDay(now, input.utcOffsetMinutes);
  const forecast = solunarForecast(today);
  const phases = nextLunarPhases(now);

  return {
    timesAre: 'local time at the angler',
    today: {
      date: today.day,
      moonPhase: forecast.phase,
      illuminationPercent: Math.round(forecast.illumination * 100),
      rating: forecast.rating,
      majorWindows: forecast.majors.map(window),
      minorWindows: forecast.minors.map(window),
    },
    nextNewMoon: localTime(phases.nextNewMoon).slice(0, 10),
    nextFullMoon: localTime(phases.nextFullMoon).slice(0, 10),
    outlook:
      input.days > 1
        ? solunarOutlook(today, input.days).map(day => ({
            date: day.day,
            moonPhase: day.phase,
            rating: day.rating,
          }))
        : undefined,
  };
}
