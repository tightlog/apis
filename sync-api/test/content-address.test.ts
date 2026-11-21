import { describe, expect, test } from 'vitest';
import type { ContentAddressedBasename } from '../src/http';
import { parseContentAddressedBasename } from '../src/http';

const HASH = 'a'.repeat(64);

describe('parseContentAddressedBasename', () => {
  test('splits a content-addressed name into its checksum and type', () => {
    expect(
      parseContentAddressedBasename(`${HASH}.jpg`),
    ).toEqual<ContentAddressedBasename>({
      sha256: HASH,
      contentType: 'image/jpeg',
    });

    expect(
      parseContentAddressedBasename(`${HASH}.mp4`),
    ).toEqual<ContentAddressedBasename>({
      sha256: HASH,
      contentType: 'video/mp4',
    });
  });

  test('rejects anything that is not a full SHA-256 stem', () => {
    expect(parseContentAddressedBasename('photo.jpg')).toBeNull();

    expect(parseContentAddressedBasename(`${'a'.repeat(63)}.jpg`)).toBeNull();

    expect(parseContentAddressedBasename(`${'a'.repeat(65)}.jpg`)).toBeNull();

    expect(
      parseContentAddressedBasename(`${HASH.toUpperCase()}.jpg`),
    ).toBeNull();

    expect(parseContentAddressedBasename(HASH)).toBeNull();
  });

  test('rejects extensions the Worker would not know how to serve', () => {
    expect(parseContentAddressedBasename(`${HASH}.exe`)).toBeNull();

    expect(parseContentAddressedBasename(`${HASH}.svg`)).toBeNull();

    expect(parseContentAddressedBasename(`${HASH}.heif`)).toBeNull();
  });

  test('rejects names that could escape the user prefix', () => {
    expect(parseContentAddressedBasename(`../${HASH}.jpg`)).toBeNull();

    expect(parseContentAddressedBasename(`other-user/${HASH}.jpg`)).toBeNull();

    expect(parseContentAddressedBasename(`${HASH}/../../etc.jpg`)).toBeNull();
  });
});
