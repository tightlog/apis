import { bestEffort } from '@tightlog/worker-utils/worker/best-effort';
import { mediaKey, UNREFERENCED_MEDIA_TTL_MS, utcDay } from '../media';
import type { SyncRepo } from '../repo';

const SWEEP_BATCH = 500;

const MAX_SWEEP_BATCHES = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function sweepUnreferencedMedia(
  repo: SyncRepo,
  bucket: R2Bucket | undefined,
  nowMs: number,
): Promise<number> {
  await repo.pruneUploadBudget(utcDay(nowMs - DAY_MS));

  if (!bucket) {
    return 0;
  }

  const createdBefore = new Date(
    nowMs - UNREFERENCED_MEDIA_TTL_MS,
  ).toISOString();
  let swept = 0;

  for (let batch = 0; batch < MAX_SWEEP_BATCHES; batch++) {
    const deleted = await repo.deleteUnreferencedMedia(
      createdBefore,
      SWEEP_BATCH,
    );

    if (deleted.length === 0) {
      break;
    }

    const removed = await bestEffort('media-sweep', async () => {
      await bucket.delete(
        deleted.map(row => mediaKey(row.user_id, row.basename)),
      );
      return true;
    });

    if (!removed) {
      await repo.restoreMediaObjects(deleted);
      break;
    }

    swept += deleted.length;
    if (deleted.length < SWEEP_BATCH) {
      break;
    }
  }

  return swept;
}
