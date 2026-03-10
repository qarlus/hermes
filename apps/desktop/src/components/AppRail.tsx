import { Boxes, FolderGit2, HardDrive, KeyRound, Logs, TerminalSquare } from "lucide-react";
import type { ViewState } from "../lib/app";

type AppRailProps = {
  view: ViewState;
  onNavigate: (view: ViewState) => void;
};

export function AppRail({ view, onNavigate }: AppRailProps) {
  return (
    <div className="rail-shell">
      <div className="rail-hitbox" />
      <aside className="rail">
        <div className="rail__brand">H</div>
        <div className="rail__nav">
          <button
            className={`rail__item ${view === "dashboard" ? "rail__item--active" : ""}`}
            onClick={() => onNavigate("dashboard")}
            title="Dashboard"
            type="button"
          >
            <HardDrive size={16} />
            <span>Dashboard</span>
          </button>
          <button
            className={`rail__item ${view === "sessions" ? "rail__item--active" : ""}`}
            onClick={() => onNavigate("sessions")}
            title="Sessions"
            type="button"
          >
            <TerminalSquare size={16} />
            <span>Sessions</span>
          </button>
          <button
            className={`rail__item ${view === "keychain" ? "rail__item--active" : ""}`}
            onClick={() => onNavigate("keychain")}
            title="Keychain"
            type="button"
          >
            <KeyRound size={16} />
            <span>Keychain</span>
          </button>
          <button
            className={`rail__item ${view === "git" ? "rail__item--active" : ""}`}
            onClick={() => onNavigate("git")}
            title="Git"
            type="button"
          >
            <FolderGit2 size={16} />
            <span>Git</span>
          </button>
          <button
            className={`rail__item ${view === "files" ? "rail__item--active" : ""}`}
            onClick={() => onNavigate("files")}
            title="Files"
            type="button"
          >
            <Boxes size={16} />
            <span>Files</span>
          </button>
          <button className="rail__item" title="Logs" type="button">
            <Logs size={16} />
            <span>Logs</span>
          </button>
        </div>
      </aside>
    </div>
  );
}
