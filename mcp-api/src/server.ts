import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toolResult } from '@tightlog/protocol/coach';
import { environmentAgencyService } from './services/environment-agency-service';
import { openMeteoService } from './services/open-meteo-service';
import { solunar } from './solunar';
import {
  coordinatesInput,
  dailyForecastInput,
  hourlyForecastInput,
  solunarInput,
} from './validation/tools';

export function createServer(): McpServer {
  const server = new McpServer({ name: 'tightlog', version: '0.1.0' });

  server.registerTool(
    'get_solunar',
    {
      description:
        'Moon phase, solunar rating, the major and minor bite windows for today and the next new and full moon, with an optional rating outlook for the next days.',
      inputSchema: solunarInput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    input => toolResult(solunar(input)),
  );

  server.registerTool(
    'get_current_conditions',
    {
      description:
        "Weather at the angler's location right now: conditions, temperature, wind, gusts, pressure, cloud and rain in the last hour.",
      inputSchema: coordinatesInput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async input => toolResult(await openMeteoService.currentConditions(input)),
  );

  server.registerTool(
    'get_hourly_forecast',
    {
      description:
        "Hour-by-hour forecast for one day at the angler's location: wind, gusts, pressure, cloud, rain chance and temperature. Use it to pick the best hours.",
      inputSchema: hourlyForecastInput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async input => toolResult(await openMeteoService.hourlyForecast(input)),
  );

  server.registerTool(
    'get_weather_forecast',
    {
      description:
        "Daily weather forecast at the angler's location: conditions, temperature, wind, rain chance, sunrise, sunset and the pressure trend.",
      inputSchema: dailyForecastInput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async input => toolResult(await openMeteoService.dailyForecast(input)),
  );

  server.registerTool(
    'get_tides',
    {
      description:
        "High and low tide times and heights for the next 48 hours at the angler's location. Says so when there is no sea nearby.",
      inputSchema: coordinatesInput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async input => toolResult(await openMeteoService.tides(input)),
  );

  server.registerTool(
    'get_marine_conditions',
    {
      description:
        "Sea state off the angler's location now: wave height, period and direction, swell, sea temperature and the highest wave in the next 24 hours. Says so when there is no sea nearby.",
      inputSchema: coordinatesInput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async input => toolResult(await openMeteoService.marineConditions(input)),
  );

  server.registerTool(
    'get_river_level',
    {
      description:
        'Level and trend at the nearest river gauge to the angler. England only (Environment Agency); says so elsewhere.',
      inputSchema: coordinatesInput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async input => toolResult(await environmentAgencyService.riverLevel(input)),
  );

  return server;
}
