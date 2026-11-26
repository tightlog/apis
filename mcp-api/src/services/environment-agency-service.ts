import {
  asArray,
  firstNumber,
  firstString,
  RIVER_GAUGE_SEARCH_KM,
  RIVER_READING_COUNT,
  riverTrend,
} from '../http';
import type { EaItems, EaReading, EaStation } from '../http';
import { getJson } from '../utils/getJson';
import type { Coordinates } from '../validation/tools';

async function getEa<Item>(url: string): Promise<Item[]> {
  const body = await getJson<EaItems<Item>>(url);
  return asArray(body?.items);
}

interface Gauge {
  station: EaStation;
  measureId: string | null;
  distance: number;
}

function squaredDistance(
  lat: number,
  long: number,
  input: Coordinates,
): number {
  const dLat = lat - input.latitude;
  const dLong =
    (long - input.longitude) * Math.cos((input.latitude * Math.PI) / 180);
  return dLat * dLat + dLong * dLong;
}

function nearestGauge(
  stations: readonly EaStation[],
  input: Coordinates,
): Gauge | null {
  let nearest: Gauge | null = null;
  for (const station of stations) {
    const lat = firstNumber(station.lat);
    const long = firstNumber(station.long);
    if (lat == null || long == null) {
      continue;
    }

    const distance = squaredDistance(lat, long, input);
    if (nearest === null || distance < nearest.distance) {
      const measure = asArray(station.measures).find(
        item => item.parameter === 'level',
      );
      nearest = { station, measureId: measure?.['@id'] ?? null, distance };
    }
  }

  return nearest;
}

export const environmentAgencyService = {
  riverLevel: async (input: Coordinates) => {
    const stations = await getEa<EaStation>(
      'https://environment.data.gov.uk/flood-monitoring/id/stations' +
        `?parameter=level&lat=${input.latitude}` +
        `&long=${input.longitude}&dist=${RIVER_GAUGE_SEARCH_KM}`,
    );
    const nearest = nearestGauge(stations, input);
    if (!nearest?.measureId) {
      return {
        available: false,
        reason: `no river gauge within ${RIVER_GAUGE_SEARCH_KM} km (Environment Agency covers England only)`,
      };
    }

    const readings = (
      await getEa<EaReading>(
        `${nearest.measureId}/readings?_sorted&_limit=${RIVER_READING_COUNT}`,
      )
    ).flatMap(reading => {
      const value = firstNumber(reading.value);
      return value != null && reading.dateTime != null
        ? [{ value, dateTime: reading.dateTime }]
        : [];
    });
    const latest = readings[0];
    const oldest = readings.at(-1);
    if (!latest || !oldest) {
      return { available: false, reason: 'the gauge has no recent readings' };
    }

    const change = latest.value - oldest.value;

    return {
      available: true,
      station: firstString(nearest.station.label),
      river: nearest.station.riverName ?? null,
      levelM: latest.value,
      readAt: latest.dateTime,
      trend: riverTrend(oldest.value, latest.value),
      changeM: Math.round(change * 100) / 100,
      since: oldest.dateTime,
    };
  },
};
