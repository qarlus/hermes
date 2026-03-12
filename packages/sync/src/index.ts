export type RelayDevicePlatform = "windows" | "macos" | "linux" | "android" | "ios" | "unknown";

export type RelayDeviceRole = "master" | "member";

export type RelayDeviceStatus = "pending" | "approved" | "revoked";

export type RelayKeyEncoding = "base64";

export type RelayKeyWrapAlgorithm = "x25519-hkdf-sha256-xchacha20poly1305";

export type RelayDevicePublicKeys = {
  encryptionPublicKey: string;
  signingPublicKey: string;
  encoding: RelayKeyEncoding;
};

export type RelayDeviceIdentityRecord = {
  deviceId: string;
  publicKeys: RelayDevicePublicKeys;
};

export type RelayWorkspaceKeyWrapRecord = {
  version: 1;
  algorithm: RelayKeyWrapAlgorithm;
  recipientDeviceId: string;
  wrappedByDeviceId: string;
  ephemeralPublicKey: string;
  salt: string;
  nonce: string;
  ciphertext: string;
  encoding: RelayKeyEncoding;
  createdAt: string;
};

export type RelayEncryptedEventEnvelope = {
  version: 1;
  workspaceId: string;
  eventId: string;
  authorDeviceId: string;
  sequence: number;
  ciphertext: string;
  nonce: string;
  aad: string;
  signature: string;
  encoding: RelayKeyEncoding;
  createdAt: string;
};

export type RelayEncryptedSnapshotEnvelope = {
  version: 1;
  workspaceId: string;
  snapshotId: string;
  authorDeviceId: string;
  baseSequence: number;
  ciphertext: string;
  nonce: string;
  aad: string;
  signature: string;
  encoding: RelayKeyEncoding;
  createdAt: string;
};

export type RelayPostEventsRequest = {
  workspaceId: string;
  deviceId: string;
  events: RelayEncryptedEventEnvelope[];
};

export type RelayPostEventsResponse = {
  workspaceId: string;
  acceptedThroughSequence: number;
  events: RelayEncryptedEventEnvelope[];
};

export type RelayGetEventsRequest = {
  workspaceId: string;
  deviceId: string;
  afterSequence?: number;
};

export type RelayGetEventsResponse = {
  workspaceId: string;
  latestSequence: number;
  events: RelayEncryptedEventEnvelope[];
};

export type RelayPostSnapshotRequest = {
  workspaceId: string;
  deviceId: string;
  snapshot: RelayEncryptedSnapshotEnvelope;
};

export type RelayLatestSnapshotRequest = {
  workspaceId: string;
  deviceId: string;
};

export type RelayLatestSnapshotResponse = {
  workspaceId: string;
  latestSequence: number;
  snapshot: RelayEncryptedSnapshotEnvelope | null;
};

export type RelayHealthResponse = {
  status: "ok";
  service: "hermes-relay";
  version: string;
  relayId: string;
  serverTime: string;
};

export type RelayWorkspaceDeviceRecord = {
  id: string;
  name: string;
  platform: RelayDevicePlatform;
  role: RelayDeviceRole | null;
  status: RelayDeviceStatus;
  linkedAt: string;
  approvedAt: string | null;
  lastSeenAt: string;
  revokedAt: string | null;
  publicKeys: RelayDevicePublicKeys;
};

export type RelayWorkspaceRecord = {
  id: string;
  name: string;
  createdAt: string;
  masterDeviceId: string;
  devices: RelayWorkspaceDeviceRecord[];
};

export type RelayWorkspaceBootstrap = {
  workspaceId: string;
  workspaceName: string;
  wrappedWorkspaceKey: RelayWorkspaceKeyWrapRecord;
};

export type RelayConnectRequest = {
  deviceId: string;
  deviceName: string;
  devicePlatform: RelayDevicePlatform;
  publicKeys: RelayDevicePublicKeys;
  workspaceBootstrap?: RelayWorkspaceBootstrap | null;
};

export type RelayApproveDeviceRequest = {
  workspaceId: string;
  adminToken: string;
  pendingDeviceId: string;
  wrappedWorkspaceKey: RelayWorkspaceKeyWrapRecord;
};

export type RelayInspectRequest = {
  workspaceId: string;
  deviceId: string;
  adminToken?: string | null;
};

export type RelayRevokeDeviceRequest = {
  workspaceId: string;
  adminToken: string;
  deviceId: string;
  replacementWorkspaceKeyWraps: RelayWorkspaceKeyWrapRecord[];
};

export type RelayWorkspaceSession = {
  relayUrl: string;
  relayId: string;
  workspace: RelayWorkspaceRecord;
  currentDeviceId: string;
  currentDeviceRole: RelayDeviceRole | null;
  currentDeviceStatus: RelayDeviceStatus;
  wrappedWorkspaceKey: RelayWorkspaceKeyWrapRecord | null;
  adminToken: string | null;
  latestSequence: number;
  latestSnapshotId: string | null;
  latestSnapshotAt: string | null;
};

export interface SyncTransport {
  health(): Promise<RelayHealthResponse>;
}
