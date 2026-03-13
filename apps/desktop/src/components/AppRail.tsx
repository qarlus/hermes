import type { ComponentType } from "react";
import {
  DesktopTower,
  FolderSimple,
  GearSix,
  GitBranch,
  House,
  Key,
  ListBullets,
  TerminalWindow
} from "@phosphor-icons/react";
import type { ViewState } from "../lib/app";

type AppRailProps = {
  view: ViewState;
  onNavigate: (view: ViewState) => void;
};

type RailIcon = ComponentType<{ size?: number; weight?: "bold" | "duotone" | "fill" | "light" | "regular" | "thin" }>;

type RailItemConfig = {
  icon: RailIcon;
  label: string;
  title: string;
  view?: ViewState;
};

const RAIL_ITEMS: RailItemConfig[] = [
  { icon: House, label: "Home", title: "Home", view: "dashboard" },
  { icon: TerminalWindow, label: "Sessions", title: "Sessions", view: "sessions" },
  { icon: DesktopTower, label: "Connections", title: "Connections", view: "workspace" },
  { icon: Key, label: "Keychain", title: "Keychain", view: "keychain" },
  { icon: GitBranch, label: "Git", title: "Git", view: "git" },
  { icon: FolderSimple, label: "Files", title: "Files", view: "files" },
  { icon: GearSix, label: "Settings", title: "Settings", view: "settings" },
  { icon: ListBullets, label: "Logs", title: "Logs" }
];

export function AppRail({ view, onNavigate }: AppRailProps) {
  return (
    <aside className="app-rail" aria-label="Global navigation">
      <button
        aria-label="Open Home"
        className="app-rail__brand"
        onClick={() => onNavigate("dashboard")}
        title="Hermes"
        type="button"
      >
        <span className="app-rail__brand-mark">H</span>
      </button>

      <nav className="app-rail__nav">
        {RAIL_ITEMS.map((item) => {
          const targetView = item.view;

          return (
            <AppRailItem
              icon={item.icon}
              isActive={targetView === view}
              key={item.label}
              label={item.label}
              onClick={targetView ? () => onNavigate(targetView) : undefined}
              title={item.title}
            />
          );
        })}
      </nav>
    </aside>
  );
}

type AppRailItemProps = {
  icon: RailIcon;
  isActive: boolean;
  label: string;
  onClick?: () => void;
  title: string;
};

export function AppRailItem({ icon: Icon, isActive, label, onClick, title }: AppRailItemProps) {
  const isDisabled = !onClick;

  return (
    <button
      aria-current={isActive ? "page" : undefined}
      aria-label={label}
      aria-disabled={isDisabled || undefined}
      className={`app-rail__item ${isActive ? "app-rail__item--active" : ""} ${
        isDisabled ? "app-rail__item--disabled" : ""
      }`}
      disabled={isDisabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      <span aria-hidden="true" className="app-rail__item-icon">
        <Icon size={16} weight={isActive ? "fill" : "regular"} />
      </span>
    </button>
  );
}
