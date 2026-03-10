import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ClipboardPaste,
  Copy,
  FolderOpen,
  FolderPlus,
  HardDrive,
  RefreshCcw,
  Scissors,
  Server,
  Trash2
} from "lucide-react";
import type {
  FileBrowserDirectoryRecord,
  FileBrowserEntryRecord,
  FileBrowserTarget,
  FilePreviewRecord,
  FileTransferOperation,
  ServerRecord
} from "@hermes/core";
import {
  createFileDirectory,
  deleteFileEntries,
  readFileDirectory,
  readFilePreview,
  transferFileEntries,
  writeFile
} from "@hermes/db";

type BrowserState = {
  sourceValue: string;
  target: FileBrowserTarget | null;
  directory: FileBrowserDirectoryRecord | null;
  selection: string[];
  loading: boolean;
  error: string | null;
  dropActive: boolean;
  backStack: FileBrowserTarget[];
  forwardStack: FileBrowserTarget[];
};

type ClipboardState = {
  sources: FileBrowserTarget[];
  operation: FileTransferOperation;
};

type FileBrowserPageProps = {
  servers: ServerRecord[];
};

const NO_SOURCE = "";
const LOCAL_SOURCE = "local";

const EMPTY_STATE: BrowserState = {
  sourceValue: NO_SOURCE,
  target: null,
  directory: null,
  selection: [],
  loading: false,
  error: null,
  dropActive: false,
  backStack: [],
  forwardStack: []
};

