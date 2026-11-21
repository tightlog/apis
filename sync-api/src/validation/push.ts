import { z } from 'zod';
import { syncRowSchema } from '../tables';

export const pushSchema = z.object({
  items: z.array(syncRowSchema).nullable().catch(null),
});
