# Hermes Architecture

Hermes is structured as a Bun workspace with a desktop-first Tauri application and shared packages that keep future mobile, sync, and security work from leaking into the initial MVP.

## Current runtime split

- `apps/desktop`: React + Vite UI and Tauri v2 shell.
- `apps/desktop/src-tauri`: Rust backend for SQLite persistence and PTY-backed `ssh` sessions.
- `packages/core`: shared domain types and connect-flow helpers.
- `packages/db`: typed desktop invoke client for host/session persistence commands.
- `packages/ui`: Nox design tokens and shared UI helpers.

## MVP data flow

1. The React app calls typed functions from `@hermes/db`.
2. `@hermes/db` invokes Tauri commands exposed by the Rust backend.
3. Rust persists hosts in SQLite under the app data directory.
4. When a connection is opened, Rust starts the system `ssh` binary inside a PTY.
5. PTY output is emitted into the frontend, which renders it with `xterm.js`.
6. Terminal input and resize events flow back to the PTY through Tauri commands.

## Future seams

- `packages/crypto`: interface boundary for secret storage and encryption.
- `packages/sync`: sync contracts and transport-neutral stubs.
- `apps/server`: self-hosted sync service placeholder.
- `apps/mobile`: mobile shell placeholder aligned to the same core models.
