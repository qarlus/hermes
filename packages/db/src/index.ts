import { invoke } from "@tauri-apps/api/core";
import type {
  CliToolUpdateRecord,
  ConnectLocalSessionInput,
  ConnectSessionInput,
  CreateLocalSshKeyInput,
  GitHubAuthSession,
  GitHubDeviceFlowRecord,
  GitHubRepositoryRecord,
  GitRepositoryRecord,
  KeychainItemKind,
  KeychainItemRecord,
  ProjectInput,
  ProjectRecord,
  SessionStatusSnapshot,
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

export const createKeychainItem = (input: { name: string; kind: KeychainItemKind; secret: string }) =>
  invoke<KeychainItemRecord>("create_keychain_item", { input });

export const getDefaultSshDirectory = () =>
  invoke<string | null>("get_default_ssh_directory");

export const createLocalSshKey = (input: CreateLocalSshKeyInput) =>
  invoke<KeychainItemRecord>("create_local_ssh_key", { input });

export const getKeychainPublicKey = (id: string) =>
  invoke<string>("get_keychain_public_key", { id });

export const updateKeychainItemName = (id: string, name: string) =>
  invoke<KeychainItemRecord>("update_keychain_item_name", { id, name });

export const deleteKeychainItem = (id: string) =>
  invoke<void>("delete_keychain_item", { id });

export const listTmuxSessions = (serverId: string) =>
  invoke<TmuxSessionRecord[]>("list_tmux_sessions", { serverId });

export const connectSession = (input: ConnectSessionInput) =>
  invoke<TerminalTab>("connect_session", { input });

export const connectLocalSession = (input?: ConnectLocalSessionInput) =>
  invoke<TerminalTab>("connect_local_session", input ? { input } : {});

export const inspectGitRepository = (path: string) =>
  invoke<GitRepositoryRecord>("inspect_git_repository", { path });

export const commitGitRepository = (path: string, message: string) =>
  invoke<GitRepositoryRecord>("commit_git_repository", { path, message });

export const pushGitRepository = (path: string) =>
  invoke<GitRepositoryRecord>("push_git_repository", { path });

export const createGitBranch = (path: string, name: string) =>
  invoke<GitRepositoryRecord>("create_git_branch", { path, name });

export const checkoutGitBranch = (path: string, name: string) =>
  invoke<GitRepositoryRecord>("checkout_git_branch", { path, name });

export const getGitHubSession = () =>
  invoke<GitHubAuthSession | null>("get_github_session");

export const startGitHubDeviceFlow = () =>
  invoke<GitHubDeviceFlowRecord>("start_github_device_flow");

export const pollGitHubDeviceFlow = () =>
  invoke<GitHubAuthSession | null>("poll_github_device_flow");

export const disconnectGitHub = () => invoke<void>("disconnect_github");

export const listGitHubRepositories = () =>
  invoke<GitHubRepositoryRecord[]>("list_github_repositories");

export const searchGitHubRepositories = (query: string) =>
  invoke<GitHubRepositoryRecord[]>("search_github_repositories", { query });

export const listInstalledCliTools = () =>
  invoke<CliToolUpdateRecord[]>("list_installed_cli_tools");

export const getCliToolUpdate = (toolId: string) =>
  invoke<CliToolUpdateRecord>("get_cli_tool_update", { toolId });

export const runCliToolUpdate = (toolId: string) =>
  invoke<CliToolUpdateRecord>("run_cli_tool_update", { toolId });

export const listSessionStatuses = () =>
  invoke<SessionStatusSnapshot[]>("list_session_statuses");

export const writeSession = (sessionId: string, data: string) =>
  invoke<void>("write_session", { sessionId, data });

export const resizeSession = (sessionId: string, cols: number, rows: number) =>
  invoke<void>("resize_session", { sessionId, cols, rows });

export const closeSession = (sessionId: string) =>
  invoke<void>("close_session", { sessionId });
