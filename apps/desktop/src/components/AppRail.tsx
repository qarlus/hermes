import { Boxes, HardDrive, KeyRound, Logs } from "lucide-react";

type ViewState = "dashboard" | "workspace" | "keychain";

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
            className={`rail__item ${view === "keychain" ? "rail__item--active" : ""}`}
            onClick={() => onNavigate("keychain")}
            title="Keychain"
            type="button"
          >
            <KeyRound size={16} />
            <span>Keychain</span>
          </button>
          <button className="rail__item" title="SFTP" type="button">
            <Boxes size={16} />
            <span>SFTP</span>
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
