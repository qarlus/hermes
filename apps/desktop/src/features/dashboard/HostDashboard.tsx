import {
  ArrowRight,
  DesktopTower,
  FolderSimple,
  Plus,
  TerminalWindow
} from "@phosphor-icons/react";
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
  onCreateServer: () => void;
  onConnect: (serverId: string) => void;
  onOpenTerminalSession: (tabId: string) => void;
  onOpenLocalShell: () => void;
  projects: ProjectRecord[];
  favoriteServers: ServerRecord[];
  servers: ServerRecord[];
  serverCountByProject: Record<string, number>;
  tabs: TerminalTab[];
  onOpenProject: (projectId: string) => void;
  relayConnected: boolean;
}

function HostDashboard({
  onCreateProject,
  onCreateServer,
  onConnect,
  onOpenTerminalSession,
  onOpenLocalShell,
  projects,
  favoriteServers,
  servers,
  serverCountByProject,
  tabs,
  onOpenProject,
  relayConnected
}: HostDashboardProps) {
  const activeTerminalTabs = [...tabs]
    .filter((tab) => tab.status === "connected" || tab.status === "connecting")
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));

  const lastProject = projects[0];

  return (
    <div className="home">
      <div className="home__content">
        {/* Recent workspaces */}
        <section className="home__section">
          <header className="home__section-header">
            <h3 className="home__section-title">
              Recent workspaces
              <span className="home__section-count">{projects.length}</span>
            </h3>
            <button
              className="home__section-action"
              onClick={onCreateProject}
              title="New workspace"
              type="button"
            >
              <Plus size={14} />
            </button>
          </header>

          {projects.length === 0 ? (
            <div className="home__empty">
              <div className="home__empty-text">
                <p>No workspaces yet</p>
                <span>Create a workspace to organize servers and connections.</span>
              </div>
              <button className="home__empty-action" onClick={onCreateProject} type="button">
                <Plus size={12} />
                Create workspace
              </button>
            </div>
          ) : (
            <div className="home__list">
              {projects.map((project) => {
                const serverCount = serverCountByProject[project.id] ?? 0;
                return (
                  <button
                    className="home__row home__row--launcher"
                    key={project.id}
                    onClick={() => onOpenProject(project.id)}
                    type="button"
                  >
                    <span className="home__row-icon">
                      <FolderSimple size={16} weight="regular" />
                    </span>
                    <span className="home__row-info">
                      <span className="home__row-name">{projectDisplayLabel(project)}</span>
                      <DetailCluster
                        items={[
                          "Local workspace",
                          `${serverCount} server${serverCount === 1 ? "" : "s"}`
                        ]}
                      />
                    </span>
                    <span className="home__row-cta">
                      Open
                      <ArrowRight size={13} className="home__row-arrow" />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Active sessions */}
        <section className="home__section">
          <header className="home__section-header">
            <h3 className="home__section-title">
              Active sessions
              <span className="home__section-count">{activeTerminalTabs.length}</span>
            </h3>
          </header>

          {activeTerminalTabs.length === 0 ? (
            <div className="home__section-body">
              <p className="home__section-note">Nothing running.</p>
              <div className="home__quick-actions">
                {lastProject ? (
                  <button
                    className="home__quick-action"
                    onClick={() => onOpenProject(lastProject.id)}
                    type="button"
                  >
                    <FolderSimple size={16} weight="regular" />
                    Reopen workspace
                  </button>
                ) : null}
                <button className="home__quick-action" onClick={onOpenLocalShell} type="button">
                  <TerminalWindow size={16} weight="regular" />
                  Local shell
                </button>
                {favoriteServers.length > 0 ? (
                  <button
                    className="home__quick-action"
                    onClick={() => onConnect(favoriteServers[0].id)}
                    type="button"
                  >
                    <DesktopTower size={16} weight="regular" />
                    Connect host
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="home__list">
              {activeTerminalTabs.slice(0, 5).map((tab) => {
                const server = servers.find((candidate) => candidate.id === tab.serverId);
                const project = projects.find((candidate) => candidate.id === server?.projectId);

                return (
                  <button
                    className="home__row"
                    key={tab.id}
                    onClick={() => onOpenTerminalSession(tab.id)}
                    type="button"
                  >
                    <span className={`home__row-status home__row-status--${tab.status}`} />
                    <span className="home__row-info">
                      <span className="home__row-name">{tab.title}</span>
                      <DetailCluster items={describeTerminalLocation(server, project)} />
                    </span>
                    <span className="home__row-time">{formatStartedAt(tab.startedAt)}</span>
                  </button>
                );
              })}
              {activeTerminalTabs.length > 5 ? (
                <span className="home__list-more">
                  +{activeTerminalTabs.length - 5} more in Sessions
                </span>
              ) : null}
            </div>
          )}
        </section>

        {/* Saved connections */}
        <section className="home__section">
          <header className="home__section-header">
            <h3 className="home__section-title">
              Saved connections
              <span className="home__section-count">{favoriteServers.length}</span>
            </h3>
          </header>

          {favoriteServers.length === 0 ? (
            <div className="home__list">
              <div className="home__empty">
                <div className="home__empty-text">
                  <p>No saved connections</p>
                  <span>Add a host once and keep it within reach from Home.</span>
                </div>
                <button className="home__empty-action" onClick={onCreateServer} type="button">
                  <Plus size={12} />
                  Add connection
                </button>
              </div>
            </div>
          ) : (
            <div className="home__list">
              {favoriteServers.map((server) => {
                const project = projects.find((candidate) => candidate.id === server.projectId);

                return (
                  <button
                    className="home__row home__row--launcher"
                    key={server.id}
                    onClick={() => onConnect(server.id)}
                    type="button"
                  >
                    <span className="home__row-icon">
                      <DesktopTower size={16} weight="regular" />
                    </span>
                    <span className="home__row-info">
                      <span className="home__row-name">{serverDisplayLabel(server)}</span>
                      <DetailCluster
                        items={[
                          buildSshTarget(server),
                          project ? projectDisplayLabel(project) : null
                        ]}
                      />
                    </span>
                    <span className="home__row-cta">
                      Connect
                      <ArrowRight size={14} className="home__row-arrow" weight="regular" />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Relay status */}
        <section className="home__section">
          <div
            className={`home__status home__status--${relayConnected ? "connected" : "disconnected"}`}
          >
            <span className="home__status-label">Relay {relayConnected ? "connected" : "disconnected"}</span>
          </div>
        </section>
      </div>
    </div>
  );
}

export { HostDashboard };
export default HostDashboard;

function describeTerminalLocation(server: ServerRecord | undefined, project: ProjectRecord | undefined) {
  if (!server) {
    return ["Local device"];
  }

  const target = buildSshTarget(server);
  return project ? [projectDisplayLabel(project), target] : [target];
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

function DetailCluster({ items }: { items: Array<string | null> }) {
  const visibleItems = items.filter((item): item is string => Boolean(item && item.trim().length > 0));

  return (
    <span className="home__row-detail">
      {visibleItems.map((item, index) => (
        <span key={`${item}-${index}`}>{item}</span>
      ))}
    </span>
  );
}
