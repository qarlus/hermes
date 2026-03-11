import { Copy, Link2, RefreshCw, ServerCog, Shield, TerminalSquare, X } from "lucide-react";
import { buildSshTarget, serverDisplayLabel, type ServerRecord } from "@hermes/core";
import type { DevicePlatform, RelayClientState } from "../../lib/settings";
import { getDevicePlatformLabel } from "../../lib/settings";

type RelaySetupDialogProps = {
  platform: DevicePlatform;
  relayState: RelayClientState;
  servers: ServerRecord[];
  relayBusyAction: "bootstrap" | "join" | "refresh" | "revoke" | "health" | null;
  onClose: () => void;
  onRelayHostServerChange: (serverId: string) => void;
  onRelayInstallRuntimeChange: (value: "docker" | "appleContainer") => void;
  onRelayWorkspaceNameChange: (value: string) => void;
  onRelayWorkspaceIdChange: (value: string) => void;
  onRelayAdminTokenChange: (value: string) => void;
  onRelayDeviceNameChange: (value: string) => void;
  onRelayUrlChange: (value: string) => void;
  onCheckRelayHealth: () => void;
  onOpenRelayCheckSession: () => void;
  onOpenRelayInstallSession: () => void;
  onBootstrapRelayWorkspace: () => void;
  onJoinRelayWorkspace: () => void;
  onRefreshRelayWorkspace: () => void;
  onRevokeRelayDevice: (deviceId: string) => void;
};

