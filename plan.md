# Hermes Relay Plan

## Goal

Add a tiny self-hosted Hermes Relay plus the corresponding Settings UI and local state needed to configure relay connectivity, designate the first linked device as the master device, and expose relay administration controls from that master device.

## Constraints

- Tailscale is installed and managed separately from Hermes.
- Hermes Relay runs as a small standalone service, intended for Docker deployment.
- Relay traffic is only reachable over the host's Tailscale path.
- User data must remain end-to-end encrypted before upload to the relay.
- The first device linked to a relay becomes the local master/admin device for that relay workspace.

## Phases

### 1. Foundation

- Inspect and reuse the existing `apps/server` and `packages/sync` seams.
- Define relay-related domain types shared across desktop/server.
- Add local desktop settings storage for relay configuration and master-device state.

### 2. Relay Service

- Turn the server placeholder into a minimal Hermes Relay service.
- Add health/config endpoints first.
- Add relay workspace bootstrap endpoint for the first device.
- Add device registration/admin endpoints scaffolded for later encrypted sync payloads.

### 3. Desktop Settings

- Add a Relay section to Settings.
- Support:
  - relay URL
  - relay workspace name/label
  - connect/bootstrap action
  - master device badge/state
  - admin controls visible only to the master device
- Move the Hermes status affordance to a more prominent compact area.
- Reduce overall settings page density and card sizing.

### 4. Local State + Wiring

- Persist relay settings locally.
- Persist relay device/admin metadata locally until full sync lands.
- Add typed client helpers for the relay endpoints.
- Wire connect/bootstrap actions from the settings page.

### 5. Validation

- Typecheck/build desktop, server, and shared packages.
- Verify the new settings flow with safe defaults and clear empty states.
- Document remaining sync-engine gaps that are intentionally deferred.

## Intentional v1 Limits

- No full encrypted change-log replication yet.
- No background sync engine yet.
- No mobile client implementation yet.
- No final device revoke/key rotation flow yet.

Those should be scaffolded, not faked.
