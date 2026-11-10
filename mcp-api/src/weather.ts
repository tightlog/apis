// https://open-meteo.com/en/docs - WMO weather interpretation codes
const WEATHER_CODES: [number, string][] = [
  [0, 'clear'],
  [3, 'partly cloudy'],
  [48, 'fog'],
  [57, 'drizzle'],
  [67, 'rain'],
  [77, 'snow'],
  [82, 'rain showers'],
  [86, 'snow showers'],
  [99, 'thunderstorm'],
];

export function describeWeather(code: number | undefined): string | null {
  if (code == null) {
    return null;
  }

  return WEATHER_CODES.find(([max]) => code <= max)?.[1] ?? null;
}

const PRESSURE_STEADY_HPA = 2;

export function pressureTrend(
  hourly: { time?: string[]; surface_pressure?: number[] } | undefined,
  date: string,
): { meanHpa: number; trend: 'rising' | 'falling' | 'steady' } | null {
  const readings = (hourly?.time ?? []).flatMap((time, index) => {
    const value = hourly?.surface_pressure?.[index];
    return time.startsWith(date) && value != null ? [value] : [];
  });
  const first = readings[0];
  const last = readings.at(-1);
  if (first == null || last == null) {
    return null;
  }

  const change = last - first;
  return {
    meanHpa: Math.round(
      readings.reduce((sum, value) => sum + value, 0) / readings.length,
    ),
    trend:
      Math.abs(change) < PRESSURE_STEADY_HPA
        ? 'steady'
        : change > 0
          ? 'rising'
          : 'falling',
  };
}
