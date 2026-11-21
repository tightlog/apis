import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { COACH_TOOL_NAMES, toolResult } from './http';
import type { CoachToolName } from './http';
import type { z } from 'zod';
import { environmentAgencyService } from './services/environment-agency-service';
import { openMeteoService } from './services/open-meteo-service';
import { solunar } from './solunar';
import { cachedTool } from './utils/toolCache';
import {
  coordinatesInput,
  dailyForecastInput,
  hourlyForecastInput,
  solunarInput,
} from './validation/tools';

type RegisterTool = (server: McpServer, name: CoachToolName) => void;

type ToolInputSchema = Record<string, z.ZodNumber | z.ZodDefault<z.ZodNumber>>;

type ToolArguments<Input extends ToolInputSchema> = {
  [Key in keyof Input]: z.output<Input[Key]>;
};

interface ToolConfig<Input extends ToolInputSchema> {
  description: string;
  inputSchema: Input;
  run: (input: ToolArguments<Input>) => object | Promise<object>;
  readsUpstream?: boolean;
}

function tool<Input extends ToolInputSchema>({
  description,
  inputSchema,
  run,
  readsUpstream = true,
}: ToolConfig<Input>): RegisterTool {
  const schema: ToolInputSchema = inputSchema;
  return (server, name) => {
    server.registerTool(
      name,
      {
        description,
        inputSchema: schema,
        annotations: { readOnlyHint: true, openWorldHint: readsUpstream },
      },
      async args => {
        // SAFETY: the SDK parses the arguments with inputSchema before it calls the handler.
        const input = args as ToolArguments<Input>;
        return toolResult(
          readsUpstream ? await cachedTool(name, input, run) : await run(input),
        );
      },
    );
  };
}

const tools = {
  get_solunar: tool({
    description:
      'Moon phase, solunar rating, the major and minor bite windows for today and the next new and full moon, with an optional rating outlook for the next days.',
    inputSchema: solunarInput,
    run: solunar,
    readsUpstream: false,
  }),

  get_current_conditions: tool({
    description:
      "Weather at the angler's location right now: conditions, temperature, wind, gusts, pressure, cloud and rain in the last hour.",
    inputSchema: coordinatesInput,
    run: openMeteoService.currentConditions,
  }),

  get_hourly_forecast: tool({
    description:
      "Hour-by-hour forecast for one day at the angler's location: wind, gusts, pressure, cloud, rain chance and temperature. Use it to pick the best hours.",
    inputSchema: hourlyForecastInput,
    run: openMeteoService.hourlyForecast,
  }),

  get_weather_forecast: tool({
    description:
      "Daily weather forecast at the angler's location: conditions, temperature, wind, rain chance, sunrise, sunset and the pressure trend.",
    inputSchema: dailyForecastInput,
    run: openMeteoService.dailyForecast,
  }),

  get_tides: tool({
    description:
      "High and low tide times and heights for the next 48 hours at the angler's location. Says so when there is no sea nearby.",
    inputSchema: coordinatesInput,
    run: openMeteoService.tides,
  }),

  get_marine_conditions: tool({
    description:
      "Sea state off the angler's location now: wave height, period and direction, swell, sea temperature and the highest wave in the next 24 hours. Says so when there is no sea nearby.",
    inputSchema: coordinatesInput,
    run: openMeteoService.marineConditions,
  }),

  get_river_level: tool({
    description:
      'Level and trend at the nearest river gauge to the angler. England only (Environment Agency); says so elsewhere.',
    inputSchema: coordinatesInput,
    run: environmentAgencyService.riverLevel,
  }),
} satisfies Record<CoachToolName, RegisterTool>;

export function createServer(): McpServer {
  const server = new McpServer({ name: 'tightlog', version: '0.1.0' });
  for (const name of COACH_TOOL_NAMES) {
    tools[name](server, name);
  }

  return server;
}
