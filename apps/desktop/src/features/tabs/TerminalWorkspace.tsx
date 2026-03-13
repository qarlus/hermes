import { useEffect, useRef, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { Plus } from "lucide-react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "xterm";
import type {
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalStatusEvent,
  TerminalTab
} from "@hermes/core";
import { isTauriRuntime } from "../../lib/runtime";

interface TerminalWorkspaceProps {
  tabs: TerminalTab[];
  activeTabId: string | null;
  hostVariant?: "page" | "pane";
  visible?: boolean;
  showTabs?: boolean;
  multiPane?: boolean;
  visibleTabIds?: string[];
  multiPaneColumns?: number;
  multiPaneRows?: number;
  terminalFontSize: number;
  terminalTheme: {
    background: string;
    foreground: string;
    cursor: string;
    cursorAccent: string;
    selectionBackground: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
  emptyState?: ReactNode;
  rightRail?: ReactNode;
  rightRailVariant?: "commands" | "relay";
  rightRailOpen?: boolean;
  emptyTabsLabel?: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onInput: (sessionId: string, data: string) => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  onStatus: (event: TerminalStatusEvent) => void;
  onExit: (event: TerminalExitEvent) => void;
  onNewTab?: () => void;
}

interface TerminalHandle {
  terminal: Terminal;
  fitAddon: FitAddon;
}

export function TerminalWorkspace({
  tabs,
  activeTabId,
  hostVariant = "page",
  visible = true,
  showTabs = true,
  multiPane = false,
  visibleTabIds,
  multiPaneColumns = 2,
  multiPaneRows = 1,
  terminalFontSize,
  terminalTheme,
  emptyState,
  rightRail,
  rightRailVariant = "commands",
  rightRailOpen = false,
  emptyTabsLabel = "No active terminals",
  onSelectTab,
  onCloseTab,
  onInput,
  onResize,
  onStatus,
  onExit,
  onNewTab
}: TerminalWorkspaceProps) {
  const handlesRef = useRef<Map<string, TerminalHandle>>(new Map());
  const buffersRef = useRef<Map<string, string[]>>(new Map());
  const onExitRef = useRef(onExit);
  const onStatusRef = useRef(onStatus);
  const rootClassName = hostVariant === "pane" ? "pane-terminal-host" : "workspace";
  const bodyClassName =
    hostVariant === "pane"
      ? "pane-terminal-host__body"
      : `workspace__body ${rightRail ? "workspace__body--with-rail" : ""} ${
          rightRailVariant === "relay" ? "workspace__body--with-rail-relay" : ""
        } ${rightRailOpen ? "workspace__body--with-rail-open" : ""}`;
  const mainClassName = hostVariant === "pane" ? "pane-terminal-host__main" : "workspace__main";
  const terminalsClassName =
    hostVariant === "pane"
      ? `pane-terminal-host__terminals ${visible && tabs.length > 0 ? "" : "pane-terminal-host__terminals--hidden"} ${
          multiPane ? "pane-terminal-host__terminals--grid" : ""
        }`
      : `workspace__terminals ${visible && tabs.length > 0 ? "" : "workspace__terminals--hidden"} ${
          multiPane ? "workspace__terminals--grid" : ""
        }`;

  const visibleSet = visibleTabIds ? new Set(visibleTabIds) : null;
  const renderedTabs = multiPane && visibleSet ? tabs.filter((tab) => visibleSet.has(tab.id)) : tabs;

  useEffect(() => {
    onExitRef.current = onExit;
    onStatusRef.current = onStatus;
  }, [onExit, onStatus]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let dispose: (() => void) | undefined;
    let cancelled = false;

    void Promise.all([
      listen<TerminalDataEvent>("terminal:data", (event) => {
        const handle = handlesRef.current.get(event.payload.sessionId);
        if (handle) {
          try {
            handle.terminal.write(event.payload.data, () => {
              handle.terminal.scrollToBottom();
            });
          } catch (error) {
            console.error("terminal write failed", error);
            handlesRef.current.delete(event.payload.sessionId);
          }
          return;
        }

        const nextBuffer = buffersRef.current.get(event.payload.sessionId) ?? [];
        nextBuffer.push(event.payload.data);
        buffersRef.current.set(event.payload.sessionId, nextBuffer);
      }),
      listen<TerminalExitEvent>("terminal:exit", (event) => {
        onExitRef.current(event.payload);
      }),
      listen<TerminalStatusEvent>("terminal:status", (event) => {
        onStatusRef.current(event.payload);
      })
    ]).then((listeners) => {
      const nextDispose = () => listeners.forEach((unlisten) => unlisten());
      if (cancelled) {
        nextDispose();
        return;
      }

      dispose = nextDispose;
    });

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  useEffect(() => {
    if (!activeTabId) {
      return;
    }

    const handle = handlesRef.current.get(activeTabId);
    if (!handle) {
      return;
    }

    requestAnimationFrame(() => {
      handle.terminal.focus();
    });
  }, [activeTabId, tabs.length]);

  return (
    <section className={rootClassName}>
      {showTabs && visible && (tabs.length > 0 || emptyTabsLabel || onNewTab) ? (
        <div className="workspace__tabs">
          {tabs.length === 0 && emptyTabsLabel ? (
            <div className="workspace__tabs-empty">{emptyTabsLabel}</div>
          ) : null}
          {tabs.map((tab) => (
            <div
              className={`tab-button ${tab.id === activeTabId ? "tab-button--active" : ""}`}
              key={tab.id}
            >
              <button
                className="tab-button__select"
                onClick={() => onSelectTab(tab.id)}
                type="button"
              >
                <span className={`status-dot status-dot--${tab.status}`} />
                <span>{tab.title}</span>
                <span className={`tab-button__meta tab-button__meta--${tab.status}`}>
                  {formatTabStatus(tab.status)}
                </span>
              </button>
              <button
                aria-label={`Close ${tab.title}`}
                className="tab-button__close"
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseTab(tab.id);
                }}
                type="button"
              >
                x
              </button>
            </div>
          ))}
          {tabs.length > 0 && onNewTab ? (
            <button
              aria-label="Open another terminal"
              className="tab-button tab-button--action"
              onClick={onNewTab}
              type="button"
            >
              <Plus size={13} />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={bodyClassName}>
        <div className={mainClassName}>
          {!visible || tabs.length === 0 ? (
            emptyState ?? (
              <div className={hostVariant === "pane" ? "pane-terminal-host__empty pane-terminal-host__content" : "workspace__empty workspace__content"}>
                <p>No terminal open</p>
                <span>Open a saved server to start a tmux-aware SSH session.</span>
              </div>
            )
          ) : null}

          <div
            className={terminalsClassName}
            style={
              multiPane
                ? {
                    gridTemplateColumns: `repeat(${multiPaneColumns}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${multiPaneRows}, minmax(0, 1fr))`
                  }
                : undefined
            }
          >
            {renderedTabs.map((tab) => (
              <TerminalPane
                focused={visible && tab.id === activeTabId}
                key={tab.id}
                sessionId={tab.id}
                visible={multiPane || (visible && tab.id === activeTabId)}
                onInput={onInput}
                onReady={(handle) => {
                  handlesRef.current.set(tab.id, handle);
                  const buffered = buffersRef.current.get(tab.id);
                  if (buffered?.length) {
                    buffered.forEach((chunk) => {
                      try {
                        handle.terminal.write(chunk, () => {
                          handle.terminal.scrollToBottom();
                        });
                      } catch (error) {
                        console.error("buffered terminal write failed", error);
                      }
                    });
                    buffersRef.current.delete(tab.id);
                  }
                }}
                onResize={onResize}
                terminalFontSize={terminalFontSize}
                terminalTheme={terminalTheme}
                onTeardown={() => {
                  const handle = handlesRef.current.get(tab.id);
                  handlesRef.current.delete(tab.id);
                  buffersRef.current.delete(tab.id);
                  handle?.terminal.dispose();
                }}
              />
            ))}
          </div>
        </div>

        {rightRail ? (
          <div
            className={`workspace-sidecar ${
              rightRailVariant === "relay" ? "workspace-sidecar--relay" : ""
            } ${rightRailOpen ? "workspace-sidecar--open" : ""}`}
          >
            <div className="workspace-sidecar__hitbox" />
            <aside className="workspace-sidecar__panel">{rightRail}</aside>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function formatTabStatus(status: TerminalTab["status"]) {
  switch (status) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting";
    default:
      return "Disconnected";
  }
}

interface TerminalPaneProps {
  visible: boolean;
  focused: boolean;
  sessionId: string;
  terminalFontSize: number;
  terminalTheme: TerminalWorkspaceProps["terminalTheme"];
  onInput: (sessionId: string, data: string) => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  onReady: (handle: TerminalHandle) => void;
  onTeardown: () => void;
}

function TerminalPane({
  visible,
  focused,
  sessionId,
  terminalFontSize,
  terminalTheme,
  onInput,
  onResize,
  onReady,
  onTeardown
}: TerminalPaneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<TerminalHandle | null>(null);
  const activeRef = useRef(focused);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const syncTimersRef = useRef<number[]>([]);
  const onInputRef = useRef(onInput);
  const onResizeRef = useRef(onResize);
  const onReadyRef = useRef(onReady);
  const onTeardownRef = useRef(onTeardown);

  useEffect(() => {
    activeRef.current = focused;
  }, [focused]);

  useEffect(() => {
    onInputRef.current = onInput;
    onResizeRef.current = onResize;
    onReadyRef.current = onReady;
    onTeardownRef.current = onTeardown;
  }, [onInput, onResize, onReady, onTeardown]);

  useEffect(() => {
    const terminal = new Terminal({
      fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", monospace',
      fontSize: terminalFontSize,
      lineHeight: 1.35,
      cursorBlink: true,
      scrollOnUserInput: true,
      allowTransparency: false,
      customGlyphs: true,
      smoothScrollDuration: 0,
      fastScrollSensitivity: 1,
      scrollback: 5000,
      theme: terminalTheme
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    if (hostRef.current) {
      terminal.open(hostRef.current);
    }

    const dataDisposable = terminal.onData((data) => onInputRef.current(sessionId, data));
    const handle = { terminal, fitAddon };
    handleRef.current = handle;
    onReadyRef.current(handle);

    const syncSize = (force = false) => {
      const currentHandle = handleRef.current;
      const host = hostRef.current;
      if (!currentHandle || !host) {
        return;
      }

      if (host.clientWidth === 0 || host.clientHeight === 0) {
        return;
      }

      currentHandle.fitAddon.fit();
      const nextSize = {
        cols: currentHandle.terminal.cols,
        rows: currentHandle.terminal.rows
      };
      const lastSize = lastSizeRef.current;
      if (nextSize.cols < 20 || nextSize.rows < 2) {
        return;
      }

      if (!force && lastSize?.cols === nextSize.cols && lastSize?.rows === nextSize.rows) {
        return;
      }

      lastSizeRef.current = nextSize;
      onResizeRef.current(sessionId, nextSize.cols, nextSize.rows);
    };

    const scheduleSync = (delay = 0, force = false) => {
      const timer = window.setTimeout(() => {
        syncSize(force);
        if (activeRef.current) {
          handleRef.current?.terminal.focus();
        }
      }, delay);
      syncTimersRef.current.push(timer);
    };

    scheduleSync(0, true);
    scheduleSync(64, true);

    const resizeObserver = new ResizeObserver(() => {
      scheduleSync(0);
    });

    if (hostRef.current) {
      resizeObserver.observe(hostRef.current);
    }

    const handleWindowResize = () => scheduleSync(0, true);
    window.addEventListener("resize", handleWindowResize);

    return () => {
      dataDisposable.dispose();
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleWindowResize);
      syncTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      syncTimersRef.current = [];
      handleRef.current = null;
      onTeardownRef.current();
    };
  }, [sessionId]);

  useEffect(() => {
    const currentHandle = handleRef.current;
    if (!currentHandle) {
      return;
    }

    currentHandle.terminal.options.fontSize = terminalFontSize;
    currentHandle.terminal.options.theme = terminalTheme;
    currentHandle.fitAddon.fit();
  }, [terminalFontSize, terminalTheme]);

  useEffect(() => {
    const currentHandle = handleRef.current;
    if (!visible || !currentHandle) {
      return;
    }

    requestAnimationFrame(() => {
      const nextHandle = handleRef.current;
      if (!nextHandle) {
        return;
      }

      nextHandle.fitAddon.fit();
      const nextSize = { cols: nextHandle.terminal.cols, rows: nextHandle.terminal.rows };
      const lastSize = lastSizeRef.current;
      if (
        nextSize.cols >= 20 &&
        nextSize.rows >= 2 &&
        (lastSize?.cols !== nextSize.cols || lastSize?.rows !== nextSize.rows)
      ) {
        lastSizeRef.current = nextSize;
        onResizeRef.current(sessionId, nextSize.cols, nextSize.rows);
      }
      if (focused) {
        nextHandle.terminal.focus();
      }
    });
  }, [focused, sessionId, visible]);

  return (
    <div className={`terminal-pane ${visible ? "terminal-pane--active" : ""}`}>
      <div className="terminal-pane__surface" ref={hostRef} />
    </div>
  );
}
