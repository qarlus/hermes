import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  RelayApproveDeviceRequest,
  RelayConnectRequest,
  RelayEncryptedEventEnvelope,
  RelayEncryptedSnapshotEnvelope,
  RelayGetEventsResponse,
  RelayHealthResponse,
  RelayInspectRequest,
  RelayLatestSnapshotResponse,
  RelayPostEventsRequest,
  RelayPostEventsResponse,
  RelayPostSnapshotRequest,
  RelayRevokeDeviceRequest,
  RelayWorkspaceDeviceRecord,
  RelayWorkspaceKeyWrapRecord,
  RelayWorkspaceRecord,
  RelayWorkspaceSession
} from "@hermes/sync";

type RelayStore = {
  relayId: string;
  version: 2;
  createdAt: string;
  workspaces: RelayWorkspaceInternalRecord[];
};

type RelayWorkspaceInternalRecord = RelayWorkspaceRecord & {
  adminToken: string;
  workspaceKeyWraps: RelayWorkspaceKeyWrapRecord[];
  events: RelayEncryptedEventEnvelope[];
  snapshots: RelayEncryptedSnapshotEnvelope[];
};

const RELAY_VERSION = "0.2.0";
const DEFAULT_HOST = process.env.HERMES_RELAY_HOST ?? "127.0.0.1";
const DEFAULT_PORT = Number.parseInt(process.env.HERMES_RELAY_PORT ?? "8787", 10);
const DEFAULT_DATA_PATH = resolve(process.cwd(), process.env.HERMES_RELAY_DATA ?? "./data/relay.json");

export async function createHermesRelayStore(dataPath = DEFAULT_DATA_PATH) {
  return new HermesRelayStore(dataPath);
}

