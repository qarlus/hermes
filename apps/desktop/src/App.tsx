import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent as ReactMouseEvent
} from "react";
import {
  ArrowClockwise,
  Copy,
  DesktopTower,
  FolderPlus,
  GearSix,
  GithubLogo,
  Key,
  MagnifyingGlass,
  MonitorPlay,
  Plus,
  TerminalWindow
} from "@phosphor-icons/react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  buildSshTarget,
  type CliToolUpdateRecord,
  type ConnectLocalSessionInput,
  type CreateTerminalCommandInput,
  type CreateLocalSshKeyInput,
  defaultProjectInput,
  defaultServerInput,
  type GitHubAuthSession,
  type GitHubDeviceFlowRecord,
  type GitHubRepositoryRecord,
  type GitRepositoryRecord,
  type KeychainItemKind,
  projectDisplayLabel,
  serverDisplayLabel,
  type KeychainItemRecord,
  type ProjectInput,
  type ProjectRecord,
  type ServerInput,
  type ServerRecord,
  type TerminalCommandRecord,
  type TerminalExitEvent,
  type TerminalStatusEvent,
  type TerminalTab,
  type TmuxSessionRecord
} from "@hermes/core";
import {
  closeSession,
  cloneGitRepository,
  commitGitRepository,
  connectSession,
  connectLocalSession,
  createRelayEncryptedEvent,
  createRelayEncryptedSnapshot,
  decryptRelayEncryptedEvent,
  checkoutGitBranch,
  createTerminalCommand,
  createGitBranch,
  createLocalSshKey,
  createKeychainItem,
  createProject,
  createServer,
  decryptRelayEncryptedSnapshot,
  deleteTerminalCommand,
  deleteKeychainItem,
  deleteProject,
  deleteServer,
  disconnectGitHub,
  getGitHubSession,
  isGitHubDeviceFlowAvailable,
  getDefaultSshDirectory,
  getLocalAccountName,
  getOrCreateRelayDeviceIdentity,
  getCliToolUpdate,
  getKeychainPublicKey,
  inspectRelayHost,
  hasRelayWorkspaceKey,
  inspectGitRepository,
  listGitHubRepositories,
  listKeychainItems,
  listInstalledCliTools,
  listProjects,
  listSyncableKeychainItems,
  listTerminalCommands,
  listSessionStatuses,
  listServers,
  listTmuxSessions,
  pollGitHubDeviceFlow,
  pushGitRepository,
  resizeSession,
  rotateRelayWorkspaceKey,
  runCliToolUpdate,
  searchGitHubRepositories,
  signInGitHubWithToken,
  startGitHubDeviceFlow,
  unwrapRelayWorkspaceKey,
  upsertSyncableKeychainItems,
  updateKeychainItemName,
  updateProject,
  updateServer,
  wrapRelayWorkspaceKeyForDevice,
  writeSession
} from "@hermes/db";
import type { RelayWorkspaceSession } from "@hermes/sync";
import { AppDialogs } from "./components/AppDialogs";
import { AppRail } from "./components/AppRail";
import { AppShell } from "./components/AppShell";
import { AppStage } from "./components/AppStage";
import type { ShellLayoutMode } from "./components/PageFrame";
import { ShellTopbar } from "./components/ShellTopbar";
import type { GitRepositoryView, GitToolbarContext } from "./features/git/GitPage";
import { RelaySetupDialog } from "./features/settings/RelaySetupDialog";
import { LocalSessionPresetEditor } from "./features/sessions/LocalSessionPresetEditor";
import { SessionNavigator } from "./features/sessions/SessionNavigator";
import { SessionLauncher } from "./features/sessions/SessionLauncher";
import { ToolUpdatesPanel } from "./features/sessions/ToolUpdatesPanel";
import {
  getErrorMessage,
  type InspectorState,
  mapServerToInput,
  normalizeProjectInput,
  normalizeServerInput,
  type ViewState
} from "./lib/app";
import { isTauriRuntime } from "./lib/runtime";
import {
  buildRelayInstallCommand,
  buildRelayUrls,
  buildHermesSyncBundle,
  detectDevicePlatform,
  getHermesTheme,
  getDefaultRelayDeviceName,
  getTerminalLaunchProfiles,
  isLocalGitRepository,
  isLocalSessionPreset,
  isSyncedTerminalHistoryRecord,
  isSyncedTmuxMetadataRecord,
  loadHermesSettings,
  loadRelayClientState,
  parseHermesSyncBundle,
  persistHermesSettings,
  persistRelayClientState,
  resolveLocalTerminalLaunch,
  sanitizeRelayClientState,
  sanitizeHermesSettings,
  type SyncedKeychainItem,
  type SyncedTerminalHistoryRecord,
  type SyncedTmuxMetadataRecord,
  type HermesSyncBundle,
  type HermesSettings,
  type LocalGitRepository,
  type LocalSessionPreset,
  type RelayClientState
} from "./lib/settings";
import {
  approveRelayDevice,
  connectRelayWorkspace,
  getRelayEvents,
  getRelayLatestSnapshot,
  getRelayHealth,
  inspectRelayWorkspace,
  postRelayEvents,
  postRelaySnapshot,
  normalizeRelayUrl,
  revokeRelayDevice
} from "./lib/relay";
import { useAppShortcuts } from "./lib/useAppShortcuts";
import { useBufferedTerminalInput } from "./lib/useBufferedTerminalInput";

const LOCAL_SESSION_PRESETS_KEY = "hermes.localSessionPresets";
const LOCAL_GIT_REPOSITORIES_KEY = "hermes.localGitRepositories";
const LOCAL_TERMINAL_COMMANDS_KEY = "hermes.terminalCommands";
const LOCAL_TMUX_METADATA_KEY = "hermes.tmuxMetadata";
const LOCAL_TERMINAL_HISTORY_KEY = "hermes.terminalHistory";
const GITHUB_OWNED_REPOSITORIES_CACHE_KEY = "hermes.githubOwnedRepositories";
const GITHUB_OWNED_REPOSITORIES_CACHE_TTL_MS = 5 * 60 * 1000;
const TOAST_DURATION_MS = 2800;
const MAX_SYNCED_HISTORY_RECORDS = 250;
const PROJECT_RUNTIME_SERVER_NOTE = "Managed from project settings.";
const EMPTY_GIT_TOOLBAR_CONTEXT: GitToolbarContext = {
  cloneUrl: null,
  shellRepositoryId: null,
  reviewRepositoryId: null,
  headerEyebrow: null,
  headerTitle: null,
  headerSubtitle: null,
  headerMeta: [],
  onBack: null
};

type GitHubOwnedRepositoriesCache = {
  login: string;
  updatedAt: number;
  repositories: GitHubRepositoryRecord[];
};

type GitRepositoryState = {
  id: string;
  snapshot: GitRepositoryRecord | null;
  error: string | null;
};

type GitHubRepositoryPane = "personal" | "orgs" | "search";

type ToastTone = "info" | "success" | "error";

type ToastRecord = {
  id: string;
  message: string;
  tone: ToastTone;
};

type SyncDomainId =
  | "settings"
  | "projects"
  | "servers"
  | "localSessionPresets"
  | "localGitRepositories"
  | "terminalCommands"
  | "keychainItems"
  | "tmuxMetadata"
  | "sessionHistory";

type SessionRuntimeMetadata = {
  targetKind: "local" | "server";
  serverRef: string | null;
  serverLabel: string | null;
  tmuxSession: string | null;
  cwd: string | null;
  title: string;
  startedAt: string;
};

type SessionsBranchBinding = {
  projectId: string;
  branchName: string;
  targetKind: "local" | "server";
  serverId: string | null;
  cwd: string | null;
  label: string | null;
};

type RelayConflictState = {
  relayUrl: string;
  remoteBundle: HermesSyncBundle;
  localBundle: HermesSyncBundle;
  mergedBundle: HermesSyncBundle;
  conflictingDomains: SyncDomainId[];
  remoteSnapshotId: string | null;
  remoteSequence: number;
  remotePayloadHash: string;
};