export function RelaySetupDialog({
  platform,
  relayState,
  servers,
  relayBusyAction,
  onClose,
  onRelayHostServerChange,
  onRelayInstallRuntimeChange,
  onRelayWorkspaceNameChange,
  onRelayWorkspaceIdChange,
  onRelayAdminTokenChange,
  onRelayDeviceNameChange,
  onRelayUrlChange,
  onCheckRelayHealth,
  onOpenRelayCheckSession,
  onOpenRelayInstallSession,
  onBootstrapRelayWorkspace,
  onJoinRelayWorkspace,
  onRefreshRelayWorkspace,
  onRevokeRelayDevice
}: RelaySetupDialogProps) {
  const selectedRelayServer =
    servers.find((server) => server.id === relayState.hostServerId) ?? null;
  const isRelayLinked = Boolean(relayState.workspaceId && relayState.currentDeviceId);
  const isRelayMaster = relayState.currentDeviceRole === "master";

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
            <h2>Relay setup</h2>
          </div>
          <button
            aria-label="Close relay setup"
            className="ghost-button ghost-button--icon"
            onClick={onClose}
            type="button"
          >
            <X size={14} />
          </button>
        </div>

        <div className="modal-card__body relay-setup">
          <section className="relay-setup__section">
            <div className="relay-setup__header">
              <div>
                <p className="eyebrow">Host</p>
                <h3>Choose relay host</h3>
                <span>Pick a saved server, then run the generated check or install command in a real SSH session.</span>
              </div>
              <span className="settings-pill">{getDevicePlatformLabel(platform)}</span>
            </div>

            <div className="settings-form-grid">
              <label className="field">
                <span>Relay host server</span>
                <select
                  onChange={(event) => onRelayHostServerChange(event.target.value)}
                  value={relayState.hostServerId ?? ""}
                >
                  <option value="">Choose a saved server</option>
                  {servers.map((server) => (
                    <option key={server.id} value={server.id}>
                      {serverDisplayLabel(server)} - {buildSshTarget(server)}
                    </option>
                  ))}
                </select>
              </label>

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
            </div>

            <div className="settings-relay-meta">
              <span className="settings-pill">
                Host:{" "}
                {selectedRelayServer
                  ? `${serverDisplayLabel(selectedRelayServer)} / ${buildSshTarget(selectedRelayServer)}`
                  : "Not selected"}
              </span>
              <span className="settings-pill">
                Runtime: {relayState.installRuntime === "docker" ? "Docker" : "Apple Container"}
              </span>
            </div>

            <div className="settings-card__actions">
              <button className="ghost-button" disabled={!selectedRelayServer} onClick={onOpenRelayCheckSession} type="button">
                <TerminalSquare size={14} />
                Check prerequisites
              </button>
              <button className="ghost-button" disabled={!selectedRelayServer} onClick={onOpenRelayInstallSession} type="button">
                <TerminalSquare size={14} />
                Install on host
              </button>
              <button
                className="ghost-button"
                disabled={!selectedRelayServer || relayBusyAction !== null}
                onClick={onCheckRelayHealth}
                type="button"
              >
                <Link2 size={14} />
                {relayBusyAction === "health" ? "Checking..." : "Check relay"}
              </button>
            </div>

            <div className="settings-open-source-note">
              <strong>Open-source relay package</strong>
              <span>The generated install session pulls from the public Hermes repository so the relay source can be inspected before it is built and run.</span>
            </div>
          </section>

          <section className="relay-setup__section">
            <div className="relay-setup__header">
              <div>
                <p className="eyebrow">Link</p>
                <h3>Link this device</h3>
                <span>The first linked device becomes the master device and keeps admin control over the relay workspace.</span>
              </div>
            </div>

            <div className="settings-form-grid">
              <label className="field">
                <span>Device name</span>
                <input onChange={(event) => onRelayDeviceNameChange(event.target.value)} placeholder="Hermes Mac" value={relayState.deviceName} />
              </label>

              <label className="field">
                <span>Workspace name</span>
                <input onChange={(event) => onRelayWorkspaceNameChange(event.target.value)} placeholder="Personal relay" value={relayState.workspaceName} />
              </label>

              <label className="field">
                <span>Workspace ID</span>
                <input onChange={(event) => onRelayWorkspaceIdChange(event.target.value)} placeholder="Paste workspace ID to join" value={relayState.workspaceId ?? ""} />
              </label>

              <label className="field">
                <span>{isRelayMaster ? "Admin token" : "Admin token / join token"}</span>
                <input onChange={(event) => onRelayAdminTokenChange(event.target.value)} placeholder="Only the master device keeps this after bootstrap" value={relayState.adminToken ?? ""} />
              </label>
            </div>

            <div className="settings-card__actions">
              <button className="primary-button" disabled={relayBusyAction !== null} onClick={onBootstrapRelayWorkspace} type="button">
                <Shield size={14} />
                {relayBusyAction === "bootstrap" ? "Creating..." : "Create master"}
              </button>
              <button className="ghost-button" disabled={relayBusyAction !== null} onClick={onJoinRelayWorkspace} type="button">
                <ServerCog size={14} />
                {relayBusyAction === "join" ? "Joining..." : "Join workspace"}
              </button>
              <button className="ghost-button" disabled={!isRelayLinked || relayBusyAction !== null} onClick={onRefreshRelayWorkspace} type="button">
                <RefreshCw size={14} />
                {relayBusyAction === "refresh" ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {relayState.lastError ? <div className="settings-inline-error">{relayState.lastError}</div> : null}

            <details className="settings-advanced">
              <summary>Advanced relay override</summary>
              <label className="field">
                <span>Manual relay URL override</span>
                <input onChange={(event) => onRelayUrlChange(event.target.value)} placeholder="Optional override if hostname/port differ" value={relayState.advancedRelayUrl} />
              </label>
            </details>
          </section>

          {relayState.devices.length > 0 ? (
            <section className="relay-setup__section">
              <div className="relay-setup__header">
                <div>
                  <p className="eyebrow">Devices</p>
                  <h3>Linked devices</h3>
                </div>
                {isRelayMaster && relayState.adminToken ? (
                  <button
                    className="ghost-button"
                    onClick={() => void navigator.clipboard.writeText(relayState.adminToken ?? "")}
                    type="button"
                  >
                    <Copy size={14} />
                    Copy token
                  </button>
                ) : null}
              </div>

              <div className="settings-device-list">
                {relayState.devices.map((device) => {
                  const isCurrent = device.id === relayState.currentDeviceId;

                  return (
                    <div className="settings-device-row" key={device.id}>
                      <div className="settings-device-row__body">
                        <strong>
                          {device.name}
                          {isCurrent ? " (this device)" : ""}
                        </strong>
                        <span>
                          {getDevicePlatformLabel(device.platform)} / {device.role}
                          {device.revokedAt ? " / revoked" : ""}
                        </span>
                      </div>
                      {isRelayMaster && !isCurrent && !device.revokedAt ? (
                        <button className="ghost-button" disabled={relayBusyAction !== null} onClick={() => onRevokeRelayDevice(device.id)} type="button">
                          {relayBusyAction === "revoke" ? "Revoking..." : "Revoke"}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}
