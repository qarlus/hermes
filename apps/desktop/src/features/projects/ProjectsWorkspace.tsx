import {
  FolderPlus,
  GearSix,
  GithubLogo,
  Stack
} from "@phosphor-icons/react";
import type {
  ProjectRecord,
  ServerRecord
} from "@hermes/core";

type ProjectsWorkspaceProps = {
  projects: ProjectRecord[];
  selectedProjectId: string | null;
  servers: ServerRecord[];
  onCreateProject: () => void;
  onSelectProject: (projectId: string) => void;
  onEditProject: () => void;
};

export function ProjectsWorkspace({
  projects,
  selectedProjectId,
  servers,
  onCreateProject,
  onSelectProject,
  onEditProject
}: ProjectsWorkspaceProps) {
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;

  return (
    <section className="sessions-workspace">
      <div className="sessions-workspace__body">
        <div className="sessions-canvas">
          <div className="sessions-canvas__pane-grid sessions-canvas__pane-grid--single">
            <section className="session-pane-shell">
              <div className="session-pane-shell__body">
                <div className="session-project-picker session-project-picker--project-library">
                  <div className="session-project-picker__card">
                    <div className="session-project-picker__lead">
                      <strong>Projects</strong>
                      <span>
                        Create a project, attach its GitHub repository and path, then link a server only when the runtime is remote.
                      </span>
                    </div>

                    {projects.length === 0 ? (
                      <div className="project-library__empty">
                        <strong>No projects yet</strong>
                        <span>Start with a project so branch sessions and GitHub features have a home.</span>
                      </div>
                    ) : (
                      <div className="session-project-picker__grid">
                        {projects.map((project) => {
                          const serverCount = servers.filter((server) => server.projectId === project.id).length;
                          const runtimeLabel =
                            project.targetKind === "server"
                              ? `${serverCount} server${serverCount === 1 ? "" : "s"}`
                              : "Localhost";

                          return (
                            <button
                              aria-pressed={project.id === selectedProjectId}
                              className={`session-project-picker__item project-library__item ${
                                project.id === selectedProjectId ? "project-library__item--active" : ""
                              }`}
                              key={project.id}
                              onClick={() => onSelectProject(project.id)}
                              type="button"
                            >
                              <span className="session-project-picker__item-icon">
                                <Stack size={15} />
                              </span>
                              <span className="session-project-picker__item-copy">
                                <strong>{project.name}</strong>
                                <span>{project.githubRepoFullName || "No GitHub repo linked"}</span>
                                <span>{project.path || "No path set"}</span>
                                <span>{runtimeLabel}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="session-project-picker__footer">
                      <div className="session-starter-bar__controls">
                        <button className="session-starter-action session-starter-action--primary" onClick={onCreateProject} type="button">
                          <FolderPlus size={13} />
                          <span>New project</span>
                        </button>
                        <button
                          className="session-starter-action"
                          disabled={!selectedProject}
                          onClick={onEditProject}
                          type="button"
                        >
                          <GearSix size={13} />
                          <span>Edit selected</span>
                        </button>
                        {selectedProject ? (
                          <span className="session-starter-chip">
                            <GithubLogo size={13} />
                            <span>{selectedProject.githubRepoFullName || "GitHub not linked"}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
