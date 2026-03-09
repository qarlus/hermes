import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  buildSshTarget,
  defaultProjectInput,
  defaultServerInput,
  projectDisplayLabel,
  serverDisplayLabel,
  type KeychainItemRecord,
  type ProjectInput,
  type ProjectRecord,
  type ServerInput,
  type ServerRecord,
  type TerminalExitEvent,
  type TerminalStatusEvent,
  type TerminalTab,
  type TmuxSessionRecord
} from "@hermes/core";
import {
  closeSession,
  connectSession,
  createProject,
  createServer,
  deleteKeychainItem,
  deleteProject,
  deleteServer,
  listKeychainItems,
  listProjects,
  listServers,
  listTmuxSessions,
  resizeSession,
  updateKeychainItemName,
  updateProject,
  updateServer,
  writeSession
} from "@hermes/db";
import { noxTheme } from "@hermes/ui";
import { AppDialogs } from "./components/AppDialogs";
import { AppHeader } from "./components/AppHeader";
import { AppRail } from "./components/AppRail";
import { AppStage } from "./components/AppStage";
import {
  getErrorMessage,
  type InspectorState,
  mapServerToInput,
  normalizeProjectInput,
  normalizeServerInput,
  type ViewState
} from "./lib/app";
import { isTauriRuntime } from "./lib/runtime";
import { useAppShortcuts } from "./lib/useAppShortcuts";
import { useBufferedTerminalInput } from "./lib/useBufferedTerminalInput";

