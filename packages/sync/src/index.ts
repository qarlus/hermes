export type RelayDevicePlatform = "windows" | "macos" | "linux" | "android" | "ios" | "unknown";

export type RelayDeviceRole = "master" | "member";

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
  role: RelayDeviceRole;
  linkedAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
};

export type RelayWorkspaceRecord = {
  id: string;
  name: string;
  createdAt: string;
  masterDeviceId: string;
  devices: RelayWorkspaceDeviceRecord[];
};

export type RelayBootstrapRequest = {
  workspaceName: string;
  deviceName: string;
  devicePlatform: RelayDevicePlatform;
};

export type RelayJoinRequest = {
  workspaceId: string;
  adminToken: string;
  deviceName: string;
  devicePlatform: RelayDevicePlatform;
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
};

export type RelayWorkspaceSession = {
  relayUrl: string;
  relayId: string;
  workspace: RelayWorkspaceRecord;
  currentDeviceId: string;
  currentDeviceRole: RelayDeviceRole;
  adminToken: string | null;
};

export interface SyncTransport {
  health(): Promise<RelayHealthResponse>;
}
