import type { Bytes } from '../types/bytes';
import { timingSafeEqualBytes } from './timingSafeEqualBytes';

const encoder = new TextEncoder();

export const AAGUID_PROD = new Uint8Array([
  0x61, 0x70, 0x70, 0x61, 0x74, 0x74, 0x65, 0x73, 0x74, 0, 0, 0, 0, 0, 0, 0,
]);

export const AAGUID_DEV = encoder.encode('appattestdevelop');

/**
 * Production only accepts the production AAGUID. Development accepts either:
 * local and simulator builds use the development AAGUID, while a TestFlight
 * internal build is signed for distribution and Apple always mints the
 * production AAGUID.
 */
export function aaguidAllowed(
  aaguid: Bytes,
  attestEnv: 'production' | 'development',
): boolean {
  if (attestEnv === 'production') {
    return timingSafeEqualBytes(aaguid, AAGUID_PROD);
  }

  return (
    timingSafeEqualBytes(aaguid, AAGUID_DEV) ||
    timingSafeEqualBytes(aaguid, AAGUID_PROD)
  );
}
