import type { ReactNode } from "react";
import { PageFrame, type ShellLayoutMode } from "./PageFrame";

type AppShellProps = {
  children: ReactNode;
  topbar: ReactNode;
  layoutMode: ShellLayoutMode;
  rail: ReactNode;
  railCollapsed?: boolean;
  secondaryRail?: ReactNode;
  secondaryRailCollapsed?: boolean;
  secondaryRailLabel?: string;
};

export function AppShell({
  children,
  topbar,
  layoutMode,
  rail,
  railCollapsed = false,
  secondaryRail,
  secondaryRailCollapsed = false,
  secondaryRailLabel = "Secondary navigation"
}: AppShellProps) {
  const hasSecondaryRail = Boolean(secondaryRail);

  return (
    <div
      className={`desktop-shell desktop-shell--${layoutMode} ${
        hasSecondaryRail ? "desktop-shell--with-secondary" : ""
      } ${railCollapsed ? "desktop-shell--rail-collapsed" : ""} ${
        secondaryRailCollapsed ? "desktop-shell--secondary-collapsed" : ""
      }`}
    >
      <div className="desktop-shell__rail">{rail}</div>
      {hasSecondaryRail ? (
        <aside aria-label={secondaryRailLabel} className="desktop-shell__secondary">
          {secondaryRail}
        </aside>
      ) : null}
      <div className="desktop-shell__main">
        {topbar}
        <PageFrame mode={layoutMode}>{children}</PageFrame>
      </div>
    </div>
  );
}
