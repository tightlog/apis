interface TideTurn {
  time: string;
  kind: 'high' | 'low';
  heightM: number;
}

export function tideTurns(times: string[], heights: (number | null)[]) {
  const turns: TideTurn[] = [];
  for (let index = 1; index < times.length - 1; index++) {
    const before = heights[index - 1];
    const height = heights[index];
    const after = heights[index + 1];
    const time = times[index];
    if (before == null || height == null || after == null || time == null) {
      continue;
    }

    if (height > before && height >= after) {
      turns.push({ time, kind: 'high', heightM: height });
    } else if (height < before && height <= after) {
      turns.push({ time, kind: 'low', heightM: height });
    }
  }

  return turns;
}
