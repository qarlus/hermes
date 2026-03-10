import { ArrowUpCircle, CheckCircle2, RefreshCw, TriangleAlert, X } from "lucide-react";
import type { CliToolUpdateRecord } from "@hermes/core";

interface ToolUpdatesPanelProps {
  tools: CliToolUpdateRecord[];
  loading: boolean;
  updatingToolId: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onRunUpdate: (toolId: string) => void;
}

export function ToolUpdatesPanel({
  tools,
  loading,
  updatingToolId,
  onClose,
  onRefresh,
  onRunUpdate
}: ToolUpdatesPanelProps) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section
        aria-label="Agent updates"
        className="modal-card modal-card--session-launcher"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-card__header">
          <div>
            <p className="eyebrow">Sessions</p>
            <h2>Agent updates</h2>
          </div>
          <div className="tool-updates__header-actions">
            <button className="ghost-button" disabled={loading} onClick={onRefresh} type="button">
              <RefreshCw size={14} />
              Refresh
            </button>
            <button
              aria-label="Close agent updates"
              className="ghost-button ghost-button--icon"
              onClick={onClose}
              type="button"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="modal-card__body tool-updates">
          <section className="session-launcher__section">
            <div className="session-launcher__header">
              <p className="eyebrow">Coding agents</p>
              <span>Check installed coding-agent CLIs and run supported updates on this device.</span>
            </div>

            {loading && tools.length === 0 ? (
              <div className="tool-updates__empty">
                <span>Checking installed coding agents...</span>
              </div>
            ) : tools.length === 0 ? (
              <div className="tool-updates__empty">
                <span>No supported coding-agent CLIs are installed on this device.</span>
              </div>
            ) : (
              <div className="tool-updates__list">
                {tools.map((tool) => {
                  const stateClassName = `tool-updates__state tool-updates__state--${tool.state}`;

                  return (
                    <article className="tool-updates__row" key={tool.id}>
                      <div className="tool-updates__main">
                        <div className="tool-updates__identity">
                          <div
                            className={`tool-updates__icon${tool.state === "checking" ? " tool-updates__icon--checking" : ""}`}
                          >
                            {tool.state === "upToDate" ? (
                              <CheckCircle2 size={14} />
                            ) : tool.state === "checking" ? (
                              <RefreshCw size={14} />
                            ) : tool.state === "updateAvailable" ? (
                              <ArrowUpCircle size={14} />
                            ) : (
                              <TriangleAlert size={14} />
                            )}
                          </div>
                          <div className="tool-updates__body">
                            <div className="tool-updates__topline">
                              <strong>{tool.name}</strong>
                              <span className={stateClassName}>{labelForState(tool.state)}</span>
                            </div>
                            <span>{tool.description}</span>
                          </div>
                        </div>

                        <div className="tool-updates__meta">
                          <div className="tool-updates__version">
                            <span>Current</span>
                            <strong>{tool.currentVersion ?? "Not installed"}</strong>
                          </div>
                          <div className="tool-updates__version">
                            <span>Latest</span>
                            <strong>{tool.latestVersion ?? "Unavailable"}</strong>
                          </div>
                        </div>
                      </div>

                      <div className="tool-updates__footer">
                        <span>{tool.message}</span>
                        <button
                          className="ghost-button"
                          disabled={
                            !tool.canRunUpdate ||
                            updatingToolId === tool.id ||
                            tool.state === "checking"
                          }
                          onClick={() => onRunUpdate(tool.id)}
                          type="button"
                        >
                          <ArrowUpCircle size={14} />
                          {updatingToolId === tool.id ? "Running..." : tool.actionLabel}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function labelForState(state: CliToolUpdateRecord["state"]) {
  switch (state) {
    case "checking":
      return "Checking";
    case "upToDate":
      return "Up to date";
    case "updateAvailable":
      return "Update ready";
    case "notInstalled":
      return "Not installed";
    default:
      return "Status limited";
  }
}