export async function startHermesRelay(options?: {
  host?: string;
  port?: number;
  dataPath?: string;
}) {
  const host = options?.host ?? DEFAULT_HOST;
  const port = options?.port ?? DEFAULT_PORT;
  const store = await createHermesRelayStore(options?.dataPath);

  const server = createServer(async (request, response) => {
    try {
      await handleRequest(request, response, store);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.listen(port, host, () => resolvePromise());
    server.on("error", reject);
  });

  return {
    host,
    port,
    close: () =>
      new Promise<void>((resolvePromise, reject) => {
        server.close((error) => (error ? reject(error) : resolvePromise()));
      })
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  store: HermesRelayStore
) {
  if (request.method === "OPTIONS") {
    sendEmpty(response, 204);
    return;
  }

  const url = new URL(request.url ?? "/", buildRelayUrl(request));

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, await store.health());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/relay/connect") {
    const payload = await readJson<RelayConnectRequest>(request);
    sendJson(response, 200, await store.connectWorkspace(payload, buildRelayUrl(request)));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/relay/inspect") {
    const payload = await readJson<RelayInspectRequest>(request);
    sendJson(response, 200, await store.inspectWorkspace(payload, buildRelayUrl(request)));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/relay/approve-device") {
    const payload = await readJson<RelayApproveDeviceRequest>(request);
    sendJson(response, 200, await store.approveDevice(payload, buildRelayUrl(request)));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/relay/revoke-device") {
    const payload = await readJson<RelayRevokeDeviceRequest>(request);
    sendJson(response, 200, await store.revokeDevice(payload, buildRelayUrl(request)));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/relay/events") {
    const payload = await readJson<RelayPostEventsRequest>(request);
    sendJson(response, 200, await store.postEvents(payload));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/relay/events") {
    sendJson(response, 200, await store.getEvents({
      workspaceId: url.searchParams.get("workspaceId") ?? "",
      deviceId: url.searchParams.get("deviceId") ?? "",
      afterSequence: Number.parseInt(url.searchParams.get("afterSequence") ?? "0", 10)
    }));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/relay/snapshots") {
    const payload = await readJson<RelayPostSnapshotRequest>(request);
    sendJson(response, 200, await store.postSnapshot(payload));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/relay/snapshots/latest") {
    sendJson(response, 200, await store.getLatestSnapshot({
      workspaceId: url.searchParams.get("workspaceId") ?? "",
      deviceId: url.searchParams.get("deviceId") ?? ""
    }));
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

class HermesRelayStore {
  constructor(private readonly dataPath: string) {}

  async health(): Promise<RelayHealthResponse> {
    const store = await this.load();
    return {
      status: "ok",
      service: "hermes-relay",
      version: RELAY_VERSION,
      relayId: store.relayId,
      serverTime: new Date().toISOString()
    };
  }

  async connectWorkspace(input: RelayConnectRequest, relayUrl: string): Promise<RelayWorkspaceSession> {
    const deviceName = input.deviceName.trim();
    if (!deviceName) {
      throw new Error("Device name is required.");
    }

    const store = await this.load();
    const timestamp = new Date().toISOString();
    const bootstrap = input.workspaceBootstrap ?? null;
    let workspace = store.workspaces[0];

    if (bootstrap) {
      const workspaceName = bootstrap.workspaceName.trim();
      if (!workspaceName) {
        throw new Error("Workspace name is required.");
      }

      if (!workspace) {
        workspace = {
          id: bootstrap.workspaceId,
          name: workspaceName,
          createdAt: timestamp,
          masterDeviceId: input.deviceId,
          adminToken: randomSecret(),
          workspaceKeyWraps: [bootstrap.wrappedWorkspaceKey],
          events: [],
          snapshots: [],
          devices: [
            {
              id: input.deviceId,
              name: deviceName,
              platform: input.devicePlatform,
              role: "master",
              status: "approved",
              linkedAt: timestamp,
              approvedAt: timestamp,
              lastSeenAt: timestamp,
              revokedAt: null,
              publicKeys: input.publicKeys
            }
          ]
        };
        store.workspaces.push(workspace);
        await this.save(store);
        return this.buildSession(
          store.relayId,
          workspace,
          input.deviceId,
          relayUrl,
          workspace.adminToken
        );
      }

      if (workspace.id !== bootstrap.workspaceId) {
        throw new Error("This relay already belongs to a different workspace.");
      }

      this.upsertWorkspaceKeyWrap(workspace, bootstrap.wrappedWorkspaceKey);
    }

    if (!workspace) {
      throw new Error("Relay workspace has not been initialized by a master device yet.");
    }

    const existingDevice = workspace.devices.find((candidate) => candidate.id === input.deviceId);
    if (existingDevice?.status === "revoked" || existingDevice?.revokedAt) {
      throw new Error("This device has been revoked from the relay.");
    }

    if (!existingDevice) {
      const role = workspace.masterDeviceId === input.deviceId ? "master" : null;
      const status = role === "master" ? "approved" : "pending";
      const approvedAt = role === "master" ? timestamp : null;

      workspace.devices.push({
        id: input.deviceId,
        name: deviceName,
        platform: input.devicePlatform,
        role,
        status,
        linkedAt: timestamp,
        approvedAt,
        lastSeenAt: timestamp,
        revokedAt: null,
        publicKeys: input.publicKeys
      });
    } else {
      existingDevice.name = deviceName;
      existingDevice.platform = input.devicePlatform;
      existingDevice.lastSeenAt = timestamp;
      existingDevice.publicKeys = input.publicKeys;
      if (existingDevice.id === workspace.masterDeviceId) {
        existingDevice.role = "master";
        existingDevice.status = "approved";
        existingDevice.approvedAt ??= timestamp;
      }
    }

    await this.save(store);
    return this.buildSession(store.relayId, workspace, input.deviceId, relayUrl, null);
  }

  async inspectWorkspace(
    input: RelayInspectRequest,
    relayUrl: string
  ): Promise<RelayWorkspaceSession> {
    const store = await this.load();
    const workspace = store.workspaces.find((candidate) => candidate.id === input.workspaceId);
    if (!workspace) {
      throw new Error("Relay workspace not found.");
    }

    const device = workspace.devices.find((candidate) => candidate.id === input.deviceId);
    if (!device || device.status === "revoked" || device.revokedAt) {
      throw new Error("Relay device not found.");
    }

    device.lastSeenAt = new Date().toISOString();
    await this.save(store);
    return this.buildSession(
      store.relayId,
      workspace,
      device.id,
      relayUrl,
      input.adminToken?.trim() === workspace.adminToken && device.role === "master"
        ? workspace.adminToken
        : null
    );
  }

  async approveDevice(
    input: RelayApproveDeviceRequest,
    relayUrl: string
  ): Promise<RelayWorkspaceSession> {
    const store = await this.load();
    const workspace = store.workspaces.find((candidate) => candidate.id === input.workspaceId);
    if (!workspace) {
      throw new Error("Relay workspace not found.");
    }
    if (workspace.adminToken !== input.adminToken.trim()) {
      throw new Error("Admin token is invalid.");
    }

    const device = workspace.devices.find((candidate) => candidate.id === input.pendingDeviceId);
    if (!device) {
      throw new Error("Pending relay device not found.");
    }
    if (device.status === "revoked" || device.revokedAt) {
      throw new Error("This device has already been revoked.");
    }

    if (input.wrappedWorkspaceKey.recipientDeviceId !== device.id) {
      throw new Error("Wrapped workspace key recipient does not match the pending device.");
    }

    const timestamp = new Date().toISOString();
    device.status = "approved";
    device.role = device.id === workspace.masterDeviceId ? "master" : "member";
    device.approvedAt ??= timestamp;
    device.lastSeenAt = timestamp;
    this.upsertWorkspaceKeyWrap(workspace, input.wrappedWorkspaceKey);

    await this.save(store);
    return this.buildSession(store.relayId, workspace, workspace.masterDeviceId, relayUrl, workspace.adminToken);
  }

  async revokeDevice(
    input: RelayRevokeDeviceRequest,
    relayUrl: string
  ): Promise<RelayWorkspaceSession> {
    const store = await this.load();
    const workspace = store.workspaces.find((candidate) => candidate.id === input.workspaceId);
    if (!workspace) {
      throw new Error("Relay workspace not found.");
    }
    if (workspace.adminToken !== input.adminToken.trim()) {
      throw new Error("Admin token is invalid.");
    }
    if (workspace.masterDeviceId === input.deviceId) {
      throw new Error("The master device cannot be revoked in this relay version.");
    }

    const device = workspace.devices.find((candidate) => candidate.id === input.deviceId);
    if (!device) {
      throw new Error("Relay device not found.");
    }
    if (device.status !== "approved") {
      throw new Error("Only approved relay devices can be revoked.");
    }

    const remainingApprovedDevices = workspace.devices.filter(
      (candidate) =>
        candidate.id !== input.deviceId &&
        candidate.status === "approved" &&
        candidate.revokedAt === null
    );
    const expectedRecipientIds = new Set(remainingApprovedDevices.map((candidate) => candidate.id));
    const replacementRecipientIds = new Set(
      input.replacementWorkspaceKeyWraps.map((wrap) => wrap.recipientDeviceId)
    );
    if (expectedRecipientIds.size !== replacementRecipientIds.size) {
      throw new Error("Replacement workspace key wraps are incomplete for remaining approved devices.");
    }
    for (const recipientId of expectedRecipientIds) {
      if (!replacementRecipientIds.has(recipientId)) {
        throw new Error("Replacement workspace key wraps are incomplete for remaining approved devices.");
      }
    }
    for (const wrap of input.replacementWorkspaceKeyWraps) {
      if (!expectedRecipientIds.has(wrap.recipientDeviceId)) {
        throw new Error("Replacement workspace key wraps contain an unexpected recipient.");
      }
    }

    device.status = "revoked";
    device.role = null;
    device.revokedAt = new Date().toISOString();
    workspace.workspaceKeyWraps = [...input.replacementWorkspaceKeyWraps];

    await this.save(store);
    return this.buildSession(store.relayId, workspace, workspace.masterDeviceId, relayUrl, workspace.adminToken);
  }

  async postEvents(input: RelayPostEventsRequest): Promise<RelayPostEventsResponse> {
    const store = await this.load();
    const workspace = this.findWorkspace(store, input.workspaceId);
    this.requireApprovedDevice(workspace, input.deviceId);

    if (!Array.isArray(input.events) || input.events.length === 0) {
      throw new Error("At least one encrypted relay event is required.");
    }

    let nextSequence =
      workspace.events.reduce((max, event) => Math.max(max, event.sequence), 0) + 1;

    for (const event of input.events) {
      if (event.workspaceId !== workspace.id) {
        throw new Error("Relay event workspace does not match the current workspace.");
      }
      if (event.authorDeviceId !== input.deviceId) {
        throw new Error("Relay event author does not match the current device.");
      }
      if (event.sequence !== nextSequence) {
        throw new Error(`Relay event sequence ${event.sequence} is invalid. Expected ${nextSequence}.`);
      }

      const author = this.requireApprovedDevice(workspace, event.authorDeviceId);
      const verified = await verify_relay_signature(
        author.publicKeys.signingPublicKey,
        relay_event_signature_payload(event),
        event.signature
      );
      if (!verified) {
        throw new Error("Relay event signature verification failed.");
      }

      workspace.events.push(event);
      nextSequence += 1;
    }

    await this.save(store);

    return {
      workspaceId: workspace.id,
      acceptedThroughSequence: nextSequence - 1,
      events: input.events
    };
  }

  async getEvents(input: {
    workspaceId: string;
    deviceId: string;
    afterSequence?: number;
  }): Promise<RelayGetEventsResponse> {
    const store = await this.load();
    const workspace = this.findWorkspace(store, input.workspaceId);
    this.requireApprovedDevice(workspace, input.deviceId);
    const afterSequence = Number.isFinite(input.afterSequence) ? Math.max(0, input.afterSequence ?? 0) : 0;
    const latestSequence = workspace.events.reduce((max, event) => Math.max(max, event.sequence), 0);

    return {
      workspaceId: workspace.id,
      latestSequence,
      events: workspace.events.filter((event) => event.sequence > afterSequence)
    };
  }

  async postSnapshot(input: RelayPostSnapshotRequest): Promise<RelayLatestSnapshotResponse> {
    const store = await this.load();
    const workspace = this.findWorkspace(store, input.workspaceId);
    const author = this.requireApprovedDevice(workspace, input.deviceId);
    const snapshot = input.snapshot;

    if (snapshot.workspaceId !== workspace.id) {
      throw new Error("Relay snapshot workspace does not match the current workspace.");
    }
    if (snapshot.authorDeviceId !== input.deviceId) {
      throw new Error("Relay snapshot author does not match the current device.");
    }

    const latestSequence = workspace.events.reduce((max, event) => Math.max(max, event.sequence), 0);
    if (snapshot.baseSequence > latestSequence) {
      throw new Error("Relay snapshot base sequence is ahead of the accepted event log.");
    }

    const verified = await verify_relay_signature(
      author.publicKeys.signingPublicKey,
      relay_snapshot_signature_payload(snapshot),
      snapshot.signature
    );
    if (!verified) {
      throw new Error("Relay snapshot signature verification failed.");
    }

    const existingIndex = workspace.snapshots.findIndex(
      (candidate) => candidate.snapshotId === snapshot.snapshotId
    );
    if (existingIndex >= 0) {
      workspace.snapshots.splice(existingIndex, 1, snapshot);
    } else {
      workspace.snapshots.push(snapshot);
    }
    workspace.snapshots.sort((left, right) => right.baseSequence - left.baseSequence);

    await this.save(store);

    return {
      workspaceId: workspace.id,
      latestSequence,
      snapshot
    };
  }

  async getLatestSnapshot(input: {
    workspaceId: string;
    deviceId: string;
  }): Promise<RelayLatestSnapshotResponse> {
    const store = await this.load();
    const workspace = this.findWorkspace(store, input.workspaceId);
    this.requireApprovedDevice(workspace, input.deviceId);
    const latestSequence = workspace.events.reduce((max, event) => Math.max(max, event.sequence), 0);
    const snapshot = workspace.snapshots[0] ?? null;

    return {
      workspaceId: workspace.id,
      latestSequence,
      snapshot
    };
  }

  private upsertWorkspaceKeyWrap(
    workspace: RelayWorkspaceInternalRecord,
    wrap: RelayWorkspaceKeyWrapRecord
  ) {
    const existingIndex = workspace.workspaceKeyWraps.findIndex(
      (candidate) => candidate.recipientDeviceId === wrap.recipientDeviceId
    );
    if (existingIndex >= 0) {
      workspace.workspaceKeyWraps.splice(existingIndex, 1, wrap);
    } else {
      workspace.workspaceKeyWraps.push(wrap);
    }
  }

  private buildSession(
    relayId: string,
    workspace: RelayWorkspaceInternalRecord,
    currentDeviceId: string,
    relayUrl: string,
    adminToken: string | null
  ): RelayWorkspaceSession {
    const currentDevice = workspace.devices.find((device) => device.id === currentDeviceId);
    if (!currentDevice) {
      throw new Error("Current device is not part of the relay workspace.");
    }

    const wrappedWorkspaceKey =
      currentDevice.status === "approved"
        ? workspace.workspaceKeyWraps.find((wrap) => wrap.recipientDeviceId === currentDevice.id) ?? null
        : null;

    return {
      relayUrl,
      relayId,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        createdAt: workspace.createdAt,
        masterDeviceId: workspace.masterDeviceId,
        devices: workspace.devices
      },
      currentDeviceId,
      currentDeviceRole: currentDevice.role,
      currentDeviceStatus: currentDevice.status,
      wrappedWorkspaceKey,
      adminToken,
      latestSequence: workspace.events.reduce((max, event) => Math.max(max, event.sequence), 0),
      latestSnapshotId: workspace.snapshots[0]?.snapshotId ?? null,
      latestSnapshotAt: workspace.snapshots[0]?.createdAt ?? null
    };
  }

  private findWorkspace(store: RelayStore, workspaceId: string) {
    const workspace = store.workspaces.find((candidate) => candidate.id === workspaceId);
    if (!workspace) {
      throw new Error("Relay workspace not found.");
    }
    return workspace;
  }

  private requireApprovedDevice(
    workspace: RelayWorkspaceInternalRecord,
    deviceId: string
  ): RelayWorkspaceDeviceRecord {
    const device = workspace.devices.find((candidate) => candidate.id === deviceId);
    if (!device || device.status !== "approved" || device.revokedAt) {
      throw new Error("Relay device is not approved for this workspace.");
    }
    return device;
  }

  private async load() {
    try {
      const raw = await readFile(this.dataPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<RelayStore>;
      if (!Array.isArray(parsed.workspaces)) {
        throw new Error("Invalid relay store.");
      }

      return {
        relayId: typeof parsed.relayId === "string" ? parsed.relayId : randomId(),
        version: 2 as const,
        createdAt:
          typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
        workspaces: parsed.workspaces.map((workspace) => ({
          ...workspace,
          workspaceKeyWraps: Array.isArray(workspace.workspaceKeyWraps)
            ? workspace.workspaceKeyWraps
            : [],
          events: Array.isArray(workspace.events) ? workspace.events : [],
          snapshots: Array.isArray(workspace.snapshots)
            ? [...workspace.snapshots].sort((left, right) => right.baseSequence - left.baseSequence)
            : [],
          devices: Array.isArray(workspace.devices)
            ? workspace.devices.map((device) => ({
                ...device,
                role:
                  device.role === "master" || device.role === "member" ? device.role : null,
                status:
                  device.status === "pending" ||
                  device.status === "approved" ||
                  device.status === "revoked"
                    ? device.status
                    : device.revokedAt
                      ? "revoked"
                      : device.role
                        ? "approved"
                        : "pending",
                approvedAt:
                  typeof device.approvedAt === "string" || device.approvedAt === null
                    ? device.approvedAt
                    : device.role
                      ? device.linkedAt
                      : null,
                publicKeys: device.publicKeys ?? {
                  encryptionPublicKey: "",
                  signingPublicKey: "",
                  encoding: "base64"
                }
              }))
            : []
        }))
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return this.emptyStore();
      }
      throw error;
    }
  }

  private async save(store: RelayStore) {
    await mkdir(dirname(this.dataPath), { recursive: true });
    await writeFile(this.dataPath, JSON.stringify(store, null, 2), "utf8");
  }

  private emptyStore(): RelayStore {
    return {
      relayId: randomId(),
      version: 2,
      createdAt: new Date().toISOString(),
      workspaces: []
    };
  }
}

function relay_event_signature_payload(event: RelayEncryptedEventEnvelope) {
  return `relay-event|1|${event.workspaceId}|${event.eventId}|${event.authorDeviceId}|${event.sequence}|${event.ciphertext}|${event.nonce}|${event.aad}|${event.createdAt}`;
}

function relay_snapshot_signature_payload(snapshot: RelayEncryptedSnapshotEnvelope) {
  return `relay-snapshot|1|${snapshot.workspaceId}|${snapshot.snapshotId}|${snapshot.authorDeviceId}|${snapshot.baseSequence}|${snapshot.ciphertext}|${snapshot.nonce}|${snapshot.aad}|${snapshot.createdAt}`;
}

async function verify_relay_signature(
  signingPublicKey: string,
  payload: string,
  signature: string
) {
  const publicKeyBytes = Buffer.from(signingPublicKey, "base64");
  const signatureBytes = Buffer.from(signature, "base64");
  const key = await crypto.subtle.importKey(
    "raw",
    publicKeyBytes,
    {
      name: "Ed25519"
    },
    false,
    ["verify"]
  );

  return crypto.subtle.verify(
    {
      name: "Ed25519"
    },
    key,
    signatureBytes,
    new TextEncoder().encode(payload)
  );
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    throw new Error("Request body is required.");
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function sendJson(
  response: ServerResponse<IncomingMessage>,
  status: number,
  body: unknown
) {
  response.writeHead(status, {
    ...corsHeaders(),
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

function sendEmpty(response: ServerResponse<IncomingMessage>, status: number) {
  response.writeHead(status, corsHeaders());
  response.end();
}

function buildRelayUrl(request: IncomingMessage) {
  const protocol = request.headers["x-forwarded-proto"] ?? "http";
  const host = request.headers.host ?? `${DEFAULT_HOST}:${DEFAULT_PORT}`;
  return `${protocol}://${host}`;
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  };
}

function randomId() {
  return crypto.randomUUID();
}

function randomSecret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function isMainModule() {
  if (!process.argv[1]) {
    return false;
  }

  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  void startHermesRelay()
    .then(({ host, port }) => {
      console.log(`Hermes Relay listening on ${host}:${port}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
