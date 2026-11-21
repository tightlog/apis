const MEDIA_CONTENT_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
} as const;

export type MediaExtension = keyof typeof MEDIA_CONTENT_TYPES;

const EXTENSIONS: ReadonlySet<string> = new Set(
  Object.keys(MEDIA_CONTENT_TYPES),
);

export function isMediaExtension(ext: string): ext is MediaExtension {
  return EXTENSIONS.has(ext);
}

export function mediaContentType(basename: string): string {
  const ext = basename.split('.').pop()?.toLowerCase() ?? '';
  return isMediaExtension(ext)
    ? MEDIA_CONTENT_TYPES[ext]
    : 'application/octet-stream';
}

export const IMAGE_CONTENT_TYPES: ReadonlySet<string> = new Set(
  Object.values(MEDIA_CONTENT_TYPES).filter(type => type.startsWith('image/')),
);

export const STORED_MEDIA_BASENAME =
  '[A-Za-z0-9][A-Za-z0-9-]{0,79}\\.[a-z0-9]{2,4}';

const STORED_BASENAME_PATTERN = new RegExp(`^${STORED_MEDIA_BASENAME}$`);

/**
 * The name of a file in the app's catch-media folder. Older builds wrote
 * `<ms>-<random>.<ext>` names, so this is wider than a content address.
 */
export function isStoredMediaBasename(value: string): boolean {
  return STORED_BASENAME_PATTERN.test(value);
}
