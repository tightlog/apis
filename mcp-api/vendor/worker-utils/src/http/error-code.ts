import type { AttestErrorCode } from './attest';

export type BodyErrorCode =
  | 'bad_json'
  | 'body_unreadable'
  | 'content_length_required'
  | 'payload_too_large';

export type RequestErrorCode =
  | BodyErrorCode
  | 'auth_unavailable'
  | 'internal_error'
  | 'invalid_path'
  | 'invalid_request'
  | 'not_configured'
  | 'not_found'
  | 'rate_limited'
  | 'unauthorized';

export type WorkerErrorCode = AttestErrorCode | RequestErrorCode;

export interface WorkerErrorBody<Code extends string = WorkerErrorCode> {
  error: Code;
}
