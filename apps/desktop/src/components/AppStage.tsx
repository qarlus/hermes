import type {
  KeychainItemRecord,
  ProjectRecord,
  ServerRecord,
  TerminalExitEvent,
  TerminalStatusEvent,
  TerminalTab,
  TmuxSessionRecord
} from "@hermes/core";
import { HostDashboard } from "../features/dashboard/HostDashboard";
import { KeychainPage } from "../features/keychain/KeychainPage";
import { TerminalWorkspace } from "../features/tabs/TerminalWorkspace";
import { WorkspaceHome } from "../features/workspace/WorkspaceHome";
import type { ViewState } from "../lib/app";

type AppStageProps = {
  view: ViewState;
  stageClassName: string;
  activeTabId: string | null;
  tabs: TerminalTab[];
  selectedProject: ProjectRecord | null;
  selectedServer: ServerRecord | null;
  selectedServerId: string | null;
  filteredProjects: ProjectRecord[];
  filteredKeychainItems: KeychainItemRecord[];
  projectServers: ServerRecord[];
  serverCountByProject: Record<string, number>;
  tmuxLoading: boolean;
  tmuxSessions: TmuxSessionRecord[];
  search: string;
  onCreateProject: () => void;
  onOpenProject: (projectId: string) => void;
  onDeleteKeychainItem: (id: string) => void;
  onRenameKeychainItem: (item: KeychainItemRecord) => void;
  onSearchChange: (value: string) => void;
  onConnect: (serverId: string, tmuxSession?: string) => void;
  onCreateServer: () => void;
  onEditServer: (serverId: string) => void;
  onRefreshTmux: () => void;
  onSelectServer: (serverId: string) => void;
  onCloseTab: (tabId: string) => void;
  onInput: (sessionId: string, data: string) => void;
  onNewTab?: () => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  onSelectTab: (tabId: string) => void;
  onStatus: (event: TerminalStatusEvent) => void;
  onExit: (event: TerminalExitEvent) => void;
};

export function AppStage({
  view,
  stageClassName,
  activeTabId,
  tabs,
  selectedProject,
  selectedServer,
  selectedServerId,
  filteredProjects,
  filteredKeychainItems,
  projectServers,
  serverCountByProject,
  tmuxLoading,
  tmuxSessions,
  search,
  onCreateProject,
  onOpenProject,
  onDeleteKeychainItem,
  onRenameKeychainItem,
  onSearchChange,
  onConnect,
  onCreateServer,
  onEditServer,
  onRefreshTmux,
  onSelectServer,
  onCloseTab,
  onInput,
  onNewTab,
  onResize,
  onSelectTab,
  onStatus,
  onExit
}: AppStageProps) {
  return (
    <div className={stageClassName}>
      <TerminalWorkspace
        activeTabId={activeTabId}
        emptyTabsLabel={null}
        emptyState={
          view === "workspace" && selectedProject ? (
            <WorkspaceHome
              onConnect={onConnect}
              onCreateServer={onCreateServer}
              onEditServer={onEditServer}
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
              items={filteredKeychainItems}
              onDelete={onDeleteKeychainItem}
              onRename={onRenameKeychainItem}
              onSearchChange={onSearchChange}
              search={search}
            />
          ) : (
            <HostDashboard
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
        visible={view === "workspace"}
      />
    </div>
  );
}
