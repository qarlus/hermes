# Hermes Relay Plan

## Goal

Turn `Hermes Relay` into a ciphertext-only sync mailbox for Hermes clients.

The relay must:

- never store plaintext user data
- never store a plaintext workspace master/root key
- allow automatic device linking over Tailscale-backed relay connectivity
- keep the first linked device as the `master` approver
- support future background sync across desktop and mobile without Hermes-hosted infrastructure

## Trust Model

### Trusted

- the local Hermes client after user/device unlock
- the OS secure storage on each device for device secrets
- the user's own relay host for availability and routing only
- Tailscale for transport reachability and encrypted network path

### Not trusted with plaintext workspace data

- the relay process
- the relay filesystem / Docker volume
- the VPS / NAS / home server hosting the relay
- any reverse proxy in front of the relay

### Security objective

If the relay host is compromised, the attacker may learn limited routing metadata, but must not be able to decrypt:

- SSH keys
- credentials
- settings
- commands
- synced session metadata
- host/server records

## Crypto Model

### Device keys

Every Hermes device generates two long-term keypairs:

- `device_enc_keypair`: `X25519`
- `device_sign_keypair`: `Ed25519`

Storage:

- private keys live only on-device
- desktop stores them in OS secure storage where possible
- relay stores only the public keys

### Workspace key hierarchy

Each workspace has:

- `workspace_root_key`: 32 random bytes, generated on the first device

Data encryption should use envelope encryption:

- each synced object/log chunk gets a random `data_encryption_key`
- object payload is encrypted with `XChaCha20-Poly1305`
- the `data_encryption_key` is wrapped by `workspace_root_key`

Streaming / append-only logs should use:

- `secretstream_xchacha20poly1305`

Optional local passphrase unlock may use:

- `Argon2id`

But there is:

- no relay escrow mode
- no server-side recovery key
- no plaintext root key on the relay

## Relay-visible Data

The relay may store only:

- device ids
- public keys
- role / membership state
- timestamps
- encrypted workspace-key wraps
- encrypted snapshots
- encrypted change-log entries
- signatures
- relay-local opaque ids

The relay should not require plaintext:

- workspace names
- device display names
- commands
- settings
- secrets
- server definitions

If needed, user-facing labels can be encrypted metadata replicated to clients.

## Join and Approval Flow

### First device

1. Device generates local keypairs.
2. Device generates `workspace_root_key`.
3. Device registers itself with relay as `master`.
4. Device uploads:
   - public keys
   - wrapped workspace key for itself
   - initial encrypted workspace snapshot
5. Relay stores ciphertext only.

### Subsequent device

1. New device generates local keypairs.
2. New device connects to relay over Tailscale.
3. Relay creates a `pending device` record.
4. Master device sees pending approval.
5. Master device fetches pending device public keys.
6. Master wraps `workspace_root_key` for that device.
7. Relay stores the wrapped key.
8. New device downloads wrapped key and decrypts locally.
9. New device becomes `member`.

### UX requirement

The user should never see:

- workspace ids
- admin tokens
- join codes
- raw encryption keys

Approval should happen in-app from the master device.

## Sync Data Model

### Encrypted event log

The primary replication unit should be an append-only encrypted event log.

Each event contains:

- `event_id`
- `workspace_id`
- `author_device_id`
- `ciphertext`
- `aad`
- `signature`
- `created_at`
- `sequence`

The relay validates structural correctness and signatures, but cannot decrypt payloads.

### Snapshots

Periodic encrypted snapshots should be supported for faster recovery.

Each snapshot contains:

- `snapshot_id`
- `workspace_id`
- `base_sequence`
- `ciphertext`
- `aad`
- `signature`
- `created_at`

### Suggested sync domains

Replicated and encrypted:

- projects
- servers
- device registry
- synced settings
- terminal commands
- snippets/history metadata
- synced secret vault

Local-only:

- unlocked secret cache
- transient PTY state
- window/layout state
- temporary files

Replicated metadata only:

- recent session context
- last-used directories
- launcher preferences

Not replicated as live state:

- active shell process memory
- live shell continuity without `tmux`

## Device Revoke and Rotation

Revoking a device must:

1. mark the device revoked
2. stop serving future wrapped workspace keys to it
3. rotate `workspace_root_key`
4. rewrap the new root key for remaining active devices
5. use the new root key for all future writes

Important limit:

- revocation cannot erase data previously decrypted by that device

## Relay API Direction

Replace plaintext workspace/session endpoints with encrypted sync primitives.

### Keep

- `GET /health`

### Replace current v1 plaintext flows with

- `POST /api/devices/register`
- `POST /api/devices/approve`
- `POST /api/devices/revoke`
- `GET /api/devices/pending`
- `GET /api/workspace/keys/:deviceId`
- `POST /api/workspace/keys/:deviceId`
- `POST /api/events`
- `GET /api/events`
- `POST /api/snapshots`
- `GET /api/snapshots/latest`

The relay should only validate:

- authenticated device identity
- signatures
- sequence expectations
- membership / revoke state

It should not deserialize plaintext synced objects.

## Current Repo Impact

### `packages/sync`

Needs new shared types for:

- device public keys
- wrapped workspace keys
- encrypted event envelopes
- encrypted snapshot envelopes
- device approval/revoke records

### `apps/server`

Needs refactor from:

- plaintext `workspace/device/adminToken` JSON store

To:

- ciphertext envelope store
- wrapped-key registry
- signed membership records

### `apps/desktop`

Needs:

- device key generation
- secure local key storage
- local encrypted workspace-key persistence
- approval UI for pending devices
- encrypted sync writer/reader
- device revoke + rekey UX

### `apps/mobile`

Later, same model:

- device keypair generation
- secure enclave / keystore-backed storage where possible
- encrypted sync pull/push

## Implementation Phases

### Phase 1. Crypto foundation

- add `@hermes/crypto` helpers for:
  - key generation
  - envelope encryption
  - signature helpers
  - wrapped workspace keys
- add deterministic type-safe sync envelope definitions

### Phase 2. Device identity

- generate/store device keypairs on desktop
- expose local device public keys to relay
- replace current plaintext relay session assumptions

### Phase 3. Ciphertext relay

- replace plaintext relay workspace storage with encrypted envelopes
- add wrapped-key storage per device
- remove plaintext admin token reliance

### Phase 4. Approval flow

- add pending-device queue
- add master approval UI
- add automatic member linking after approval

### Phase 5. Encrypted sync engine

- encrypted snapshots
- encrypted event log
- replay and merge on client

### Phase 6. Revoke and key rotation

- device revoke
- root-key rotation
- future-write cutoff for revoked devices

## Immediate Next Step

Implement Phase 1 and Phase 2 first:

- define encrypted sync envelope types in `packages/sync`
- add device identity generation/storage on desktop
- add relay registration payloads based on public keys instead of plaintext workspace bootstrap/join records

Do not add more plaintext relay functionality beyond what already exists.
