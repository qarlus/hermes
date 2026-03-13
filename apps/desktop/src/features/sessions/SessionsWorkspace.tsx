import { useState, type ReactNode } from "react";
import {
  FolderSimple,
  MonitorPlay,
  Stack,
  TerminalWindow
} from "@phosphor-icons/react";
import {
  buildSshTarget,
  serverDisplayLabel,
  type ProjectRecord,
  type ServerRecord,
  type TerminalCommandRecord,
  type TerminalExitEvent,
  type TerminalStatusEvent,
  type TerminalTab
} from "@hermes/core";
import type { GitRepositoryView } from "../git/GitPage";
import { TerminalWorkspace } from "../tabs/TerminalWorkspace";

type LocalSessionPreset = {
  id: string;
  name: string;
  path: string;
};

type SessionsWorkspaceProps = {
  tabs: TerminalTab[];
  activeTabId: string | null;
  projects: ProjectRecord[];
  selectedProjectId: string | null;
  selectedBranchName: string | null;
  gitRepositories: GitRepositoryView[];
  servers: ServerRecord[];
  favoriteServers: ServerRecord[];
  localSessionPresets: LocalSessionPreset[];
  terminalCommands: TerminalCommandRecord[];
  activeTerminalLabel: string | null;
  terminalFontSize: number;
  terminalTheme: {
    background: string;
    foreground: string;
    cursor: string;
    cursorAccent: string;
    selectionBackground: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onInput: (sessionId: string, data: string) => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  onStatus: (event: TerminalStatusEvent) => void;
  onExit: (event: TerminalExitEvent) => void;
  onStartLocalSession: () => void;
  onOpenSessionLauncher: () => void;
  onOpenPresetEditor: () => void;
  onSelectProject: (projectId: string) => void;
  onLaunchLocalPreset: (presetId: string) => void;
  onCreateTerminalCommand: (input: { name: string; command: string }) => void;
  onDeleteTerminalCommand: (id: string) => void;
  onRunTerminalCommand: (command: string) => void;
};

export function SessionsWorkspace({
  tabs,
  activeTabId,
  projects,
  selectedProjectId,
  selectedBranchName,
  gitRepositories,
  servers,
  favoriteServers,
  localSessionPresets,
  terminalCommands,
  activeTerminalLabel,
  terminalFontSize,
  terminalTheme,
  onSelectTab,
  onCloseTab,
  onCreateTerminalCommand,
  onDeleteTerminalCommand,
  onExit,
  onInput,
  onLaunchLocalPreset,
  onOpenPresetEditor,
  onOpenSessionLauncher,
  onResize,
  onRunTerminalCommand,
  onSelectProject,
  onStartLocalSession,
  onStatus
}: SessionsWorkspaceProps) {
  const [previewOpen, setPreviewOpen] = useState(false);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const activeServer = activeTab ? servers.find((server) => server.id === activeTab.serverId) ?? null : null;
  const starterServers = (favoriteServers.length > 0 ? favoriteServers : servers).slice(0, 2);
  const recentPresets = localSessionPresets.slice(0, 2);
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const activeBranchName = selectedBranchName ?? "main";
  const showContextStrip = Boolean(selectedProject || tabs.length > 0);
  const paneConfig = buildPaneConfig(tabs);

  return (
    <section className="sessions-workspace">
      {showContextStrip ? (
        <SessionContextStrip
          contextLabel={selectedProject ? `${selectedProject.name} / ${activeBranchName}` : activeTerminalLabel ?? null}
          terminalCount={tabs.length}
          onStartLocalSession={onStartLocalSession}
          onTogglePreview={() => setPreviewOpen((current) => !current)}
          previewOpen={previewOpen}
        />
      ) : null}

      <div className={`sessions-workspace__body ${previewOpen ? "sessions-workspace__body--with-preview" : ""}`}>
        <div className="sessions-canvas">
          <div className="sessions-canvas__pane-grid sessions-canvas__pane-grid--single">
            <SessionPane>
              <TerminalWorkspace
                activeTabId={activeTabId}
                emptyState={
                  selectedProject ? (
                    <SessionStarterBar
                      starterServers={starterServers}
                      recentPresets={recentPresets}
                      onLaunchLocalPreset={onLaunchLocalPreset}
                      onOpenPresetEditor={onOpenPresetEditor}
                      onOpenSessionLauncher={onOpenSessionLauncher}
                      onStartLocalSession={onStartLocalSession}
                    />
                  ) : (
                    <SessionProjectPicker
                      projects={projects}
                      recentPresets={recentPresets}
                      onLaunchLocalPreset={onLaunchLocalPreset}
                      onOpenPresetEditor={onOpenPresetEditor}
                      onOpenSessionLauncher={onOpenSessionLauncher}
                      onSelectProject={onSelectProject}
                      onStartLocalSession={onStartLocalSession}
                    />
                  )
                }
                emptyTabsLabel={null}
                onCloseTab={onCloseTab}
                onExit={onExit}
                onInput={onInput}
                onResize={onResize}
                onSelectTab={onSelectTab}
                onStatus={onStatus}
                multiPane={paneConfig.multiPane}
                multiPaneColumns={paneConfig.multiPaneColumns}
                multiPaneRows={paneConfig.multiPaneRows}
                hostVariant="pane"
                showTabs={false}
                tabs={tabs}
                terminalFontSize={terminalFontSize}
                terminalTheme={terminalTheme}
                visibleTabIds={paneConfig.visibleTabIds}
              />
            </SessionPane>
          </div>
        </div>

        {previewOpen ? <PreviewPanel activeServer={activeServer} /> : null}
      </div>
    </section>
  );
}

function buildPaneConfig(
  tabs: TerminalTab[]
): {
  multiPane: boolean;
  visibleTabIds: string[];
  multiPaneColumns: number;
  multiPaneRows: number;
} {
  if (tabs.length === 0) {
    return {
      multiPane: false,
      visibleTabIds: [],
      multiPaneColumns: 1,
      multiPaneRows: 1
    };
  }

  const ordered = tabs;

  if (tabs.length === 1) {
    return {
      multiPane: false,
      visibleTabIds: [ordered[0].id],
      multiPaneColumns: 1,
      multiPaneRows: 1
    };
  }

  if (tabs.length === 2) {
    return {
      multiPane: true,
      visibleTabIds: ordered.slice(0, 2).map((tab) => tab.id),
      multiPaneColumns: 2,
      multiPaneRows: 1
    };
  }

  const visibleTabs = ordered.map((tab) => tab.id);
  const multiPaneColumns = tabs.length <= 4 ? 2 : tabs.length <= 9 ? 3 : 4;
  const multiPaneRows = Math.ceil(tabs.length / multiPaneColumns);

  return {
    multiPane: true,
    visibleTabIds: visibleTabs,
    multiPaneColumns,
    multiPaneRows
  };
}

function SessionContextStrip({
  contextLabel,
  terminalCount,
  onStartLocalSession,
  onTogglePreview,
  previewOpen
}: {
  contextLabel: string | null;
  terminalCount: number;
  previewOpen: boolean;
  onStartLocalSession: () => void;
  onTogglePreview: () => void;
}) {
  return (
    <div className="session-context-strip">
      <div className="session-context-strip__copy">
        <strong>{contextLabel ?? "Session canvas"}</strong>
        <span>{terminalCount} active terminal{terminalCount === 1 ? "" : "s"}</span>
      </div>

      <div className="session-context-strip__actions">
        <button
          aria-label="Open local terminal"
          className="session-strip-icon session-strip-icon--active"
          onClick={onStartLocalSession}
          type="button"
        >
          <TerminalWindow size={14} />
        </button>
        <button
          aria-label="Toggle preview"
          aria-pressed={previewOpen}
          className={`session-strip-icon ${previewOpen ? "session-strip-icon--active" : ""}`}
          onClick={onTogglePreview}
          type="button"
        >
          <MonitorPlay size={14} />
        </button>
      </div>
    </div>
  );
}

function SessionPane({ children }: { children: ReactNode }) {
  return (
    <section className="session-pane-shell">
      <div className="session-pane-shell__body">{children}</div>
    </section>
  );
}

function SessionStarterBar({
  starterServers,
  recentPresets,
  onStartLocalSession,
  onOpenSessionLauncher,
  onOpenPresetEditor,
  onLaunchLocalPreset
}: {
  starterServers: ServerRecord[];
  recentPresets: LocalSessionPreset[];
  onStartLocalSession: () => void;
  onOpenSessionLauncher: () => void;
  onOpenPresetEditor: () => void;
  onLaunchLocalPreset: (presetId: string) => void;
}) {
  return (
    <div className="session-starter-bar">
      <div className="session-starter-bar__watermark" />
      <div className="session-starter-bar__controls">
        <button className="session-starter-action session-starter-action--primary" onClick={onStartLocalSession} type="button">
          <TerminalWindow size={13} />
          <span>New terminal</span>
        </button>
        <button className="session-starter-action" onClick={onOpenSessionLauncher} type="button">
          <MonitorPlay size={13} />
          <span>Host</span>
        </button>
        <button className="session-starter-action" onClick={onOpenPresetEditor} type="button">
          <FolderSimple size={13} />
          <span>Path</span>
        </button>
        {starterServers[0] ? (
          <button className="session-starter-chip" onClick={onOpenSessionLauncher} type="button">
            {serverDisplayLabel(starterServers[0])}
          </button>
        ) : null}
        {recentPresets[0] ? (
          <button className="session-starter-chip" onClick={() => onLaunchLocalPreset(recentPresets[0].id)} type="button">
            {recentPresets[0].name}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SessionProjectPicker({
  projects,
  recentPresets,
  onStartLocalSession,
  onOpenSessionLauncher,
  onOpenPresetEditor,
  onLaunchLocalPreset,
  onSelectProject
}: {
  projects: ProjectRecord[];
  recentPresets: LocalSessionPreset[];
  onStartLocalSession: () => void;
  onOpenSessionLauncher: () => void;
  onOpenPresetEditor: () => void;
  onLaunchLocalPreset: (presetId: string) => void;
  onSelectProject: (projectId: string) => void;
}) {
  return (
    <div className="session-project-picker">
      <div className="session-project-picker__card">
        <div className="session-project-picker__lead">
          <strong>Choose a project surface</strong>
          <span>Start from a workspace or local folder, then branch sessions hang off that context.</span>
        </div>

        <div className="session-project-picker__grid">
          {projects.map((project) => (
            <button
              className="session-project-picker__item"
              key={project.id}
              onClick={() => onSelectProject(project.id)}
              type="button"
            >
              <span className="session-project-picker__item-icon">
                <Stack size={15} />
              </span>
              <span className="session-project-picker__item-copy">
                <strong>{project.name}</strong>
                <span>{project.description || "Workspace context"}</span>
              </span>
            </button>
          ))}

          <button className="session-project-picker__item" onClick={onOpenPresetEditor} type="button">
            <span className="session-project-picker__item-icon">
              <FolderSimple size={15} />
            </span>
            <span className="session-project-picker__item-copy">
              <strong>Open folder</strong>
              <span>Attach a local project path</span>
            </span>
          </button>
        </div>

        <div className="session-project-picker__footer">
          <div className="session-starter-bar__controls">
            <button className="session-starter-action session-starter-action--primary" onClick={onStartLocalSession} type="button">
              <TerminalWindow size={13} />
              <span>Local</span>
            </button>
            <button className="session-starter-action" onClick={onOpenSessionLauncher} type="button">
              <MonitorPlay size={13} />
              <span>Host</span>
            </button>
            {recentPresets[0] ? (
              <button className="session-starter-chip" onClick={() => onLaunchLocalPreset(recentPresets[0].id)} type="button">
                {recentPresets[0].name}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function findProjectRepository(project: ProjectRecord, repositories: GitRepositoryView[]) {
  const projectName = normalizeKey(project.name);
  return (
    repositories.find((repository) => normalizeKey(repository.name) === projectName) ??
    repositories.find((repository) => normalizeKey(repository.path).includes(projectName)) ??
    null
  );
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function PreviewPanel({ activeServer }: { activeServer: ServerRecord | null }) {
  return (
    <aside className="preview-panel">
      <div className="preview-panel__header">
        <strong>Preview</strong>
        <span>{activeServer ? buildSshTarget(activeServer) : ""}</span>
      </div>
      <div className="preview-panel__surface" />
    </aside>
  );
}
