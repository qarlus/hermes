import { Play, Plus, TerminalSquare } from "lucide-react";
import {
  buildSshTarget,
  serverDisplayLabel,
  type ProjectRecord,
  type ServerRecord,
  type TerminalTab,
  type TmuxSessionRecord
} from "@hermes/core";
import { ServerList } from "../servers/ServerList";
import { TmuxSessionList } from "../tmux/TmuxSessionList";

interface WorkspaceHomeProps {
  project: ProjectRecord;
  servers: ServerRecord[];
  activeSessions: TerminalTab[];
  selectedServerId: string | null;
  selectedServer: ServerRecord | null;
  tmuxSessions: TmuxSessionRecord[];
  tmuxLoading: boolean;
  onSelectServer: (serverId: string) => void;
  onConnect: (serverId: string, tmuxSession?: string) => void;
  onEditServer: (serverId: string) => void;
  onOpenSession: (tabId: string) => void;
  onRefreshTmux: () => void;
  onCreateServer: () => void;
  onOpenRelaySetup?: (serverId: string) => void;
}

export function WorkspaceHome({
  project,
  servers,
  activeSessions,
  selectedServerId,
  selectedServer,
  tmuxSessions,
  tmuxLoading,
  onSelectServer,
  onConnect,
  onEditServer,
  onOpenSession,
  onRefreshTmux,
  onCreateServer,
  onOpenRelaySetup
}: WorkspaceHomeProps) {
  return (
    <div className="workspace-home">
      <div className="workspace-home__board">
        <section className="workspace-home__section">
          <div className="workspace-home__header">
            <div>
              <p className="eyebrow">Servers</p>
              <h2>Workspace servers</h2>
              <span>{project.description || "Accounts and SSH targets inside this workspace."}</span>
            </div>
            <div className="workspace-home__header-actions">
              <span className="workspace-home__meta">
                {servers.length} server{servers.length === 1 ? "" : "s"}
              </span>
              <button className="ghost-button" onClick={onCreateServer} type="button">
                <Plus size={14} />
                Server
              </button>
            </div>
          </div>

          <ServerList
            onCreate={onCreateServer}
            servers={servers}
            onConnect={(serverId) => onConnect(serverId)}
            onEdit={onEditServer}
            onOpenRelaySetup={onOpenRelaySetup}
            onSelect={onSelectServer}
            selectedServerId={selectedServerId}
          />
        </section>

        <section className="workspace-home__section">
          <div className="workspace-home__header">
            <div>
              <p className="eyebrow">Sessions</p>
              <h2>{selectedServer ? selectedServer.name || selectedServer.hostname : "Tmux sessions"}</h2>
              <span>
                {selectedServer
                  ? `${buildSshTarget(selectedServer)} / port ${selectedServer.port}`
                  : "Choose a server to inspect tmux sessions and reconnect."}
              </span>
            </div>
            <span className="workspace-home__meta">
              {activeSessions.length} live / {selectedServer ? tmuxSessions.length : 0} tmux
            </span>
          </div>

          <div className="workspace-home__sessions">
            <div className="workspace-home__session-group">
              <div className="workspace-home__session-header">
                <p className="eyebrow">Active</p>
              </div>
              {activeSessions.length === 0 ? (
                <div className="workspace-home__empty-state">
                  <span className="workspace-home__empty-icon">
                    <TerminalSquare size={16} />
                  </span>
                  <div className="workspace-home__empty-body">
                    <strong>Session surface is clear</strong>
                    <span>Open a server above to start a terminal. Live connections will land here.</span>
                  </div>
                </div>
              ) : (
                <div className="workspace-home__session-list">
                  {activeSessions.map((session) => {
                    const server = servers.find((candidate) => candidate.id === session.serverId);

                    return (
                      <button
                        className="workspace-home__session-row"
                        key={session.id}
                        onClick={() => onOpenSession(session.id)}
                        type="button"
                      >
                        <div className="workspace-home__session-main">
                          <span className={`status-dot status-dot--${session.status}`} />
                          <div className="workspace-home__session-body">
                            <strong>{session.title}</strong>
                            <span>
                              {server
                                ? `${serverDisplayLabel(server)} / ${buildSshTarget(server)}`
                                : "Saved terminal session"}
                            </span>
                          </div>
                        </div>
                        <span className="workspace-home__session-action">
                          Open
                          <Play size={12} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="workspace-home__session-group">
              <div className="workspace-home__session-header">
                <p className="eyebrow">Remote Tmux</p>
              </div>
            {selectedServer ? (
              <TmuxSessionList
                embedded
                loading={tmuxLoading}
                onConnect={(sessionName) => onConnect(selectedServer.id, sessionName)}
                onRefresh={onRefreshTmux}
                sessions={tmuxSessions}
              />
            ) : (
              <div className="workspace-home__empty-state">
                <span className="workspace-home__empty-icon">
                  <TerminalSquare size={16} />
                </span>
                <div className="workspace-home__empty-body">
                  <strong>Remote tmux is standing by</strong>
                  <span>Select a server above to inspect and rejoin its active tmux sessions.</span>
                </div>
              </div>
            )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
