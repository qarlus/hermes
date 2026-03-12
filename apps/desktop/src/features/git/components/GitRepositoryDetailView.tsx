import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Copy, GitBranch, GitCommitHorizontal, HardDriveDownload, Plus } from "lucide-react";
import type {
  GitFileChangeRecord,
  GitHubAuthSession,
  GitHubRepositoryRecord,
  GitRepositoryRecord
} from "@hermes/core";
import { getGitRepositoryChangeDiff } from "@hermes/db";

type RepositoryViewLike = {
  id: string;
  name: string;
  path: string;
  snapshot: GitRepositoryRecord | null;
  error: string | null;
};

export type GitRepositoryDetailContext = {
  mode: "local" | "remote";
  remoteRepository: GitHubRepositoryRecord | null;
};

type GitRepositoryDetailViewProps = {
  repository: RepositoryViewLike;
  context?: GitRepositoryDetailContext;
  activeSessionCount: number;
  savedPresetCount: number;
  commitMessage: string;
  branchName: string;
  busyAction: string | null;
  onCommitMessageChange: (value: string) => void;
  onCommitAll: (repositoryId: string) => void;
  onBranchNameChange: (value: string) => void;
  onCreateBranch: (repositoryId: string) => void;
  onCheckoutBranch: (repositoryId: string, branchName: string) => void;
  onPublish: (repositoryId: string) => void;
};

type GitRemoteRepositoryEmptyViewProps = {
  repository: GitHubRepositoryRecord;
  session: GitHubAuthSession | null;
  busyAction: string | null;
  localDiscoveryError: string | null;
  discoveredRepositories: GitRepositoryRecord[];
  discoveringLocalCheckouts: boolean;
  onCloneRepository: (repository: GitHubRepositoryRecord) => void;
  onCopyCloneUrl: (cloneUrl: string) => void;
  onAddRepository: () => void;
  onPinRepositorySnapshot: (snapshot: GitRepositoryRecord) => void;
};

