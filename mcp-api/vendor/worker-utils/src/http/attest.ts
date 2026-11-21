export const ATTEST_KEY_ID_HEADER = 'x-attest-key-id';

export const ATTEST_ASSERTION_HEADER = 'x-attest-assertion';

export const PLAY_INTEGRITY_HEADER = 'x-play-integrity';

export const PLAY_INSTALL_ID_HEADER = 'x-play-install-id';

const PLAY_INSTALL_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isPlayInstallId(value: string): boolean {
  return PLAY_INSTALL_ID_PATTERN.test(value);
}

export function playRequestHashInput(
  installId: string,
  challengeHash: string,
): string {
  return `${installId}\n${challengeHash}`;
}

export const ATTEST_HEADERS = [
  ATTEST_KEY_ID_HEADER,
  ATTEST_ASSERTION_HEADER,
  PLAY_INTEGRITY_HEADER,
  PLAY_INSTALL_ID_HEADER,
];

export interface AttestChallengeResponse {
  challenge: string;
}

export interface AttestRegistration {
  keyId: string;
  attestation: string;
  challenge: string;
}

export type AttestErrorCode =
  | 'attestation'
  | 'attestation_unavailable'
  | 'daily_limit'
  | 'invalid_registration';
