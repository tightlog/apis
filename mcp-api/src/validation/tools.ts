import { coachContextInput } from '@tightlog/protocol/coach';
import { z } from 'zod';

export const coordinatesInput = {
  latitude: coachContextInput.latitude,
  longitude: coachContextInput.longitude,
};

export const solunarInput = {
  utcOffsetMinutes: coachContextInput.utcOffsetMinutes,
  days: z.number().int().min(1).max(7).default(1),
};

export const dailyForecastInput = {
  ...coordinatesInput,
  days: z.number().int().min(1).max(7).default(3),
};

export const hourlyForecastInput = {
  ...coordinatesInput,
  dayOffset: z
    .number()
    .int()
    .min(0)
    .max(6)
    .default(0)
    .describe('0 is today, 1 is tomorrow.'),
};
