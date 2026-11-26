import type { RegisterBody } from '../http';
import { z } from 'zod';

const META_STRING = 256;

const metaStringSchema = z
  .string()
  .catch('')
  .transform(value => value.trim().slice(0, META_STRING) || null);

export const registerSchema = z.object({
  anglerName: metaStringSchema,
  clerkToken: z.string().catch(''),
  revenueCatAppUserId: metaStringSchema,
  deviceId: metaStringSchema,
  platform: metaStringSchema,
  model: metaStringSchema,
  osName: metaStringSchema,
  osVersion: metaStringSchema,
  appVersion: metaStringSchema,
}) satisfies z.ZodType<Record<keyof RegisterBody, string | null>, RegisterBody>;
