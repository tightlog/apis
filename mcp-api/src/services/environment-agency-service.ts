import {
  RIVER_GAUGE_SEARCH_KM,
  RIVER_READING_COUNT,
  riverTrend,
} from '../http';
import { getJson } from '../utils/getJson';
import type { Coordinates } from '../validation/tools';

interface EaStation {
  label?: string;
  riverName?: string;
  lat?: number;
  long?: number;
  measures?: { '@id'?: string; parameter?: string }[];
}

interface EaReading {
  dateTime?: string;
  value?: number;
}

async function getEa<T>(url: string): Promise<T[]> {
  const body = await getJson<{ items?: T[] }>(url);
  return body?.items ?? [];
}

function squaredDistance(station: EaStation, input: Coordinates): number {
  const dLat = (station.lat ?? 0) - input.latitude;
  const dLong =
    ((station.long ?? 0) - input.longitude) *
    Math.cos((input.latitude * Math.PI) / 180);
  return dLat * dLat + dLong * dLong;
}

export const environmentAgencyService = {
  riverLevel: async (input: Coordinates) => {
    const stations = await getEa<EaStation>(
      'https://environment.data.gov.uk/flood-monitoring/id/stations' +
        `?parameter=level&lat=${input.latitude}` +
        `&long=${input.longitude}&dist=${RIVER_GAUGE_SEARCH_KM}`,
    );
    const nearest = stations
      .filter(station => station.lat != null && station.long != null)
      .toSorted((a, b) => squaredDistance(a, input) - squaredDistance(b, input))
      .at(0);
    const measure = nearest?.measures?.find(item => item.parameter === 'level');
    if (!nearest || !measure?.['@id']) {
      return {
        available: false,
        reason: `no river gauge within ${RIVER_GAUGE_SEARCH_KM} km (Environment Agency covers England only)`,
      };
    }

    const readings = (
      await getEa<EaReading>(
        `${measure['@id']}/readings?_sorted&_limit=${RIVER_READING_COUNT}`,
      )
    ).filter(reading => reading.value != null && reading.dateTime != null);
    const latest = readings[0];
    const oldest = readings.at(-1);
    if (latest?.value == null || oldest?.value == null) {
      return { available: false, reason: 'the gauge has no recent readings' };
    }

    const change = latest.value - oldest.value;

    return {
      available: true,
      station: nearest.label ?? null,
      river: nearest.riverName ?? null,
      levelM: latest.value,
      readAt: latest.dateTime,
      trend: riverTrend(oldest.value, latest.value),
      changeM: Math.round(change * 100) / 100,
      since: oldest.dateTime,
    };
  },
};