export function GitRemoteRepositoryEmptyView({
  repository,
  session,
  busyAction,
  localDiscoveryError,
  discoveredRepositories,
  discoveringLocalCheckouts,
  onCloneRepository,
  onCopyCloneUrl,
  onAddRepository,
  onPinRepositorySnapshot
}: GitRemoteRepositoryEmptyViewProps) {
  const isCloneBusy = busyAction === `clone:${repository.id}`;

  return (
    <div className="git-detail git-detail--remote">
      <div className="git-remote-empty">
        <section className="git-remote-empty__hero">
          <div className="git-remote-empty__identity">
            <p className="eyebrow">Remote checkout</p>
            <h2>{repository.fullName}</h2>
            <span>{repository.description || "Clone or pin a local checkout to start working here."}</span>
          </div>

          <div className="git-remote-empty__meta">
            <span className="git-pill">{repository.private ? "Private" : "Public"}</span>
            <span className="git-pill">{repository.defaultBranch}</span>
            <span className="git-pill">{repository.stargazerCount} stars</span>
            {repository.language ? <span className="git-pill">{repository.language}</span> : null}
          </div>

          <div className="git-remote-empty__actions">
            <button
              className="primary-button"
              disabled={isCloneBusy}
              onClick={() => onCloneRepository(repository)}
              type="button"
            >
              <HardDriveDownload size={14} />
              {isCloneBusy ? "Cloning..." : "Clone repository"}
            </button>
            <button className="ghost-button" onClick={() => onCopyCloneUrl(repository.cloneUrl)} type="button">
              <Copy size={14} />
              Copy clone URL
            </button>
            <button className="ghost-button" onClick={onAddRepository} type="button">
              <Plus size={14} />
              Pin checkout
            </button>
          </div>
        </section>

        <section className="git-remote-empty__grid">
          <section className="git-panel">
            <div className="git-panel__header">
              <div>
                <p className="eyebrow">Discovery</p>
                <h3>Local checkout scan</h3>
              </div>
              <span className="git-page__meta">
                {discoveringLocalCheckouts
                  ? "Scanning"
                  : `${discoveredRepositories.length} match${discoveredRepositories.length === 1 ? "" : "es"}`}
              </span>
            </div>

            {localDiscoveryError ? (
              <div className="git-panel__empty">
                <strong>Local checkout scan failed</strong>
                <span>{localDiscoveryError}</span>
              </div>
            ) : discoveringLocalCheckouts ? (
              <div className="git-panel__empty">
                <strong>Scanning common folders</strong>
                <span>Hermes is checking common workspace locations for matching Git remotes.</span>
              </div>
            ) : discoveredRepositories.length === 0 ? (
              <div className="git-panel__empty">
                <strong>No matching checkout found</strong>
                <span>Clone this repository or pin an existing checkout manually.</span>
              </div>
            ) : (
              <div className="git-discovery-list">
                {discoveredRepositories.map((checkout) => (
                  <div className="git-discovery-row" key={checkout.rootPath}>
                    <div className="git-discovery-row__body">
                      <strong>{checkout.name}</strong>
                      <span>{checkout.rootPath}</span>
                      <span>
                        {checkout.branch}
                        {checkout.upstream ? ` | ${checkout.upstream}` : ""}
                      </span>
                    </div>
                    <button className="ghost-button" onClick={() => onPinRepositorySnapshot(checkout)} type="button">
                      Attach checkout
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="git-panel">
            <div className="git-panel__header">
              <div>
                <p className="eyebrow">Snapshot</p>
                <h3>GitHub metadata</h3>
              </div>
            </div>

            <div className="git-remote-empty__facts">
              <div className="git-remote-empty__fact">
                <span className="git-page__meta">Signed in</span>
                <strong>{session ? `@${session.login}` : "Metadata only"}</strong>
                <span>{session ? "This account can clone and pin the repository." : "Connect GitHub for account context."}</span>
              </div>
              <div className="git-remote-empty__fact">
                <span className="git-page__meta">Updated</span>
                <strong>{formatGitHubUpdatedAt(repository.updatedAt)}</strong>
                <span>{repository.htmlUrl}</span>
              </div>
              <div className="git-remote-empty__fact">
                <span className="git-page__meta">Clone</span>
                <strong>{repository.cloneUrl}</strong>
                <span>Use HTTPS clone or pin an existing checkout.</span>
              </div>
            </div>
          </section>
        </section>
      </div>
    </div>
  );
}

export function GitRepositoryDetailView({
  repository,
  context = {
    mode: "local",
    remoteRepository: null
  },
  activeSessionCount,
  savedPresetCount,
  commitMessage,
  branchName,
  busyAction,
  onCommitMessageChange,
  onCommitAll,
  onBranchNameChange,
  onCreateBranch,
  onCheckoutBranch,
  onPublish
}: GitRepositoryDetailViewProps) {
  const snapshot = repository.snapshot!;
  const isCommitBusy = busyAction === `commit:${repository.id}`;
  const isBranchBusy = busyAction === `branch:${repository.id}`;
  const isPublishBusy = busyAction === `push:${repository.id}`;
  const pendingChangeCount = getRepositoryPendingChangeCount(snapshot);
  const publishTarget = getGitPublishTarget(snapshot);
  const workingTreeSummary = getWorkingTreeSummary(snapshot);
  const title = context.mode === "remote" && context.remoteRepository ? context.remoteRepository.fullName : snapshot.name;
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

  useEffect(() => {
    const currentBranch = snapshot.branches.find((branch) => branch.current);
    const fallback = currentBranch?.name ?? snapshot.branches[0]?.name ?? "";
    setSelectedBranchName((current) =>
      current && snapshot.branches.some((branch) => branch.name === current) ? current : fallback
    );
  }, [snapshot.branches]);

  const selectedChange =
    snapshot.changes.find((change) => getGitChangeKey(change) === selectedChangeKey) ?? snapshot.changes[0] ?? null;
  const selectedBranch =
    snapshot.branches.find((branch) => branch.name === selectedBranchName) ?? snapshot.branches[0] ?? null;

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
      <div className="git-repo-surface">
        <section className="git-ops-bar" aria-label="Repository actions">
          <div className="git-ops-bar__summary">
            <div className="git-ops-bar__summary-main">
              <span className="git-pill git-pill--active">
                <GitBranch size={12} />
                {snapshot.branch}
              </span>
              <span className="git-pill">{publishTarget}</span>
              <span
                className={`git-pill ${
                  snapshot.clean ? "git-pill--clean" : snapshot.conflictedCount > 0 ? "git-pill--conflicted" : ""
                }`}
              >
                {snapshot.clean ? "Working tree clean" : `${pendingChangeCount} pending changes`}
              </span>
              {context.mode === "remote" && context.remoteRepository ? (
                <span className="git-pill">{context.remoteRepository.private ? "Private" : "Public"}</span>
              ) : null}
            </div>
            <div className="git-ops-bar__summary-side">
              <span className="git-page__meta">{title}</span>
            </div>
          </div>

          <div className="git-ops-bar__summary git-ops-bar__summary--secondary">
            <span>{snapshot.clean ? "Clean working tree" : workingTreeSummary}</span>
            <span>{getGitPublishShortSummary(snapshot)}</span>
            <span>{snapshot.lastCommitRelative ?? "No recent commit"}</span>
            <span>
              {snapshot.review
                ? `${snapshot.review.commitCount} commit${snapshot.review.commitCount === 1 ? "" : "s"} in review`
                : "No review draft"}
            </span>
            <span>{activeSessionCount} live / {savedPresetCount} saved</span>
          </div>

          <div className="git-ops-bar__lane git-ops-bar__lane--commit">
            <label className="field field--full">
              <span>Commit message</span>
              <input
                onChange={(event) => onCommitMessageChange(event.target.value)}
                placeholder="Write a precise summary"
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
              {isCommitBusy ? "Committing..." : "Commit"}
            </button>
          </div>

          <div className="git-ops-bar__lane git-ops-bar__lane--branch">
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
              {isBranchBusy ? "Creating..." : "Create"}
            </button>
          </div>

          <div className="git-ops-bar__lane git-ops-bar__lane--checkout">
            <label className="field field--full">
              <span>Checkout</span>
              <select onChange={(event) => setSelectedBranchName(event.target.value)} value={selectedBranchName}>
                {snapshot.branches.map((branch) => (
                  <option key={branch.name} value={branch.name}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
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

          <div className="git-ops-bar__lane git-ops-bar__lane--publish">
            <div className="git-ops-bar__publish-meta">
              <span className="git-page__meta">Publish</span>
              <strong>{snapshot.branch}</strong>
              <span>{getGitPublishShortSummary(snapshot)}</span>
            </div>
            <div className="git-publish-control">
              <div className="git-publish-control__target">
                <span className="git-page__meta">Target</span>
                <strong>{publishTarget}</strong>
              </div>
              <button
                className="git-publish-button"
                disabled={!snapshot.hasRemote || isPublishBusy}
                onClick={() => onPublish(repository.id)}
                type="button"
              >
                <ArrowUpRight size={14} />
                <span className="git-publish-button__copy">
                  <strong>{isPublishBusy ? "Publishing..." : "Push branch"}</strong>
                  <span>{snapshot.branch}</span>
                </span>
              </button>
            </div>
          </div>
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

function getGitChangeKey(change: GitFileChangeRecord) {
  return `${change.path}:${change.status}:${change.staged ? "staged" : "unstaged"}`;
}

function getRepositoryPendingChangeCount(snapshot: GitRepositoryRecord) {
  return snapshot.stagedCount + snapshot.changedCount + snapshot.untrackedCount + snapshot.conflictedCount;
}

function getWorkingTreeSummary(snapshot: GitRepositoryRecord) {
  if (snapshot.clean) {
    return "No staged, modified, untracked, or conflicted files.";
  }

  const parts = [
    snapshot.stagedCount > 0 ? `${snapshot.stagedCount} staged` : null,
    snapshot.changedCount > 0 ? `${snapshot.changedCount} modified` : null,
    snapshot.untrackedCount > 0 ? `${snapshot.untrackedCount} untracked` : null,
    snapshot.conflictedCount > 0 ? `${snapshot.conflictedCount} conflicted` : null
  ].filter(Boolean);

  return parts.join(" | ");
}

function getGitPublishTarget(snapshot: GitRepositoryRecord) {
  return snapshot.upstream ?? snapshot.remoteName ?? "No remote";
}

function getGitPublishShortSummary(snapshot: GitRepositoryRecord) {
  if (!snapshot.hasRemote) {
    return "Add a remote before publishing.";
  }

  const drift = [
    snapshot.ahead > 0 ? `${snapshot.ahead} ahead` : null,
    snapshot.behind > 0 ? `${snapshot.behind} behind` : null
  ]
    .filter(Boolean)
    .join(" | ");

  return drift ? drift : "In sync";
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

function formatGitHubUpdatedAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Updated recently";
  }

  return `Updated ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(parsed)}`;
}
