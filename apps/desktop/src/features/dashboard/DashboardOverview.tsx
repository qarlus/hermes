import { FolderKanban, Server, TerminalSquare } from "lucide-react";
import {
  buildSshTarget,
  projectDisplayLabel,
  serverDisplayLabel,
  type ProjectRecord,
  type ServerRecord
} from "@hermes/core";

interface DashboardOverviewProps {
  projects: ProjectRecord[];
  selectedProjectId: string | null;
  selectedServerId: string | null;
  serverCountByProject: Record<string, number>;
  servers: ServerRecord[];
  onSelectProject: (projectId: string) => void;
  onSelectServer: (serverId: string) => void;
  onConnectServer: (serverId: string) => void;
}

export function DashboardOverview({
  projects,
  selectedProjectId,
  selectedServerId,
  serverCountByProject,
  servers,
  onSelectProject,
  onSelectServer,
  onConnectServer
}: DashboardOverviewProps) {
  return (
    <div className="dashboard-overview">
      <section className="dashboard-section">
        <div className="dashboard-section__header">
          <div>
            <p className="eyebrow">Projects</p>
            <h3>Groups</h3>
          </div>
        </div>
        <div className="dashboard-grid dashboard-grid--projects">
          {projects.map((project) => (
            <button
              className={`dashboard-card ${project.id === selectedProjectId ? "dashboard-card--active" : ""}`}
              key={project.id}
              onClick={() => onSelectProject(project.id)}
              type="button"
            >
              <span className="dashboard-card__icon">
                <FolderKanban size={16} />
              </span>
              <strong>{projectDisplayLabel(project)}</strong>
              <span>{serverCountByProject[project.id] ?? 0} servers</span>
              {project.description ? <p>{project.description}</p> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section__header">
          <div>
            <p className="eyebrow">Servers</p>
            <h3>Targets</h3>
          </div>
        </div>
        <div className="dashboard-grid dashboard-grid--servers">
          {servers.map((server) => (
            <div
              className={`dashboard-card dashboard-card--server ${server.id === selectedServerId ? "dashboard-card--active" : ""}`}
              key={server.id}
              onClick={() => onSelectServer(server.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectServer(server.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <span className="dashboard-card__icon">
                <Server size={16} />
              </span>
              <strong>{serverDisplayLabel(server)}</strong>
              <span>{buildSshTarget(server)}</span>
              <p>{server.hostname}:{server.port}</p>
              <button
                className="connect-chip"
                onClick={(event) => {
                  event.stopPropagation();
                  onConnectServer(server.id);
                }}
                type="button"
              >
                <TerminalSquare size={14} />
                Open
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
