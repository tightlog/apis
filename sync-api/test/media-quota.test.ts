import { describe, expect, test } from 'vitest';

import {
  isMediaQuotaCode,
  mediaQuotaExceeded,
  SYNC_MEDIA_QUOTA_BYTES,
  SYNC_MEDIA_QUOTA_OBJECTS,
} from '../src/http';

describe('mediaQuotaExceeded', () => {
  test('a file that fits under both caps passes', () => {
    expect(
      mediaQuotaExceeded(
        { bytes: SYNC_MEDIA_QUOTA_BYTES - 10, objects: 0 },
        10,
      ),
    ).toEqual(null);
  });

  test('a file that takes the total over the byte cap fails on bytes', () => {
    expect(
      mediaQuotaExceeded(
        { bytes: SYNC_MEDIA_QUOTA_BYTES - 10, objects: 0 },
        11,
      ),
    ).toEqual('media_quota_bytes');
  });

  test('a full file count fails on objects before bytes', () => {
    expect(
      mediaQuotaExceeded(
        { bytes: SYNC_MEDIA_QUOTA_BYTES, objects: SYNC_MEDIA_QUOTA_OBJECTS },
        1,
      ),
    ).toEqual('media_quota_objects');
  });
});

describe('isMediaQuotaCode', () => {
  test('accepts only the two quota codes', () => {
    expect(
      ['media_quota_bytes', 'media_quota_objects', 'upload_failed', ''].map(
        isMediaQuotaCode,
      ),
    ).toEqual([true, true, false, false]);
  });
});
