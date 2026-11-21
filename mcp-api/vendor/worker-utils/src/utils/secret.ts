import { sha256 } from './sha256';

export async function secretMatches(
  presented: string | null | undefined,
  expected: string | undefined,
): Promise<boolean> {
  if (!presented || !expected) {
    return false;
  }

  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    sha256(encoder.encode(presented)),
    sha256(encoder.encode(expected)),
  ]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }

  return diff === 0;
}
