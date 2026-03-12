import type { ReactNode } from "react";
import { CaretLeft } from "@phosphor-icons/react";
import type { ShellLayoutMode } from "./PageFrame";

type ShellTopbarProps = {
  mode: ShellLayoutMode;
  title: string;
  subtitle?: string;
  meta?: string[];
  actions?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
};

export function ShellTopbar({
  actions,
  backLabel = "Back",
  meta = [],
  mode,
  onBack,
  subtitle,
  title
}: ShellTopbarProps) {
  return (
    <header className="shell-topbar">
      <div className={`shell-topbar__inner shell-topbar__inner--${mode}`}>
        <div className="shell-topbar__leading">
          {onBack ? (
            <button
              aria-label={backLabel}
              className="shell-icon-button shell-icon-button--ghost"
              onClick={onBack}
              type="button"
            >
              <CaretLeft size={15} weight="bold" />
            </button>
          ) : null}

          <div className="shell-topbar__copy">
            <div className="shell-topbar__title-row">
              <h1 className="shell-topbar__title">{title}</h1>
              {meta.length > 0 ? (
                <div className="shell-topbar__meta" role="list">
                  {meta.map((item) => (
                    <span className="shell-topbar__meta-item" key={item} role="listitem">
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            {subtitle ? <p className="shell-topbar__subtitle">{subtitle}</p> : null}
          </div>
        </div>

        {actions ? <div className="shell-topbar__actions">{actions}</div> : null}
      </div>
    </header>
  );
}
