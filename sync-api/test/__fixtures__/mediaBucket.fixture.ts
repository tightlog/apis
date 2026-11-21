export interface StubBucket {
  bucket: R2Bucket;
  objects: Map<string, Uint8Array>;
  deleted: string[];
}

export function stubBucket(
  options: { failPut?: boolean; failDelete?: boolean } = {},
): StubBucket {
  const objects = new Map<string, Uint8Array>();
  const deleted: string[] = [];

  const bucket = {
    async put(key: string, body: ReadableStream | null) {
      if (options.failPut) {
        throw new Error('put: Digest mismatch (10037)');
      }

      const bytes = new Uint8Array(await new Response(body).arrayBuffer());
      objects.set(key, bytes);
      return { key, size: bytes.byteLength };
    },
    delete(keys: string | string[]) {
      if (options.failDelete) {
        return Promise.reject(new Error('r2 unavailable'));
      }

      for (const key of Array.isArray(keys) ? keys : [keys]) {
        deleted.push(key);
        objects.delete(key);
      }

      return Promise.resolve();
    },
  };

  // SAFETY: the handlers under test call only put and delete.
  return { bucket: bucket as unknown as R2Bucket, objects, deleted };
}
