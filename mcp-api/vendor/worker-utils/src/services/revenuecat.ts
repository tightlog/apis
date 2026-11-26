import { z } from 'zod';
import { commaList } from '../utils/comma-list';

const SUBSCRIBERS_URL = 'https://api.revenuecat.com/v1/subscribers/';

export interface RevenueCatEnv {
  REVENUECAT_SECRET_KEY?: string;
  REVENUECAT_ENTITLEMENT_IDS?: string;
  REVENUECAT_ALLOW_TEST_STORE?: string;
}

interface RevenueCatSettings {
  secretKey: string;
  entitlementIds: string[];
  allowTestStore: boolean;
}

export function configuredEntitlementIds(env: RevenueCatEnv): string[] {
  return commaList(env.REVENUECAT_ENTITLEMENT_IDS);
}

export function revenueCatSettings(
  env: RevenueCatEnv,
): RevenueCatSettings | null {
  const secretKey = env.REVENUECAT_SECRET_KEY ?? '';
  const entitlementIds = configuredEntitlementIds(env);
  return secretKey !== '' && entitlementIds.length > 0
    ? {
        secretKey,
        entitlementIds,
        allowTestStore: env.REVENUECAT_ALLOW_TEST_STORE === 'true',
      }
    : null;
}

const expiry = z.string().nullish();

const purchaseSource = {
  store: z.string().nullish(),
};

const subscriberSchema = z.object({
  subscriber: z.object({
    entitlements: z
      .record(
        z.string(),
        z
          .object({
            expires_date: expiry,
            product_identifier: z.string().nullish(),
          })
          .nullable(),
      )
      .catch({}),
    subscriptions: z
      .record(
        z.string(),
        z.object({
          expires_date: expiry,
          store_transaction_id: z.union([z.string(), z.number()]).nullish(),
          ...purchaseSource,
        }),
      )
      .catch({}),
    non_subscriptions: z
      .record(z.string(), z.array(z.object(purchaseSource)))
      .catch({}),
  }),
});

export type Subscriber = z.infer<typeof subscriberSchema>['subscriber'];

export type SubscriberLookup =
  | { status: 'ok'; subscriber: Subscriber }
  | { status: 'not_found' }
  | { status: 'unavailable' };

export async function fetchSubscriber(
  secretKey: string,
  appUserId: string,
  timeoutMs: number,
): Promise<SubscriberLookup> {
  let response: Response;
  try {
    response = await fetch(
      `${SUBSCRIBERS_URL}${encodeURIComponent(appUserId)}`,
      {
        headers: {
          authorization: `Bearer ${secretKey}`,
          accept: 'application/json',
        },
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
  } catch {
    return { status: 'unavailable' };
  }

  if (response.status === 404) {
    return { status: 'not_found' };
  }

  if (!response.ok) {
    return { status: 'unavailable' };
  }

  const body = subscriberSchema.safeParse(
    await response.json<unknown>().catch(() => null),
  );
  return body.success
    ? { status: 'ok', subscriber: body.data.subscriber }
    : { status: 'unavailable' };
}

function isUnexpired(
  expires: string | null | undefined,
  nowMs: number,
): boolean {
  if (expires == null) {
    return true;
  }

  const expiresMs = Date.parse(expires);
  return Number.isFinite(expiresMs) && expiresMs > nowMs;
}

interface PurchaseSource {
  store?: string | null;
}

// The RevenueCat Test Store key shipped in old app builds, and anyone can make a
// free Test Store purchase with it. Sandbox purchases still count: TestFlight,
// App Review and Play testers buy in sandbox against the production Workers.
export function isTestStore(purchase: PurchaseSource): boolean {
  return (purchase.store ?? '').toLowerCase() === 'test_store';
}

// A Play subscription can appear as `product` in one place and
// `product:base-plan` in the other, so compare the part before the colon too.
function purchasesFor(
  subscriber: Subscriber,
  productId: string,
): PurchaseSource[] {
  const base = productId.split(':')[0];
  const subscriptions = Object.entries(subscriber.subscriptions)
    .filter(([key]) => key === productId || key.split(':')[0] === base)
    .map(([, subscription]) => subscription);
  return [...subscriptions, ...(subscriber.non_subscriptions[productId] ?? [])];
}

function grantFromTestStore(
  subscriber: Subscriber,
  productId: string | null | undefined,
): boolean {
  if (productId == null) {
    return false;
  }

  const purchases = purchasesFor(subscriber, productId);
  return purchases.length > 0 && purchases.every(isTestStore);
}

export function hasActiveEntitlement(
  subscriber: Subscriber,
  settings: Pick<RevenueCatSettings, 'entitlementIds' | 'allowTestStore'>,
  nowMs: number,
): boolean {
  return settings.entitlementIds.some(id => {
    const grant = subscriber.entitlements[id];
    return (
      grant != null &&
      isUnexpired(grant.expires_date, nowMs) &&
      (settings.allowTestStore ||
        !grantFromTestStore(subscriber, grant.product_identifier))
    );
  });
}

export function ownsActiveSubscription(
  subscriber: Subscriber,
  storeTransactionId: string,
  settings: Pick<RevenueCatSettings, 'allowTestStore'>,
  nowMs: number,
): boolean {
  return Object.values(subscriber.subscriptions).some(
    subscription =>
      subscription.store_transaction_id != null &&
      String(subscription.store_transaction_id) === storeTransactionId &&
      isUnexpired(subscription.expires_date, nowMs) &&
      (settings.allowTestStore || !isTestStore(subscription)),
  );
}
