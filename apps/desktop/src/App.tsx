import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpCircle,
  Copy,
  FolderPlus,
  Github,
  KeyRound,
  Laptop,
  RefreshCcw,
  Server,
  Settings2,
  TerminalSquare
} from "lucide-react";
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
  checkoutGitBranch,
  createTerminalCommand,
  createGitBranch,
  createLocalSshKey,
  createKeychainItem,
  createProject,
  createServer,
  deleteTerminalCommand,
  deleteKeychainItem,
  deleteProject,
  deleteServer,
  disconnectGitHub,
  getGitHubSession,
  isGitHubDeviceFlowAvailable,
  getDefaultSshDirectory,
  getCliToolUpdate,
  getKeychainPublicKey,
  inspectRelayHost,
  inspectGitRepository,
  listGitHubRepositories,
  listKeychainItems,
  listInstalledCliTools,
  listProjects,
  listTerminalCommands,
  listSessionStatuses,
  listServers,
  listTmuxSessions,
  pollGitHubDeviceFlow,
  pushGitRepository,
  resizeSession,
  runCliToolUpdate,
  searchGitHubRepositories,
  signInGitHubWithToken,
  startGitHubDeviceFlow,
  updateKeychainItemName,
  updateProject,
  updateServer,
  writeSession
} from "@hermes/db";
import type { RelayWorkspaceSession } from "@hermes/sync";
import { AppDialogs } from "./components/AppDialogs";
import { AppHeader } from "./components/AppHeader";
import { AppRail } from "./components/AppRail";
import { AppStage } from "./components/AppStage";
import type { GitRepositoryView, GitToolbarContext } from "./features/git/GitPage";
import { RelaySetupDialog } from "./features/settings/RelaySetupDialog";
import { LocalSessionPresetEditor } from "./features/sessions/LocalSessionPresetEditor";
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
  getTerminalLaunchProfiles,
  isLocalGitRepository,
  isLocalSessionPreset,
  loadHermesSettings,
  loadRelayClientState,
  parseHermesSyncBundle,
  persistHermesSettings,
  persistRelayClientState,
  resolveLocalTerminalLaunch,
  sanitizeRelayClientState,
  sanitizeHermesSettings,
  type HermesSettings,
  type LocalGitRepository,
  type LocalSessionPreset,
  type RelayClientState
} from "./lib/settings";
import {
  connectRelayWorkspace,
  getRelayHealth,
  normalizeRelayUrl,
  revokeRelayDevice
} from "./lib/relay";
import { useAppShortcuts } from "./lib/useAppShortcuts";
import { useBufferedTerminalInput } from "./lib/useBufferedTerminalInput";

const LOCAL_SESSION_PRESETS_KEY = "hermes.localSessionPresets";
const LOCAL_GIT_REPOSITORIES_KEY = "hermes.localGitRepositories";
const LOCAL_TERMINAL_COMMANDS_KEY = "hermes.terminalCommands";
const GITHUB_OWNED_REPOSITORIES_CACHE_KEY = "hermes.githubOwnedRepositories";
const GITHUB_OWNED_REPOSITORIES_CACHE_TTL_MS = 5 * 60 * 1000;
const TOAST_DURATION_MS = 2800;
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

