import type { ReactNode } from "react";

export type ShellLayoutMode = "home" | "standard" | "wide" | "full";

type PageFrameProps = {
  children: ReactNode;
  mode: ShellLayoutMode;
};

export function PageFrame({ children, mode }: PageFrameProps) {
  return (
    <div className={`page-frame page-frame--${mode}`}>
      <div className="page-frame__inner">{children}</div>
    </div>
  );
}
