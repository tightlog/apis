export const HANDLE_LIMITS = {
  min: 3,
  max: 30,
} as const;

const HANDLE_PATTERN = new RegExp(
  `^[a-z0-9](?:[a-z0-9_]{${HANDLE_LIMITS.min - 2},${HANDLE_LIMITS.max - 2}}[a-z0-9])$`,
);

export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidHandle(raw: string): boolean {
  return HANDLE_PATTERN.test(normalizeHandle(raw));
}

export function suggestHandle(name: string): string {
  const handle = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, HANDLE_LIMITS.max);
  return isValidHandle(handle) ? handle : '';
}
