import { Plus } from "lucide-react";
import { buildSshTarget, type ProjectRecord, type ServerRecord, type TmuxSessionRecord } from "@hermes/core";
import { ServerList } from "../servers/ServerList";
import { TmuxSessionList } from "../tmux/TmuxSessionList";

interface WorkspaceHomeProps {
  project: ProjectRecord;
  servers: ServerRecord[];
  selectedServerId: string | null;
  selectedServer: ServerRecord | null;
  tmuxSessions: TmuxSessionRecord[];
  tmuxLoading: boolean;
  onSelectServer: (serverId: string) => void;
  onConnect: (serverId: string, tmuxSession?: string) => void;
  onEditServer: (serverId: string) => void;
  onRefreshTmux: () => void;
  onCreateServer: () => void;
}

export function WorkspaceHome({
  project,
  servers,
  selectedServerId,
  selectedServer,
  tmuxSessions,
  tmuxLoading,
  onSelectServer,
  onConnect,
  onEditServer,
  onRefreshTmux,
  onCreateServer
}: WorkspaceHomeProps) {
  return (
    <div className="workspace-home">
      <section className="workspace-home__panel workspace-home__panel--servers">
        <div className="workspace-home__panel-header">
          <div>
            <p className="eyebrow">Servers</p>
            <h2>{servers.length} configured</h2>
            <span>
              {project.description || "Accounts and SSH targets inside this workspace."}
            </span>
          </div>
          <button className="ghost-button" onClick={onCreateServer} type="button">
            <Plus size={14} />
            Server
          </button>
        </div>

        <div className="workspace-home__panel-body">
          <ServerList
            onCreate={onCreateServer}
            servers={servers}
            onConnect={(serverId) => onConnect(serverId)}
            onEdit={onEditServer}
            onSelect={onSelectServer}
            selectedServerId={selectedServerId}
          />
        </div>
      </section>

      <section className="workspace-home__panel workspace-home__panel--sessions">
        <div className="workspace-home__panel-header">
          <div>
            <p className="eyebrow">Tmux Sessions</p>
            <h3>{selectedServer ? selectedServer.name || selectedServer.hostname : "No server selected"}</h3>
            <span>
              {selectedServer
                ? `${buildSshTarget(selectedServer)} / port ${selectedServer.port}`
                : "Choose a server to inspect tmux sessions and reconnect."}
            </span>
          </div>
        </div>

        <div className="workspace-home__panel-body workspace-home__panel-body--detail">
          {selectedServer ? (
            <TmuxSessionList
              embedded
              loading={tmuxLoading}
              onConnect={(sessionName) => onConnect(selectedServer.id, sessionName)}
              onRefresh={onRefreshTmux}
              sessions={tmuxSessions}
            />
          ) : (
            <div className="tmux-panel__empty">
              <p>No server selected</p>
              <span>Select a server on the left to inspect and rejoin active tmux sessions.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
