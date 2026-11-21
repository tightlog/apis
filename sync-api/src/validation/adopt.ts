import type { AdoptPurchaseBody } from '../http';
import { z } from 'zod';

export const adoptPurchaseSchema = z.object({
  appUserId: z.string().catch(''),
  storeTransactionId: z.string().catch(''),
} satisfies Record<keyof AdoptPurchaseBody, z.ZodType>);
