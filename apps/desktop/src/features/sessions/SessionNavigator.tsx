import { useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  GitCommit,
  GitBranch,
  GitPullRequest,
  Desktop,
  FolderSimple,
  GearSix,
  HashStraight,
  Stack
} from "@phosphor-icons/react";
import {
  buildSshTarget,
  type GitBranchRecord,
  type ProjectRecord,
  type ServerRecord,
  type TerminalTab
} from "@hermes/core";
import type { GitRepositoryView } from "../git/GitPage";

type LocalSessionPreset = {
  id: string;
  name: string;
  path: string;
};

type SessionNavigatorProps = {
  tabs: TerminalTab[];
  activeTabId: string | null;
  selectedProjectId: string | null;
  selectedBranchName: string | null;
  projects: ProjectRecord[];
  gitRepositories: GitRepositoryView[];
  servers: ServerRecord[];
  localSessionPresets: LocalSessionPreset[];
  onSelectTab: (tabId: string) => void;
  onSelectProject: (projectId: string | null) => void;
  onSelectBranch: (branchName: string) => void;
  onOpenProjectSettings: (projectId: string) => void;
  onCreateGitBranch: () => void;
  onCommitGitBranch: () => void;
  onCopyPrDraft: () => void;
  onMergeBranch: () => void;
  onPullBranch: () => void;
  onPushGitBranch: () => void;
  onStartLocalSession: () => void;
  onOpenSessionLauncher: () => void;
  onOpenPresetEditor: () => void;
  onLaunchLocalPreset: (presetId: string) => void;
};

