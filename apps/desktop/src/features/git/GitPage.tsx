import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Copy,
  FolderGit2,
  Github,
  Globe,
  HardDriveDownload,
  KeyRound,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Star,
  TerminalSquare,
  Trash2,
  UserRound
} from "lucide-react";
import type {
  GitHubAuthSession,
  GitHubDeviceFlowRecord,
  GitHubRepositoryRecord,
  GitRepositoryRecord,
  TerminalTab
} from "@hermes/core";
import { findLocalGitHubCheckouts } from "@hermes/db";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  GitRemoteRepositoryEmptyView,
  GitRepositoryDetailView
} from "./components/GitRepositoryDetailView";

export type GitRepositoryView = {
  id: string;
  name: string;
  path: string;
  snapshot: GitRepositoryRecord | null;
  error: string | null;
};

export type GitToolbarContext = {
  cloneUrl: string | null;
  shellRepositoryId: string | null;
  reviewRepositoryId: string | null;
  headerEyebrow: string | null;
  headerTitle: string | null;
  headerSubtitle: string | null;
  headerMeta: string[];
  onBack: (() => void) | null;
};

const GIT_SETUP_COMPLETE_KEY = "hermes.git.setupComplete";
const GIT_BROWSER_MODE_KEY = "hermes.git.browserMode";

type GitBrowserMode = "hybrid" | "localOnly";
type GitScreen = "auth" | "browser" | "detail";

