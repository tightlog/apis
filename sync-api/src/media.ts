export const MAX_IP_DAILY_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024;
export const UNREFERENCED_MEDIA_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function mediaKey(userId: string, basename: string): string {
  return `${userId}/${basename}`;
}

export function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}
