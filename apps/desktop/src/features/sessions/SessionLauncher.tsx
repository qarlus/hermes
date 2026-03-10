import { FolderKanban, Laptop, Server, X } from "lucide-react";
import {
  buildSshTarget,
  projectDisplayLabel,
  serverDisplayLabel,
  type ProjectRecord,
  type ServerRecord
} from "@hermes/core";

interface SessionLauncherProps {
  projects: ProjectRecord[];
  servers: ServerRecord[];
  onClose: () => void;
  onConnectLocal: () => void;
  onConnectServer: (serverId: string) => void;
}

export function SessionLauncher({
  projects,
  servers,
  onClose,
  onConnectLocal,
  onConnectServer
}: SessionLauncherProps) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section
        aria-label="Start session"
        className="modal-card modal-card--session-launcher"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-card__header">
          <div>
            <p className="eyebrow">Sessions</p>
            <h2>Start terminal</h2>
          </div>
          <button
            aria-label="Close session launcher"
            className="ghost-button ghost-button--icon"
            onClick={onClose}
            type="button"
          >
            <X size={14} />
          </button>
        </div>

        <div className="modal-card__body session-launcher">
          <section className="session-launcher__section">
            <div className="session-launcher__header">
              <p className="eyebrow">Local</p>
              <span>Open a shell on this device.</span>
            </div>

            <button className="session-launcher__action" onClick={onConnectLocal} type="button">
              <span className="session-launcher__icon">
                <Laptop size={14} />
              </span>
              <div className="session-launcher__body">
                <strong>Local device</strong>
                <span>Start a terminal on the machine running Hermes.</span>
              </div>
            </button>
          </section>

          <section className="session-launcher__section">
            <div className="session-launcher__header">
              <p className="eyebrow">Workspaces</p>
              <span>Open a saved server from any workspace.</span>
            </div>

            <div className="session-launcher__groups">
              {projects.map((project) => {
                const projectServers = servers.filter((server) => server.projectId === project.id);
                if (projectServers.length === 0) {
                  return null;
                }

                return (
                  <section className="session-launcher__group" key={project.id}>
                    <div className="session-launcher__group-header">
                      <span className="session-launcher__icon">
                        <FolderKanban size={14} />
                      </span>
                      <div className="session-launcher__body">
                        <strong>{projectDisplayLabel(project)}</strong>
                        <span>
                          {projectServers.length} server{projectServers.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>

                    <div className="session-launcher__list">
                      {projectServers.map((server) => (
                        <button
                          className="session-launcher__action"
                          key={server.id}
                          onClick={() => onConnectServer(server.id)}
                          type="button"
                        >
                          <span className="session-launcher__icon">
                            <Server size={14} />
                          </span>
                          <div className="session-launcher__body">
                            <strong>{serverDisplayLabel(server)}</strong>
                            <span>{buildSshTarget(server)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
