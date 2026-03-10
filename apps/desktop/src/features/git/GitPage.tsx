import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
  GitFileChangeRecord,
  GitRepositoryRecord,
  TerminalTab
} from "@hermes/core";
import { findLocalGitHubCheckouts, getGitRepositoryChangeDiff } from "@hermes/db";
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
          headerMeta: [
            selectedRepository.snapshot.branch,
            selectedRepository.snapshot.upstream ?? selectedRepository.snapshot.remoteName ?? "No remote",
            selectedRepository.snapshot.clean ? "Clean working tree" : `${totalChanges} local changes`
          ],
          onBack: () => setScreen("browser")
        });
        return;
      }

      if (detailMode === "remote" && selectedRemoteRepository) {
        const headerMeta = linkedRemoteRepository?.snapshot
          ? [
              "Local checkout connected",
              linkedRemoteRepository.snapshot.rootPath,
              selectedRemoteRepository.private ? "Private" : "Public",
              `${selectedRemoteRepository.stargazerCount} stars`,
              selectedRemoteRepository.defaultBranch
            ]
          : [
              selectedRemoteRepository.private ? "Private" : "Public",
              `${selectedRemoteRepository.stargazerCount} stars`,
              selectedRemoteRepository.defaultBranch,
              selectedRemoteRepository.ownerLogin
            ];

        onToolbarContextChange({
          cloneUrl: selectedRemoteRepository.cloneUrl,
          shellRepositoryId: linkedRemoteRepository?.snapshot ? linkedRemoteRepository.id : null,
          reviewRepositoryId: linkedRemoteRepository?.snapshot ? linkedRemoteRepository.id : null,
          headerEyebrow: "Remote repository",
          headerTitle: selectedRemoteRepository.fullName,
          headerSubtitle:
            selectedRemoteRepository.description ||
            (linkedRemoteRepository?.snapshot
              ? "Local checkout detected. Commit, branch, and publish from here."
              : "Inspect the repository and move it into a local checkout when you want to work on it."),
          headerMeta,
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
                <GitRepositoryDetail
                  branchName={branchName}
                  busyAction={busyAction}
                  commitMessage={commitMessage}
                  activeLocalSessions={getRepositorySessions(tabs, selectedRepository.snapshot.rootPath)}
                  savedLocalPresets={getRepositoryPresets(localSessionPresets, selectedRepository.snapshot.rootPath)}
                  onLaunchLocalPreset={onLaunchLocalPreset}
                  onBranchNameChange={onBranchNameChange}
                  onCheckoutBranch={onCheckoutBranch}
                  onCommitAll={onCommitAll}
                  onCommitMessageChange={onCommitMessageChange}
                  onCreateBranch={onCreateBranch}
                  onOpenRepositoryShell={onOpenRepositoryShell}
                  onOpenTerminalSession={onOpenTerminalSession}
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
                busyAction={busyAction}
                discoveredRepositories={discoveredRemoteRepositories[selectedRemoteRepository.id] ?? []}
                discoveringLocalCheckouts={discoveringRemoteId === selectedRemoteRepository.id}
                localSessionPresets={localSessionPresets}
                localDiscoveryError={remoteDiscoveryErrors[selectedRemoteRepository.id] ?? null}
                onCloneRepository={onCloneRepository}
                onAddRepository={onAddRepository}
                onCopyCloneUrl={onCopyGitHubCloneUrl}
                onLaunchLocalPreset={onLaunchLocalPreset}
                onOpenRepositoryShell={onOpenRepositoryShell}
                onOpenTerminalSession={onOpenTerminalSession}
                onPinRepositorySnapshot={onPinRepositorySnapshot}
                onPublish={onPublish}
                repository={selectedRemoteRepository}
                repositories={repositories}
                session={gitHubSession}
                tabs={tabs}
                branchName={branchName}
                commitMessage={commitMessage}
                onBranchNameChange={onBranchNameChange}
                onCheckoutBranch={onCheckoutBranch}
                onCommitAll={onCommitAll}
                onCommitMessageChange={onCommitMessageChange}
                onCreateBranch={onCreateBranch}
              />
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

function GitRemoteRepositoryDetail({
  repository,
  repositories,
  tabs,
  discoveredRepositories,
  discoveringLocalCheckouts,
  localSessionPresets,
  session,
  busyAction,
  localDiscoveryError,
  onCopyCloneUrl,
  onCloneRepository,
  onAddRepository,
  onOpenRepositoryShell,
  onOpenTerminalSession,
  onLaunchLocalPreset,
  onPinRepositorySnapshot,
  commitMessage,
  branchName,
  onCommitMessageChange,
  onCommitAll,
  onBranchNameChange,
  onCreateBranch,
  onCheckoutBranch,
  onPublish
}: {
  repository: GitHubRepositoryRecord;
  repositories: GitRepositoryView[];
  tabs: TerminalTab[];
  discoveredRepositories: GitRepositoryRecord[];
  discoveringLocalCheckouts: boolean;
  localSessionPresets: Array<{
    id: string;
    name: string;
    path: string;
  }>;
  session: GitHubAuthSession | null;
  busyAction: string | null;
  localDiscoveryError: string | null;
  onCopyCloneUrl: (cloneUrl: string) => void;
  onCloneRepository: (repository: GitHubRepositoryRecord) => void;
  onAddRepository: () => void;
  onOpenRepositoryShell: (repositoryId: string) => void;
  onOpenTerminalSession: (tabId: string) => void;
  onLaunchLocalPreset: (presetId: string) => void;
  onPinRepositorySnapshot: (snapshot: GitRepositoryRecord) => void;
  commitMessage: string;
  branchName: string;
  onCommitMessageChange: (value: string) => void;
  onCommitAll: (repositoryId: string) => void;
  onBranchNameChange: (value: string) => void;
  onCreateBranch: (repositoryId: string) => void;
  onCheckoutBranch: (repositoryId: string, branchName: string) => void;
  onPublish: (repositoryId: string) => void;
}) {
  const linkedRepository = findLocalRepositoryForGitHubRepository(repositories, repository);
  const isCloneBusy = busyAction === `clone:${repository.id}`;
  const discoveredLocalRepositories = discoveredRepositories.filter(
    (candidate) => !repositories.some((repositoryView) => repositoryView.path === candidate.rootPath)
  );

  if (linkedRepository?.snapshot) {
    return (
      <div className="git-detail git-detail--remote">
        <GitRepositoryDetail
          activeLocalSessions={getRepositorySessions(tabs, linkedRepository.snapshot.rootPath)}
          branchName={branchName}
          busyAction={busyAction}
          commitMessage={commitMessage}
          onBranchNameChange={onBranchNameChange}
          onCheckoutBranch={onCheckoutBranch}
          onCommitAll={onCommitAll}
          onCommitMessageChange={onCommitMessageChange}
          onCreateBranch={onCreateBranch}
          onLaunchLocalPreset={onLaunchLocalPreset}
          onOpenRepositoryShell={onOpenRepositoryShell}
          onOpenTerminalSession={onOpenTerminalSession}
          onPublish={onPublish}
          repository={linkedRepository}
          savedLocalPresets={getRepositoryPresets(localSessionPresets, linkedRepository.snapshot.rootPath)}
        />
      </div>
    );
  }

  return (
    <div className="git-detail git-detail--remote">
      <div className="git-remote-detail">
        <section className="git-remote-detail__primary">
          <article className="git-remote-callout">
            <div className="git-remote-callout__header">
              <div>
                <p className="eyebrow">Local checkout</p>
                <h3>
                  {discoveringLocalCheckouts
                    ? "Scanning common folders for a checkout"
                    : discoveredLocalRepositories.length > 0
                      ? "Hermes found local checkout candidates"
                      : "Clone or attach this repository"}
                </h3>
              </div>
              <span className="git-page__meta">
                {discoveringLocalCheckouts
                  ? "Scanning"
                  : discoveredLocalRepositories.length > 0
                    ? `${discoveredLocalRepositories.length} found`
                    : "Not detected"}
              </span>
            </div>

            <div className="git-remote-callout__body">
              <strong>
                {discoveringLocalCheckouts
                  ? "Searching your common workspace folders."
                  : discoveredLocalRepositories.length > 0
                    ? "Choose one of the local checkouts Hermes found."
                    : "This repository is not connected locally yet."}
              </strong>
              <span>
                {discoveringLocalCheckouts
                  ? "Hermes checks your current directory, Documents, Desktop, code, dev, and repo folders for matching Git remotes."
                  : discoveredLocalRepositories.length > 0
                    ? "A single match will be pinned automatically. If there are multiple matches, pick the one you want in Hermes."
                    : `Clone ${repository.fullName} from here, or use Pin checkout in the Git toolbar.`}
              </span>
            </div>

            <div className="git-remote-callout__actions">
              <button
                className="primary-button"
                disabled={isCloneBusy}
                onClick={() => onCloneRepository(repository)}
                type="button"
              >
                <HardDriveDownload size={14} />
                {isCloneBusy ? "Cloning..." : "Clone this repository"}
              </button>
            </div>
          </article>

          {localDiscoveryError ? (
            <section className="git-panel">
              <div className="git-panel__empty">
                <strong>Local checkout scan failed</strong>
                <span>{localDiscoveryError}</span>
              </div>
            </section>
          ) : null}

          {discoveredLocalRepositories.length > 0 ? (
            <section className="git-panel">
              <div className="git-panel__header">
                <div>
                  <p className="eyebrow">Discovered</p>
                  <h3>Local checkout candidates</h3>
                </div>
                <span className="git-page__meta">
                  {discoveredLocalRepositories.length} path
                  {discoveredLocalRepositories.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="git-discovery-list">
                {discoveredLocalRepositories.map((checkout) => (
                  <div className="git-discovery-row" key={checkout.rootPath}>
                    <div className="git-discovery-row__body">
                      <strong>{checkout.name}</strong>
                      <span>{checkout.rootPath}</span>
                      <span>
                        {checkout.branch}
                        {checkout.upstream ? ` -> ${checkout.upstream}` : ""}
                      </span>
                    </div>
                    <button
                      className="ghost-button"
                      onClick={() => onPinRepositorySnapshot(checkout)}
                      type="button"
                    >
                      Pin checkout
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </section>

        <aside className="git-remote-detail__aside">
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
        </aside>
      </div>
    </div>
  );
}

type GitRepositoryDetailProps = {
  repository: GitRepositoryView;
  activeLocalSessions: TerminalTab[];
  savedLocalPresets: Array<{
    id: string;
    name: string;
    path: string;
  }>;
  commitMessage: string;
  branchName: string;
  busyAction: string | null;
  onOpenRepositoryShell: (repositoryId: string) => void;
  onOpenTerminalSession: (tabId: string) => void;
  onLaunchLocalPreset: (presetId: string) => void;
  onCommitMessageChange: (value: string) => void;
  onCommitAll: (repositoryId: string) => void;
  onBranchNameChange: (value: string) => void;
  onCreateBranch: (repositoryId: string) => void;
  onCheckoutBranch: (repositoryId: string, branchName: string) => void;
  onPublish: (repositoryId: string) => void;
};

function GitRepositoryDetail({
  repository,
  activeLocalSessions,
  savedLocalPresets,
  commitMessage,
  branchName,
  busyAction,
  onOpenRepositoryShell,
  onOpenTerminalSession,
  onLaunchLocalPreset,
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
  const [selectedChangeKey, setSelectedChangeKey] = useState<string | null>(() =>
    snapshot.changes[0] ? getGitChangeKey(snapshot.changes[0]) : null
  );
  const [selectedBranchName, setSelectedBranchName] = useState<string>(() => {
    const currentBranch = snapshot.branches.find((branch) => branch.current);
    return currentBranch?.name ?? snapshot.branches[0]?.name ?? "";
  });
  const [selectedDiff, setSelectedDiff] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  useEffect(() => {
    const firstChangeKey = snapshot.changes[0] ? getGitChangeKey(snapshot.changes[0]) : null;
    setSelectedChangeKey((current) =>
      current && snapshot.changes.some((change) => getGitChangeKey(change) === current) ? current : firstChangeKey
    );
  }, [repository.id, snapshot.changes]);

  const selectedChange =
    snapshot.changes.find((change) => getGitChangeKey(change) === selectedChangeKey) ?? snapshot.changes[0] ?? null;
  const selectedBranch =
    snapshot.branches.find((branch) => branch.name === selectedBranchName) ?? snapshot.branches[0] ?? null;

  useEffect(() => {
    const currentBranch = snapshot.branches.find((branch) => branch.current);
    const fallback = currentBranch?.name ?? snapshot.branches[0]?.name ?? "";
    setSelectedBranchName((current) =>
      current && snapshot.branches.some((branch) => branch.name === current) ? current : fallback
    );
  }, [snapshot.branches]);

  useEffect(() => {
    if (!selectedChange) {
      setSelectedDiff("");
      setDiffError(null);
      setDiffLoading(false);
      return;
    }

    let cancelled = false;
    setDiffLoading(true);
    setDiffError(null);

    void getGitRepositoryChangeDiff(snapshot.rootPath, selectedChange.path)
      .then((diff) => {
        if (!cancelled) {
          setSelectedDiff(diff);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSelectedDiff("");
          setDiffError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDiffLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedChange, snapshot.rootPath]);

  return (
    <div className="git-detail">
      <div className="git-detail__body">
        <section className="git-workbench" aria-label="Repository workbench">
          <section className="git-workbench__section git-workbench__section--commit">
            <div className="git-workbench__header">
              <div>
                <p className="eyebrow">Commit</p>
                <h3>Commit changes</h3>
              </div>
            </div>
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
          </section>

          <section className="git-workbench__section git-workbench__section--branch">
            <div className="git-workbench__header">
              <div>
                <p className="eyebrow">Branch</p>
                <h3>Create branch</h3>
              </div>
            </div>
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
          </section>

          <section className="git-workbench__section git-workbench__section--publish">
            <div className="git-workbench__header">
              <div>
                <p className="eyebrow">Publish</p>
                <h3>Push branch</h3>
              </div>
            </div>
            <div className="git-workbench__meta">
              <span className="git-pill">{snapshot.upstream ?? snapshot.remoteName ?? "No remote"}</span>
              {snapshot.ahead > 0 ? <span className="git-pill">{snapshot.ahead} ahead</span> : null}
              {snapshot.behind > 0 ? <span className="git-pill">{snapshot.behind} behind</span> : null}
            </div>
            <button
              className="primary-button"
              disabled={!snapshot.hasRemote || isPublishBusy}
              onClick={() => onPublish(repository.id)}
              type="button"
            >
              <ArrowUpRight size={14} />
              {isPublishBusy ? "Publishing..." : "Publish"}
            </button>
          </section>

          <section className="git-workbench__section git-workbench__section--review">
            <div className="git-workbench__header">
              <div>
                <p className="eyebrow">Review</p>
                <h3>Review draft</h3>
              </div>
            </div>
            {snapshot.review ? (
              <div className="git-review git-review--compact">
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
                <strong>No review draft</strong>
                <span>Create or switch to a feature branch to start one.</span>
              </div>
            )}
          </section>

          <section className="git-workbench__section git-workbench__section--branches">
            <div className="git-workbench__header">
              <div>
                <p className="eyebrow">Branches</p>
                <h3>Switch branch</h3>
              </div>
            </div>
            <div className="git-workbench__branch-control">
              <label className="field field--full">
                <span>Choose branch</span>
                <select onChange={(event) => setSelectedBranchName(event.target.value)} value={selectedBranchName}>
                  {snapshot.branches.map((branch) => (
                    <option key={branch.name} value={branch.name}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="git-workbench__branch-meta">
                <span className="git-pill git-pill--active">
                  <GitBranch size={12} />
                  {snapshot.branch}
                </span>
                <span className="git-page__meta">{selectedBranch?.upstream ?? "No upstream branch"}</span>
              </div>
              <button
                className="ghost-button"
                disabled={
                  !selectedBranch ||
                  selectedBranch.current ||
                  busyAction === `checkout:${repository.id}:${selectedBranch.name}`
                }
                onClick={() => selectedBranch && onCheckoutBranch(repository.id, selectedBranch.name)}
                type="button"
              >
                {selectedBranch && busyAction === `checkout:${repository.id}:${selectedBranch.name}`
                  ? "Switching..."
                  : selectedBranch?.current
                    ? "Checked out"
                    : "Checkout"}
              </button>
            </div>
          </section>

          <section className="git-workbench__section git-workbench__section--history">
            <div className="git-workbench__header">
              <div>
                <p className="eyebrow">History</p>
                <h3>Recent</h3>
              </div>
            </div>
            {snapshot.recentCommits.length === 0 ? (
              <div className="git-panel__empty">
                <strong>No commit history</strong>
                <span>This repository has not recorded any commits yet.</span>
              </div>
            ) : (
              <div className="git-commit-list git-commit-list--compact">
                {snapshot.recentCommits.slice(0, 2).map((commit) => (
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
        </section>

        <div className="git-detail__inspector">
          <section className="git-panel git-panel--changes-nav">
            <div className="git-panel__header">
              <div>
                <p className="eyebrow">Changes</p>
                <h3>Files</h3>
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
                  <button
                    className={`git-change-row git-change-row--selectable ${
                      selectedChange && getGitChangeKey(change) === getGitChangeKey(selectedChange)
                        ? "git-change-row--active"
                        : ""
                    }`}
                    key={`${change.path}:${change.status}:${change.staged ? "staged" : "unstaged"}`}
                    onClick={() => setSelectedChangeKey(getGitChangeKey(change))}
                    type="button"
                  >
                    <span className={`git-pill git-pill--status git-pill--${change.status}`}>{change.status}</span>
                    <div className="git-change-row__body">
                      <strong>{change.path}</strong>
                      <span>{getGitChangeSummary(change)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="git-panel git-panel--diff">
            <div className="git-panel__header">
              <div>
                <p className="eyebrow">Diff</p>
                <h3>{selectedChange ? selectedChange.path : "Select a file"}</h3>
              </div>
              {selectedChange ? (
                <span className="git-page__meta">
                  {selectedChange.staged ? "Staged + working tree" : "Working tree"}
                </span>
              ) : null}
            </div>

            <GitDiffPreview change={selectedChange} diff={selectedDiff} error={diffError} loading={diffLoading} />
          </section>
        </div>
      </div>
    </div>
  );
}

const GIT_DIFF_ROW_HEIGHT = 25;
const GIT_DIFF_OVERSCAN = 40;

const GitDiffPreview = memo(function GitDiffPreview({
  change,
  diff,
  error,
  loading
}: {
  change: GitFileChangeRecord | null;
  diff: string;
  error: string | null;
  loading: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(520);
  const deferredDiff = useDeferredValue(diff);
  const rows = useMemo(() => buildGitDiffRows(deferredDiff), [deferredDiff]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const updateViewport = () => {
      setViewportHeight(viewport.clientHeight);
    };

    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTop = 0;
    setScrollTop(0);
  }, [change?.path]);

  if (!change) {
    return (
      <div className="git-panel__empty">
        <strong>Select a file</strong>
        <span>Choose a changed file to inspect its diff here.</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="git-panel__empty">
        <strong>Loading diff</strong>
        <span>Hermes is reading the current patch for {change.path}.</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="git-panel__empty">
        <strong>Diff unavailable</strong>
        <span>{error}</span>
      </div>
    );
  }

  if (!diff.trim()) {
    return (
      <div className="git-panel__empty">
        <strong>No diff output</strong>
        <span>The selected file did not return any patch content.</span>
      </div>
    );
  }

  const visibleCount = Math.max(1, Math.ceil(viewportHeight / GIT_DIFF_ROW_HEIGHT) + GIT_DIFF_OVERSCAN * 2);
  const startIndex = Math.max(0, Math.floor(scrollTop / GIT_DIFF_ROW_HEIGHT) - GIT_DIFF_OVERSCAN);
  const endIndex = Math.min(rows.length, startIndex + visibleCount);
  const visibleRows = rows.slice(startIndex, endIndex);
  const topSpacerHeight = startIndex * GIT_DIFF_ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (rows.length - endIndex) * GIT_DIFF_ROW_HEIGHT);

  return (
    <div
      className="git-diff-view git-diff-view--split"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      ref={viewportRef}
    >
      <div className="git-diff-split__header">
        <span>Before</span>
        <span>After</span>
      </div>
      <div className="git-diff-split__body">
        {topSpacerHeight > 0 ? <div className="git-diff-split__spacer" style={{ height: topSpacerHeight }} /> : null}
        {visibleRows.map((row, index) => (
          <div
            className={`git-diff-split__row git-diff-split__row--${row.kind}`}
            key={`${startIndex + index}:${row.key}`}
          >
            <div className="git-diff-split__cell git-diff-split__cell--line">{row.leftNumber ?? ""}</div>
            <div className={`git-diff-split__cell git-diff-split__cell--code ${row.leftClassName}`}>
              {row.leftText || " "}
            </div>
            <div className="git-diff-split__cell git-diff-split__cell--line">{row.rightNumber ?? ""}</div>
            <div className={`git-diff-split__cell git-diff-split__cell--code ${row.rightClassName}`}>
              {row.rightText || " "}
            </div>
          </div>
        ))}
        {bottomSpacerHeight > 0 ? <div className="git-diff-split__spacer" style={{ height: bottomSpacerHeight }} /> : null}
      </div>
    </div>
  );
});

function GitRepositorySessionsPanel({
  activeSessions,
  presets,
  onOpenRepositoryShell,
  onOpenTerminalSession,
  onLaunchLocalPreset
}: {
  activeSessions: TerminalTab[];
  presets: Array<{
    id: string;
    name: string;
    path: string;
  }>;
  onOpenRepositoryShell: () => void;
  onOpenTerminalSession: (tabId: string) => void;
  onLaunchLocalPreset: (presetId: string) => void;
}) {
  return (
    <div className="git-session-stack">
      {activeSessions.length === 0 && presets.length === 0 ? (
        <div className="git-panel__empty">
          <strong>No local sessions yet</strong>
          <span>Open a shell from this repository page or save a local path for quick access.</span>
          <button className="ghost-button" onClick={onOpenRepositoryShell} type="button">
            <TerminalSquare size={14} />
            Open shell
          </button>
        </div>
      ) : (
        <>
          {activeSessions.length > 0 ? (
            <div className="git-session-group">
              <div className="git-session-group__header">
                <span className="git-page__meta">
                  {activeSessions.length} live shell{activeSessions.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="git-session-list">
                {activeSessions.map((session) => (
                  <div className="git-session-row" key={session.id}>
                    <div className="git-session-row__body">
                      <strong>{session.title}</strong>
                      <span>{session.cwd ?? "Local terminal"}</span>
                    </div>
                    <button className="ghost-button" onClick={() => onOpenTerminalSession(session.id)} type="button">
                      Resume
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {presets.length > 0 ? (
            <div className="git-session-group">
              <div className="git-session-group__header">
                <span className="git-page__meta">
                  {presets.length} saved path{presets.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="git-session-list">
                {presets.map((preset) => (
                  <div className="git-session-row" key={preset.id}>
                    <div className="git-session-row__body">
                      <strong>{preset.name}</strong>
                      <span>{preset.path}</span>
                    </div>
                    <button className="ghost-button" onClick={() => onLaunchLocalPreset(preset.id)} type="button">
                      Open
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function getGitChangeKey(change: GitFileChangeRecord) {
  return `${change.path}:${change.status}:${change.staged ? "staged" : "unstaged"}`;
}

function getGitChangeSummary(change: GitFileChangeRecord) {
  if (change.previousPath) {
    return `${change.previousPath} -> ${change.path}`;
  }

  return change.staged ? "Staged change" : "Working tree change";
}

type GitDiffRow = {
  key: string;
  kind: "meta" | "hunk" | "context" | "added" | "removed" | "changed";
  leftNumber: number | null;
  rightNumber: number | null;
  leftText: string;
  rightText: string;
  leftClassName: string;
  rightClassName: string;
};

function buildGitDiffRows(diff: string): GitDiffRow[] {
  const rows: GitDiffRow[] = [];
  const lines = diff.split("\n");
  let leftLine = 0;
  let rightLine = 0;
  let removedBuffer: Array<{ number: number; text: string }> = [];
  let addedBuffer: Array<{ number: number; text: string }> = [];

  const flushBuffers = () => {
    const count = Math.max(removedBuffer.length, addedBuffer.length);
    for (let index = 0; index < count; index += 1) {
      const removed = removedBuffer[index] ?? null;
      const added = addedBuffer[index] ?? null;
      rows.push({
        key: `change:${rows.length}:${removed?.number ?? "x"}:${added?.number ?? "x"}`,
        kind: removed && added ? "changed" : removed ? "removed" : "added",
        leftNumber: removed?.number ?? null,
        rightNumber: added?.number ?? null,
        leftText: removed?.text ?? "",
        rightText: added?.text ?? "",
        leftClassName: removed ? "git-diff-split__cell--removed" : "",
        rightClassName: added ? "git-diff-split__cell--added" : ""
      });
    }

    removedBuffer = [];
    addedBuffer = [];
  };

  for (const line of lines) {
    if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ")) {
      flushBuffers();
      rows.push({
        key: `meta:${rows.length}:${line}`,
        kind: "meta",
        leftNumber: null,
        rightNumber: null,
        leftText: line,
        rightText: line,
        leftClassName: "git-diff-split__cell--meta",
        rightClassName: "git-diff-split__cell--meta"
      });
      continue;
    }

    if (line.startsWith("@@")) {
      flushBuffers();
      const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      leftLine = match ? Number(match[1]) : leftLine;
      rightLine = match ? Number(match[2]) : rightLine;
      rows.push({
        key: `hunk:${rows.length}:${line}`,
        kind: "hunk",
        leftNumber: null,
        rightNumber: null,
        leftText: line,
        rightText: line,
        leftClassName: "git-diff-split__cell--hunk",
        rightClassName: "git-diff-split__cell--hunk"
      });
      continue;
    }

    if (line.startsWith("-")) {
      removedBuffer.push({ number: leftLine, text: line.slice(1) });
      leftLine += 1;
      continue;
    }

    if (line.startsWith("+")) {
      addedBuffer.push({ number: rightLine, text: line.slice(1) });
      rightLine += 1;
      continue;
    }

    flushBuffers();

    if (line.startsWith("\\")) {
      rows.push({
        key: `meta:${rows.length}:${line}`,
        kind: "meta",
        leftNumber: null,
        rightNumber: null,
        leftText: line,
        rightText: line,
        leftClassName: "git-diff-split__cell--meta",
        rightClassName: "git-diff-split__cell--meta"
      });
      continue;
    }

    rows.push({
      key: `context:${rows.length}:${leftLine}:${rightLine}`,
      kind: "context",
      leftNumber: leftLine,
      rightNumber: rightLine,
      leftText: line.startsWith(" ") ? line.slice(1) : line,
      rightText: line.startsWith(" ") ? line.slice(1) : line,
      leftClassName: "",
      rightClassName: ""
    });
    leftLine += 1;
    rightLine += 1;
  }

  flushBuffers();

  return rows;
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