type GitPageProps = {
  repositories: GitRepositoryView[];
  tabs: TerminalTab[];
  openGitHubSetupRequest: number;
  onToolbarContextChange?: (context: GitToolbarContext) => void;
  localSessionPresets: Array<{
    id: string;
    name: string;
    path: string;
  }>;
  selectedRepositoryId: string | null;
  search: string;
  commitMessage: string;
  branchName: string;
  loading: boolean;
  busyAction: string | null;
  gitHubSession: GitHubAuthSession | null;
  gitHubDeviceFlow: GitHubDeviceFlowRecord | null;
  gitHubDeviceFlowAvailable: boolean;
  gitHubOwnedRepositories: GitHubRepositoryRecord[];
  gitHubPublicRepositories: GitHubRepositoryRecord[];
  gitHubSearchQuery: string;
  gitHubRepositoryPane: "personal" | "orgs" | "search";
  gitHubLoading: boolean;
  gitHubRepositoryLoading: boolean;
  gitHubSearchLoading: boolean;
  onSearchChange: (value: string) => void;
  onCancelGitHubSignIn: () => void;
  onStartGitHubSignIn: () => void;
  onSignInGitHubWithToken: (token: string) => void;
  onDisconnectGitHub: () => void;
  onRefreshGitHubRepositories: () => void;
  onGitHubSearchQueryChange: (value: string) => void;
  onGitHubRepositoryPaneChange: (pane: "personal" | "orgs" | "search") => void;
  onCopyGitHubCloneUrl: (cloneUrl: string) => void;
  onCloneRepository: (repository: GitHubRepositoryRecord) => void;
  onSelectRepository: (repositoryId: string) => void;
  onAddRepository: () => void;
  onRefreshRepositories: () => void;
  onRemoveRepository: (repositoryId: string) => void;
  onOpenRepositoryShell: (repositoryId: string) => void;
  onOpenTerminalSession: (tabId: string) => void;
  onLaunchLocalPreset: (presetId: string) => void;
  onPinRepositorySnapshot: (snapshot: GitRepositoryRecord) => void;
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
  tabs,
  openGitHubSetupRequest,
  onToolbarContextChange,
  localSessionPresets,
  selectedRepositoryId,
  search,
  commitMessage,
  branchName,
  loading,
  busyAction,
  gitHubSession,
  gitHubDeviceFlow,
  gitHubDeviceFlowAvailable,
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
  onSignInGitHubWithToken,
  onDisconnectGitHub,
  onRefreshGitHubRepositories,
  onGitHubSearchQueryChange,
  onGitHubRepositoryPaneChange,
  onCopyGitHubCloneUrl,
  onCloneRepository,
  onSelectRepository,
  onAddRepository,
  onRefreshRepositories,
  onRemoveRepository,
  onOpenRepositoryShell,
  onOpenTerminalSession,
  onLaunchLocalPreset,
  onPinRepositorySnapshot,
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
  const visibleLocalRepositories = repositories.filter((repository) => matchesRepositorySearch(repository, search));
  const remoteRepositories =
    gitHubRepositoryPane === "personal"
      ? gitHubOwnedRepositories.filter((repository) => repository.ownerType !== "Organization")
      : gitHubRepositoryPane === "orgs"
        ? gitHubOwnedRepositories.filter((repository) => repository.ownerType === "Organization")
        : gitHubPublicRepositories;
  const showRemoteSection = Boolean(gitHubSession);
  const visibleRemoteRepositories = showRemoteSection ? remoteRepositories : [];
  const [browserMode, setBrowserMode] = useState<GitBrowserMode>(() => loadGitBrowserMode());
  const [screen, setScreen] = useState<GitScreen>(() =>
    loadGitSetupComplete() || gitHubSession || repositories.length > 0 ? "browser" : "auth"
  );
  const [detailMode, setDetailMode] = useState<"remote" | "local">("local");
  const [selectedRemoteId, setSelectedRemoteId] = useState<string | null>(null);
  const [tokenDraft, setTokenDraft] = useState("");
  const [discoveredRemoteRepositories, setDiscoveredRemoteRepositories] = useState<
    Record<string, GitRepositoryRecord[]>
  >({});
  const [discoveringRemoteId, setDiscoveringRemoteId] = useState<string | null>(null);
  const [remoteDiscoveryErrors, setRemoteDiscoveryErrors] = useState<Record<string, string>>({});
  const selectedRemoteRepository =
    visibleRemoteRepositories.find((repository) => repository.id === selectedRemoteId) ?? null;
  const linkedRemoteRepository = selectedRemoteRepository
    ? findLocalRepositoryForGitHubRepository(repositories, selectedRemoteRepository)
    : null;

  useGitHubAuthWebview(gitHubDeviceFlow?.verificationUri ?? null);

  useEffect(() => {
    if (gitHubSession) {
      setTokenDraft("");
      setBrowserMode("hybrid");
      persistGitBrowserMode("hybrid");
      persistGitSetupComplete(true);
      if (screen === "auth") {
        setScreen("browser");
      }
    }
  }, [gitHubSession, screen]);

  useEffect(() => {
    if (openGitHubSetupRequest === 0 || gitHubSession) {
      return;
    }

    setBrowserMode("hybrid");
    setScreen("auth");
    persistGitBrowserMode("hybrid");
  }, [gitHubSession, openGitHubSetupRequest]);

  useEffect(() => {
    if (!onToolbarContextChange) {
      return;
    }

    if (screen === "detail") {
      if (detailMode === "local" && selectedRepository?.snapshot) {
        const totalChanges =
          selectedRepository.snapshot.stagedCount +
          selectedRepository.snapshot.changedCount +
          selectedRepository.snapshot.untrackedCount;

        onToolbarContextChange({
          cloneUrl: getRepositoryCloneUrl(selectedRepository.snapshot),
          shellRepositoryId: selectedRepository.id,
          reviewRepositoryId: selectedRepository.id,
          headerEyebrow: "Repository",
          headerTitle: selectedRepository.snapshot.name,
          headerSubtitle: selectedRepository.snapshot.rootPath,
          headerMeta: [],
          onBack: () => setScreen("browser")
        });
        return;
      }

      if (detailMode === "remote" && selectedRemoteRepository) {
        const linkedSnapshot = linkedRemoteRepository?.snapshot ?? null;
        onToolbarContextChange({
          cloneUrl: selectedRemoteRepository.cloneUrl,
          shellRepositoryId: linkedRemoteRepository?.snapshot ? linkedRemoteRepository.id : null,
          reviewRepositoryId: linkedRemoteRepository?.snapshot ? linkedRemoteRepository.id : null,
          headerEyebrow: "Remote repository",
          headerTitle: selectedRemoteRepository.fullName,
          headerSubtitle:
            selectedRemoteRepository.description ||
            (linkedSnapshot
              ? `Connected checkout: ${linkedSnapshot.rootPath}`
              : "Inspect the repository and move it into a local checkout when you want to work on it."),
          headerMeta: [],
          onBack: () => setScreen("browser")
        });
        return;
      }
    }

    onToolbarContextChange({
      cloneUrl: null,
      shellRepositoryId: null,
      reviewRepositoryId: null,
      headerEyebrow: null,
      headerTitle: null,
      headerSubtitle: null,
      headerMeta: [],
      onBack: null
    });
  }, [
    detailMode,
    linkedRemoteRepository,
    onToolbarContextChange,
    screen,
    selectedRemoteRepository,
    selectedRepository
  ]);

  useEffect(() => {
    if (!showRemoteSection || visibleRemoteRepositories.length === 0) {
      setSelectedRemoteId(null);
      return;
    }

    if (
      selectedRemoteId &&
      visibleRemoteRepositories.some((repository) => repository.id === selectedRemoteId)
    ) {
      return;
    }

    setSelectedRemoteId(visibleRemoteRepositories[0]?.id ?? null);
  }, [showRemoteSection, visibleRemoteRepositories, selectedRemoteId]);

  useEffect(() => {
    if (screen !== "detail") {
      return;
    }

    if (detailMode === "local" && selectedRepository) {
      return;
    }

    if (detailMode === "remote" && selectedRemoteRepository) {
      return;
    }

    setScreen("browser");
  }, [detailMode, screen, selectedRemoteRepository, selectedRepository]);

  useEffect(() => {
    if (detailMode !== "remote" || screen !== "detail" || !selectedRemoteRepository) {
      return;
    }

    if (findLocalRepositoryForGitHubRepository(repositories, selectedRemoteRepository)) {
      return;
    }

    const repositoryId = selectedRemoteRepository.id;
    if (repositoryId in discoveredRemoteRepositories || repositoryId in remoteDiscoveryErrors) {
      return;
    }

    let cancelled = false;

    setDiscoveringRemoteId(repositoryId);
    setRemoteDiscoveryErrors((current) => {
      if (!current[repositoryId]) {
        return current;
      }

      const next = { ...current };
      delete next[repositoryId];
      return next;
    });

    void findLocalGitHubCheckouts(selectedRemoteRepository.fullName, selectedRemoteRepository.name)
      .then((matches) => {
        if (cancelled) {
          return;
        }

        setDiscoveredRemoteRepositories((current) => ({
          ...current,
          [repositoryId]: matches
        }));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        setRemoteDiscoveryErrors((current) => ({
          ...current,
          [repositoryId]: message
        }));
      })
      .finally(() => {
        if (!cancelled) {
          setDiscoveringRemoteId((current) => (current === repositoryId ? null : current));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detailMode, discoveredRemoteRepositories, remoteDiscoveryErrors, repositories, screen, selectedRemoteRepository]);

  useEffect(() => {
    if (detailMode !== "remote" || screen !== "detail" || !selectedRemoteRepository) {
      return;
    }

    const linkedRepository = findLocalRepositoryForGitHubRepository(repositories, selectedRemoteRepository);
    if (linkedRepository) {
      return;
    }

    const discovered = discoveredRemoteRepositories[selectedRemoteRepository.id] ?? [];
    if (discovered.length === 1) {
      onPinRepositorySnapshot(discovered[0]);
    }
  }, [detailMode, discoveredRemoteRepositories, onPinRepositorySnapshot, repositories, screen, selectedRemoteRepository]);

  const handleSelectLocalRepository = (repositoryId: string) => {
    setDetailMode("local");
    setScreen("detail");
    persistGitSetupComplete(true);
    onSelectRepository(repositoryId);
  };

  const handleSelectRemoteRepository = (repositoryId: string) => {
    setDetailMode("remote");
    setSelectedRemoteId(repositoryId);
    setScreen("detail");
    persistGitSetupComplete(true);
  };

  const handleSkipToLocal = () => {
    setBrowserMode("localOnly");
    setScreen("browser");
    persistGitBrowserMode("localOnly");
    persistGitSetupComplete(true);
  };

  const handleSubmitGitHubToken = () => {
    const trimmed = tokenDraft.trim();
    if (!trimmed) {
      return;
    }

    onSignInGitHubWithToken(trimmed);
  };

  return (
    <div className="git-page git-page--screened">
      {screen === "auth" ? (
        <GitOnboarding
          deviceFlowAvailable={gitHubDeviceFlowAvailable}
          deviceFlow={gitHubDeviceFlow}
          loading={gitHubLoading}
          onCancelGitHubSignIn={onCancelGitHubSignIn}
          onSkipToLocal={handleSkipToLocal}
          onStartGitHubSignIn={onStartGitHubSignIn}
          onSubmitToken={handleSubmitGitHubToken}
          onTokenChange={setTokenDraft}
          token={tokenDraft}
        />
      ) : screen === "browser" ? (
        <section className="git-browser-screen">
          <div className="git-browser-screen__header">
            <div>
              <p className="eyebrow">Git</p>
              <h1>{showRemoteSection ? "Repositories" : "Local repositories"}</h1>
              <span>
                {showRemoteSection
                  ? "Choose a GitHub or local repository, then open its detail page."
                  : "Choose a local repository. Connect GitHub only if you want account repositories later."}
              </span>
            </div>
          </div>

          <GitRepositoryNavigator
            deviceFlowAvailable={gitHubDeviceFlowAvailable}
            deviceFlow={gitHubDeviceFlow}
            gitHubLoading={gitHubLoading}
            localLoading={loading}
            onAddRepository={onAddRepository}
            onCancelGitHubSignIn={onCancelGitHubSignIn}
            onCopyGitHubCloneUrl={onCopyGitHubCloneUrl}
            onDisconnectGitHub={onDisconnectGitHub}
            onGitHubRepositoryPaneChange={onGitHubRepositoryPaneChange}
            onGitHubSearchQueryChange={onGitHubSearchQueryChange}
            onRefreshGitHubRepositories={onRefreshGitHubRepositories}
            onRefreshRepositories={onRefreshRepositories}
            onRemoveRepository={onRemoveRepository}
            onSearchChange={onSearchChange}
            onSelectLocalRepository={handleSelectLocalRepository}
            onSelectRemoteRepository={handleSelectRemoteRepository}
            onSignInGitHubWithToken={handleSubmitGitHubToken}
            onStartGitHubSignIn={onStartGitHubSignIn}
            repositories={visibleLocalRepositories}
            search={search}
            selectedLocalRepositoryId={selectedRepositoryId}
            selectedRemoteRepositoryId={selectedRemoteId}
            session={gitHubSession}
            showRemoteSection={showRemoteSection}
            gitHubRepositoryPane={gitHubRepositoryPane}
            gitHubRepositories={visibleRemoteRepositories}
            gitHubRepositoryLoading={gitHubRepositoryPane === "search" ? gitHubSearchLoading : gitHubRepositoryLoading}
            gitHubSearchQuery={gitHubSearchQuery}
            onTokenChange={setTokenDraft}
            token={tokenDraft}
          />
        </section>
      ) : (
        <section className="git-page__workspace">
          {detailMode === "local" && selectedRepository ? (
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
                <GitRepositoryDetailView
                  branchName={branchName}
                  busyAction={busyAction}
                  commitMessage={commitMessage}
                  activeSessionCount={getRepositorySessions(tabs, selectedRepository.snapshot.rootPath).length}
                  savedPresetCount={getRepositoryPresets(localSessionPresets, selectedRepository.snapshot.rootPath).length}
                  onBranchNameChange={onBranchNameChange}
                  onCheckoutBranch={onCheckoutBranch}
                  onCommitAll={onCommitAll}
                  onCommitMessageChange={onCommitMessageChange}
                  onCreateBranch={onCreateBranch}
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
              (() => {
                const linkedRepository = findLocalRepositoryForGitHubRepository(repositories, selectedRemoteRepository);
                if (linkedRepository?.snapshot) {
                  return (
                    <GitRepositoryDetailView
                      activeSessionCount={getRepositorySessions(tabs, linkedRepository.snapshot.rootPath).length}
                      branchName={branchName}
                      busyAction={busyAction}
                      commitMessage={commitMessage}
                      context={{
                        mode: "remote",
                        remoteRepository: selectedRemoteRepository
                      }}
                      onBranchNameChange={onBranchNameChange}
                      onCheckoutBranch={onCheckoutBranch}
                      onCommitAll={onCommitAll}
                      onCommitMessageChange={onCommitMessageChange}
                      onCreateBranch={onCreateBranch}
                      onPublish={onPublish}
                      repository={linkedRepository}
                      savedPresetCount={getRepositoryPresets(localSessionPresets, linkedRepository.snapshot.rootPath).length}
                    />
                  );
                }

                return (
                  <GitRemoteRepositoryEmptyView
                    busyAction={busyAction}
                    discoveredRepositories={discoveredRemoteRepositories[selectedRemoteRepository.id] ?? []}
                    discoveringLocalCheckouts={discoveringRemoteId === selectedRemoteRepository.id}
                    localDiscoveryError={remoteDiscoveryErrors[selectedRemoteRepository.id] ?? null}
                    onAddRepository={onAddRepository}
                    onCloneRepository={onCloneRepository}
                    onCopyCloneUrl={onCopyGitHubCloneUrl}
                    onPinRepositorySnapshot={onPinRepositorySnapshot}
                    repository={selectedRemoteRepository}
                    session={gitHubSession}
                  />
                );
              })()
          ) : (
            <div className="git-page__state git-page__state--wide">
                <span className="git-page__state-icon">
                  <FolderGit2 size={18} />
                </span>
                <div className="git-page__state-body">
                  <strong>Select a repository</strong>
                  <span>Pick a GitHub or local repository from the navigator to open its details here.</span>
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

type GitOnboardingProps = {
  deviceFlowAvailable: boolean;
  deviceFlow: GitHubDeviceFlowRecord | null;
  loading: boolean;
  onStartGitHubSignIn: () => void;
  onCancelGitHubSignIn: () => void;
  onSubmitToken: () => void;
  onSkipToLocal: () => void;
  onTokenChange: (value: string) => void;
  token: string;
};

function GitOnboarding({
  deviceFlowAvailable,
  deviceFlow,
  loading,
  onStartGitHubSignIn,
  onCancelGitHubSignIn,
  onSubmitToken,
  onSkipToLocal,
  onTokenChange,
  token
}: GitOnboardingProps) {
  return (
    <section className="git-onboarding">
      <div className="git-onboarding__hero">
        <p className="eyebrow">Git</p>
        <h1>Connect once. Everything else stays inside Hermes.</h1>
        <span>
          Use a GitHub token for account repositories, or skip directly to local repositories. This setup
          screen only appears once.
        </span>
      </div>

      <div className="git-onboarding__grid">
        <article className="git-onboarding__card git-onboarding__card--primary">
          <div className="git-onboarding__card-header">
            <span className="git-onboarding__card-icon">
              <ShieldCheck size={16} />
            </span>
            <div>
              <p className="eyebrow">GitHub</p>
              <h2>Connect with a personal access token</h2>
            </div>
          </div>
          <span className="git-onboarding__card-copy">
            Hermes stores the token in the OS keychain and uses it for your repositories and private repo
            access.
          </span>
          <label className="field field--full">
            <span>GitHub token</span>
            <input
              onChange={(event) => onTokenChange(event.target.value)}
              placeholder="github_pat_... or ghp_..."
              type="password"
              value={token}
            />
          </label>
          <div className="git-onboarding__card-actions">
            <button
              className="primary-button"
              disabled={loading || token.trim().length === 0}
              onClick={onSubmitToken}
              type="button"
            >
              <KeyRound size={14} />
              {loading ? "Connecting..." : "Connect GitHub"}
            </button>
            {deviceFlowAvailable ? (
              <button className="ghost-button" disabled={loading} onClick={onStartGitHubSignIn} type="button">
                <Github size={14} />
                Browser sign-in
              </button>
            ) : null}
          </div>
          {deviceFlow ? (
            <div className="git-onboarding__device">
              <div className="git-onboarding__device-code">{deviceFlow.userCode}</div>
              <div className="git-onboarding__device-copy">
                <strong>Approve GitHub sign-in inside Hermes</strong>
                <span>Enter this code in the GitHub page that just opened in-app.</span>
              </div>
              <button className="ghost-button" onClick={onCancelGitHubSignIn} type="button">
                Cancel
              </button>
            </div>
          ) : null}
        </article>

        <article className="git-onboarding__card">
          <div className="git-onboarding__card-header">
            <span className="git-onboarding__card-icon">
              <FolderGit2 size={16} />
            </span>
            <div>
              <p className="eyebrow">Local</p>
              <h2>Skip GitHub for now</h2>
            </div>
          </div>
          <span className="git-onboarding__card-copy">
            Pin a repository from disk and go straight into commit, branch, publish, and review.
          </span>
          <div className="git-onboarding__steps">
            <article className="git-onboarding__step git-onboarding__step--active">
              <strong>1. Connect</strong>
              <span>Token sign-in is optional.</span>
            </article>
            <article className="git-onboarding__step">
              <strong>2. Choose</strong>
              <span>Pick a local or GitHub repository.</span>
            </article>
            <article className="git-onboarding__step">
              <strong>3. Work</strong>
              <span>Stay on one stable repository screen.</span>
            </article>
          </div>
          <div className="git-onboarding__card-actions">
            <button className="ghost-button" onClick={onSkipToLocal} type="button">
              <Plus size={14} />
              Skip to local repo
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}

type GitRepositoryNavigatorProps = {
  session: GitHubAuthSession | null;
  deviceFlowAvailable: boolean;
  deviceFlow: GitHubDeviceFlowRecord | null;
  showRemoteSection: boolean;
  repositories: GitRepositoryView[];
  selectedLocalRepositoryId: string | null;
  selectedRemoteRepositoryId: string | null;
  search: string;
  localLoading: boolean;
  gitHubLoading: boolean;
  gitHubRepositoryPane: "personal" | "orgs" | "search";
  gitHubRepositories: GitHubRepositoryRecord[];
  gitHubRepositoryLoading: boolean;
  gitHubSearchQuery: string;
  onSearchChange: (value: string) => void;
  onSignInGitHubWithToken: () => void;
  onStartGitHubSignIn: () => void;
  onCancelGitHubSignIn: () => void;
  onDisconnectGitHub: () => void;
  onRefreshGitHubRepositories: () => void;
  onGitHubRepositoryPaneChange: (pane: "personal" | "orgs" | "search") => void;
  onGitHubSearchQueryChange: (value: string) => void;
  onCopyGitHubCloneUrl: (cloneUrl: string) => void;
  onSelectRemoteRepository: (repositoryId: string) => void;
  onTokenChange: (value: string) => void;
  onAddRepository: () => void;
  onRefreshRepositories: () => void;
  onRemoveRepository: (repositoryId: string) => void;
  onSelectLocalRepository: (repositoryId: string) => void;
  token: string;
};

function GitRepositoryNavigator({
  session,
  showRemoteSection,
  repositories,
  selectedLocalRepositoryId,
  selectedRemoteRepositoryId,
  search,
  gitHubRepositoryPane,
  gitHubRepositories,
  gitHubRepositoryLoading,
  gitHubSearchQuery,
  onSearchChange,
  onGitHubRepositoryPaneChange,
  onGitHubSearchQueryChange,
  onCopyGitHubCloneUrl,
  onSelectRemoteRepository,
  onRemoveRepository,
  onSelectLocalRepository
}: GitRepositoryNavigatorProps) {
  const showSearch = gitHubRepositoryPane === "search";
  const ownedLabel = gitHubRepositoryPane === "orgs" ? "organization repositories" : "personal repositories";

  return (
    <div className={`git-nav ${showRemoteSection ? "git-nav--split" : "git-nav--local"}`}>
      {showRemoteSection ? (
        <section className="git-nav__section">
          <div className="git-nav__header">
            <div className="git-nav__title">
              <p className="eyebrow">GitHub</p>
              <h2>GitHub repositories</h2>
              <span>Browse your connected repositories or switch to public search.</span>
            </div>
            {session ? (
              <div className="git-nav__account">
                <UserRound size={14} />
                <span>@{session.login}</span>
              </div>
            ) : null}
          </div>

          <div className="git-nav__toolbar">
            <div className="git-nav__tabs">
              <button
                className={`git-remote__tab ${gitHubRepositoryPane === "personal" ? "git-remote__tab--active" : ""}`}
                onClick={() => onGitHubRepositoryPaneChange("personal")}
                type="button"
              >
                <HardDriveDownload size={13} />
                Personal
              </button>
              <button
                className={`git-remote__tab ${gitHubRepositoryPane === "orgs" ? "git-remote__tab--active" : ""}`}
                onClick={() => onGitHubRepositoryPaneChange("orgs")}
                type="button"
              >
                <UserRound size={13} />
                Orgs
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
          </div>

          {showSearch ? (
            <div className="git-search-surface">
              <div className="git-search-surface__header">
                <div>
                  <p className="eyebrow">Search</p>
                  <h3>Public repositories</h3>
                  <span>Search GitHub by owner, repo, or topic without leaving Hermes.</span>
                </div>
              </div>
              <label className="dashboard-search git-page__search git-nav__search git-search-surface__search">
                <Search size={14} />
                <input
                  onChange={(event) => onGitHubSearchQueryChange(event.target.value)}
                  placeholder="Search public repositories"
                  value={gitHubSearchQuery}
                />
              </label>

              <div className="git-nav__list git-nav__list--github">
                {gitHubRepositoryLoading ? (
                  <div className="git-nav__empty">
                    <strong>Searching GitHub</strong>
                    <span>GitHub is responding.</span>
                  </div>
                ) : gitHubSearchQuery.trim().length === 0 ? (
                  <div className="git-nav__empty git-nav__empty--accent">
                    <strong>Search public repositories</strong>
                    <span>Type an owner, repo name, or topic to browse GitHub without signing in.</span>
                  </div>
                ) : gitHubRepositories.length === 0 ? (
                  <div className="git-nav__empty">
                    <strong>No search results</strong>
                    <span>Try a broader search term or connect GitHub for account repositories.</span>
                  </div>
                ) : (
                  gitHubRepositories.map((repository) => (
                    <div
                      className={`git-nav-item ${repository.id === selectedRemoteRepositoryId ? "git-nav-item--active" : ""}`}
                      key={repository.id}
                    >
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
            </div>
          ) : (
            <div className="git-nav__list git-nav__list--github">
              {gitHubRepositoryLoading ? (
                <div className="git-nav__empty">
                  <strong>Loading repositories</strong>
                  <span>GitHub is responding.</span>
                </div>
              ) : gitHubRepositories.length === 0 ? (
                <div className="git-nav__empty">
                  <strong>{`No ${ownedLabel} yet`}</strong>
                  <span>{`This account did not return any ${ownedLabel}.`}</span>
                </div>
              ) : (
                gitHubRepositories.map((repository) => (
                  <div
                    className={`git-nav-item ${repository.id === selectedRemoteRepositoryId ? "git-nav-item--active" : ""}`}
                    key={repository.id}
                  >
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
          )}
        </section>
      ) : null}

      <section className="git-nav__section">
        <div className="git-nav__header">
          <div className="git-nav__title">
            <p className="eyebrow">Local</p>
            <h2>Local repositories</h2>
              <span>Choose a pinned checkout to open the full repository surface.</span>
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
        </div>

        <div className="git-nav__list">
          {repositories.length === 0 ? (
            <div className="git-nav__empty">
              <strong>No local checkout pinned</strong>
              <span>Use Pin checkout in the Git toolbar to open commit, branch, publish, and review details.</span>
            </div>
          ) : (
            repositories.map((repository) => {
              const snapshot = repository.snapshot;
              const changesCount =
                (snapshot?.stagedCount ?? 0) + (snapshot?.changedCount ?? 0) + (snapshot?.untrackedCount ?? 0);

              return (
                <div
                  className={`git-nav-item ${repository.id === selectedLocalRepositoryId ? "git-nav-item--active" : ""}`}
                  key={repository.id}
                >
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
  );
}

function matchesRepositorySearch(repository: GitRepositoryView, search: string) {
  const query = search.trim().toLowerCase();
  if (!query) {
    return true;
  }

  const snapshot = repository.snapshot;
  const haystack = [
    repository.name,
    repository.path,
    snapshot?.branch ?? "",
    snapshot?.upstream ?? "",
    snapshot?.remoteName ?? "",
    ...(snapshot?.remotes.flatMap((remote) => [remote.name, remote.fetchUrl, remote.pushUrl]) ?? []),
    ...(snapshot?.changes.map((change) => change.path) ?? []),
    ...(snapshot?.recentCommits.map((commit) => commit.summary) ?? [])
  ];

  return haystack.some((value) => value.toLowerCase().includes(query));
}

function getRepositoryPendingChangeCount(snapshot: GitRepositoryRecord) {
  return snapshot.stagedCount + snapshot.changedCount + snapshot.untrackedCount + snapshot.conflictedCount;
}

function findLocalRepositoryForGitHubRepository(
  repositories: GitRepositoryView[],
  repository: GitHubRepositoryRecord
) {
  return (
    repositories.find((candidate) => {
      const snapshot = candidate.snapshot;
      if (!snapshot) {
        return false;
      }

      return snapshot.remotes.some((remote) =>
        [remote.fetchUrl, remote.pushUrl].some(
          (value) => normalizeGitHubRepositorySlug(value) === repository.fullName.toLowerCase()
        )
      );
    }) ?? null
  );
}

function getRepositorySessions(tabs: TerminalTab[], rootPath: string) {
  return tabs.filter(
    (tab) =>
      tab.serverId === "__local__" &&
      Boolean(tab.cwd) &&
      pathStartsWith(tab.cwd ?? "", rootPath)
  );
}

function getRepositoryPresets(
  presets: Array<{
    id: string;
    name: string;
    path: string;
  }>,
  rootPath: string
) {
  return presets.filter((preset) => pathStartsWith(preset.path, rootPath));
}

function pathStartsWith(candidatePath: string, rootPath: string) {
  const normalizedCandidate = normalizePath(candidatePath);
  const normalizedRoot = normalizePath(rootPath);

  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}/`)
  );
}

function normalizePath(value: string) {
  return value.trim().replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
}

function normalizeGitHubRepositorySlug(value: string) {
  const normalized = value.trim().replace(/\.git$/i, "");
  const sshMatch = normalized.match(/github\.com[:/]([^/]+\/[^/]+)$/i);
  if (sshMatch) {
    return sshMatch[1].toLowerCase();
  }

  const httpMatch = normalized.match(/github\.com\/([^/]+\/[^/]+)$/i);
  return httpMatch ? httpMatch[1].toLowerCase() : "";
}

function getRepositoryCloneUrl(repository: GitRepositoryRecord) {
  const preferredRemote =
    repository.remotes.find((remote) => remote.name === repository.remoteName) ?? repository.remotes[0] ?? null;

  return preferredRemote?.pushUrl || preferredRemote?.fetchUrl || null;
}


function loadGitSetupComplete() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(GIT_SETUP_COMPLETE_KEY) === "1";
}

function persistGitSetupComplete(value: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  if (value) {
    window.localStorage.setItem(GIT_SETUP_COMPLETE_KEY, "1");
    return;
  }

  window.localStorage.removeItem(GIT_SETUP_COMPLETE_KEY);
}

function loadGitBrowserMode(): GitBrowserMode {
  if (typeof window === "undefined") {
    return "hybrid";
  }

  return window.localStorage.getItem(GIT_BROWSER_MODE_KEY) === "localOnly" ? "localOnly" : "hybrid";
}

function persistGitBrowserMode(mode: GitBrowserMode) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(GIT_BROWSER_MODE_KEY, mode);
}
