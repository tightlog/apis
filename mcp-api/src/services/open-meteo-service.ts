import {
  dayPressures,
  findTideExtremes,
  tidePointsOf,
  wmoGroup,
} from '../http';
import { getJson } from '../utils/getJson';
import type {
  Coordinates,
  DailyForecastInput,
  HourlyForecastInput,
} from '../validation/tools';

interface OpenMeteoCurrent {
  current?: {
    time?: string;
    is_day?: number;
    temperature_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    weather_code?: number;
    cloud_cover?: number;
    surface_pressure?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    wind_gusts_10m?: number;
  };
}

interface OpenMeteoHourly {
  hourly?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m?: number[];
    precipitation_probability?: number[];
    cloud_cover?: number[];
    surface_pressure?: number[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
    wind_gusts_10m?: number[];
  };
}

interface OpenMeteoForecast {
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    wind_speed_10m_max?: number[];
    wind_direction_10m_dominant?: number[];
    precipitation_probability_max?: number[];
    sunrise?: string[];
    sunset?: string[];
  };
  hourly?: { time?: string[]; surface_pressure?: number[] };
}

interface OpenMeteoMarine {
  hourly?: { time?: string[]; sea_level_height_msl?: (number | null)[] };
}

interface OpenMeteoMarineNow {
  current?: {
    time?: string;
    wave_height?: number | null;
    wave_period?: number | null;
    wave_direction?: number | null;
    swell_wave_height?: number | null;
    sea_surface_temperature?: number | null;
  };
  hourly?: { wave_height?: (number | null)[] };
}

const HOURS_PER_DAY = 24;

const TIDE_FORECAST_HOURS = 48;

const OPEN_METEO_APIS = {
  forecast: 'https://api.open-meteo.com/v1/forecast',
  marine: 'https://marine-api.open-meteo.com/v1/marine',
};

function openMeteoUrl(
  api: keyof typeof OPEN_METEO_APIS,
  { latitude, longitude }: Coordinates,
  params: Record<string, string | number | readonly string[]>,
): string {
  const query = Object.entries({
    latitude,
    longitude,
    ...params,
    timezone: 'auto',
  })
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&');
  return `${OPEN_METEO_APIS[api]}?${query}`;
}

