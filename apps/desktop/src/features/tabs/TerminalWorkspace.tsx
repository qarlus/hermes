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
  visible?: boolean;
  emptyState?: ReactNode;
  rightRail?: ReactNode;
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
  visible = true,
  emptyState,
  rightRail,
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
    <section className="workspace">
      {visible && (tabs.length > 0 || emptyTabsLabel || onNewTab) ? (
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

      <div className={`workspace__body ${rightRail ? "workspace__body--with-rail" : ""}`}>
        <div className="workspace__main">
          {!visible || tabs.length === 0 ? (
            emptyState ?? (
              <div className="workspace__empty workspace__content">
                <p>No terminal open</p>
                <span>Open a saved server to start a tmux-aware SSH session.</span>
              </div>
            )
          ) : null}

          <div
            className={`workspace__terminals ${
              visible && tabs.length > 0 ? "" : "workspace__terminals--hidden"
            }`}
          >
            {tabs.map((tab) => (
              <TerminalPane
                active={visible && tab.id === activeTabId}
                key={tab.id}
                sessionId={tab.id}
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
          <div className="workspace-sidecar">
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
  active: boolean;
  sessionId: string;
  onInput: (sessionId: string, data: string) => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  onReady: (handle: TerminalHandle) => void;
  onTeardown: () => void;
}

function TerminalPane({
  active,
  sessionId,
  onInput,
  onResize,
  onReady,
  onTeardown
}: TerminalPaneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<TerminalHandle | null>(null);
  const activeRef = useRef(active);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const syncTimersRef = useRef<number[]>([]);
  const onInputRef = useRef(onInput);
  const onResizeRef = useRef(onResize);
  const onReadyRef = useRef(onReady);
  const onTeardownRef = useRef(onTeardown);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    onInputRef.current = onInput;
    onResizeRef.current = onResize;
    onReadyRef.current = onReady;
    onTeardownRef.current = onTeardown;
  }, [onInput, onResize, onReady, onTeardown]);

  useEffect(() => {
    const terminal = new Terminal({
      fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", monospace',
      fontSize: 13,
      lineHeight: 1.35,
      cursorBlink: true,
      scrollOnUserInput: true,
      allowTransparency: false,
      customGlyphs: true,
      smoothScrollDuration: 0,
      fastScrollSensitivity: 1,
      scrollback: 5000,
      theme: {
        background: "#000000",
        foreground: "#f4f7fb",
        cursor: "#8ed2ff",
        cursorAccent: "#000000",
        selectionBackground: "rgba(255, 255, 255, 0.14)",
        black: "#000000",
        red: "#ff7d81",
        green: "#79f0b2",
        yellow: "#f5d06f",
        blue: "#8ed2ff",
        magenta: "#cba6ff",
        cyan: "#82e6e6",
        white: "#f4f7fb",
        brightBlack: "#586274",
        brightRed: "#ff9ca0",
        brightGreen: "#9ff7c4",
        brightYellow: "#ffe08d",
        brightBlue: "#bde8ff",
        brightMagenta: "#dbb9ff",
        brightCyan: "#9eeded",
        brightWhite: "#ffffff"
      }
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
    if (!active || !currentHandle) {
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
      nextHandle.terminal.focus();
    });
  }, [active, sessionId]);

  return (
    <div className={`terminal-pane ${active ? "terminal-pane--active" : ""}`}>
      <div className="terminal-pane__surface" ref={hostRef} />
    </div>
  );
}
