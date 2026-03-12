# Hermes Relay

`Hermes Relay` is the self-hosted server package used by Hermes clients for relay bootstrap and device-linking flows.

It is intended to run on infrastructure you control, typically behind Tailscale on a VPS, NAS, home server, or always-on desktop. The relay stores relay metadata and linked-device records. The intended long-term model is ciphertext-first, so user data should be encrypted before it reaches the relay.

## In this repo

- package: `apps/server`
- source entrypoint: `apps/server/src/index.ts`
- bundled runtime entrypoint: `apps/server/dist/index.js`
- minimal runtime image: `apps/server/Dockerfile.runtime`
- full repo build image: `apps/server/Dockerfile`

The desktop install flow is designed around the minimal runtime artifacts:

- `apps/server/dist/index.js`
- `apps/server/Dockerfile.runtime`

## Current API surface

- `GET /health`
- `POST /api/relay/bootstrap`
- `POST /api/relay/join`
- `POST /api/relay/inspect`
- `POST /api/relay/revoke-device`

State is currently persisted to a local JSON file.

## Local development

From the repository root:

```bash
bun install
bun run --filter @hermes/server typecheck
bun run --filter @hermes/server start
```

Default runtime settings:

- host: `127.0.0.1`
- port: `8787`
- data file: `./data/relay.json`

Environment variables:

- `HERMES_RELAY_HOST`
- `HERMES_RELAY_PORT`
- `HERMES_RELAY_DATA`

Example:

```bash
HERMES_RELAY_HOST=127.0.0.1 \
HERMES_RELAY_PORT=8787 \
HERMES_RELAY_DATA=./data/relay.json \
bun run --filter @hermes/server start
```

## Docker

Build the minimal runtime image:

```bash
docker build -f apps/server/Dockerfile.runtime -t hermes-relay:latest apps/server/dist
```

Run it:

```bash
docker run -d \
  --name hermes-relay \
  -p 8787:8787 \
  -e HERMES_RELAY_HOST=0.0.0.0 \
  -e HERMES_RELAY_PORT=8787 \
  -e HERMES_RELAY_DATA=/data/relay.json \
  -v hermes-relay-data:/data \
  hermes-relay:latest
```

If you are iterating on the relay locally, rebuild the bundled runtime first:

```bash
bun run --filter @hermes/server build
```

## Deployment guidance

For the current Hermes model:

- install Tailscale separately on the host
- join the host to your tailnet
- expose the relay only on the Tailscale path
- keep the relay off the public internet
- treat the relay as availability infrastructure, not trusted plaintext storage

## Related docs

- [Repository root README](../../README.md)
- [Architecture](../../docs/architecture.md)
- [Key decisions](../../docs/decisions.md)
- [Roadmap](../../docs/roadmap.md)
