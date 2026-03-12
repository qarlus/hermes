import { useRef, type ChangeEvent } from "react";
import {
  Download,
  HardDriveDownload,
  MonitorCog,
  Palette,
  TerminalSquare,
  Upload
} from "lucide-react";
import type {
  DevicePlatform,
  HermesSettings,
  HermesThemeDefinition,
  HermesThemeId,
  TerminalLaunchProfile,
  TerminalLaunchProfileId
} from "../../lib/settings";
import { getDevicePlatformLabel, getHermesThemes } from "../../lib/settings";

type SettingsPageProps = {
  platform: DevicePlatform;
  settings: HermesSettings;
  activeTheme: HermesThemeDefinition;
  terminalProfiles: TerminalLaunchProfile[];
  launcherSummary: string;
  commandCount: number;
  syncedKeyCount: number;
  localPresetCount: number;
  pinnedRepositoryCount: number;
  tmuxMetadataCount: number;
  sessionHistoryCount: number;
  workspaceCount: number;
  serverCount: number;
  syncBusyAction: "export" | "import" | null;
  onThemeChange: (themeId: HermesThemeId) => void;
  onTerminalFontSizeChange: (value: number) => void;
  onTerminalProfileChange: (profileId: TerminalLaunchProfileId) => void;
  onCustomTerminalProgramChange: (value: string) => void;
  onCustomTerminalArgsChange: (value: string) => void;
  onCustomTerminalLabelChange: (value: string) => void;
  onSyncIncludesSettingsChange: (value: boolean) => void;
  onSyncIncludesSecretsChange: (value: boolean) => void;
  onSyncIncludesTmuxMetadataChange: (value: boolean) => void;
  onSyncIncludesHistoryChange: (value: boolean) => void;
  onSyncIncludesCommandsChange: (value: boolean) => void;
  onSyncIncludesPinnedRepositoriesChange: (value: boolean) => void;
  onExportBundle: () => void;
  onImportBundle: (file: File) => void;
};

const TERMINAL_SAMPLE = [
  "hermes status",
  "  relay        summary view",
  "  launcher     $PROFILE",
  "  current view settings"
].join("\n");

