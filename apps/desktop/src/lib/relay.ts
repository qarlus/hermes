import type {
  RelayApproveDeviceRequest,
  RelayConnectRequest,
  RelayGetEventsResponse,
  RelayHealthResponse,
  RelayInspectRequest,
  RelayLatestSnapshotResponse,
  RelayPostEventsRequest,
  RelayPostEventsResponse,
  RelayPostSnapshotRequest,
  RelayRevokeDeviceRequest,
  RelayWorkspaceSession
} from "@hermes/sync";

export async function getRelayHealth(relayUrl: string) {
  return request<RelayHealthResponse>(relayUrl, "/health", {
    method: "GET"
  });
}

export async function connectRelayWorkspace(relayUrl: string, input: RelayConnectRequest) {
  return request<RelayWorkspaceSession>(relayUrl, "/api/relay/connect", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function inspectRelayWorkspace(
  relayUrl: string,
  input: RelayInspectRequest
) {
  return request<RelayWorkspaceSession>(relayUrl, "/api/relay/inspect", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function approveRelayDevice(
  relayUrl: string,
  input: RelayApproveDeviceRequest
) {
  return request<RelayWorkspaceSession>(relayUrl, "/api/relay/approve-device", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function revokeRelayDevice(
  relayUrl: string,
  input: RelayRevokeDeviceRequest
) {
  return request<RelayWorkspaceSession>(relayUrl, "/api/relay/revoke-device", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function postRelayEvents(relayUrl: string, input: RelayPostEventsRequest) {
  return request<RelayPostEventsResponse>(relayUrl, "/api/relay/events", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function getRelayEvents(
  relayUrl: string,
  input: {
    workspaceId: string;
    deviceId: string;
    afterSequence?: number;
  }
) {
  const query = new URLSearchParams({
    workspaceId: input.workspaceId,
    deviceId: input.deviceId
  });
  if (typeof input.afterSequence === "number" && Number.isFinite(input.afterSequence)) {
    query.set("afterSequence", String(Math.max(0, Math.floor(input.afterSequence))));
  }

  return request<RelayGetEventsResponse>(relayUrl, `/api/relay/events?${query.toString()}`, {
    method: "GET"
  });
}

export async function postRelaySnapshot(relayUrl: string, input: RelayPostSnapshotRequest) {
  return request<RelayLatestSnapshotResponse>(relayUrl, "/api/relay/snapshots", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function getRelayLatestSnapshot(
  relayUrl: string,
  input: {
    workspaceId: string;
    deviceId: string;
  }
) {
  const query = new URLSearchParams({
    workspaceId: input.workspaceId,
    deviceId: input.deviceId
  });

  return request<RelayLatestSnapshotResponse>(
    relayUrl,
    `/api/relay/snapshots/latest?${query.toString()}`,
    {
      method: "GET"
    }
  );
}

async function request<T>(
  relayUrl: string,
  path: string,
  init: RequestInit
): Promise<T> {
  const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
  let response: Response;

  try {
    response = await fetch(`${normalizedRelayUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {})
      }
    });
  } catch {
    throw new Error(
      `Unable to reach relay at ${normalizedRelayUrl}. Make sure it is running, updated, and reachable over Tailscale from this device.`
    );
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Relay request failed with ${response.status}.`);
  }

  return (await response.json()) as T;
}

export function normalizeRelayUrl(value: string) {
  return value.trim().replace(/\/+$/u, "");
}