export function App() {
  const devicePlatform = useMemo(() => detectDevicePlatform(), []);
  const [workspaceMode, setWorkspaceMode] = useState<"home" | "terminal">("home");
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [keychainItems, setKeychainItems] = useState<KeychainItemRecord[]>([]);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>("dashboard");
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
  const [relayInstallSessionId, setRelayInstallSessionId] = useState<string | null>(null);
  const [relayInstallState, setRelayInstallState] = useState<
    "idle" | "installing" | "checking" | "ready" | "error"
  >("idle");
  const [relayInstallMessage, setRelayInstallMessage] = useState<string | null>(null);
  const [relayBusyAction, setRelayBusyAction] = useState<
    "refresh" | "revoke" | "health" | "inspect" | null
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
  const activeTerminalLabel = useMemo(
    () =>
      activeSessionTabServer
        ? buildSshTarget(activeSessionTabServer)
        : activeSessionTab?.title ?? null,
    [activeSessionTab?.title, activeSessionTabServer]
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
    if (view === "workspace" && !selectedProjectId) {
      setView("dashboard");
    }
  }, [selectedProjectId, view]);

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
    persistHermesSettings(settings);
  }, [settings]);

  useEffect(() => {
    persistRelayClientState(relayState);
  }, [relayState]);

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

  const refreshTmuxSessions = async (serverId: string) => {
    setTmuxLoading(true);
    try {
      const sessions = await listTmuxSessions(serverId);
      setTmuxSessions(sessions);
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

    setProjectDraft({
      name: selectedProject.name,
      description: selectedProject.description
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

      if (inspector.mode === "create") {
        const created = await createProject(normalizeProjectInput(projectDraft));
        setProjects((current) => [created, ...current]);
        setSelectedProjectId(created.id);
        setWorkspaceMode("home");
        setView("workspace");
        pushToast(`Created workspace ${projectDisplayLabel(created)}.`, "success");
      } else if (selectedProjectId) {
        const updated = await updateProject(selectedProjectId, normalizeProjectInput(projectDraft));
        setProjects((current) =>
          current.map((project) => (project.id === updated.id ? updated : project))
        );
        pushToast(`Updated ${projectDisplayLabel(updated)}.`, "success");
      }

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
      pushToast("Deleted workspace and its servers.", "success");
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

  const handleConnect = async (
    serverId: string,
    tmuxSession?: string,
    surface: "sessions" | "relay" = "sessions",
    activateView = true
  ) => {
    try {
      const server = servers.find((candidate) => candidate.id === serverId);
      if (server) {
        setSelectedProjectId(server.projectId);
        setSelectedServerId(server.id);
      }
      if (activateView) {
        setWorkspaceMode("terminal");
        setView("sessions");
        setSessionLauncherOpen(false);
      }

      const tab = await connectSession({ serverId, tmuxSession });
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
      setActiveTabId(tab.id);
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    }
  };

  const handleOpenRelayServerSession = async (command: string, successMessage: string) => {
    if (!relayHostServer) {
      pushToast("Choose a saved server to use as the relay host first.", "info");
      return;
    }

    const tab = await handleConnect(relayHostServer.id, undefined, "sessions", true);
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
          const { autoBootstrapped, health, relayUrl } = await connectRelayWithCandidates(candidateUrls);
          setRelayInstallState("ready");
          setRelayInstallMessage(
            autoBootstrapped
              ? `Relay ${health.relayId.slice(0, 8)} is live. This device is now the master.`
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
    if (targetServerId) {
      updateRelayState((current) => ({
        ...current,
        hostServerId: targetServerId
      }));
    }

    setRelaySetupOpen(true);
    if (switchedHost) {
      setRelayInstallSessionId(null);
      setRelayInstallState("idle");
      setRelayInstallMessage(null);
    }

    if (targetServerId) {
      void handleInspectRelayHostByServerId(targetServerId);
    }
  };

  const handleNavigate = (nextView: ViewState) => {
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
      pushToast("Agent updates are only available in the desktop app.", "info");
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

  const handleExportSyncBundle = () => {
    setSyncBusyAction("export");
    try {
      const exportedAt = new Date().toISOString();
      const bundle = buildHermesSyncBundle({
        settings: {
          ...settings,
          lastExportedAt: exportedAt
        },
        projects,
        servers,
        localSessionPresets,
        localGitRepositories: settings.syncIncludesPinnedRepositories ? localGitRepositories : [],
        terminalCommands: settings.syncIncludesCommands ? terminalCommands : []
      });

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
      `Replace local workspaces, servers, saved terminal commands, and settings with ${file.name}? Keychain secrets remain on this device.`
    );
    if (!confirmation) {
      return;
    }

    setSyncBusyAction("import");
    try {
      const bundle = parseHermesSyncBundle(await file.text(), devicePlatform);

      if (!isTauriRuntime()) {
        throw new Error("Workspace import is only available in the desktop runtime.");
      }

      for (const command of terminalCommands) {
        await deleteTerminalCommand(command.id);
      }

      for (const project of projects) {
        await deleteProject(project.id);
      }

      const projectIdMap = new Map<string, string>();

      for (const project of bundle.projects) {
        const createdProject = await createProject({
          name: project.name,
          description: project.description
        });
        projectIdMap.set(project.id, createdProject.id);
      }

      for (const server of bundle.servers) {
        const mappedProjectId = projectIdMap.get(server.projectId);
        if (!mappedProjectId) {
          continue;
        }

        await createServer({
          projectId: mappedProjectId,
          name: server.name,
          hostname: server.hostname,
          port: server.port,
          username: server.username,
          authKind: server.authKind,
          credentialId: null,
          credentialName: server.credentialName ?? "",
          credentialSecret: "",
          isFavorite: server.isFavorite,
          tmuxSession: server.tmuxSession,
          useTmux: server.useTmux,
          notes: server.notes
        });
      }

      for (const command of bundle.terminalCommands) {
        await createTerminalCommand({
          name: command.name,
          command: command.command
        });
      }

      setLocalSessionPresets(bundle.localSessionPresets);
      setLocalGitRepositories(bundle.localGitRepositories);
      updateSettings({
        ...bundle.settings,
        lastImportedAt: new Date().toISOString()
      });

      await refreshWorkspace();
      await loadSavedTerminalCommands();
      pushToast("Imported settings and local workspace bundle.", "success");
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
      adminToken: session.adminToken,
      devices: session.workspace.devices,
      lastConnectedAt: new Date().toISOString(),
      lastError: null
    }));
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

  const connectRelayAtUrl = async (relayUrl: string) => {
    const health = await getRelayHealth(relayUrl);

    updateRelayState((current) => ({
      ...current,
      relayId: health.relayId,
      lastError: null
    }));

    const wasUnlinked = !relayState.currentDeviceId;
    const session = await connectRelayWorkspace(relayUrl, {
      deviceId: relayState.localDeviceId,
      deviceName: relayState.deviceName.trim(),
      devicePlatform: devicePlatform
    });
    applyRelaySession(session, relayUrl);

    return {
      autoBootstrapped: wasUnlinked && session.currentDeviceRole === "master",
      health
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
      const { autoBootstrapped, health, relayUrl } = await connectRelayWithCandidates(candidateUrls);
      setRelayInstallState("ready");
      setRelayInstallMessage(
        autoBootstrapped
          ? `Relay ${health.relayId.slice(0, 8)} is reachable. This device is now the master.`
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

  const handleInspectRelayHostByServerId = async (serverId: string | null) => {
    if (!serverId) {
      pushToast("Choose a relay host server first.", "info");
      return;
    }

    setRelayBusyAction("inspect");
    setRelayInstallState("checking");
    setRelayInstallMessage("Inspecting the selected host, checking Tailscale, and discovering the relay endpoint.");
    try {
      const inspectedServer = servers.find((server) => server.id === serverId) ?? null;
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
        pushToast(
          inspectedServer
            ? `${serverDisplayLabel(inspectedServer)} is ready for relay install.`
            : "Host inspection passed and the server is ready for relay install.",
          "success"
        );
        return;
      }

      if (!inspection.relayHealthy) {
        setRelayInstallState("checking");
        setRelayInstallMessage("Relay package is present on the host. Finish installation or run a relay health check once the container is ready.");
        pushToast("Relay package detected on the selected host.", "success");
        return;
      }

      const { autoBootstrapped, health, relayUrl } = await connectRelayWithCandidates(candidateUrls);
      setRelayInstallState("ready");
      setRelayInstallMessage(
        autoBootstrapped
          ? `Relay ${health.relayId.slice(0, 8)} is reachable. This device is now the master.`
          : inspection.relayHealthy
            ? `Relay already detected on this server and this device is linked.`
            : `Host inspection completed. Hermes will use ${relayUrl}.`
      );
      pushToast(
        autoBootstrapped
          ? `Relay ${health.relayId.slice(0, 8)} is reachable. This device is now the master.`
          : inspection.relayHealthy
            ? `Relay already detected on this server. Using ${relayUrl}.`
            : `Using relay endpoint ${relayUrl}.`,
        "success"
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
      await connectRelayWithCandidates(candidateUrls);
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
      const session = await revokeRelayDevice(normalizeRelayUrl(relayUrls.primary), {
        workspaceId: relayState.workspaceId,
        adminToken: relayState.adminToken,
        deviceId
      });
      applyRelaySession(session, relayUrls.primary);
      pushToast("Revoked linked device.", "success");
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

  const handleCommitGitRepository = async (repositoryId: string) => {
    const repository = gitRepositories.find((candidate) => candidate.id === repositoryId);
    if (!repository) {
      return;
    }

    setGitBusyAction(`commit:${repositoryId}`);
    try {
      const snapshot = await commitGitRepository(
        repository.snapshot?.rootPath ?? repository.path,
        gitCommitMessage
      );
      syncGitRepositorySnapshot(repositoryId, snapshot);
      setGitCommitMessage("");
      pushToast(`Committed ${snapshot.name}.`, "success");
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setGitBusyAction(null);
    }
  };

  const handleCreateGitBranch = async (repositoryId: string) => {
    const repository = gitRepositories.find((candidate) => candidate.id === repositoryId);
    if (!repository) {
      return;
    }

    setGitBusyAction(`branch:${repositoryId}`);
    try {
      const snapshot = await createGitBranch(
        repository.snapshot?.rootPath ?? repository.path,
        gitBranchName
      );
      syncGitRepositorySnapshot(repositoryId, snapshot);
      setGitBranchName("");
      pushToast(`Checked out ${snapshot.branch}.`, "success");
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setGitBusyAction(null);
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
  };

  const headerTitle =
    view === "workspace" && selectedProject
      ? projectDisplayLabel(selectedProject)
      : view === "git" && gitToolbarContext.headerTitle
        ? gitToolbarContext.headerTitle
      : view === "sessions"
        ? "Sessions"
      : view === "git"
        ? "Git"
      : view === "files"
        ? "Files"
      : view === "settings"
        ? "Settings"
      : view === "keychain"
        ? "Keychain"
        : "Dashboard";

  const headerSubtitle =
    view === "sessions" && activeSessionTabServer
      ? `${sessionTabs.length} live terminal${sessionTabs.length === 1 ? "" : "s"} / ${buildSshTarget(activeSessionTabServer)} / port ${activeSessionTabServer.port}`
      : view === "sessions"
        ? `${sessionTabs.length} active terminal${sessionTabs.length === 1 ? "" : "s"}`
      : view === "workspace" && workspaceMode === "terminal" && selectedServer
      ? `${buildSshTarget(selectedServer)} / port ${selectedServer.port}${selectedServer.useTmux ? ` / tmux ${selectedServer.tmuxSession}` : ""}`
      : view === "workspace"
        ? "Servers, live sessions, and tmux reconnects"
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
          ? `${filteredKeychainItems.length} saved credential${filteredKeychainItems.length === 1 ? "" : "s"}`
          : loading
            ? "Loading local workspaces..."
            : `${filteredProjects.length} workspace${filteredProjects.length === 1 ? "" : "s"} ready locally.`;

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

  return (
    <main
      className="app-shell"
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
      <AppRail onNavigate={handleNavigate} view={view} />

      <section className="main-panel main-panel--full">
        <AppHeader
          canEditWorkspace={Boolean(selectedProject)}
          eyebrow={view === "git" ? gitToolbarContext.headerEyebrow ?? undefined : undefined}
          backLabel="Repositories"
          meta={view === "git" ? gitToolbarContext.headerMeta : undefined}
          onBack={view === "git" ? gitToolbarContext.onBack ?? undefined : undefined}
          onBackToDashboard={() => {
            if (view === "workspace" && workspaceMode === "terminal") {
              setWorkspaceMode("home");
              return;
            }

            setView("dashboard");
          }}
          onCreateWorkspace={openCreateProject}
          onEditWorkspace={openEditProject}
          onSearchChange={setSearch}
          search={search}
          subtitle={headerSubtitle}
          title={headerTitle}
          view={view}
        />

        {view === "sessions" ? (
          <div className="main-panel__quick-actions">
            <div className="main-panel__quick-actions-row">
              <button
                className="quick-action-chip quick-action-chip--primary"
                onClick={() => void handleConnectLocal()}
                type="button"
              >
                <Laptop size={14} />
                Local device
              </button>
              <button
                className="quick-action-chip"
                onClick={() => setSessionLauncherOpen(true)}
                type="button"
              >
                <Server size={14} />
                Saved server
              </button>
              <button className="quick-action-chip" onClick={openToolUpdates} type="button">
                <ArrowUpCircle size={14} />
                Agent updates
              </button>
              <button
                className="quick-action-chip"
                onClick={openLocalSessionPresetEditor}
                type="button"
              >
                Save path
              </button>
            </div>
            {localSessionPresets.length > 0 ? (
              <div className="main-panel__quick-actions-row main-panel__quick-actions-row--presets">
                {localSessionPresets.map((preset) => (
                  <div className="session-preset-chip" key={preset.id}>
                    <button
                      className="session-preset-chip__launch"
                      onClick={() => void handleLaunchLocalPreset(preset.id)}
                      type="button"
                    >
                      {preset.name}
                    </button>
                    <button
                      aria-label={`Remove ${preset.name}`}
                      className="session-preset-chip__remove"
                      onClick={() => handleRemoveLocalPreset(preset.id)}
                      type="button"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : view === "workspace" ? (
          <div className="main-panel__quick-actions">
            <div className="main-panel__quick-actions-row">
              <button
                className="quick-action-chip quick-action-chip--primary"
                onClick={openCreateServer}
                type="button"
              >
                <Server size={14} />
                New server
              </button>
              <button className="quick-action-chip" onClick={() => setView("sessions")} type="button">
                <TerminalSquare size={14} />
                Sessions
              </button>
              <button
                className="quick-action-chip"
                disabled={!selectedProject}
                onClick={openEditProject}
                type="button"
              >
                <Settings2 size={14} />
                Edit workspace
              </button>
              <button className="quick-action-chip" onClick={openCreateProject} type="button">
                <FolderPlus size={14} />
                New workspace
              </button>
            </div>
          </div>
        ) : view === "keychain" ? (
          <div className="main-panel__quick-actions">
            <div className="main-panel__quick-actions-row">
              <button className="quick-action-chip quick-action-chip--primary" onClick={openCreateKeychainItem} type="button">
                <KeyRound size={14} />
                Add credential
              </button>
              <button className="quick-action-chip" onClick={() => void openCreateLocalSshKey()} type="button">
                <KeyRound size={14} />
                Create SSH key
              </button>
            </div>
          </div>
        ) : view === "git" ? (
          <div className="main-panel__quick-actions">
            <div className="main-panel__quick-actions-row">
              <button
                className="quick-action-chip quick-action-chip--primary"
                onClick={() => void handleAddGitRepository()}
                type="button"
              >
                <FolderPlus size={14} />
                Pin checkout
              </button>
              <button
                className="quick-action-chip"
                disabled={gitLoading}
                onClick={() => void refreshGitRepositories()}
                type="button"
              >
                <RefreshCcw size={14} />
                Refresh local
              </button>
              {gitToolbarContext.shellRepositoryId ? (
                <button
                  className="quick-action-chip"
                  disabled={gitBusyAction === `shell:${gitToolbarContext.shellRepositoryId}`}
                  onClick={() => void handleOpenGitRepositoryShell(gitToolbarContext.shellRepositoryId!)}
                  type="button"
                >
                  <TerminalSquare size={14} />
                  {gitBusyAction === `shell:${gitToolbarContext.shellRepositoryId}` ? "Opening..." : "Open shell"}
                </button>
              ) : null}
              {gitToolbarContext.reviewRepositoryId ? (
                <button
                  className="quick-action-chip"
                  onClick={() => void handleCopyGitReviewDraft(gitToolbarContext.reviewRepositoryId!)}
                  type="button"
                >
                  <Copy size={14} />
                  Copy review
                </button>
              ) : null}
              {gitToolbarContext.cloneUrl ? (
                <button
                  className="quick-action-chip"
                  onClick={() => void handleCopyGitHubCloneUrl(gitToolbarContext.cloneUrl!)}
                  type="button"
                >
                  <Copy size={14} />
                  Copy clone URL
                </button>
              ) : null}
              {gitHubSession ? (
                <>
                  <button
                    className="quick-action-chip"
                    disabled={gitHubLoading || gitHubRepositoryLoading}
                    onClick={() => void loadGitHubOwnedRepositories()}
                    type="button"
                  >
                    <RefreshCcw size={14} />
                    Refresh GitHub
                  </button>
                  <button className="quick-action-chip" onClick={() => void handleDisconnectGitHub()} type="button">
                    <Github size={14} />
                    Disconnect GitHub
                  </button>
                </>
              ) : (
                <button
                  className="quick-action-chip"
                  onClick={() => setGitHubSetupRequest((current) => current + 1)}
                  type="button"
                >
                  <Github size={14} />
                  Connect GitHub
                </button>
              )}
            </div>
          </div>
        ) : null}

        <AppStage
          activeTabId={view === "sessions" ? activeSessionTab?.id ?? null : activeTabId}
          activeTheme={activeTheme}
          devicePlatform={devicePlatform}
          favoriteServers={favoriteServers}
          gitRepositories={gitRepositories}
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
          relayBusyAction={relayBusyAction}
          relayState={relayState}
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
          onDeleteKeychainItem={(id) => void handleDeleteKeychainItem(id)}
          onEditServer={openEditServerById}
          onOpenRelaySetup={() => openRelaySetup()}
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
          onOpenGitRepositoryShell={(repositoryId) => void handleOpenGitRepositoryShell(repositoryId)}
          localSessionPresets={localSessionPresets}
          onLaunchLocalPreset={(presetId) => void handleLaunchLocalPreset(presetId)}
          onOpenSessionLauncher={() => setSessionLauncherOpen(true)}
          onOpenTerminalSession={handleOpenTerminalSession}
          onOpenProject={handleOpenProject}
          onOpenPresetEditor={openLocalSessionPresetEditor}
          onOpenToolUpdates={openToolUpdates}
          onRefreshTmux={() => selectedServerId && void refreshTmuxSessions(selectedServerId)}
          onRefreshRelayWorkspace={() => void handleRefreshRelayWorkspace()}
          onRefreshGitHubRepositories={() => void loadGitHubOwnedRepositories()}
          onRefreshGitRepositories={() => void refreshGitRepositories()}
          onRemoveGitRepository={handleRemoveGitRepository}
          onRemoveLocalPreset={handleRemoveLocalPreset}
          onRevokeRelayDevice={(deviceId) => void handleRevokeRelayDevice(deviceId)}
          onRunTerminalCommand={handleRunTerminalCommand}
          onSyncIncludesCommandsChange={(value) =>
            updateSettings((current) => ({
              ...current,
              syncIncludesCommands: value
            }))
          }
          onSyncIncludesPinnedRepositoriesChange={(value) =>
            updateSettings((current) => ({
              ...current,
              syncIncludesPinnedRepositories: value
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
          onSelectServer={handleSelectServer}
          onSelectTab={handleOpenTerminalSession}
          onStartLocalSession={() => void handleConnectLocal()}
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
          servers={servers}
          serverCountByProject={serverCountByProject}
          settings={settings}
          stageClassName={`stage stage--solo ${view === "dashboard" ? "stage--dashboard" : ""}`}
          syncBusyAction={syncBusyAction}
          tabs={sessionTabs}
          terminalCommands={terminalCommands}
          terminalProfiles={terminalProfiles}
          tmuxLoading={tmuxLoading}
          tmuxSessions={tmuxSessions}
          view={view}
          workspaceMode={workspaceMode}
          workspaceTabs={workspaceTabs}
        />
      </section>

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
          setProjectDraft((current) => ({
            ...current,
            [field]: value
          }))
        }
        onSaveKeychainItem={() => void handleSaveKeychainItem()}
        onSaveProject={() => void saveProject()}
        onSaveServer={() => void saveServer()}
        onServerChange={handleServerDraftChange}
        projectDraft={projectDraft}
        projects={projects}
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
          onCheckRelayHealth={() => void handleCheckRelayHealth()}
          onClose={() => setRelaySetupOpen(false)}
          onInspectRelayHost={() => void handleInspectRelayHost()}
          onOpenRelayInstallSession={() => void handleInstallRelayOnHost()}
          onRefreshRelayWorkspace={() => void handleRefreshRelayWorkspace()}
          onRelayInstallRuntimeChange={(value) =>
            updateRelayState((current) => ({
              ...current,
              installRuntime: value
            }))
          }
          platform={devicePlatform}
          relayBusyAction={relayBusyAction}
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