export const openMeteoService = {
  currentConditions: async (input: Coordinates) => {
    const body = await getJson<OpenMeteoCurrent>(
      openMeteoUrl('forecast', input, {
        current: [
          'is_day',
          'temperature_2m',
          'apparent_temperature',
          'precipitation',
          'weather_code',
          'cloud_cover',
          'surface_pressure',
          'wind_speed_10m',
          'wind_direction_10m',
          'wind_gusts_10m',
        ],
        wind_speed_unit: 'kmh',
      }),
    );
    const now = body?.current;
    if (!now?.time) {
      return { available: false };
    }

    return {
      available: true,
      units: { temperature: '°C', wind: 'km/h', pressure: 'hPa', rain: 'mm' },
      time: now.time,
      daylight: now.is_day === 1,
      weather: wmoGroup(now.weather_code),
      temperature: now.temperature_2m ?? null,
      feelsLike: now.apparent_temperature ?? null,
      rainLastHour: now.precipitation ?? null,
      cloudCoverPercent: now.cloud_cover ?? null,
      pressure: now.surface_pressure ?? null,
      wind: now.wind_speed_10m ?? null,
      gusts: now.wind_gusts_10m ?? null,
      windFromDegrees: now.wind_direction_10m ?? null,
    };
  },

  hourlyForecast: async (input: HourlyForecastInput) => {
    const body = await getJson<OpenMeteoHourly>(
      openMeteoUrl('forecast', input, {
        hourly: [
          'weather_code',
          'temperature_2m',
          'precipitation_probability',
          'cloud_cover',
          'surface_pressure',
          'wind_speed_10m',
          'wind_direction_10m',
          'wind_gusts_10m',
        ],
        forecast_days: input.dayOffset + 1,
        wind_speed_unit: 'kmh',
      }),
    );
    const hourly = body?.hourly;
    const from = input.dayOffset * HOURS_PER_DAY;
    const times = hourly?.time?.slice(from, from + HOURS_PER_DAY) ?? [];
    if (times.length === 0) {
      return { available: false };
    }

    return {
      available: true,
      timesAre: 'local time at the angler',
      units: { temperature: '°C', wind: 'km/h', pressure: 'hPa' },
      hours: times.map((time, index) => {
        const at = from + index;
        return {
          time,
          weather: wmoGroup(hourly?.weather_code?.[at]),
          temperature: hourly?.temperature_2m?.[at] ?? null,
          rainChancePercent: hourly?.precipitation_probability?.[at] ?? null,
          cloudCoverPercent: hourly?.cloud_cover?.[at] ?? null,
          pressure: hourly?.surface_pressure?.[at] ?? null,
          wind: hourly?.wind_speed_10m?.[at] ?? null,
          gusts: hourly?.wind_gusts_10m?.[at] ?? null,
          windFromDegrees: hourly?.wind_direction_10m?.[at] ?? null,
        };
      }),
    };
  },

  dailyForecast: async (input: DailyForecastInput) => {
    const body = await getJson<OpenMeteoForecast>(
      openMeteoUrl('forecast', input, {
        daily: [
          'weather_code',
          'temperature_2m_max',
          'temperature_2m_min',
          'wind_speed_10m_max',
          'wind_direction_10m_dominant',
          'precipitation_probability_max',
          'sunrise',
          'sunset',
        ],
        hourly: 'surface_pressure',
        past_days: 1,
        forecast_days: input.days,
        wind_speed_unit: 'kmh',
      }),
    );
    const daily = body?.daily;
    const dates = daily?.time ?? [];
    if (!daily || dates.length < 2) {
      return { available: false };
    }

    const pressures = dayPressures(dates, body?.hourly);

    return {
      available: true,
      timesAre: 'local time at the angler',
      units: { temperature: '°C', wind: 'km/h', pressure: 'hPa' },
      days: dates
        .map((date, index) => ({
          date,
          weather: wmoGroup(daily.weather_code?.[index]),
          temperatureMin: daily.temperature_2m_min?.[index] ?? null,
          temperatureMax: daily.temperature_2m_max?.[index] ?? null,
          windMax: daily.wind_speed_10m_max?.[index] ?? null,
          windFromDegrees: daily.wind_direction_10m_dominant?.[index] ?? null,
          rainChancePercent:
            daily.precipitation_probability_max?.[index] ?? null,
          sunrise: daily.sunrise?.[index] ?? null,
          sunset: daily.sunset?.[index] ?? null,
          pressure: pressures[index] ?? null,
        }))
        .slice(1),
    };
  },

  tides: async (input: Coordinates) => {
    const body = await getJson<OpenMeteoMarine>(
      openMeteoUrl('marine', input, {
        hourly: 'sea_level_height_msl',
        cell_selection: 'sea',
        forecast_hours: TIDE_FORECAST_HOURS,
      }),
    );
    const times = body?.hourly?.time ?? [];
    const heights = body?.hourly?.sea_level_height_msl ?? [];
    if (!heights.some(height => height != null)) {
      return { available: false, reason: 'no sea nearby' };
    }

    // Open-Meteo gives local times with no offset. Read them as UTC so the
    // turns keep the local wall clock whatever zone the runtime is in.
    const points = tidePointsOf(
      times.map(time => `${time}Z`),
      heights,
    );

    return {
      available: true,
      timesAre: 'local time at the angler',
      turns: findTideExtremes(points).map(({ time, kind, heightM }) => ({
        time: time.slice(0, 16),
        kind,
        heightM,
      })),
    };
  },

  marineConditions: async (input: Coordinates) => {
    const body = await getJson<OpenMeteoMarineNow>(
      openMeteoUrl('marine', input, {
        current: [
          'wave_height',
          'wave_period',
          'wave_direction',
          'swell_wave_height',
          'sea_surface_temperature',
        ],
        hourly: 'wave_height',
        forecast_hours: HOURS_PER_DAY,
        cell_selection: 'sea',
      }),
    );
    const now = body?.current;
    if (now?.wave_height == null && now?.sea_surface_temperature == null) {
      return { available: false, reason: 'no sea nearby' };
    }

    const nextDay = (body?.hourly?.wave_height ?? []).filter(
      (height): height is number => height != null,
    );

    return {
      available: true,
      units: { height: 'm', period: 's', temperature: '°C' },
      time: now.time ?? null,
      waveHeight: now.wave_height ?? null,
      wavePeriod: now.wave_period ?? null,
      waveFromDegrees: now.wave_direction ?? null,
      swellHeight: now.swell_wave_height ?? null,
      seaTemperature: now.sea_surface_temperature ?? null,
      maxWaveHeightNext24h: nextDay.length > 0 ? Math.max(...nextDay) : null,
    };
  },
};
