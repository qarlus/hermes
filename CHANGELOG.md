# Changelog

This project now tracks notable changes here.

Dates use `YYYY-MM-DD`.

## [0.1.0] - 2026-03-11

### Added

- Added the first end-to-end Hermes desktop workspace surface with projects, saved servers, SSH connection flows, and terminal session handling.
- Added local terminal launch profiles so Hermes can open different shells and tools depending on device platform and user preference.
- Added tmux-aware remote session discovery and reconnect flows within workspace server views.
- Added keychain and SSH key management surfaces to support saved credentials and developer workflows.
- Added Git and GitHub-oriented workspace tooling, including repository views and local repository actions.
- Added a file browser surface to inspect remote and workspace file content.
- Added Hermes theme selection and terminal font sizing in the settings model and desktop UI.
- Added manual sync bundle export/import so workspaces, servers, presets, commands, repositories, and UI settings can move between devices without Hermes-hosted infrastructure.
- Added relay client state and relay HTTP client helpers in the desktop app.
- Added a tiny self-hosted Hermes Relay package in `apps/server` with health, bootstrap, join, inspect, and revoke-device endpoints.
- Added Docker packaging for Hermes Relay.
- Added relay and sync shared types in `@hermes/sync`.
- Added a relay README at `apps/server/README.md`.
- Added a root project README and this changelog.

### Changed

- Changed the settings experience from a large provisioning form into a compact summary page for sync state, appearance, terminal preferences, and manual fallback sync.
- Changed relay setup to a server-first flow: users now choose a saved server and open an SSH session with prerequisite or install commands already queued.
- Changed relay management so installation and linking happen in a dedicated relay setup modal rather than directly on the main settings page.
- Changed the settings layout to be denser and less dashboard-like, with the Hermes status row moved up and oversized page sections removed.
- Changed the desktop shell wiring so relay setup can be opened from workspace server views and from settings summary actions.
- Changed the relay host model to assume Tailscale is installed separately on the host rather than bundled inside the relay container.

### Documentation

- Documented the relay deployment model as a tiny self-hosted service intended to run on user-controlled infrastructure.
- Documented the current install path, Docker usage, environment variables, and host-level Tailscale recommendation for the relay.
- Documented the repo structure and the current state of the desktop, mobile, server, and shared packages.

### Notes

- The relay currently provides the operational foundation for device linking and testing; it is not yet the final encrypted sync engine.
- The desktop relay install flow currently builds from the public Hermes repository.
- The Apple Container install path is scaffolded in the desktop app but still needs validation on a real macOS relay host.
