const ESCROW_SECRET_BYTES = 32;

const BOUND_VERSION = 'v2';

export interface EscrowBinding {
  userId: string;
  keyHash: string;
}

export class EscrowSecretError extends Error {
  constructor() {
    super('KEY_ESCROW_SECRET is not a base64-encoded 32-byte key');
  }
}

export class EscrowMismatchError extends Error {
  constructor() {
    super('the escrowed key does not hash to this row key_hash');
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return Buffer.from(digest).toString('hex');
}

export function isEscrowSecret(secret: string): boolean {
  return base64ToBytes(secret).byteLength === ESCROW_SECRET_BYTES;
}

function importSecret(secret: string): Promise<CryptoKey> {
  const raw = base64ToBytes(secret);
  if (raw.byteLength !== ESCROW_SECRET_BYTES) {
    throw new EscrowSecretError();
  }

  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

function additionalData(binding: EscrowBinding): Uint8Array {
  return new TextEncoder().encode(`${binding.userId}\n${binding.keyHash}`);
}

export async function encryptKeyEscrow(
  secret: string,
  syncKey: string,
  binding: EscrowBinding,
): Promise<string> {
  const cryptoKey = await importSecret(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(binding) },
      cryptoKey,
      new TextEncoder().encode(syncKey),
    ),
  );
  return `${BOUND_VERSION}.${bytesToBase64(iv)}.${bytesToBase64(ciphertext)}`;
}

function gcmParams(escrowed: string, binding: EscrowBinding) {
  const parts = escrowed.split('.');
  const [first, second, third] = parts;

  if (parts.length === 3 && first === BOUND_VERSION && second && third) {
    return {
      params: {
        name: 'AES-GCM',
        iv: base64ToBytes(second),
        additionalData: additionalData(binding),
      },
      ciphertext: base64ToBytes(third),
    };
  }

  if (parts.length === 2 && first && second) {
    return {
      params: { name: 'AES-GCM', iv: base64ToBytes(first) },
      ciphertext: base64ToBytes(second),
    };
  }

  throw new Error('malformed key escrow value');
}

export async function decryptKeyEscrow(
  secret: string,
  escrowed: string,
  binding: EscrowBinding,
): Promise<string> {
  const { params, ciphertext } = gcmParams(escrowed, binding);
  const cryptoKey = await importSecret(secret);
  const plaintext = await crypto.subtle.decrypt(params, cryptoKey, ciphertext);
  const syncKey = new TextDecoder().decode(plaintext);

  if ((await sha256Hex(syncKey)) !== binding.keyHash) {
    throw new EscrowMismatchError();
  }

  return syncKey;
}
