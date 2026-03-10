import { ArrowRight, FolderKanban, FolderPlus, Server, Star, TerminalSquare } from "lucide-react";
import {
  buildSshTarget,
  projectDisplayLabel,
  serverDisplayLabel,
  type ProjectRecord,
  type ServerRecord
} from "@hermes/core";

interface HostDashboardProps {
  onCreateProject: () => void;
  onConnect: (serverId: string) => void;
  projects: ProjectRecord[];
  favoriteServers: ServerRecord[];
  serverCountByProject: Record<string, number>;
  onOpenProject: (projectId: string) => void;
}

export function HostDashboard({
  onCreateProject,
  onConnect,
  projects,
  favoriteServers,
  serverCountByProject,
  onOpenProject
}: HostDashboardProps) {
  if (projects.length === 0) {
    return (
      <div className="workspace__empty">
        <p>No workspaces yet</p>
        <span>Create a workspace, then add servers and accounts inside it.</span>
        <button className="primary-button" onClick={onCreateProject} type="button">
          <FolderPlus size={14} />
          New Workspace
        </button>
      </div>
    );
  }

  return (
    <div className="host-dashboard">
      <div className="host-dashboard__board">
        <section className="host-dashboard__section">
          <div className="host-dashboard__header">
            <div>
              <p className="eyebrow">Workspaces</p>
              <h2>Your workspaces</h2>
            </div>
            <span className="host-dashboard__meta">
              {projects.length} workspace{projects.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="host-dashboard__grid">
            {projects.map((project) => (
              <button
                className="host-dashboard-card"
                key={project.id}
                onClick={() => onOpenProject(project.id)}
                type="button"
              >
                <div className="host-dashboard-card__main">
                  <span className="host-dashboard-card__icon">
                    <FolderKanban size={16} />
                  </span>
                  <div className="host-dashboard-card__body">
                    <strong>{projectDisplayLabel(project)}</strong>
                    {project.description ? <p>{project.description}</p> : <p>Local workspace</p>}
                  </div>
                  <div className="host-dashboard-card__details">
                    <div className="host-dashboard-card__detail">
                      <span>Servers</span>
                      <strong>{String(serverCountByProject[project.id] ?? 0).padStart(2, "0")}</strong>
                    </div>
                    <div className="host-dashboard-card__detail">
                      <span>Scope</span>
                      <strong>Local</strong>
                    </div>
                  </div>
                </div>
                <div className="host-dashboard-card__footer">
                  <span className="host-dashboard-card__action">
                    Open workspace
                    <ArrowRight size={14} />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="host-dashboard__section">
          <div className="host-dashboard__header">
            <div>
              <p className="eyebrow">Favourited</p>
              <h2>Quick connections</h2>
            </div>
            <span className="host-dashboard__meta">
              {favoriteServers.length} server{favoriteServers.length === 1 ? "" : "s"}
            </span>
          </div>

          {favoriteServers.length === 0 ? (
            <div className="host-dashboard__empty">
              <span className="host-dashboard__empty-icon">
                <Star size={16} />
              </span>
              <div className="host-dashboard__empty-body">
                <strong>No favourited servers yet</strong>
                <span>Enable the dashboard shortcut on a server to keep it here.</span>
              </div>
            </div>
          ) : (
            <div className="host-dashboard__favorites">
              {favoriteServers.map((server) => {
                const project = projects.find((candidate) => candidate.id === server.projectId);

                return (
                  <article className="host-dashboard-server-card" key={server.id}>
                    <div className="host-dashboard-server-card__top">
                      <span className="host-dashboard-card__icon">
                        <Server size={16} />
                      </span>
                      {project ? (
                        <span className="host-dashboard-card__meta">
                          {projectDisplayLabel(project)}
                        </span>
                      ) : null}
                    </div>
                    <div className="host-dashboard-server-card__body">
                      <strong>{serverDisplayLabel(server)}</strong>
                      <span>{buildSshTarget(server)}</span>
                      <p>
                        {server.hostname}:{server.port}
                      </p>
                    </div>
                    <div className="host-dashboard-server-card__actions">
                      <button
                        className="connect-chip"
                        onClick={() => onOpenProject(server.projectId)}
                        type="button"
                      >
                        Workspace
                        <ArrowRight size={14} />
                      </button>
                      <button className="primary-button" onClick={() => onConnect(server.id)} type="button">
                        <TerminalSquare size={14} />
                        Connect
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