export function SettingsPage({
  platform,
  settings,
  activeTheme,
  terminalProfiles,
  launcherSummary,
  commandCount,
  syncedKeyCount,
  localPresetCount,
  pinnedRepositoryCount,
  tmuxMetadataCount,
  sessionHistoryCount,
  workspaceCount,
  serverCount,
  syncBusyAction,
  onThemeChange,
  onTerminalFontSizeChange,
  onTerminalProfileChange,
  onCustomTerminalProgramChange,
  onCustomTerminalArgsChange,
  onCustomTerminalLabelChange,
  onSyncIncludesSettingsChange,
  onSyncIncludesSecretsChange,
  onSyncIncludesTmuxMetadataChange,
  onSyncIncludesHistoryChange,
  onSyncIncludesCommandsChange,
  onSyncIncludesPinnedRepositoriesChange,
  onExportBundle,
  onImportBundle
}: SettingsPageProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const themes = getHermesThemes();
  const usesCustomLauncher = settings.terminalProfileId === "custom";

  const handleImportChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    onImportBundle(file);
    event.target.value = "";
  };

  return (
    <section className="settings-page">
      <div className="settings-status-bar">
        <span className="settings-pill">
          <Palette size={13} />
          {activeTheme.label}
        </span>
        <span className="settings-pill">
          <TerminalSquare size={13} />
          {launcherSummary}
        </span>
      </div>

      <div className="settings-grid">
        <article className="settings-card settings-card--dense">
          <div className="settings-card__header">
            <div>
              <p className="eyebrow">Appearance</p>
              <h3>Theme and terminal density</h3>
            </div>
            <span className="settings-pill">
              <Palette size={13} />
              {activeTheme.label}
            </span>
          </div>

          <div className="settings-theme-grid">
            {themes.map((theme) => (
              <button
                className={`settings-theme-card ${settings.themeId === theme.id ? "settings-theme-card--active" : ""}`}
                key={theme.id}
                onClick={() => onThemeChange(theme.id)}
                type="button"
              >
                <span
                  className="settings-theme-card__swatch"
                  style={{
                    background: `linear-gradient(135deg, ${theme.app.bgPanel} 0%, ${theme.app.bgPanel3} 100%)`,
                    borderColor: theme.app.borderStrong
                  }}
                >
                  <i style={{ background: theme.app.accent }} />
                  <i style={{ background: theme.app.success }} />
                  <i style={{ background: theme.app.danger }} />
                </span>
                <strong>{theme.label}</strong>
                <span>{theme.description}</span>
              </button>
            ))}
          </div>

          <div className="settings-range">
            <div className="settings-range__copy">
              <strong>Terminal font size</strong>
              <span>Used by every xterm workspace inside Hermes.</span>
            </div>
            <div className="settings-range__control">
              <input max={20} min={11} onChange={(event) => onTerminalFontSizeChange(Number(event.target.value))} type="range" value={settings.terminalFontSize} />
              <span>{settings.terminalFontSize}px</span>
            </div>
          </div>

          <div
            className="settings-terminal-preview"
            style={{
              background: activeTheme.terminal.background,
              color: activeTheme.terminal.foreground,
              fontSize: `${settings.terminalFontSize}px`
            }}
          >
            <div className="settings-terminal-preview__chrome">
              <span />
              <span />
              <span />
            </div>
            <pre>{TERMINAL_SAMPLE.replace("$PROFILE", launcherSummary)}</pre>
          </div>
        </article>

        <article className="settings-card settings-card--dense">
          <div className="settings-card__header">
            <div>
              <p className="eyebrow">Local terminal</p>
              <h3>Default launcher</h3>
            </div>
            <span className="settings-pill">
              <MonitorCog size={13} />
              {getDevicePlatformLabel(platform)}
            </span>
          </div>

          <div className="settings-profile-grid">
            {terminalProfiles.map((profile) => (
              <button
                className={`settings-profile-card ${settings.terminalProfileId === profile.id ? "settings-profile-card--active" : ""}`}
                key={profile.id}
                onClick={() => onTerminalProfileChange(profile.id)}
                type="button"
              >
                <strong>{profile.label}</strong>
                <span>{profile.description}</span>
              </button>
            ))}
          </div>

          <div className="settings-launch-summary">
            <TerminalSquare size={14} />
            <span>Current local launcher: {launcherSummary}</span>
          </div>

          {usesCustomLauncher ? (
            <div className="settings-form-grid">
              <label className="field">
                <span>Executable path or command</span>
                <input onChange={(event) => onCustomTerminalProgramChange(event.target.value)} placeholder={platform === "windows" ? "pwsh.exe" : "/opt/homebrew/bin/fish"} value={settings.customTerminalProgram} />
              </label>

              <label className="field">
                <span>Arguments</span>
                <input onChange={(event) => onCustomTerminalArgsChange(event.target.value)} placeholder="--login --some-flag" value={settings.customTerminalArgs} />
              </label>

              <label className="field">
                <span>Tab label override</span>
                <input onChange={(event) => onCustomTerminalLabelChange(event.target.value)} placeholder="Optional" value={settings.customTerminalLabel} />
              </label>
            </div>
          ) : null}
        </article>

        <details className="settings-card settings-card--dense settings-card--collapsible">
          <summary className="settings-card__summary">
            <div className="settings-card__summary-copy">
              <p className="eyebrow">Sync</p>
              <h3>Manual fallback bundle</h3>
            </div>
            <span className="settings-pill">
              <HardDriveDownload size={13} />
              Offline fallback
            </span>
          </summary>

          <div className="settings-card__body-collapsible">
            <div className="settings-relay-meta">
              <span className="settings-pill">{workspaceCount} workspaces</span>
              <span className="settings-pill">{serverCount} servers</span>
              <span className="settings-pill">{localPresetCount} local presets</span>
            </div>

            <div className="settings-switches">
              <label className="settings-switch">
                <input checked={settings.syncIncludesSettings} onChange={(event) => onSyncIncludesSettingsChange(event.target.checked)} type="checkbox" />
                <span>Include app settings</span>
              </label>
              <label className="settings-switch">
                <input checked={settings.syncIncludesSecrets} onChange={(event) => onSyncIncludesSecretsChange(event.target.checked)} type="checkbox" />
                <span>Include synced SSH keys and credentials ({syncedKeyCount})</span>
              </label>
              <label className="settings-switch">
                <input checked={settings.syncIncludesTmuxMetadata} onChange={(event) => onSyncIncludesTmuxMetadataChange(event.target.checked)} type="checkbox" />
                <span>Include tmux metadata ({tmuxMetadataCount})</span>
              </label>
              <label className="settings-switch">
                <input checked={settings.syncIncludesHistory} onChange={(event) => onSyncIncludesHistoryChange(event.target.checked)} type="checkbox" />
                <span>Include terminal history ({sessionHistoryCount})</span>
              </label>
              <label className="settings-switch">
                <input checked={settings.syncIncludesCommands} onChange={(event) => onSyncIncludesCommandsChange(event.target.checked)} type="checkbox" />
                <span>Include saved terminal commands ({commandCount})</span>
              </label>
              <label className="settings-switch">
                <input checked={settings.syncIncludesPinnedRepositories} onChange={(event) => onSyncIncludesPinnedRepositoriesChange(event.target.checked)} type="checkbox" />
                <span>Include pinned Git repositories ({pinnedRepositoryCount})</span>
              </label>
            </div>

            <div className="settings-card__actions">
              <button className="primary-button" disabled={syncBusyAction === "import"} onClick={onExportBundle} type="button">
                <Download size={14} />
                {syncBusyAction === "export" ? "Exporting..." : "Export bundle"}
              </button>
              <button className="ghost-button" disabled={syncBusyAction === "export"} onClick={() => importInputRef.current?.click()} type="button">
                <Upload size={14} />
                {syncBusyAction === "import" ? "Importing..." : "Import bundle"}
              </button>
              <input accept=".json,application/json" className="settings-page__file-input" onChange={handleImportChange} ref={importInputRef} type="file" />
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
