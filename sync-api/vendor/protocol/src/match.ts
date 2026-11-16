export type MatchState = 'open' | 'drawn' | 'fishing' | 'weighing' | 'final';

export const MATCH_STATES = [
  'open',
  'drawn',
  'fishing',
  'weighing',
  'final',
] as const satisfies readonly MatchState[];

export const MATCH_LIMITS = {
  pegs: 200,
  pegLabel: 12,
  sections: 26,
  sectionName: 30,
  note: 140,
  totalKg: 250,
} as const;

export type AdvanceTarget = 'fishing' | 'weighing' | 'final';

export const ADVANCE_TARGETS = [
  'fishing',
  'weighing',
  'final',
] as const satisfies readonly AdvanceTarget[];

function nextMatchState(state: MatchState): MatchState | null {
  const index: number = MATCH_STATES.indexOf(state);
  return MATCH_STATES[index + 1] ?? null;
}

export function advanceTarget(state: MatchState): AdvanceTarget | null {
  const next = nextMatchState(state);
  return ADVANCE_TARGETS.find(target => target === next) ?? null;
}

export function canDraw(state: MatchState): boolean {
  return state === 'open' || state === 'drawn';
}

export function acceptsWeights(state: MatchState): boolean {
  return state === 'fishing' || state === 'weighing';
}

export interface MatchSection {
  name: string;
  pegs: string[];
}

export interface PegDraw {
  userId: string;
  peg: string;
  section: string | null;
}

export interface PegAssignment {
  userId: string;
  peg: string;
}

export interface DrawInput {
  pegs: string[];
  sections: MatchSection[];
  assignments: PegAssignment[];
}

export interface WeighInInput {
  totalKg: number;
  recordedAt: string;
  note: string | null;
}

export interface MatchWeight extends WeighInInput {
  userId: string;
}

export interface MatchRank {
  userId: string;
  peg: string;
  section: string | null;
  totalKg: number;
  recordedAt: string | null;
  rank: number;
  sectionRank: number | null;
}

export interface MatchStanding extends MatchRank {
  name: string;
  handle: string | null;
}

export interface MatchDetail {
  compId: string;
  state: MatchState;
  isAdmin: boolean;
  pegs: string[];
  sections: MatchSection[];
  myPeg: PegDraw | null;
  standings: MatchStanding[];
}

function allDistinct(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function isValidLabel(label: string, max: number): boolean {
  return label.length > 0 && label.length <= max;
}

function isValidPegList(pegs: readonly string[]): boolean {
  return (
    pegs.length > 0 &&
    pegs.length <= MATCH_LIMITS.pegs &&
    pegs.every(peg => isValidLabel(peg, MATCH_LIMITS.pegLabel)) &&
    allDistinct(pegs)
  );
}

export function isValidDraw(draw: DrawInput): boolean {
  const known = new Set(draw.pegs);
  const assigned = draw.assignments.map(assignment => assignment.peg);
  const placed = draw.sections.flatMap(section => section.pegs);
  return (
    isValidPegList(draw.pegs) &&
    draw.assignments.length <= MATCH_LIMITS.pegs &&
    assigned.every(peg => known.has(peg)) &&
    allDistinct(assigned) &&
    allDistinct(draw.assignments.map(assignment => assignment.userId)) &&
    draw.sections.length <= MATCH_LIMITS.sections &&
    draw.sections.every(
      section =>
        isValidLabel(section.name, MATCH_LIMITS.sectionName) &&
        section.pegs.length > 0,
    ) &&
    placed.every(peg => known.has(peg)) &&
    allDistinct(placed) &&
    allDistinct(draw.sections.map(section => section.name))
  );
}

export function parsePegList(text: string): string[] | null {
  const pegs: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const part = raw.trim();
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (!range) {
      if (part) {
        pegs.push(part);
      }

      continue;
    }

    const from = Number(range[1]);
    const to = Number(range[2]);
    if (Math.abs(to - from) >= MATCH_LIMITS.pegs) {
      return null;
    }

    const step = to < from ? -1 : 1;
    for (let peg = from; peg !== to + step; peg += step) {
      pegs.push(String(peg));
    }
  }

  return isValidPegList(pegs) ? pegs : null;
}

interface Rankable {
  totalKg: number;
  peg: string;
  section: string | null;
}

function rankBy<T extends Rankable>(rows: readonly T[]): Map<T, number> {
  const ranks = new Map<T, number>();
  let lastKg: number | null = null;
  let lastRank = 0;
  for (const [index, row] of rows.entries()) {
    lastRank = row.totalKg === lastKg ? lastRank : index + 1;
    lastKg = row.totalKg;
    ranks.set(row, lastRank);
  }

  return ranks;
}

export function rankMatch<T extends Rankable>(
  rows: readonly T[],
): (T & { rank: number; sectionRank: number | null })[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.totalKg - a.totalKg ||
      a.peg.localeCompare(b.peg, 'en', { numeric: true }),
  );
  const overall = rankBy(sorted);
  const bySection = new Map<T, number>();
  for (const name of new Set(sorted.map(row => row.section))) {
    if (name === null) {
      continue;
    }

    for (const [row, rank] of rankBy(sorted.filter(r => r.section === name))) {
      bySection.set(row, rank);
    }
  }

  return sorted.map(row => ({
    ...row,
    rank: overall.get(row) ?? sorted.length,
    sectionRank: bySection.get(row) ?? null,
  }));
}
