import { createClerkClient } from '@clerk/backend';
import type { Env } from '../types';
import { bestEffort } from '@tightlog/worker-utils/worker/best-effort';
import {
  clerkRejection,
  verifyClerkToken,
} from '@tightlog/worker-utils/services/clerk';

export interface ClerkIdentity {
  clerkUserId: string;
  email: string | null;
  accountName: string | null;
}

const clerkClients = new Map<string, ReturnType<typeof createClerkClient>>();

function clerkClient(secretKey: string): ReturnType<typeof createClerkClient> {
  let client = clerkClients.get(secretKey);
  if (!client) {
    client = createClerkClient({ secretKey });
    clerkClients.set(secretKey, client);
  }

  return client;
}

export const clerkService = {
  verifyIdentity: async (
    env: Env,
    token: string,
  ): Promise<ClerkIdentity | Response> => {
    const verdict = await verifyClerkToken(token, env);
    if (!verdict.ok) {
      return clerkRejection(verdict);
    }

    const sub = verdict.userId;
    const user = await bestEffort('clerk-get-user', () =>
      // SAFETY: not_configured above guarantees the key is set here.
      clerkClient(env.CLERK_SECRET_KEY as string).users.getUser(sub),
    );
    return {
      clerkUserId: sub,
      email:
        user?.primaryEmailAddress?.emailAddress ??
        user?.emailAddresses[0]?.emailAddress ??
        null,
      accountName: user?.fullName?.trim() ?? null,
    };
  },
};
