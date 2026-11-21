import { afterEach, describe, expect, test, vi } from 'vitest';
import { cachedTool } from '../src/utils/toolCache';

function memoryCache() {
  const entries = new Map<string, Response>();
  return {
    entries,
    match: (request: Request) =>
      Promise.resolve(entries.get(request.url)?.clone()),
    put: (request: Request, response: Response) => {
      entries.set(request.url, response);
      return Promise.resolve();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cachedTool', () => {
  test('serves a second call on the same grid square from the cache', async () => {
    const cache = memoryCache();
    vi.stubGlobal('caches', { default: cache });
    const seen: unknown[] = [];
    const run = (input: { latitude: number; longitude: number }) => {
      seen.push(input);
      return Promise.resolve({ level: 1.2 });
    };

    const results = [
      await cachedTool(
        'get_river_level',
        { latitude: 51.50712, longitude: -0.12756 },
        run,
      ),
      await cachedTool(
        'get_river_level',
        { latitude: 51.5089, longitude: -0.1314 },
        run,
      ),
    ];

    expect({ results, seen, keys: [...cache.entries.keys()] }).toEqual({
      results: [{ level: 1.2 }, { level: 1.2 }],
      seen: [{ latitude: 51.51, longitude: -0.13 }],
      keys: [
        'https://mcp-tool-cache.internal/get_river_level?latitude=51.51&longitude=-0.13',
      ],
    });
  });

  test('keys on the tool name and every input', async () => {
    const cache = memoryCache();
    vi.stubGlobal('caches', { default: cache });
    const run = () => Promise.resolve({ ok: true });

    await cachedTool('get_tides', { latitude: 50, longitude: 1 }, run);
    await cachedTool(
      'get_marine_conditions',
      { latitude: 50, longitude: 1 },
      run,
    );
    await cachedTool(
      'get_hourly_forecast',
      { latitude: 50, longitude: 1, dayOffset: 0 },
      run,
    );
    await cachedTool(
      'get_hourly_forecast',
      { latitude: 50, longitude: 1, dayOffset: 1 },
      run,
    );

    expect(cache.entries.size).toBe(4);
  });

  test('does not cache a result that is not available', async () => {
    const cache = memoryCache();
    vi.stubGlobal('caches', { default: cache });
    const results = [{ available: false }, { available: true, level: 1.2 }];
    const run = () => Promise.resolve(results.shift());

    const first = await cachedTool(
      'get_river_level',
      { latitude: 50, longitude: 1 },
      run,
    );
    const second = await cachedTool(
      'get_river_level',
      { latitude: 50, longitude: 1 },
      run,
    );

    expect({ first, second, cached: cache.entries.size }).toEqual({
      first: { available: false },
      second: { available: true, level: 1.2 },
      cached: 1,
    });
  });
});
