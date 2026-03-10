import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Copy,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  Github,
  Globe,
  HardDriveDownload,
  Plus,
  RefreshCcw,
  Search,
  Star,
  TerminalSquare,
  Trash2,
  UserRound
} from "lucide-react";
import type {
  GitHubAuthSession,
  GitHubDeviceFlowRecord,
  GitHubRepositoryRecord,
  GitRepositoryRecord
} from "@hermes/core";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type GitRepositoryView = {
  id: string;
  name: string;
  path: string;
  snapshot: GitRepositoryRecord | null;
  error: string | null;
};

type GitPageProps = {
  repositories: GitRepositoryView[];
  selectedRepositoryId: string | null;
  search: string;
  commitMessage: string;
  branchName: string;
  loading: boolean;
  busyAction: string | null;
  gitHubSession: GitHubAuthSession | null;
  gitHubDeviceFlow: GitHubDeviceFlowRecord | null;
  gitHubOwnedRepositories: GitHubRepositoryRecord[];
  gitHubPublicRepositories: GitHubRepositoryRecord[];
  gitHubSearchQuery: string;
  gitHubRepositoryPane: "owned" | "search";
  gitHubLoading: boolean;
  gitHubRepositoryLoading: boolean;
  gitHubSearchLoading: boolean;
  onSearchChange: (value: string) => void;
  onCancelGitHubSignIn: () => void;
  onStartGitHubSignIn: () => void;
  onDisconnectGitHub: () => void;
  onRefreshGitHubRepositories: () => void;
  onGitHubSearchQueryChange: (value: string) => void;
  onGitHubRepositoryPaneChange: (pane: "owned" | "search") => void;
  onCopyGitHubCloneUrl: (cloneUrl: string) => void;
  onSelectRepository: (repositoryId: string) => void;
  onAddRepository: () => void;
  onRefreshRepositories: () => void;
  onRemoveRepository: (repositoryId: string) => void;
  onOpenRepositoryShell: (repositoryId: string) => void;
  onCopyReviewDraft: (repositoryId: string) => void;
  onCommitMessageChange: (value: string) => void;
  onCommitAll: (repositoryId: string) => void;
  onBranchNameChange: (value: string) => void;
  onCreateBranch: (repositoryId: string) => void;
  onCheckoutBranch: (repositoryId: string, branchName: string) => void;
  onPublish: (repositoryId: string) => void;
};

