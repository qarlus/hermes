import type {
  GitHubAuthSession,
  GitHubDeviceFlowRecord,
  GitHubRepositoryRecord,
  KeychainItemRecord,
  ProjectRecord,
  ServerRecord,
  TerminalExitEvent,
  TerminalStatusEvent,
  TerminalTab,
  TmuxSessionRecord
} from "@hermes/core";
import { ArrowUpCircle, Laptop, Server } from "lucide-react";
import { HostDashboard } from "../features/dashboard/HostDashboard";
import { GitPage, type GitRepositoryView } from "../features/git/GitPage";
import { KeychainPage } from "../features/keychain/KeychainPage";
import { TerminalWorkspace } from "../features/tabs/TerminalWorkspace";
import { WorkspaceHome } from "../features/workspace/WorkspaceHome";
import type { ViewState } from "../lib/app";

type AppStageProps = {
  view: ViewState;
  workspaceMode: "home" | "terminal";
  stageClassName: string;
  activeTabId: string | null;
  tabs: TerminalTab[];
  workspaceTabs: TerminalTab[];
  selectedProject: ProjectRecord | null;
  selectedServer: ServerRecord | null;
  selectedServerId: string | null;
  filteredProjects: ProjectRecord[];
  favoriteServers: ServerRecord[];
  filteredKeychainItems: KeychainItemRecord[];
  filteredGitRepositories: GitRepositoryView[];
  projectServers: ServerRecord[];
  serverCountByProject: Record<string, number>;
  tmuxLoading: boolean;
  tmuxSessions: TmuxSessionRecord[];
  search: string;
  gitCommitMessage: string;
  gitBranchName: string;
  gitLoading: boolean;
  gitBusyAction: string | null;
  gitHubSession: GitHubAuthSession | null;
  gitHubDeviceFlow: GitHubDeviceFlowRecord | null;
  gitHubOwnedRepositories: GitHubRepositoryRecord[];
  gitHubPublicRepositories: GitHubRepositoryRecord[];
  gitHubSearchQuery: string;
  gitHubRepositoryPane: "owned" | "search";
  gitHubLoading: boolean;
  gitHubRepositoryLoading: boolean;
  gitHubSearchLoading: boolean;
  onCreateProject: () => void;
  onOpenProject: (projectId: string) => void;
  onCopyPublicKey: (id: string) => void;
  copyingPublicKeyId: string | null;
  onDeleteKeychainItem: (id: string) => void;
  onRenameKeychainItem: (item: KeychainItemRecord) => void;
  onSearchChange: (value: string) => void;
  onCancelGitHubSignIn: () => void;
  onStartGitHubSignIn: () => void;
  onDisconnectGitHub: () => void;
  onRefreshGitHubRepositories: () => void;
  onGitHubSearchQueryChange: (value: string) => void;
  onGitHubRepositoryPaneChange: (pane: "owned" | "search") => void;
  onCopyGitHubCloneUrl: (cloneUrl: string) => void;
  onAddGitRepository: () => void;
  onSelectGitRepository: (repositoryId: string) => void;
  onRemoveGitRepository: (repositoryId: string) => void;
  onRefreshGitRepositories: () => void;
  onOpenGitRepositoryShell: (repositoryId: string) => void;
  onCopyGitReviewDraft: (repositoryId: string) => void;
  onGitCommitMessageChange: (value: string) => void;
  onCommitGitRepository: (repositoryId: string) => void;
  onGitBranchNameChange: (value: string) => void;
  onCreateGitBranch: (repositoryId: string) => void;
  onCheckoutGitBranch: (repositoryId: string, branchName: string) => void;
  onPushGitRepository: (repositoryId: string) => void;
  selectedGitRepositoryId: string | null;
  onConnect: (serverId: string, tmuxSession?: string) => void;
  onCreateServer: () => void;
  onEditServer: (serverId: string) => void;
  onRefreshTmux: () => void;
  onSelectServer: (serverId: string) => void;
  onOpenTerminalSession: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onInput: (sessionId: string, data: string) => void;
  onNewTab?: () => void;
  onOpenSessionLauncher?: () => void;
  localSessionPresets: Array<{
    id: string;
    name: string;
    path: string;
  }>;
  onLaunchLocalPreset: (presetId: string) => void;
  onRemoveLocalPreset: (presetId: string) => void;
  onOpenPresetEditor?: () => void;
  onOpenToolUpdates?: () => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  onSelectTab: (tabId: string) => void;
  onStatus: (event: TerminalStatusEvent) => void;
  onExit: (event: TerminalExitEvent) => void;
  onStartLocalSession?: () => void;
};

