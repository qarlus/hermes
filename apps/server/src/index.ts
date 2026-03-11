import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  RelayBootstrapRequest,
  RelayConnectRequest,
  RelayHealthResponse,
  RelayInspectRequest,
  RelayJoinRequest,
  RelayRevokeDeviceRequest,
  RelayWorkspaceDeviceRecord,
  RelayWorkspaceRecord,
  RelayWorkspaceSession
} from "@hermes/sync";

type RelayStore = {
  relayId: string;
  version: 1;
  createdAt: string;
  workspaces: RelayWorkspaceInternalRecord[];
};

type RelayWorkspaceInternalRecord = RelayWorkspaceRecord & {
  adminToken: string;
};

const RELAY_VERSION = "0.1.0";
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
    const health = await store.health();
    sendJson(response, 200, health);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/relay/bootstrap") {
    const payload = await readJson<RelayBootstrapRequest>(request);
    const session = await store.bootstrapWorkspace(payload, buildRelayUrl(request));
    sendJson(response, 200, session);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/relay/connect") {
    const payload = await readJson<RelayConnectRequest>(request);
    const session = await store.connectWorkspace(payload, buildRelayUrl(request));
    sendJson(response, 200, session);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/relay/join") {
    const payload = await readJson<RelayJoinRequest>(request);
    const session = await store.joinWorkspace(payload, buildRelayUrl(request));
    sendJson(response, 200, session);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/relay/inspect") {
    const payload = await readJson<RelayInspectRequest>(request);
    const session = await store.inspectWorkspace(payload, buildRelayUrl(request));
    sendJson(response, 200, session);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/relay/revoke-device") {
    const payload = await readJson<RelayRevokeDeviceRequest>(request);
    const session = await store.revokeDevice(payload, buildRelayUrl(request));
    sendJson(response, 200, session);
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

  async bootstrapWorkspace(
    input: RelayBootstrapRequest,
    relayUrl: string
  ): Promise<RelayWorkspaceSession> {
    const workspaceName = input.workspaceName.trim();
    const deviceName = input.deviceName.trim();
    if (!workspaceName) {
      throw new Error("Workspace name is required.");
    }
    if (!deviceName) {
      throw new Error("Device name is required.");
    }

    const store = await this.load();
    const duplicate = store.workspaces.find(
      (workspace) => workspace.name.toLowerCase() === workspaceName.toLowerCase()
    );
    if (duplicate) {
      throw new Error("A relay workspace with that name already exists.");
    }

    const timestamp = new Date().toISOString();
    const masterDeviceId = randomId();
    const workspace: RelayWorkspaceInternalRecord = {
      id: randomId(),
      name: workspaceName,
      createdAt: timestamp,
      adminToken: randomSecret(),
      masterDeviceId,
      devices: [
        {
          id: masterDeviceId,
          name: deviceName,
          platform: input.devicePlatform,
          role: "master",
          linkedAt: timestamp,
          lastSeenAt: timestamp,
          revokedAt: null
        }
      ]
    };

    store.workspaces.push(workspace);
    await this.save(store);

    return this.buildSession(store.relayId, workspace, masterDeviceId, relayUrl, workspace.adminToken);
  }

  async connectWorkspace(input: RelayConnectRequest, relayUrl: string): Promise<RelayWorkspaceSession> {
    const deviceName = input.deviceName.trim();
    if (!deviceName) {
      throw new Error("Device name is required.");
    }

    const store = await this.load();
    const timestamp = new Date().toISOString();
    let workspace = store.workspaces[0];

    if (!workspace) {
      workspace = {
        id: randomId(),
        name: "Hermes",
        createdAt: timestamp,
        adminToken: randomSecret(),
        masterDeviceId: input.deviceId,
        devices: []
      };
      store.workspaces.push(workspace);
    }

    const existingDevice = workspace.devices.find((candidate) => candidate.id === input.deviceId);
    if (existingDevice?.revokedAt) {
      throw new Error("This device has been revoked from the relay.");
    }

    const currentDevice =
      existingDevice ??
      ({
        id: input.deviceId,
        name: deviceName,
        platform: input.devicePlatform,
        role: workspace.masterDeviceId === input.deviceId ? "master" : "member",
        linkedAt: timestamp,
        lastSeenAt: timestamp,
        revokedAt: null
      } satisfies RelayWorkspaceDeviceRecord);

    if (!existingDevice) {
      if (workspace.devices.length === 0) {
        currentDevice.role = "master";
        workspace.masterDeviceId = input.deviceId;
      }
      workspace.devices.push(currentDevice);
    } else {
      existingDevice.name = deviceName;
      existingDevice.platform = input.devicePlatform;
      existingDevice.lastSeenAt = timestamp;
      existingDevice.role = workspace.masterDeviceId === input.deviceId ? "master" : "member";
    }

    const deviceForSession =
      workspace.devices.find((candidate) => candidate.id === input.deviceId) ?? currentDevice;
    deviceForSession.lastSeenAt = timestamp;

    await this.save(store);

    return this.buildSession(
      store.relayId,
      workspace,
      deviceForSession.id,
      relayUrl,
      deviceForSession.role === "master" ? workspace.adminToken : null
    );
  }

  async joinWorkspace(input: RelayJoinRequest, relayUrl: string): Promise<RelayWorkspaceSession> {
    const deviceName = input.deviceName.trim();
    if (!deviceName) {
      throw new Error("Device name is required.");
    }

    const store = await this.load();
    const workspace = store.workspaces.find((candidate) => candidate.id === input.workspaceId);
    if (!workspace) {
      throw new Error("Relay workspace not found.");
    }
    if (workspace.adminToken !== input.adminToken.trim()) {
      throw new Error("Admin token is invalid.");
    }

    const timestamp = new Date().toISOString();
    const device: RelayWorkspaceDeviceRecord = {
      id: randomId(),
      name: deviceName,
      platform: input.devicePlatform,
      role: "member",
      linkedAt: timestamp,
      lastSeenAt: timestamp,
      revokedAt: null
    };

    workspace.devices.push(device);
    await this.save(store);

    return this.buildSession(store.relayId, workspace, device.id, relayUrl, null);
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

    const device = workspace.devices.find(
      (candidate) => candidate.id === input.deviceId && candidate.revokedAt === null
    );
    if (!device) {
      throw new Error("Relay device not found.");
    }

    const isAdmin = input.adminToken?.trim() === workspace.adminToken;
    device.lastSeenAt = new Date().toISOString();
    await this.save(store);

    return this.buildSession(
      store.relayId,
      workspace,
      device.id,
      relayUrl,
      isAdmin ? workspace.adminToken : null
    );
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
      throw new Error("The master device cannot be revoked in this v1 relay.");
    }

    const device = workspace.devices.find((candidate) => candidate.id === input.deviceId);
    if (!device) {
      throw new Error("Relay device not found.");
    }

    device.revokedAt = new Date().toISOString();
    await this.save(store);

    return this.buildSession(
      store.relayId,
      workspace,
      workspace.masterDeviceId,
      relayUrl,
      workspace.adminToken
    );
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
      adminToken
    };
  }

  private async load() {
    try {
      const raw = await readFile(this.dataPath, "utf8");
      const parsed = JSON.parse(raw) as RelayStore;
      if (!Array.isArray(parsed.workspaces)) {
        throw new Error("Invalid relay store.");
      }
      return parsed;
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
      version: 1,
      createdAt: new Date().toISOString(),
      workspaces: []
    };
  }
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
