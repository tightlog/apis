import { z } from 'zod';

const TTL_SECONDS = 10 * 60;

const unavailable = z.object({ available: z.literal(false) });

export type ToolInput = Record<string, number>;

function roundedInput<Input extends ToolInput>(input: Input): Input {
  const entries = Object.entries(input).map(([key, value]) =>
    key === 'latitude' || key === 'longitude'
      ? [key, Number(value.toFixed(2))]
      : [key, value],
  );
  // SAFETY: the copy keeps every key of the input and only rounds numbers.
  return Object.fromEntries(entries) as Input;
}

function cacheKey(name: string, input: ToolInput): Request {
  const params = new URLSearchParams(
    Object.keys(input)
      .sort()
      .map(key => [key, String(input[key])]),
  );
  return new Request(
    `https://mcp-tool-cache.internal/${name}?${params.toString()}`,
  );
}

export async function cachedTool<Input extends ToolInput, Output>(
  name: string,
  input: Input,
  run: (input: Input) => Output | Promise<Output>,
): Promise<Output> {
  const rounded = roundedInput(input);
  const cache = caches.default;
  const key = cacheKey(name, rounded);
  const hit = await cache.match(key);
  if (hit) {
    return hit.json<Output>();
  }

  const result = await run(rounded);
  if (unavailable.safeParse(result).success) {
    return result;
  }

  await cache.put(
    key,
    Response.json(result, {
      headers: { 'cache-control': `max-age=${TTL_SECONDS}` },
    }),
  );
  return result;
}
