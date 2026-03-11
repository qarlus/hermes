import type {
  RelayBootstrapRequest,
  RelayHealthResponse,
  RelayInspectRequest,
  RelayJoinRequest,
  RelayRevokeDeviceRequest,
  RelayWorkspaceSession
} from "@hermes/sync";

export async function getRelayHealth(relayUrl: string) {
  return request<RelayHealthResponse>(relayUrl, "/health", {
    method: "GET"
  });
}

export async function bootstrapRelayWorkspace(
  relayUrl: string,
  input: RelayBootstrapRequest
) {
  return request<RelayWorkspaceSession>(relayUrl, "/api/relay/bootstrap", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function joinRelayWorkspace(relayUrl: string, input: RelayJoinRequest) {
  return request<RelayWorkspaceSession>(relayUrl, "/api/relay/join", {
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

export async function revokeRelayDevice(
  relayUrl: string,
  input: RelayRevokeDeviceRequest
) {
  return request<RelayWorkspaceSession>(relayUrl, "/api/relay/revoke-device", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

async function request<T>(
  relayUrl: string,
  path: string,
  init: RequestInit
): Promise<T> {
  const response = await fetch(`${normalizeRelayUrl(relayUrl)}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Relay request failed with ${response.status}.`);
  }

  return (await response.json()) as T;
}

export function normalizeRelayUrl(value: string) {
  return value.trim().replace(/\/+$/u, "");
}
