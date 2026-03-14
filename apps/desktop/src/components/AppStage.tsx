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
import HostDashboard from "../features/dashboard/HostDashboard";
import { FileBrowserPage } from "../features/files/FileBrowserPage";
import { GitPage, type GitRepositoryView, type GitToolbarContext } from "../features/git/GitPage";
import { KeychainPage } from "../features/keychain/KeychainPage";
import { ProjectsWorkspace } from "../features/projects/ProjectsWorkspace";
import { SettingsPage } from "../features/settings/SettingsPage";
import { SessionsWorkspace } from "../features/sessions/SessionsWorkspace";
import { TerminalWorkspace } from "../features/tabs/TerminalWorkspace";
import type { ViewState } from "../lib/app";
import type {
  DevicePlatform,
  HermesSettings,
  HermesThemeDefinition,
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
  sessionsSelectedProjectId: string | null;
  sessionsSelectedBranchName: string | null;
  sessionsPreviewOpen: boolean;
  sessionsGitPanelOpen: boolean;
  sessionsTabs: TerminalTab[];
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
  devicePlatform: DevicePlatform;
  activeTheme: HermesThemeDefinition;
  terminalProfiles: TerminalLaunchProfile[];
  localLauncherSummary: string;
  syncedKeyCount: number;
  tmuxMetadataCount: number;
  sessionHistoryCount: number;
  syncBusyAction: "export" | "import" | null;
  relayConnected: boolean;
  onCreateProject: () => void;
  onEditProject: () => void;
  onOpenProject: (projectId: string) => void;
  onCopyPublicKey: (id: string) => void;
  copyingPublicKeyId: string | null;
  onCreateCredential: () => void;
  onCreateLocalSshKey: () => void;
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
  onSelectSessionsProject: (projectId: string) => void;
  onSelectSessionsBranch: (branchName: string) => void;
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
  onSyncIncludesSettingsChange: (value: boolean) => void;
  onSyncIncludesSecretsChange: (value: boolean) => void;
  onSyncIncludesTmuxMetadataChange: (value: boolean) => void;
  onSyncIncludesHistoryChange: (value: boolean) => void;
  onSyncIncludesCommandsChange: (value: boolean) => void;
  onSyncIncludesPinnedRepositoriesChange: (value: boolean) => void;
  onExportSyncBundle: () => void;
  onImportSyncBundle: (file: File) => void;
  onNotify: (message: string, tone: "success" | "info" | "error") => void;
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
  sessionsSelectedProjectId,
  sessionsSelectedBranchName,
  sessionsPreviewOpen,
  sessionsGitPanelOpen,
  sessionsTabs,
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
  devicePlatform,
  activeTheme,
  terminalProfiles,
  localLauncherSummary,
  syncedKeyCount,
  tmuxMetadataCount,
  sessionHistoryCount,
  syncBusyAction,
  relayConnected,
  onCreateProject,
  onEditProject,
  onOpenProject,
  onCopyPublicKey,
  copyingPublicKeyId,
  onCreateCredential,
  onCreateLocalSshKey,
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
  onSelectSessionsProject,
  onSelectSessionsBranch,
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
  onSyncIncludesSettingsChange,
  onSyncIncludesSecretsChange,
  onSyncIncludesTmuxMetadataChange,
  onSyncIncludesHistoryChange,
  onSyncIncludesCommandsChange,
  onSyncIncludesPinnedRepositoriesChange,
  onExportSyncBundle,
  onImportSyncBundle,
  onNotify
}: AppStageProps) {
  if (view === "sessions") {
    return (
      <div className={`${stageClassName} stage--sessions`}>
        <SessionsWorkspace
          activeTabId={activeTabId}
          activeTerminalLabel={activeTerminalLabel}
          favoriteServers={favoriteServers}
          gitRepositories={gitRepositories}
          localSessionPresets={localSessionPresets}
          onCloseTab={onCloseTab}
          onCreateTerminalCommand={onCreateTerminalCommand}
          onDeleteTerminalCommand={onDeleteTerminalCommand}
          onExit={onExit}
          onInput={onInput}
          onLaunchLocalPreset={onLaunchLocalPreset}
          onOpenPresetEditor={onOpenPresetEditor ?? (() => undefined)}
          onOpenSessionLauncher={onOpenSessionLauncher ?? (() => undefined)}
          onResize={onResize}
          onRunTerminalCommand={onRunTerminalCommand}
          onSelectProject={onSelectSessionsProject}
          onSelectTab={onSelectTab}
          onStartLocalSession={onStartLocalSession ?? (() => undefined)}
          onStatus={onStatus}
          projects={filteredProjects}
          selectedBranchName={sessionsSelectedBranchName}
          previewOpen={sessionsPreviewOpen}
          gitPanelOpen={sessionsGitPanelOpen}
          selectedProjectId={sessionsSelectedProjectId}
          servers={servers}
          tabs={sessionsTabs}
          terminalCommands={terminalCommands}
          terminalFontSize={settings.terminalFontSize}
          terminalTheme={activeTheme.terminal}
        />
      </div>
    );
  }

  if (view === "workspace") {
    return (
      <div className={`${stageClassName} stage--sessions`}>
        <ProjectsWorkspace
          onCreateProject={onCreateProject}
          onEditProject={onEditProject}
          onSelectProject={onOpenProject}
          projects={filteredProjects}
          selectedProjectId={selectedProject?.id ?? null}
          servers={servers}
        />
      </div>
    );
  }

  return (
    <div className={stageClassName}>
      <TerminalWorkspace
        activeTabId={activeTabId}
        emptyTabsLabel={null}
        emptyState={
          view === "keychain" ? (
            <KeychainPage
              gitHubSession={gitHubSession}
              copyingPublicKeyId={copyingPublicKeyId}
              onCopyPublicKey={onCopyPublicKey}
              onCreateCredential={onCreateCredential}
              onCreateLocalSshKey={onCreateLocalSshKey}
              items={filteredKeychainItems}
              onDelete={onDeleteKeychainItem}
              onRename={onRenameKeychainItem}
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
            <FileBrowserPage onNotify={onNotify} servers={servers} />
          ) : view === "settings" ? (
            <SettingsPage
              activeTheme={activeTheme}
              commandCount={terminalCommands.length}
              launcherSummary={localLauncherSummary}
              localPresetCount={localSessionPresets.length}
              sessionHistoryCount={sessionHistoryCount}
              onCustomTerminalArgsChange={onCustomTerminalArgsChange}
              onCustomTerminalLabelChange={onCustomTerminalLabelChange}
              onCustomTerminalProgramChange={onCustomTerminalProgramChange}
              onExportBundle={onExportSyncBundle}
              onImportBundle={onImportSyncBundle}
              onSyncIncludesHistoryChange={onSyncIncludesHistoryChange}
              onSyncIncludesSecretsChange={onSyncIncludesSecretsChange}
              onSyncIncludesSettingsChange={onSyncIncludesSettingsChange}
              onSyncIncludesCommandsChange={onSyncIncludesCommandsChange}
              onSyncIncludesPinnedRepositoriesChange={onSyncIncludesPinnedRepositoriesChange}
              onSyncIncludesTmuxMetadataChange={onSyncIncludesTmuxMetadataChange}
              onTerminalFontSizeChange={onTerminalFontSizeChange}
              onTerminalProfileChange={onTerminalProfileChange}
              onThemeChange={onThemeChange}
              pinnedRepositoryCount={gitRepositories.length}
              platform={devicePlatform}
              serverCount={servers.length}
              settings={settings}
              syncedKeyCount={syncedKeyCount}
              syncBusyAction={syncBusyAction}
              terminalProfiles={terminalProfiles}
              tmuxMetadataCount={tmuxMetadataCount}
              workspaceCount={projectCount}
            />
          ) : (
            <HostDashboard
              favoriteServers={favoriteServers}
              onConnect={onConnect}
              onCreateProject={onCreateProject}
              onCreateServer={onCreateServer}
              onOpenTerminalSession={onOpenTerminalSession}
              onOpenLocalShell={onNewTab ?? (() => {})}
              onOpenProject={onOpenProject}
              projects={filteredProjects}
              relayConnected={relayConnected}
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
        onResize={onResize}
        onSelectTab={onSelectTab}
        onStatus={onStatus}
        terminalTheme={activeTheme.terminal}
        terminalFontSize={settings.terminalFontSize}
        tabs={tabs}
        visible={false}
      />
    </div>
  );
}
