import {
  PLAY_INSTALL_ID_HEADER,
  isPlayInstallId,
  playRequestHashInput,
} from '../http/attest';
import { legacyPlaySubject } from './play-legacy';
import type { PlayLegacyEnv } from './play-legacy';
import { sha256HexOfText } from '../utils/sha256';

export function playQuotaSubject(
  env: PlayLegacyEnv,
  headers: Headers,
): string | null {
  const installId = headers.get(PLAY_INSTALL_ID_HEADER);
  if (installId !== null) {
    return isPlayInstallId(installId) ? installId : null;
  }

  return legacyPlaySubject(env, headers);
}

export async function playTokenRequestHash(
  headers: Headers,
  requestHash: string,
): Promise<string> {
  const installId = headers.get(PLAY_INSTALL_ID_HEADER);
  return installId
    ? sha256HexOfText(playRequestHashInput(installId, requestHash))
    : requestHash;
}
