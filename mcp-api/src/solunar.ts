import {
  nextLunarPhases,
  solunarForecast,
  solunarOutlook,
} from '@tightlog/solunar';
import type { BiteWindow } from '@tightlog/solunar';

const MINUTE_MS = 60_000;

function localTime(date: Date): string {
  return date.toISOString().slice(0, 16);
}

/**
 * The app's solunar module reads the runtime time zone, and a Worker runs in
 * UTC. Shifting the clock by the angler's offset makes UTC read as their local
 * time, so the windows land on the same hours the app shows.
 */
export function solunar(
  input: { utcOffsetMinutes: number; days: number },
  now: Date = new Date(),
) {
  const local = new Date(now.getTime() + input.utcOffsetMinutes * MINUTE_MS);
  const today = solunarForecast(local);
  const phases = nextLunarPhases(local);
  const window = ({ start, end }: BiteWindow) => ({
    start: localTime(start),
    end: localTime(end),
  });

  return {
    timesAre: 'local time at the angler',
    today: {
      date: localTime(local).slice(0, 10),
      moonPhase: today.phase,
      illuminationPercent: Math.round(today.illumination * 100),
      rating: today.rating,
      majorWindows: today.majors.map(window),
      minorWindows: today.minors.map(window),
    },
    nextNewMoon: localTime(phases.nextNewMoon).slice(0, 10),
    nextFullMoon: localTime(phases.nextFullMoon).slice(0, 10),
    outlook:
      input.days > 1
        ? solunarOutlook(input.days, local).map(day => ({
            date: localTime(day.date).slice(0, 10),
            moonPhase: day.phase,
            rating: day.rating,
          }))
        : undefined,
  };
}
