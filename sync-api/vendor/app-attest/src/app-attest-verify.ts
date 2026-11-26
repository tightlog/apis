import 'reflect-metadata';
import { AsnParser } from '@peculiar/asn1-schema';
import { SubjectPublicKeyInfo } from '@peculiar/asn1-x509';
import { decode as cborDecode } from 'cbor-x';
import { z } from 'zod';
import { AttestError } from './attest-error';
import type { Bytes } from './types/bytes';
import { aaguidAllowed } from './util/aaguidAllowed';
import { base64ToBytes } from './util/base64ToBytes';
import { bytesToBase64 } from './util/bytesToBase64';
import { derSignatureToRaw } from './util/derSignatureToRaw';
import { nonceFromLeaf } from './util/nonceFromLeaf';
import { parseAuthenticatorData } from './util/parseAuthenticatorData';
import { sha256 } from './util/sha256';
import { timingSafeEqualBytes } from './util/timingSafeEqualBytes';
import { verifyCertChain } from './util/verifyCertChain';

export { AttestError } from './attest-error';

const encoder = new TextEncoder();

export type AppAttestEnv = 'production' | 'development';

export interface AttestationResult {
  publicKeySpkiB64: string;
  bundleId: string;
}

export interface AssertionResult {
  newCounter: number;
}

const bytes = z.instanceof(Uint8Array);

const attestationCbor = z.object({
  fmt: z.string(),
  attStmt: z.object({ x5c: z.array(bytes) }),
  authData: bytes,
});

const assertionCbor = z.object({
  signature: bytes,
  authenticatorData: bytes,
});

function appIdHash(teamId: string, bundleId: string): Promise<Bytes> {
  return sha256(encoder.encode(`${teamId}.${bundleId}`));
}

export async function verifyAttestation(
  keyId: string,
  attestationB64: string,
  challenge: string,
  teamId: string,
  bundleIds: string[],
  attestEnv: AppAttestEnv,
): Promise<AttestationResult> {
  let decoded: unknown;

  try {
    decoded = cborDecode(base64ToBytes(attestationB64));
  } catch {
    throw new AttestError('attestation is not valid CBOR');
  }

  const parsed = attestationCbor.safeParse(decoded);

  if (!parsed.success) {
    throw new AttestError('malformed attestation structure');
  }

  const attestation = parsed.data;

  if (attestation.fmt !== 'apple-appattest') {
    throw new AttestError(`unexpected attestation fmt: ${attestation.fmt}`);
  }

  const [leaf, clientDataHash] = await Promise.all([
    verifyCertChain(attestation.attStmt.x5c),
    sha256(encoder.encode(challenge)),
  ]);

  const [expectedNonce, appIdHashes] = await Promise.all([
    sha256(attestation.authData, clientDataHash),
    Promise.all(bundleIds.map(bundleId => appIdHash(teamId, bundleId))),
  ]);

  if (!timingSafeEqualBytes(expectedNonce, nonceFromLeaf(leaf))) {
    throw new AttestError(
      'nonce mismatch: challenge not bound to this attestation',
    );
  }

  const spkiDer = new Uint8Array(leaf.publicKey.rawData);
  const ecPoint = AsnParser.parse(
    spkiDer,
    SubjectPublicKeyInfo,
  ).subjectPublicKey;
  const computedKeyId = await sha256(new Uint8Array(ecPoint));
  const providedKeyId = base64ToBytes(keyId);
  if (!timingSafeEqualBytes(computedKeyId, providedKeyId)) {
    throw new AttestError('keyId does not match the attested public key');
  }

  const auth = parseAuthenticatorData(attestation.authData, true);

  if (auth.counter !== 0) {
    throw new AttestError('attestation counter must be 0');
  }

  if (!aaguidAllowed(auth.aaguid, attestEnv)) {
    throw new AttestError(`AAGUID is not for the ${attestEnv} environment`);
  }

  if (
    !auth.credentialId ||
    !timingSafeEqualBytes(auth.credentialId, providedKeyId)
  ) {
    throw new AttestError('credential id does not match keyId');
  }

  const bundleId = bundleIds.find((_, i) => {
    const candidateAppIdHash = appIdHashes[i];
    return (
      candidateAppIdHash !== undefined &&
      timingSafeEqualBytes(candidateAppIdHash, auth.rpIdHash)
    );
  });

  if (!bundleId) {
    throw new AttestError('rpIdHash matches none of the allowed app ids');
  }

  return { publicKeySpkiB64: bytesToBase64(spkiDer), bundleId };
}

export async function verifyAssertion(
  assertionB64: string,
  challenge: string,
  publicKeySpkiB64: string,
  storedCounter: number,
  teamId: string,
  bundleId: string,
): Promise<AssertionResult> {
  let decoded: unknown;

  try {
    decoded = cborDecode(base64ToBytes(assertionB64));
  } catch {
    throw new AttestError('assertion is not valid CBOR');
  }

  const parsed = assertionCbor.safeParse(decoded);

  if (!parsed.success) {
    throw new AttestError('assertion missing signature or authenticatorData');
  }

  const assertion = parsed.data;

  const [clientDataHash, key, rpId] = await Promise.all([
    sha256(encoder.encode(challenge)),
    crypto.subtle.importKey(
      'spki',
      base64ToBytes(publicKeySpkiB64),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    ),
    appIdHash(teamId, bundleId),
  ]);

  const nonce = await sha256(assertion.authenticatorData, clientDataHash);
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    derSignatureToRaw(assertion.signature),
    nonce,
  );

  if (!ok) {
    throw new AttestError('assertion signature does not verify');
  }

  const auth = parseAuthenticatorData(assertion.authenticatorData, false);

  if (!timingSafeEqualBytes(rpId, auth.rpIdHash)) {
    throw new AttestError(
      'assertion rpIdHash does not match the registered app id',
    );
  }

  if (auth.counter <= storedCounter) {
    throw new AttestError(
      'assertion counter did not advance (possible replay)',
    );
  }

  return { newCounter: auth.counter };
}
