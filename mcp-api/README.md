# mcp-api

Cloudflare Worker that serves the coach's conditions tools over the
[Model Context Protocol](https://modelcontextprotocol.io) (MCP). The cloud
coach chat in `src/ai-api` is the MCP client.

## Tools

| Tool                     | Input                                      | Source                       |
| ------------------------ | ------------------------------------------ | ---------------------------- |
| `get_solunar`            | `utcOffsetMinutes`, `days` (1-7)           | `src/solunar`                |
| `get_current_conditions` | `latitude`, `longitude`                    | Open-Meteo forecast          |
| `get_hourly_forecast`    | `latitude`, `longitude`, `dayOffset` (0-6) | Open-Meteo forecast          |
| `get_weather_forecast`   | `latitude`, `longitude`, `days` (1-7)      | Open-Meteo forecast          |
| `get_tides`              | `latitude`, `longitude`                    | Open-Meteo marine            |
| `get_marine_conditions`  | `latitude`, `longitude`                    | Open-Meteo marine            |
| `get_river_level`        | `latitude`, `longitude`                    | Environment Agency (England) |

Each tool returns one text part that holds JSON. The tools read no personal
data. The logbook is end-to-end encrypted, so a server cannot read catches.

`get_solunar` imports `@tightlog/solunar`, the same package the app uses, so
the coach and the app show the same bite windows. That package must stay free
of imports.

## How the AI Worker calls it

```
app (cloud chat)  ── POST /api/coach-chat  ──▶ ai-api ── MCP ──▶ mcp-api /mcp
app (Apple model) ── POST /api/coach-tools ──▶ ai-api ── MCP ──▶ mcp-api /mcp
```

1. The app sends `context` with the coach chat: the coordinates on a 0.01
   degree grid and the device UTC offset.
2. `ai-api` connects to this Worker, lists the tools and gives them to Gemini
   as function declarations. It removes `latitude`, `longitude` and
   `utcOffsetMinutes` from each schema and fills them from `context`. The
   model never sees the coordinates.
3. A tool whose hidden input is not in `context` is not offered.
4. Gemini can call tools for 2 rounds. The third call forbids tool calls, so
   one chat message costs at most 3 flash-lite calls.
5. If this Worker is down, the chat continues without tools.

The on-device Apple model uses the same tools through
`POST /api/coach-tools` on `ai-api`:

- `{ context }` returns the function declarations.
- `{ context, call: { name, arguments } }` runs one tool and returns
  `{ result }`.

`src/app/src/lib/coachTools.ts` turns the declarations into AI SDK tools.
The route checks the attestation and then refunds the quota, because it calls
no paid model.

## Access

The Worker has no route and `workers_dev` is `false`, so it has no public URL.
Only the `MCP` service binding on `ai-api` reaches it. `ai-api` checks App
Attest and the API secret before it calls a tool. Do not add a public route
without an auth gate in front of `/mcp`.

The transport is stateless: each request builds a new server, so no session
has to live across isolates.

## Commands

```sh
bun dev
bun run test
bun run ts:check
bun run lint
```

## Deploy

Deploy this Worker before `ai-api`, because the binding must resolve.

```sh
bun run deploy:staging
bun run deploy:production
```

From the repo root, `bun run deploy` deploys `mcp` before `ai`. CI:
`.github/workflows/deploy-mcp-api.yml` deploys staging on a push to `main`
that touches `src/mcp-api/**`. Production is a manual workflow_dispatch.
