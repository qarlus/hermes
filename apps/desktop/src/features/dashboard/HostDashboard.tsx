import { ArrowRight, FolderKanban, FolderPlus, Server, Star, TerminalSquare } from "lucide-react";
import {
  buildSshTarget,
  projectDisplayLabel,
  serverDisplayLabel,
  type ProjectRecord,
  type ServerRecord,
  type TerminalTab
} from "@hermes/core";

interface HostDashboardProps {
  onCreateProject: () => void;
  onConnect: (serverId: string) => void;
  onOpenTerminalSession: (tabId: string) => void;
  projects: ProjectRecord[];
  favoriteServers: ServerRecord[];
  servers: ServerRecord[];
  serverCountByProject: Record<string, number>;
  tabs: TerminalTab[];
  onOpenProject: (projectId: string) => void;
}

export function HostDashboard({
  onCreateProject,
  onConnect,
  onOpenTerminalSession,
  projects,
  favoriteServers,
  servers,
  serverCountByProject,
  tabs,
  onOpenProject
}: HostDashboardProps) {
  const activeTerminalTabs = [...tabs]
    .filter((tab) => tab.status === "connected" || tab.status === "connecting")
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));

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

          {projects.length === 0 ? (
            <div className="workspace__empty">
              <p>No workspaces yet</p>
              <span>Create a workspace, then add servers and accounts inside it.</span>
              <button className="primary-button" onClick={onCreateProject} type="button">
                <FolderPlus size={14} />
                New Workspace
              </button>
            </div>
          ) : (
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
          )}
        </section>

        <section className="host-dashboard__section">
          <div className="host-dashboard__header">
            <div>
              <p className="eyebrow">Terminals</p>
              <h2>Active windows</h2>
            </div>
            <span className="host-dashboard__meta">
              {activeTerminalTabs.length} active
            </span>
          </div>

          {activeTerminalTabs.length === 0 ? (
            <div className="host-dashboard__empty">
              <span className="host-dashboard__empty-icon">
                <TerminalSquare size={16} />
              </span>
              <div className="host-dashboard__empty-body">
                <strong>No active terminal windows</strong>
                <span>Open a local shell or connect to a saved server and it will appear here.</span>
              </div>
            </div>
          ) : (
            <div className="host-dashboard__terminal-list">
              {activeTerminalTabs.slice(0, 5).map((tab) => {
                const server = servers.find((candidate) => candidate.id === tab.serverId);
                const project = projects.find((candidate) => candidate.id === server?.projectId);

                return (
                  <button
                    className="host-dashboard__terminal-row"
                    key={tab.id}
                    onClick={() => onOpenTerminalSession(tab.id)}
                    type="button"
                  >
                    <div className="host-dashboard__terminal-main">
                      <span className={`status-dot status-dot--${tab.status}`} />
                      <div className="host-dashboard__terminal-body">
                        <strong>{tab.title}</strong>
                        <span>{describeTerminalLocation(server, project)}</span>
                        <p>{describeTerminalDetail(tab, server)}</p>
                      </div>
                    </div>
                    <div className="host-dashboard__terminal-side">
                      <span>{describeTerminalStatus(tab.status)}</span>
                      <strong>{formatStartedAt(tab.startedAt)}</strong>
                    </div>
                  </button>
                );
              })}
              {activeTerminalTabs.length > 5 ? (
                <span className="host-dashboard__terminal-more">
                  {activeTerminalTabs.length - 5} more active terminal
                  {activeTerminalTabs.length - 5 === 1 ? "" : "s"} in Sessions
                </span>
              ) : null}
            </div>
          )}
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

function describeTerminalLocation(server: ServerRecord | undefined, project: ProjectRecord | undefined) {
  if (!server) {
    return "Local device";
  }

  const target = buildSshTarget(server);
  return project ? `${projectDisplayLabel(project)} / ${target}` : target;
}

function describeTerminalDetail(session: TerminalTab, server: ServerRecord | undefined) {
  if (session.cwd) {
    return session.cwd;
  }

  if (!server) {
    return "Local shell";
  }

  return `${server.hostname}:${server.port}`;
}

function describeTerminalStatus(status: TerminalTab["status"]) {
  return status === "connected" ? "Live" : "Connecting";
}

function formatStartedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Now";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