export function SessionNavigator({
  tabs,
  activeTabId,
  selectedProjectId,
  selectedBranchName,
  projects,
  gitRepositories,
  servers,
  localSessionPresets,
  onSelectTab,
  onSelectProject,
  onSelectBranch,
  onOpenProjectSettings,
  onCreateGitBranch,
  onCommitGitBranch,
  onCopyPrDraft,
  onMergeBranch,
  onPullBranch,
  onPushGitBranch,
  onStartLocalSession,
  onOpenSessionLauncher,
  onOpenPresetEditor,
  onLaunchLocalPreset
}: SessionNavigatorProps) {
  const [mode, setMode] = useState<"projects" | "sessions">("projects");
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedProjectRepository =
    selectedProject ? findProjectRepository(selectedProject, gitRepositories) : null;
  const selectedProjectBranches = selectedProjectRepository?.snapshot?.branches ?? [];
  const activeProjectBranchName =
    selectedBranchName ??
    selectedProjectRepository?.snapshot?.branch ??
    selectedProjectBranches.find((branch) => branch.current)?.name ??
    "main";
  const projectEntries = projects.map((project) => {
    const projectServers = servers.filter((candidate) => candidate.projectId === project.id);
    const projectTabs = tabs.filter((candidate) => {
      const server = servers.find((serverCandidate) => serverCandidate.id === candidate.serverId);
      return server?.projectId === project.id;
    });
    const primaryServer = projectServers[0] ?? null;

    return {
      id: project.id,
      title: project.name,
      lineA:
        projectTabs.length > 0
          ? `${projectTabs.length} live terminal${projectTabs.length === 1 ? "" : "s"}`
          : `${projectServers.length} host${projectServers.length === 1 ? "" : "s"}`,
      lineB: project.description || (primaryServer ? buildSshTarget(primaryServer) : "No linked hosts")
    };
  });
  const folderEntries = localSessionPresets.slice(0, 8);
  const primarySession = tabs.find((tab) => tab.id === activeTabId) ?? tabs.at(-1) ?? null;
  const branchSessionTitle =
    activeProjectBranchName === "main" ? "Main session" : `${activeProjectBranchName} session`;
  const branchSessionMeta = `${tabs.length} terminal${tabs.length === 1 ? "" : "s"}`;

  return (
    <div className="session-navigator">
      <div className="session-navigator__header">
        <div className="session-navigator__mode-switch" role="tablist" aria-label="Navigator mode">
          <button
            aria-selected={mode === "projects"}
            className={`session-navigator__mode-button ${
              mode === "projects" ? "session-navigator__mode-button--active" : ""
            }`}
            onClick={() => setMode("projects")}
            role="tab"
            type="button"
          >
            Projects
          </button>
          <button
            aria-selected={mode === "sessions"}
            className={`session-navigator__mode-button ${
              mode === "sessions" ? "session-navigator__mode-button--active" : ""
            }`}
            onClick={() => setMode("sessions")}
            role="tab"
            type="button"
          >
            Sessions
          </button>
        </div>
        {mode === "projects" && selectedProject ? (
          <div className="session-navigator__session-actions">
            <button className="session-navigator__mini-action" onClick={onCreateGitBranch} type="button">
              <GitBranch size={11} weight="bold" />
              <span>Branch</span>
            </button>
            <button className="session-navigator__mini-action" onClick={onCopyPrDraft} type="button">
              <GitPullRequest size={11} weight="bold" />
              <span>PR</span>
            </button>
            <button className="session-navigator__mini-action" onClick={onMergeBranch} type="button">
              <Stack size={11} weight="bold" />
              <span>Merge</span>
            </button>
          </div>
        ) : null}
        {mode === "sessions" && selectedProject ? (
          <div className="session-navigator__session-actions">
            <button className="session-navigator__mini-action" onClick={onPullBranch} type="button">
              <ArrowDown size={11} weight="bold" />
              <span>Pull</span>
            </button>
            <button className="session-navigator__mini-action" onClick={onCreateGitBranch} type="button">
              <GitBranch size={11} weight="bold" />
              <span>Branch</span>
            </button>
            <button className="session-navigator__mini-action" onClick={onCommitGitBranch} type="button">
              <GitCommit size={11} weight="bold" />
              <span>Commit</span>
            </button>
            <button className="session-navigator__mini-action" onClick={onPushGitBranch} type="button">
              <ArrowUp size={11} weight="bold" />
              <span>Push</span>
            </button>
          </div>
        ) : null}
      </div>

      <div className="session-navigator__scroll">
        {mode === "projects" ? (
          <>
            {selectedProject ? (
              <>
                <NavigatorBlock label="Project">
                  <div className="session-navigator-row session-navigator-row--project session-navigator-row--active">
                    <button
                      className="session-navigator-row__main"
                      onClick={() => onSelectProject(null)}
                      type="button"
                    >
                      <span className="session-navigator-row__glyph">
                        <Stack size={12} />
                      </span>
                      <span className="session-navigator-row__copy">
                        <strong>{selectedProject.name}</strong>
                        <span>{selectedProjectRepository?.path ?? "Workspace context"}</span>
                      </span>
                    </button>
                    <button
                      aria-label={`Open ${selectedProject.name} connections`}
                      className="session-navigator-row__settings"
                      onClick={() => onOpenProjectSettings(selectedProject.id)}
                      type="button"
                    >
                      <GearSix size={12} />
                    </button>
                  </div>
                </NavigatorBlock>

                <NavigatorBlock label="Branches">
                  {(selectedProjectBranches.length > 0
                    ? selectedProjectBranches
                    : [{ name: "main", current: true, upstream: null } as GitBranchRecord]
                  ).map((branch) => (
                    <button
                      className={`session-navigator-row ${
                        branch.name === activeProjectBranchName ? "session-navigator-row--active" : ""
                      }`}
                      key={branch.name}
                      onClick={() => {
                        setMode("sessions");
                        onSelectBranch(branch.name);
                      }}
                      type="button"
                    >
                      <span className="session-navigator-row__glyph">
                        <HashStraight size={12} />
                      </span>
                      <span className="session-navigator-row__copy">
                        <strong>{branch.name}</strong>
                        <span>{branch.upstream ?? "Branch session surface"}</span>
                      </span>
                    </button>
                  ))}
                </NavigatorBlock>
              </>
            ) : (
              <>
                <NavigatorBlock label="Workspaces">
                  {projectEntries.length === 0 ? (
                    <div className="session-navigator__placeholder" />
                  ) : (
                    projectEntries.map((project) => (
                      <div
                        aria-pressed={project.id === selectedProjectId}
                        className={`session-navigator-row session-navigator-row--project ${
                          project.id === selectedProjectId ? "session-navigator-row--active" : ""
                        }`}
                        key={project.id}
                      >
                        <button
                          className="session-navigator-row__main"
                          onClick={() => onSelectProject(project.id)}
                          type="button"
                        >
                          <span className="session-navigator-row__glyph">
                            <Stack size={12} />
                          </span>
                          <span className="session-navigator-row__copy">
                            <strong>{project.title}</strong>
                            <span>{project.lineA}</span>
                            <span>{project.lineB}</span>
                          </span>
                        </button>
                        <button
                          aria-label={`Open ${project.title} connections`}
                          className="session-navigator-row__settings"
                          onClick={() => onOpenProjectSettings(project.id)}
                          type="button"
                        >
                          <GearSix size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </NavigatorBlock>

                <NavigatorBlock label="Folders">
                  <button className="session-navigator-row session-navigator-row--launch" onClick={onStartLocalSession} type="button">
                    <span className="session-navigator-row__glyph">
                      <Desktop size={12} />
                    </span>
                    <span className="session-navigator-row__copy">
                      <strong>Local session</strong>
                      <span>This device</span>
                    </span>
                  </button>

                  {folderEntries.map((preset) => (
                    <button
                      className="session-navigator-row session-navigator-row--launch"
                      key={preset.id}
                      onClick={() => onLaunchLocalPreset(preset.id)}
                      type="button"
                    >
                      <span className="session-navigator-row__glyph">
                        <FolderSimple size={12} />
                      </span>
                      <span className="session-navigator-row__copy">
                        <strong>{preset.name}</strong>
                        <span>{compactPath(preset.path)}</span>
                      </span>
                    </button>
                  ))}
                </NavigatorBlock>
              </>
            )}
          </>
        ) : (
          <>
            <NavigatorBlock label="Current Branch">
              {selectedProject ? (
                <button
                  aria-pressed={tabs.length > 0}
                  className={`session-navigator-row ${tabs.length > 0 ? "session-navigator-row--active" : ""}`}
                  onClick={() => {
                    if (primarySession) {
                      onSelectTab(primarySession.id);
                    }
                  }}
                  type="button"
                >
                  <span
                    className={`session-navigator-row__status session-navigator-row__status--${
                      primarySession?.status ?? "connecting"
                    }`}
                  />
                  <span className="session-navigator-row__copy">
                    <strong>{branchSessionTitle}</strong>
                    <span>{branchSessionMeta}</span>
                  </span>
                </button>
              ) : (
                <div className="session-navigator__placeholder" />
              )}
            </NavigatorBlock>
          </>
        )}
      </div>
    </div>
  );
}

function findProjectRepository(project: ProjectRecord, repositories: GitRepositoryView[]) {
  const projectName = normalizeKey(project.name);
  return (
    repositories.find((repository) => normalizeKey(repository.name) === projectName) ??
    repositories.find((repository) => normalizeKey(repository.path).includes(projectName)) ??
    null
  );
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function NavigatorBlock({
  children,
  label
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <section className="session-navigator__block">
      <div className="session-navigator__label">{label}</div>
      <div className="session-navigator__stack">{children}</div>
    </section>
  );
}

function compactPath(path: string | null) {
  if (!path) {
    return "";
  }

  const normalized = path.replace(/\\/g, "/");
  return normalized.length > 28 ? `...${normalized.slice(-25)}` : normalized;
}
