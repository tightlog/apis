# tightlog APIs

Open source Cloudflare Workers that power [tightlog.com](https://tightlog.com).

Each directory is a self-contained Worker with its own `package.json`,
`wrangler.jsonc` and tests. They are published snapshots of a private
monorepo, so the git history is squashed on each sync.

| Directory              | Worker                                                           |
| ---------------------- | --------------------------------------------------------------- |
| [`sync-api`](sync-api) | Syncs the private, end-to-end encrypted logbook to Turso.       |
| [`mcp-api`](mcp-api)   | Serves the coach's conditions tools (solunar, weather, tides, sea state, river level) over the Model Context Protocol. |

## What is not here

The snapshot ships only the code that runs the Worker. Terraform, operator
scripts and deploy tooling stay in the private monorepo. Deploy-time secrets
are never committed: the Apple App Attestation Root CA ships as a placeholder,
and the bundle ids, hostnames and resource names are stripped from the Worker
config.

See each directory's `README.md` to run it.
