import { describe, expect, test } from 'vitest';
import { SYNC_MEDIA_STATUS_MAX_NAMES } from '../src/http';
import { mediaStatusBodyLimit } from '../src/validation/media';

describe('status batch sizing', () => {
  test('a full batch of the longest basenames fits its body cap', () => {
    const longest = `${'a'.repeat(64)}.jpeg`;
    const body = JSON.stringify({
      names: Array.from({ length: SYNC_MEDIA_STATUS_MAX_NAMES }, () => longest),
    });
    const bytes = new TextEncoder().encode(body).byteLength;
    expect(bytes).toBeLessThanOrEqual(mediaStatusBodyLimit);
  });
});
