export type PlayLegacyEnv = Record<never, never>;

export function legacyPlaySubject(
  _env: PlayLegacyEnv,
  _headers: Headers,
): string | null {
  return null;
}