export function GitPage({
  repositories,
  selectedRepositoryId,
  search,
  commitMessage,
  branchName,
  loading,
  busyAction,
  gitHubSession,
  gitHubDeviceFlow,
  gitHubOwnedRepositories,
  gitHubPublicRepositories,
  gitHubSearchQuery,
  gitHubRepositoryPane,
  gitHubLoading,
  gitHubRepositoryLoading,
  gitHubSearchLoading,
  onSearchChange,
  onCancelGitHubSignIn,
  onStartGitHubSignIn,
  onDisconnectGitHub,
  onRefreshGitHubRepositories,
  onGitHubSearchQueryChange,
  onGitHubRepositoryPaneChange,
  onCopyGitHubCloneUrl,
  onSelectRepository,
  onAddRepository,
  onRefreshRepositories,
  onRemoveRepository,
  onOpenRepositoryShell,
  onCopyReviewDraft,
  onCommitMessageChange,
  onCommitAll,
  onBranchNameChange,
  onCreateBranch,
  onCheckoutBranch,
  onPublish
}: GitPageProps) {
  const selectedRepository =
    repositories.find((repository) => repository.id === selectedRepositoryId) ?? repositories[0] ?? null;
  const remoteRepositories =
    gitHubRepositoryPane === "owned" ? gitHubOwnedRepositories : gitHubPublicRepositories;
  const remoteLoading = gitHubRepositoryPane === "owned" ? gitHubRepositoryLoading : gitHubSearchLoading;

  const [screen, setScreen] = useState<"auth" | "browser" | "detail">(
    gitHubSession ? "browser" : "auth"
  );
  const [allowLocalBypass, setAllowLocalBypass] = useState(false);
  const [detailKind, setDetailKind] = useState<"local" | "remote">("local");
  const [selectedRemoteId, setSelectedRemoteId] = useState<string | null>(null);

  const selectedRemoteRepository =
    remoteRepositories.find((repository) => repository.id === selectedRemoteId) ?? null;

  useGitHubAuthWebview(gitHubDeviceFlow?.verificationUri ?? null);

  useEffect(() => {
    if (gitHubSession) {
      setScreen((current) => (current === "auth" ? "browser" : current));
      return;
    }

    if (!allowLocalBypass) {
      setScreen("auth");
    }
  }, [allowLocalBypass, gitHubSession]);

  useEffect(() => {
    if (remoteRepositories.length === 0) {
      setSelectedRemoteId(null);
      return;
    }

    if (selectedRemoteId && remoteRepositories.some((repository) => repository.id === selectedRemoteId)) {
      return;
    }

    setSelectedRemoteId(remoteRepositories[0]?.id ?? null);
  }, [remoteRepositories, selectedRemoteId]);

  useEffect(() => {
    if (screen !== "detail") {
      return;
    }

    if (detailKind === "local" && selectedRepository) {
      return;
    }

    if (detailKind === "remote" && selectedRemoteRepository) {
      return;
    }

    setScreen(gitHubSession || allowLocalBypass ? "browser" : "auth");
  }, [allowLocalBypass, detailKind, gitHubSession, screen, selectedRemoteRepository, selectedRepository]);

  const handleSkipToLocal = () => {
    setAllowLocalBypass(true);
    setScreen("browser");
  };

  const handleOpenLocalDetail = (repositoryId: string) => {
    setDetailKind("local");
    onSelectRepository(repositoryId);
    setScreen("detail");
  };

  const handleOpenRemoteDetail = (repositoryId: string) => {
    setDetailKind("remote");
    setSelectedRemoteId(repositoryId);
    setScreen("detail");
  };

  return (
    <div className="git-page git-page--screened">
      {screen === "auth" ? (
        <GitAuthScreen
          deviceFlow={gitHubDeviceFlow}
          loading={gitHubLoading}
          onCancelGitHubSignIn={onCancelGitHubSignIn}
          onSkipToLocal={handleSkipToLocal}
          onStartGitHubSignIn={onStartGitHubSignIn}
        />
      ) : screen === "browser" ? (
        <GitRepositoryBrowserPage
          gitHubLoading={gitHubLoading}
          gitHubRepositories={remoteRepositories}
          gitHubRepositoryPane={gitHubRepositoryPane}
          gitHubSearchQuery={gitHubSearchQuery}
          localLoading={loading}
          remoteLoading={remoteLoading}
          repositories={repositories}
          search={search}
          session={gitHubSession}
          onAddRepository={onAddRepository}
          onCopyGitHubCloneUrl={onCopyGitHubCloneUrl}
          onDisconnectGitHub={onDisconnectGitHub}
          onGitHubRepositoryPaneChange={onGitHubRepositoryPaneChange}
          onGitHubSearchQueryChange={onGitHubSearchQueryChange}
          onRefreshGitHubRepositories={onRefreshGitHubRepositories}
          onRefreshRepositories={onRefreshRepositories}
          onRemoveRepository={onRemoveRepository}
          onSearchChange={onSearchChange}
          onSelectLocalRepository={handleOpenLocalDetail}
          onSelectRemoteRepository={handleOpenRemoteDetail}
          onStartGitHubSignIn={onStartGitHubSignIn}
        />
      ) : (
        <section className="git-page__workspace">
          <GitScreenHeader
            detailKind={detailKind}
            onBack={() => setScreen("browser")}
            repositoryName={
              detailKind === "local"
                ? selectedRepository?.snapshot?.name ?? selectedRepository?.name ?? "Repository"
                : selectedRemoteRepository?.fullName ?? "Repository"
            }
          />
          {detailKind === "local" && selectedRepository ? (
            selectedRepository.error ? (
              <div className="git-page__state">
                <span className="git-page__state-icon">
                  <AlertTriangle size={18} />
                </span>
                <div className="git-page__state-body">
                  <strong>Repository unavailable</strong>
                  <span>{selectedRepository.error}</span>
                </div>
              </div>
            ) : selectedRepository.snapshot ? (
              <GitRepositoryDetail
                branchName={branchName}
                busyAction={busyAction}
                commitMessage={commitMessage}
                onBranchNameChange={onBranchNameChange}
                onCheckoutBranch={onCheckoutBranch}
                onCommitAll={onCommitAll}
                onCommitMessageChange={onCommitMessageChange}
                onCopyReviewDraft={onCopyReviewDraft}
                onCreateBranch={onCreateBranch}
                onOpenRepositoryShell={onOpenRepositoryShell}
                onPublish={onPublish}
                repository={selectedRepository}
              />
            ) : (
              <div className="git-page__state">
                <span className="git-page__state-icon">
                  <RefreshCcw size={18} />
                </span>
                <div className="git-page__state-body">
                  <strong>Inspecting repository</strong>
                  <span>Hermes is reading branches, changes, and recent commits.</span>
                </div>
              </div>
            )
          ) : selectedRemoteRepository ? (
            <GitRemoteRepositoryDetail
              onAddRepository={onAddRepository}
              onCopyCloneUrl={onCopyGitHubCloneUrl}
              repository={selectedRemoteRepository}
              session={gitHubSession}
            />
          ) : (
            <div className="git-page__state git-page__state--wide">
              <span className="git-page__state-icon">
                <FolderGit2 size={18} />
              </span>
              <div className="git-page__state-body">
                <strong>Repository unavailable</strong>
                <span>Go back to the repository list and choose another repository.</span>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function useGitHubAuthWebview(url: string | null) {
  useEffect(() => {
    if (!url) {
      void closeGitHubAuthWebview();
      return;
    }

    let unlisten: (() => void) | null = null;
    let active = true;

    const open = async () => {
      await closeGitHubAuthWebview();
      const currentWindow = getCurrentWindow();
      const size = await currentWindow.innerSize();
      const width = Math.max(860, Math.min(1120, size.width - 72));
      const height = Math.max(560, Math.min(760, size.height - 140));
      const x = Math.max(24, Math.round((size.width - width) / 2));
      const y = 112;

      if (!active) {
        return;
      }

      const webview = new Webview(currentWindow, "github-auth-embedded", {
        url,
        x,
        y,
        width,
        height,
        focus: true
      });

      webview.once("tauri://error", () => undefined);
      unlisten = await currentWindow.onResized(async ({ payload }) => {
        const nextWidth = Math.max(860, Math.min(1120, payload.width - 72));
        const nextHeight = Math.max(560, Math.min(760, payload.height - 140));
        const nextX = Math.max(24, Math.round((payload.width - nextWidth) / 2));
        await webview.setPosition(new LogicalPosition(nextX, y));
        await webview.setSize(new LogicalSize(nextWidth, nextHeight));
      });
    };

    void open();

    return () => {
      active = false;
      if (unlisten) {
        unlisten();
      }
      void closeGitHubAuthWebview();
    };
  }, [url]);
}

async function closeGitHubAuthWebview() {
  const existing = await Webview.getByLabel("github-auth-embedded");
  if (existing) {
    await existing.close().catch(() => undefined);
  }
}

function GitAuthScreen({
  deviceFlow,
  loading,
  onStartGitHubSignIn,
  onCancelGitHubSignIn,
  onSkipToLocal
}: {
  deviceFlow: GitHubDeviceFlowRecord | null;
  loading: boolean;
  onStartGitHubSignIn: () => void;
  onCancelGitHubSignIn: () => void;
  onSkipToLocal: () => void;
}) {
  return (
    <section className="git-auth-screen">
      <div className="git-auth-screen__panel">
        <div className="git-auth-screen__hero">
          <p className="eyebrow">Git</p>
          <h1>Connect GitHub first</h1>
          <span>Sign in, then browse repositories, then open a repository detail page.</span>
        </div>

        <div className="git-auth-screen__steps">
          <article className="git-auth-screen__step git-auth-screen__step--active">
            <strong>1. Sign in</strong>
            <span>Authenticate GitHub inside Hermes to load your repositories.</span>
          </article>
          <article className="git-auth-screen__step">
            <strong>2. Pick a repository</strong>
            <span>Choose one from your GitHub list or your local checkouts.</span>
          </article>
          <article className="git-auth-screen__step">
            <strong>3. Work locally</strong>
            <span>Commit, branch, publish, and review from the repository detail page.</span>
          </article>
        </div>

        <div className="git-auth-screen__actions">
          {deviceFlow ? (
            <div className="git-auth-screen__device">
              <div className="git-auth-screen__device-code">{deviceFlow.userCode}</div>
              <div className="git-auth-screen__device-copy">
                <strong>Approve GitHub sign-in inside Hermes</strong>
                <span>Enter this code in the GitHub page that opened in-app.</span>
              </div>
              <button className="ghost-button" onClick={onCancelGitHubSignIn} type="button">
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button className="primary-button" disabled={loading} onClick={onStartGitHubSignIn} type="button">
                <Github size={14} />
                {loading ? "Opening sign-in..." : "Sign in with GitHub"}
              </button>
              <button className="ghost-button" onClick={onSkipToLocal} type="button">
                <Plus size={14} />
                Skip to local repo
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function GitRepositoryBrowserPage({
  session,
  repositories,
  search,
  localLoading,
  gitHubLoading,
  gitHubRepositoryPane,
  gitHubRepositories,
  remoteLoading,
  gitHubSearchQuery,
  onSearchChange,
  onStartGitHubSignIn,
  onDisconnectGitHub,
  onRefreshGitHubRepositories,
  onGitHubRepositoryPaneChange,
  onGitHubSearchQueryChange,
  onCopyGitHubCloneUrl,
  onSelectRemoteRepository,
  onAddRepository,
  onRefreshRepositories,
  onRemoveRepository,
  onSelectLocalRepository
}: {
  session: GitHubAuthSession | null;
  repositories: GitRepositoryView[];
  search: string;
  localLoading: boolean;
  gitHubLoading: boolean;
  gitHubRepositoryPane: "owned" | "search";
  gitHubRepositories: GitHubRepositoryRecord[];
  remoteLoading: boolean;
  gitHubSearchQuery: string;
  onSearchChange: (value: string) => void;
  onStartGitHubSignIn: () => void;
  onDisconnectGitHub: () => void;
  onRefreshGitHubRepositories: () => void;
  onGitHubRepositoryPaneChange: (pane: "owned" | "search") => void;
  onGitHubSearchQueryChange: (value: string) => void;
  onCopyGitHubCloneUrl: (cloneUrl: string) => void;
  onSelectRemoteRepository: (repositoryId: string) => void;
  onAddRepository: () => void;
  onRefreshRepositories: () => void;
  onRemoveRepository: (repositoryId: string) => void;
  onSelectLocalRepository: (repositoryId: string) => void;
}) {
  const showSearch = gitHubRepositoryPane === "search";

  return (
    <section className="git-browser-page">
      <div className="git-browser-page__header">
        <div>
          <p className="eyebrow">Git</p>
          <h1>{session ? "Choose a repository" : "Local repositories"}</h1>
          <span>
            {session
              ? "GitHub repositories are the default Git page. Pick one to inspect it or open a local checkout."
              : "You skipped GitHub sign-in. Local repositories are still available."}
          </span>
        </div>
        {session ? (
          <div className="git-nav__account">
            <UserRound size={14} />
            <span>@{session.login}</span>
          </div>
        ) : null}
      </div>

      <div className="git-browser-page__grid">
        <section className="git-nav__section">
          <div className="git-nav__header">
            <div>
              <p className="eyebrow">GitHub</p>
              <h2>Repositories</h2>
            </div>
          </div>

          {session ? (
            <>
              <div className="git-nav__toolbar">
                <div className="git-nav__tabs">
                  <button
                    className={`git-remote__tab ${gitHubRepositoryPane === "owned" ? "git-remote__tab--active" : ""}`}
                    onClick={() => onGitHubRepositoryPaneChange("owned")}
                    type="button"
                  >
                    <HardDriveDownload size={13} />
                    Your repos
                  </button>
                  <button
                    className={`git-remote__tab ${gitHubRepositoryPane === "search" ? "git-remote__tab--active" : ""}`}
                    onClick={() => onGitHubRepositoryPaneChange("search")}
                    type="button"
                  >
                    <Globe size={13} />
                    Public search
                  </button>
                </div>
                <div className="git-nav__toolbar-actions">
                  {gitHubRepositoryPane === "owned" ? (
                    <button className="ghost-button" disabled={remoteLoading} onClick={onRefreshGitHubRepositories} type="button">
                      <RefreshCcw size={14} />
                    </button>
                  ) : null}
                  <button className="ghost-button" disabled={gitHubLoading} onClick={onDisconnectGitHub} type="button">
                    Disconnect
                  </button>
                </div>
              </div>

              {showSearch ? (
                <label className="dashboard-search git-page__search git-nav__search">
                  <Search size={14} />
                  <input
                    onChange={(event) => onGitHubSearchQueryChange(event.target.value)}
                    placeholder="Search public repositories"
                    value={gitHubSearchQuery}
                  />
                </label>
              ) : null}
            </>
          ) : (
            <div className="git-nav__connect">
              <strong>GitHub is not connected</strong>
              <span>Sign in if you want to browse GitHub repositories here.</span>
              <button className="primary-button" onClick={onStartGitHubSignIn} type="button">
                <Github size={14} />
                Sign in with GitHub
              </button>
            </div>
          )}

          <div className="git-nav__list">
            {!session ? (
              <div className="git-nav__empty">
                <strong>GitHub repository list is locked</strong>
                <span>Connect GitHub to browse account repositories or search public repositories.</span>
              </div>
            ) : remoteLoading ? (
              <div className="git-nav__empty">
                <strong>Loading repositories</strong>
                <span>GitHub is responding.</span>
              </div>
            ) : gitHubRepositories.length === 0 ? (
              <div className="git-nav__empty">
                <strong>{showSearch ? "Search GitHub" : "No repositories yet"}</strong>
                <span>
                  {showSearch
                    ? "Type an owner, repo name, or topic to browse public repositories."
                    : "This account did not return any repositories."}
                </span>
              </div>
            ) : (
              gitHubRepositories.map((repository) => (
                <div className="git-nav-item" key={repository.id}>
                  <button className="git-nav-item__main" onClick={() => onSelectRemoteRepository(repository.id)} type="button">
                    <div className="git-nav-item__body">
                      <strong>{repository.fullName}</strong>
                      <span>{repository.description || "No description provided."}</span>
                    </div>
                  </button>
                  <div className="git-nav-item__meta">
                    <span className="git-pill">{repository.defaultBranch}</span>
                    <button className="text-button" onClick={() => onCopyGitHubCloneUrl(repository.cloneUrl)} type="button">
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="git-nav__section">
          <div className="git-nav__header">
            <div>
              <p className="eyebrow">Local</p>
              <h2>Checkouts</h2>
            </div>
            <span className="git-page__meta">
              {repositories.length} repo{repositories.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="git-local__toolbar">
            <label className="dashboard-search git-page__search">
              <Search size={14} />
              <input onChange={(event) => onSearchChange(event.target.value)} placeholder="Find a pinned repo" value={search} />
            </label>
            <div className="git-local__toolbar-actions">
              <button className="ghost-button" disabled={localLoading} onClick={onRefreshRepositories} type="button">
                <RefreshCcw size={14} />
              </button>
              <button className="primary-button" onClick={onAddRepository} type="button">
                <Plus size={14} />
                Add
              </button>
            </div>
          </div>

          <div className="git-nav__list">
            {repositories.length === 0 ? (
              <div className="git-nav__empty">
                <strong>No local checkout pinned</strong>
                <span>Add a local repository to open commit, branch, publish, and review details.</span>
              </div>
            ) : (
              repositories.map((repository) => {
                const snapshot = repository.snapshot;
                const changesCount =
                  (snapshot?.stagedCount ?? 0) + (snapshot?.changedCount ?? 0) + (snapshot?.untrackedCount ?? 0);

                return (
                  <div className="git-nav-item" key={repository.id}>
                    <button className="git-nav-item__main" onClick={() => onSelectLocalRepository(repository.id)} type="button">
                      <div className="git-nav-item__body">
                        <strong>{snapshot?.name ?? repository.name}</strong>
                        <span>{snapshot?.rootPath ?? repository.path}</span>
                        {repository.error ? (
                          <span className="git-repo-card__error">{repository.error}</span>
                        ) : snapshot ? (
                          <span>
                            {snapshot.branch}
                            {snapshot.upstream ? ` -> ${snapshot.upstream}` : ""}
                          </span>
                        ) : (
                          <span>Inspecting repository...</span>
                        )}
                      </div>
                    </button>
                    <div className="git-nav-item__meta">
                      {snapshot ? (
                        <span className={`git-pill ${snapshot.clean ? "git-pill--clean" : ""}`}>
                          {snapshot.clean ? "Clean" : `${changesCount} changed`}
                        </span>
                      ) : (
                        <span className="git-pill">Loading</span>
                      )}
                      <button className="text-button" onClick={() => onRemoveRepository(repository.id)} type="button">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function GitScreenHeader({
  repositoryName,
  detailKind,
  onBack
}: {
  repositoryName: string;
  detailKind: "local" | "remote";
  onBack: () => void;
}) {
  return (
    <div className="git-screen-header">
      <button className="ghost-button" onClick={onBack} type="button">
        Back to repositories
      </button>
      <div className="git-screen-header__copy">
        <p className="eyebrow">{detailKind === "local" ? "Local repository" : "GitHub repository"}</p>
        <strong>{repositoryName}</strong>
      </div>
    </div>
  );
}

function GitRemoteRepositoryDetail({
  repository,
  session,
  onCopyCloneUrl,
  onAddRepository
}: {
  repository: GitHubRepositoryRecord;
  session: GitHubAuthSession | null;
  onCopyCloneUrl: (cloneUrl: string) => void;
  onAddRepository: () => void;
}) {
  return (
    <div className="git-detail git-detail--remote">
      <section className="git-detail__masthead">
        <div className="git-detail__masthead-main">
          <div>
            <p className="eyebrow">Repository</p>
            <h2>{repository.fullName}</h2>
            <span>{repository.description || "No description provided."}</span>
          </div>
          <div className="git-detail__masthead-actions">
            <button className="ghost-button" onClick={() => onCopyCloneUrl(repository.cloneUrl)} type="button">
              <Copy size={14} />
              Copy clone URL
            </button>
            <button className="primary-button" onClick={onAddRepository} type="button">
              <Plus size={14} />
              Add local checkout
            </button>
          </div>
        </div>

        <div className="git-detail__masthead-meta">
          <span className="git-pill">{repository.private ? "Private" : "Public"}</span>
          <span className="git-pill">
            <Star size={11} />
            {repository.stargazerCount}
          </span>
          <span className="git-pill">{repository.language ?? "Mixed"}</span>
          <span className="git-pill">{repository.defaultBranch}</span>
          <span className="git-pill">{repository.updatedAt.slice(0, 10)}</span>
          <span className="git-pill">{repository.ownerLogin}</span>
        </div>
      </section>

      <div className="git-detail__workspace git-detail__workspace--remote">
        <section className="git-panel">
          <div className="git-panel__header">
            <div>
              <p className="eyebrow">Next step</p>
              <h3>Open locally in Hermes</h3>
            </div>
          </div>
          <div className="git-panel__empty">
            <strong>Choose the checkout you want to work on</strong>
            <span>
              Hermes shows full commit, branch, publish, and review details after you add the local
              repository for {repository.fullName}.
            </span>
          </div>
        </section>

        <section className="git-panel">
          <div className="git-panel__header">
            <div>
              <p className="eyebrow">Remote</p>
              <h3>GitHub snapshot</h3>
            </div>
          </div>
          <div className="git-remote-card">
            <div className="git-remote-card__top">
              <div className="git-remote-card__identity">
                <strong>{repository.fullName}</strong>
                <span>{session ? `Signed in as @${session.login}` : "Browsing GitHub metadata."}</span>
              </div>
            </div>
            <div className="git-remote-card__footer">
              <div className="git-remote-card__details">
                <span>{repository.htmlUrl}</span>
                <span>{repository.cloneUrl}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

type GitRepositoryDetailProps = {
  repository: GitRepositoryView;
  commitMessage: string;
  branchName: string;
  busyAction: string | null;
  onOpenRepositoryShell: (repositoryId: string) => void;
  onCopyReviewDraft: (repositoryId: string) => void;
  onCommitMessageChange: (value: string) => void;
  onCommitAll: (repositoryId: string) => void;
  onBranchNameChange: (value: string) => void;
  onCreateBranch: (repositoryId: string) => void;
  onCheckoutBranch: (repositoryId: string, branchName: string) => void;
  onPublish: (repositoryId: string) => void;
};

function GitRepositoryDetail({
  repository,
  commitMessage,
  branchName,
  busyAction,
  onOpenRepositoryShell,
  onCopyReviewDraft,
  onCommitMessageChange,
  onCommitAll,
  onBranchNameChange,
  onCreateBranch,
  onCheckoutBranch,
  onPublish
}: GitRepositoryDetailProps) {
  const snapshot = repository.snapshot!;
  const isCommitBusy = busyAction === `commit:${repository.id}`;
  const isBranchBusy = busyAction === `branch:${repository.id}`;
  const isPublishBusy = busyAction === `push:${repository.id}`;
  const isShellBusy = busyAction === `shell:${repository.id}`;
  const totalLocalChanges = snapshot.stagedCount + snapshot.changedCount + snapshot.untrackedCount;

  return (
    <div className="git-detail">
      <section className="git-detail__masthead">
        <div className="git-detail__masthead-main">
          <div>
            <p className="eyebrow">Repository</p>
            <h2>{snapshot.name}</h2>
            <span>{snapshot.rootPath}</span>
          </div>
          <div className="git-detail__masthead-actions">
            <button className="ghost-button" disabled={isShellBusy} onClick={() => onOpenRepositoryShell(repository.id)} type="button">
              <TerminalSquare size={14} />
              {isShellBusy ? "Opening..." : "Open shell"}
            </button>
            <button className="ghost-button" onClick={() => onCopyReviewDraft(repository.id)} type="button">
              <Copy size={14} />
              Copy review
            </button>
            <button
              className="primary-button"
              disabled={!snapshot.hasRemote || isPublishBusy}
              onClick={() => onPublish(repository.id)}
              type="button"
            >
              <ArrowUpRight size={14} />
              {isPublishBusy ? "Publishing..." : "Publish"}
            </button>
          </div>
        </div>
        <div className="git-detail__masthead-meta">
          <span className="git-pill git-pill--active">
            <GitBranch size={12} />
            {snapshot.branch}
          </span>
          <span className={`git-pill ${snapshot.clean ? "git-pill--clean" : ""}`}>
            {snapshot.clean ? "Clean working tree" : `${totalLocalChanges} local changes`}
          </span>
          {snapshot.stagedCount > 0 ? <span className="git-pill">{snapshot.stagedCount} staged</span> : null}
          {snapshot.changedCount > 0 ? <span className="git-pill">{snapshot.changedCount} modified</span> : null}
          {snapshot.untrackedCount > 0 ? <span className="git-pill">{snapshot.untrackedCount} untracked</span> : null}
          {snapshot.conflictedCount > 0 ? (
            <span className="git-pill git-pill--conflicted">{snapshot.conflictedCount} conflicted</span>
          ) : null}
          {snapshot.ahead > 0 ? <span className="git-pill">{snapshot.ahead} ahead</span> : null}
          {snapshot.behind > 0 ? <span className="git-pill">{snapshot.behind} behind</span> : null}
          <span className="git-pill">{snapshot.upstream ?? snapshot.remoteName ?? "No remote"}</span>
        </div>
      </section>

      <div className="git-detail__workspace">
        <div className="git-detail__sidebar">
          <section className="git-panel">
            <div className="git-panel__header">
              <div>
                <p className="eyebrow">Compose</p>
                <h3>Commit and branch</h3>
              </div>
            </div>
            <div className="git-detail__form-stack">
              <label className="field field--full">
                <span>Commit message</span>
                <input
                  onChange={(event) => onCommitMessageChange(event.target.value)}
                  placeholder="Summarize this work clearly"
                  value={commitMessage}
                />
              </label>
              <button
                className="primary-button"
                disabled={snapshot.clean || commitMessage.trim().length === 0 || isCommitBusy}
                onClick={() => onCommitAll(repository.id)}
                type="button"
              >
                <GitCommitHorizontal size={14} />
                {isCommitBusy ? "Committing..." : "Commit all changes"}
              </button>
            </div>

            <div className="git-detail__form-stack">
              <label className="field field--full">
                <span>New branch</span>
                <input
                  onChange={(event) => onBranchNameChange(event.target.value)}
                  placeholder="feature/hermes-git"
                  value={branchName}
                />
              </label>
              <button
                className="ghost-button"
                disabled={branchName.trim().length === 0 || isBranchBusy}
                onClick={() => onCreateBranch(repository.id)}
                type="button"
              >
                <GitBranch size={14} />
                {isBranchBusy ? "Creating..." : "Create branch"}
              </button>
            </div>
          </section>

          <section className="git-panel">
            <div className="git-panel__header">
              <div>
                <p className="eyebrow">Review</p>
                <h3>Draft state</h3>
              </div>
            </div>
            {snapshot.review ? (
              <div className="git-review">
                <div className="git-review__headline">
                  <strong>{snapshot.review.commitCount} commits ready for review</strong>
                  <span>
                    Targeting {snapshot.review.baseBranch} across {snapshot.review.changedFiles} file
                    {snapshot.review.changedFiles === 1 ? "" : "s"}.
                  </span>
                </div>
                <div className="git-review__meta">
                  <span>{snapshot.lastCommitSummary ?? "No commits yet"}</span>
                  <span>{snapshot.lastCommitRelative ?? "No recent history"}</span>
                </div>
              </div>
            ) : (
              <div className="git-panel__empty">
                <strong>No review branch yet</strong>
                <span>Switch to or create a feature branch to build a local review draft.</span>
              </div>
            )}
          </section>

          <section className="git-panel">
            <div className="git-panel__header">
              <div>
                <p className="eyebrow">Branches</p>
                <h3>Switch locally</h3>
              </div>
            </div>
            <div className="git-branch-list">
              {snapshot.branches.map((branch) => {
                const checkoutBusy = busyAction === `checkout:${repository.id}:${branch.name}`;
                return (
                  <div className="git-branch-row" key={branch.name}>
                    <div className="git-branch-row__body">
                      <strong>{branch.name}</strong>
                      <span>{branch.upstream ?? "No upstream branch"}</span>
                    </div>
                    {branch.current ? (
                      <span className="git-pill git-pill--active">Checked out</span>
                    ) : (
                      <button
                        className="ghost-button"
                        disabled={checkoutBusy}
                        onClick={() => onCheckoutBranch(repository.id, branch.name)}
                        type="button"
                      >
                        {checkoutBusy ? "Switching..." : "Checkout"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="git-panel">
            <div className="git-panel__header">
              <div>
                <p className="eyebrow">History</p>
                <h3>Recent commits</h3>
              </div>
            </div>
            {snapshot.recentCommits.length === 0 ? (
              <div className="git-panel__empty">
                <strong>No commit history</strong>
                <span>This repository has not recorded any commits yet.</span>
              </div>
            ) : (
              <div className="git-commit-list">
                {snapshot.recentCommits.map((commit) => (
                  <div className="git-commit-row" key={commit.id}>
                    <div className="git-commit-row__body">
                      <strong>{commit.summary}</strong>
                      <span>
                        {commit.author} | {commit.relativeDate}
                      </span>
                    </div>
                    <span className="git-commit-row__sha">{commit.id.slice(0, 7)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="git-panel git-panel--changes">
          <div className="git-panel__header">
            <div>
              <p className="eyebrow">Changes</p>
              <h3>Working tree</h3>
            </div>
            <span className="git-page__meta">
              {snapshot.changes.length} file{snapshot.changes.length === 1 ? "" : "s"}
            </span>
          </div>
          {snapshot.changes.length === 0 ? (
            <div className="git-panel__empty">
              <strong>Nothing pending</strong>
              <span>The working tree is clean.</span>
            </div>
          ) : (
            <div className="git-change-list">
              {snapshot.changes.map((change) => (
                <div
                  className="git-change-row"
                  key={`${change.path}:${change.status}:${change.staged ? "staged" : "unstaged"}`}
                >
                  <span className={`git-pill git-pill--status git-pill--${change.status}`}>{change.status}</span>
                  <div className="git-change-row__body">
                    <strong>{change.path}</strong>
                    <span>
                      {change.previousPath
                        ? `${change.previousPath} -> ${change.path}`
                        : change.staged
                          ? "Staged change"
                          : "Working tree change"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
