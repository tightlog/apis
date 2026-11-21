export const SYNODIC_MONTH = 29.530588853;

const NEW_MOON_EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14);
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export type MoonPhaseName =
  | 'newMoon'
  | 'waxingCrescent'
  | 'firstQuarter'
  | 'waxingGibbous'
  | 'fullMoon'
  | 'waningGibbous'
  | 'lastQuarter'
  | 'waningCrescent';

export type BiteRating = 'excellent' | 'good' | 'fair' | 'slow';

export interface BiteWindow {
  start: Date;
  end: Date;
}

interface LocalDay {
  day: string;
  utcOffsetMinutes: number;
}

export interface SolunarForecast {
  age: number;
  illumination: number;
  phase: MoonPhaseName;
  rating: BiteRating;
  score: number;
  majors: BiteWindow[];
  minors: BiteWindow[];
}

export interface SolunarDay extends SolunarForecast {
  day: string;
  noon: Date;
}

export function localClock(at: Date, utcOffsetMinutes: number): string {
  return new Date(at.getTime() + utcOffsetMinutes * MINUTE_MS)
    .toISOString()
    .slice(0, 16);
}

export function localDay(at: Date, utcOffsetMinutes: number): LocalDay {
  return {
    day: localClock(at, utcOffsetMinutes).slice(0, 10),
    utcOffsetMinutes,
  };
}

export function runtimeLocalDay(at: Date): LocalDay {
  const midnight = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  return localDay(midnight, -midnight.getTimezoneOffset());
}

function localMidnightMs({ day, utcOffsetMinutes }: LocalDay): number {
  const midnightUtc = /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? Date.parse(`${day}T00:00:00Z`)
    : Number.NaN;
  if (Number.isNaN(midnightUtc)) {
    throw new RangeError(`Expected a YYYY-MM-DD day, got "${day}"`);
  }

  return midnightUtc - utcOffsetMinutes * MINUTE_MS;
}

export function nextLunarPhases(at: Date) {
  const age = moonAge(at);
  const half = SYNODIC_MONTH / 2;
  const daysToNew = (SYNODIC_MONTH - age) % SYNODIC_MONTH;
  const daysToFull = (half - age + SYNODIC_MONTH) % SYNODIC_MONTH;
  return {
    nextNewMoon: new Date(at.getTime() + daysToNew * DAY_MS),
    nextFullMoon: new Date(at.getTime() + daysToFull * DAY_MS),
  };
}

export function moonAge(date: Date): number {
  const days = (date.getTime() - NEW_MOON_EPOCH_MS) / DAY_MS;
  const age = days % SYNODIC_MONTH;
  return age < 0 ? age + SYNODIC_MONTH : age;
}

function moonIllumination(age: number): number {
  return (1 - Math.cos((2 * Math.PI * age) / SYNODIC_MONTH)) / 2;
}

export function phaseAngle(age: number): number {
  return (2 * Math.PI * age) / SYNODIC_MONTH;
}

export function moonPhaseName(age: number): MoonPhaseName {
  const fraction = age / SYNODIC_MONTH;
  const index = Math.floor((fraction * 8 + 0.5) % 8);
  const names: MoonPhaseName[] = [
    'newMoon',
    'waxingCrescent',
    'firstQuarter',
    'waxingGibbous',
    'fullMoon',
    'waningGibbous',
    'lastQuarter',
    'waningCrescent',
  ];
  return names[index] ?? 'newMoon';
}

function syzygyDistance(age: number): number {
  const half = SYNODIC_MONTH / 2;
  return Math.min(age, Math.abs(age - half), SYNODIC_MONTH - age);
}

function biteRating(age: number): BiteRating {
  const distance = syzygyDistance(age);
  if (distance < 1.5) {
    return 'excellent';
  }

  if (distance < 4) {
    return 'good';
  }

  if (distance < 6) {
    return 'fair';
  }

  return 'slow';
}

function biteScore(age: number): number {
  const quarter = SYNODIC_MONTH / 4;
  const distance = syzygyDistance(age);
  return Math.max(0, Math.min(1, 1 - distance / quarter));
}

function byStart(a: BiteWindow, b: BiteWindow): number {
  return a.start.getTime() - b.start.getTime();
}

export function solunarForecast(day: LocalDay): SolunarForecast {
  const midnight = localMidnightMs(day);
  const age = moonAge(new Date(midnight + 12 * HOUR_MS));
  const transitHours = (12 + age * (24 / SYNODIC_MONTH)) % 24;
  const window = (offsetHours: number, halfHours: number): BiteWindow => {
    const center = midnight + ((transitHours + offsetHours) % 24) * HOUR_MS;
    const half = halfHours * HOUR_MS;
    return { start: new Date(center - half), end: new Date(center + half) };
  };

  return {
    age,
    illumination: moonIllumination(age),
    phase: moonPhaseName(age),
    rating: biteRating(age),
    score: biteScore(age),
    majors: [window(0, 1), window(12, 1)].sort(byStart),
    minors: [window(6, 0.75), window(18, 0.75)].sort(byStart),
  };
}

export function solunarOutlook(from: LocalDay, days: number): SolunarDay[] {
  const start = localMidnightMs(from);
  return Array.from({ length: days }, (_, offset) => {
    const noon = new Date(start + offset * DAY_MS + 12 * HOUR_MS);
    const local = localDay(noon, from.utcOffsetMinutes);
    return { ...solunarForecast(local), day: local.day, noon };
  });
}
