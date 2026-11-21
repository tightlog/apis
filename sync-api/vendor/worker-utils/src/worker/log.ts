// Bound at module load, before Sentry's console integration patches console,
// so these lines stay in Workers Logs and are not forwarded to Sentry Logs.
export const workersLog = {
  info: console.log,
  warn: console.warn,
  error: console.error,
} satisfies Record<'info' | 'warn' | 'error', (...args: unknown[]) => void>;

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function logError(message: string, cause?: unknown): void {
  const entry =
    cause === undefined ? { message } : { message, error: errorText(cause) };
  console.error(JSON.stringify(entry));
}
