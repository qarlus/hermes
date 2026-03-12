import type { ReactNode } from "react";
import { PageFrame, type ShellLayoutMode } from "./PageFrame";

type AppShellProps = {
  children: ReactNode;
  topbar: ReactNode;
  layoutMode: ShellLayoutMode;
  rail: ReactNode;
  secondaryRail?: ReactNode;
  secondaryRailLabel?: string;
};

export function AppShell({
  children,
  topbar,
  layoutMode,
  rail,
  secondaryRail,
  secondaryRailLabel = "Secondary navigation"
}: AppShellProps) {
  const hasSecondaryRail = Boolean(secondaryRail);

  return (
    <div
      className={`desktop-shell desktop-shell--${layoutMode} ${
        hasSecondaryRail ? "desktop-shell--with-secondary" : ""
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
