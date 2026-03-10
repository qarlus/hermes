import { ArrowLeft, FolderPlus, Search, Settings2 } from "lucide-react";
import type { ViewState } from "../lib/app";

type AppHeaderProps = {
  view: ViewState;
  title: string;
  subtitle: string;
  search: string;
  onSearchChange: (value: string) => void;
  onCreateWorkspace: () => void;
  onBackToDashboard: () => void;
  onEditWorkspace: () => void;
  canEditWorkspace: boolean;
};

export function AppHeader({
  view,
  title,
  subtitle,
  search,
  onSearchChange,
  onCreateWorkspace,
  onBackToDashboard,
  onEditWorkspace,
  canEditWorkspace
}: AppHeaderProps) {
  return (
    <header className="main-panel__header">
      <div className="main-panel__heading">
        <p className="eyebrow">
          {view === "workspace"
            ? "Workspace"
            : view === "sessions"
              ? "Sessions"
              : view === "keychain"
                ? "Secrets"
                : view === "git"
                  ? "Git"
                : "Dashboard"}
        </p>
        <h2>{title}</h2>
        <span>{subtitle}</span>
      </div>

      <div
        className={`main-panel__actions ${view !== "workspace" ? "main-panel__actions--dashboard" : ""}`}
      >
        {view === "dashboard" ? (
          <div className="dashboard-toolbar">
            <label className="dashboard-search">
              <Search size={14} />
              <input
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Find workspace"
                value={search}
              />
            </label>
            <button
              aria-label="New workspace"
              className="ghost-button ghost-button--icon dashboard-toolbar__create"
              onClick={onCreateWorkspace}
              title="New workspace"
              type="button"
            >
              <FolderPlus size={14} />
            </button>
          </div>
        ) : null}

        {view === "keychain" ? (
          <div className="dashboard-toolbar">
            <label className="dashboard-search">
              <Search size={14} />
              <input
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Find credential"
                value={search}
              />
            </label>
          </div>
        ) : null}

        {view === "workspace" ? (
          <>
            <button className="ghost-button" onClick={onBackToDashboard} type="button">
              <ArrowLeft size={14} />
            </button>
            <button
              className="ghost-button"
              disabled={!canEditWorkspace}
              onClick={onEditWorkspace}
              title="Edit workspace"
              type="button"
            >
              <Settings2 size={14} />
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}
