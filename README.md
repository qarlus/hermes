# Hermes

Hermes is an open-source developer workspace for terminal-first infrastructure work.

It combines saved SSH targets, local terminal sessions, tmux-aware reconnect flows, key and credential management, Git tooling, and a self-hosted sync direction under one desktop surface. The current stack is built as a Bun workspace with a Tauri desktop app, shared packages, a mobile scaffold, and a tiny self-hosted relay service.

## What exists today

### Desktop app

The desktop app in `apps/desktop` currently includes:

- project and workspace organization
- saved server targets with SSH connection flows
- local device terminal launch profiles
- tmux session discovery and reconnect flows
- keychain and SSH key utilities
- Git and GitHub-oriented workspace views
- file browser surface
- theme and terminal settings
- manual export/import sync bundle fallback
- relay-aware sync and device management UI

### Relay

The relay in `apps/server` is the self-hosted sync foundation for Hermes.

Current relay responsibilities:

- bootstrap a relay workspace
- join additional devices
- inspect linked devices
- revoke linked devices
- persist relay state locally

Recommended deployment model:

- run the relay on infrastructure you control
- install Tailscale separately on that host
- expose the relay only over the tailnet
- keep Hermes user data encrypted before it is uploaded

More detail is in [apps/server/README.md](./apps/server/README.md).

### Packages

Shared packages live under `packages`:

- `@hermes/core`
- `@hermes/crypto`
- `@hermes/db`
- `@hermes/sync`
- `@hermes/ui`

### Mobile

`apps/mobile` exists as a scaffold and is not yet a full user-facing client.

## Repository layout

```text
apps/
  desktop/   Tauri desktop client
  mobile/    mobile scaffold
  server/    Hermes Relay
packages/
  core/      shared types and helpers
  crypto/    crypto primitives and helpers
  db/        app persistence and commands
  sync/      sync and relay types
  ui/        shared UI package
```

## Getting started

Install dependencies:

```bash
bun install
```

Run the workspace checks:

```bash
bun run check
```

Start the desktop app in development:

```bash
bun run desktop:dev
```

Build the desktop app:

```bash
bun run desktop:build
```

## Current product direction

Hermes is moving toward a self-hosted sync model:

- no Hermes-hosted user data
- user-controlled relay deployment
- server-first relay installation from a saved SSH target
- explicit device linking with master-device administration
- manual bundle export/import as an offline fallback

The current relay implementation is an early foundation for that direction, not the finished encrypted replication engine.

## Documentation

- Relay docs: [apps/server/README.md](./apps/server/README.md)
- Changelog: [CHANGELOG.md](./CHANGELOG.md)
- Current implementation notes: [plan.md](./plan.md)
