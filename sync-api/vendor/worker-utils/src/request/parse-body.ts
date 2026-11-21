import type { WorkerErrorBody, WorkerErrorCode } from '../http/error-code';
import type { z } from 'zod';
import { json } from './json';
import { bodyErrorResponse, readJson } from './body';

export interface ParseJsonBodyOptions<Code extends string> {
  error?: Code;
  status?: number;
  requireContentLength?: boolean;
}

export async function parseJsonBody<T, Code extends string = WorkerErrorCode>(
  request: Request,
  maxBytes: number,
  schema: z.ZodType<T>,
  {
    error,
    status = 400,
    requireContentLength,
  }: ParseJsonBodyOptions<Code> = {},
): Promise<T | Response> {
  const body = await readJson(request, { maxBytes, requireContentLength });
  if (!body.ok) {
    return bodyErrorResponse(body.error);
  }

  const parsed = schema.safeParse(body.value);
  return parsed.success
    ? parsed.data
    : json<WorkerErrorBody<Code | 'invalid_request'>>(
        { error: error ?? 'invalid_request' },
        status,
      );
}