export function App() {
  const devicePlatform = useMemo(() => detectDevicePlatform(), []);
  const [workspaceMode, setWorkspaceMode] = useState<"home" | "terminal">("home");
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [keychainItems, setKeychainItems] = useState<KeychainItemRecord[]>([]);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [sessionsProjectId, setSessionsProjectId] = useState<string | null>(null);
  const [sessionsSelectedBranchByProject, setSessionsSelectedBranchByProject] = useState<Record<string, string>>({});
  const [sessionsBranchBindingsByTabId, setSessionsBranchBindingsByTabId] = useState<
    Record<string, SessionsBranchBinding>
  >({});
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>("dashboard");
  const [appRailCollapsed, setAppRailCollapsed] = useState(false);
  const [sessionsRailCollapsed, setSessionsRailCollapsed] = useState(false);
  const [sessionsPreviewOpen, setSessionsPreviewOpen] = useState(false);
  const [sessionsGitPanelOpen, setSessionsGitPanelOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [inspector, setInspector] = useState<InspectorState>({ kind: "hidden" });
  const [projectDraft, setProjectDraft] = useState<ProjectInput>(defaultProjectInput);
  const [serverDraft, setServerDraft] = useState<ServerInput>(defaultServerInput);
  const [tmuxSessions, setTmuxSessions] = useState<TmuxSessionRecord[]>([]);
  const [tmuxLoading, setTmuxLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creatingKeychainItem, setCreatingKeychainItem] = useState(false);
  const [creatingLocalSshKey, setCreatingLocalSshKey] = useState(false);
  const [editingKeychainItem, setEditingKeychainItem] = useState<KeychainItemRecord | null>(null);
  const [keychainNameDraft, setKeychainNameDraft] = useState("");
  const [keychainKindDraft, setKeychainKindDraft] = useState<KeychainItemKind>("sshKey");
  const [keychainSecretDraft, setKeychainSecretDraft] = useState("");
  const [localSshKeyDirectoryDraft, setLocalSshKeyDirectoryDraft] = useState("");
  const [localSshKeyFileNameDraft, setLocalSshKeyFileNameDraft] = useState("id_ed25519");
  const [localSshKeyPassphraseDraft, setLocalSshKeyPassphraseDraft] = useState("");
  const [copyingPublicKeyId, setCopyingPublicKeyId] = useState<string | null>(null);
  const [sessionLauncherOpen, setSessionLauncherOpen] = useState(false);
  const [localSessionPresets, setLocalSessionPresets] = useState<LocalSessionPreset[]>(() =>
    loadLocalSessionPresets()
  );
  const [terminalCommands, setTerminalCommands] = useState<TerminalCommandRecord[]>(() =>
    loadLocalTerminalCommands()
  );
  const [localGitRepositories, setLocalGitRepositories] = useState<LocalGitRepository[]>(() =>
    loadLocalGitRepositories()
  );
  const [tmuxMetadata, setTmuxMetadata] = useState<SyncedTmuxMetadataRecord[]>(() =>
    loadLocalTmuxMetadata()
  );
  const [sessionHistory, setSessionHistory] = useState<SyncedTerminalHistoryRecord[]>(() =>
    loadLocalTerminalHistory()
  );
  const [gitRepositoryStates, setGitRepositoryStates] = useState<GitRepositoryState[]>([]);
  const [selectedGitRepositoryId, setSelectedGitRepositoryId] = useState<string | null>(null);
  const [gitLoading, setGitLoading] = useState(false);
  const [gitBusyAction, setGitBusyAction] = useState<string | null>(null);
  const [gitCommitMessage, setGitCommitMessage] = useState("");
  const [gitBranchName, setGitBranchName] = useState("");
  const [gitHubSession, setGitHubSession] = useState<GitHubAuthSession | null>(null);
  const [gitHubDeviceFlow, setGitHubDeviceFlow] = useState<GitHubDeviceFlowRecord | null>(null);
  const [gitHubOwnedRepositories, setGitHubOwnedRepositories] = useState<GitHubRepositoryRecord[]>(() =>
    loadGitHubOwnedRepositoriesCache()?.repositories ?? []
  );
  const [gitHubPublicRepositories, setGitHubPublicRepositories] = useState<GitHubRepositoryRecord[]>([]);
  const [gitHubSearchQuery, setGitHubSearchQuery] = useState("");
  const [gitHubRepositoryPane, setGitHubRepositoryPane] = useState<GitHubRepositoryPane>("personal");
  const [gitHubLoading, setGitHubLoading] = useState(false);
  const [gitHubRepositoryLoading, setGitHubRepositoryLoading] = useState(false);
  const [gitHubSearchLoading, setGitHubSearchLoading] = useState(false);
  const [gitHubDeviceFlowAvailable, setGitHubDeviceFlowAvailable] = useState(false);
  const [gitHubSetupRequest, setGitHubSetupRequest] = useState(0);
  const [gitToolbarContext, setGitToolbarContext] = useState<GitToolbarContext>(EMPTY_GIT_TOOLBAR_CONTEXT);
  const [localSessionPresetEditorOpen, setLocalSessionPresetEditorOpen] = useState(false);
  const [localSessionPresetName, setLocalSessionPresetName] = useState("");
  const [localSessionPresetPath, setLocalSessionPresetPath] = useState("");
  const [toolUpdatesOpen, setToolUpdatesOpen] = useState(false);
  const [toolUpdatesLoading, setToolUpdatesLoading] = useState(false);
  const [toolUpdates, setToolUpdates] = useState<CliToolUpdateRecord[]>([]);
  const [toolUpdateBusyId, setToolUpdateBusyId] = useState<string | null>(null);
  const [settings, setSettings] = useState<HermesSettings>(() => loadHermesSettings(devicePlatform));
  const [relayState, setRelayState] = useState<RelayClientState>(() =>
    loadRelayClientState(devicePlatform)
  );
  const [relaySetupOpen, setRelaySetupOpen] = useState(false);
  const [localAccountName, setLocalAccountName] = useState<string | null>(null);
  const [relayInstallSessionId, setRelayInstallSessionId] = useState<string | null>(null);
  const [relayInstallState, setRelayInstallState] = useState<
    "idle" | "installing" | "checking" | "ready" | "error"
  >("idle");
  const [relayInstallMessage, setRelayInstallMessage] = useState<string | null>(null);
  const [relayConflictState, setRelayConflictState] = useState<RelayConflictState | null>(null);
  const [relayBusyAction, setRelayBusyAction] = useState<
    "refresh" | "revoke" | "health" | "inspect" | "approve" | "relink" | null
  >(null);
  const [syncBusyAction, setSyncBusyAction] = useState<"export" | "import" | null>(null);
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const tabsRef = useRef<TerminalTab[]>([]);
  const toolUpdatesRequestIdRef = useRef(0);
  const toastTimeoutsRef = useRef<Map<string, number>>(new Map());
  const pendingTerminalStatesRef = useRef<
    Map<string, Pick<TerminalStatusEvent, "status" | "message">>
  >(new Map());
  const relayInstallWatcherRef = useRef<number | null>(null);
  const relayDeviceNameSyncRef = useRef(false);
  const relaySyncDebounceRef = useRef<number | null>(null);
  const relaySyncInFlightRef = useRef(false);
  const relayApplyingSnapshotRef = useRef(false);
  const relayLastPublishedPayloadRef = useRef<string | null>(null);
  const sessionRuntimeMetadataRef = useRef<Map<string, SessionRuntimeMetadata>>(new Map());

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );
  const selectedServer = useMemo(
    () => servers.find((server) => server.id === selectedServerId) ?? null,
    [servers, selectedServerId]
  );
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs]
  );
  const sessionTabs = useMemo(
    () => tabs.filter((tab) => getTerminalSurface(tab) === "sessions"),
    [tabs]
  );
  const activeSessionTab = useMemo(
    () => sessionTabs.find((tab) => tab.id === activeTabId) ?? sessionTabs.at(-1) ?? null,
    [activeTabId, sessionTabs]
  );
  const activeTabServer = useMemo(
    () => servers.find((server) => server.id === activeTab?.serverId) ?? null,
    [activeTab?.serverId, servers]
  );
  const activeSessionTabServer = useMemo(
    () => servers.find((server) => server.id === activeSessionTab?.serverId) ?? null,
    [activeSessionTab?.serverId, servers]
  );
  const relayHostServer = useMemo(
    () => servers.find((server) => server.id === relayState.hostServerId) ?? null,
    [relayState.hostServerId, servers]
  );
  const relayInstallTab = useMemo(
    () =>
      (relayInstallSessionId
        ? tabs.find((tab) => tab.id === relayInstallSessionId) ?? null
        : null) ??
      (relayHostServer
        ? tabs.filter((tab) => tab.serverId === relayHostServer.id).at(-1) ?? null
        : tabs.at(-1) ?? null),
    [relayHostServer, relayInstallSessionId, tabs]
  );
  const serverCountByProject = useMemo(() => {
    const counts: Record<string, number> = {};
    servers.forEach((server) => {
      counts[server.projectId] = (counts[server.projectId] ?? 0) + 1;
    });
    return counts;
  }, [servers]);

  const filteredProjects = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) {
      return projects;
    }

    return projects.filter((project) => {
      if (
        project.name.toLowerCase().includes(query) ||
        project.description.toLowerCase().includes(query)
      ) {
        return true;
      }

      return servers.some(
        (server) =>
          server.projectId === project.id &&
          [
            server.name,
            server.hostname,
            server.username,
            server.notes,
            server.tmuxSession,
            server.credentialName ?? ""
          ].some((value) => value.toLowerCase().includes(query))
      );
    });
  }, [deferredSearch, projects, servers]);

  const favoriteServers = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return servers.filter((server) => {
      if (!server.isFavorite) {
        return false;
      }

      if (!query) {
        return true;
      }

      const project = projects.find((candidate) => candidate.id === server.projectId);
      return [
        server.name,
        server.hostname,
        server.username,
        server.notes,
        server.tmuxSession,
        server.credentialName ?? "",
        project?.name ?? "",
        project?.description ?? ""
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [deferredSearch, projects, servers]);

  const filteredKeychainItems = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) {
      return keychainItems;
    }

    return keychainItems.filter((item) =>
      [item.name, item.kind].some((value) => value.toLowerCase().includes(query))
    );
  }, [deferredSearch, keychainItems]);

  const gitRepositories = useMemo<GitRepositoryView[]>(() => {
    const statesById = new Map(
      gitRepositoryStates.map((repository) => [repository.id, repository] as const)
    );

    return localGitRepositories.map((repository) => ({
      ...repository,
      snapshot: statesById.get(repository.id)?.snapshot ?? null,
      error: statesById.get(repository.id)?.error ?? null
    }));
  }, [gitRepositoryStates, localGitRepositories]);
  const sessionsDefaultBranchByProject = useMemo(() => {
    const defaults: Record<string, string> = {};

    projects.forEach((project) => {
      const repository = findProjectRepository(project, gitRepositories);
      defaults[project.id] =
        project.githubDefaultBranch.trim() ||
        (repository?.snapshot?.branch ??
          repository?.snapshot?.branches.find((branch) => branch.current)?.name ??
          "main");
    });

    return defaults;
  }, [gitRepositories, projects]);
  const sessionsSelectedBranchName = sessionsProjectId
    ? sessionsSelectedBranchByProject[sessionsProjectId] ?? sessionsDefaultBranchByProject[sessionsProjectId] ?? null
    : null;
  const sessionsWorkspaceTabs = useMemo(() => {
    if (!sessionsProjectId || !sessionsSelectedBranchName) {
      return sessionTabs;
    }

    return sessionTabs.filter((tab) => {
      const binding = sessionsBranchBindingsByTabId[tab.id];
      return (
        binding?.projectId === sessionsProjectId &&
        binding.branchName === sessionsSelectedBranchName
      );
    });
  }, [sessionTabs, sessionsBranchBindingsByTabId, sessionsProjectId, sessionsSelectedBranchName]);
  const activeSessionsWorkspaceTab = useMemo(
    () =>
      sessionsWorkspaceTabs.find((tab) => tab.id === activeTabId) ??
      sessionsWorkspaceTabs.at(-1) ??
      null,
    [activeTabId, sessionsWorkspaceTabs]
  );
  const activeSessionsWorkspaceTabServer = useMemo(
    () => servers.find((server) => server.id === activeSessionsWorkspaceTab?.serverId) ?? null,
    [activeSessionsWorkspaceTab?.serverId, servers]
  );
  const activeTerminalLabel = useMemo(
    () =>
      view === "sessions"
        ? activeSessionsWorkspaceTabServer
          ? buildSshTarget(activeSessionsWorkspaceTabServer)
          : activeSessionsWorkspaceTab?.title ?? null
        : activeSessionTabServer
          ? buildSshTarget(activeSessionTabServer)
          : activeSessionTab?.title ?? null,
    [
      activeSessionTab?.title,
      activeSessionTabServer,
      activeSessionsWorkspaceTab?.title,
      activeSessionsWorkspaceTabServer,
      view
    ]
  );

  const filteredGitRepositories = useMemo<GitRepositoryView[]>(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) {
      return gitRepositories;
    }

    return gitRepositories.filter((repository) => {
      const snapshot = repository.snapshot;
      const haystack = [
        repository.name,
        repository.path,
        snapshot?.branch ?? "",
        snapshot?.upstream ?? "",
        snapshot?.remoteName ?? "",
        ...(snapshot?.changes.map((change) => change.path) ?? []),
        ...(snapshot?.recentCommits.map((commit) => commit.summary) ?? [])
      ];

      return haystack.some((value) => value.toLowerCase().includes(query));
    });
  }, [deferredSearch, gitRepositories]);

  const projectServers = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return servers
      .filter((server) => server.projectId === selectedProjectId)
      .filter((server) => {
        if (!query) {
          return true;
        }

        return [
          server.name,
          server.hostname,
          server.username,
          server.notes,
          server.tmuxSession,
          server.credentialName ?? ""
        ].some((value) => value.toLowerCase().includes(query));
      });
  }, [deferredSearch, selectedProjectId, servers]);

  const workspaceTabs = useMemo(() => {
    if (!selectedProjectId) {
      return [];
    }

    const serverIds = new Set(
      servers
        .filter((server) => server.projectId === selectedProjectId)
        .map((server) => server.id)
    );

    return sessionTabs.filter((tab) => serverIds.has(tab.serverId));
  }, [selectedProjectId, servers, sessionTabs]);

  const selectedGitRepository = useMemo(
    () =>
      gitRepositories.find((repository) => repository.id === selectedGitRepositoryId) ??
      filteredGitRepositories[0] ??
      gitRepositories[0] ??
      null,
    [filteredGitRepositories, gitRepositories, selectedGitRepositoryId]
  );
  const activeTheme = useMemo(() => getHermesTheme(settings.themeId), [settings.themeId]);
  const relayConnected = useMemo(
    () => relayState.relayHealthy && relayState.currentDeviceStatus === "approved",
    [relayState.currentDeviceStatus, relayState.relayHealthy]
  );
  const terminalProfiles = useMemo(
    () => getTerminalLaunchProfiles(devicePlatform),
    [devicePlatform]
  );
  const localTerminalLaunch = useMemo(
    () => resolveLocalTerminalLaunch(settings, devicePlatform),
    [devicePlatform, settings]
  );
  const relayUrls = useMemo(
    () =>
      buildRelayUrls({
        hostServerHostname: relayHostServer?.hostname ?? null,
        relayPort: relayState.relayPort,
        advancedRelayUrl: relayState.advancedRelayUrl
      }),
    [relayHostServer?.hostname, relayState.advancedRelayUrl, relayState.relayPort]
  );
  const localLauncherSummary = useMemo(() => {
    if (localTerminalLaunch.profile.id !== "custom") {
      return localTerminalLaunch.profile.label;
    }

    const customLabel = settings.customTerminalLabel.trim();
    if (customLabel) {
      return customLabel;
    }

    return settings.customTerminalProgram.trim() || "Custom command";
  }, [
    localTerminalLaunch.profile.id,
    localTerminalLaunch.profile.label,
    settings.customTerminalLabel,
    settings.customTerminalProgram
  ]);
  const defaultRelayDeviceLabel = useMemo(
    () => getDefaultRelayDeviceName(devicePlatform),
    [devicePlatform]
  );

  useEffect(() => {
    void refreshWorkspace();
  }, []);

  useEffect(() => {
    if (selectedProjectId && projects.some((project) => project.id === selectedProjectId)) {
      return;
    }

    setSelectedProjectId(projects[0]?.id ?? null);
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setSelectedServerId(null);
      return;
    }

    const availableServers = servers.filter((server) => server.projectId === selectedProjectId);
    if (selectedServerId && availableServers.some((server) => server.id === selectedServerId)) {
      return;
    }

    setSelectedServerId(availableServers[0]?.id ?? null);
  }, [selectedProjectId, selectedServerId, servers]);

  useEffect(() => {
    persistLocalSessionPresets(localSessionPresets);
  }, [localSessionPresets]);

  useEffect(() => {
    if (isTauriRuntime()) {
      return;
    }

    persistLocalTerminalCommands(terminalCommands);
  }, [terminalCommands]);

  useEffect(() => {
    persistLocalGitRepositories(localGitRepositories);
  }, [localGitRepositories]);

  useEffect(() => {
    persistLocalTmuxMetadata(tmuxMetadata);
  }, [tmuxMetadata]);

  useEffect(() => {
    persistLocalTerminalHistory(sessionHistory);
  }, [sessionHistory]);

  useEffect(() => {
    persistHermesSettings(settings);
  }, [settings]);

  useEffect(() => {
    persistRelayClientState(relayState);
  }, [relayState]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    void getLocalAccountName()
      .then((value) => {
        const normalized = value?.trim();
        if (normalized) {
          setLocalAccountName(normalized);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(
    () => () => {
      if (relayInstallWatcherRef.current !== null) {
        window.clearTimeout(relayInstallWatcherRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedGitRepositoryId && localGitRepositories.some((repo) => repo.id === selectedGitRepositoryId)) {
      return;
    }

    setSelectedGitRepositoryId(localGitRepositories[0]?.id ?? null);
  }, [localGitRepositories, selectedGitRepositoryId]);

  useEffect(() => {
    if (!relayState.hostServerId) {
      return;
    }

    if (servers.some((server) => server.id === relayState.hostServerId)) {
      return;
    }

    updateRelayState((current) => ({
      ...current,
      hostServerId: null
    }));
  }, [relayState.hostServerId, servers]);

  useEffect(() => {
    setGitCommitMessage("");
    setGitBranchName("");
  }, [selectedGitRepositoryId]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      setGitRepositoryStates([]);
      setGitLoading(false);
      return;
    }

    if (localGitRepositories.length === 0) {
      setGitRepositoryStates([]);
      setGitLoading(false);
      return;
    }

    void refreshGitRepositories();
  }, [localGitRepositories]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      setGitHubSession(null);
      return;
    }

    void loadSavedTerminalCommands();
    void loadGitHubSessionState();
    void loadGitHubAuthSupport();
  }, []);

  useEffect(() => {
    if (!gitHubSession) {
      setGitHubOwnedRepositories([]);
      return;
    }

    const cached = loadGitHubOwnedRepositoriesCache();
    if (cached?.login === gitHubSession.login) {
      setGitHubOwnedRepositories(cached.repositories);
      if (Date.now() - cached.updatedAt < GITHUB_OWNED_REPOSITORIES_CACHE_TTL_MS) {
        return;
      }
    }

    void loadGitHubOwnedRepositories(gitHubSession);
  }, [gitHubSession]);

  useEffect(() => {
    if (view !== "git") {
      return;
    }

    const query = gitHubSearchQuery.trim();
    if (!query) {
      setGitHubPublicRepositories([]);
      setGitHubSearchLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadGitHubSearchRepositories(query);
    }, 240);

    return () => window.clearTimeout(timeoutId);
  }, [gitHubSearchQuery, view]);

  useEffect(() => {
    if (!gitHubDeviceFlow) {
      return;
    }

    const intervalMs = Math.max(gitHubDeviceFlow.interval, 5) * 1000;
    let cancelled = false;
    const runPoll = async () => {
      try {
        const session = await pollGitHubDeviceFlow();
        if (cancelled || !session) {
          return;
        }

        setGitHubSession(session);
        setGitHubDeviceFlow(null);
        pushToast(`Connected GitHub as ${session.login}.`, "success");
        await loadGitHubOwnedRepositories(session);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setGitHubDeviceFlow(null);
        pushToast(getErrorMessage(error), "error");
      }
    };

    const intervalId = window.setInterval(() => {
      void runPoll();
    }, intervalMs);

    void runPoll();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [gitHubDeviceFlow]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    const interval = window.setInterval(() => {
      const activeTabs = tabsRef.current;
      if (activeTabs.length === 0) {
        return;
      }

      void listSessionStatuses()
        .then((snapshots) => {
          if (snapshots.length === 0) {
            return;
          }

          const snapshotById = new Map(
            snapshots.map((snapshot) => [snapshot.sessionId, snapshot.status] as const)
          );

          setTabs((current) => {
            let changed = false;
            const nextTabs = current.map((tab) => {
              const snapshotStatus = snapshotById.get(tab.id);
              if (!snapshotStatus) {
                return tab;
              }

              const nextStatus = mergeTerminalStatus(tab.status, snapshotStatus);
              if (nextStatus === tab.status) {
                return tab;
              }

              changed = true;
              return { ...tab, status: nextStatus };
            });

            return changed ? nextTabs : current;
          });
        })
        .catch(() => undefined);
    }, 750);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (view !== "workspace" || !selectedServerId || !isTauriRuntime()) {
      setTmuxSessions([]);
      setTmuxLoading(false);
      return;
    }

    void refreshTmuxSessions(selectedServerId);
  }, [selectedServerId, view]);

  useEffect(() => {
    return () => {
      toastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      toastTimeoutsRef.current.clear();
      if (relaySyncDebounceRef.current !== null) {
        window.clearTimeout(relaySyncDebounceRef.current);
        relaySyncDebounceRef.current = null;
      }
    };
  }, []);

  const dismissToast = (id: string) => {
    const timeoutId = toastTimeoutsRef.current.get(id);
    if (typeof timeoutId === "number") {
      window.clearTimeout(timeoutId);
      toastTimeoutsRef.current.delete(id);
    }

    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const pushToast = (message: string, tone: ToastTone = "info") => {
    const nextMessage = message.trim();
    if (!nextMessage) {
      return;
    }

    const id = crypto.randomUUID();
    setToasts((current) => [...current.slice(-3), { id, message: nextMessage, tone }]);

    const timeoutId = window.setTimeout(() => {
      toastTimeoutsRef.current.delete(id);
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, TOAST_DURATION_MS);

    toastTimeoutsRef.current.set(id, timeoutId);
  };

  const handleRelayError = (error: unknown) => {
    const message = getErrorMessage(error);
    setRelayInstallState("error");
    setRelayInstallMessage(message);
    updateRelayState((current) => ({
      ...current,
      lastError: message
    }));
    if (!relaySetupOpen) {
      pushToast(message, "error");
    }
    return message;
  };

  const updateSettings = (
    updater: HermesSettings | ((current: HermesSettings) => HermesSettings)
  ) => {
    setSettings((current) => {
      const nextSettings =
        typeof updater === "function"
          ? (updater as (current: HermesSettings) => HermesSettings)(current)
          : updater;
      return sanitizeHermesSettings(nextSettings, devicePlatform);
    });
  };

  const updateRelayState = (
    updater: RelayClientState | ((current: RelayClientState) => RelayClientState)
  ) => {
    setRelayState((current) => {
      const nextState =
        typeof updater === "function"
          ? (updater as (current: RelayClientState) => RelayClientState)(current)
          : updater;
      return sanitizeRelayClientState(nextState, devicePlatform);
    });
  };

  const refreshWorkspace = async () => {
    setLoading(true);
    try {
      if (!isTauriRuntime()) {
        setProjects([]);
        setServers([]);
        setKeychainItems([]);
        return;
      }

      const [nextProjects, nextServers, nextKeychainItems] = await Promise.all([
        listProjects(),
        listServers(),
        listKeychainItems()
      ]);
      setProjects(nextProjects);
      setServers(nextServers);
      setKeychainItems(nextKeychainItems);
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  };

  const refreshKeychain = async () => {
    if (!isTauriRuntime()) {
      return;
    }

    const items = await listKeychainItems();
    setKeychainItems(items);
  };

  const recordTmuxMetadata = (
    server: ServerRecord,
    sessionNames: string[],
    lastAttachedSession: string | null
  ) => {
    const serverRef = buildSyncServerRef(server);
    setTmuxMetadata((current) => {
      const existing = current.find((record) => record.serverRef === serverRef) ?? null;
      const nextRecord: SyncedTmuxMetadataRecord = {
        serverRef,
        serverLabel: serverDisplayLabel(server),
        sessionNames: [
          ...new Set(
            (sessionNames.length > 0 ? sessionNames : existing?.sessionNames ?? []).filter(
              (name) => name.trim().length > 0
            )
          )
        ].sort((left, right) => left.localeCompare(right)),
        lastAttachedSession:
          lastAttachedSession?.trim() || existing?.lastAttachedSession || null,
        lastSeenAt: new Date().toISOString()
      };

      return upsertTmuxMetadataRecord(current, nextRecord);
    });
  };

  const recordTerminalHistory = (entry: SyncedTerminalHistoryRecord) => {
    setSessionHistory((current) => {
      const next = [
        entry,
        ...current.filter((candidate) => candidate.id !== entry.id)
      ];
      return next.slice(0, MAX_SYNCED_HISTORY_RECORDS);
    });
  };

  const refreshTmuxSessions = async (serverId: string) => {
    setTmuxLoading(true);
    try {
      const sessions = await listTmuxSessions(serverId);
      setTmuxSessions(sessions);
      const server = servers.find((candidate) => candidate.id === serverId);
      if (server) {
        recordTmuxMetadata(
          server,
          sessions.map((session) => session.name),
          server.tmuxSession.trim() || null
        );
      }
    } catch {
      setTmuxSessions([]);
    } finally {
      setTmuxLoading(false);
    }
  };

  const loadSavedTerminalCommands = async () => {
    if (!isTauriRuntime()) {
      setTerminalCommands(loadLocalTerminalCommands());
      return;
    }

    try {
      const saved = await listTerminalCommands();
      setTerminalCommands(saved);
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    }
  };

  const openCreateProject = () => {
    setProjectDraft(defaultProjectInput());
    setInspector({ kind: "project", mode: "create" });
  };

  const openEditProject = () => {
    if (!selectedProject) {
      return;
    }

    const runtimeServer = findProjectRuntimeServer(selectedProject, servers);

    setProjectDraft({
      name: selectedProject.name,
      description: selectedProject.description,
      path: selectedProject.path,
      targetKind: selectedProject.targetKind,
      linkedServerId: selectedProject.linkedServerId ?? "",
      githubRepoFullName: selectedProject.githubRepoFullName,
      githubDefaultBranch: selectedProject.githubDefaultBranch,
      serverHostname: runtimeServer?.hostname ?? "",
      serverPort: runtimeServer?.port ?? 22,
      serverUsername: runtimeServer?.username ?? "",
      serverAuthKind: runtimeServer?.authKind ?? "default",
      serverCredentialId: runtimeServer?.credentialId ?? "",
      serverCredentialName: runtimeServer?.credentialName ?? "",
      serverCredentialSecret: ""
    });
    setInspector({ kind: "project", mode: "edit" });
  };

  const openCreateServer = () => {
    const projectId = selectedProjectId ?? projects[0]?.id ?? "";
    setServerDraft(defaultServerInput(projectId));
    setInspector({ kind: "server", mode: "create" });
  };

  const openEditServer = () => {
    if (!selectedServer) {
      return;
    }

    setServerDraft(mapServerToInput(selectedServer));
    setInspector({ kind: "server", mode: "edit" });
  };

  const openEditServerById = (serverId: string) => {
    const server = servers.find((candidate) => candidate.id === serverId);
    if (!server) {
      return;
    }

    setSelectedProjectId(server.projectId);
    setSelectedServerId(server.id);
    setServerDraft(mapServerToInput(server));
    setInspector({ kind: "server", mode: "edit" });
  };

  const saveProject = async () => {
    setSaving(true);
    try {
      if (inspector.kind !== "project") {
        return;
      }

      const normalizedDraft = normalizeProjectInput(projectDraft);
      const previousProject =
        inspector.mode === "edit" && selectedProjectId
          ? projects.find((project) => project.id === selectedProjectId) ?? null
          : null;
      const existingRuntimeServer = previousProject
        ? findProjectRuntimeServer(previousProject, servers)
        : null;
      const syncProjectRuntimeServer = async (
        project: ProjectRecord
      ): Promise<ProjectRecord> => {
        if (normalizedDraft.targetKind !== "server") {
          return project;
        }

        const runtimeServerInput = normalizeServerInput({
          projectId: project.id,
          name: project.name,
          hostname: normalizedDraft.serverHostname,
          port: normalizedDraft.serverPort,
          username: normalizedDraft.serverUsername,
          path: normalizedDraft.path,
          authKind: normalizedDraft.serverAuthKind,
          credentialId: normalizedDraft.serverCredentialId || null,
          credentialName:
            normalizedDraft.serverCredentialName ||
            `${normalizedDraft.serverHostname || project.name} key`,
          credentialSecret: normalizedDraft.serverCredentialSecret,
          isFavorite: existingRuntimeServer?.isFavorite ?? false,
          tmuxSession: existingRuntimeServer?.tmuxSession ?? "main",
          useTmux: existingRuntimeServer?.useTmux ?? false,
          notes: existingRuntimeServer?.notes || PROJECT_RUNTIME_SERVER_NOTE
        });

        const runtimeServer =
          existingRuntimeServer && (project.linkedServerId === existingRuntimeServer.id || existingRuntimeServer.notes === PROJECT_RUNTIME_SERVER_NOTE)
            ? await updateServer(existingRuntimeServer.id, runtimeServerInput)
            : await createServer(runtimeServerInput);

        setServers((current) => {
          const existingIndex = current.findIndex((server) => server.id === runtimeServer.id);
          if (existingIndex >= 0) {
            return current.map((server) => (server.id === runtimeServer.id ? runtimeServer : server));
          }

          return [runtimeServer, ...current];
        });
        setSelectedServerId(runtimeServer.id);

        if ((project.linkedServerId ?? "") === runtimeServer.id) {
          return project;
        }

        const syncedProject = await updateProject(project.id, {
          ...normalizedDraft,
          linkedServerId: runtimeServer.id
        });
        setProjects((current) =>
          current.map((candidate) => (candidate.id === syncedProject.id ? syncedProject : candidate))
        );
        return syncedProject;
      };

      const clearProjectRuntimeServer = async (
        project: ProjectRecord
      ): Promise<ProjectRecord> => {
        if (
          existingRuntimeServer &&
          (project.linkedServerId === existingRuntimeServer.id ||
            existingRuntimeServer.notes === PROJECT_RUNTIME_SERVER_NOTE)
        ) {
          await deleteServer(existingRuntimeServer.id);
          setServers((current) => current.filter((server) => server.id !== existingRuntimeServer.id));
        }
        setSelectedServerId(null);

        if (!project.linkedServerId) {
          return project;
        }

        const clearedProject = await updateProject(project.id, {
          ...normalizedDraft,
          linkedServerId: ""
        });
        setProjects((current) =>
          current.map((candidate) => (candidate.id === clearedProject.id ? clearedProject : candidate))
        );
        return clearedProject;
      };

      if (inspector.mode === "create") {
        let created = await createProject(normalizedDraft);
        setProjects((current) => [created, ...current]);
        created =
          normalizedDraft.targetKind === "server"
            ? await syncProjectRuntimeServer(created)
            : created;
        setSelectedProjectId(created.id);
        setWorkspaceMode("home");
        setView("workspace");
        pushToast(`Created project ${projectDisplayLabel(created)}.`, "success");
      } else if (selectedProjectId) {
        let updated = await updateProject(selectedProjectId, normalizedDraft);
        setProjects((current) =>
          current.map((project) => (project.id === updated.id ? updated : project))
        );
        updated =
          normalizedDraft.targetKind === "server"
            ? await syncProjectRuntimeServer(updated)
            : await clearProjectRuntimeServer(updated);
        pushToast(`Updated ${projectDisplayLabel(updated)}.`, "success");
      }

      await refreshKeychain();
      setInspector({ kind: "hidden" });
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  };

  const saveServer = async () => {
    setSaving(true);
    try {
      if (inspector.kind !== "server") {
        return;
      }

      if (inspector.mode === "create") {
        const created = await createServer(normalizeServerInput(serverDraft));
        setServers((current) => [created, ...current]);
        setSelectedProjectId(created.projectId);
        setSelectedServerId(created.id);
        setWorkspaceMode("home");
        setView("workspace");
        pushToast(`Added server ${serverDisplayLabel(created)}.`, "success");
      } else if (selectedServerId) {
        const updated = await updateServer(selectedServerId, normalizeServerInput(serverDraft));
        setServers((current) =>
          current.map((server) => (server.id === updated.id ? updated : server))
        );
        setSelectedProjectId(updated.projectId);
        setSelectedServerId(updated.id);
        pushToast(`Updated server ${serverDisplayLabel(updated)}.`, "success");
      }

      await refreshKeychain();
      setInspector({ kind: "hidden" });
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!selectedProjectId) {
      return;
    }

    try {
      await deleteProject(selectedProjectId);
      setProjects((current) => current.filter((project) => project.id !== selectedProjectId));
      setServers((current) => current.filter((server) => server.projectId !== selectedProjectId));
      await refreshKeychain();
      setInspector({ kind: "hidden" });
      setView("dashboard");
      pushToast("Deleted project and its servers.", "success");
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    }
  };

  const handleDeleteServer = async () => {
    if (!selectedServerId) {
      return;
    }

    try {
      await deleteServer(selectedServerId);
      setServers((current) => current.filter((server) => server.id !== selectedServerId));
      await refreshKeychain();
      setInspector({ kind: "hidden" });
      pushToast("Deleted server.", "success");
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    }
  };

  const handleOpenProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setWorkspaceMode("home");
    setView("workspace");
    const firstServer = servers.find((server) => server.projectId === projectId);
    setSelectedServerId(firstServer?.id ?? null);
  };

  const handleSelectServer = (serverId: string) => {
    const server = servers.find((candidate) => candidate.id === serverId);
    if (!server) {
      return;
    }

    setSelectedProjectId(server.projectId);
    setSelectedServerId(serverId);
  };

  const bindTabToSessionsBranch = (
    tabId: string,
    projectId: string,
    branchName: string,
    binding: Omit<SessionsBranchBinding, "projectId" | "branchName">
  ) => {
    setSessionsSelectedBranchByProject((current) => ({
      ...current,
      [projectId]: branchName
    }));
    setSessionsBranchBindingsByTabId((current) => ({
      ...current,
      [tabId]: {
        projectId,
        branchName,
        ...binding
      }
    }));
  };

  const handleConnect = async (
    serverId: string,
    tmuxSession?: string,
    cwd?: string,
    surface: "sessions" | "relay" = "sessions",
    activateView = true
  ) => {
    try {
      const server = servers.find((candidate) => candidate.id === serverId);
      const resolvedCwd = (cwd ?? server?.path.trim() ?? "") || undefined;
      if (server) {
        setSelectedProjectId(server.projectId);
        setSelectedServerId(server.id);
      }
      if (activateView) {
        setWorkspaceMode("terminal");
        setView("sessions");
        setSessionLauncherOpen(false);
      }

      const tab = await connectSession({ serverId, tmuxSession, cwd: resolvedCwd });
      const pendingState = pendingTerminalStatesRef.current.get(tab.id);
      if (pendingState) {
        pendingTerminalStatesRef.current.delete(tab.id);
      }
      setTabs((current) => [
        ...current,
        {
          ...tab,
          surface,
          status: pendingState?.status ?? tab.status
        }
      ]);
      if (server) {
        const resolvedTmuxSession =
          tmuxSession?.trim() || (server.useTmux ? server.tmuxSession.trim() : "") || null;
        sessionRuntimeMetadataRef.current.set(tab.id, {
          targetKind: "server",
          serverRef: buildSyncServerRef(server),
          serverLabel: serverDisplayLabel(server),
          tmuxSession: resolvedTmuxSession,
          cwd: resolvedCwd ?? tab.cwd,
          title: tab.title,
          startedAt: tab.startedAt
        });
        if (resolvedTmuxSession) {
          recordTmuxMetadata(server, [], resolvedTmuxSession);
        }
      }
      if (activateView) {
        setActiveTabId(tab.id);
      }
      return tab;
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
      return null;
    }
  };

  const handleConnectLocal = async (input?: ConnectLocalSessionInput) => {
    if (localTerminalLaunch.error) {
      pushToast(localTerminalLaunch.error, "info");
      setView("settings");
      return;
    }

    const resolvedInput: ConnectLocalSessionInput = {
      ...localTerminalLaunch.connectInput,
      ...input,
      args: input?.args ?? localTerminalLaunch.connectInput.args,
      label: input?.label ?? localTerminalLaunch.connectInput.label
    };

    try {
      setWorkspaceMode("terminal");
      setView("sessions");
      setSessionLauncherOpen(false);

      const tab = await connectLocalSession(
        Object.keys(resolvedInput).length > 0 ? resolvedInput : undefined
      );
      const pendingState = pendingTerminalStatesRef.current.get(tab.id);
      if (pendingState) {
        pendingTerminalStatesRef.current.delete(tab.id);
      }
      setTabs((current) => [
        ...current,
        {
          ...tab,
          surface: "sessions",
          status: pendingState?.status ?? tab.status
        }
      ]);
      sessionRuntimeMetadataRef.current.set(tab.id, {
        targetKind: "local",
        serverRef: null,
        serverLabel: null,
        tmuxSession: null,
        cwd: resolvedInput.cwd ?? tab.cwd,
        title: resolvedInput.label ?? tab.title,
        startedAt: tab.startedAt
      });
      setActiveTabId(tab.id);
      return tab;
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
      return null;
    }
  };

  const handleOpenRelayServerSession = async (command: string, successMessage: string) => {
    if (!relayHostServer) {
      pushToast("Choose a saved server to use as the relay host first.", "info");
      return;
    }

    const tab = await handleConnect(relayHostServer.id, undefined, undefined, "sessions", true);
    if (!tab) {
      return;
    }

    setRelayInstallSessionId(tab.id);
    setRelayInstallState("installing");
    setRelayInstallMessage(`Install session opened on ${serverDisplayLabel(relayHostServer)}.`);
    setRelaySetupOpen(false);

    window.setTimeout(() => {
      queueTerminalInput(tab.id, normalizeTerminalCommandInput(command));
    }, 120);

    pushToast(successMessage, "success");
  };

  const stopRelayInstallWatcher = () => {
    if (relayInstallWatcherRef.current !== null) {
      window.clearTimeout(relayInstallWatcherRef.current);
      relayInstallWatcherRef.current = null;
    }
  };

  const startRelayInstallWatcher = (serverId: string, attempts = 30) => {
    stopRelayInstallWatcher();
    setRelayInstallState("checking");
    setRelayInstallMessage("Waiting for the host install command to finish and for the relay to come online.");

    const run = async (remaining: number) => {
      try {
        const inspection = await inspectRelayHost(serverId);
        const detectedRelayUrl = inspection.suggestedRelayUrl;
        const candidateUrls = getRelayCandidateUrls(inspection.suggestedRelayUrls);

        updateRelayState((current) => ({
          ...current,
          hostServerId: serverId,
          advancedRelayUrl: detectedRelayUrl ?? current.advancedRelayUrl,
          detectedRelayUrl,
          detectedRelayUrls: inspection.suggestedRelayUrls,
          tailscaleIpv4: inspection.tailscaleIpv4,
          tailscaleDnsName: inspection.tailscaleDnsName,
          relayInstalled: inspection.relayInstalled,
          relayRunning: inspection.relayRunning,
          relayHealthy: inspection.relayHealthy,
          relayVersion: inspection.relayVersion,
          relayId: inspection.relayId ?? current.relayId,
          lastHostCheckAt: new Date().toISOString()
        }));

        if (inspection.relayHealthy && candidateUrls.length > 0) {
          const { autoBootstrapped, health, relayUrl, session } = await connectRelayWithCandidates(candidateUrls);
          setRelayInstallState("ready");
          setRelayInstallMessage(
            autoBootstrapped
              ? `Relay ${health.relayId.slice(0, 8)} is live. This device is now the master.`
              : session.currentDeviceStatus === "pending"
                ? `Relay ${health.relayId.slice(0, 8)} is live at ${relayUrl}. This device is waiting for master approval.`
                : `Relay ${health.relayId.slice(0, 8)} is live at ${relayUrl} and linked to this device.`
          );
          pushToast(
            autoBootstrapped
              ? `Relay ${health.relayId.slice(0, 8)} is live. This device is now the master.`
              : `Relay ${health.relayId.slice(0, 8)} is live and connected.`,
            "success"
          );
          stopRelayInstallWatcher();
          return;
        }
      } catch {
        // Ignore until the watcher times out.
      }

      if (remaining <= 0) {
        stopRelayInstallWatcher();
        setRelayInstallState("error");
        setRelayInstallMessage(
          "The background install session is still running or the relay is not reachable yet. Re-check the host once the command finishes."
        );
        pushToast("Relay install is still not reachable. Reopen the server and inspect it again once the host command finishes.", "info");
        return;
      }

      relayInstallWatcherRef.current = window.setTimeout(() => {
        void run(remaining - 1);
      }, 3000);
    };

    void run(attempts);
  };

  const handleInstallRelayOnHost = async () => {
    if (!relayHostServer) {
      pushToast("Choose a saved server to use as the relay host first.", "info");
      return;
    }

    setRelayInstallState("installing");
    setRelayInstallMessage(`Queueing the install command on ${serverDisplayLabel(relayHostServer)}.`);
    await handleOpenRelayServerSession(
      buildRelayInstallCommand({
        runtime: relayState.installRuntime,
        relayPort: relayState.relayPort
      }),
      "Opened a relay install session on the selected host. Hermes will link this device automatically when the relay comes online."
    );

    startRelayInstallWatcher(relayHostServer.id);
  };

  const openRelaySetup = (serverId?: string) => {
    const targetServerId = serverId ?? relayState.hostServerId;
    const switchedHost = Boolean(targetServerId && targetServerId !== relayState.hostServerId);
    const alreadyConnectedHost =
      Boolean(targetServerId) &&
      targetServerId === relayState.hostServerId &&
      (
        relayState.relayInstalled ||
        relayState.relayHealthy ||
        Boolean(relayState.relayId) ||
        Boolean(relayState.currentDeviceRole) ||
        relayState.currentDeviceStatus === "approved" ||
        relayState.devices.length > 0
      );
    if (targetServerId) {
      updateRelayState((current) => ({
        ...current,
        hostServerId: targetServerId,
        detectedRelayUrl: switchedHost ? null : current.detectedRelayUrl,
        detectedRelayUrls: switchedHost ? [] : current.detectedRelayUrls,
        tailscaleIpv4: switchedHost ? null : current.tailscaleIpv4,
        tailscaleDnsName: switchedHost ? null : current.tailscaleDnsName,
        relayInstalled: switchedHost ? false : current.relayInstalled,
        relayRunning: switchedHost ? false : current.relayRunning,
        relayHealthy: switchedHost ? false : current.relayHealthy,
        relayVersion: switchedHost ? null : current.relayVersion,
        lastHostCheckAt: switchedHost ? null : current.lastHostCheckAt
      }));
    }

    setRelaySetupOpen(true);
    if (switchedHost) {
      setRelayInstallSessionId(null);
      setRelayInstallState("checking");
      setRelayInstallMessage("Checking this server for an existing relay and discovering the Tailscale endpoint.");
    } else if (alreadyConnectedHost) {
      setRelayInstallState("ready");
      setRelayInstallMessage(null);
    }

    if (targetServerId && !alreadyConnectedHost) {
      void handleInspectRelayHostByServerId(targetServerId, {
        silentIfConnected: true
      });
    }
  };

  const handleSelectSessionsProject = (projectId: string | null) => {
    setSessionsProjectId(projectId);
    if (!projectId) {
      return;
    }

    const branchName =
      sessionsSelectedBranchByProject[projectId] ?? sessionsDefaultBranchByProject[projectId] ?? "main";
    setSessionsSelectedBranchByProject((current) => ({
      ...current,
      [projectId]: branchName
    }));
  };

  const getSessionsBranchTarget = (projectId: string, branchName: string) => {
    const existingBinding = [...sessionTabs]
      .reverse()
      .map((tab) => sessionsBranchBindingsByTabId[tab.id] ?? null)
      .find(
        (binding) =>
          binding?.projectId === projectId &&
          binding.branchName === branchName
      );

    if (existingBinding) {
      return existingBinding;
    }

    const project = projects.find((candidate) => candidate.id === projectId) ?? null;
    const linkedServer =
      project?.linkedServerId
        ? servers.find((server) => server.id === project.linkedServerId) ?? null
        : null;
    const projectServer =
      project?.targetKind === "server"
        ? linkedServer ??
          servers.find((server) => server.projectId === projectId && server.isFavorite) ??
          servers.find((server) => server.projectId === projectId) ??
          null
        : null;

    if (projectServer) {
      const cwd = projectServer.path.trim() || project?.path.trim() || null;
      return {
        projectId,
        branchName,
        targetKind: "server" as const,
        serverId: projectServer.id,
        cwd,
        label: serverDisplayLabel(projectServer)
      };
    }

    const repository = project ? findProjectRepository(project, gitRepositories) : null;
    const projectPath = project?.path.trim() || null;

    return {
      projectId,
      branchName,
      targetKind: "local" as const,
      serverId: null,
      cwd: projectPath ?? repository?.path ?? null,
      label: project ? `${project.name} / ${branchName}` : branchName
    };
  };

  const createTerminalForSessionsBranch = async (projectId: string, branchName: string) => {
    const target = getSessionsBranchTarget(projectId, branchName);
    if (!target) {
      return null;
    }

    if (target.targetKind === "server" && target.serverId) {
      const tab = await handleConnect(target.serverId, undefined, target.cwd ?? undefined, "sessions", true);
      if (tab) {
        bindTabToSessionsBranch(tab.id, projectId, branchName, {
          targetKind: "server",
          serverId: target.serverId,
          cwd: target.cwd,
          label: target.label
        });
      }
      return tab;
    }

    const tab = await handleConnectLocal({
      cwd: target.cwd ?? undefined,
      label: target.label ?? undefined
    });
    if (tab) {
      bindTabToSessionsBranch(tab.id, projectId, branchName, {
        targetKind: "local",
        serverId: null,
        cwd: target.cwd,
        label: target.label
      });
    }
    return tab;
  };

  const handleSelectSessionsBranch = async (branchName: string) => {
    if (!sessionsProjectId) {
      return;
    }

    setSessionsSelectedBranchByProject((current) => ({
      ...current,
      [sessionsProjectId]: branchName
    }));

    const existingTab = sessionTabs
      .filter((tab) => {
        const binding = sessionsBranchBindingsByTabId[tab.id];
        return binding?.projectId === sessionsProjectId && binding.branchName === branchName;
      })
      .at(-1);

    if (existingTab) {
      handleOpenTerminalSession(existingTab.id);
      return;
    }

    await createTerminalForSessionsBranch(sessionsProjectId, branchName);
  };

  const restoreSessionsContext = () => {
    if (sessionsProjectId) {
      return;
    }

    const sourceTab = activeSessionTab ?? sessionTabs.at(-1) ?? null;
    if (!sourceTab) {
      return;
    }

    const branchBinding = sessionsBranchBindingsByTabId[sourceTab.id];
    if (branchBinding) {
      setSessionsProjectId(branchBinding.projectId);
      setSessionsSelectedBranchByProject((current) => ({
        ...current,
        [branchBinding.projectId]: branchBinding.branchName
      }));
      return;
    }

    const server = servers.find((candidate) => candidate.id === sourceTab.serverId) ?? null;
    if (!server) {
      return;
    }

    const branchName =
      sessionsSelectedBranchByProject[server.projectId] ??
      sessionsDefaultBranchByProject[server.projectId] ??
      "main";

    setSessionsProjectId(server.projectId);
    setSessionsSelectedBranchByProject((current) => ({
      ...current,
      [server.projectId]: branchName
    }));
  };

  const handleNavigate = (nextView: ViewState) => {
    if (nextView === "sessions" && view !== "sessions") {
      restoreSessionsContext();
    }
    setView(nextView);
  };

  const openLocalSessionPresetEditor = () => {
    setLocalSessionPresetName("");
    setLocalSessionPresetPath("");
    setLocalSessionPresetEditorOpen(true);
  };

  const openCreateKeychainItem = () => {
    setCreatingLocalSshKey(false);
    setEditingKeychainItem(null);
    setCreatingKeychainItem(true);
    setKeychainNameDraft("");
    setKeychainKindDraft("sshKey");
    setKeychainSecretDraft("");
  };

  const openCreateLocalSshKey = async () => {
    setCreatingKeychainItem(false);
    setEditingKeychainItem(null);
    setCreatingLocalSshKey(true);
    setKeychainNameDraft("");
    setLocalSshKeyFileNameDraft("id_ed25519");
    setLocalSshKeyPassphraseDraft("");

    if (!isTauriRuntime()) {
      setLocalSshKeyDirectoryDraft("");
      return;
    }

    try {
      const defaultPath = await getDefaultSshDirectory();
      setLocalSshKeyDirectoryDraft(defaultPath ?? "");
    } catch {
      setLocalSshKeyDirectoryDraft("");
    }
  };

  const loadToolUpdates = async () => {
    if (!isTauriRuntime()) {
      pushToast("Tool updates are only available in the desktop app.", "info");
      return;
    }

    const requestId = toolUpdatesRequestIdRef.current + 1;
    toolUpdatesRequestIdRef.current = requestId;
    setToolUpdatesLoading(true);
    try {
      const installedTools = await listInstalledCliTools();
      if (toolUpdatesRequestIdRef.current !== requestId) {
        return;
      }

      setToolUpdates(installedTools);

      const detailTasks = installedTools.map((tool) =>
        getCliToolUpdate(tool.id)
          .then((updated) => {
            if (toolUpdatesRequestIdRef.current !== requestId) {
              return;
            }

            setToolUpdates((current) =>
              current.map((candidate) => (candidate.id === updated.id ? updated : candidate))
            );
          })
          .catch(() => undefined)
      );

      await Promise.allSettled(detailTasks);
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      if (toolUpdatesRequestIdRef.current === requestId) {
        setToolUpdatesLoading(false);
      }
    }
  };

  const openToolUpdates = () => {
    setToolUpdatesOpen(true);
    void loadToolUpdates();
  };

  const buildCurrentSyncBundle = async (exportedAt = new Date().toISOString()) => {
    const keychainItemsForSync: SyncedKeychainItem[] | null =
      settings.syncIncludesSecrets && isTauriRuntime()
        ? await listSyncableKeychainItems()
        : null;

    return buildHermesSyncBundle({
      settings: settings.syncIncludesSettings
        ? {
            ...settings,
            lastExportedAt: exportedAt
          }
        : null,
      projects,
      servers,
      localSessionPresets,
      localGitRepositories: settings.syncIncludesPinnedRepositories ? localGitRepositories : null,
      terminalCommands: settings.syncIncludesCommands ? terminalCommands : null,
      keychainItems: keychainItemsForSync,
      tmuxMetadata: settings.syncIncludesTmuxMetadata ? tmuxMetadata : null,
      sessionHistory: settings.syncIncludesHistory ? sessionHistory : null
    });
  };

  const applySyncBundle = async (
    bundle: HermesSyncBundle,
    options?: {
      importedAt?: string;
      announceSuccess?: boolean;
    }
  ) => {
    if (!isTauriRuntime()) {
      throw new Error("Project import is only available in the desktop runtime.");
    }

    const credentialIdByKey = new Map<string, string>();
    for (const item of keychainItems) {
      credentialIdByKey.set(`${item.kind}\u0000${item.name}`, item.id);
    }

    if (bundle.keychainItems && isTauriRuntime()) {
      const syncedItems = await upsertSyncableKeychainItems(bundle.keychainItems);
      for (const item of syncedItems) {
        credentialIdByKey.set(`${item.kind}\u0000${item.name}`, item.id);
      }
    }

    if (bundle.terminalCommands !== null) {
      for (const command of terminalCommands) {
        await deleteTerminalCommand(command.id);
      }
    }

    for (const project of projects) {
      await deleteProject(project.id);
    }

    const projectIdMap = new Map<string, string>();
    const createdProjectBySourceId = new Map<string, ProjectRecord>();

    for (const project of bundle.projects) {
        const createdProject = await createProject({
          name: project.name,
          description: project.description,
          path: project.path,
          targetKind: project.targetKind,
          linkedServerId: project.linkedServerId ?? "",
          githubRepoFullName: project.githubRepoFullName,
          githubDefaultBranch: project.githubDefaultBranch,
          serverHostname: "",
          serverPort: 22,
          serverUsername: "",
          serverAuthKind: "default",
          serverCredentialId: "",
          serverCredentialName: "",
          serverCredentialSecret: ""
        });
      projectIdMap.set(project.id, createdProject.id);
      createdProjectBySourceId.set(project.id, createdProject);
    }

    const serverIdMap = new Map<string, string>();
    for (const server of bundle.servers) {
      const mappedProjectId = projectIdMap.get(server.projectId);
      if (!mappedProjectId) {
        continue;
      }

      const createdServer = await createServer({
        projectId: mappedProjectId,
        name: server.name,
        hostname: server.hostname,
        port: server.port,
        username: server.username,
        path: server.path,
        authKind: server.authKind,
        credentialId:
          server.credentialName && server.authKind !== "default"
            ? credentialIdByKey.get(`${server.authKind}\u0000${server.credentialName}`) ?? null
            : null,
        credentialName: server.credentialName ?? "",
        credentialSecret: "",
        isFavorite: server.isFavorite,
        tmuxSession: server.tmuxSession,
        useTmux: server.useTmux,
        notes: server.notes
      });
      if (server.id) {
        serverIdMap.set(server.id, createdServer.id);
      }
    }

    for (const project of bundle.projects) {
      const createdProject = createdProjectBySourceId.get(project.id);
      if (!createdProject) {
        continue;
      }

      const mappedLinkedServerId =
        project.linkedServerId === null ? "" : (serverIdMap.get(project.linkedServerId) ?? "");
      if ((createdProject.linkedServerId ?? "") === mappedLinkedServerId) {
        continue;
      }

      const updatedProject = await updateProject(createdProject.id, {
        name: createdProject.name,
        description: createdProject.description,
        path: createdProject.path,
        targetKind: createdProject.targetKind,
        linkedServerId: mappedLinkedServerId,
        githubRepoFullName: createdProject.githubRepoFullName,
        githubDefaultBranch: createdProject.githubDefaultBranch,
        serverHostname: "",
        serverPort: 22,
        serverUsername: "",
        serverAuthKind: "default",
        serverCredentialId: "",
        serverCredentialName: "",
        serverCredentialSecret: ""
      });
      createdProjectBySourceId.set(project.id, updatedProject);
    }

    if (bundle.terminalCommands !== null) {
      for (const command of bundle.terminalCommands) {
        await createTerminalCommand({
          name: command.name,
          command: command.command
        });
      }
    }

    setLocalSessionPresets(bundle.localSessionPresets);
    if (bundle.localGitRepositories !== null) {
      setLocalGitRepositories(bundle.localGitRepositories);
    }
    if (bundle.tmuxMetadata !== null) {
      setTmuxMetadata(bundle.tmuxMetadata);
    }
    if (bundle.sessionHistory !== null) {
      setSessionHistory(bundle.sessionHistory);
    }
    if (bundle.settings !== null) {
      updateSettings({
        ...bundle.settings,
        lastImportedAt: options?.importedAt ?? new Date().toISOString()
      });
    } else {
      updateSettings((current) => ({
        ...current,
        lastImportedAt: options?.importedAt ?? new Date().toISOString()
      }));
    }

    await refreshWorkspace();
    if (bundle.terminalCommands !== null) {
      await loadSavedTerminalCommands();
    }
    if (bundle.keychainItems !== null) {
      await refreshKeychain();
    }

    if (options?.announceSuccess) {
      pushToast("Imported the Hermes sync bundle.", "success");
    }
  };

  const handleExportSyncBundle = async () => {
    setSyncBusyAction("export");
    try {
      const exportedAt = new Date().toISOString();
      const bundle = await buildCurrentSyncBundle(exportedAt);

      const url = window.URL.createObjectURL(
        new Blob([JSON.stringify(bundle, null, 2)], {
          type: "application/json;charset=utf-8"
        })
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `hermes-sync-${exportedAt.slice(0, 10)}.json`;
      anchor.click();
      window.URL.revokeObjectURL(url);

      updateSettings((current) => ({
        ...current,
        lastExportedAt: exportedAt
      }));
      pushToast("Exported a Hermes sync bundle.", "success");
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setSyncBusyAction(null);
    }
  };

  const handleImportSyncBundle = async (file: File) => {
    const confirmation = window.confirm(
      `Replace the local Hermes sync domains included in ${file.name}?`
    );
    if (!confirmation) {
      return;
    }

    setSyncBusyAction("import");
    try {
      const bundle = parseHermesSyncBundle(await file.text(), devicePlatform);
      await applySyncBundle(bundle, {
        importedAt: new Date().toISOString(),
        announceSuccess: true
      });
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setSyncBusyAction(null);
    }
  };

  const applyRelaySession = (session: RelayWorkspaceSession, relayUrl: string) => {
    updateRelayState((current) => ({
      ...current,
      advancedRelayUrl: current.advancedRelayUrl || normalizeRelayUrl(relayUrl),
      workspaceName: session.workspace.name,
      workspaceId: session.workspace.id,
      relayId: session.relayId,
      currentDeviceId: session.currentDeviceId,
      currentDeviceRole: session.currentDeviceRole,
      currentDeviceStatus: session.currentDeviceStatus,
      adminToken:
        session.adminToken ??
        (session.currentDeviceRole === "master" && session.currentDeviceStatus === "approved"
          ? current.adminToken
          : null),
      devices: session.workspace.devices,
      latestSequence: session.latestSequence,
      latestSnapshotId: session.latestSnapshotId,
      latestSnapshotAt: session.latestSnapshotAt,
      lastConnectedAt: new Date().toISOString(),
      lastError: null
    }));
  };

  const finalizeRelaySession = async (
    session: RelayWorkspaceSession,
    relayUrl: string,
    options?: {
      synchronize?: boolean;
    }
  ) => {
    if (session.currentDeviceStatus === "approved" && !session.wrappedWorkspaceKey) {
      const hasLocalWorkspaceKey = await hasRelayWorkspaceKey(session.workspace.id).catch(() => false);
      applyRelaySession(session, relayUrl);
      throw new Error(
        hasLocalWorkspaceKey
          ? "Relay is missing this device's wrapped workspace key. Hermes refreshed the relay state, but the relay still needs this device's workspace-key wrap."
          : "Relay approved this device, but this device no longer has the local workspace key needed to repair the relay. Use another approved device to re-link it, or reset relay data if this is the only device and the current relay state can be discarded."
      );
    }

    if (session.wrappedWorkspaceKey) {
      await unwrapRelayWorkspaceKey(
        session.workspace.id,
        relayState.localDeviceId,
        session.wrappedWorkspaceKey
      );
    }

    applyRelaySession(session, relayUrl);
    if (options?.synchronize !== false && session.currentDeviceStatus === "approved") {
      await synchronizeRelayWorkspace(relayUrl, session);
    }
  };

  const getRelayCandidateUrls = (urls: Array<string | null | undefined>) => {
    const seen = new Set<string>();
    return urls
      .map((value) => normalizeRelayUrl(value ?? ""))
      .filter((value) => {
        if (!value || seen.has(value)) {
          return false;
        }
        seen.add(value);
        return true;
      });
  };

  const normalizeSyncBundleForHash = (
    bundle: HermesSyncBundle
  ) =>
    JSON.stringify({
      ...bundle,
      exportedAt: "",
      settings:
        bundle.settings === null
          ? null
          : {
              ...bundle.settings,
              lastExportedAt: null,
              lastImportedAt: null
            }
    });

  const canonicalizeSyncBundle = (bundle: HermesSyncBundle) => {
    const projectNamesById = new Map(
      bundle.projects.map((project) => [project.id, project.name.trim()] as const)
    );
    const serverKeysById = new Map(
      bundle.servers.map((server) => [
        server.id,
        `${projectNamesById.get(server.projectId) ?? server.projectId}\u0000${server.name.trim()}\u0000${server.hostname.trim()}\u0000${server.port}\u0000${server.username.trim()}\u0000${server.path.trim()}`
      ] as const)
    );

    return {
      settings:
        bundle.settings === null
          ? null
          : {
              ...bundle.settings,
              lastExportedAt: null,
              lastImportedAt: null
            },
      projects: bundle.projects
        .map((project) => ({
          name: project.name.trim(),
          description: project.description.trim(),
          path: project.path.trim(),
          targetKind: project.targetKind,
          linkedServerId:
            project.linkedServerId === null
              ? ""
              : (serverKeysById.get(project.linkedServerId) ?? ""),
          githubRepoFullName: project.githubRepoFullName.trim(),
          githubDefaultBranch: project.githubDefaultBranch.trim()
        }))
        .sort((left, right) =>
          `${left.name}\u0000${left.description}\u0000${left.path}\u0000${left.targetKind}\u0000${left.linkedServerId}\u0000${left.githubRepoFullName}\u0000${left.githubDefaultBranch}`.localeCompare(
            `${right.name}\u0000${right.description}\u0000${right.path}\u0000${right.targetKind}\u0000${right.linkedServerId}\u0000${right.githubRepoFullName}\u0000${right.githubDefaultBranch}`
          )
        ),
      servers: bundle.servers
        .map((server) => ({
          projectName: projectNamesById.get(server.projectId) ?? server.projectId,
          name: server.name.trim(),
          hostname: server.hostname.trim(),
          port: server.port,
          username: server.username.trim(),
          path: server.path.trim(),
          authKind: server.authKind,
          credentialName: server.credentialName ?? "",
          isFavorite: server.isFavorite,
          tmuxSession: server.tmuxSession.trim(),
          useTmux: server.useTmux,
          notes: server.notes.trim()
        }))
        .sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right))
        ),
      localSessionPresets: bundle.localSessionPresets
        .map((preset) => ({
          name: preset.name.trim(),
          path: preset.path.trim()
        }))
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
      localGitRepositories:
        bundle.localGitRepositories === null
          ? null
          : bundle.localGitRepositories
              .map((repository) => ({
                name: repository.name.trim(),
                path: repository.path.trim()
              }))
              .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
      terminalCommands:
        bundle.terminalCommands === null
          ? null
          : bundle.terminalCommands
              .map((command) => ({
                name: command.name.trim(),
                command: command.command.trim()
              }))
              .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
      keychainItems:
        bundle.keychainItems === null
          ? null
          : bundle.keychainItems
              .map((item) => ({
                name: item.name.trim(),
                kind: item.kind,
                secret: item.secret,
                publicKey: item.publicKey?.trim() || null
              }))
              .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
      tmuxMetadata:
        bundle.tmuxMetadata === null
          ? null
          : bundle.tmuxMetadata
              .map((record) => ({
                serverRef: record.serverRef.trim(),
                serverLabel: record.serverLabel.trim(),
                sessionNames: [...record.sessionNames].sort((left, right) => left.localeCompare(right)),
                lastAttachedSession: record.lastAttachedSession?.trim() || null,
                lastSeenAt: record.lastSeenAt
              }))
              .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
      sessionHistory:
        bundle.sessionHistory === null
          ? null
          : bundle.sessionHistory
              .map((record) => ({
                ...record,
                serverRef: record.serverRef?.trim() || null,
                serverLabel: record.serverLabel?.trim() || null,
                title: record.title.trim(),
                cwd: record.cwd?.trim() || null,
                tmuxSession: record.tmuxSession?.trim() || null,
                reason: record.reason.trim()
              }))
              .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    };
  };

  const getCanonicalDomainValue = (bundle: HermesSyncBundle, domain: SyncDomainId) =>
    canonicalizeSyncBundle(bundle)[domain];

  const domainEquals = (left: HermesSyncBundle, right: HermesSyncBundle, domain: SyncDomainId) =>
    JSON.stringify(getCanonicalDomainValue(left, domain)) ===
    JSON.stringify(getCanonicalDomainValue(right, domain));

  const bundleEquals = (left: HermesSyncBundle, right: HermesSyncBundle) =>
    JSON.stringify(canonicalizeSyncBundle(left)) === JSON.stringify(canonicalizeSyncBundle(right));

  const mergeSyncBundles = (
    base: HermesSyncBundle,
    local: HermesSyncBundle,
    remote: HermesSyncBundle
  ) => {
    const domains: SyncDomainId[] = [
      "settings",
      "projects",
      "servers",
      "localSessionPresets",
      "localGitRepositories",
      "terminalCommands",
      "keychainItems",
      "tmuxMetadata",
      "sessionHistory"
    ];
    const merged: HermesSyncBundle = {
      ...local,
      settings: local.settings,
      projects: local.projects,
      servers: local.servers,
      localSessionPresets: local.localSessionPresets,
      localGitRepositories: local.localGitRepositories,
      terminalCommands: local.terminalCommands,
      keychainItems: local.keychainItems,
      tmuxMetadata: local.tmuxMetadata,
      sessionHistory: local.sessionHistory
    };
    const conflictingDomains: SyncDomainId[] = [];
    const assignMergedDomain = (
      target: HermesSyncBundle,
      source: HermesSyncBundle,
      domain: SyncDomainId
    ) => {
      switch (domain) {
        case "settings":
          target.settings = source.settings;
          break;
        case "projects":
          target.projects = source.projects;
          break;
        case "servers":
          target.servers = source.servers;
          break;
        case "localSessionPresets":
          target.localSessionPresets = source.localSessionPresets;
          break;
        case "localGitRepositories":
          target.localGitRepositories = source.localGitRepositories;
          break;
        case "terminalCommands":
          target.terminalCommands = source.terminalCommands;
          break;
        case "keychainItems":
          target.keychainItems = source.keychainItems;
          break;
        case "tmuxMetadata":
          target.tmuxMetadata = source.tmuxMetadata;
          break;
        case "sessionHistory":
          target.sessionHistory = source.sessionHistory;
          break;
      }
    };

    for (const domain of domains) {
      const baseEqualsLocal = domainEquals(base, local, domain);
      const baseEqualsRemote = domainEquals(base, remote, domain);
      const localEqualsRemote = domainEquals(local, remote, domain);

      if (baseEqualsLocal && !baseEqualsRemote) {
        assignMergedDomain(merged, remote, domain);
        continue;
      }

      if (baseEqualsRemote || localEqualsRemote) {
        assignMergedDomain(merged, local, domain);
        continue;
      }

      conflictingDomains.push(domain);
    }

    merged.exportedAt = new Date().toISOString();
    return {
      merged,
      conflictingDomains
    };
  };

  const fillBundleMissingDomains = (
    bundle: HermesSyncBundle,
    fallback: HermesSyncBundle | null
  ): HermesSyncBundle => {
    if (!fallback) {
      return bundle;
    }

    return {
      ...bundle,
      settings: bundle.settings ?? fallback.settings,
      localGitRepositories: bundle.localGitRepositories ?? fallback.localGitRepositories,
      terminalCommands: bundle.terminalCommands ?? fallback.terminalCommands,
      keychainItems: bundle.keychainItems ?? fallback.keychainItems,
      tmuxMetadata: bundle.tmuxMetadata ?? fallback.tmuxMetadata,
      sessionHistory: bundle.sessionHistory ?? fallback.sessionHistory
    };
  };

  const hashRelayPayload = async (payload: string) => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(payload)
    );
    return btoa(String.fromCharCode(...new Uint8Array(digest)));
  };

  const setRelayConflict = (message: string | null) => {
    if (!message) {
      setRelayConflictState(null);
    }
    updateRelayState((current) => ({
      ...current,
      syncConflict: message,
      lastError: message
    }));
  };

  const getCurrentSyncPayload = async () => {
    const exportedAt = new Date().toISOString();
    const rawBundle = await buildCurrentSyncBundle(exportedAt);
    const bundle = fillBundleMissingDomains(
      rawBundle,
      relayState.lastAppliedBundleJson
        ? parseHermesSyncBundle(relayState.lastAppliedBundleJson, devicePlatform)
        : null
    );
    const payloadJson = JSON.stringify(bundle);
    const payloadHash = await hashRelayPayload(normalizeSyncBundleForHash(bundle));
    return {
      bundle,
      exportedAt,
      payloadJson,
      payloadHash
    };
  };

  const pullLatestRelaySnapshot = async (
    relayUrl: string,
    options?: {
      workspaceId?: string;
      deviceId?: string;
      devices?: RelayWorkspaceSession["workspace"]["devices"];
      latestSnapshotId?: string | null;
      appliedSequence?: number;
    }
  ) => {
    const workspaceId = options?.workspaceId ?? relayState.workspaceId;
    const deviceId = options?.deviceId ?? relayState.currentDeviceId;
    const devices = options?.devices ?? relayState.devices;
    const knownSnapshotId = options?.latestSnapshotId ?? relayState.latestSnapshotId;
    const appliedSequence = options?.appliedSequence ?? relayState.lastAppliedSequence;

    if (!workspaceId || !deviceId) {
      return false;
    }

    const latest = await getRelayLatestSnapshot(relayUrl, {
      workspaceId,
      deviceId
    });

    updateRelayState((current) => ({
      ...current,
      latestSequence: latest.latestSequence,
      latestSnapshotId: latest.snapshot?.snapshotId ?? current.latestSnapshotId,
      latestSnapshotAt: latest.snapshot?.createdAt ?? current.latestSnapshotAt
    }));

    if (!latest.snapshot) {
      return false;
    }

    if (knownSnapshotId && latest.snapshot.snapshotId === knownSnapshotId) {
      return false;
    }

    const author = devices.find((candidate) => candidate.id === latest.snapshot?.authorDeviceId);
    if (!author) {
      throw new Error("Relay snapshot author is not known to this device.");
    }

    const payloadJson = await decryptRelayEncryptedSnapshot(
      workspaceId,
      deviceId,
      author.publicKeys.signingPublicKey,
      latest.snapshot
    );
    const bundle = parseHermesSyncBundle(payloadJson, devicePlatform);
    const payloadHash = await hashRelayPayload(normalizeSyncBundleForHash(bundle));

    if (relayLastPublishedPayloadRef.current === payloadJson) {
      updateRelayState((current) => ({
        ...current,
        latestSequence: latest.latestSequence,
        latestSnapshotId: latest.snapshot?.snapshotId ?? current.latestSnapshotId,
        latestSnapshotAt: latest.snapshot?.createdAt ?? current.latestSnapshotAt,
        lastAppliedSequence: latest.latestSequence,
        lastAppliedPayloadHash: payloadHash,
        lastAppliedBundleJson: payloadJson,
        syncConflict: null
      }));
      return false;
    }

    relayApplyingSnapshotRef.current = true;
    try {
      await applySyncBundle(bundle, {
        importedAt: latest.snapshot.createdAt
      });
      relayLastPublishedPayloadRef.current = payloadJson;
      updateRelayState((current) => ({
        ...current,
        latestSequence: latest.latestSequence,
        latestSnapshotId: latest.snapshot?.snapshotId ?? current.latestSnapshotId,
        latestSnapshotAt: latest.snapshot?.createdAt ?? current.latestSnapshotAt,
        lastAppliedSequence: Math.max(appliedSequence, latest.latestSequence),
        lastAppliedPayloadHash: payloadHash,
        lastAppliedBundleJson: payloadJson,
        syncConflict: null,
        lastError: null
      }));
    } finally {
      relayApplyingSnapshotRef.current = false;
    }

    return true;
  };

  const publishRelaySnapshot = async (relayUrl: string) => {
    if (!relayState.workspaceId || !relayState.currentDeviceId) {
      return false;
    }

    const { exportedAt, payloadJson, payloadHash } = await getCurrentSyncPayload();
    if (relayState.syncConflict) {
      return false;
    }
    if (relayLastPublishedPayloadRef.current === payloadJson && relayState.latestSnapshotId) {
      return false;
    }

    const snapshotId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const event = await createRelayEncryptedEvent(
      relayState.workspaceId,
      relayState.currentDeviceId,
      eventId,
      relayState.latestSequence + 1,
      JSON.stringify({
        kind: "workspace.snapshot.updated",
        snapshotId,
        payloadHash,
        exportedAt
      })
    );
    const acceptedEvents = await postRelayEvents(relayUrl, {
      workspaceId: relayState.workspaceId,
      deviceId: relayState.currentDeviceId,
      events: [event]
    });
    const snapshot = await createRelayEncryptedSnapshot(
      relayState.workspaceId,
      relayState.currentDeviceId,
      snapshotId,
      acceptedEvents.acceptedThroughSequence,
      payloadJson
    );
    const latestSnapshot = await postRelaySnapshot(relayUrl, {
      workspaceId: relayState.workspaceId,
      deviceId: relayState.currentDeviceId,
      snapshot
    });

    relayLastPublishedPayloadRef.current = payloadJson;
    updateRelayState((current) => ({
      ...current,
      latestSequence: latestSnapshot.latestSequence,
      latestSnapshotId: latestSnapshot.snapshot?.snapshotId ?? current.latestSnapshotId,
      latestSnapshotAt: latestSnapshot.snapshot?.createdAt ?? current.latestSnapshotAt,
      lastAppliedSequence: latestSnapshot.latestSequence,
      lastAppliedPayloadHash: payloadHash,
      lastAppliedBundleJson: payloadJson,
      syncConflict: null,
      lastError: null
    }));

    return true;
  };

  const replayRelayEvents = async (
    relayUrl: string,
    options?: {
      workspaceId?: string;
      deviceId?: string;
      devices?: RelayWorkspaceSession["workspace"]["devices"];
      appliedSequence?: number;
    }
  ) => {
    const workspaceId = options?.workspaceId ?? relayState.workspaceId;
    const deviceId = options?.deviceId ?? relayState.currentDeviceId;
    const devices = options?.devices ?? relayState.devices;
    const appliedSequence = options?.appliedSequence ?? relayState.lastAppliedSequence;

    if (!workspaceId || !deviceId) {
      return {
        remoteAdvanced: false,
        remoteChanged: false,
        latestSequence: appliedSequence
      };
    }

    const replay = await getRelayEvents(relayUrl, {
      workspaceId,
      deviceId,
      afterSequence: appliedSequence
    });

    if (replay.events.length === 0) {
      updateRelayState((current) => ({
        ...current,
        latestSequence: Math.max(current.latestSequence, replay.latestSequence)
      }));
      return {
        remoteAdvanced: replay.latestSequence > appliedSequence,
        remoteChanged: false,
        latestSequence: replay.latestSequence
      };
    }

    let remoteChanged = false;

    for (const event of replay.events) {
      const author = devices.find((candidate) => candidate.id === event.authorDeviceId);
      if (!author) {
        continue;
      }

      const payloadJson = await decryptRelayEncryptedEvent(
        workspaceId,
        deviceId,
        author.publicKeys.signingPublicKey,
        event
      );
      const payload = JSON.parse(payloadJson) as {
        kind?: string;
        payloadHash?: string;
      };
      if (
        event.authorDeviceId !== deviceId &&
        payload.kind === "workspace.snapshot.updated"
      ) {
        remoteChanged = true;
      }
    }

    updateRelayState((current) => ({
      ...current,
      latestSequence: Math.max(current.latestSequence, replay.latestSequence)
    }));

    return {
      remoteAdvanced: true,
      remoteChanged,
      latestSequence: replay.latestSequence
    };
  };

  const synchronizeRelayWorkspace = async (
    relayUrl: string,
    session: RelayWorkspaceSession
  ) => {
    if (session.currentDeviceStatus !== "approved") {
      return;
    }

    const currentSync = await getCurrentSyncPayload();
    const replay = await replayRelayEvents(relayUrl, {
      workspaceId: session.workspace.id,
      deviceId: session.currentDeviceId,
      devices: session.workspace.devices,
      appliedSequence: relayState.lastAppliedSequence
    });
    const localDirty =
      relayState.lastAppliedPayloadHash !== null &&
      relayState.lastAppliedPayloadHash !== currentSync.payloadHash;

    if (replay.remoteChanged || session.latestSnapshotId !== relayState.latestSnapshotId) {
      if (!localDirty) {
        setRelayConflict(null);
        await pullLatestRelaySnapshot(relayUrl, {
          workspaceId: session.workspace.id,
          deviceId: session.currentDeviceId,
          devices: session.workspace.devices,
          latestSnapshotId: relayState.latestSnapshotId,
          appliedSequence: relayState.lastAppliedSequence
        });
        return;
      }

      const latest = await getRelayLatestSnapshot(relayUrl, {
        workspaceId: session.workspace.id,
        deviceId: session.currentDeviceId
      });
      if (!latest.snapshot) {
        setRelayConflict(null);
        await publishRelaySnapshot(relayUrl);
        return;
      }

      const author = session.workspace.devices.find(
        (device) => device.id === latest.snapshot?.authorDeviceId
      );
      if (!author) {
        throw new Error("Relay snapshot author is not known to this device.");
      }

      const remotePayloadJson = await decryptRelayEncryptedSnapshot(
        session.workspace.id,
        session.currentDeviceId,
        author.publicKeys.signingPublicKey,
        latest.snapshot
      );
      const remoteBundle = parseHermesSyncBundle(remotePayloadJson, devicePlatform);
      const remotePayloadHash = await hashRelayPayload(normalizeSyncBundleForHash(remoteBundle));
      const baseBundle = relayState.lastAppliedBundleJson
        ? parseHermesSyncBundle(relayState.lastAppliedBundleJson, devicePlatform)
        : null;

      if (!baseBundle) {
        const allDomains: SyncDomainId[] = [
          "settings",
          "projects",
          "servers",
          "localSessionPresets",
          "localGitRepositories",
          "terminalCommands",
          "keychainItems",
          "tmuxMetadata",
          "sessionHistory"
        ];
        setRelayConflict(
          "Relay sync needs a local base snapshot before it can merge concurrent changes. Choose whether to keep the local or remote version."
        );
        setRelayConflictState({
          relayUrl,
          remoteBundle,
          localBundle: currentSync.bundle,
          mergedBundle: currentSync.bundle,
          conflictingDomains: allDomains,
          remoteSnapshotId: latest.snapshot.snapshotId,
          remoteSequence: latest.latestSequence,
          remotePayloadHash
        });
        return;
      }

      const merge = mergeSyncBundles(baseBundle, currentSync.bundle, remoteBundle);
      if (merge.conflictingDomains.length > 0) {
        setRelayConflict(
          `Relay sync found concurrent changes in ${merge.conflictingDomains.join(", ")}. Choose whether to keep the local or remote version for those domains.`
        );
        setRelayConflictState({
          relayUrl,
          remoteBundle,
          localBundle: currentSync.bundle,
          mergedBundle: merge.merged,
          conflictingDomains: merge.conflictingDomains,
          remoteSnapshotId: latest.snapshot.snapshotId,
          remoteSequence: latest.latestSequence,
          remotePayloadHash
        });
        return;
      }

      setRelayConflict(null);
      if (!bundleEquals(currentSync.bundle, merge.merged)) {
        relayApplyingSnapshotRef.current = true;
        try {
          await applySyncBundle(merge.merged, {
            importedAt: new Date().toISOString()
          });
        } finally {
          relayApplyingSnapshotRef.current = false;
        }
      }

      await publishRelaySnapshot(relayUrl);
      return;
    }

    setRelayConflict(null);
    if (
      relayState.lastAppliedPayloadHash === null ||
      relayState.lastAppliedPayloadHash !== currentSync.payloadHash
    ) {
      await publishRelaySnapshot(relayUrl);
    }
  };

  const resolveRelayConflict = async (strategy: "local" | "remote") => {
    if (!relayConflictState) {
      return;
    }

    const resolvedBundle: HermesSyncBundle = {
      ...relayConflictState.mergedBundle,
      settings:
        relayConflictState.conflictingDomains.includes("settings")
          ? strategy === "local"
            ? relayConflictState.localBundle.settings
            : relayConflictState.remoteBundle.settings
          : relayConflictState.mergedBundle.settings,
      projects:
        relayConflictState.conflictingDomains.includes("projects")
          ? strategy === "local"
            ? relayConflictState.localBundle.projects
            : relayConflictState.remoteBundle.projects
          : relayConflictState.mergedBundle.projects,
      servers:
        relayConflictState.conflictingDomains.includes("servers")
          ? strategy === "local"
            ? relayConflictState.localBundle.servers
            : relayConflictState.remoteBundle.servers
          : relayConflictState.mergedBundle.servers,
      localSessionPresets:
        relayConflictState.conflictingDomains.includes("localSessionPresets")
          ? strategy === "local"
            ? relayConflictState.localBundle.localSessionPresets
            : relayConflictState.remoteBundle.localSessionPresets
          : relayConflictState.mergedBundle.localSessionPresets,
      localGitRepositories:
        relayConflictState.conflictingDomains.includes("localGitRepositories")
          ? strategy === "local"
            ? relayConflictState.localBundle.localGitRepositories
            : relayConflictState.remoteBundle.localGitRepositories
          : relayConflictState.mergedBundle.localGitRepositories,
      terminalCommands:
        relayConflictState.conflictingDomains.includes("terminalCommands")
          ? strategy === "local"
            ? relayConflictState.localBundle.terminalCommands
            : relayConflictState.remoteBundle.terminalCommands
          : relayConflictState.mergedBundle.terminalCommands,
      keychainItems:
        relayConflictState.conflictingDomains.includes("keychainItems")
          ? strategy === "local"
            ? relayConflictState.localBundle.keychainItems
            : relayConflictState.remoteBundle.keychainItems
          : relayConflictState.mergedBundle.keychainItems,
      tmuxMetadata:
        relayConflictState.conflictingDomains.includes("tmuxMetadata")
          ? strategy === "local"
            ? relayConflictState.localBundle.tmuxMetadata
            : relayConflictState.remoteBundle.tmuxMetadata
          : relayConflictState.mergedBundle.tmuxMetadata,
      sessionHistory:
        relayConflictState.conflictingDomains.includes("sessionHistory")
          ? strategy === "local"
            ? relayConflictState.localBundle.sessionHistory
            : relayConflictState.remoteBundle.sessionHistory
          : relayConflictState.mergedBundle.sessionHistory
    };

    setRelayBusyAction("refresh");
    try {
      relayApplyingSnapshotRef.current = true;
      await applySyncBundle(resolvedBundle, {
        importedAt: new Date().toISOString()
      });
      relayApplyingSnapshotRef.current = false;

      setRelayConflict(null);
      if (bundleEquals(resolvedBundle, relayConflictState.remoteBundle)) {
        const payloadHash = await hashRelayPayload(normalizeSyncBundleForHash(resolvedBundle));
        updateRelayState((current) => ({
          ...current,
          latestSequence: relayConflictState.remoteSequence,
          latestSnapshotId: relayConflictState.remoteSnapshotId,
          lastAppliedSequence: relayConflictState.remoteSequence,
          lastAppliedPayloadHash: payloadHash,
          lastAppliedBundleJson: JSON.stringify(relayConflictState.remoteBundle),
          syncConflict: null,
          lastError: null
        }));
        relayLastPublishedPayloadRef.current = JSON.stringify(relayConflictState.remoteBundle);
        setRelayConflictState(null);
      } else {
        setRelayConflictState(null);
        await publishRelaySnapshot(relayConflictState.relayUrl);
      }

      pushToast(
        strategy === "local"
          ? "Applied local conflict resolution and resumed relay sync."
          : "Accepted remote conflict resolution and resumed relay sync.",
        "success"
      );
    } catch (error) {
      relayApplyingSnapshotRef.current = false;
      handleRelayError(error);
    } finally {
      setRelayBusyAction(null);
    }
  };

  const connectRelayAtUrl = async (relayUrl: string) => {
    const health = await getRelayHealth(relayUrl);

    updateRelayState((current) => ({
      ...current,
      relayId: health.relayId,
      lastError: null
    }));

    const identity = await getOrCreateRelayDeviceIdentity(relayState.localDeviceId);
    const workspaceId = relayState.workspaceId ?? crypto.randomUUID();
    const workspaceName = relayState.workspaceName.trim() || "Hermes";
    const bootstrapWorkspace = !relayState.workspaceId;
    const shouldRepairSelfWrap =
      !bootstrapWorkspace && (await hasRelayWorkspaceKey(workspaceId));
    const workspaceBootstrap = bootstrapWorkspace || shouldRepairSelfWrap
      ? {
          workspaceId,
          workspaceName,
          wrappedWorkspaceKey: await wrapRelayWorkspaceKeyForDevice(
            workspaceId,
            relayState.localDeviceId,
            relayState.localDeviceId,
            identity.publicKeys.encryptionPublicKey
          )
        }
      : undefined;
    const session = await connectRelayWorkspace(relayUrl, {
      deviceId: relayState.localDeviceId,
      deviceName: relayState.deviceName.trim(),
      devicePlatform: devicePlatform,
      publicKeys: identity.publicKeys,
      workspaceBootstrap
    });

    await finalizeRelaySession(session, relayUrl);

    return {
      autoBootstrapped:
        bootstrapWorkspace &&
        session.currentDeviceRole === "master" &&
        session.currentDeviceStatus === "approved",
      health,
      session
    };
  };

  const connectRelayWithCandidates = async (candidateUrls: string[]) => {
    let lastError: unknown = null;

    for (const candidateUrl of candidateUrls) {
      try {
        const result = await connectRelayAtUrl(candidateUrl);
        updateRelayState((current) => ({
          ...current,
          advancedRelayUrl: candidateUrl
        }));
        return {
          ...result,
          relayUrl: candidateUrl
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error("No relay endpoint was available.");
  };

  const inspectRelayWithCandidates = async (candidateUrls: string[]) => {
    if (!relayState.workspaceId || !relayState.currentDeviceId) {
      return connectRelayWithCandidates(candidateUrls);
    }

    let lastError: unknown = null;

    for (const candidateUrl of candidateUrls) {
      try {
        const health = await getRelayHealth(candidateUrl);
        updateRelayState((current) => ({
          ...current,
          relayId: health.relayId,
          lastError: null
        }));

        const session = await inspectRelayWorkspace(candidateUrl, {
          workspaceId: relayState.workspaceId,
          deviceId: relayState.currentDeviceId,
          adminToken: relayState.adminToken
        });

        const hasLocalWorkspaceKey =
          session.currentDeviceStatus === "approved" && !session.wrappedWorkspaceKey
            ? await hasRelayWorkspaceKey(session.workspace.id).catch(() => false)
            : false;

        if (hasLocalWorkspaceKey) {
          return connectRelayAtUrl(candidateUrl).then((result) => ({
            ...result,
            relayUrl: candidateUrl
          }));
        }

        await finalizeRelaySession(session, candidateUrl, { synchronize: false });
        updateRelayState((current) => ({
          ...current,
          advancedRelayUrl: candidateUrl
        }));
        return {
          autoBootstrapped: false,
          health,
          relayUrl: candidateUrl,
          session
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error("No relay endpoint was available.");
  };

  useEffect(() => {
    if (!localAccountName) {
      return;
    }

    const currentName = relayState.deviceName.trim();
    if (currentName && currentName !== defaultRelayDeviceLabel) {
      return;
    }

    if (currentName === localAccountName) {
      return;
    }

    updateRelayState((current) => ({
      ...current,
      deviceName: localAccountName
    }));
  }, [defaultRelayDeviceLabel, localAccountName, relayState.deviceName]);

  useEffect(() => {
    if (!localAccountName || !relayState.currentDeviceId) {
      return;
    }

    const currentDevice = relayState.devices.find(
      (device) => device.id === relayState.currentDeviceId
    );
    if (relayState.deviceName !== localAccountName || currentDevice?.name === localAccountName) {
      return;
    }

    const candidateUrls = getRelayCandidateUrls([
      relayUrls.primary,
      ...relayState.detectedRelayUrls
    ]);
    if (candidateUrls.length === 0 || relayDeviceNameSyncRef.current) {
      return;
    }

    relayDeviceNameSyncRef.current = true;
    void connectRelayWithCandidates(candidateUrls)
      .catch(() => undefined)
      .finally(() => {
        relayDeviceNameSyncRef.current = false;
      });
  }, [
    localAccountName,
    relayState.currentDeviceId,
    relayState.deviceName,
    relayState.detectedRelayUrls,
    relayState.devices,
    relayUrls.primary
  ]);

  useEffect(() => {
    if (relayApplyingSnapshotRef.current || relaySyncInFlightRef.current) {
      return;
    }
    if (relayState.currentDeviceStatus !== "approved" || !relayState.workspaceId || !relayState.currentDeviceId) {
      return;
    }

    const candidateUrls = getRelayCandidateUrls([
      relayUrls.primary,
      ...relayState.detectedRelayUrls
    ]);
    if (candidateUrls.length === 0) {
      return;
    }

    if (relaySyncDebounceRef.current !== null) {
      window.clearTimeout(relaySyncDebounceRef.current);
    }

    relaySyncDebounceRef.current = window.setTimeout(() => {
      relaySyncDebounceRef.current = null;
      relaySyncInFlightRef.current = true;

      void synchronizeRelayWorkspace(candidateUrls[0], {
        relayUrl: candidateUrls[0],
        relayId: relayState.relayId ?? "",
        workspace: {
          id: relayState.workspaceId as string,
          name: relayState.workspaceName,
          createdAt: "",
          masterDeviceId:
            relayState.devices.find((device) => device.role === "master")?.id ??
            relayState.currentDeviceId!,
          devices: relayState.devices
        },
        currentDeviceId: relayState.currentDeviceId as string,
        currentDeviceRole: relayState.currentDeviceRole,
        currentDeviceStatus: relayState.currentDeviceStatus!,
        wrappedWorkspaceKey: null,
        adminToken: relayState.adminToken,
        latestSequence: relayState.latestSequence,
        latestSnapshotId: relayState.latestSnapshotId,
        latestSnapshotAt: relayState.latestSnapshotAt
      })
        .catch((error) => {
          updateRelayState((current) => ({
            ...current,
            lastError: getErrorMessage(error)
          }));
        })
        .finally(() => {
          relaySyncInFlightRef.current = false;
        });
    }, 1500);

    return () => {
      if (relaySyncDebounceRef.current !== null) {
        window.clearTimeout(relaySyncDebounceRef.current);
        relaySyncDebounceRef.current = null;
      }
    };
  }, [
    keychainItems,
    localGitRepositories,
    localSessionPresets,
    projects,
    relayState.currentDeviceId,
    relayState.currentDeviceStatus,
    relayState.detectedRelayUrls,
    relayState.devices,
    relayState.latestSequence,
    relayState.latestSnapshotId,
    relayState.lastAppliedPayloadHash,
    relayState.lastAppliedSequence,
    relayState.workspaceId,
    relayState.workspaceName,
    relayUrls.primary,
    servers,
    settings,
    sessionHistory,
    terminalCommands,
    tmuxMetadata
  ]);

  const handleCheckRelayHealth = async () => {
    const candidateUrls = getRelayCandidateUrls([
      relayUrls.primary,
      ...relayState.detectedRelayUrls
    ]);
    if (candidateUrls.length === 0) {
      pushToast("Choose a relay host server first.", "info");
      return;
    }

    setRelayBusyAction("health");
    setRelayInstallState("checking");
    setRelayInstallMessage("Checking the relay health endpoint and linking this device if it is reachable.");
    try {
      const { autoBootstrapped, health, relayUrl, session } = await connectRelayWithCandidates(candidateUrls);
      setRelayInstallState("ready");
      setRelayInstallMessage(
        autoBootstrapped
          ? `Relay ${health.relayId.slice(0, 8)} is reachable. This device is now the master.`
          : session.currentDeviceStatus === "pending"
            ? `Relay ${health.relayId.slice(0, 8)} is reachable at ${relayUrl}. This device is waiting for master approval.`
            : `Relay ${health.relayId.slice(0, 8)} is reachable at ${relayUrl} and linked.`
      );
      pushToast(
        autoBootstrapped
          ? `Relay ${health.relayId.slice(0, 8)} is reachable. This device is now the master.`
          : `Relay ${health.relayId.slice(0, 8)} is reachable.`,
        "success"
      );
    } catch (error) {
      handleRelayError(error);
    } finally {
      setRelayBusyAction(null);
    }
  };

  const handleInspectRelayHost = async () => {
    await handleInspectRelayHostByServerId(relayState.hostServerId);
  };

  const handleInspectRelayHostByServerId = async (
    serverId: string | null,
    options?: {
      silentIfConnected?: boolean;
    }
  ) => {
    if (!serverId) {
      pushToast("Choose a relay host server first.", "info");
      return;
    }

    setRelayBusyAction("inspect");
    setRelayInstallState("checking");
    setRelayInstallMessage("Inspecting the selected host, checking Tailscale, and discovering the relay endpoint.");
    try {
      const inspection = await inspectRelayHost(serverId);
      const detectedRelayUrl = inspection.suggestedRelayUrl;

      updateRelayState((current) => ({
        ...current,
        hostServerId: serverId,
        advancedRelayUrl: detectedRelayUrl ?? current.advancedRelayUrl,
        detectedRelayUrl,
        detectedRelayUrls: inspection.suggestedRelayUrls,
        tailscaleIpv4: inspection.tailscaleIpv4,
        tailscaleDnsName: inspection.tailscaleDnsName,
        relayInstalled: inspection.relayInstalled,
        relayRunning: inspection.relayRunning,
        relayHealthy: inspection.relayHealthy,
        relayVersion: inspection.relayVersion,
        relayId: inspection.relayId ?? current.relayId,
        lastHostCheckAt: new Date().toISOString(),
        lastError: null
      }));

      if (!inspection.tailscaleInstalled) {
        setRelayInstallState("error");
        setRelayInstallMessage("Tailscale is not installed on the relay host.");
        pushToast("Tailscale is not installed on the relay host.", "error");
        return;
      }

      if (!inspection.tailscaleConnected || !detectedRelayUrl) {
        setRelayInstallState("error");
        setRelayInstallMessage("Tailscale is installed, but no reachable relay endpoint was discovered.");
        pushToast("Tailscale is installed, but no reachable relay endpoint was discovered.", "error");
        return;
      }

      const candidateUrls = getRelayCandidateUrls(inspection.suggestedRelayUrls);
      if (!inspection.relayInstalled) {
        setRelayInstallState("idle");
        setRelayInstallMessage("Host inspection passed. Install Hermes Relay and Hermes will keep checking until it is reachable.");
        return;
      }

      if (!inspection.relayHealthy) {
        setRelayInstallState("checking");
        setRelayInstallMessage("Relay package is present on the host. Finish installation or run a relay health check once the container is ready.");
        return;
      }

      const { autoBootstrapped, health, relayUrl, session } = await connectRelayWithCandidates(candidateUrls);
      setRelayInstallState("ready");
      setRelayInstallMessage(
        autoBootstrapped
          ? `Relay ${health.relayId.slice(0, 8)} is reachable. This device is now the master.`
          : session.currentDeviceStatus === "pending"
            ? `Relay is reachable at ${relayUrl}. This device is waiting for master approval.`
          : inspection.relayHealthy
            ? `Relay already detected on this server and this device is linked.`
            : `Host inspection completed. Hermes will use ${relayUrl}.`
      );
    } catch (error) {
      handleRelayError(error);
    } finally {
      setRelayBusyAction(null);
    }
  };

  const handleRefreshRelayWorkspace = async () => {
    const candidateUrls = getRelayCandidateUrls([
      relayUrls.primary,
      ...relayState.detectedRelayUrls
    ]);
    if (candidateUrls.length === 0) {
      pushToast("Choose a relay host server first.", "info");
      return;
    }

    setRelayBusyAction("refresh");
    setRelayInstallState("checking");
    setRelayInstallMessage("Refreshing the linked device state from the relay.");
    try {
      await inspectRelayWithCandidates(candidateUrls);
      setRelayInstallState("ready");
      setRelayInstallMessage("Relay device state refreshed.");
      pushToast("Refreshed relay workspace state.", "success");
    } catch (error) {
      handleRelayError(error);
    } finally {
      setRelayBusyAction(null);
    }
  };

  const handleRevokeRelayDevice = async (deviceId: string) => {
    if (!relayState.workspaceId || !relayState.adminToken) {
      pushToast("Only the relay master device can revoke linked devices.", "info");
      return;
    }

    setRelayBusyAction("revoke");
    try {
      const remainingApprovedDevices = relayState.devices.filter(
        (device) =>
          device.id !== deviceId &&
          device.status === "approved" &&
          device.revokedAt === null
      );
      if (remainingApprovedDevices.length === 0) {
        throw new Error("At least one approved device must remain after relay rotation.");
      }

      await rotateRelayWorkspaceKey(relayState.workspaceId);
      const replacementWorkspaceKeyWraps = await Promise.all(
        remainingApprovedDevices.map((device) =>
          wrapRelayWorkspaceKeyForDevice(
            relayState.workspaceId as string,
            relayState.currentDeviceId ?? relayState.localDeviceId,
            device.id,
            device.publicKeys.encryptionPublicKey
          )
        )
      );
      const session = await revokeRelayDevice(normalizeRelayUrl(relayUrls.primary), {
        workspaceId: relayState.workspaceId,
        adminToken: relayState.adminToken,
        deviceId,
        replacementWorkspaceKeyWraps
      });
      applyRelaySession(session, relayUrls.primary);
      await publishRelaySnapshot(normalizeRelayUrl(relayUrls.primary));
      pushToast("Revoked linked device.", "success");
    } catch (error) {
      handleRelayError(error);
    } finally {
      setRelayBusyAction(null);
    }
  };

  const handleApproveRelayDevice = async (deviceId: string) => {
    if (!relayState.workspaceId || !relayState.adminToken || relayState.currentDeviceRole !== "master") {
      pushToast("Only the relay master device can approve pending devices.", "info");
      return;
    }

    const pendingDevice = relayState.devices.find((device) => device.id === deviceId);
    if (!pendingDevice || pendingDevice.status !== "pending") {
      pushToast("This relay device is no longer waiting for approval.", "info");
      return;
    }

    setRelayBusyAction("approve");
    try {
      const hasLocalWorkspaceKey = await hasRelayWorkspaceKey(relayState.workspaceId);
      if (!hasLocalWorkspaceKey) {
        throw new Error(
          "This admin device no longer has the local workspace key needed to approve or re-link other devices."
        );
      }
      const wrappedWorkspaceKey = await wrapRelayWorkspaceKeyForDevice(
        relayState.workspaceId,
        relayState.currentDeviceId ?? relayState.localDeviceId,
        pendingDevice.id,
        pendingDevice.publicKeys.encryptionPublicKey
      );
      const session = await approveRelayDevice(normalizeRelayUrl(relayUrls.primary), {
        workspaceId: relayState.workspaceId,
        adminToken: relayState.adminToken,
        pendingDeviceId: pendingDevice.id,
        wrappedWorkspaceKey
      });
      applyRelaySession(session, relayUrls.primary);
      pushToast(`Approved ${pendingDevice.name}.`, "success");
    } catch (error) {
      handleRelayError(error);
    } finally {
      setRelayBusyAction(null);
    }
  };

  const handleRelinkRelayDevice = async (deviceId: string) => {
    if (!relayState.workspaceId || !relayState.adminToken || relayState.currentDeviceRole !== "master") {
      pushToast("Only the relay master device can re-link approved devices.", "info");
      return;
    }

    const targetDevice = relayState.devices.find((device) => device.id === deviceId);
    if (!targetDevice || targetDevice.status !== "approved") {
      pushToast("This relay device must already be approved before it can be re-linked.", "info");
      return;
    }

    setRelayBusyAction("relink");
    try {
      const hasLocalWorkspaceKey = await hasRelayWorkspaceKey(relayState.workspaceId);
      if (!hasLocalWorkspaceKey) {
        throw new Error(
          "This admin device no longer has the local workspace key needed to approve or re-link other devices."
        );
      }

      const wrappedWorkspaceKey = await wrapRelayWorkspaceKeyForDevice(
        relayState.workspaceId,
        relayState.currentDeviceId ?? relayState.localDeviceId,
        targetDevice.id,
        targetDevice.publicKeys.encryptionPublicKey
      );
      const session = await approveRelayDevice(normalizeRelayUrl(relayUrls.primary), {
        workspaceId: relayState.workspaceId,
        adminToken: relayState.adminToken,
        pendingDeviceId: targetDevice.id,
        wrappedWorkspaceKey
      });
      applyRelaySession(session, relayUrls.primary);
      pushToast(`Re-linked ${targetDevice.name}.`, "success");
    } catch (error) {
      handleRelayError(error);
    } finally {
      setRelayBusyAction(null);
    }
  };

  const handleBrowseLocalSessionPresetPath = async () => {
    if (!isTauriRuntime()) {
      pushToast("Folder picking is only available in the desktop app.", "info");
      return;
    }

    try {
      const selection = await open({
        directory: true,
        multiple: false,
        title: "Choose local session directory"
      });

      if (typeof selection === "string") {
        setLocalSessionPresetPath(selection);
      }
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    }
  };

  const handleBrowseKeychainSecret = async () => {
    if (!isTauriRuntime()) {
      pushToast("SSH key browsing is only available in the desktop app.", "info");
      return;
    }

    if (keychainKindDraft !== "sshKey") {
      return;
    }

    try {
      const defaultPath = await getDefaultSshDirectory();
      const selection = await open({
        defaultPath: defaultPath ?? undefined,
        directory: false,
        multiple: false,
        title: "Choose SSH private key"
      });

      if (typeof selection === "string") {
        setKeychainSecretDraft(selection);
      }
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    }
  };

  const handleBrowseLocalSshKeyDirectory = async () => {
    if (!isTauriRuntime()) {
      pushToast("SSH key browsing is only available in the desktop app.", "info");
      return;
    }

    try {
      const defaultPath = await getDefaultSshDirectory();
      const selection = await open({
        defaultPath: defaultPath ?? undefined,
        directory: true,
        multiple: false,
        title: "Choose SSH key directory"
      });

      if (typeof selection === "string") {
        setLocalSshKeyDirectoryDraft(selection);
      }
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    }
  };

  const handleSaveLocalSessionPreset = () => {
    const name = localSessionPresetName.trim();
    const path = localSessionPresetPath.trim();
    if (!name || !path) {
      pushToast("Saved path buttons need both a label and a directory.", "error");
      return;
    }

    setLocalSessionPresets((current) => [
      {
        id: crypto.randomUUID(),
        name,
        path
      },
      ...current
    ]);
    setLocalSessionPresetEditorOpen(false);
    pushToast(`Saved local path ${name}.`, "success");
  };

  const handleCreateTerminalCommand = async (input: CreateTerminalCommandInput) => {
    const name = input.name.trim();
    const command = input.command.trim();
    if (!name || !command) {
      pushToast("Quick commands need both a label and command text.", "error");
      return;
    }

    try {
      if (!isTauriRuntime()) {
        const saved: TerminalCommandRecord = {
          id: crypto.randomUUID(),
          name,
          command,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        setTerminalCommands((current) => [saved, ...current]);
        pushToast(`Saved quick command ${name}.`, "success");
        return;
      }

      const saved = await createTerminalCommand({ name, command });
      setTerminalCommands((current) => [saved, ...current.filter((candidate) => candidate.id !== saved.id)]);
      pushToast(`Saved quick command ${saved.name}.`, "success");
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    }
  };

  const handleDeleteTerminalCommand = async (id: string) => {
    const target = terminalCommands.find((command) => command.id === id);
    try {
      if (!isTauriRuntime()) {
        setTerminalCommands((current) => current.filter((command) => command.id !== id));
        return;
      }

      await deleteTerminalCommand(id);
      setTerminalCommands((current) => current.filter((command) => command.id !== id));
      if (target) {
        pushToast(`Removed quick command ${target.name}.`, "success");
      }
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    }
  };

  const handleRunTerminalCommand = (command: string) => {
    const targetTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
    if (!targetTab || targetTab.status === "closed" || targetTab.status === "error") {
      pushToast("Open an active terminal before running a saved command.", "info");
      return;
    }

    queueTerminalInput(targetTab.id, normalizeTerminalCommandInput(command));
  };

  const handleLaunchLocalPreset = async (presetId: string) => {
    const preset = localSessionPresets.find((candidate) => candidate.id === presetId);
    if (!preset) {
      return;
    }

    await handleConnectLocal({
      cwd: preset.path,
      label: preset.name
    });
  };

  const handleConnectLocalForSessionsBranch = async (input?: ConnectLocalSessionInput) => {
    const tab = await handleConnectLocal(input);
    if (tab && sessionsProjectId && sessionsSelectedBranchName) {
      bindTabToSessionsBranch(tab.id, sessionsProjectId, sessionsSelectedBranchName, {
        targetKind: "local",
        serverId: null,
        cwd: input?.cwd ?? tab.cwd,
        label: input?.label ?? tab.title
      });
    }
    return tab;
  };

  const handleConnectServerForSessionsBranch = async (serverId: string, tmuxSession?: string) => {
    const server = servers.find((candidate) => candidate.id === serverId) ?? null;
    const cwd =
      server?.path.trim() ||
      (sessionsProjectId
        ? projects.find((candidate) => candidate.id === sessionsProjectId)?.path.trim()
        : "") ||
      undefined;
    const tab = await handleConnect(serverId, tmuxSession, cwd, "sessions", true);
    if (tab && sessionsProjectId && sessionsSelectedBranchName) {
      bindTabToSessionsBranch(tab.id, sessionsProjectId, sessionsSelectedBranchName, {
        targetKind: "server",
        serverId,
        cwd: cwd ?? null,
        label: server ? serverDisplayLabel(server) : tab.title
      });
    }
    return tab;
  };

  const handleLaunchLocalPresetForSessionsBranch = async (presetId: string) => {
    const preset = localSessionPresets.find((candidate) => candidate.id === presetId);
    if (!preset) {
      return;
    }

    const tab = await handleConnectLocal({
      cwd: preset.path,
      label: preset.name
    });
    if (tab && sessionsProjectId && sessionsSelectedBranchName) {
      bindTabToSessionsBranch(tab.id, sessionsProjectId, sessionsSelectedBranchName, {
        targetKind: "local",
        serverId: null,
        cwd: preset.path,
        label: preset.name
      });
    }
  };

  const handleCreateSessionsBranchTerminal = async () => {
    if (sessionsProjectId && sessionsSelectedBranchName) {
      await createTerminalForSessionsBranch(sessionsProjectId, sessionsSelectedBranchName);
      return;
    }

    await handleConnectLocal();
  };

  const getSessionsProjectRepository = (projectId: string | null) => {
    if (!projectId) {
      return null;
    }

    const project = projects.find((candidate) => candidate.id === projectId) ?? null;
    return project ? findProjectRepository(project, gitRepositories) : null;
  };

  const handleCreateSessionsGitBranch = async () => {
    const repository = getSessionsProjectRepository(sessionsProjectId);
    if (!sessionsProjectId || !repository) {
      pushToast("Connect a project repository before creating a branch.", "info");
      return;
    }

    const suggestedName =
      sessionsSelectedBranchName && sessionsSelectedBranchName !== "main"
        ? `${sessionsSelectedBranchName}-next`
        : "feature/";
    const branchName = window.prompt("New branch name", suggestedName)?.trim() ?? "";
    if (!branchName) {
      return;
    }

    const snapshot = await createGitBranchForRepository(repository.id, branchName);
    if (!snapshot) {
      return;
    }

    setSessionsSelectedBranchByProject((current) => ({
      ...current,
      [sessionsProjectId]: snapshot.branch
    }));
    await handleSelectSessionsBranch(snapshot.branch);
  };

  const handleCommitSessionsGitBranch = async () => {
    const repository = getSessionsProjectRepository(sessionsProjectId);
    if (!repository) {
      pushToast("Connect a project repository before committing.", "info");
      return;
    }

    const message = window.prompt("Commit message", gitCommitMessage || "")?.trim() ?? "";
    if (!message) {
      return;
    }

    await commitGitRepositoryWithMessage(repository.id, message);
  };

  const handlePushSessionsGitBranch = async () => {
    const repository = getSessionsProjectRepository(sessionsProjectId);
    if (!repository) {
      pushToast("Connect a project repository before pushing.", "info");
      return;
    }

    await handlePushGitRepository(repository.id);
  };

  const handleCopySessionsPrDraft = async () => {
    const repository = getSessionsProjectRepository(sessionsProjectId);
    if (!repository) {
      pushToast("Connect a project repository before preparing a PR.", "info");
      return;
    }

    await handleCopyGitReviewDraft(repository.id);
  };

  const handlePullSessionsGitBranch = () => {
    pushToast("Pull is not wired into Sessions yet.", "info");
  };

  const handleMergeSessionsGitBranch = () => {
    pushToast("Merge is not wired into Sessions yet.", "info");
  };

  const handleRemoveLocalPreset = (presetId: string) => {
    setLocalSessionPresets((current) => current.filter((preset) => preset.id !== presetId));
  };

  const pinGitRepositorySnapshot = (snapshot: GitRepositoryRecord) => {
    const existingRepository = localGitRepositories.find(
      (repository) => repository.path === snapshot.rootPath
    );

    if (existingRepository) {
      syncGitRepositorySnapshot(existingRepository.id, snapshot);
      return {
        alreadyPinned: true,
        repositoryId: existingRepository.id
      };
    }

    const repositoryId = crypto.randomUUID();
    setLocalGitRepositories((current) => [
      {
        id: repositoryId,
        name: snapshot.name,
        path: snapshot.rootPath
      },
      ...current
    ]);
    setGitRepositoryStates((current) => [
      ...current.filter((repository) => repository.id !== repositoryId),
      { id: repositoryId, snapshot, error: null }
    ]);

    return {
      alreadyPinned: false,
      repositoryId
    };
  };

  const syncGitRepositorySnapshot = (repositoryId: string, snapshot: GitRepositoryRecord) => {
    setGitRepositoryStates((current) => {
      const next = current.filter((repository) => repository.id !== repositoryId);
      return [...next, { id: repositoryId, snapshot, error: null }];
    });

    setLocalGitRepositories((current) =>
      current.map((repository) =>
        repository.id === repositoryId
          ? {
              ...repository,
              name: snapshot.name,
              path: snapshot.rootPath
            }
          : repository
      )
    );
  };

  const refreshGitRepositories = async () => {
    if (!isTauriRuntime()) {
      pushToast("Git controls are only available in the desktop app.", "info");
      return;
    }

    if (localGitRepositories.length === 0) {
      setGitRepositoryStates([]);
      return;
    }

    setGitLoading(true);
    try {
      const results = await Promise.all(
        localGitRepositories.map(async (repository) => {
          try {
            const snapshot = await inspectGitRepository(repository.path);
            return {
              id: repository.id,
              error: null,
              snapshot
            };
          } catch (error) {
            return {
              id: repository.id,
              error: getErrorMessage(error),
              snapshot: null
            };
          }
        })
      );

      setGitRepositoryStates(results);
      setLocalGitRepositories((current) => {
        let changed = false;
        const next = current.map((repository) => {
          const result = results.find((candidate) => candidate.id === repository.id);
          if (!result?.snapshot) {
            return repository;
          }

          if (
            repository.name === result.snapshot.name &&
            repository.path === result.snapshot.rootPath
          ) {
            return repository;
          }

          changed = true;
          return {
            ...repository,
            name: result.snapshot.name,
            path: result.snapshot.rootPath
          };
        });

        return changed ? next : current;
      });
    } finally {
      setGitLoading(false);
    }
  };

  const loadGitHubSessionState = async () => {
    if (!isTauriRuntime()) {
      return;
    }

    try {
      const session = await getGitHubSession().catch(() => null);
      setGitHubSession(session);
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    }
  };

  const loadGitHubAuthSupport = async () => {
    if (!isTauriRuntime()) {
      setGitHubDeviceFlowAvailable(false);
      return;
    }

    try {
      const available = await isGitHubDeviceFlowAvailable();
      setGitHubDeviceFlowAvailable(available);
    } catch {
      setGitHubDeviceFlowAvailable(false);
    }
  };

  const loadGitHubOwnedRepositories = async (sessionOverride?: GitHubAuthSession | null) => {
    const activeSession = sessionOverride ?? gitHubSession;
    if (!isTauriRuntime() || !activeSession) {
      setGitHubOwnedRepositories([]);
      return;
    }

    setGitHubRepositoryLoading(true);
    try {
      const repositories = await listGitHubRepositories();
      setGitHubOwnedRepositories(repositories);
      persistGitHubOwnedRepositoriesCache({
        login: activeSession.login,
        repositories,
        updatedAt: Date.now()
      });
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setGitHubRepositoryLoading(false);
    }
  };

  const loadGitHubSearchRepositories = async (query: string) => {
    setGitHubSearchLoading(true);
    try {
      const repositories = await searchGitHubRepositories(query);
      setGitHubPublicRepositories(repositories);
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setGitHubSearchLoading(false);
    }
  };

  const handleStartGitHubSignIn = async () => {
    if (!isTauriRuntime()) {
      pushToast("GitHub auth is only available in the desktop app.", "info");
      return;
    }

    setGitHubLoading(true);
    try {
      const flow = await startGitHubDeviceFlow();
      setGitHubDeviceFlow(flow);
      pushToast(`Enter ${flow.userCode} in the GitHub window to finish sign-in.`, "info");
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setGitHubLoading(false);
    }
  };

  const handleSignInGitHubWithToken = async (token: string) => {
    if (!isTauriRuntime()) {
      pushToast("GitHub auth is only available in the desktop app.", "info");
      return;
    }

    setGitHubLoading(true);
    try {
      const session = await signInGitHubWithToken(token);
      setGitHubSession(session);
      setGitHubDeviceFlow(null);
      setGitHubRepositoryPane("personal");
      pushToast(`Connected GitHub as ${session.login}.`, "success");
      await loadGitHubOwnedRepositories(session);
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setGitHubLoading(false);
    }
  };

  const handleDisconnectGitHub = async () => {
    setGitHubLoading(true);
    try {
      await disconnectGitHub();
      setGitHubSession(null);
      setGitHubOwnedRepositories([]);
      setGitHubDeviceFlow(null);
      setGitHubRepositoryPane("personal");
      pushToast("Disconnected GitHub.", "success");
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setGitHubLoading(false);
    }
  };

  const handleCancelGitHubSignIn = () => {
    setGitHubDeviceFlow(null);
  };

  const handleCopyGitHubCloneUrl = async (cloneUrl: string) => {
    try {
      await navigator.clipboard.writeText(cloneUrl);
      pushToast("Clone URL copied.", "success");
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    }
  };

  const handleAddGitRepository = async () => {
    if (!isTauriRuntime()) {
      pushToast("Git controls are only available in the desktop app.", "info");
      return;
    }

    setGitBusyAction("add");
    try {
      const selection = await open({
        directory: true,
        multiple: false,
        title: "Choose Git repository"
      });

      if (typeof selection !== "string") {
        return;
      }

      const snapshot = await inspectGitRepository(selection);
      const result = pinGitRepositorySnapshot(snapshot);
      setSelectedGitRepositoryId(result.repositoryId);
      setView("git");
      pushToast(
        result.alreadyPinned ? `${snapshot.name} is already pinned in Git.` : `Pinned ${snapshot.name} in Git.`,
        result.alreadyPinned ? "info" : "success"
      );
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setGitBusyAction(null);
    }
  };

  const handleCloneGitHubRepository = async (repository: GitHubRepositoryRecord) => {
    if (!isTauriRuntime()) {
      pushToast("Git controls are only available in the desktop app.", "info");
      return;
    }

    setGitBusyAction(`clone:${repository.id}`);
    try {
      const selection = await open({
        directory: true,
        multiple: false,
        title: `Choose a parent folder for ${repository.fullName}`
      });

      if (typeof selection !== "string") {
        return;
      }

      const snapshot = await cloneGitRepository(repository.cloneUrl, selection, repository.name);
      const result = pinGitRepositorySnapshot(snapshot);
      setSelectedGitRepositoryId(result.repositoryId);
      setView("git");
      pushToast(`Cloned ${repository.fullName}.`, "success");
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setGitBusyAction(null);
    }
  };

  const handlePinGitRepositorySnapshot = (snapshot: GitRepositoryRecord) => {
    const result = pinGitRepositorySnapshot(snapshot);
    setSelectedGitRepositoryId(result.repositoryId);
  };

  const handleRemoveGitRepository = (repositoryId: string) => {
    const repository = gitRepositories.find((candidate) => candidate.id === repositoryId);
    setLocalGitRepositories((current) => current.filter((candidate) => candidate.id !== repositoryId));
    setGitRepositoryStates((current) => current.filter((candidate) => candidate.id !== repositoryId));
    if (selectedGitRepositoryId === repositoryId) {
      setSelectedGitRepositoryId(null);
    }
    if (repository) {
      pushToast(`Removed ${repository.name} from Git.`, "success");
    }
  };

  const handleOpenGitRepositoryShell = async (repositoryId: string) => {
    const repository = gitRepositories.find((candidate) => candidate.id === repositoryId);
    if (!repository) {
      return;
    }

    setGitBusyAction(`shell:${repositoryId}`);
    try {
      await handleConnectLocal({
        cwd: repository.snapshot?.rootPath ?? repository.path,
        label: repository.snapshot?.name ?? repository.name
      });
    } finally {
      setGitBusyAction(null);
    }
  };

  const handleCopyGitReviewDraft = async (repositoryId: string) => {
    const repository = gitRepositories.find((candidate) => candidate.id === repositoryId);
    if (!repository?.snapshot?.review) {
      pushToast("Create or switch to a review branch before copying a local PR draft.", "info");
      return;
    }

    try {
      await navigator.clipboard.writeText(buildGitReviewDraft(repository.snapshot));
      pushToast("Local review draft copied.", "success");
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    }
  };

  const commitGitRepositoryWithMessage = async (repositoryId: string, message: string) => {
    const repository = gitRepositories.find((candidate) => candidate.id === repositoryId);
    if (!repository) {
      return null;
    }

    setGitBusyAction(`commit:${repositoryId}`);
    try {
      const snapshot = await commitGitRepository(
        repository.snapshot?.rootPath ?? repository.path,
        message
      );
      syncGitRepositorySnapshot(repositoryId, snapshot);
      pushToast(`Committed ${snapshot.name}.`, "success");
      return snapshot;
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
      return null;
    } finally {
      setGitBusyAction(null);
    }
  };

  const handleCommitGitRepository = async (repositoryId: string) => {
    const snapshot = await commitGitRepositoryWithMessage(repositoryId, gitCommitMessage);
    if (snapshot) {
      setGitCommitMessage("");
    }
  };

  const createGitBranchForRepository = async (repositoryId: string, branchName: string) => {
    const repository = gitRepositories.find((candidate) => candidate.id === repositoryId);
    if (!repository) {
      return null;
    }

    setGitBusyAction(`branch:${repositoryId}`);
    try {
      const snapshot = await createGitBranch(
        repository.snapshot?.rootPath ?? repository.path,
        branchName
      );
      syncGitRepositorySnapshot(repositoryId, snapshot);
      pushToast(`Checked out ${snapshot.branch}.`, "success");
      return snapshot;
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
      return null;
    } finally {
      setGitBusyAction(null);
    }
  };

  const handleCreateGitBranch = async (repositoryId: string) => {
    const snapshot = await createGitBranchForRepository(repositoryId, gitBranchName);
    if (snapshot) {
      setGitBranchName("");
    }
  };

  const handleCheckoutGitBranch = async (repositoryId: string, branchName: string) => {
    const repository = gitRepositories.find((candidate) => candidate.id === repositoryId);
    if (!repository) {
      return;
    }

    setGitBusyAction(`checkout:${repositoryId}:${branchName}`);
    try {
      const snapshot = await checkoutGitBranch(
        repository.snapshot?.rootPath ?? repository.path,
        branchName
      );
      syncGitRepositorySnapshot(repositoryId, snapshot);
      pushToast(`Checked out ${snapshot.branch}.`, "success");
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setGitBusyAction(null);
    }
  };

  const handlePushGitRepository = async (repositoryId: string) => {
    const repository = gitRepositories.find((candidate) => candidate.id === repositoryId);
    if (!repository) {
      return;
    }

    setGitBusyAction(`push:${repositoryId}`);
    try {
      const snapshot = await pushGitRepository(repository.snapshot?.rootPath ?? repository.path);
      syncGitRepositorySnapshot(repositoryId, snapshot);
      pushToast(`Published ${snapshot.branch}.`, "success");
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setGitBusyAction(null);
    }
  };

  const handleRunToolUpdate = async (toolId: string) => {
    setToolUpdateBusyId(toolId);
    try {
      const updated = await runCliToolUpdate(toolId);
      setToolUpdates((current) =>
        current.map((tool) => (tool.id === updated.id ? updated : tool))
      );
      pushToast(
        updated.state === "updateAvailable"
          ? `${updated.name} still has an update pending.`
          : `${updated.name} checked successfully.`,
        updated.state === "updateAvailable" ? "info" : "success"
      );
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setToolUpdateBusyId(null);
    }
  };

  const handleOpenTerminalSession = (tabId: string) => {
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab) {
      return;
    }

    const branchBinding = sessionsBranchBindingsByTabId[tabId];
    if (branchBinding) {
      setSessionsProjectId(branchBinding.projectId);
      setSessionsSelectedBranchByProject((current) => ({
        ...current,
        [branchBinding.projectId]: branchBinding.branchName
      }));
    }

    const server = servers.find((candidate) => candidate.id === tab.serverId);
    if (server) {
      setSelectedProjectId(server.projectId);
      setSelectedServerId(server.id);
    }

    setActiveTabId(tabId);
    setWorkspaceMode("terminal");
    setView("sessions");
  };

  const handleDeleteKeychainItem = async (id: string) => {
    try {
      await deleteKeychainItem(id);
      setEditingKeychainItem(null);
      await refreshWorkspace();
      pushToast("Deleted saved credential.", "success");
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    }
  };

  const handleCopyKeychainPublicKey = async (id: string) => {
    setCopyingPublicKeyId(id);
    try {
      const publicKey = await getKeychainPublicKey(id);
      await navigator.clipboard.writeText(publicKey);
      pushToast("Public key copied.", "success");
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setCopyingPublicKeyId(null);
    }
  };

  const handleSaveKeychainItem = async () => {
    setSaving(true);
    try {
      if (creatingKeychainItem) {
        await createKeychainItem({
          kind: keychainKindDraft,
          name: keychainNameDraft.trim(),
          secret: keychainSecretDraft
        });
        setCreatingKeychainItem(false);
        pushToast("Added saved credential.", "success");
      } else if (editingKeychainItem) {
        await updateKeychainItemName(editingKeychainItem.id, keychainNameDraft.trim());
        setEditingKeychainItem(null);
        pushToast("Updated credential name.", "success");
      } else {
        return;
      }

      await refreshWorkspace();
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateLocalSshKey = async () => {
    const input: CreateLocalSshKeyInput = {
      directory: localSshKeyDirectoryDraft.trim(),
      fileName: localSshKeyFileNameDraft.trim(),
      name: keychainNameDraft.trim(),
      passphrase: localSshKeyPassphraseDraft
    };

    setSaving(true);
    try {
      await createLocalSshKey(input);
      setCreatingLocalSshKey(false);
      pushToast("Created SSH key and saved credential.", "success");
      await refreshWorkspace();
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleServerDraftChange = <K extends keyof ServerInput>(field: K, value: ServerInput[K]) => {
    setServerDraft((current) => {
      if (field !== "authKind") {
        return {
          ...current,
          [field]: value
        };
      }

      const nextAuthKind = value as ServerInput["authKind"];

      if (nextAuthKind === "default") {
        return {
          ...current,
          authKind: nextAuthKind,
          credentialId: null,
          credentialName: "",
          credentialSecret: ""
        };
      }

      if (current.authKind === nextAuthKind) {
        return {
          ...current,
          authKind: nextAuthKind
        };
      }

      return {
        ...current,
        authKind: nextAuthKind,
        credentialId: null,
        credentialName: "",
        credentialSecret: ""
      };
    });
  };

  const handleCloseTab = async (tabId: string) => {
    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    clearTerminalInput(tabId);
    pendingTerminalStatesRef.current.delete(tabId);
    setSessionsBranchBindingsByTabId((current) => {
      if (!(tabId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[tabId];
      return next;
    });
    if (relayInstallSessionId === tabId) {
      setRelayInstallSessionId(null);
    }

    try {
      await closeSession(tabId);
    } catch {
      // Ignore already-closed backend sessions.
    }

    setTabs(nextTabs);
    if (activeTabId === tabId) {
      setActiveTabId(nextTabs.at(-1)?.id ?? null);
    }

    if (nextTabs.length === 0) {
      setWorkspaceMode("home");
    }
  };

  const handleOpenSiblingTab = async () => {
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    const serverId = activeTab?.serverId ?? selectedServerId;
    if (!serverId) {
      return;
    }

    await handleConnect(serverId);
  };

  const handleStatus = (event: TerminalStatusEvent) => {
    if (event.sessionId === relayInstallSessionId) {
      setRelayInstallMessage(event.message);
      setRelayInstallState(event.status === "error" ? "error" : "installing");
    }

    const hasTab = tabsRef.current.some((tab) => tab.id === event.sessionId);
    if (hasTab) {
      setTabs((current) =>
        current.map((tab) =>
          tab.id === event.sessionId
            ? { ...tab, status: mergeTerminalStatus(tab.status, event.status) }
            : tab
        )
      );
      const tab = tabsRef.current.find((candidate) => candidate.id === event.sessionId);
      if (tab) {
        const metadata = sessionRuntimeMetadataRef.current.get(event.sessionId);
        if (metadata) {
          sessionRuntimeMetadataRef.current.set(event.sessionId, {
            ...metadata,
            title: tab.title,
            cwd: tab.cwd
          });
        }
      }
    } else {
      const currentPending = pendingTerminalStatesRef.current.get(event.sessionId);
      pendingTerminalStatesRef.current.set(event.sessionId, {
        message: event.message,
        status: mergeTerminalStatus(currentPending?.status, event.status)
      });
    }
  };

  const handleExit = (event: TerminalExitEvent) => {
    if (event.sessionId === relayInstallSessionId) {
      setRelayInstallMessage(
        event.reason + (event.exitCode !== null ? ` (exit ${event.exitCode})` : "")
      );
      setRelayInstallState(event.exitCode === 0 ? "checking" : "error");
    }

    const tab = tabsRef.current.find((candidate) => candidate.id === event.sessionId) ?? null;
    const runtimeMetadata = sessionRuntimeMetadataRef.current.get(event.sessionId) ?? null;
    if (runtimeMetadata) {
      recordTerminalHistory({
        id: event.sessionId,
        targetKind: runtimeMetadata.targetKind,
        serverRef: runtimeMetadata.serverRef,
        serverLabel: runtimeMetadata.serverLabel,
        title: tab?.title || runtimeMetadata.title,
        cwd: tab?.cwd ?? runtimeMetadata.cwd,
        tmuxSession: runtimeMetadata.tmuxSession,
        startedAt: tab?.startedAt ?? runtimeMetadata.startedAt,
        endedAt: new Date().toISOString(),
        exitCode: event.exitCode,
        reason: event.reason
      });
    }

    const hasTab = tabsRef.current.some((tab) => tab.id === event.sessionId);
    if (hasTab) {
      setTabs((current) =>
        current.map((tab) =>
          tab.id === event.sessionId ? { ...tab, status: "closed" } : tab
        )
      );
    } else {
      pendingTerminalStatesRef.current.set(event.sessionId, {
        message:
          event.reason + (event.exitCode !== null ? ` (exit ${event.exitCode})` : ""),
        status: "closed"
      });
    }
    sessionRuntimeMetadataRef.current.delete(event.sessionId);
  };

  const headerTitle =
    view === "workspace"
      ? "Projects"
      : view === "git" && gitToolbarContext.headerTitle
        ? gitToolbarContext.headerTitle
      : view === "sessions"
        ? sessionsProjectId
          ? sessionsSelectedBranchName
            ? `Sessions / ${projects.find((project) => project.id === sessionsProjectId)?.name ?? "Project"} / ${sessionsSelectedBranchName}`
            : `Sessions / ${projects.find((project) => project.id === sessionsProjectId)?.name ?? "Project"}`
          : "Sessions"
      : view === "git"
        ? "Git"
      : view === "files"
        ? "Files"
      : view === "settings"
        ? "Settings"
      : view === "keychain"
        ? "Credentials"
        : "Home";

  const headerSubtitle =
    view === "sessions" && activeSessionsWorkspaceTabServer
      ? `${sessionsWorkspaceTabs.length} live terminal${sessionsWorkspaceTabs.length === 1 ? "" : "s"} / ${buildSshTarget(activeSessionsWorkspaceTabServer)} / port ${activeSessionsWorkspaceTabServer.port}`
      : view === "sessions" && sessionsProjectId
        ? `${sessionsWorkspaceTabs.length} live terminal${sessionsWorkspaceTabs.length === 1 ? "" : "s"}`
      : view === "sessions"
        ? `${sessionsWorkspaceTabs.length} active terminal${sessionsWorkspaceTabs.length === 1 ? "" : "s"}`
      : view === "workspace" && workspaceMode === "terminal" && selectedServer
      ? `${selectedProject ? `${projectDisplayLabel(selectedProject)} / ` : ""}${buildSshTarget(selectedServer)} / port ${selectedServer.port}${selectedServer.useTmux ? ` / tmux ${selectedServer.tmuxSession}` : ""}`
      : view === "workspace"
        ? selectedProject
          ? `${selectedProject.githubRepoFullName || "No GitHub repo linked"} / ${selectedProject.path || "No path set"} / ${selectedProject.targetKind === "server" ? "Server runtime" : "Local runtime"}`
          : `${filteredProjects.length} project${filteredProjects.length === 1 ? "" : "s"} / Create or select one to edit settings`
        : view === "git" && gitToolbarContext.headerTitle
          ? gitToolbarContext.headerSubtitle ?? ""
        : view === "git"
          ? gitHubSession
            ? `${filteredGitRepositories.length} local repo${filteredGitRepositories.length === 1 ? "" : "s"} pinned / ${gitHubOwnedRepositories.length} GitHub repo${gitHubOwnedRepositories.length === 1 ? "" : "s"} available`
            : filteredGitRepositories.length === 0
              ? "Connect GitHub or skip to a local checkout."
              : `${filteredGitRepositories.length} local repo${filteredGitRepositories.length === 1 ? "" : "s"} pinned.`
        : view === "files"
          ? `${servers.length} saved server${servers.length === 1 ? "" : "s"} plus local drives available for inline browsing.`
        : view === "settings"
          ? `${relayHostServer ? `${serverDisplayLabel(relayHostServer)} relay host / ` : ""}${relayState.currentDeviceRole ? `${relayState.currentDeviceRole} device / ` : ""}${localLauncherSummary} launcher / ${settings.terminalFontSize}px terminal text`
        : view === "keychain"
          ? `${filteredKeychainItems.length} saved credential${filteredKeychainItems.length === 1 ? "" : "s"}${gitHubSession ? ` / GitHub token connected as @${gitHubSession.login}` : ""}`
          : loading
            ? "Loading local projects..."
            : `${filteredProjects.length} project${filteredProjects.length === 1 ? "" : "s"} ready locally.`;

  const { clearTerminalInput, queueTerminalInput } = useBufferedTerminalInput({
    onError: (error) => pushToast(getErrorMessage(error), "error"),
    onFlush: writeSession
  });

  useAppShortcuts({
    onConnectServer: (serverId) => void handleConnect(serverId),
    onCreateProject: openCreateProject,
    onCreateServer: openCreateServer,
    onDismiss: () => {
      setCreatingKeychainItem(false);
      setCreatingLocalSshKey(false);
      setInspector({ kind: "hidden" });
      setEditingKeychainItem(null);
    },
    selectedProjectId,
    selectedServerId,
    view
  });

  const isGitDetailView = view === "git" && Boolean(gitToolbarContext.onBack);
  const shellLayoutMode: ShellLayoutMode =
    view === "dashboard"
      ? "home"
      : view === "sessions" || view === "git" || view === "files"
        ? "full"
        : view === "workspace"
          ? "wide"
          : "standard";

  const shellChromeActions = (
    <div className="shell-restore-group">
      <button
        className={`shell-restore-button ${appRailCollapsed ? "shell-restore-button--active" : ""}`}
        onClick={() => setAppRailCollapsed((current) => !current)}
        type="button"
      >
        Sidebar
      </button>
      {view === "sessions" && sessionsProjectId ? (
        <button
          className={`shell-restore-button ${sessionsRailCollapsed ? "shell-restore-button--active" : ""}`}
          onClick={() => setSessionsRailCollapsed((current) => !current)}
          type="button"
        >
          Rail
        </button>
      ) : null}
    </div>
  );

  const headerActions =
    view === "dashboard" ? (
      <div className="shell-action-group shell-action-group--home">
        <label className="shell-search shell-search--command">
          <MagnifyingGlass size={14} weight="bold" />
          <span className="shell-search__hint">/</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Connect, search, or jump"
            value={search}
          />
        </label>
        <button
          aria-label="New project"
          className="shell-icon-button"
          onClick={openCreateProject}
          title="New project"
          type="button"
        >
          <Plus size={15} weight="bold" />
        </button>
        {shellChromeActions}
      </div>
    ) : view === "sessions" ? (
      <div className="shell-action-group">
        <button
          aria-label="New terminal"
          className="shell-icon-button"
          disabled={!sessionsProjectId}
          onClick={() => void handleCreateSessionsBranchTerminal()}
          title="New terminal"
          type="button"
        >
          <TerminalWindow size={15} weight="regular" />
        </button>
        <button
          aria-label="Toggle preview"
          className={`shell-icon-button ${sessionsPreviewOpen ? "shell-icon-button--active" : ""}`}
          disabled={!sessionsProjectId}
          onClick={() => setSessionsPreviewOpen((current) => !current)}
          title="Toggle preview"
          type="button"
        >
          <MonitorPlay size={15} weight="regular" />
        </button>
        <button
          aria-label="Toggle git"
          className={`shell-icon-button ${sessionsGitPanelOpen ? "shell-icon-button--active" : ""}`}
          disabled={!sessionsProjectId}
          onClick={() => setSessionsGitPanelOpen((current) => !current)}
          title="Toggle git"
          type="button"
        >
          <GithubLogo size={15} weight="regular" />
        </button>
        {shellChromeActions}
      </div>
    ) : view === "workspace" ? (
      <div className="shell-action-group">
        {shellChromeActions}
        <ShellAction
          disabled={!selectedProject}
          icon={GearSix}
          label="Edit project"
          onClick={openEditProject}
        />
        <ShellAction icon={FolderPlus} label="New project" onClick={openCreateProject} tone="primary" />
      </div>
    ) : view === "keychain" ? (
      <div className="shell-action-group">
        {shellChromeActions}
        <label className="shell-search">
          <MagnifyingGlass size={14} weight="bold" />
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find credential"
            value={search}
          />
        </label>
        <ShellAction icon={Key} label="Add credential" onClick={openCreateKeychainItem} tone="primary" />
        <ShellAction icon={Key} label="Create SSH key" onClick={() => void openCreateLocalSshKey()} />
      </div>
    ) : view === "git" ? (
      <div className="shell-action-group">
        {shellChromeActions}
        {!isGitDetailView ? (
          <>
            <ShellAction
              icon={FolderPlus}
              label="Pin checkout"
              onClick={() => void handleAddGitRepository()}
              tone="primary"
            />
            <ShellAction
              disabled={gitLoading}
              icon={ArrowClockwise}
              label="Refresh local"
              onClick={() => void refreshGitRepositories()}
            />
          </>
        ) : null}
        {gitToolbarContext.shellRepositoryId ? (
          <ShellAction
            disabled={gitBusyAction === `shell:${gitToolbarContext.shellRepositoryId}`}
            icon={TerminalWindow}
            label={
              gitBusyAction === `shell:${gitToolbarContext.shellRepositoryId}` ? "Opening..." : "Open shell"
            }
            onClick={() => void handleOpenGitRepositoryShell(gitToolbarContext.shellRepositoryId!)}
          />
        ) : null}
        {gitToolbarContext.reviewRepositoryId ? (
          <ShellAction
            icon={Copy}
            label="Copy review"
            onClick={() => void handleCopyGitReviewDraft(gitToolbarContext.reviewRepositoryId!)}
          />
        ) : null}
        {gitToolbarContext.cloneUrl ? (
          <ShellAction
            icon={Copy}
            label="Copy clone URL"
            onClick={() => void handleCopyGitHubCloneUrl(gitToolbarContext.cloneUrl!)}
          />
        ) : null}
        {gitHubSession ? (
          <>
            <ShellAction
              disabled={gitHubLoading || gitHubRepositoryLoading}
              icon={ArrowClockwise}
              label="Refresh GitHub"
              onClick={() => void loadGitHubOwnedRepositories()}
            />
            <ShellAction
              icon={GithubLogo}
              label="Disconnect GitHub"
              onClick={() => void handleDisconnectGitHub()}
            />
          </>
        ) : (
          <ShellAction
            icon={GithubLogo}
            label="Connect GitHub"
            onClick={() => setGitHubSetupRequest((current) => current + 1)}
          />
        )}
      </div>
    ) : shellChromeActions;

  function handleShellContextMenu(event: ReactMouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        'input, textarea, select, [contenteditable="true"], [data-allow-native-context-menu="true"]'
      )
    ) {
      return;
    }

    event.preventDefault();
  }

  return (
    <main
      className="app-root"
      onContextMenuCapture={handleShellContextMenu}
      style={{
        colorScheme: activeTheme.colorScheme,
        ["--bg" as string]: activeTheme.app.bg,
        ["--bg-rail" as string]: activeTheme.app.bgRail,
        ["--bg-panel" as string]: activeTheme.app.bgPanel,
        ["--bg-panel-2" as string]: activeTheme.app.bgPanel2,
        ["--bg-panel-3" as string]: activeTheme.app.bgPanel3,
        ["--bg-input" as string]: activeTheme.app.bgInput,
        ["--text" as string]: activeTheme.app.text,
        ["--text-soft" as string]: activeTheme.app.textSoft,
        ["--text-faint" as string]: activeTheme.app.textFaint,
        ["--border" as string]: activeTheme.app.border,
        ["--border-strong" as string]: activeTheme.app.borderStrong,
        ["--accent" as string]: activeTheme.app.accent,
        ["--accent-ink" as string]: activeTheme.app.accentInk,
        ["--success" as string]: activeTheme.app.success,
        ["--danger" as string]: activeTheme.app.danger
      }}
    >
      <AppShell
        topbar={
          <ShellTopbar
            actions={headerActions}
            backLabel="Repositories"
            meta={view === "git" ? gitToolbarContext.headerMeta : undefined}
            mode={shellLayoutMode}
            onBack={view === "git" ? gitToolbarContext.onBack ?? undefined : undefined}
            subtitle={view === "dashboard" ? undefined : headerSubtitle}
            title={headerTitle}
          />
        }
        layoutMode={shellLayoutMode}
        rail={
          <AppRail
            collapsed={appRailCollapsed}
            onNavigate={handleNavigate}
            view={view}
          />
        }
        railCollapsed={appRailCollapsed}
        secondaryRail={
          view === "sessions" && sessionsProjectId ? (
            <SessionNavigator
              activeTabId={activeSessionsWorkspaceTab?.id ?? null}
              collapsed={sessionsRailCollapsed}
              selectedBranchName={sessionsSelectedBranchName}
              gitRepositories={gitRepositories}
              localSessionPresets={localSessionPresets}
              onOpenProjectSettings={handleOpenProject}
              onLaunchLocalPreset={(presetId) => void handleLaunchLocalPresetForSessionsBranch(presetId)}
              onOpenPresetEditor={openLocalSessionPresetEditor}
              onOpenSessionLauncher={() => setSessionLauncherOpen(true)}
              onCreateGitBranch={() => void handleCreateSessionsGitBranch()}
              onCommitGitBranch={() => void handleCommitSessionsGitBranch()}
              onCopyPrDraft={() => void handleCopySessionsPrDraft()}
              onMergeBranch={handleMergeSessionsGitBranch}
              onPullBranch={handlePullSessionsGitBranch}
              onSelectBranch={(branchName) => void handleSelectSessionsBranch(branchName)}
              onSelectProject={handleSelectSessionsProject}
              onSelectTab={handleOpenTerminalSession}
              onStartLocalSession={() => void handleConnectLocalForSessionsBranch()}
              onPushGitBranch={() => void handlePushSessionsGitBranch()}
              projects={projects}
              selectedProjectId={sessionsProjectId}
              servers={servers}
              tabs={sessionsWorkspaceTabs}
            />
          ) : undefined
        }
        secondaryRailCollapsed={sessionsRailCollapsed}
        secondaryRailLabel="Session navigator"
      >
        <AppStage
          activeTabId={view === "sessions" ? activeSessionsWorkspaceTab?.id ?? null : activeTabId}
          activeTheme={activeTheme}
          devicePlatform={devicePlatform}
          favoriteServers={favoriteServers}
          gitRepositories={gitRepositories}
          sessionsSelectedBranchName={sessionsSelectedBranchName}
          sessionsPreviewOpen={sessionsPreviewOpen}
          sessionsGitPanelOpen={sessionsGitPanelOpen}
          sessionsSelectedProjectId={sessionsProjectId}
          sessionsTabs={sessionsWorkspaceTabs}
          filteredKeychainItems={filteredKeychainItems}
          filteredProjects={filteredProjects}
          gitBranchName={gitBranchName}
          gitBusyAction={gitBusyAction}
          gitCommitMessage={gitCommitMessage}
          gitHubDeviceFlow={gitHubDeviceFlow}
          gitHubDeviceFlowAvailable={gitHubDeviceFlowAvailable}
          gitHubLoading={gitHubLoading}
          gitHubOwnedRepositories={gitHubOwnedRepositories}
          gitHubPublicRepositories={gitHubPublicRepositories}
          gitHubRepositoryLoading={gitHubRepositoryLoading}
          gitHubRepositoryPane={gitHubRepositoryPane}
          gitHubSearchLoading={gitHubSearchLoading}
          gitHubSearchQuery={gitHubSearchQuery}
          gitHubSetupRequest={gitHubSetupRequest}
          gitHubSession={gitHubSession}
          gitLoading={gitLoading}
          localLauncherSummary={localLauncherSummary}
          relayConnected={relayConnected}
          onAddGitRepository={() => void handleAddGitRepository()}
          onCheckoutGitBranch={(repositoryId, branchName) =>
            void handleCheckoutGitBranch(repositoryId, branchName)
          }
          onCloseTab={(tabId) => void handleCloseTab(tabId)}
          onCommitGitRepository={(repositoryId) => void handleCommitGitRepository(repositoryId)}
          onConnect={(serverId, tmuxSession) => void handleConnect(serverId, tmuxSession)}
          onCancelGitHubSignIn={handleCancelGitHubSignIn}
          onCloneGitHubRepository={(repository) => void handleCloneGitHubRepository(repository)}
          onPinRepositorySnapshot={handlePinGitRepositorySnapshot}
          onCopyGitHubCloneUrl={(cloneUrl) => void handleCopyGitHubCloneUrl(cloneUrl)}
          onCopyGitReviewDraft={(repositoryId) => void handleCopyGitReviewDraft(repositoryId)}
          onCreateProject={openCreateProject}
          onEditProject={openEditProject}
          onCreateGitBranch={(repositoryId) => void handleCreateGitBranch(repositoryId)}
          onCreateServer={openCreateServer}
          onCustomTerminalArgsChange={(value) =>
            updateSettings((current) => ({
              ...current,
              customTerminalArgs: value
            }))
          }
          onCustomTerminalLabelChange={(value) =>
            updateSettings((current) => ({
              ...current,
              customTerminalLabel: value
            }))
          }
          onCustomTerminalProgramChange={(value) =>
            updateSettings((current) => ({
              ...current,
              customTerminalProgram: value
            }))
          }
          onCopyPublicKey={(id) => void handleCopyKeychainPublicKey(id)}
          copyingPublicKeyId={copyingPublicKeyId}
          onCreateCredential={openCreateKeychainItem}
          onCreateLocalSshKey={() => void openCreateLocalSshKey()}
          onDeleteKeychainItem={(id) => void handleDeleteKeychainItem(id)}
          onEditServer={openEditServerById}
          onOpenRelaySetupFromServer={(serverId) => openRelaySetup(serverId)}
          onExportSyncBundle={handleExportSyncBundle}
          onExit={handleExit}
          activeTerminalLabel={activeTerminalLabel}
          onGitBranchNameChange={setGitBranchName}
          onGitCommitMessageChange={setGitCommitMessage}
          onGitToolbarContextChange={setGitToolbarContext}
          onGitHubRepositoryPaneChange={setGitHubRepositoryPane}
          onGitHubSearchQueryChange={setGitHubSearchQuery}
          onCreateTerminalCommand={(input) => void handleCreateTerminalCommand(input)}
          onDeleteTerminalCommand={(id) => void handleDeleteTerminalCommand(id)}
          onInput={queueTerminalInput}
          onImportSyncBundle={(file) => void handleImportSyncBundle(file)}
          onDisconnectGitHub={() => void handleDisconnectGitHub()}
          onSignInGitHubWithToken={(token) => void handleSignInGitHubWithToken(token)}
          onNewTab={view === "sessions" ? () => setSessionLauncherOpen(true) : undefined}
          onNotify={pushToast}
          onOpenGitRepositoryShell={(repositoryId) => void handleOpenGitRepositoryShell(repositoryId)}
          localSessionPresets={localSessionPresets}
          onLaunchLocalPreset={(presetId) =>
            view === "sessions"
              ? void handleLaunchLocalPresetForSessionsBranch(presetId)
              : void handleLaunchLocalPreset(presetId)
          }
          onOpenSessionLauncher={() => setSessionLauncherOpen(true)}
          onOpenTerminalSession={handleOpenTerminalSession}
          onOpenProject={handleOpenProject}
          onOpenPresetEditor={openLocalSessionPresetEditor}
          onOpenToolUpdates={openToolUpdates}
          onRefreshTmux={() => selectedServerId && void refreshTmuxSessions(selectedServerId)}
          onRefreshGitHubRepositories={() => void loadGitHubOwnedRepositories()}
          onRefreshGitRepositories={() => void refreshGitRepositories()}
          onRemoveGitRepository={handleRemoveGitRepository}
          onRemoveLocalPreset={handleRemoveLocalPreset}
          onRunTerminalCommand={handleRunTerminalCommand}
          onSyncIncludesCommandsChange={(value) =>
            updateSettings((current) => ({
              ...current,
              syncIncludesCommands: value
            }))
          }
          onSyncIncludesHistoryChange={(value) =>
            updateSettings((current) => ({
              ...current,
              syncIncludesHistory: value
            }))
          }
          onSyncIncludesPinnedRepositoriesChange={(value) =>
            updateSettings((current) => ({
              ...current,
              syncIncludesPinnedRepositories: value
            }))
          }
          onSyncIncludesSecretsChange={(value) =>
            updateSettings((current) => ({
              ...current,
              syncIncludesSecrets: value
            }))
          }
          onSyncIncludesSettingsChange={(value) =>
            updateSettings((current) => ({
              ...current,
              syncIncludesSettings: value
            }))
          }
          onSyncIncludesTmuxMetadataChange={(value) =>
            updateSettings((current) => ({
              ...current,
              syncIncludesTmuxMetadata: value
            }))
          }
          onRenameKeychainItem={(item) => {
            setCreatingKeychainItem(false);
            setCreatingLocalSshKey(false);
            setEditingKeychainItem(item);
            setKeychainNameDraft(item.name);
            setKeychainSecretDraft("");
          }}
          onResize={(sessionId, cols, rows) => {
            void resizeSession(sessionId, cols, rows).catch(() => undefined);
          }}
          onSearchChange={setSearch}
          onSelectGitRepository={setSelectedGitRepositoryId}
          onSelectSessionsBranch={(branchName) => void handleSelectSessionsBranch(branchName)}
          onSelectSessionsProject={handleSelectSessionsProject}
          onSelectServer={handleSelectServer}
          onSelectTab={handleOpenTerminalSession}
          onStartLocalSession={() =>
            view === "sessions"
              ? void handleCreateSessionsBranchTerminal()
              : void handleConnectLocal()
          }
          onTerminalFontSizeChange={(value) =>
            updateSettings((current) => ({
              ...current,
              terminalFontSize: value
            }))
          }
          onTerminalProfileChange={(profileId) =>
            updateSettings((current) => ({
              ...current,
              terminalProfileId: profileId
            }))
          }
          onThemeChange={(themeId) =>
            updateSettings((current) => ({
              ...current,
              themeId
            }))
          }
          onStartGitHubSignIn={() => void handleStartGitHubSignIn()}
          onStatus={handleStatus}
          onPushGitRepository={(repositoryId) => void handlePushGitRepository(repositoryId)}
          projectCount={projects.length}
          projectServers={projectServers}
          search={search}
          selectedGitRepositoryId={selectedGitRepositoryId}
          selectedProject={selectedProject}
          selectedServer={selectedServer}
          selectedServerId={selectedServerId}
          sessionHistoryCount={sessionHistory.length}
          servers={servers}
          serverCountByProject={serverCountByProject}
          settings={settings}
          stageClassName={`stage stage--solo ${view === "dashboard" ? "stage--dashboard" : ""}`}
          syncedKeyCount={keychainItems.filter((item) => item.kind === "sshKey" || item.kind === "password").length}
          syncBusyAction={syncBusyAction}
          tabs={sessionTabs}
          terminalCommands={terminalCommands}
          terminalProfiles={terminalProfiles}
          tmuxMetadataCount={tmuxMetadata.length}
          tmuxLoading={tmuxLoading}
          tmuxSessions={tmuxSessions}
          view={view}
          workspaceMode={workspaceMode}
          workspaceTabs={workspaceTabs}
        />
      </AppShell>

      <AppDialogs
        editingKeychainItem={editingKeychainItem}
        inspector={inspector}
        keychainItems={keychainItems}
        creatingKeychainItem={creatingKeychainItem}
        creatingLocalSshKey={creatingLocalSshKey}
        keychainKindDraft={keychainKindDraft}
        keychainNameDraft={keychainNameDraft}
        keychainSecretDraft={keychainSecretDraft}
        localSshKeyDirectoryDraft={localSshKeyDirectoryDraft}
        localSshKeyFileNameDraft={localSshKeyFileNameDraft}
        localSshKeyPassphraseDraft={localSshKeyPassphraseDraft}
        onCloseInspector={() => setInspector({ kind: "hidden" })}
        onCloseKeychainEditor={() => {
          setCreatingKeychainItem(false);
          setEditingKeychainItem(null);
        }}
        onCloseLocalSshKeyEditor={() => setCreatingLocalSshKey(false)}
        onCreateLocalSshKey={() => void handleCreateLocalSshKey()}
        onDeleteKeychainItem={(id) => void handleDeleteKeychainItem(id)}
        onDeleteProject={() => void handleDeleteProject()}
        onDeleteServer={() => void handleDeleteServer()}
        onLocalSshKeyDirectoryChange={setLocalSshKeyDirectoryDraft}
        onLocalSshKeyFileNameChange={setLocalSshKeyFileNameDraft}
        onLocalSshKeyNameChange={setKeychainNameDraft}
        onLocalSshKeyPassphraseChange={setLocalSshKeyPassphraseDraft}
        onKeychainKindChange={setKeychainKindDraft}
        onKeychainNameChange={setKeychainNameDraft}
        onKeychainSecretChange={setKeychainSecretDraft}
        onBrowseLocalSshKeyDirectory={() => void handleBrowseLocalSshKeyDirectory()}
        onBrowseKeychainSecret={() => void handleBrowseKeychainSecret()}
        onProjectChange={(field, value) =>
          setProjectDraft((current) => {
            if (field === "targetKind") {
              return {
                ...current,
                targetKind: value as ProjectInput["targetKind"],
                linkedServerId: value === "local" ? "" : current.linkedServerId
              };
            }

            if (field === "serverAuthKind") {
              const nextAuthKind = value as ProjectInput["serverAuthKind"];
              return {
                ...current,
                serverAuthKind: nextAuthKind,
                serverCredentialId: nextAuthKind === "default" ? "" : current.serverCredentialId,
                serverCredentialName: nextAuthKind === "default" ? "" : current.serverCredentialName,
                serverCredentialSecret: nextAuthKind === "default" ? "" : current.serverCredentialSecret
              };
            }

            return {
              ...current,
              [field]: value
            };
          })
        }
        onSaveKeychainItem={() => void handleSaveKeychainItem()}
        onSaveProject={() => void saveProject()}
        onSaveServer={() => void saveServer()}
        onServerChange={handleServerDraftChange}
        projectDraft={projectDraft}
        projects={projects}
        servers={servers}
        gitHubRepositories={gitHubOwnedRepositories}
        saving={saving}
        serverDraft={serverDraft}
      />

      {sessionLauncherOpen ? (
        <SessionLauncher
          onClose={() => setSessionLauncherOpen(false)}
          onConnectLocal={() => void handleConnectLocal()}
          onConnectServer={(serverId) => void handleConnect(serverId)}
          projects={projects}
          servers={servers}
        />
      ) : null}

      {localSessionPresetEditorOpen ? (
        <LocalSessionPresetEditor
          name={localSessionPresetName}
          onBrowsePath={() => void handleBrowseLocalSessionPresetPath()}
          onClose={() => setLocalSessionPresetEditorOpen(false)}
          onNameChange={setLocalSessionPresetName}
          onPathChange={setLocalSessionPresetPath}
          onSave={handleSaveLocalSessionPreset}
          path={localSessionPresetPath}
          saving={false}
        />
      ) : null}

      {toolUpdatesOpen ? (
        <ToolUpdatesPanel
          loading={toolUpdatesLoading}
          onClose={() => {
            toolUpdatesRequestIdRef.current += 1;
            setToolUpdatesOpen(false);
          }}
          onRefresh={() => void loadToolUpdates()}
          onRunUpdate={(toolId) => void handleRunToolUpdate(toolId)}
          tools={toolUpdates}
          updatingToolId={toolUpdateBusyId}
        />
      ) : null}

      {relaySetupOpen ? (
        <RelaySetupDialog
          onApproveRelayDevice={(deviceId) => void handleApproveRelayDevice(deviceId)}
          onCheckRelayHealth={() => void handleCheckRelayHealth()}
          onClose={() => setRelaySetupOpen(false)}
          onInspectRelayHost={() => void handleInspectRelayHost()}
          onOpenRelayInstallSession={() => void handleInstallRelayOnHost()}
          onRefreshRelayWorkspace={() => void handleRefreshRelayWorkspace()}
          onRelinkRelayDevice={(deviceId) => void handleRelinkRelayDevice(deviceId)}
          onResolveRelayConflict={(strategy) => void resolveRelayConflict(strategy)}
          onRelayInstallRuntimeChange={(value) =>
            updateRelayState((current) => ({
              ...current,
              installRuntime: value
            }))
          }
          onRevokeRelayDevice={(deviceId) => void handleRevokeRelayDevice(deviceId)}
          platform={devicePlatform}
          relayBusyAction={relayBusyAction}
          relayConflictDomains={relayConflictState?.conflictingDomains ?? []}
          relayHostServer={relayHostServer}
          relayInstallMessage={relayInstallMessage}
          relayInstallState={relayInstallState}
          relayInstallTab={relayInstallTab}
          relayState={relayState}
        />
      ) : null}

      {toasts.length > 0 ? (
        <div aria-atomic="true" aria-live="polite" className="toast-stack">
          {toasts.map((toast) => (
            <div className={`toast toast--${toast.tone}`} key={toast.id} role="status">
              <span>{toast.message}</span>
              <button
                aria-label="Dismiss notification"
                className="toast__dismiss"
                onClick={() => dismissToast(toast.id)}
                type="button"
              >
                x
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </main>
  );
}

type ShellActionIcon = ComponentType<{
  size?: number;
  weight?: "bold" | "duotone" | "fill" | "light" | "regular" | "thin";
}>;

type ShellActionProps = {
  disabled?: boolean;
  icon: ShellActionIcon;
  label: string;
  onClick: () => void;
  tone?: "default" | "primary";
};

function ShellAction({
  disabled = false,
  icon: Icon,
  label,
  onClick,
  tone = "default"
}: ShellActionProps) {
  return (
    <button
      className={`shell-action ${tone === "primary" ? "shell-action--primary" : ""}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon size={14} weight={tone === "primary" ? "bold" : "regular"} />
      <span>{label}</span>
    </button>
  );
}

function loadLocalSessionPresets(): LocalSessionPreset[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_SESSION_PRESETS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isLocalSessionPreset);
  } catch {
    return [];
  }
}

function loadLocalTerminalCommands(): TerminalCommandRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_TERMINAL_COMMANDS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isTerminalCommandRecord);
  } catch {
    return [];
  }
}

function loadLocalGitRepositories(): LocalGitRepository[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_GIT_REPOSITORIES_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isLocalGitRepository);
  } catch {
    return [];
  }
}

function loadLocalTmuxMetadata(): SyncedTmuxMetadataRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_TMUX_METADATA_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isSyncedTmuxMetadataRecord);
  } catch {
    return [];
  }
}

function loadLocalTerminalHistory(): SyncedTerminalHistoryRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_TERMINAL_HISTORY_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isSyncedTerminalHistoryRecord);
  } catch {
    return [];
  }
}

function loadGitHubOwnedRepositoriesCache(): GitHubOwnedRepositoriesCache | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(GITHUB_OWNED_REPOSITORIES_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<GitHubOwnedRepositoriesCache>;
    if (
      typeof parsed?.login !== "string" ||
      typeof parsed?.updatedAt !== "number" ||
      !Array.isArray(parsed?.repositories)
    ) {
      return null;
    }

    return {
      login: parsed.login,
      updatedAt: parsed.updatedAt,
      repositories: parsed.repositories.filter(isGitHubRepositoryRecord)
    };
  } catch {
    return null;
  }
}

function persistLocalSessionPresets(presets: LocalSessionPreset[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCAL_SESSION_PRESETS_KEY, JSON.stringify(presets));
}

function persistLocalTerminalCommands(commands: TerminalCommandRecord[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCAL_TERMINAL_COMMANDS_KEY, JSON.stringify(commands));
}

function persistLocalGitRepositories(repositories: LocalGitRepository[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCAL_GIT_REPOSITORIES_KEY, JSON.stringify(repositories));
}

function persistLocalTmuxMetadata(records: SyncedTmuxMetadataRecord[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCAL_TMUX_METADATA_KEY, JSON.stringify(records));
}

function persistLocalTerminalHistory(records: SyncedTerminalHistoryRecord[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCAL_TERMINAL_HISTORY_KEY, JSON.stringify(records));
}

function persistGitHubOwnedRepositoriesCache(cache: GitHubOwnedRepositoriesCache) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(GITHUB_OWNED_REPOSITORIES_CACHE_KEY, JSON.stringify(cache));
}

function isTerminalCommandRecord(value: unknown): value is TerminalCommandRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.command === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string"
  );
}

function isGitHubRepositoryRecord(value: unknown): value is GitHubRepositoryRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.fullName === "string" &&
    typeof candidate.ownerLogin === "string" &&
    typeof candidate.ownerType === "string" &&
    typeof candidate.description === "string" &&
    typeof candidate.private === "boolean" &&
    typeof candidate.stargazerCount === "number" &&
    (typeof candidate.language === "string" || candidate.language === null) &&
    typeof candidate.updatedAt === "string" &&
    typeof candidate.htmlUrl === "string" &&
    typeof candidate.cloneUrl === "string" &&
    typeof candidate.defaultBranch === "string"
  );
}

function buildSyncServerRef(server: Pick<ServerRecord, "hostname" | "port" | "username">) {
  return `${server.username.trim()}@${server.hostname.trim()}:${server.port}`;
}

function upsertTmuxMetadataRecord(
  current: SyncedTmuxMetadataRecord[],
  nextRecord: SyncedTmuxMetadataRecord
) {
  const next = current.filter((record) => record.serverRef !== nextRecord.serverRef);
  return [
    nextRecord,
    ...next
  ].sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
}

function buildGitReviewDraft(repository: GitRepositoryRecord) {
  const review = repository.review;
  const commits = repository.recentCommits
    .slice(0, Math.min(repository.recentCommits.length, 5))
    .map((commit) => `- ${commit.summary} (${commit.id.slice(0, 7)})`)
    .join("\n");
  const changes = repository.changes
    .slice(0, Math.min(repository.changes.length, 8))
    .map((change) => `- ${change.status}: ${change.path}`)
    .join("\n");

  return [
    `# ${repository.name}`,
    "",
    `Branch: ${repository.branch}`,
    `Base: ${review?.baseBranch ?? repository.defaultBase ?? "n/a"}`,
    review
      ? `Ready for review with ${review.commitCount} commit${review.commitCount === 1 ? "" : "s"} and ${review.changedFiles} changed file${review.changedFiles === 1 ? "" : "s"}.`
      : "Local review draft is not ready yet.",
    "",
    "## Recent commits",
    commits || "- No commits yet",
    "",
    "## Working tree",
    changes || "- Working tree is clean"
  ].join("\n");
}

function normalizeTerminalCommandInput(command: string) {
  const withoutTrailingBreaks = command.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n+$/u, "");
  return `${withoutTrailingBreaks.replace(/\n/g, "\r")}\r`;
}

function findProjectRepository(project: ProjectRecord, repositories: GitRepositoryView[]) {
  const projectName = normalizeProjectRepositoryKey(project.name);
  const projectPath = project.path.trim();
  const projectRepo = project.githubRepoFullName.trim().toLowerCase();
  return (
    repositories.find((repository) => repository.path === projectPath) ??
    repositories.find((repository) => {
      const snapshot = repository.snapshot;
      if (!snapshot || !projectRepo) {
        return false;
      }

      return snapshot.remotes.some((remote) =>
        [remote.fetchUrl, remote.pushUrl].some(
          (value) => normalizeGitHubRepositorySlug(value) === projectRepo
        )
      );
    }) ??
    repositories.find((repository) => normalizeProjectRepositoryKey(repository.name) === projectName) ??
    repositories.find((repository) => normalizeProjectRepositoryKey(repository.path).includes(projectName)) ??
    null
  );
}

function findProjectRuntimeServer(project: ProjectRecord, servers: ServerRecord[]) {
  return (
    (project.linkedServerId
      ? servers.find((server) => server.id === project.linkedServerId) ?? null
      : null) ??
    servers.find((server) => server.projectId === project.id) ??
    null
  );
}

function normalizeProjectRepositoryKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function normalizeGitHubRepositorySlug(value: string) {
  const normalized = value.trim().replace(/\.git$/i, "");
  const sshMatch = normalized.match(/github\.com[:/]([^/]+\/[^/]+)$/i);
  if (sshMatch) {
    return sshMatch[1].toLowerCase();
  }

  const httpMatch = normalized.match(/github\.com\/([^/]+\/[^/]+)$/i);
  return httpMatch ? httpMatch[1].toLowerCase() : "";
}

function getTerminalSurface(tab: TerminalTab) {
  return tab.surface === "relay" ? "relay" : "sessions";
}

function mergeTerminalStatus(
  current: TerminalTab["status"] | undefined,
  next: TerminalTab["status"]
): TerminalTab["status"] {
  if (!current) {
    return next;
  }

  const rank: Record<TerminalTab["status"], number> = {
    connecting: 1,
    connected: 2,
    closed: 3,
    error: 3
  };

  return rank[next] >= rank[current] ? next : current;
}