export function App() {
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
  const [statusText, setStatusText] = useState("Local only. Ready when offline.");
  const [editingKeychainItem, setEditingKeychainItem] = useState<KeychainItemRecord | null>(null);
  const [keychainNameDraft, setKeychainNameDraft] = useState("");

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );
  const selectedServer = useMemo(
    () => servers.find((server) => server.id === selectedServerId) ?? null,
    [servers, selectedServerId]
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

  const filteredKeychainItems = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) {
      return keychainItems;
    }

    return keychainItems.filter((item) =>
      [item.name, item.kind].some((value) => value.toLowerCase().includes(query))
    );
  }, [deferredSearch, keychainItems]);

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
    if (view !== "workspace" || !selectedServerId || !isTauriRuntime()) {
      setTmuxSessions([]);
      setTmuxLoading(false);
      return;
    }

    void refreshTmuxSessions(selectedServerId);
  }, [selectedServerId, view]);

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
      setStatusText(getErrorMessage(error));
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
        setView("workspace");
        setStatusText(`Created workspace ${projectDisplayLabel(created)}.`);
      } else if (selectedProjectId) {
        const updated = await updateProject(selectedProjectId, normalizeProjectInput(projectDraft));
        setProjects((current) =>
          current.map((project) => (project.id === updated.id ? updated : project))
        );
        setStatusText(`Updated ${projectDisplayLabel(updated)}.`);
      }

      setInspector({ kind: "hidden" });
    } catch (error) {
      setStatusText(getErrorMessage(error));
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
        setView("workspace");
        setStatusText(`Added server ${serverDisplayLabel(created)}.`);
      } else if (selectedServerId) {
        const updated = await updateServer(selectedServerId, normalizeServerInput(serverDraft));
        setServers((current) =>
          current.map((server) => (server.id === updated.id ? updated : server))
        );
        setSelectedProjectId(updated.projectId);
        setSelectedServerId(updated.id);
        setStatusText(`Updated server ${serverDisplayLabel(updated)}.`);
      }

      await refreshKeychain();
      setInspector({ kind: "hidden" });
    } catch (error) {
      setStatusText(getErrorMessage(error));
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
      setStatusText("Deleted workspace and its servers.");
    } catch (error) {
      setStatusText(getErrorMessage(error));
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
      setStatusText("Deleted server.");
    } catch (error) {
      setStatusText(getErrorMessage(error));
    }
  };

  const handleOpenProject = (projectId: string) => {
    setSelectedProjectId(projectId);
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

  const handleConnect = async (serverId: string, tmuxSession?: string) => {
    try {
      const tab = await connectSession({ serverId, tmuxSession });
      setTabs((current) => [...current, tab]);
      setActiveTabId(tab.id);
      setStatusText(`Opening ${tab.title}...`);
    } catch (error) {
      setStatusText(getErrorMessage(error));
    }
  };

  const handleDeleteKeychainItem = async (id: string) => {
    try {
      await deleteKeychainItem(id);
      setEditingKeychainItem(null);
      await refreshWorkspace();
      setStatusText("Deleted saved credential.");
    } catch (error) {
      setStatusText(getErrorMessage(error));
    }
  };

  const handleSaveKeychainItem = async () => {
    if (!editingKeychainItem) {
      return;
    }

    setSaving(true);
    try {
      await updateKeychainItemName(editingKeychainItem.id, keychainNameDraft.trim());
      setEditingKeychainItem(null);
      await refreshWorkspace();
      setStatusText("Updated credential name.");
    } catch (error) {
      setStatusText(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleCloseTab = async (tabId: string) => {
    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    clearTerminalInput(tabId);

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
      setStatusText("Closed terminal.");
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
    setTabs((current) =>
      current.map((tab) =>
        tab.id === event.sessionId ? { ...tab, status: event.status } : tab
      )
    );
    setStatusText(event.message);
  };

  const handleExit = (event: TerminalExitEvent) => {
    setTabs((current) =>
      current.map((tab) =>
        tab.id === event.sessionId ? { ...tab, status: "closed" } : tab
      )
    );
    setStatusText(event.reason + (event.exitCode !== null ? ` (exit ${event.exitCode})` : ""));
  };

  const headerTitle =
    view === "workspace" && selectedProject
      ? projectDisplayLabel(selectedProject)
      : view === "keychain"
        ? "Keychain"
        : "Dashboard";

  const headerSubtitle =
    view === "workspace" && selectedServer
      ? `${buildSshTarget(selectedServer)} / port ${selectedServer.port}${selectedServer.useTmux ? ` / tmux ${selectedServer.tmuxSession}` : ""}`
      : view === "workspace"
        ? "Connections and tmux sessions"
        : view === "keychain"
          ? `${filteredKeychainItems.length} saved credential${filteredKeychainItems.length === 1 ? "" : "s"}`
          : loading
            ? "Loading local workspaces..."
            : `${filteredProjects.length} workspace${filteredProjects.length === 1 ? "" : "s"} ready locally.`;

  const { clearTerminalInput, queueTerminalInput } = useBufferedTerminalInput({
    onError: (error) => setStatusText(getErrorMessage(error)),
    onFlush: writeSession
  });

  useAppShortcuts({
    onConnectServer: (serverId) => void handleConnect(serverId),
    onCreateProject: openCreateProject,
    onCreateServer: openCreateServer,
    onDismiss: () => {
      setInspector({ kind: "hidden" });
      setEditingKeychainItem(null);
    },
    selectedProjectId,
    selectedServerId,
    view
  });

  return (
    <main className="app-shell" style={{ ["--accent" as string]: noxTheme.colors.accent }}>
      <AppRail view={view} onNavigate={setView} />

      <section className="main-panel main-panel--full">
        <AppHeader
          canEditWorkspace={Boolean(selectedProject)}
          onBackToDashboard={() => setView("dashboard")}
          onCreateWorkspace={openCreateProject}
          onEditWorkspace={openEditProject}
          onSearchChange={setSearch}
          search={search}
          subtitle={headerSubtitle}
          title={headerTitle}
          view={view}
        />

        <div className="main-panel__status">{statusText}</div>

        <AppStage
          activeTabId={activeTabId}
          filteredKeychainItems={filteredKeychainItems}
          filteredProjects={filteredProjects}
          onCloseTab={(tabId) => void handleCloseTab(tabId)}
          onConnect={(serverId, tmuxSession) => void handleConnect(serverId, tmuxSession)}
          onCreateProject={openCreateProject}
          onCreateServer={openCreateServer}
          onDeleteKeychainItem={(id) => void handleDeleteKeychainItem(id)}
          onEditServer={openEditServerById}
          onExit={handleExit}
          onInput={queueTerminalInput}
          onNewTab={tabs.length > 0 ? () => void handleOpenSiblingTab() : undefined}
          onOpenProject={handleOpenProject}
          onRefreshTmux={() => selectedServerId && void refreshTmuxSessions(selectedServerId)}
          onRenameKeychainItem={(item) => {
            setEditingKeychainItem(item);
            setKeychainNameDraft(item.name);
          }}
          onResize={(sessionId, cols, rows) => {
            void resizeSession(sessionId, cols, rows).catch(() => undefined);
          }}
          onSearchChange={setSearch}
          onSelectServer={handleSelectServer}
          onSelectTab={setActiveTabId}
          onStatus={handleStatus}
          projectServers={projectServers}
          search={search}
          selectedProject={selectedProject}
          selectedServer={selectedServer}
          selectedServerId={selectedServerId}
          serverCountByProject={serverCountByProject}
          stageClassName={`stage stage--solo ${view === "dashboard" ? "stage--dashboard" : ""}`}
          tabs={tabs}
          tmuxLoading={tmuxLoading}
          tmuxSessions={tmuxSessions}
          view={view}
        />
      </section>

      <AppDialogs
        editingKeychainItem={editingKeychainItem}
        inspector={inspector}
        keychainNameDraft={keychainNameDraft}
        onCloseInspector={() => setInspector({ kind: "hidden" })}
        onCloseKeychainEditor={() => setEditingKeychainItem(null)}
        onDeleteKeychainItem={(id) => void handleDeleteKeychainItem(id)}
        onDeleteProject={() => void handleDeleteProject()}
        onDeleteServer={() => void handleDeleteServer()}
        onKeychainNameChange={setKeychainNameDraft}
        onProjectChange={(field, value) =>
          setProjectDraft((current) => ({
            ...current,
            [field]: value
          }))
        }
        onSaveKeychainItem={() => void handleSaveKeychainItem()}
        onSaveProject={() => void saveProject()}
        onSaveServer={() => void saveServer()}
        onServerChange={(field, value) =>
          setServerDraft((current) => ({
            ...current,
            [field]: value
          }))
        }
        projectDraft={projectDraft}
        projects={projects}
        saving={saving}
        serverDraft={serverDraft}
      />
    </main>
  );
}
