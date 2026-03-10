import { invoke } from "@tauri-apps/api/core";
import type {
  CliToolUpdateRecord,
  ConnectLocalSessionInput,
  ConnectSessionInput,
  FileBrowserDirectoryRecord,
  FileBrowserTarget,
  FilePreviewRecord,
  FileTransferOperation,
  CreateTerminalCommandInput,
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
  TerminalCommandRecord,
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

export const readFileDirectory = (target: FileBrowserTarget) =>
  invoke<FileBrowserDirectoryRecord>("read_file_directory", { target });

export const readFilePreview = (target: FileBrowserTarget) =>
  invoke<FilePreviewRecord>("read_file_preview", { target });

export const createFileDirectory = (target: FileBrowserTarget, name: string) =>
  invoke<FileBrowserDirectoryRecord>("create_file_directory", { target, name });

export const deleteFileEntries = (targets: FileBrowserTarget[]) =>
  invoke<void>("delete_file_entries", { targets });

export const transferFileEntries = (
  sources: FileBrowserTarget[],
  destination: FileBrowserTarget,
  operation: FileTransferOperation
) =>
  invoke<FileBrowserDirectoryRecord>("transfer_file_entries", {
    sources,
    destination,
    operation
  });

export const writeFile = (
  parent: FileBrowserTarget,
  name: string,
  contentsBase64: string
) =>
  invoke<FileBrowserDirectoryRecord>("write_file", {
    parent,
    name,
    contentsBase64
  });

export const listTerminalCommands = () =>
  invoke<TerminalCommandRecord[]>("list_terminal_commands");

export const createTerminalCommand = (input: CreateTerminalCommandInput) =>
  invoke<TerminalCommandRecord>("create_terminal_command", { input });

export const deleteTerminalCommand = (id: string) =>
  invoke<void>("delete_terminal_command", { id });

export const inspectGitRepository = (path: string) =>
  invoke<GitRepositoryRecord>("inspect_git_repository", { path });

export const getGitRepositoryChangeDiff = (path: string, filePath: string) =>
  invoke<string>("get_git_repository_change_diff", { path, filePath });

export const cloneGitRepository = (
  cloneUrl: string,
  parentDirectory: string,
  directoryName: string
) =>
  invoke<GitRepositoryRecord>("clone_git_repository", {
    cloneUrl,
    parentDirectory,
    directoryName
  });

export const findLocalGitHubCheckouts = (repositoryFullName: string, repositoryName: string) =>
  invoke<GitRepositoryRecord[]>("find_local_github_checkouts", {
    repositoryFullName,
    repositoryName
  });

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

export const isGitHubDeviceFlowAvailable = () =>
  invoke<boolean>("is_github_device_flow_available");

export const startGitHubDeviceFlow = () =>
  invoke<GitHubDeviceFlowRecord>("start_github_device_flow");

export const pollGitHubDeviceFlow = () =>
  invoke<GitHubAuthSession | null>("poll_github_device_flow");

export const signInGitHubWithToken = (token: string) =>
  invoke<GitHubAuthSession>("sign_in_github_with_token", { token });

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
