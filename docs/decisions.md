# Key Decisions

## Desktop shell

Hermes uses Tauri v2 to stay native-feeling and keep startup cost low compared to Electron-class alternatives.

## SSH transport

Hermes does not implement SSH itself in v1. The Rust backend launches the system `ssh` binary inside a PTY and streams the terminal to `xterm.js`.

## Persistence strategy

SQLite is local-first storage for v1. Sync and secret storage are separate concerns and intentionally deferred behind package boundaries.

## Session persistence

Hermes uses remote tmux instead of a built-in session manager. When enabled for a host, the connect flow runs `tmux new -A -s <session>`.
