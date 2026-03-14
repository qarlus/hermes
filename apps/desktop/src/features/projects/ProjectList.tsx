import { FolderKanban } from "lucide-react";
import { projectDisplayLabel, type ProjectRecord } from "@hermes/core";

interface ProjectListProps {
  projects: ProjectRecord[];
  selectedProjectId: string | null;
  serverCountByProject: Record<string, number>;
  onSelect: (projectId: string) => void;
}

export function ProjectList({
  projects,
  selectedProjectId,
  serverCountByProject,
  onSelect
}: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <div className="project-list project-list--empty">
        <p>No projects yet.</p>
        <span>Create a project to group servers and users.</span>
      </div>
    );
  }

  return (
    <div className="project-list">
      {projects.map((project) => (
        <button
          className={`project-card ${project.id === selectedProjectId ? "project-card--active" : ""}`}
          key={project.id}
          onClick={() => onSelect(project.id)}
          type="button"
        >
          <span className="project-card__icon">
            <FolderKanban size={14} />
          </span>
          <span className="project-card__body">
            <strong>{projectDisplayLabel(project)}</strong>
            <span>
              {project.targetKind === "server"
                ? `${serverCountByProject[project.id] ?? 0} server${(serverCountByProject[project.id] ?? 0) === 1 ? "" : "s"}`
                : "Local project"}
              {project.githubRepoFullName.trim() ? ` / ${project.githubRepoFullName.trim()}` : ""}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
