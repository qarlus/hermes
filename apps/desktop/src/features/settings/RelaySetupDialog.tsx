import {
  CheckCircle2,
  Clock3,
  Crown,
  Link2,
  RefreshCw,
  ServerCog,
  ShieldCheck,
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
  relayConflictDomains: string[];
  relayBusyAction: "refresh" | "revoke" | "health" | "inspect" | "approve" | null;
  relayInstallState: "idle" | "installing" | "checking" | "ready" | "error";
  relayInstallMessage: string | null;
  relayInstallTab: TerminalTab | null;
  onClose: () => void;
  onRelayInstallRuntimeChange: (value: "docker" | "appleContainer") => void;
  onInspectRelayHost: () => void;
  onCheckRelayHealth: () => void;
  onOpenRelayInstallSession: () => void;
  onRefreshRelayWorkspace: () => void;
  onApproveRelayDevice: (deviceId: string) => void;
  onRevokeRelayDevice: (deviceId: string) => void;
  onResolveRelayConflict: (strategy: "local" | "remote") => void;
};

export function RelaySetupDialog({
  platform,
  relayState,
  relayHostServer,
  relayConflictDomains,
  relayBusyAction,
  relayInstallState,
  relayInstallMessage,
  relayInstallTab,
  onClose,
  onRelayInstallRuntimeChange,
  onInspectRelayHost,
  onCheckRelayHealth,
  onOpenRelayInstallSession,
  onRefreshRelayWorkspace,
  onApproveRelayDevice,
  onRevokeRelayDevice,
  onResolveRelayConflict
}: RelaySetupDialogProps) {
  const approvedDevices = relayState.devices.filter((device) => device.status === "approved");
  const pendingDevices = relayState.devices.filter((device) => device.status === "pending");
  const isRelayMaster = relayState.currentDeviceRole === "master";
  const isConnectedView =
    Boolean(relayHostServer) &&
    relayState.hostServerId === relayHostServer?.id &&
    (relayState.relayInstalled || relayState.relayHealthy || relayState.devices.length > 0);
  const canRefreshRelay =
    Boolean(relayHostServer) &&
    Boolean(relayState.detectedRelayUrl || relayState.advancedRelayUrl || relayState.detectedRelayUrls.length);
  const activityTone =
    relayInstallState === "ready"
      ? "relay-manage__notice--ready"
      : relayInstallState === "error"
        ? "relay-manage__notice--error"
        : "relay-manage__notice--neutral";
  const showActivityNotice = relayInstallState !== "ready" || Boolean(relayInstallTab);
  const isResolvingInitialState =
    relayBusyAction === "inspect" &&
    relayInstallState === "checking" &&
    !isConnectedView &&
    !relayState.relayInstalled;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section
        aria-label="Relay settings"
        className="modal-card modal-card--relay-setup"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-card__header">
          <div>
            <p className="eyebrow">Sync</p>
            <h2>Relay on {relayHostServer ? serverDisplayLabel(relayHostServer) : "saved server"}</h2>
            <span>
              {isConnectedView
                ? "Manage the active relay host, inspect device trust, and keep the package current from the server that owns it."
                : "Use this server as the single Hermes relay host. Hermes can inspect the host, open the install session, and link this device automatically."}
            </span>
          </div>
          <div className="tool-updates__header-actions">
            <span className="settings-pill">{getDevicePlatformLabel(platform)}</span>
            <button
              aria-label="Close relay settings"
              className="ghost-button ghost-button--icon"
              onClick={onClose}
              type="button"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="modal-card__body relay-setup-dialog">
          {isConnectedView ? (
            <div className="relay-manage">
              <section className="relay-manage__summary">
                <div className="relay-manage__summary-main">
                  <div className="relay-manage__eyebrow">
                    <ShieldCheck size={14} />
                    Active relay host
                  </div>
                  <h3>{serverDisplayLabel(relayHostServer!)}</h3>
                  <div className="relay-manage__tags">
                    <span className="settings-pill">SSH {buildSshTarget(relayHostServer!)}</span>
                    <span className="settings-pill">
                      {relayState.relayHealthy ? "Healthy" : "Needs check"}
                    </span>
                    <span className="settings-pill">
                      {relayState.currentDeviceRole === "master" ? "Admin device" : "Linked device"}
                    </span>
                    <span className="settings-pill">
                      {approvedDevices.length} device{approvedDevices.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                <div className="relay-manage__summary-side">
                  <span>Endpoint</span>
                  <strong>{relayState.detectedRelayUrl ?? "Not discovered yet"}</strong>
                  <small>{relayState.relayVersion ? `Relay v${relayState.relayVersion}` : "Ciphertext-only relay package"}</small>
                </div>
              </section>

              <div className="relay-manage__grid">
                <section className="relay-manage__panel relay-manage__panel--primary">
                  <div className="relay-manage__panel-header">
                    <div>
                      <p className="eyebrow">Relay</p>
                      <h4>Host controls</h4>
                    </div>
                    <span className="settings-pill">
                      <Link2 size={13} />
                      {relayState.relayHealthy ? "Linked" : "Needs attention"}
                    </span>
                  </div>

                  <div className="relay-manage__facts">
                    <div className="relay-manage__fact">
                      <span>Last contact</span>
                      <strong>{relayState.lastConnectedAt ? new Date(relayState.lastConnectedAt).toLocaleString() : "Not connected yet"}</strong>
                    </div>
                    <div className="relay-manage__fact">
                      <span>Runtime</span>
                      <strong>{relayState.installRuntime === "docker" ? "Docker container" : "Apple Container"}</strong>
                    </div>
                    <div className="relay-manage__fact">
                      <span>This device</span>
                      <strong>{relayState.deviceName}</strong>
                    </div>
                    <div className="relay-manage__fact">
                      <span>Relay ID</span>
                      <strong>{relayState.relayId ?? "Unavailable"}</strong>
                    </div>
                  </div>

                  <div className="relay-manage__actions">
                    <button
                      className="primary-button"
                      disabled={!relayHostServer}
                      onClick={onOpenRelayInstallSession}
                      type="button"
                    >
                      <TerminalSquare size={14} />
                      Update relay
                    </button>
                    <button
                      className="ghost-button"
                      disabled={!canRefreshRelay || relayBusyAction !== null}
                      onClick={onRefreshRelayWorkspace}
                      type="button"
                    >
                      <RefreshCw size={14} />
                      {relayBusyAction === "refresh" ? "Refreshing..." : "Refresh"}
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
                      disabled={!relayHostServer || relayBusyAction !== null}
                      onClick={onInspectRelayHost}
                      type="button"
                    >
                      <WandSparkles size={14} />
                      {relayBusyAction === "inspect" ? "Inspecting..." : "Re-scan host"}
                    </button>
                  </div>

                  {showActivityNotice ? (
                    <div className={`relay-manage__notice ${activityTone}`}>
                      <strong>
                        {relayInstallState === "error"
                          ? "Relay needs attention"
                          : relayInstallState === "checking"
                            ? "Checking relay"
                            : relayInstallState === "installing"
                              ? "Install session running"
                              : "Relay connected"}
                      </strong>
                      <span>
                        {relayInstallMessage ??
                          "Use Update relay to open a visible install session in Sessions with the command already queued."}
                      </span>
                      {relayInstallTab ? (
                        <small>
                          Install session: {relayInstallTab.title} / {relayInstallTab.status}
                        </small>
                      ) : null}
                    </div>
                  ) : null}

                  {relayState.syncConflict ? (
                    <div className="relay-manage__conflict">
                      <div className="relay-manage__conflict-copy">
                        <strong>Sync conflict</strong>
                        <span>{relayState.syncConflict}</span>
                        {relayConflictDomains.length > 0 ? (
                          <div className="relay-manage__tags">
                            {relayConflictDomains.map((domain) => (
                              <span className="settings-pill" key={domain}>
                                {domain}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="relay-manage__actions">
                        <button className="ghost-button" onClick={() => onResolveRelayConflict("local")} type="button">
                          Keep local
                        </button>
                        <button className="ghost-button" onClick={() => onResolveRelayConflict("remote")} type="button">
                          Use remote
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="relay-manage__panel">
                  <div className="relay-manage__panel-header">
                    <div>
                      <p className="eyebrow">Devices</p>
                      <h4>Connected devices</h4>
                    </div>
                    <span className="settings-pill">
                      <ServerCog size={13} />
                      {relayState.currentDeviceRole === "master" ? "Admin" : "Linked"}
                    </span>
                  </div>

                  <div className="relay-manage__device-list">
                    {relayState.devices.length === 0 ? (
                      <div className="relay-manage__empty">
                        <Clock3 size={16} />
                        <div>
                          <strong>No linked devices yet</strong>
                          <span>New Hermes clients will appear here once they reach this relay over Tailscale.</span>
                        </div>
                      </div>
                    ) : (
                      relayState.devices.map((device) => (
                        <div className="relay-manage__device" key={device.id}>
                          <div className="relay-manage__device-main">
                            <span className={`relay-manage__device-badge relay-manage__device-badge--${device.status}`}>
                              {device.role === "master" ? <Crown size={13} /> : <CheckCircle2 size={13} />}
                            </span>
                            <div className="relay-manage__device-copy">
                              <strong>
                                {device.name}
                                {device.id === relayState.currentDeviceId ? " (this device)" : ""}
                              </strong>
                              <span>
                                {getDevicePlatformLabel(device.platform)} / {device.status}
                                {device.role ? ` / ${device.role}` : ""}
                              </span>
                            </div>
                          </div>

                          <div className="relay-manage__device-actions">
                            {isRelayMaster &&
                            device.id !== relayState.currentDeviceId &&
                            device.status === "pending" ? (
                              <button
                                className="primary-button"
                                disabled={relayBusyAction !== null}
                                onClick={() => onApproveRelayDevice(device.id)}
                                type="button"
                              >
                                {relayBusyAction === "approve" ? "Approving..." : "Approve"}
                              </button>
                            ) : null}
                            {isRelayMaster &&
                            device.id !== relayState.currentDeviceId &&
                            device.status === "approved" ? (
                              <button
                                className="ghost-button"
                                disabled={relayBusyAction !== null}
                                onClick={() => onRevokeRelayDevice(device.id)}
                                type="button"
                              >
                                {relayBusyAction === "revoke" ? "Revoking..." : "Revoke"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </div>
          ) : isResolvingInitialState ? (
            <div className="relay-manage relay-manage--setup">
              <section className="relay-manage__hero relay-manage__hero--setup">
                <div className="relay-manage__hero-main">
                  <div className="relay-manage__eyebrow">
                    <WandSparkles size={14} />
                    Checking server
                  </div>
                  <h3>{relayHostServer ? serverDisplayLabel(relayHostServer) : "Relay host"}</h3>
                  <p>
                    Hermes is checking this server for an existing relay package, verifying Tailscale, and resolving the endpoint before choosing the correct modal state.
                  </p>
                </div>
              </section>

              <div className="relay-manage__notice relay-manage__notice--neutral">
                <strong>Inspecting host</strong>
                <span>{relayInstallMessage ?? "Checking relay host state."}</span>
              </div>
            </div>
          ) : (
            <div className="relay-manage relay-manage--setup">
              <section className="relay-manage__hero relay-manage__hero--setup">
                <div className="relay-manage__hero-main">
                  <div className="relay-manage__eyebrow">
                    <ServerCog size={14} />
                    Automatic setup
                  </div>
                  <h3>{relayHostServer ? serverDisplayLabel(relayHostServer) : "Relay host"}</h3>
                  <p>
                    Hermes will inspect this host, discover the Tailscale endpoint, open the install session in Sessions, and link this device once the relay is reachable.
                  </p>
                </div>

                <div className="relay-manage__hero-stats">
                  <div className="relay-manage__stat">
                    <span>Host</span>
                    <strong>{relayHostServer ? buildSshTarget(relayHostServer) : "Not selected"}</strong>
                    <small>Relay setup is always tied to a saved server.</small>
                  </div>
                </div>
              </section>

              <section className="relay-manage__panel relay-manage__panel--primary">
                <div className="relay-manage__actions">
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
                </div>

                <label className="field relay-manage__runtime">
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

                <div className={`relay-manage__notice ${activityTone}`}>
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
                      "Hermes can inspect the host, queue the install command, and keep checking until the relay comes online."}
                  </span>
                  {relayInstallTab ? (
                    <small>
                      Install session: {relayInstallTab.title} / {relayInstallTab.status}
                    </small>
                  ) : null}
                </div>
              </section>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
