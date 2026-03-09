export type ServerAuthKind = "default" | "sshKey" | "password";
export type KeychainItemKind = Exclude<ServerAuthKind, "default">;

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInput {
  name: string;
  description: string;
}

export interface KeychainItemRecord {
  id: string;
  name: string;
  kind: KeychainItemKind;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServerRecord {
  id: string;
  projectId: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  authKind: ServerAuthKind;
  credentialId: string | null;
  credentialName: string | null;
  tmuxSession: string;
  useTmux: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServerInput {
  projectId: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  authKind: ServerAuthKind;
  credentialId: string | null;
  credentialName: string;
  credentialSecret: string;
  tmuxSession: string;
  useTmux: boolean;
  notes: string;
}

export interface TerminalTab {
  id: string;
  serverId: string;
  title: string;
  status: "connecting" | "connected" | "closed" | "error";
  startedAt: string;
}

export interface ConnectSessionInput {
  serverId: string;
  tmuxSession?: string;
}

export interface TerminalDataEvent {
  sessionId: string;
  data: string;
}

export interface TerminalExitEvent {
  sessionId: string;
  exitCode: number | null;
  reason: string;
}

export interface TerminalStatusEvent {
  sessionId: string;
  status: TerminalTab["status"];
  message: string;
}

export interface TmuxSessionRecord {
  name: string;
}

export const defaultProjectInput = (): ProjectInput => ({
  name: "",
  description: ""
});

export const defaultServerInput = (projectId = ""): ServerInput => ({
  projectId,
  name: "",
  hostname: "",
  port: 22,
  username: "",
  authKind: "default",
  credentialId: null,
  credentialName: "",
  credentialSecret: "",
  tmuxSession: "main",
  useTmux: false,
  notes: ""
});

export const projectDisplayLabel = (project: Pick<ProjectRecord, "name">) =>
  project.name.trim() || "Untitled Workspace";

export const serverDisplayLabel = (server: Pick<ServerRecord, "name" | "hostname">) =>
  server.name.trim() || server.hostname.trim();

export const buildSshTarget = (server: Pick<ServerRecord, "hostname" | "username">) =>
  server.username.trim() ? `${server.username}@${server.hostname}` : server.hostname;
