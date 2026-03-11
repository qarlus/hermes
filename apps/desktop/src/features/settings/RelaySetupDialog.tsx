import {
  CheckCircle2,
  CircleDashed,
  Link2,
  RefreshCw,
  TerminalSquare,
  WandSparkles,
  X
} from "lucide-react";
import { buildSshTarget, serverDisplayLabel, type ServerRecord, type TerminalTab } from "@hermes/core";
import type { DevicePlatform, RelayClientState } from "../../lib/settings";
import { getDevicePlatformLabel } from "../../lib/settings";

type RelaySetupDialogProps = {
  platform: DevicePlatform;
  relayState: RelayClientState;
  relayHostServer: ServerRecord | null;
  relayBusyAction: "refresh" | "revoke" | "health" | "inspect" | null;
  relayInstallState: "idle" | "installing" | "checking" | "ready" | "error";
  relayInstallMessage: string | null;
  relayInstallTab: TerminalTab | null;
  onClose: () => void;
  onRelayInstallRuntimeChange: (value: "docker" | "appleContainer") => void;
  onInspectRelayHost: () => void;
  onCheckRelayHealth: () => void;
  onOpenRelayInstallSession: () => void;
  onRefreshRelayWorkspace: () => void;
};

export function RelaySetupDialog({
  platform,
  relayState,
  relayHostServer,
  relayBusyAction,
  relayInstallState,
  relayInstallMessage,
  relayInstallTab,
  onClose,
  onRelayInstallRuntimeChange,
  onInspectRelayHost,
  onCheckRelayHealth,
  onOpenRelayInstallSession,
  onRefreshRelayWorkspace
}: RelaySetupDialogProps) {
  const isRelayLinked = Boolean(relayState.currentDeviceId);
  const stepItems = [
    {
      label: "Server selected",
      complete: Boolean(relayHostServer),
      detail: relayHostServer
        ? `${serverDisplayLabel(relayHostServer)} / ${buildSshTarget(relayHostServer)}`
        : "Open Relay from a saved server to bind setup to that host."
    },
    {
      label: "Tailscale endpoint discovered",
      complete: Boolean(relayState.detectedRelayUrl),
      detail:
        relayState.detectedRelayUrl ??
        "Hermes will inspect the host, confirm Tailscale, and pick the relay address automatically."
    },
    {
      label: "Relay package running",
      complete: relayState.relayHealthy,
      detail: relayState.relayHealthy
        ? `Healthy${relayState.relayVersion ? ` / v${relayState.relayVersion}` : ""}`
        : relayState.relayInstalled
          ? relayState.relayRunning
            ? "Container is running. Finish with a relay health check."
            : "Package exists on the host but is not running yet."
          : "Install Hermes Relay on the selected host."
    },
    {
      label: "This device linked",
      complete: isRelayLinked,
      detail: isRelayLinked
        ? `${relayState.currentDeviceRole === "master" ? "Master" : "Member"} device connected automatically`
        : "Hermes links this device automatically once the relay is reachable."
    }
  ];

  const activityTone =
    relayInstallState === "ready"
      ? "relay-setup-dialog__activity--ready"
      : relayInstallState === "error"
        ? "relay-setup-dialog__activity--error"
        : "relay-setup-dialog__activity--running";

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section
        aria-label="Relay setup"
        className="modal-card modal-card--relay-setup"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-card__header">
          <div>
            <p className="eyebrow">Sync</p>
            <h2>Relay on {relayHostServer ? serverDisplayLabel(relayHostServer) : "saved server"}</h2>
            <span>
              Hermes installs and checks the relay in the background, then links this device automatically.
            </span>
          </div>
          <div className="tool-updates__header-actions">
            <span className="settings-pill">{getDevicePlatformLabel(platform)}</span>
            <button
              aria-label="Close relay setup"
              className="ghost-button ghost-button--icon"
              onClick={onClose}
              type="button"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="modal-card__body relay-setup-dialog">
          <section className="relay-setup__section">
            <div className="relay-setup__header">
              <div>
                <p className="eyebrow">Host</p>
                <h3>Automatic setup</h3>
                <span>Use the selected server as the single Hermes relay host. Nothing is stored on Hermes infrastructure.</span>
              </div>
            </div>

            <div className="settings-relay-meta">
              <span className="settings-pill">
                Host: {relayHostServer ? `${serverDisplayLabel(relayHostServer)} / ${buildSshTarget(relayHostServer)}` : "Not selected"}
              </span>
              <span className="settings-pill">
                Runtime: {relayState.installRuntime === "docker" ? "Docker" : "Apple Container"}
              </span>
              {relayState.detectedRelayUrl ? (
                <span className="settings-pill">Relay URL: {relayState.detectedRelayUrl}</span>
              ) : null}
            </div>

            <label className="field">
              <span>Install runtime</span>
              <select
                onChange={(event) =>
                  onRelayInstallRuntimeChange(event.target.value as "docker" | "appleContainer")
                }
                value={relayState.installRuntime}
              >
                <option value="docker">Docker / Linux container host</option>
                <option value="appleContainer">Apple Container / macOS relay host</option>
              </select>
            </label>

            <div className="settings-card__actions">
              <button
                className="ghost-button"
                disabled={!relayHostServer || relayBusyAction !== null}
                onClick={onInspectRelayHost}
                type="button"
              >
                <WandSparkles size={14} />
                {relayBusyAction === "inspect" ? "Inspecting..." : "Check host"}
              </button>
              <button
                className="primary-button"
                disabled={!relayHostServer}
                onClick={onOpenRelayInstallSession}
                type="button"
              >
                <TerminalSquare size={14} />
                Install automatically
              </button>
              <button
                className="ghost-button"
                disabled={!relayHostServer || relayBusyAction !== null}
                onClick={onCheckRelayHealth}
                type="button"
              >
                <Link2 size={14} />
                {relayBusyAction === "health" ? "Checking..." : "Check relay"}
              </button>
              <button
                className="ghost-button"
                disabled={!isRelayLinked || relayBusyAction !== null}
                onClick={onRefreshRelayWorkspace}
                type="button"
              >
                <RefreshCw size={14} />
                {relayBusyAction === "refresh" ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            <div className={`relay-setup-dialog__activity ${activityTone}`}>
              <strong>
                {relayInstallState === "ready"
                  ? "Relay connected"
                  : relayInstallState === "error"
                    ? "Relay needs attention"
                    : relayInstallState === "checking"
                      ? "Checking relay"
                      : relayInstallState === "installing"
                        ? "Install session running"
                        : "Ready to install"}
              </strong>
              <span>
                {relayInstallMessage ??
                  "Hermes can inspect the host, open the install session in Sessions, and keep checking until the relay is reachable."}
              </span>
              {relayInstallTab ? (
                <small>
                  Install session: {relayInstallTab.title} / {relayInstallTab.status}
                </small>
              ) : null}
            </div>
          </section>

          <section className="relay-setup__section">
            <div className="relay-setup__header">
              <div>
                <p className="eyebrow">Progress</p>
                <h3>Live setup state</h3>
                <span>Hermes keeps checking the selected host and relay endpoint while setup is active.</span>
              </div>
            </div>

            <div className="relay-setup-dialog__steps">
              {stepItems.map((step) => (
                <div className="relay-setup-dialog__step" key={step.label}>
                  <span className={`relay-setup-dialog__step-icon ${step.complete ? "relay-setup-dialog__step-icon--complete" : ""}`}>
                    {step.complete ? <CheckCircle2 size={14} /> : <CircleDashed size={14} />}
                  </span>
                  <div className="relay-setup-dialog__step-copy">
                    <strong>{step.label}</strong>
                    <span>{step.detail}</span>
                  </div>
                </div>
              ))}
            </div>

          </section>
        </div>
      </section>
    </div>
  );
}
