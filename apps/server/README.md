# Hermes Relay

`Hermes Relay` is the tiny self-hosted sync relay for Hermes clients.

The relay is intended to run on a machine you control, typically a VPS, NAS, home server, or always-on desktop that is already reachable over Tailscale. Hermes clients connect to it to bootstrap a workspace, join linked devices, inspect device state, and revoke devices.

The relay stores relay metadata and workspace/device records only. The longer-term sync design is ciphertext-first: user data should be encrypted before it reaches the relay.

## Current scope

This package currently provides:

- `GET /health`
- `POST /api/relay/bootstrap`
- `POST /api/relay/join`
- `POST /api/relay/inspect`
- `POST /api/relay/revoke-device`

State is persisted to a local JSON file.

## Repository layout

The relay lives in this repo:

- app package: `apps/server`
- runtime entrypoint: `apps/server/src/index.ts`
- container build: `apps/server/Dockerfile`

The desktop install flow currently clones this repository and builds the relay container from `apps/server/Dockerfile`.

## Local development

From the repo root:

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

Build from the repo root:

```bash
docker build -f apps/server/Dockerfile -t hermes-relay:latest .
```

Run:

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

## Recommended deployment

For the current Hermes model:

- install Tailscale separately on the host
- join the host to your tailnet
- run `hermes-relay` as a normal container
- expose the relay only over the host's Tailscale path
- do not expose the relay publicly on the internet

In practice:

- bind or firewall the relay so only the Tailscale interface can reach it
- keep the host as the network boundary
- treat the relay as availability infrastructure, not trusted plaintext storage

## Notes

- This is an early relay foundation for local testing and client integration.
- The Apple Container install path in the desktop app is still provisional and needs runtime validation on a real macOS host.
- The eventual sync engine should move app state replication onto encrypted snapshots and change logs instead of relay-managed plaintext records.
