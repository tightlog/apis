# tightlog APIs

Open source Cloudflare Workers that power [tightlog.com](https://tightlog.com).

Each directory is a self-contained Worker with its own `package.json`,
`wrangler.jsonc` and tests. They are published snapshots of a private
monorepo, so the git history is squashed on each sync.

| Directory              | Worker                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [`sync-api`](sync-api) | Syncs the private, end-to-end encrypted logbook to Turso.                                                              |
| [`mcp-api`](mcp-api)   | Serves the coach's conditions tools (solunar, weather, tides, sea state, river level) over the Model Context Protocol. |

## What is not here

The snapshot ships only the code that runs the Worker. Terraform, operator
scripts and deploy tooling stay in the private monorepo. Deploy-time secrets
are never committed: the Apple App Attestation Root CA ships as a placeholder,
and the bundle ids, hostnames and resource names are stripped from the Worker
config.

### Other services

Tightlog runs more than the two services mirrored here. None of these are in
this repo, and all are private:

| Service                | Role                                              |
| ---------------------- | ------------------------------------------------- |
| `ai-api`               | Proxies Gemini for the coach chat and images.     |
| `push-api`             | Device registry and OneSignal fan-out.            |
| `social-api`           | The shared-catches feed and its moderation.       |
| `tail-notify`          | Forwards Worker exceptions to chat.               |
| `metrics-exporter`     | Pushes Worker analytics to Grafana Cloud.         |
| `marketing-website`    | The public site, tightlog.com.                    |
| `sanity-studio`        | The self-hosted CMS at cms.tightlog.com.          |
| `mail-dashboard`       | Operator inbox for support mail.                  |
| `moderation-dashboard` | Operator queue for feed reports and takedowns.    |
| `admin-dashboard`      | Internal admin dashboard.                         |
| `push-dashboard`       | Operator view of the push registry and reminders. |
| `uptime-monitor`       | The status page, status.tightlog.com.             |

See each directory's `README.md` to run it.
