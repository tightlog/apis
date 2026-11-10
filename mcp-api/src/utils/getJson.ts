export async function getJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status >= 400 && response.status < 500) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${new URL(url).host} returned ${response.status}`);
  }

  return response.json<T>();
}
