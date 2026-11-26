import { json } from '@tightlog/worker-utils/request/json';
import {
  fetchSubscriber,
  hasActiveEntitlement,
  ownsActiveSubscription,
  revenueCatSettings,
} from '@tightlog/worker-utils/services/revenuecat';
import { isRevenueCatAppUserId, isStoreTransactionId } from '../revenuecat';
import type { Env } from '../types';
import type { SyncErrorBody } from '../http';

const LOOKUP_TIMEOUT_MS = 5000;

export const revenueCatService = {
  verifyPurchaseIdentity: async (
    env: Env,
    appUserId: string,
    storeTransactionId: string,
    nowMs: number,
  ): Promise<true | Response> => {
    if (!isRevenueCatAppUserId(appUserId)) {
      return json<SyncErrorBody>({ error: 'invalid_app_user_id' }, 400);
    }

    if (!storeTransactionId || !isStoreTransactionId(storeTransactionId)) {
      return json<SyncErrorBody>({ error: 'transaction_required' }, 400);
    }

    const settings = revenueCatSettings(env);
    if (!settings) {
      return json<SyncErrorBody>({ error: 'not_configured' }, 501);
    }

    const lookup = await fetchSubscriber(
      settings.secretKey,
      appUserId,
      LOOKUP_TIMEOUT_MS,
    );
    if (lookup.status === 'not_found') {
      return json<SyncErrorBody>({ error: 'unknown_customer' }, 404);
    }

    if (lookup.status === 'unavailable') {
      return json<SyncErrorBody>({ error: 'revenuecat_unreachable' }, 502);
    }

    if (!hasActiveEntitlement(lookup.subscriber, settings, nowMs)) {
      return json<SyncErrorBody>({ error: 'no_active_entitlement' }, 403);
    }

    if (
      !ownsActiveSubscription(
        lookup.subscriber,
        storeTransactionId,
        settings,
        nowMs,
      )
    ) {
      return json<SyncErrorBody>({ error: 'purchase_not_owned' }, 403);
    }

    return true;
  },
};
