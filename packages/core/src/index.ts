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
  isFavorite: boolean;
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
  isFavorite: boolean;
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
  cwd: string | null;
}

export interface ConnectSessionInput {
  serverId: string;
  tmuxSession?: string;
}

export interface ConnectLocalSessionInput {
  cwd?: string;
  label?: string;
}

export type FileBrowserTargetKind = "local" | "server";
export type FileBrowserEntryKind = "directory" | "file" | "symlink" | "other";
export type FileTransferOperation = "copy" | "move";

export interface FileBrowserTarget {
  kind: FileBrowserTargetKind;
  serverId?: string;
  path?: string | null;
}

export interface FileBrowserEntryRecord {
  name: string;
  path: string;
  kind: FileBrowserEntryKind;
  size: number | null;
  modifiedAt: string | null;
  hidden: boolean;
}

export interface FileBrowserDirectoryRecord {
  target: FileBrowserTarget;
  title: string;
  parentPath: string | null;
  entries: FileBrowserEntryRecord[];
  canWrite: boolean;
}

export interface FilePreviewRecord {
  target: FileBrowserTarget;
  name: string;
  size: number | null;
  encoding: "text" | "base64";
  content: string;
  binary: boolean;
  truncated: boolean;
}

export interface TerminalCommandRecord {
  id: string;
  name: string;
  command: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTerminalCommandInput {
  name: string;
  command: string;
}

export type CliToolUpdateState =
  | "checking"
  | "upToDate"
  | "updateAvailable"
  | "notInstalled"
  | "unavailable";

export interface CliToolUpdateRecord {
  id: string;
  name: string;
  description: string;
  installed: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  state: CliToolUpdateState;
  canRunUpdate: boolean;
  actionLabel: string;
  message: string;
}

export interface CreateLocalSshKeyInput {
  name: string;
  directory: string;
  fileName: string;
  passphrase: string;
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

export interface SessionStatusSnapshot {
  sessionId: string;
  status: TerminalTab["status"];
}

export interface TmuxSessionRecord {
  name: string;
}

export type GitFileChangeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "conflicted";

export interface GitFileChangeRecord {
  path: string;
  previousPath: string | null;
  status: GitFileChangeStatus;
  staged: boolean;
}

export interface GitCommitRecord {
  id: string;
  summary: string;
  author: string;
  relativeDate: string;
}

export interface GitBranchRecord {
  name: string;
  current: boolean;
  upstream: string | null;
}

export interface GitRemoteRecord {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface GitReviewRecord {
  baseBranch: string;
  commitCount: number;
  changedFiles: number;
}

export interface GitRepositoryRecord {
  rootPath: string;
  name: string;
  branch: string;
  upstream: string | null;
  hasRemote: boolean;
  remoteName: string | null;
  remotes: GitRemoteRecord[];
  ahead: number;
  behind: number;
  stagedCount: number;
  changedCount: number;
  untrackedCount: number;
  conflictedCount: number;
  clean: boolean;
  lastCommitSummary: string | null;
  lastCommitRelative: string | null;
  defaultBase: string | null;
  branches: GitBranchRecord[];
  recentCommits: GitCommitRecord[];
  changes: GitFileChangeRecord[];
  review: GitReviewRecord | null;
}

export interface GitHubAuthSession {
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface GitHubDeviceFlowRecord {
  verificationUri: string;
  userCode: string;
  expiresIn: number;
  interval: number;
}

export interface GitHubRepositoryRecord {
  id: string;
  name: string;
  fullName: string;
  ownerLogin: string;
  ownerType: string;
  description: string;
  private: boolean;
  stargazerCount: number;
  language: string | null;
  updatedAt: string;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
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
  isFavorite: false,
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
