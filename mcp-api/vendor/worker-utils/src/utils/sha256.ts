import { bytesToHex } from '../http/hex';

export async function sha256(
  bytes: BufferSource,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

export async function sha256Hex(bytes: BufferSource): Promise<string> {
  return bytesToHex(await sha256(bytes));
}

export function sha256HexOfText(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text));
}
