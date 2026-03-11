import type {
  GitHubAuthSession,
  GitHubDeviceFlowRecord,
  GitHubRepositoryRecord,
  GitRepositoryRecord,
  KeychainItemRecord,
  ProjectRecord,
  ServerRecord,
  TerminalCommandRecord,
  TerminalExitEvent,
  TerminalStatusEvent,
  TerminalTab,
  TmuxSessionRecord
} from "@hermes/core";
import { ArrowUpCircle, Laptop, Server } from "lucide-react";
import { HostDashboard } from "../features/dashboard/HostDashboard";
import { FileBrowserPage } from "../features/files/FileBrowserPage";
import { GitPage, type GitRepositoryView, type GitToolbarContext } from "../features/git/GitPage";
import { KeychainPage } from "../features/keychain/KeychainPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { SessionCommandRail } from "../features/sessions/SessionCommandRail";
import { TerminalWorkspace } from "../features/tabs/TerminalWorkspace";
import { WorkspaceHome } from "../features/workspace/WorkspaceHome";
import type { ViewState } from "../lib/app";
import type {
  DevicePlatform,
  HermesSettings,
  HermesThemeDefinition,
  RelayClientState,
  TerminalLaunchProfile,
  TerminalLaunchProfileId,
  HermesThemeId
} from "../lib/settings";

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
  projectCount: number;
  favoriteServers: ServerRecord[];
  servers: ServerRecord[];
  filteredKeychainItems: KeychainItemRecord[];
  gitRepositories: GitRepositoryView[];
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
  gitHubDeviceFlowAvailable: boolean;
  gitHubOwnedRepositories: GitHubRepositoryRecord[];
  gitHubPublicRepositories: GitHubRepositoryRecord[];
  gitHubSearchQuery: string;
  gitHubRepositoryPane: "personal" | "orgs" | "search";
  gitHubSetupRequest: number;
  gitHubLoading: boolean;
  gitHubRepositoryLoading: boolean;
  gitHubSearchLoading: boolean;
  settings: HermesSettings;
  relayState: RelayClientState;
  devicePlatform: DevicePlatform;
  activeTheme: HermesThemeDefinition;
  terminalProfiles: TerminalLaunchProfile[];
  localLauncherSummary: string;
  syncBusyAction: "export" | "import" | null;
  relayBusyAction: "refresh" | "revoke" | "health" | "inspect" | null;
  onCreateProject: () => void;
  onOpenProject: (projectId: string) => void;
  onCopyPublicKey: (id: string) => void;
  copyingPublicKeyId: string | null;
  onDeleteKeychainItem: (id: string) => void;
  onRenameKeychainItem: (item: KeychainItemRecord) => void;
  onSearchChange: (value: string) => void;
  onGitToolbarContextChange: (context: GitToolbarContext) => void;
  onCancelGitHubSignIn: () => void;
  onStartGitHubSignIn: () => void;
  onDisconnectGitHub: () => void;
  onSignInGitHubWithToken: (token: string) => void;
  onCloneGitHubRepository: (repository: GitHubRepositoryRecord) => void;
  onPinRepositorySnapshot: (snapshot: GitRepositoryRecord) => void;
  onRefreshGitHubRepositories: () => void;
  onGitHubSearchQueryChange: (value: string) => void;
  onGitHubRepositoryPaneChange: (pane: "personal" | "orgs" | "search") => void;
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
  onOpenRelaySetupFromServer?: (serverId: string) => void;
  onRefreshTmux: () => void;
  onSelectServer: (serverId: string) => void;
  onOpenTerminalSession: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onInput: (sessionId: string, data: string) => void;
  terminalCommands: TerminalCommandRecord[];
  activeTerminalLabel: string | null;
  onCreateTerminalCommand: (input: { name: string; command: string }) => void;
  onDeleteTerminalCommand: (id: string) => void;
  onRunTerminalCommand: (command: string) => void;
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
  onThemeChange: (themeId: HermesThemeId) => void;
  onTerminalFontSizeChange: (value: number) => void;
  onTerminalProfileChange: (profileId: TerminalLaunchProfileId) => void;
  onCustomTerminalProgramChange: (value: string) => void;
  onCustomTerminalArgsChange: (value: string) => void;
  onCustomTerminalLabelChange: (value: string) => void;
  onSyncIncludesCommandsChange: (value: boolean) => void;
  onSyncIncludesPinnedRepositoriesChange: (value: boolean) => void;
  onExportSyncBundle: () => void;
  onImportSyncBundle: (file: File) => void;
  onOpenRelaySetup: () => void;
  onRefreshRelayWorkspace: () => void;
  onRevokeRelayDevice: (deviceId: string) => void;
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
  projectCount,
  favoriteServers,
  servers,
  filteredKeychainItems,
  gitRepositories,
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
  gitHubDeviceFlowAvailable,
  gitHubOwnedRepositories,
  gitHubPublicRepositories,
  gitHubSearchQuery,
  gitHubRepositoryPane,
  gitHubSetupRequest,
  gitHubLoading,
  gitHubRepositoryLoading,
  gitHubSearchLoading,
  settings,
  relayState,
  devicePlatform,
  activeTheme,
  terminalProfiles,
  localLauncherSummary,
  syncBusyAction,
  relayBusyAction,
  onCreateProject,
  onOpenProject,
  onCopyPublicKey,
  copyingPublicKeyId,
  onDeleteKeychainItem,
  onRenameKeychainItem,
  onSearchChange,
  onGitToolbarContextChange,
  onCancelGitHubSignIn,
  onStartGitHubSignIn,
  onDisconnectGitHub,
  onSignInGitHubWithToken,
  onCloneGitHubRepository,
  onPinRepositorySnapshot,
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
  onOpenRelaySetupFromServer,
  onRefreshTmux,
  onSelectServer,
  onOpenTerminalSession,
  onCloseTab,
  onInput,
  terminalCommands,
  activeTerminalLabel,
  onCreateTerminalCommand,
  onDeleteTerminalCommand,
  onRunTerminalCommand,
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
  onStartLocalSession,
  onThemeChange,
  onTerminalFontSizeChange,
  onTerminalProfileChange,
  onCustomTerminalProgramChange,
  onCustomTerminalArgsChange,
  onCustomTerminalLabelChange,
  onSyncIncludesCommandsChange,
  onSyncIncludesPinnedRepositoriesChange,
  onExportSyncBundle,
  onImportSyncBundle,
  onOpenRelaySetup,
  onRefreshRelayWorkspace,
  onRevokeRelayDevice
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
              onOpenRelaySetup={onOpenRelaySetupFromServer}
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
              gitHubDeviceFlowAvailable={gitHubDeviceFlowAvailable}
              gitHubLoading={gitHubLoading}
              gitHubOwnedRepositories={gitHubOwnedRepositories}
              gitHubPublicRepositories={gitHubPublicRepositories}
              gitHubRepositoryLoading={gitHubRepositoryLoading}
              gitHubRepositoryPane={gitHubRepositoryPane}
              gitHubSearchLoading={gitHubSearchLoading}
              gitHubSearchQuery={gitHubSearchQuery}
              openGitHubSetupRequest={gitHubSetupRequest}
              gitHubSession={gitHubSession}
              loading={gitLoading}
              localSessionPresets={localSessionPresets}
              onToolbarContextChange={onGitToolbarContextChange}
              onCloneRepository={onCloneGitHubRepository}
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
              onSignInGitHubWithToken={onSignInGitHubWithToken}
              onGitHubRepositoryPaneChange={onGitHubRepositoryPaneChange}
              onGitHubSearchQueryChange={onGitHubSearchQueryChange}
              onOpenRepositoryShell={onOpenGitRepositoryShell}
              onOpenTerminalSession={onOpenTerminalSession}
              onPinRepositorySnapshot={onPinRepositorySnapshot}
              onPublish={onPushGitRepository}
              onRefreshGitHubRepositories={onRefreshGitHubRepositories}
              onRefreshRepositories={onRefreshGitRepositories}
              onRemoveRepository={onRemoveGitRepository}
              onSearchChange={onSearchChange}
              onSelectRepository={onSelectGitRepository}
              onStartGitHubSignIn={onStartGitHubSignIn}
              onLaunchLocalPreset={onLaunchLocalPreset}
              repositories={gitRepositories}
              search={search}
              selectedRepositoryId={selectedGitRepositoryId}
              tabs={tabs}
            />
          ) : view === "files" ? (
            <FileBrowserPage servers={servers} />
          ) : view === "settings" ? (
            <SettingsPage
              activeTheme={activeTheme}
              commandCount={terminalCommands.length}
              launcherSummary={localLauncherSummary}
              localPresetCount={localSessionPresets.length}
              onCustomTerminalArgsChange={onCustomTerminalArgsChange}
              onCustomTerminalLabelChange={onCustomTerminalLabelChange}
              onCustomTerminalProgramChange={onCustomTerminalProgramChange}
              onExportBundle={onExportSyncBundle}
              onImportBundle={onImportSyncBundle}
              onOpenRelaySetup={onOpenRelaySetup}
              onRefreshRelayWorkspace={onRefreshRelayWorkspace}
              onRevokeRelayDevice={onRevokeRelayDevice}
              onSyncIncludesCommandsChange={onSyncIncludesCommandsChange}
              onSyncIncludesPinnedRepositoriesChange={onSyncIncludesPinnedRepositoriesChange}
              onTerminalFontSizeChange={onTerminalFontSizeChange}
              onTerminalProfileChange={onTerminalProfileChange}
              onThemeChange={onThemeChange}
              pinnedRepositoryCount={gitRepositories.length}
              platform={devicePlatform}
              relayBusyAction={relayBusyAction}
              relayState={relayState}
              serverCount={servers.length}
              servers={servers}
              settings={settings}
              syncBusyAction={syncBusyAction}
              terminalProfiles={terminalProfiles}
              workspaceCount={projectCount}
            />
          ) : (
            <HostDashboard
              favoriteServers={favoriteServers}
              onConnect={onConnect}
              onCreateProject={onCreateProject}
              onOpenTerminalSession={onOpenTerminalSession}
              onOpenProject={onOpenProject}
              projects={filteredProjects}
              servers={servers}
              serverCountByProject={serverCountByProject}
              tabs={tabs}
            />
          )
        }
        onCloseTab={onCloseTab}
        onExit={onExit}
        onInput={onInput}
        onNewTab={onNewTab}
        rightRail={
          view === "sessions" ? (
            <SessionCommandRail
              activeTerminalLabel={activeTerminalLabel}
              canRunCommands={Boolean(activeTabId && tabs.some((tab) => tab.id === activeTabId && tab.status !== "closed" && tab.status !== "error"))}
              commands={terminalCommands}
              onCreateCommand={onCreateTerminalCommand}
              onDeleteCommand={onDeleteTerminalCommand}
              onRunCommand={onRunTerminalCommand}
            />
          ) : null
        }
        onResize={onResize}
        onSelectTab={onSelectTab}
        onStatus={onStatus}
        terminalTheme={activeTheme.terminal}
        terminalFontSize={settings.terminalFontSize}
        tabs={tabs}
        visible={view === "sessions" || (view === "workspace" && workspaceMode === "terminal")}
      />
    </div>
  );
}
