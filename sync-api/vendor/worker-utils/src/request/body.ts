import type { BodyErrorCode, WorkerErrorBody } from '../http/error-code';
import type { JsonValue } from '../http/json';
import { json } from './json';
import { checkContentLength } from './size';

interface ReadBodyOptions {
  maxBytes: number;
  requireContentLength?: boolean;
}

type BodyResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: BodyErrorCode };

const BODY_ERROR_STATUS = {
  bad_json: 400,
  body_unreadable: 400,
  content_length_required: 411,
  payload_too_large: 413,
} satisfies Record<BodyErrorCode, number>;

export function bodyErrorResponse(error: BodyErrorCode): Response {
  return json<WorkerErrorBody<BodyErrorCode>>(
    { error },
    BODY_ERROR_STATUS[error],
  );
}

async function readCapped(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<BodyResult<Uint8Array<ArrayBuffer>>> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false, error: 'payload_too_large' };
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, value: bytes };
}

export async function readBody(
  request: Request,
  { maxBytes, requireContentLength = false }: ReadBodyOptions,
): Promise<BodyResult<Uint8Array<ArrayBuffer>>> {
  const length = checkContentLength(request, maxBytes);
  if (!length.ok) {
    if (length.reason === 'too_large') {
      return { ok: false, error: 'payload_too_large' };
    }

    if (requireContentLength) {
      return { ok: false, error: 'content_length_required' };
    }
  }

  if (!request.body) {
    return { ok: true, value: new Uint8Array(0) };
  }

  try {
    // SAFETY: a Request body stream yields Uint8Array chunks.
    const stream = request.body as ReadableStream<Uint8Array>;
    return await readCapped(stream, maxBytes);
  } catch {
    return { ok: false, error: 'body_unreadable' };
  }
}

export function parseJson(bytes: Uint8Array): BodyResult<JsonValue> {
  try {
    // SAFETY: JSON.parse returns a JSON value; each caller checks its shape.
    const value = JSON.parse(new TextDecoder().decode(bytes)) as JsonValue;
    return { ok: true, value };
  } catch {
    return { ok: false, error: 'bad_json' };
  }
}

export async function readJson(
  request: Request,
  options: ReadBodyOptions,
): Promise<BodyResult<JsonValue>> {
  const body = await readBody(request, options);
  return body.ok ? parseJson(body.value) : body;
}
