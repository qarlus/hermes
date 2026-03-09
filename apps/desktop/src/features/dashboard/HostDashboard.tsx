import { ArrowRight, FolderKanban, FolderPlus } from "lucide-react";
import { projectDisplayLabel, type ProjectRecord } from "@hermes/core";

interface HostDashboardProps {
  onCreateProject: () => void;
  projects: ProjectRecord[];
  serverCountByProject: Record<string, number>;
  onOpenProject: (projectId: string) => void;
}

export function HostDashboard({
  onCreateProject,
  projects,
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
      <div className="host-dashboard__grid">
        {projects.map((project) => (
          <button
            className="host-dashboard-card"
            key={project.id}
            onClick={() => onOpenProject(project.id)}
            type="button"
          >
            <span className="host-dashboard-card__icon">
              <FolderKanban size={16} />
            </span>
            <strong>{projectDisplayLabel(project)}</strong>
            <span>
              {serverCountByProject[project.id] ?? 0} server
              {(serverCountByProject[project.id] ?? 0) === 1 ? "" : "s"}
            </span>
            {project.description ? <p>{project.description}</p> : null}
            <span className="host-dashboard-card__action">
              Open workspace
              <ArrowRight size={14} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
