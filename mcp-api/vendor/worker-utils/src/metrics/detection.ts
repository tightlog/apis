export interface ConfusionCounts {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
}

export interface Rate {
  value: number;
  low: number;
  high: number;
  n: number;
}

export interface DetectionMetrics {
  precision: Rate | null;
  recall: Rate | null;
  falsePositiveRate: Rate | null;
}

const Z_95 = 1.959964;

export function wilsonRate(hits: number, n: number): Rate | null {
  if (n <= 0) {
    return null;
  }

  const p = hits / n;
  const z2 = Z_95 * Z_95;
  const denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const margin =
    (Z_95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;

  return {
    value: p,
    low: Math.max(0, centre - margin),
    high: Math.min(1, centre + margin),
    n,
  };
}

export function detectionMetrics(counts: ConfusionCounts): DetectionMetrics {
  const { truePositives, falsePositives, falseNegatives, trueNegatives } =
    counts;

  return {
    precision: wilsonRate(truePositives, truePositives + falsePositives),
    recall: wilsonRate(truePositives, truePositives + falseNegatives),
    falsePositiveRate: wilsonRate(
      falsePositives,
      falsePositives + trueNegatives,
    ),
  };
}
