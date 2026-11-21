export const RETRY: unique symbol = Symbol('retry');

export async function retry<T>(
  attempts: number,
  run: (attempt: number) => Promise<T | typeof RETRY>,
  baseDelayMs: number,
): Promise<T | typeof RETRY> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise<void>(resolve => {
        setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1));
      });
    }

    const result = await run(attempt);
    if (result !== RETRY) {
      return result;
    }
  }

  return RETRY;
}
