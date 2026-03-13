# Hermes

Hermes is a desktop-first developer workspace for terminal-heavy infrastructure work. The repository is organized as a Bun monorepo with a Tauri desktop client, a self-hosted relay service, shared TypeScript packages, and a mobile scaffold for future expansion.

## What Hermes covers

- Saved SSH targets and local-first workspace organization
- PTY-backed terminal sessions that reuse the system `ssh` client
- Remote `tmux` attach-or-create flows
- Shared package boundaries for storage, sync, crypto, and UI
- A small self-hosted relay for device linking and sync bootstrap flows

## Repository layout

```text
apps/
  desktop/   Tauri desktop client (React + Vite + Rust)
  mobile/    mobile scaffold
  server/    Hermes Relay service
docs/
  architecture.md
  decisions.md
  roadmap.md
packages/
  core/      shared domain types and connect-flow helpers
  crypto/    crypto and secret-storage boundary
  db/        typed desktop persistence client
  sync/      sync contracts and relay types
  ui/        shared UI package
```

## Workspace packages

### Apps

- `@hermes/desktop`: primary desktop application
- `@hermes/mobile`: mobile placeholder package
- `@hermes/server`: self-hosted relay service

### Shared packages

- `@hermes/core`
- `@hermes/crypto`
- `@hermes/db`
- `@hermes/sync`
- `@hermes/ui`

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

Run the relay locally:

```bash
bun run --filter @hermes/server start
```

## Current direction

Hermes is moving toward a self-hosted, encrypted-sync model:

- desktop-first local workflow
- user-controlled relay deployment
- device linking and relay-assisted sync bootstrap
- encrypted data before relay upload
- offline/manual import-export fallback

The current relay is an early foundation for that model, not the finished sync engine.

## Documentation index

### README files

- [Root README](./README.md)
- [Relay README](./apps/server/README.md)

### Project docs

- [Architecture](./docs/architecture.md)
- [Key decisions](./docs/decisions.md)
- [Roadmap](./docs/roadmap.md)
- [Iris terminal brief](./docs/iris/engineering-brief.md)
- [Changelog](./CHANGELOG.md)
- [Current implementation notes](./plan.md)
