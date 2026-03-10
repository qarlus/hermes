import { RotateCcw, TerminalSquare } from "lucide-react";
import type { TmuxSessionRecord } from "@hermes/core";

interface TmuxSessionListProps {
  sessions: TmuxSessionRecord[];
  loading: boolean;
  onRefresh: () => void;
  onConnect: (sessionName: string) => void;
  embedded?: boolean;
}

export function TmuxSessionList({
  embedded = false,
  sessions,
  loading,
  onRefresh,
  onConnect
}: TmuxSessionListProps) {
  return (
    <section className={`tmux-panel ${embedded ? "tmux-panel--embedded" : ""}`}>
      {!embedded ? (
        <div className="tmux-panel__header">
          <div>
            <p className="eyebrow">Tmux</p>
            <h3>Active Sessions</h3>
          </div>
          <button className="ghost-button ghost-button--icon" onClick={onRefresh} type="button">
            <RotateCcw size={14} />
          </button>
        </div>
      ) : (
        <div className="tmux-panel__toolbar">
          <button className="ghost-button ghost-button--icon" onClick={onRefresh} type="button">
            <RotateCcw size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="tmux-panel__empty">
          <p>Checking tmux...</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="workspace-home__empty-state">
          <span className="workspace-home__empty-icon">
            <TerminalSquare size={16} />
          </span>
          <div className="workspace-home__empty-body">
            <strong>No remote tmux sessions detected</strong>
            <span>Once the host responds, attachable sessions will appear here.</span>
          </div>
        </div>
      ) : (
        <div className="tmux-session-list">
          {sessions.map((session) => (
            <div className="tmux-session-row" key={session.name}>
              <div>
                <strong>{session.name}</strong>
                <span>Rejoin this remote tmux session</span>
              </div>
              <button className="connect-chip" onClick={() => onConnect(session.name)} type="button">
                <TerminalSquare size={14} />
                Rejoin
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
