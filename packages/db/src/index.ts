import { invoke } from "@tauri-apps/api/core";
import type {
  ConnectSessionInput,
  KeychainItemRecord,
  ProjectInput,
  ProjectRecord,
  ServerInput,
  ServerRecord,
  TmuxSessionRecord,
  TerminalTab
} from "@hermes/core";

export const listProjects = () => invoke<ProjectRecord[]>("list_projects");

export const createProject = (input: ProjectInput) =>
  invoke<ProjectRecord>("create_project", { input });

export const updateProject = (id: string, input: ProjectInput) =>
  invoke<ProjectRecord>("update_project", { id, input });

export const deleteProject = (id: string) => invoke<void>("delete_project", { id });

export const listServers = () => invoke<ServerRecord[]>("list_servers");

export const createServer = (input: ServerInput) =>
  invoke<ServerRecord>("create_server", { input });

export const updateServer = (id: string, input: ServerInput) =>
  invoke<ServerRecord>("update_server", { id, input });

export const deleteServer = (id: string) => invoke<void>("delete_server", { id });

export const listKeychainItems = () => invoke<KeychainItemRecord[]>("list_keychain_items");

export const updateKeychainItemName = (id: string, name: string) =>
  invoke<KeychainItemRecord>("update_keychain_item_name", { id, name });

export const deleteKeychainItem = (id: string) =>
  invoke<void>("delete_keychain_item", { id });

export const listTmuxSessions = (serverId: string) =>
  invoke<TmuxSessionRecord[]>("list_tmux_sessions", { serverId });

export const connectSession = (input: ConnectSessionInput) =>
  invoke<TerminalTab>("connect_session", { input });

export const writeSession = (sessionId: string, data: string) =>
  invoke<void>("write_session", { sessionId, data });

export const resizeSession = (sessionId: string, cols: number, rows: number) =>
  invoke<void>("resize_session", { sessionId, cols, rows });

export const closeSession = (sessionId: string) =>
  invoke<void>("close_session", { sessionId });
