export const SYNODIC_MONTH = 29.530588853;

const NEW_MOON_EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14);

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

export type BiteWindow = { start: Date; end: Date };

export type SolunarForecast = {
  age: number;
  illumination: number;
  phase: MoonPhaseName;
  rating: BiteRating;
  majors: BiteWindow[];
  minors: BiteWindow[];
};

export type LunarPhaseEvents = {
  nextNewMoon: Date;
  nextFullMoon: Date;
};

export type SolunarDay = {
  date: Date;
  age: number;
  phase: MoonPhaseName;
  rating: BiteRating;
  score: number;
};

export function nextLunarPhases(date: Date = new Date()): LunarPhaseEvents {
  const age = moonAge(date);
  const half = SYNODIC_MONTH / 2;
  const daysToNew = (SYNODIC_MONTH - age) % SYNODIC_MONTH;
  const daysToFull = (half - age + SYNODIC_MONTH) % SYNODIC_MONTH;
  return {
    nextNewMoon: new Date(date.getTime() + daysToNew * 86_400_000),
    nextFullMoon: new Date(date.getTime() + daysToFull * 86_400_000),
  };
}

export function moonAge(date: Date): number {
  const days = (date.getTime() - NEW_MOON_EPOCH_MS) / 86_400_000;
  const age = days % SYNODIC_MONTH;
  return age < 0 ? age + SYNODIC_MONTH : age;
}

export function moonIllumination(age: number): number {
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

export function biteRating(age: number): BiteRating {
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

export function biteScore(age: number): number {
  const quarter = SYNODIC_MONTH / 4;
  const distance = syzygyDistance(age);
  return Math.max(0, Math.min(1, 1 - distance / quarter));
}

export function solunarOutlook(
  days = 7,
  from: Date = new Date(),
): SolunarDay[] {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);

  const outlook: SolunarDay[] = [];
  for (let offset = 0; offset < days; offset++) {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    const midday = new Date(date);
    midday.setHours(12, 0, 0, 0);
    const age = moonAge(midday);
    outlook.push({
      date,
      age,
      phase: moonPhaseName(age),
      rating: biteRating(age),
      score: biteScore(age),
    });
  }

  return outlook;
}

function windowAround(center: Date, halfHours: number): BiteWindow {
  const half = halfHours * 3_600_000;
  return {
    start: new Date(center.getTime() - half),
    end: new Date(center.getTime() + half),
  };
}

export function solunarForecast(date: Date = new Date()): SolunarForecast {
  const age = moonAge(date);

  const midnight = new Date(date);
  midnight.setHours(0, 0, 0, 0);

  const transitHours = (12 + age * (24 / SYNODIC_MONTH)) % 24;

  const events: { hours: number; kind: 'major' | 'minor' }[] = [];
  for (const offset of [0, 12]) {
    events.push({ hours: (transitHours + offset) % 24, kind: 'major' });
  }

  for (const offset of [6, 18]) {
    events.push({ hours: (transitHours + offset) % 24, kind: 'minor' });
  }

  const majors: BiteWindow[] = [];
  const minors: BiteWindow[] = [];
  for (const event of [...events].sort((a, b) => a.hours - b.hours)) {
    const center = new Date(midnight.getTime() + event.hours * 3_600_000);
    if (event.kind === 'major') {
      majors.push(windowAround(center, 1));
    } else {
      minors.push(windowAround(center, 0.75));
    }
  }

  return {
    age,
    illumination: moonIllumination(age),
    phase: moonPhaseName(age),
    rating: biteRating(age),
    majors,
    minors,
  };
}
