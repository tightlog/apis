import type { WorkerErrorBody } from '../http/error-code';
import { json } from './json';

function ipv6Prefix64(ip: string): string {
  const [head = '', tail] = ip.toLowerCase().split('::');
  const headGroups = head === '' ? [] : head.split(':');
  const tailGroups = tail === undefined || tail === '' ? [] : tail.split(':');
  const groups =
    tail === undefined
      ? headGroups
      : [
          ...headGroups,
          ...Array.from<string>({
            length: Math.max(0, 8 - headGroups.length - tailGroups.length),
          }).fill('0'),
          ...tailGroups,
        ];
  const prefix = groups
    .slice(0, 4)
    .map(group => Number.parseInt(group, 16).toString(16));
  return `${prefix.join(':')}::/64`;
}

export function clientKey(request: Pick<Request, 'headers'>): string {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (!ip.includes(':')) {
    return ip;
  }

  if (ip.includes('.')) {
    return ip.slice(ip.lastIndexOf(':') + 1);
  }

  return ipv6Prefix64(ip);
}

export async function rateLimited(
  limiter: RateLimit | undefined,
  key: string,
): Promise<Response | null> {
  if (!limiter) {
    return null;
  }

  const { success } = await limiter.limit({ key });
  return success ? null : json<WorkerErrorBody>({ error: 'rate_limited' }, 429);
}
