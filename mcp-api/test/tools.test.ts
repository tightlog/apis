import { afterEach, describe, expect, test, vi } from 'vitest';
import type { environmentAgencyService } from '../src/services/environment-agency-service';
import type { openMeteoService } from '../src/services/open-meteo-service';
import type { solunar } from '../src/solunar';
import { connectClient, toolJson } from './__fixtures__/mcpClient.fixture';

type OpenMeteo = typeof openMeteoService;

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn((_url: string) =>
    Promise.resolve(Response.json(body, { status })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('tools', () => {
  test('lists the coach tools', async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();

    expect(tools.map(tool => tool.name)).toEqual([
      'get_solunar',
      'get_current_conditions',
      'get_hourly_forecast',
      'get_weather_forecast',
      'get_tides',
      'get_marine_conditions',
      'get_river_level',
    ]);
  });

  test('get_solunar returns windows in the angler local time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-02T23:30:00Z'));
    const client = await connectClient();

    const result = toolJson<ReturnType<typeof solunar>>(
      await client.callTool({
        name: 'get_solunar',
        arguments: { utcOffsetMinutes: 60, days: 2 },
      }),
    );

    expect({
      date: result.today.date,
      majors: result.today.majorWindows.length,
      minors: result.today.minorWindows.length,
      outlookDays: result.outlook?.map(day => day.date),
      moonDatesAreLocal: [result.nextNewMoon, result.nextFullMoon].every(date =>
        /^\d{4}-\d{2}-\d{2}$/.test(date),
      ),
    }).toEqual({
      date: '2026-11-03',
      majors: 2,
      minors: 2,
      outlookDays: ['2026-11-03', '2026-11-04'],
      moonDatesAreLocal: true,
    });
  });

  test('get_weather_forecast summarises the Open-Meteo reply', async () => {
    const fetchMock = stubFetch({
      daily: {
        time: ['2026-11-02'],
        weather_code: [61],
        temperature_2m_max: [12.4],
        temperature_2m_min: [6.1],
        wind_speed_10m_max: [18],
        wind_direction_10m_dominant: [225],
        precipitation_probability_max: [70],
        sunrise: ['2026-11-02T07:01'],
        sunset: ['2026-11-02T16:32'],
      },
      hourly: {
        time: ['2026-11-02T00:00', '2026-11-02T12:00', '2026-11-02T23:00'],
        surface_pressure: [1012, 1009, 1006],
      },
    });
    const client = await connectClient();

    const result = toolJson<Awaited<ReturnType<OpenMeteo['dailyForecast']>>>(
      await client.callTool({
        name: 'get_weather_forecast',
        arguments: { latitude: 51.50712, longitude: -0.12756, days: 1 },
      }),
    );

    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      'latitude=51.51&longitude=-0.13',
    );

    expect(result).toEqual({
      available: true,
      timesAre: 'local time at the angler',
      units: { temperature: '°C', wind: 'km/h', pressure: 'hPa' },
      days: [
        {
          date: '2026-11-02',
          weather: 'rain',
          temperatureMin: 6.1,
          temperatureMax: 12.4,
          windMax: 18,
          windFromDegrees: 225,
          rainChancePercent: 70,
          sunrise: '2026-11-02T07:01',
          sunset: '2026-11-02T16:32',
          pressure: { meanHpa: 1009, trend: 'falling' },
        },
      ],
    });
  });

  test('get_tides finds the turns of the tide', async () => {
    stubFetch({
      hourly: {
        time: ['T0', 'T1', 'T2', 'T3', 'T4'],
        sea_level_height_msl: [0.2, 1.4, 0.9, -1.1, -0.4],
      },
    });
    const client = await connectClient();

    const result = toolJson<Awaited<ReturnType<OpenMeteo['tides']>>>(
      await client.callTool({
        name: 'get_tides',
        arguments: { latitude: 50.37, longitude: -4.14 },
      }),
    );

    expect(result).toEqual({
      available: true,
      timesAre: 'local time at the angler',
      note: 'Hourly model data, so each turn is accurate to about an hour.',
      turns: [
        { time: 'T1', kind: 'high', heightM: 1.4 },
        { time: 'T3', kind: 'low', heightM: -1.1 },
      ],
    });
  });

  test('get_tides says so inland', async () => {
    stubFetch({ error: true, reason: 'no sea' }, 400);
    const client = await connectClient();

    const result = toolJson<Awaited<ReturnType<OpenMeteo['tides']>>>(
      await client.callTool({
        name: 'get_tides',
        arguments: { latitude: 52.2, longitude: -1.5 },
      }),
    );

    expect(result).toEqual({ available: false, reason: 'no sea nearby' });
  });

  test('get_current_conditions reads the current block', async () => {
    stubFetch({
      current: {
        time: '2026-11-02T14:00',
        is_day: 1,
        temperature_2m: 11.2,
        apparent_temperature: 9.8,
        precipitation: 0.2,
        weather_code: 3,
        cloud_cover: 80,
        pressure_msl: 1008.4,
        wind_speed_10m: 14,
        wind_direction_10m: 240,
        wind_gusts_10m: 31,
      },
    });
    const client = await connectClient();

    const result = toolJson<
      Awaited<ReturnType<OpenMeteo['currentConditions']>>
    >(
      await client.callTool({
        name: 'get_current_conditions',
        arguments: { latitude: 51.5, longitude: -0.1 },
      }),
    );

    expect(result).toEqual({
      available: true,
      units: { temperature: '°C', wind: 'km/h', pressure: 'hPa', rain: 'mm' },
      time: '2026-11-02T14:00',
      daylight: true,
      weather: 'partly cloudy',
      temperature: 11.2,
      feelsLike: 9.8,
      rainLastHour: 0.2,
      cloudCoverPercent: 80,
      pressure: 1008.4,
      wind: 14,
      gusts: 31,
      windFromDegrees: 240,
    });
  });

  test('get_hourly_forecast returns the hours of the asked day', async () => {
    const hours = Array.from({ length: 48 }, (_, hour) => hour);
    const fetchMock = stubFetch({
      hourly: {
        time: hours.map(hour => `H${hour}`),
        wind_speed_10m: hours,
      },
    });
    const client = await connectClient();

    const result = toolJson<Awaited<ReturnType<OpenMeteo['hourlyForecast']>>>(
      await client.callTool({
        name: 'get_hourly_forecast',
        arguments: { latitude: 51.5, longitude: -0.1, dayOffset: 1 },
      }),
    );

    expect(fetchMock.mock.calls[0]?.[0]).toContain('forecast_days=2');

    expect({
      count: result.hours?.length,
      first: result.hours?.[0],
    }).toEqual({
      count: 24,
      first: {
        time: 'H24',
        weather: null,
        temperature: null,
        rainChancePercent: null,
        cloudCoverPercent: null,
        pressure: null,
        wind: 24,
        gusts: null,
        windFromDegrees: null,
      },
    });
  });

  test('get_marine_conditions reports the sea state', async () => {
    stubFetch({
      current: {
        time: '2026-11-02T14:00',
        wave_height: 1.2,
        wave_period: 7,
        wave_direction: 250,
        swell_wave_height: 0.8,
        sea_surface_temperature: 13.1,
      },
      hourly: { wave_height: [1.2, 1.9, null, 1.4] },
    });
    const client = await connectClient();

    const result = toolJson<Awaited<ReturnType<OpenMeteo['marineConditions']>>>(
      await client.callTool({
        name: 'get_marine_conditions',
        arguments: { latitude: 50.37, longitude: -4.14 },
      }),
    );

    expect(result).toEqual({
      available: true,
      units: { height: 'm', period: 's', temperature: '°C' },
      time: '2026-11-02T14:00',
      waveHeight: 1.2,
      wavePeriod: 7,
      waveFromDegrees: 250,
      swellHeight: 0.8,
      seaTemperature: 13.1,
      maxWaveHeightNext24h: 1.9,
    });
  });

  test('get_river_level reads the nearest gauge', async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        Response.json(
          url.includes('/readings')
            ? {
                items: [
                  { dateTime: '2026-11-02T14:00:00Z', value: 1.42 },
                  { dateTime: '2026-11-02T11:15:00Z', value: 1.3 },
                ],
              }
            : {
                items: [
                  {
                    label: 'Far Weir',
                    riverName: 'River Far',
                    lat: 52.4,
                    long: -1.9,
                    measures: [{ '@id': 'https://ea/far', parameter: 'level' }],
                  },
                  {
                    label: 'Near Bridge',
                    riverName: 'River Avon',
                    lat: 52.29,
                    long: -1.53,
                    measures: [
                      { '@id': 'https://ea/near', parameter: 'level' },
                    ],
                  },
                ],
              },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = await connectClient();

    const result = toolJson<
      Awaited<ReturnType<typeof environmentAgencyService.riverLevel>>
    >(
      await client.callTool({
        name: 'get_river_level',
        arguments: { latitude: 52.28, longitude: -1.53 },
      }),
    );

    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://ea/near/readings?_sorted&_limit=12',
    );

    expect(result).toEqual({
      available: true,
      station: 'Near Bridge',
      river: 'River Avon',
      levelM: 1.42,
      readAt: '2026-11-02T14:00:00Z',
      trend: 'rising',
      changeM: 0.12,
      since: '2026-11-02T11:15:00Z',
    });
  });

  test('get_river_level says so with no gauge nearby', async () => {
    stubFetch({ items: [] });
    const client = await connectClient();

    const result = toolJson<
      Awaited<ReturnType<typeof environmentAgencyService.riverLevel>>
    >(
      await client.callTool({
        name: 'get_river_level',
        arguments: { latitude: 40.7, longitude: -74 },
      }),
    );

    expect(result).toEqual({
      available: false,
      reason:
        'no river gauge within 12 km (Environment Agency covers England only)',
    });
  });
});