export function FileBrowserPage({ servers }: FileBrowserPageProps) {
  const [browser, setBrowser] = useState<BrowserState>(EMPTY_STATE);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [preview, setPreview] = useState<FilePreviewRecord | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const dragStateRef = useRef<ClipboardState | null>(null);
  const previewRequestRef = useRef(0);

  const sourceOptions = useMemo(
    () => [
      { value: NO_SOURCE, label: "Choose local drive or server" },
      { value: LOCAL_SOURCE, label: "Local drives" },
      ...servers.map((server) => ({
        value: serverSourceValue(server.id),
        label:
          (server.name.trim() || `${server.username}@${server.hostname}`) +
          (server.authKind === "password" ? " (password unsupported)" : "")
      }))
    ],
    [servers]
  );

  useEffect(() => {
    if (
      browser.target?.kind === "server" &&
      !servers.some((server) => server.id === browser.target?.serverId)
    ) {
      clearBrowser();
    }
  }, [browser.target, servers]);

  async function loadDirectory(
    target: FileBrowserTarget,
    options?: {
      history?: "push" | "replace" | "none";
      previousTarget?: FileBrowserTarget | null;
    }
  ) {
    setBrowser((current) => ({
      ...current,
      target,
      loading: true,
      error: null
    }));

    try {
      const directory = await readFileDirectory(target);
      setBrowser((current) => {
        const previousTarget = options?.previousTarget ?? current.target;
        const historyMode = options?.history ?? "none";
        const nextBackStack =
          historyMode === "push" && previousTarget && !targetsEqual(previousTarget, directory.target)
            ? [...current.backStack, previousTarget]
            : current.backStack;

        return {
          ...current,
          sourceValue: sourceValueFromTarget(directory.target),
          target: directory.target,
          directory,
          selection: current.selection.filter((path) =>
            directory.entries.some((entry) => entry.path === path)
          ),
          loading: false,
          error: null,
          backStack: nextBackStack,
          forwardStack: historyMode === "push" ? [] : current.forwardStack
        };
      });
    } catch (error) {
      setBrowser((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
        selection: []
      }));
    }
  }

  async function loadPreview(target: FileBrowserTarget) {
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const nextPreview = await readFilePreview(target);
      if (previewRequestRef.current !== requestId) {
        return;
      }
      setPreview(nextPreview);
      setPreviewLoading(false);
    } catch (error) {
      if (previewRequestRef.current !== requestId) {
        return;
      }
      setPreview(null);
      setPreviewLoading(false);
      setPreviewError(error instanceof Error ? error.message : String(error));
    }
  }

  function resetPreview() {
    previewRequestRef.current += 1;
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(false);
  }

  function clearBrowser() {
    resetPreview();
    setBrowser(EMPTY_STATE);
  }

  function handleSourceChange(value: string) {
    if (value === NO_SOURCE) {
      clearBrowser();
      return;
    }

    const target = parseSourceValue(value);
    resetPreview();
    setBrowser((current) => ({
      ...current,
      sourceValue: value,
      target,
      directory: null,
      selection: [],
      error: null,
      backStack: [],
      forwardStack: []
    }));
    void loadDirectory(target, { history: "none", previousTarget: null });
  }

  function handleSelectEntry(entry: FileBrowserEntryRecord, event?: MouseEvent<HTMLButtonElement>) {
    const multiSelect = Boolean(event?.metaKey || event?.ctrlKey);
    const nextSelection = multiSelect
      ? browser.selection.includes(entry.path)
        ? browser.selection.filter((path) => path !== entry.path)
        : [...browser.selection, entry.path]
      : [entry.path];

    setBrowser((current) => ({
      ...current,
      selection: nextSelection
    }));

    if (entry.kind === "file" && nextSelection.length === 1 && browser.target) {
      void loadPreview({
        kind: browser.target.kind,
        serverId: browser.target.serverId,
        path: entry.path
      });
    } else {
      resetPreview();
    }
  }

  function handleOpenEntry(entry: FileBrowserEntryRecord) {
    if (!browser.target) {
      return;
    }

    if (entry.kind === "directory") {
      resetPreview();
      const nextTarget = {
        kind: browser.target.kind,
        serverId: browser.target.serverId,
        path: entry.path
      } satisfies FileBrowserTarget;
      void loadDirectory(nextTarget, {
        history: "push",
        previousTarget: browser.directory?.target ?? browser.target
      });
      return;
    }

    setBrowser((current) => ({
      ...current,
      selection: [entry.path]
    }));
    void loadPreview({
      kind: browser.target.kind,
      serverId: browser.target.serverId,
      path: entry.path
    });
  }

  function handleNavigateUp() {
    if (!browser.target || !browser.directory?.parentPath) {
      return;
    }

    resetPreview();
    void loadDirectory(
      {
        kind: browser.target.kind,
        serverId: browser.target.serverId,
        path: browser.directory.parentPath
      },
      {
        history: "push",
        previousTarget: browser.directory.target
      }
    );
  }

  function handleNavigateHistory(direction: "back" | "forward") {
    const stack = direction === "back" ? browser.backStack : browser.forwardStack;
    if (stack.length === 0) {
      return;
    }

    const target = stack[stack.length - 1];
    const currentTarget = browser.directory?.target ?? browser.target;
    if (!currentTarget) {
      return;
    }

    resetPreview();
    setBrowser((current) => {
      const sourceStack = direction === "back" ? current.backStack : current.forwardStack;
      const destinationStack = direction === "back" ? current.forwardStack : current.backStack;
      const nextTarget = sourceStack[sourceStack.length - 1];
      return {
        ...current,
        target: nextTarget ?? current.target,
        backStack:
          direction === "back" ? sourceStack.slice(0, -1) : [...destinationStack, currentTarget],
        forwardStack:
          direction === "back" ? [...destinationStack, currentTarget] : sourceStack.slice(0, -1)
      };
    });
    void loadDirectory(target, { history: "none", previousTarget: currentTarget });
  }

  function handleOpenBreadcrumb(target: FileBrowserTarget) {
    if (!browser.target) {
      return;
    }

    resetPreview();
    void loadDirectory(target, {
      history: "push",
      previousTarget: browser.directory?.target ?? browser.target
    });
  }

  function handleCopy(operation: FileTransferOperation) {
    if (!browser.target || browser.selection.length === 0) {
      return;
    }

    setClipboard({
      operation,
      sources: browser.selection.map((path) => ({
        kind: browser.target!.kind,
        serverId: browser.target!.serverId,
        path
      }))
    });
  }

  async function handlePaste(destination?: FileBrowserTarget) {
    const dropTarget = destination ?? browser.directory?.target;
    if (!clipboard || !dropTarget || !browser.directory?.canWrite) {
      return;
    }

    try {
      await transferFileEntries(clipboard.sources, dropTarget, clipboard.operation);
      await loadDirectory(dropTarget, { history: "replace", previousTarget: dropTarget });
      if (clipboard.operation === "move") {
        setClipboard(null);
      }
    } catch (error) {
      setBrowser((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  async function handleDelete() {
    if (!browser.target || browser.selection.length === 0) {
      return;
    }
    if (
      !window.confirm(
        `Delete ${browser.selection.length} selected item${browser.selection.length === 1 ? "" : "s"}?`
      )
    ) {
      return;
    }

    try {
      await deleteFileEntries(
        browser.selection.map((path) => ({
          kind: browser.target!.kind,
          serverId: browser.target!.serverId,
          path
        }))
      );
      resetPreview();
      await loadDirectory(browser.directory?.target ?? browser.target, {
        history: "replace",
        previousTarget: browser.directory?.target ?? browser.target
      });
    } catch (error) {
      setBrowser((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  async function handleCreateFolder() {
    if (!browser.directory?.canWrite) {
      return;
    }

    const name = window.prompt("Folder name");
    if (!name) {
      return;
    }

    try {
      await createFileDirectory(browser.directory.target, name);
      await loadDirectory(browser.directory.target, {
        history: "replace",
        previousTarget: browser.directory.target
      });
    } catch (error) {
      setBrowser((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  async function handleRefresh() {
    if (!browser.target) {
      return;
    }

    await loadDirectory(browser.directory?.target ?? browser.target, {
      history: "replace",
      previousTarget: browser.directory?.target ?? browser.target
    });
  }

  async function uploadDroppedFiles(destination: FileBrowserTarget, files: FileList) {
    if (files.length === 0) {
      return;
    }

    try {
      for (const file of Array.from(files)) {
        const contentsBase64 = encodeArrayBuffer(await file.arrayBuffer());
        await writeFile(destination, file.name, contentsBase64);
      }
      await loadDirectory(destination, { history: "replace", previousTarget: destination });
    } catch (error) {
      setBrowser((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  function handleDragStart(entry: FileBrowserEntryRecord) {
    if (!browser.target) {
      return;
    }

    const selection = browser.selection.includes(entry.path) ? browser.selection : [entry.path];
    dragStateRef.current = {
      operation: "copy",
      sources: selection.map((path) => ({
        kind: browser.target!.kind,
        serverId: browser.target!.serverId,
        path
      }))
    };
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setBrowser((current) => ({
      ...current,
      dropActive: true
    }));
  }

  function handleDragLeave() {
    setBrowser((current) => ({
      ...current,
      dropActive: false
    }));
  }

  async function handleDrop(event: DragEvent<HTMLElement>, destination?: FileBrowserTarget) {
    event.preventDefault();
    setBrowser((current) => ({
      ...current,
      dropActive: false
    }));

    const dropTarget = destination ?? browser.directory?.target;
    if (!dropTarget) {
      return;
    }

    if (event.dataTransfer.files.length > 0) {
      await uploadDroppedFiles(dropTarget, event.dataTransfer.files);
      return;
    }

    const dragState = dragStateRef.current;
    if (!dragState) {
      return;
    }

    const firstSource = dragState.sources[0];
    const sameNamespace =
      firstSource.kind === dropTarget.kind &&
      (firstSource.kind === "local" || firstSource.serverId === dropTarget.serverId);
    const operation: FileTransferOperation = event.shiftKey || sameNamespace ? "move" : "copy";

    try {
      await transferFileEntries(dragState.sources, dropTarget, operation);
      await loadDirectory(browser.directory?.target ?? dropTarget, {
        history: "replace",
        previousTarget: browser.directory?.target ?? dropTarget
      });
    } catch (error) {
      setBrowser((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    } finally {
      dragStateRef.current = null;
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
        event.preventDefault();
        handleCopy("copy");
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "x") {
        event.preventDefault();
        handleCopy("move");
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
        event.preventDefault();
        void handlePaste();
      }
      if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        handleNavigateHistory("back");
      }
      if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        handleNavigateHistory("forward");
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        handleNavigateUp();
      }
      if (event.key === "Delete") {
        event.preventDefault();
        void handleDelete();
      }
      if (event.key === "F5") {
        event.preventDefault();
        void handleRefresh();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const breadcrumbs = browser.directory ? buildBreadcrumbs(browser.directory.target) : [];
  const connected = Boolean(browser.target);

  return (
    <section className="files-page">
      <div className="files-page__toolbar">
        <div className="files-page__toolbar-main">
          <label className="files-page__source">
            <span>Open</span>
            <select onChange={(event) => handleSourceChange(event.target.value)} value={browser.sourceValue}>
              {sourceOptions.map((option) => (
                <option key={option.value || "none"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="files-page__toolbar-actions">
            <button
              className="ghost-button ghost-button--icon"
              disabled={browser.backStack.length === 0}
              onClick={() => handleNavigateHistory("back")}
              title="Back"
              type="button"
            >
              <ArrowLeft size={14} />
            </button>
            <button
              className="ghost-button ghost-button--icon"
              disabled={browser.forwardStack.length === 0}
              onClick={() => handleNavigateHistory("forward")}
              title="Forward"
              type="button"
            >
              <ArrowRight size={14} />
            </button>
            <button
              className="ghost-button ghost-button--icon"
              disabled={!browser.directory?.parentPath}
              onClick={handleNavigateUp}
              title="Up"
              type="button"
            >
              <ArrowUp size={14} />
            </button>
            <button
              className="ghost-button ghost-button--icon"
              disabled={!connected}
              onClick={() => void handleRefresh()}
              title="Refresh"
              type="button"
            >
              <RefreshCcw size={14} />
            </button>
            <button
              className="ghost-button ghost-button--icon"
              disabled={!browser.directory?.canWrite}
              onClick={() => void handleCreateFolder()}
              title="New folder"
              type="button"
            >
              <FolderPlus size={14} />
            </button>
          </div>
        </div>

        <div className="files-page__clipboard">
          <button
            className="ghost-button ghost-button--icon"
            disabled={browser.selection.length === 0}
            onClick={() => handleCopy("copy")}
            title="Copy"
            type="button"
          >
            <Copy size={14} />
          </button>
          <button
            className="ghost-button ghost-button--icon"
            disabled={browser.selection.length === 0}
            onClick={() => handleCopy("move")}
            title="Cut"
            type="button"
          >
            <Scissors size={14} />
          </button>
          <button
            className="ghost-button ghost-button--icon"
            disabled={!clipboard || !browser.directory?.canWrite}
            onClick={() => void handlePaste()}
            title="Paste"
            type="button"
          >
            <ClipboardPaste size={14} />
          </button>
          <button
            className="ghost-button ghost-button--icon"
            disabled={browser.selection.length === 0}
            onClick={() => void handleDelete()}
            title="Delete"
            type="button"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="files-page__chrome">
        <div className="files-page__status">
          <span>
            {connected
              ? browser.target?.kind === "local"
                ? "Local browser"
                : "Server browser"
              : "Choose a local drive or saved server to start browsing"}
          </span>
          <span>{clipboard ? `Clipboard: ${clipboard.operation}` : "Clipboard empty"}</span>
        </div>

        {connected ? (
          <div className="files-breadcrumbs">
            {breadcrumbs.length > 0 ? (
              breadcrumbs.map((crumb, index) => (
                <button
                  className={`files-breadcrumb ${index === breadcrumbs.length - 1 ? "files-breadcrumb--active" : ""}`}
                  key={`${crumb.label}-${crumb.target.path ?? "root"}`}
                  onClick={() => handleOpenBreadcrumb(crumb.target)}
                  type="button"
                >
                  {crumb.label}
                </button>
              ))
            ) : (
              <span className="files-breadcrumbs__placeholder">Root</span>
            )}
          </div>
        ) : null}
      </div>

      <article
        className={`files-pane files-pane--single ${browser.dropActive ? "files-pane--drop" : ""}`}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={(event) => void handleDrop(event)}
      >
        <div className="files-pane__meta">
          <strong>{browser.directory?.title ?? "No location selected"}</strong>
          <span>
            {browser.directory
              ? `${browser.directory.entries.length} item${browser.directory.entries.length === 1 ? "" : "s"}`
              : "Connect to browse"}
          </span>
        </div>

        {browser.error ? <div className="files-pane__error">{browser.error}</div> : null}

        <div className="files-pane__list">
          {!connected ? (
            <div className="files-pane__empty">Start by choosing `Local drives` or a saved server above.</div>
          ) : browser.loading ? (
            <div className="files-pane__empty">Loading...</div>
          ) : browser.directory && browser.directory.entries.length > 0 ? (
            browser.directory.entries.map((entry) => {
              const selected = browser.selection.includes(entry.path);
              const destinationTarget =
                browser.target && entry.kind === "directory"
                  ? {
                      kind: browser.target.kind,
                      serverId: browser.target.serverId,
                      path: entry.path
                    }
                  : undefined;

              return (
                <button
                  className={`file-row ${selected ? "file-row--selected" : ""}`}
                  draggable
                  key={entry.path}
                  onClick={(event) => handleSelectEntry(entry, event)}
                  onDoubleClick={() => handleOpenEntry(entry)}
                  onDragStart={() => handleDragStart(entry)}
                  onDragOver={(event) => {
                    if (entry.kind === "directory") {
                      handleDragOver(event);
                    }
                  }}
                  onDrop={(event) =>
                    entry.kind === "directory" && destinationTarget
                      ? void handleDrop(event, destinationTarget)
                      : undefined
                  }
                  type="button"
                >
                  <span className="file-row__icon">
                    {browser.target?.kind === "local" ? (
                      entry.kind === "directory" ? (
                        <FolderOpen size={13} />
                      ) : (
                        <HardDrive size={13} />
                      )
                    ) : entry.kind === "directory" ? (
                      <FolderOpen size={13} />
                    ) : (
                      <Server size={13} />
                    )}
                  </span>
                  <span className="file-row__name">{entry.name}</span>
                  <span className="file-row__meta">{entry.kind}</span>
                  <span className="file-row__meta">
                    {entry.size !== null ? formatFileSize(entry.size) : "--"}
                  </span>
                  <span className="file-row__meta">{formatTimestamp(entry.modifiedAt)}</span>
                </button>
              );
            })
          ) : (
            <div className="files-pane__empty">
              {browser.directory?.canWrite
                ? "This folder is empty. Drop files here or create a folder."
                : "This location is empty."}
            </div>
          )}
        </div>
      </article>

      <section className="files-preview">
        <header className="files-preview__header">
          <strong>Preview</strong>
          {preview ? (
            <span>
              {preview.name}
              {preview.truncated ? " (truncated)" : ""}
            </span>
          ) : (
            <span>Select a file to preview it inline.</span>
          )}
        </header>
        <div className="files-preview__body">
          {previewLoading ? (
            <div className="files-preview__empty">Loading preview...</div>
          ) : previewError ? (
            <div className="files-preview__empty">{previewError}</div>
          ) : preview ? (
            preview.binary ? (
              <div className="files-preview__empty">
                Binary file
                {preview.size !== null ? ` | ${formatFileSize(preview.size)}` : ""}
              </div>
            ) : (
              <pre>{preview.content || "[empty file]"}</pre>
            )
          ) : (
            <div className="files-preview__empty">No file selected.</div>
          )}
        </div>
      </section>
    </section>
  );
}

function parseSourceValue(value: string): FileBrowserTarget {
  if (value === LOCAL_SOURCE) {
    return { kind: "local", path: null };
  }

  return {
    kind: "server",
    serverId: value.slice("server:".length),
    path: null
  };
}

function sourceValueFromTarget(target: FileBrowserTarget) {
  return target.kind === "local" ? LOCAL_SOURCE : serverSourceValue(target.serverId ?? "");
}

function serverSourceValue(serverId: string) {
  return `server:${serverId}`;
}

function targetsEqual(left: FileBrowserTarget | null, right: FileBrowserTarget | null) {
  return (
    left?.kind === right?.kind &&
    left?.serverId === right?.serverId &&
    (left?.path ?? null) === (right?.path ?? null)
  );
}

function buildBreadcrumbs(target: FileBrowserTarget) {
  if (target.kind === "local") {
    return buildPathBreadcrumbs(target, "\\");
  }

  return buildPathBreadcrumbs(target, "/");
}

function buildPathBreadcrumbs(target: FileBrowserTarget, separator: "\\" | "/") {
  const path = target.path;
  if (!path) {
    return [];
  }

  if (separator === "\\" && /^[A-Za-z]:\\?$/.test(path)) {
    return [
      {
        label: path.slice(0, 2),
        target: { ...target, path: `${path.slice(0, 2)}\\` }
      }
    ];
  }

  if (separator === "\\") {
    const normalized = path.replace(/\//g, "\\");
    const parts = normalized.split("\\").filter(Boolean);
    const root = parts[0]?.endsWith(":") ? `${parts[0]}\\` : "";
    return parts.map((part, index) => {
      if (index === 0 && root) {
        return {
          label: part,
          target: { ...target, path: root }
        };
      }

      const prefix = root ? [root.replace(/\\$/, ""), ...parts.slice(1, index + 1)] : parts.slice(0, index + 1);
      return {
        label: part,
        target: { ...target, path: `${prefix.join("\\")}\\`.replace(/\\$/, "") }
      };
    });
  }

  if (path === "/") {
    return [{ label: "/", target: { ...target, path: "/" } }];
  }

  const parts = path.split("/").filter(Boolean);
  return [
    { label: "/", target: { ...target, path: "/" } },
    ...parts.map((part, index) => ({
      label: part,
      target: { ...target, path: `/${parts.slice(0, index + 1).join("/")}` }
    }))
  ];
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleString([], {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  });
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function encodeArrayBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return btoa(binary);
}
