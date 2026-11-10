import type { Coordinates } from '../types';
import { getJson } from '../utils/getJson';
import { roundCoordinate } from '../utils/roundCoordinate';

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

const SEARCH_KM = 12;
const READING_COUNT = 12;
const STEADY_M = 0.01;

// https://environment.data.gov.uk/flood-monitoring/doc/reference
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
        `?parameter=level&lat=${roundCoordinate(input.latitude)}` +
        `&long=${roundCoordinate(input.longitude)}&dist=${SEARCH_KM}`,
    );
    const nearest = stations
      .filter(station => station.lat != null && station.long != null)
      .toSorted((a, b) => squaredDistance(a, input) - squaredDistance(b, input))
      .at(0);
    const measure = nearest?.measures?.find(item => item.parameter === 'level');
    if (!nearest || !measure?.['@id']) {
      return {
        available: false,
        reason:
          'no river gauge within 12 km (Environment Agency covers England only)',
      };
    }

    const readings = (
      await getEa<EaReading>(
        `${measure['@id']}/readings?_sorted&_limit=${READING_COUNT}`,
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
      trend:
        Math.abs(change) < STEADY_M
          ? 'steady'
          : change > 0
            ? 'rising'
            : 'falling',
      changeM: Math.round(change * 100) / 100,
      since: oldest.dateTime,
    };
  },
};
