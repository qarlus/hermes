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
  Plus,
  RefreshCcw,
  Scissors,
  Server,
  Trash2,
  X
} from "lucide-react";
import type {
  FileBrowserDirectoryRecord,
  FileBrowserEntryRecord,
  FileBrowserTarget,
  FileTransferOperation,
  LocalEditableFileRecord,
  LocalEditableFileStateRecord,
  ServerRecord
} from "@hermes/core";
import {
  createFileDirectory,
  deleteFileEntries,
  inspectLocalEditableFile,
  openFileOnDevice,
  openFileWithDialogOnDevice,
  readFileDirectory,
  syncLocalFilesToTargets,
  syncLocalFileToTarget,
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

type BrowserWindowState = BrowserState & {
  id: string;
};

type ClipboardState = {
  sourceBrowserId: string;
  sources: FileBrowserTarget[];
  operation: FileTransferOperation;
};

type LocalEditDraft = LocalEditableFileRecord & {
  browserId: string;
  dirty: boolean;
  lastKnownSize: number | null;
  lastKnownModifiedAtMs: number | null;
  openedAt: string;
};

type FileContextMenuState = {
  browserId: string;
  entry: FileBrowserEntryRecord;
  target: FileBrowserTarget;
  x: number;
  y: number;
};

type FileBrowserPageProps = {
  servers: ServerRecord[];
  onNotify?: (message: string, tone: "success" | "info" | "error") => void;
};

const NO_SOURCE = "";
const LOCAL_SOURCE = "local";
const MAX_WINDOWS = 4;

const EMPTY_BROWSER_STATE: BrowserState = {
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

export function FileBrowserPage({ onNotify, servers }: FileBrowserPageProps) {
  const nextBrowserIdRef = useRef(2);
  const [browsers, setBrowsers] = useState<BrowserWindowState[]>(() => [createBrowserState("browser-1")]);
  const [activeBrowserId, setActiveBrowserId] = useState("browser-1");
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LocalEditDraft>>({});
  const [openingTargetKey, setOpeningTargetKey] = useState<string | null>(null);
  const [uploadingTargetKey, setUploadingTargetKey] = useState<string | null>(null);
  const [uploadingBrowserId, setUploadingBrowserId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<FileContextMenuState | null>(null);
  const dragStateRef = useRef<ClipboardState | null>(null);

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

  const activeBrowser = browsers.find((browser) => browser.id === activeBrowserId) ?? browsers[0] ?? null;
  const activeBrowserIndex = activeBrowser
    ? browsers.findIndex((browser) => browser.id === activeBrowser.id) + 1
    : 0;
  const dirtyDrafts = Object.fromEntries(
    Object.entries(drafts).filter(([, draft]) => draft.dirty)
  );
  const totalPendingDrafts = Object.keys(dirtyDrafts).length;

  useEffect(() => {
    setBrowsers((current) => {
      let changed = false;
      const next = current.map((browser) => {
        if (
          browser.target?.kind === "server" &&
          !servers.some((server) => server.id === browser.target?.serverId)
        ) {
          changed = true;
          return createBrowserState(browser.id);
        }

        return browser;
      });

      return changed ? next : current;
    });
  }, [servers]);

  useEffect(() => {
    if (Object.keys(drafts).length === 0) {
      return;
    }

    let cancelled = false;

    const refreshDraftStates = async () => {
      const entries = Object.entries(drafts);
      const states = await Promise.all(
        entries.map(async ([key, draft]) => {
          try {
            const state = await inspectLocalEditableFile(draft.localPath);
            return [key, state] as const;
          } catch {
            return [key, null] as const;
          }
        })
      );

      if (cancelled) {
        return;
      }

      setDrafts((current) => {
        let changed = false;
        const next = { ...current };

        for (const [key, state] of states) {
          const draft = next[key];
          if (!draft || !state) {
            continue;
          }

          const dirty = isDraftDirty(draft, state);
          if (
            draft.dirty !== dirty ||
            draft.lastKnownModifiedAtMs !== state.modifiedAtMs ||
            draft.lastKnownSize !== state.size
          ) {
            next[key] = {
              ...draft,
              dirty,
              lastKnownModifiedAtMs: state.modifiedAtMs,
              lastKnownSize: state.size
            };
            changed = true;
          }
        }

        return changed ? next : current;
      });
    };

    void refreshDraftStates();
    const intervalId = window.setInterval(() => {
      void refreshDraftStates();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [drafts]);

  function createBrowserId() {
    const id = `browser-${nextBrowserIdRef.current}`;
    nextBrowserIdRef.current += 1;
    return id;
  }

  function readBrowser(browserId: string) {
    return browsers.find((browser) => browser.id === browserId) ?? null;
  }

  function patchBrowser(browserId: string, updater: (browser: BrowserWindowState) => BrowserWindowState) {
    setBrowsers((current) =>
      current.map((browser) => (browser.id === browserId ? updater(browser) : browser))
    );
  }

  async function loadDirectory(
    browserId: string,
    target: FileBrowserTarget,
    options?: {
      history?: "push" | "replace" | "none";
      previousTarget?: FileBrowserTarget | null;
    }
  ) {
    patchBrowser(browserId, (current) => ({
      ...current,
      target,
      loading: true,
      error: null
    }));

    try {
      const directory = await readFileDirectory(target);
      patchBrowser(browserId, (current) => {
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
      patchBrowser(browserId, (current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
        selection: []
      }));
    }
  }

  function clearBrowser(browserId: string) {
    patchBrowser(browserId, (current) => createBrowserState(current.id));
  }

  function handleAddBrowser() {
    if (browsers.length >= MAX_WINDOWS) {
      return;
    }

    const browserId = createBrowserId();
    setBrowsers((current) => [...current, createBrowserState(browserId, activeBrowser ?? undefined)]);
    setActiveBrowserId(browserId);
  }

  function handleCloseBrowser(browserId: string) {
    if (browsers.length === 1) {
      return;
    }

    const nextBrowsers = browsers.filter((browser) => browser.id !== browserId);
    setBrowsers(nextBrowsers);

    if (activeBrowserId === browserId) {
      const nextActive =
        nextBrowsers[Math.max(0, browsers.findIndex((browser) => browser.id === browserId) - 1)] ??
        nextBrowsers[0];
      setActiveBrowserId(nextActive?.id ?? "");
    }
  }

  function handleSourceChange(browserId: string, value: string) {
    setActiveBrowserId(browserId);

    if (value === NO_SOURCE) {
      clearBrowser(browserId);
      return;
    }

    const target = parseSourceValue(value);
    patchBrowser(browserId, (current) => ({
      ...current,
      sourceValue: value,
      target,
      directory: null,
      selection: [],
      error: null,
      dropActive: false,
      backStack: [],
      forwardStack: []
    }));
    void loadDirectory(browserId, target, { history: "none", previousTarget: null });
  }

  function handleSelectEntry(
    browserId: string,
    entry: FileBrowserEntryRecord,
    event?: MouseEvent<HTMLButtonElement>
  ) {
    setActiveBrowserId(browserId);
    patchBrowser(browserId, (current) => {
      const multiSelect = Boolean(event?.metaKey || event?.ctrlKey);
      const nextSelection = multiSelect
        ? current.selection.includes(entry.path)
          ? current.selection.filter((path) => path !== entry.path)
          : [...current.selection, entry.path]
        : [entry.path];

      return {
        ...current,
        selection: nextSelection
      };
    });
  }

  function getSingleSelectedFile(browser: BrowserWindowState) {
    if (!browser.target || browser.selection.length !== 1 || !browser.directory) {
      return null;
    }

    const entry = browser.directory.entries.find(
      (candidate) => candidate.path === browser.selection[0] && candidate.kind === "file"
    );
    if (!entry) {
      return null;
    }

    return {
      entry,
      target: {
        kind: browser.target.kind,
        serverId: browser.target.serverId,
        path: entry.path
      } satisfies FileBrowserTarget
    };
  }

  async function handleOpenFile(browserId: string, target: FileBrowserTarget) {
    const targetKey = serializeTarget(target);
    setActiveBrowserId(browserId);
    setOpeningTargetKey(targetKey);

    try {
      const opened = await openFileOnDevice(target);
      if (opened.temporary) {
        setDrafts((current) => ({
          ...current,
          [targetKey]: {
            ...opened,
            browserId,
            dirty: false,
            lastKnownModifiedAtMs: opened.modifiedAtMs,
            lastKnownSize: opened.size,
            openedAt: new Date().toISOString()
          }
        }));
        onNotify?.(
          `Opened a local copy of ${opened.fileName}. Save in your editor, then upload it back when ready.`,
          "success"
        );
      } else {
        onNotify?.(`Opened ${opened.fileName} on this device.`, "success");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      patchBrowser(browserId, (current) => ({
        ...current,
        error: message
      }));
      onNotify?.(message, "error");
    } finally {
      setOpeningTargetKey((current) => (current === targetKey ? null : current));
    }
  }

  async function handleOpenFileWithDialog(browserId: string, target: FileBrowserTarget) {
    const targetKey = serializeTarget(target);
    setActiveBrowserId(browserId);
    setOpeningTargetKey(targetKey);

    try {
      const opened = await openFileWithDialogOnDevice(target);
      if (opened.temporary) {
        setDrafts((current) => ({
          ...current,
          [targetKey]: {
            ...opened,
            browserId,
            dirty: false,
            lastKnownModifiedAtMs: opened.modifiedAtMs,
            lastKnownSize: opened.size,
            openedAt: new Date().toISOString()
          }
        }));
      }
      onNotify?.(`Opened ${opened.fileName} with the native chooser.`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      patchBrowser(browserId, (current) => ({
        ...current,
        error: message
      }));
      onNotify?.(message, "error");
    } finally {
      setOpeningTargetKey((current) => (current === targetKey ? null : current));
    }
  }

  async function handleOpenSelectedFile(browserId: string) {
    const browser = readBrowser(browserId);
    if (!browser) {
      return;
    }

    const selectedFile = getSingleSelectedFile(browser);
    if (!selectedFile) {
      return;
    }

    await handleOpenFile(browserId, selectedFile.target);
  }

  function handleRowContextMenu(
    browserId: string,
    entry: FileBrowserEntryRecord,
    event: MouseEvent<HTMLButtonElement>
  ) {
    event.preventDefault();
    setActiveBrowserId(browserId);

    const browser = readBrowser(browserId);
    if (!browser?.target) {
      return;
    }

    patchBrowser(browserId, (current) => ({
      ...current,
      selection: current.selection.includes(entry.path) ? current.selection : [entry.path]
    }));

    setContextMenu({
      browserId,
      entry,
      target: {
        kind: browser.target.kind,
        serverId: browser.target.serverId,
        path: entry.path
      },
      x: event.clientX,
      y: event.clientY
    });
  }

  async function handleUploadDraft(browserId: string, draft: LocalEditDraft) {
    if (!draft.dirty) {
      return;
    }

    const browser = readBrowser(browserId);
    const targetKey = serializeTarget(draft.target);
    setActiveBrowserId(browserId);
    setUploadingTargetKey(targetKey);

    try {
      await syncLocalFileToTarget(draft.localPath, draft.target);

      const parentPath = getParentPath(draft.target);
      if (parentPath !== null) {
        await refreshOpenBrowsers([
          {
            kind: draft.target.kind,
            serverId: draft.target.serverId,
            path: parentPath
          }
        ]);
      } else if (browser?.directory?.target) {
        await refreshOpenBrowsers([browser.directory.target]);
      }

      setDrafts((current) => {
        const next = { ...current };
        delete next[targetKey];
        return next;
      });
      onNotify?.(`Uploaded ${draft.fileName} back to ${draft.target.kind === "server" ? "the server" : "this device"}.`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      patchBrowser(browserId, (current) => ({
        ...current,
        error: message
      }));
      onNotify?.(message, "error");
    } finally {
      setUploadingTargetKey((current) => (current === targetKey ? null : current));
    }
  }

  async function handleUploadAllDrafts(browserId: string, pendingDrafts: LocalEditDraft[]) {
    const browser = readBrowser(browserId);
    const uploadedDrafts: LocalEditDraft[] = [];
    const uploadGroups = groupDraftsForUpload(pendingDrafts);

    setActiveBrowserId(browserId);
    setUploadingBrowserId(browserId);

    let failureMessage: string | null = null;

    try {
      for (const group of uploadGroups) {
        await syncLocalFilesToTargets(
          group.map((draft) => ({
            localPath: draft.localPath,
            target: draft.target
          }))
        );
        uploadedDrafts.push(...group);
      }
    } catch (error) {
      failureMessage = error instanceof Error ? error.message : String(error);
      patchBrowser(browserId, (current) => ({
        ...current,
        error: failureMessage
      }));
    } finally {
      setUploadingBrowserId((current) => (current === browserId ? null : current));
    }

    if (uploadedDrafts.length > 0) {
      const refreshTargets = dedupeTargets(
        uploadedDrafts
          .map((draft) => {
            const parentPath = getParentPath(draft.target);
            if (parentPath !== null) {
              return {
                kind: draft.target.kind,
                serverId: draft.target.serverId,
                path: parentPath
              } satisfies FileBrowserTarget;
            }

            return browser?.directory?.target ?? null;
          })
          .filter((target): target is FileBrowserTarget => target !== null)
      );

      if (refreshTargets.length > 0) {
        await refreshOpenBrowsers(refreshTargets);
      }

      setDrafts((current) => {
        const next = { ...current };
        for (const draft of uploadedDrafts) {
          delete next[serializeTarget(draft.target)];
        }
        return next;
      });
    }

    if (failureMessage) {
      onNotify?.(
        uploadedDrafts.length > 0
          ? `Uploaded ${uploadedDrafts.length} file${uploadedDrafts.length === 1 ? "" : "s"} before a later batch failed. ${failureMessage}`
          : failureMessage,
        "error"
      );
      return;
    }

    if (uploadedDrafts.length > 0) {
      onNotify?.(
        `Uploaded ${uploadedDrafts.length} file${uploadedDrafts.length === 1 ? "" : "s"} back to ${uploadedDrafts[0]?.target.kind === "server" ? "the server" : "this device"}.`,
        "success"
      );
    }
  }

  function handleOpenEntry(browserId: string, entry: FileBrowserEntryRecord) {
    const browser = readBrowser(browserId);
    if (!browser?.target) {
      return;
    }

    setActiveBrowserId(browserId);

    if (entry.kind === "directory") {
      const nextTarget = {
        kind: browser.target.kind,
        serverId: browser.target.serverId,
        path: entry.path
      } satisfies FileBrowserTarget;

      void loadDirectory(browserId, nextTarget, {
        history: "push",
        previousTarget: browser.directory?.target ?? browser.target
      });
      return;
    }

    patchBrowser(browserId, (current) => ({
      ...current,
      selection: [entry.path]
    }));

    void handleOpenFile(browserId, {
      kind: browser.target.kind,
      serverId: browser.target.serverId,
      path: entry.path
    });
  }

  function handleNavigateUp(browserId: string) {
    const browser = readBrowser(browserId);
    if (!browser?.target || !browser.directory?.parentPath) {
      return;
    }

    setActiveBrowserId(browserId);
    void loadDirectory(
      browserId,
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

  function handleNavigateHistory(browserId: string, direction: "back" | "forward") {
    const browser = readBrowser(browserId);
    const stack = direction === "back" ? browser?.backStack : browser?.forwardStack;
    if (!browser || !stack || stack.length === 0) {
      return;
    }

    const target = stack[stack.length - 1];
    const currentTarget = browser.directory?.target ?? browser.target;
    if (!currentTarget) {
      return;
    }

    setActiveBrowserId(browserId);
    patchBrowser(browserId, (current) => {
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
    void loadDirectory(browserId, target, { history: "none", previousTarget: currentTarget });
  }

  function handleOpenBreadcrumb(browserId: string, target: FileBrowserTarget) {
    const browser = readBrowser(browserId);
    if (!browser?.target) {
      return;
    }

    setActiveBrowserId(browserId);
    void loadDirectory(browserId, target, {
      history: "push",
      previousTarget: browser.directory?.target ?? browser.target
    });
  }

  function handleCopy(browserId: string, operation: FileTransferOperation) {
    const browser = readBrowser(browserId);
    if (!browser?.target || browser.selection.length === 0) {
      return;
    }

    setActiveBrowserId(browserId);
    setClipboard({
      sourceBrowserId: browserId,
      operation,
      sources: browser.selection.map((path) => ({
        kind: browser.target!.kind,
        serverId: browser.target!.serverId,
        path
      }))
    });
  }

  async function handlePaste(browserId: string, destination?: FileBrowserTarget) {
    const browser = readBrowser(browserId);
    const dropTarget = destination ?? browser?.directory?.target;
    if (!clipboard || !browser?.directory?.canWrite || !dropTarget) {
      return;
    }

    setActiveBrowserId(browserId);

    try {
      await transferFileEntries(clipboard.sources, dropTarget, clipboard.operation);
      await refreshBrowsersAfterTransfer(clipboard.sources, dropTarget, clipboard.operation);
      if (clipboard.operation === "move") {
        setClipboard(null);
      }
    } catch (error) {
      patchBrowser(browserId, (current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  async function handleDelete(browserId: string) {
    const browser = readBrowser(browserId);
    if (!browser?.target || browser.selection.length === 0) {
      return;
    }

    setActiveBrowserId(browserId);

    if (
      !window.confirm(
        `Delete ${browser.selection.length} selected item${browser.selection.length === 1 ? "" : "s"}?`
      )
    ) {
      return;
    }

    try {
      const sources = browser.selection.map((path) => ({
        kind: browser.target!.kind,
        serverId: browser.target!.serverId,
        path
      }));
      await deleteFileEntries(sources);
      await refreshBrowsersAfterTransfer(sources, browser.directory?.target ?? browser.target, "move");
      patchBrowser(browserId, (current) => ({
        ...current,
        selection: []
      }));
    } catch (error) {
      patchBrowser(browserId, (current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  async function handleCreateFolder(browserId: string) {
    const browser = readBrowser(browserId);
    if (!browser?.directory?.canWrite) {
      return;
    }

    setActiveBrowserId(browserId);
    const name = window.prompt("Folder name");
    if (!name) {
      return;
    }

    try {
      await createFileDirectory(browser.directory.target, name);
      await refreshOpenBrowsers([browser.directory.target]);
    } catch (error) {
      patchBrowser(browserId, (current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  async function handleRefresh(browserId: string) {
    const browser = readBrowser(browserId);
    if (!browser?.target) {
      return;
    }

    setActiveBrowserId(browserId);
    await loadDirectory(browserId, browser.directory?.target ?? browser.target, {
      history: "replace",
      previousTarget: browser.directory?.target ?? browser.target
    });
  }

  async function uploadDroppedFiles(browserId: string, destination: FileBrowserTarget, files: FileList) {
    if (files.length === 0) {
      return;
    }

    try {
      for (const file of Array.from(files)) {
        const contentsBase64 = encodeArrayBuffer(await file.arrayBuffer());
        await writeFile(destination, file.name, contentsBase64);
      }
      await refreshOpenBrowsers([destination]);
    } catch (error) {
      patchBrowser(browserId, (current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  function handleDragStart(browserId: string, entry: FileBrowserEntryRecord) {
    const browser = readBrowser(browserId);
    if (!browser?.target) {
      return;
    }

    setActiveBrowserId(browserId);
    const selection = browser.selection.includes(entry.path) ? browser.selection : [entry.path];
    dragStateRef.current = {
      sourceBrowserId: browserId,
      operation: "copy",
      sources: selection.map((path) => ({
        kind: browser.target!.kind,
        serverId: browser.target!.serverId,
        path
      }))
    };
  }

  function handleDragOver(browserId: string, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setActiveBrowserId(browserId);
    setBrowsers((current) =>
      current.map((browser) =>
        browser.id === browserId
          ? browser.dropActive
            ? browser
            : { ...browser, dropActive: true }
          : browser.dropActive
            ? { ...browser, dropActive: false }
            : browser
      )
    );
  }

  function handleDragLeave(browserId: string) {
    patchBrowser(browserId, (current) => ({
      ...current,
      dropActive: false
    }));
  }

  async function handleDrop(browserId: string, event: DragEvent<HTMLElement>, destination?: FileBrowserTarget) {
    event.preventDefault();
    setActiveBrowserId(browserId);
    setBrowsers((current) =>
      current.map((browser) => (browser.dropActive ? { ...browser, dropActive: false } : browser))
    );

    const browser = readBrowser(browserId);
    const dropTarget = destination ?? browser?.directory?.target;
    if (!dropTarget) {
      return;
    }

    if (event.dataTransfer.files.length > 0) {
      await uploadDroppedFiles(browserId, dropTarget, event.dataTransfer.files);
      return;
    }

    const dragState = dragStateRef.current;
    if (!dragState) {
      return;
    }

    const firstSource = dragState.sources[0];
    if (!firstSource) {
      return;
    }

    const sameNamespace =
      firstSource.kind === dropTarget.kind &&
      (firstSource.kind === "local" || firstSource.serverId === dropTarget.serverId);
    const operation: FileTransferOperation = event.shiftKey || sameNamespace ? "move" : "copy";

    try {
      await transferFileEntries(dragState.sources, dropTarget, operation);
      await refreshBrowsersAfterTransfer(dragState.sources, dropTarget, operation);
    } catch (error) {
      patchBrowser(browserId, (current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    } finally {
      dragStateRef.current = null;
    }
  }

  async function refreshOpenBrowsers(targets: FileBrowserTarget[]) {
    const targetKeys = new Set(targets.map((target) => serializeTarget(target)));
    const browsersToRefresh = browsers.filter(
      (browser) => browser.directory && targetKeys.has(serializeTarget(browser.directory.target))
    );

    await Promise.all(
      browsersToRefresh.map((browser) =>
        loadDirectory(browser.id, browser.directory!.target, {
          history: "replace",
          previousTarget: browser.directory!.target
        })
      )
    );
  }

  async function refreshBrowsersAfterTransfer(
    sources: FileBrowserTarget[],
    destination: FileBrowserTarget,
    operation: FileTransferOperation
  ) {
    const targets = [destination];

    if (operation === "move") {
      for (const source of sources) {
        const parentPath = getParentPath(source);
        if (parentPath !== null) {
          targets.push({
            kind: source.kind,
            serverId: source.serverId,
            path: parentPath
          });
        }
      }
    }

    await refreshOpenBrowsers(dedupeTargets(targets));
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }

      const browser = browsers.find((item) => item.id === activeBrowserId) ?? browsers[0];
      if (!browser) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
        event.preventDefault();
        handleCopy(browser.id, "copy");
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "x") {
        event.preventDefault();
        handleCopy(browser.id, "move");
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
        event.preventDefault();
        void handlePaste(browser.id);
      }
      if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        handleNavigateHistory(browser.id, "back");
      }
      if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        handleNavigateHistory(browser.id, "forward");
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        handleNavigateUp(browser.id);
      }
      if (event.key === "Delete") {
        event.preventDefault();
        void handleDelete(browser.id);
      }
      if (event.key === "F5") {
        event.preventDefault();
        void handleRefresh(browser.id);
      }
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeBrowserId, browsers, clipboard]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    function handleDismiss() {
      setContextMenu(null);
    }

    window.addEventListener("click", handleDismiss);
    window.addEventListener("blur", handleDismiss);
    window.addEventListener("resize", handleDismiss);
    return () => {
      window.removeEventListener("click", handleDismiss);
      window.removeEventListener("blur", handleDismiss);
      window.removeEventListener("resize", handleDismiss);
    };
  }, [contextMenu]);

  return (
    <section className="files-page">
      <header className="files-page__header">
        <div className="files-page__header-copy">
          <div className="files-page__header-title">
            <strong>Files</strong>
            <span>
              {browsers.length} window{browsers.length === 1 ? "" : "s"} open
            </span>
          </div>
          <div className="files-page__header-meta">
            <span>
              {activeBrowser ? `Active window: ${activeBrowserIndex}` : "No active window"}
            </span>
            {totalPendingDrafts > 0 ? (
              <span>{totalPendingDrafts} upload{totalPendingDrafts === 1 ? "" : "s"} pending</span>
            ) : null}
            <span>
              {clipboard
                ? `Clipboard: ${clipboard.operation} ${clipboard.sources.length} item${clipboard.sources.length === 1 ? "" : "s"}`
                : "Clipboard empty"}
            </span>
          </div>
        </div>

        <div className="files-page__header-actions">
          <span className="files-page__shortcut-hint">Shortcuts apply to the active window.</span>
          <button
            className="ghost-button"
            disabled={browsers.length >= MAX_WINDOWS}
            onClick={handleAddBrowser}
            type="button"
          >
            <Plus size={14} />
            <span>New window</span>
          </button>
        </div>
      </header>

      <div className="files-grid">
        {browsers.map((browser, index) => {
          const connected = Boolean(browser.target);
          const breadcrumbs = browser.directory ? buildBreadcrumbs(browser.directory.target) : [];
          const selectedCount = browser.selection.length;
          const isActive = browser.id === activeBrowserId;
          const pendingDrafts = Object.values(dirtyDrafts)
            .filter((draft) => draft.browserId === browser.id)
            .sort((left, right) => left.fileName.localeCompare(right.fileName));
          const pendingDraftCount = pendingDrafts.length;
          const selectedFile = getSingleSelectedFile(browser);
          const selectedDraft = selectedFile ? drafts[serializeTarget(selectedFile.target)] : null;
          const selectedFileBusy = selectedFile
            ? openingTargetKey === serializeTarget(selectedFile.target)
            : false;
          const selectedDraftBusy = selectedDraft
            ? uploadingBrowserId === browser.id || uploadingTargetKey === serializeTarget(selectedDraft.target)
            : false;
          const uploadAllBusy =
            uploadingBrowserId === browser.id ||
            (pendingDraftCount > 0 &&
              pendingDrafts.some((draft) => uploadingTargetKey === serializeTarget(draft.target)));

          return (
            <section
              className={`files-window ${isActive ? "files-window--active" : ""}`}
              key={browser.id}
              onMouseDown={() => setActiveBrowserId(browser.id)}
            >
              <header className="files-window__header">
                <div className="files-window__title">
                  <div className="files-window__eyebrow">
                    <strong>Window {index + 1}</strong>
                    {isActive ? <span className="files-window__badge">Active</span> : null}
                    {pendingDraftCount > 0 ? (
                      <span className="files-window__badge files-window__badge--pending">
                        {pendingDraftCount} pending
                      </span>
                    ) : null}
                  </div>
                  <span>
                    {connected
                      ? browser.target?.kind === "local"
                        ? "Local browser"
                        : "Server browser"
                      : "Choose a local drive or saved server to start browsing"}
                  </span>
                </div>

                <button
                  className="ghost-button ghost-button--icon"
                  disabled={browsers.length === 1}
                  onClick={() => handleCloseBrowser(browser.id)}
                  title={browsers.length === 1 ? "Keep at least one window open" : "Close window"}
                  type="button"
                >
                  <X size={14} />
                </button>
              </header>

              <div className="files-window__toolbar">
                <label className="files-page__source">
                  <span>Open</span>
                  <select
                    onChange={(event) => handleSourceChange(browser.id, event.target.value)}
                    value={browser.sourceValue}
                  >
                    {sourceOptions.map((option) => (
                      <option key={option.value || "none"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="files-window__toolbar-actions">
                  <button
                    className="ghost-button ghost-button--icon"
                    disabled={browser.backStack.length === 0}
                    onClick={() => handleNavigateHistory(browser.id, "back")}
                    title="Back"
                    type="button"
                  >
                    <ArrowLeft size={14} />
                  </button>
                  <button
                    className="ghost-button ghost-button--icon"
                    disabled={browser.forwardStack.length === 0}
                    onClick={() => handleNavigateHistory(browser.id, "forward")}
                    title="Forward"
                    type="button"
                  >
                    <ArrowRight size={14} />
                  </button>
                  <button
                    className="ghost-button ghost-button--icon"
                    disabled={!browser.directory?.parentPath}
                    onClick={() => handleNavigateUp(browser.id)}
                    title="Up"
                    type="button"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    className="ghost-button ghost-button--icon"
                    disabled={!connected}
                    onClick={() => void handleRefresh(browser.id)}
                    title="Refresh"
                    type="button"
                  >
                    <RefreshCcw size={14} />
                  </button>
                  <button
                    className="ghost-button ghost-button--icon"
                    disabled={!browser.directory?.canWrite}
                    onClick={() => void handleCreateFolder(browser.id)}
                    title="New folder"
                    type="button"
                  >
                    <FolderPlus size={14} />
                  </button>
                  <button
                    className="ghost-button"
                    disabled={!selectedFile || selectedFileBusy}
                    onClick={() => void handleOpenSelectedFile(browser.id)}
                    type="button"
                  >
                    <FolderOpen size={14} />
                    <span>{selectedFileBusy ? "Opening..." : "Open local"}</span>
                  </button>
                  <button
                    className={
                      pendingDraftCount > 0 && selectedDraft?.dirty
                        ? "primary-button files-window__upload-action"
                        : "ghost-button"
                    }
                    disabled={!selectedDraft?.dirty || selectedDraftBusy}
                    onClick={() => selectedDraft && void handleUploadDraft(browser.id, selectedDraft)}
                    type="button"
                  >
                    <ArrowUp size={14} />
                    <span>{selectedDraftBusy ? "Uploading..." : pendingDraftCount > 0 ? "Upload selected" : "Upload back"}</span>
                  </button>
                  <button
                    className="ghost-button ghost-button--icon"
                    disabled={selectedCount === 0}
                    onClick={() => handleCopy(browser.id, "copy")}
                    title="Copy"
                    type="button"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    className="ghost-button ghost-button--icon"
                    disabled={selectedCount === 0}
                    onClick={() => handleCopy(browser.id, "move")}
                    title="Cut"
                    type="button"
                  >
                    <Scissors size={14} />
                  </button>
                  <button
                    className="ghost-button ghost-button--icon"
                    disabled={!clipboard || !browser.directory?.canWrite}
                    onClick={() => void handlePaste(browser.id)}
                    title="Paste"
                    type="button"
                  >
                    <ClipboardPaste size={14} />
                  </button>
                  <button
                    className="ghost-button ghost-button--icon"
                    disabled={selectedCount === 0}
                    onClick={() => void handleDelete(browser.id)}
                    title="Delete"
                    type="button"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="files-window__chrome">
                <div className="files-page__status">
                  <span>
                    {browser.directory
                      ? `${browser.directory.entries.length} item${browser.directory.entries.length === 1 ? "" : "s"}`
                      : connected
                        ? "Loading location"
                        : "Not connected"}
                  </span>
                  <span>
                    {selectedCount > 0
                      ? `${selectedCount} selected`
                      : clipboard?.sourceBrowserId === browser.id
                        ? `Ready to ${clipboard.operation}`
                        : "No selection"}
                  </span>
                </div>

                {connected ? (
                  <div className="files-breadcrumbs">
                    {breadcrumbs.length > 0 ? (
                      breadcrumbs.map((crumb, crumbIndex) => (
                        <button
                          className={`files-breadcrumb ${crumbIndex === breadcrumbs.length - 1 ? "files-breadcrumb--active" : ""}`}
                          key={`${crumb.label}-${crumb.target.path ?? "root"}`}
                          onClick={() => handleOpenBreadcrumb(browser.id, crumb.target)}
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

                {pendingDraftCount > 0 ? (
                  <div className="files-window__pending-strip">
                    <div className="files-window__pending-summary">
                      <strong>{pendingDraftCount} edited file{pendingDraftCount === 1 ? "" : "s"}</strong>
                      <span>ready to upload</span>
                    </div>
                    <div className="files-window__pending-list">
                      {pendingDrafts.map((draft) => {
                        const draftKey = serializeTarget(draft.target);
                        const draftBusy = uploadAllBusy || uploadingTargetKey === draftKey;
                        const draftSelected = selectedDraft?.target.path === draft.target.path;
                        return (
                          <div
                            className={`files-window__pending-chip ${draftSelected ? "files-window__pending-chip--active" : ""}`}
                            key={draftKey}
                          >
                            <button
                              className="files-window__pending-select"
                              onClick={() => {
                                patchBrowser(browser.id, (current) => ({
                                  ...current,
                                  selection: [draft.target.path ?? ""].filter(Boolean)
                                }));
                              }}
                              type="button"
                            >
                              <span>{draft.fileName}</span>
                            </button>
                            <button
                              className="files-window__pending-upload"
                              disabled={draftBusy}
                              onClick={() => void handleUploadDraft(browser.id, draft)}
                              type="button"
                            >
                              <ArrowUp size={13} />
                              <span>{draftBusy ? "Uploading..." : "Upload"}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {pendingDraftCount > 1 ? (
                      <button
                        className="primary-button files-window__upload-all"
                        disabled={uploadAllBusy}
                        onClick={() => void handleUploadAllDrafts(browser.id, pendingDrafts)}
                        type="button"
                      >
                        <ArrowUp size={14} />
                        <span>{uploadAllBusy ? "Uploading..." : `Upload all ${pendingDraftCount}`}</span>
                      </button>
                    ) : null}
                  </div>
                ) : selectedDraft && !selectedDraft.dirty ? (
                  <div className="files-window__draft files-window__draft--hint">
                    <span>Local copy is open. Save changes in your editor to enable upload.</span>
                  </div>
                ) : selectedFile?.target.kind === "server" ? (
                  <div className="files-window__draft files-window__draft--hint">
                    <span>Double-click a file to open a local copy, edit it, then upload it back here.</span>
                  </div>
                ) : null}
              </div>

              <article
                className={`files-pane ${browser.dropActive ? "files-pane--drop" : ""}`}
                onDragLeave={() => handleDragLeave(browser.id)}
                onDragOver={(event) => handleDragOver(browser.id, event)}
                onDrop={(event) => void handleDrop(browser.id, event)}
              >
                <div className="files-pane__meta">
                  <strong>{browser.directory?.title ?? "No location selected"}</strong>
                  <span>
                    {browser.directory?.canWrite
                      ? "Writable"
                      : connected
                        ? "Read only"
                        : "Connect to browse"}
                  </span>
                </div>

                {browser.error ? <div className="files-pane__error">{browser.error}</div> : null}

                <div className="files-pane__list">
                  {!connected ? (
                    <div className="files-pane__empty">
                      Start by choosing `Local drives` or a saved server above.
                    </div>
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
                          onClick={(event) => handleSelectEntry(browser.id, entry, event)}
                          onContextMenu={(event) => handleRowContextMenu(browser.id, entry, event)}
                          onDoubleClick={() => handleOpenEntry(browser.id, entry)}
                          onDragStart={() => handleDragStart(browser.id, entry)}
                          onDragOver={(event) => {
                            if (entry.kind === "directory") {
                              handleDragOver(browser.id, event);
                            }
                          }}
                          onDrop={(event) =>
                            entry.kind === "directory" && destinationTarget
                              ? void handleDrop(browser.id, event, destinationTarget)
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
            </section>
          );
        })}
      </div>

      {contextMenu ? (
        <div
          className="files-context-menu"
          onClick={(event) => event.stopPropagation()}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="files-context-menu__item"
            onClick={() => {
              setContextMenu(null);
              if (contextMenu.entry.kind === "directory") {
                handleOpenEntry(contextMenu.browserId, contextMenu.entry);
                return;
              }
              void handleOpenFile(contextMenu.browserId, contextMenu.target);
            }}
            type="button"
          >
            Open
          </button>
          {contextMenu.entry.kind === "file" ? (
            <button
              className="files-context-menu__item"
              onClick={() => {
                setContextMenu(null);
                void handleOpenFileWithDialog(contextMenu.browserId, contextMenu.target);
              }}
              type="button"
            >
              Open with...
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function createBrowserState(id: string, source?: BrowserState): BrowserWindowState {
  if (!source) {
    return {
      id,
      ...EMPTY_BROWSER_STATE
    };
  }

  return {
    id,
    sourceValue: source.sourceValue,
    target: source.directory?.target ?? source.target,
    directory: source.directory,
    selection: [],
    loading: false,
    error: null,
    dropActive: false,
    backStack: [],
    forwardStack: []
  };
}

function isDraftDirty(draft: LocalEditDraft, state: LocalEditableFileStateRecord) {
  if (!state.exists) {
    return false;
  }

  return draft.modifiedAtMs !== state.modifiedAtMs || draft.size !== state.size;
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

function serializeTarget(target: FileBrowserTarget) {
  return `${target.kind}:${target.serverId ?? ""}:${target.path ?? ""}`;
}

function dedupeTargets(targets: FileBrowserTarget[]) {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = serializeTarget(target);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
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

function getParentPath(target: FileBrowserTarget) {
  if (!target.path) {
    return null;
  }

  if (target.kind === "local") {
    const normalized = target.path.replace(/\//g, "\\").replace(/\\+$/, "");
    if (/^[A-Za-z]:$/.test(normalized)) {
      return `${normalized}\\`;
    }

    const boundary = normalized.lastIndexOf("\\");
    if (boundary <= 2) {
      return `${normalized.slice(0, 2)}\\`;
    }

    return normalized.slice(0, boundary);
  }

  const normalized = target.path === "/" ? "/" : target.path.replace(/\/+$/, "");
  if (normalized === "/") {
    return "/";
  }

  const boundary = normalized.lastIndexOf("/");
  return boundary <= 0 ? "/" : normalized.slice(0, boundary);
}

function groupDraftsForUpload(drafts: LocalEditDraft[]) {
  const groups = new Map<string, LocalEditDraft[]>();

  for (const draft of drafts) {
    const parentPath = getParentPath(draft.target) ?? draft.target.path ?? "";
    const key = `${draft.target.kind}:${draft.target.serverId ?? ""}:${parentPath}`;
    const group = groups.get(key);
    if (group) {
      group.push(draft);
    } else {
      groups.set(key, [draft]);
    }
  }

  return Array.from(groups.values());
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