export function AppStage({
  view,
  workspaceMode,
  stageClassName,
  activeTabId,
  tabs,
  workspaceTabs,
  selectedProject,
  selectedServer,
  selectedServerId,
  filteredProjects,
  favoriteServers,
  filteredKeychainItems,
  filteredGitRepositories,
  projectServers,
  serverCountByProject,
  tmuxLoading,
  tmuxSessions,
  search,
  gitCommitMessage,
  gitBranchName,
  gitLoading,
  gitBusyAction,
  gitHubSession,
  gitHubDeviceFlow,
  gitHubOwnedRepositories,
  gitHubPublicRepositories,
  gitHubSearchQuery,
  gitHubRepositoryPane,
  gitHubLoading,
  gitHubRepositoryLoading,
  gitHubSearchLoading,
  onCreateProject,
  onOpenProject,
  onCopyPublicKey,
  copyingPublicKeyId,
  onDeleteKeychainItem,
  onRenameKeychainItem,
  onSearchChange,
  onCancelGitHubSignIn,
  onStartGitHubSignIn,
  onDisconnectGitHub,
  onRefreshGitHubRepositories,
  onGitHubSearchQueryChange,
  onGitHubRepositoryPaneChange,
  onCopyGitHubCloneUrl,
  onAddGitRepository,
  onSelectGitRepository,
  onRemoveGitRepository,
  onRefreshGitRepositories,
  onOpenGitRepositoryShell,
  onCopyGitReviewDraft,
  onGitCommitMessageChange,
  onCommitGitRepository,
  onGitBranchNameChange,
  onCreateGitBranch,
  onCheckoutGitBranch,
  onPushGitRepository,
  selectedGitRepositoryId,
  onConnect,
  onCreateServer,
  onEditServer,
  onRefreshTmux,
  onSelectServer,
  onOpenTerminalSession,
  onCloseTab,
  onInput,
  onNewTab,
  onOpenSessionLauncher,
  localSessionPresets,
  onLaunchLocalPreset,
  onRemoveLocalPreset,
  onOpenPresetEditor,
  onOpenToolUpdates,
  onResize,
  onSelectTab,
  onStatus,
  onExit,
  onStartLocalSession
}: AppStageProps) {
  const sessionsEmptyState = (
    <div className="workspace__empty workspace__content">
      <p>No terminal open</p>
      <span>Start a shell on this device or open a saved server from any workspace.</span>
      <div className="workspace__empty-actions">
        <button className="primary-button" onClick={onStartLocalSession} type="button">
          <Laptop size={14} />
          Local device
        </button>
        <button className="ghost-button" onClick={onOpenSessionLauncher} type="button">
          <Server size={14} />
          Saved server
        </button>
        <button className="ghost-button" onClick={onOpenPresetEditor} type="button">
          Save path
        </button>
        <button className="ghost-button" onClick={onOpenToolUpdates} type="button">
          <ArrowUpCircle size={14} />
          Agent updates
        </button>
      </div>
      {localSessionPresets.length > 0 ? (
        <div className="workspace__empty-preset-list">
          {localSessionPresets.map((preset) => (
            <div className="session-preset-chip" key={preset.id}>
              <button
                className="session-preset-chip__launch"
                onClick={() => onLaunchLocalPreset(preset.id)}
                type="button"
              >
                {preset.name}
              </button>
              <button
                aria-label={`Remove ${preset.name}`}
                className="session-preset-chip__remove"
                onClick={() => onRemoveLocalPreset(preset.id)}
                type="button"
              >
                x
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className={stageClassName}>
      <TerminalWorkspace
        activeTabId={activeTabId}
        emptyTabsLabel={null}
        emptyState={
          view === "sessions" ? (
            sessionsEmptyState
          ) : view === "workspace" && selectedProject ? (
            <WorkspaceHome
              activeSessions={workspaceTabs}
              onConnect={onConnect}
              onCreateServer={onCreateServer}
              onEditServer={onEditServer}
              onOpenSession={onOpenTerminalSession}
              onRefreshTmux={onRefreshTmux}
              onSelectServer={onSelectServer}
              project={selectedProject}
              selectedServer={selectedServer}
              selectedServerId={selectedServerId}
              servers={projectServers}
              tmuxLoading={tmuxLoading}
              tmuxSessions={tmuxSessions}
            />
          ) : view === "keychain" ? (
            <KeychainPage
              copyingPublicKeyId={copyingPublicKeyId}
              onCopyPublicKey={onCopyPublicKey}
              items={filteredKeychainItems}
              onDelete={onDeleteKeychainItem}
              onRename={onRenameKeychainItem}
              onSearchChange={onSearchChange}
              search={search}
            />
          ) : view === "git" ? (
            <GitPage
              branchName={gitBranchName}
              busyAction={gitBusyAction}
              commitMessage={gitCommitMessage}
              gitHubDeviceFlow={gitHubDeviceFlow}
              gitHubLoading={gitHubLoading}
              gitHubOwnedRepositories={gitHubOwnedRepositories}
              gitHubPublicRepositories={gitHubPublicRepositories}
              gitHubRepositoryLoading={gitHubRepositoryLoading}
              gitHubRepositoryPane={gitHubRepositoryPane}
              gitHubSearchLoading={gitHubSearchLoading}
              gitHubSearchQuery={gitHubSearchQuery}
              gitHubSession={gitHubSession}
              loading={gitLoading}
              onAddRepository={onAddGitRepository}
              onBranchNameChange={onGitBranchNameChange}
              onCheckoutBranch={onCheckoutGitBranch}
              onCommitAll={onCommitGitRepository}
              onCommitMessageChange={onGitCommitMessageChange}
              onCancelGitHubSignIn={onCancelGitHubSignIn}
              onCopyGitHubCloneUrl={onCopyGitHubCloneUrl}
              onCopyReviewDraft={onCopyGitReviewDraft}
              onCreateBranch={onCreateGitBranch}
              onDisconnectGitHub={onDisconnectGitHub}
              onGitHubRepositoryPaneChange={onGitHubRepositoryPaneChange}
              onGitHubSearchQueryChange={onGitHubSearchQueryChange}
              onOpenRepositoryShell={onOpenGitRepositoryShell}
              onPublish={onPushGitRepository}
              onRefreshGitHubRepositories={onRefreshGitHubRepositories}
              onRefreshRepositories={onRefreshGitRepositories}
              onRemoveRepository={onRemoveGitRepository}
              onSearchChange={onSearchChange}
              onSelectRepository={onSelectGitRepository}
              onStartGitHubSignIn={onStartGitHubSignIn}
              repositories={filteredGitRepositories}
              search={search}
              selectedRepositoryId={selectedGitRepositoryId}
            />
          ) : (
            <HostDashboard
              favoriteServers={favoriteServers}
              onConnect={onConnect}
              onCreateProject={onCreateProject}
              onOpenProject={onOpenProject}
              projects={filteredProjects}
              serverCountByProject={serverCountByProject}
            />
          )
        }
        onCloseTab={onCloseTab}
        onExit={onExit}
        onInput={onInput}
        onNewTab={onNewTab}
        onResize={onResize}
        onSelectTab={onSelectTab}
        onStatus={onStatus}
        tabs={tabs}
        visible={view === "sessions" || (view === "workspace" && workspaceMode === "terminal")}
      />
    </div>
  );
}
