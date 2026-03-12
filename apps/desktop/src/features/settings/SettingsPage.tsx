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
  const customLauncherMissingProgram =
    usesCustomLauncher && !settings.customTerminalProgram.trim();
  const customLauncherPreview = buildCustomLauncherPreview(settings);
  const lastExportedLabel = formatTimestamp(settings.lastExportedAt);
  const lastImportedLabel = formatTimestamp(settings.lastImportedAt);
  const enabledOptionalSyncCount = [
    settings.syncIncludesSettings,
    settings.syncIncludesSecrets,
    settings.syncIncludesTmuxMetadata,
    settings.syncIncludesHistory,
    settings.syncIncludesCommands,
    settings.syncIncludesPinnedRepositories
  ].filter(Boolean).length;

  const bundleOptions = [
    {
      id: "settings",
      title: "App settings",
      description: "Theme selection, terminal size, launcher defaults, and file opener preferences.",
      meta: "1 profile",
      checked: settings.syncIncludesSettings,
      onChange: onSyncIncludesSettingsChange
    },
    {
      id: "secrets",
      title: "Synced secrets",
      description: "SSH keys and credentials already stored in the local Hermes keychain.",
      meta: syncedKeyCount === 0 ? "No items yet" : `${syncedKeyCount} item${syncedKeyCount === 1 ? "" : "s"}`,
      checked: settings.syncIncludesSecrets,
      onChange: onSyncIncludesSecretsChange
    },
    {
      id: "tmux",
      title: "Tmux metadata",
      description: "Last attached sessions and discovered tmux state from remote hosts.",
      meta: tmuxMetadataCount === 0 ? "No records yet" : `${tmuxMetadataCount} record${tmuxMetadataCount === 1 ? "" : "s"}`,
      checked: settings.syncIncludesTmuxMetadata,
      onChange: onSyncIncludesTmuxMetadataChange
    },
    {
      id: "history",
      title: "Terminal history",
      description: "Past local and server sessions so recent work survives a device move.",
      meta: sessionHistoryCount === 0 ? "No sessions yet" : `${sessionHistoryCount} session${sessionHistoryCount === 1 ? "" : "s"}`,
      checked: settings.syncIncludesHistory,
      onChange: onSyncIncludesHistoryChange
    },
    {
      id: "commands",
      title: "Saved commands",
      description: "Reusable command snippets from the session rail.",
      meta: commandCount === 0 ? "No commands yet" : `${commandCount} command${commandCount === 1 ? "" : "s"}`,
      checked: settings.syncIncludesCommands,
      onChange: onSyncIncludesCommandsChange
    },
    {
      id: "repos",
      title: "Pinned repositories",
      description: "Tracked Git working trees and repository shortcuts.",
      meta:
        pinnedRepositoryCount === 0
          ? "No repositories yet"
          : `${pinnedRepositoryCount} repositor${pinnedRepositoryCount === 1 ? "y" : "ies"}`,
      checked: settings.syncIncludesPinnedRepositories,
      onChange: onSyncIncludesPinnedRepositoriesChange
    }
  ];

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
      <div className="settings-shell">
        <header className="settings-hero">
          <div className="settings-hero__copy">
            <div className="settings-hero__pills">
              <span className="settings-pill">
                <Palette size={13} />
                {activeTheme.label}
              </span>
              <span className="settings-pill">
                <TerminalSquare size={13} />
                {launcherSummary}
              </span>
              <span className="settings-pill">
                <MonitorCog size={13} />
                {getDevicePlatformLabel(platform)}
              </span>
            </div>

            <div className="settings-hero__headline">
              <p className="eyebrow">Settings</p>
              <h1>Shape how Hermes feels before you open the next session.</h1>
              <p>
                This page controls the desktop shell, terminal ergonomics, and the manual
                bundle you can carry between machines when relay sync is unavailable.
              </p>
            </div>

            <div className="settings-stat-grid">
              <div className="settings-stat">
                <span>Workspaces</span>
                <strong>{workspaceCount}</strong>
              </div>
              <div className="settings-stat">
                <span>Servers</span>
                <strong>{serverCount}</strong>
              </div>
              <div className="settings-stat">
                <span>Presets</span>
                <strong>{localPresetCount}</strong>
              </div>
              <div className="settings-stat">
                <span>Optional sync domains</span>
                <strong>{enabledOptionalSyncCount}/6</strong>
              </div>
            </div>
          </div>

          <aside className="settings-focus-card">
            <div className="settings-focus-card__theme">
              <div
                className="settings-focus-card__theme-swatch"
                style={{
                  background: `linear-gradient(145deg, ${activeTheme.app.bgPanel} 0%, ${activeTheme.app.bgPanel3} 100%)`,
                  borderColor: activeTheme.app.borderStrong
                }}
              >
                <i style={{ background: activeTheme.app.accent }} />
                <i style={{ background: activeTheme.app.success }} />
                <i style={{ background: activeTheme.app.danger }} />
              </div>
              <div className="settings-focus-card__theme-copy">
                <span>Current atmosphere</span>
                <strong>{activeTheme.label}</strong>
              </div>
            </div>

            <div className="settings-focus-card__terminal">
              <div className="settings-terminal-preview__chrome">
                <span />
                <span />
                <span />
              </div>
              <pre>{TERMINAL_SAMPLE.replace("$PROFILE", launcherSummary)}</pre>
            </div>

            <div className="settings-focus-card__meta">
              <div>
                <span>Last export</span>
                <strong>{lastExportedLabel}</strong>
              </div>
              <div>
                <span>Last import</span>
                <strong>{lastImportedLabel}</strong>
              </div>
            </div>
          </aside>
        </header>

        <div className="settings-layout">
          <article className="settings-panel settings-panel--appearance">
            <div className="settings-panel__header">
              <div>
                <p className="eyebrow">Appearance</p>
                <h2>Theme and terminal density</h2>
              </div>
              <span className="settings-pill">
                <Palette size={13} />
                {activeTheme.label}
              </span>
            </div>

            <div className="settings-theme-grid">
              {themes.map((theme) => (
                <button
                  aria-pressed={settings.themeId === theme.id}
                  className={`settings-choice-card ${settings.themeId === theme.id ? "settings-choice-card--active" : ""}`}
                  key={theme.id}
                  onClick={() => onThemeChange(theme.id)}
                  type="button"
                >
                  <span
                    className="settings-choice-card__swatch"
                    style={{
                      background: `linear-gradient(145deg, ${theme.app.bgPanel} 0%, ${theme.app.bgPanel3} 100%)`,
                      borderColor: theme.app.borderStrong
                    }}
                  >
                    <i style={{ background: theme.app.accent }} />
                    <i style={{ background: theme.app.success }} />
                    <i style={{ background: theme.app.danger }} />
                  </span>
                  <span className="settings-choice-card__copy">
                    <strong>{theme.label}</strong>
                    <small>{theme.description}</small>
                  </span>
                  <span className="settings-choice-card__status">
                    {settings.themeId === theme.id ? "Active" : "Apply"}
                  </span>
                </button>
              ))}
            </div>

            <div className="settings-font-control">
              <div className="settings-font-control__header">
                <div>
                  <strong>Terminal font size</strong>
                  <span>Shared across every xterm workspace in Hermes.</span>
                </div>
                <strong className="settings-font-control__value">{settings.terminalFontSize}px</strong>
              </div>

              <input
                max={20}
                min={11}
                onChange={(event) => onTerminalFontSizeChange(Number(event.target.value))}
                type="range"
                value={settings.terminalFontSize}
              />

              <div className="settings-font-control__scale">
                <span>Compact</span>
                <span>Roomier</span>
              </div>
            </div>

            <div className="settings-terminal-panel">
              <div className="settings-terminal-panel__header">
                <div>
                  <strong>Terminal preview</strong>
                  <span>Rendered with the selected palette and current font size.</span>
                </div>
                <span className="settings-pill">
                  <TerminalSquare size={13} />
                  {launcherSummary}
                </span>
              </div>

              <div
                className="settings-terminal-panel__viewport"
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
            </div>
          </article>

          <article className="settings-panel settings-panel--launcher">
            <div className="settings-panel__header">
              <div>
                <p className="eyebrow">Local terminal</p>
                <h2>Default launcher</h2>
              </div>
              <span className="settings-pill">
                <MonitorCog size={13} />
                {getDevicePlatformLabel(platform)}
              </span>
            </div>

            <div className="settings-launcher-summary">
              <div className="settings-launcher-summary__copy">
                <span>Current launcher</span>
                <strong>{launcherSummary}</strong>
              </div>
              {usesCustomLauncher && settings.customTerminalLabel.trim() ? (
                <span className="settings-tag">Label: {settings.customTerminalLabel.trim()}</span>
              ) : null}
            </div>

            <div className="settings-profile-grid">
              {terminalProfiles.map((profile) => (
                <button
                  aria-pressed={settings.terminalProfileId === profile.id}
                  className={`settings-choice-card settings-choice-card--profile ${settings.terminalProfileId === profile.id ? "settings-choice-card--active" : ""}`}
                  key={profile.id}
                  onClick={() => onTerminalProfileChange(profile.id)}
                  type="button"
                >
                  <span className="settings-choice-card__copy">
                    <strong>{profile.label}</strong>
                    <small>{profile.description}</small>
                  </span>
                  <span className="settings-choice-card__status">
                    {settings.terminalProfileId === profile.id ? "Current" : "Use"}
                  </span>
                </button>
              ))}
            </div>

            <div className="settings-command-preview">
              <span>Resolved command</span>
              <strong>{usesCustomLauncher ? customLauncherPreview : launcherSummary}</strong>
            </div>

            {usesCustomLauncher ? (
              <div className="settings-custom-launcher">
                <div className="settings-custom-launcher__header">
                  <strong>Custom launcher</strong>
                  <span>
                    Point Hermes at any executable and keep the label clean inside the tab
                    strip.
                  </span>
                </div>

                <div className="settings-form-grid">
                  <label className="field">
                    <span>Executable path or command</span>
                    <input
                      onChange={(event) => onCustomTerminalProgramChange(event.target.value)}
                      placeholder={platform === "windows" ? "pwsh.exe" : "/opt/homebrew/bin/fish"}
                      value={settings.customTerminalProgram}
                    />
                  </label>

                  <label className="field">
                    <span>Arguments</span>
                    <input
                      onChange={(event) => onCustomTerminalArgsChange(event.target.value)}
                      placeholder="--login --some-flag"
                      value={settings.customTerminalArgs}
                    />
                  </label>

                  <label className="field field--full">
                    <span>Tab label override</span>
                    <input
                      onChange={(event) => onCustomTerminalLabelChange(event.target.value)}
                      placeholder="Optional"
                      value={settings.customTerminalLabel}
                    />
                  </label>
                </div>

                {customLauncherMissingProgram ? (
                  <div className="settings-inline-error">
                    Set an executable path before using the custom launcher as your default.
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>

          <article className="settings-panel settings-panel--sync">
            <div className="settings-panel__header settings-panel__header--wide">
              <div>
                <p className="eyebrow">Manual fallback bundle</p>
                <h2>Export and restore Hermes without relay</h2>
              </div>
              <span className="settings-pill">
                <HardDriveDownload size={13} />
                Offline bundle
              </span>
            </div>

            <div className="settings-sync-grid">
              <div className="settings-sync-column">
                <div className="settings-sync-core">
                  <div className="settings-sync-core__copy">
                    <strong>Always included</strong>
                    <span>
                      Core workspace data is always packed into the bundle so a fresh device can
                      restore structure before optional history and secrets are layered back in.
                    </span>
                  </div>
                  <div className="settings-tag-list">
                    <span className="settings-tag">{workspaceCount} workspaces</span>
                    <span className="settings-tag">{serverCount} servers</span>
                    <span className="settings-tag">{localPresetCount} local presets</span>
                  </div>
                </div>

                <div className="settings-sync-options">
                  {bundleOptions.map((option) => (
                    <label
                      className={`settings-sync-option ${option.checked ? "settings-sync-option--enabled" : ""}`}
                      key={option.id}
                    >
                      <input
                        checked={option.checked}
                        onChange={(event) => option.onChange(event.target.checked)}
                        type="checkbox"
                      />
                      <div className="settings-sync-option__copy">
                        <strong>{option.title}</strong>
                        <span>{option.description}</span>
                      </div>
                      <span className="settings-sync-option__meta">{option.meta}</span>
                    </label>
                  ))}
                </div>
              </div>

              <aside className="settings-sync-summary">
                <div className="settings-sync-summary__block">
                  <span>Bundle shape</span>
                  <strong>
                    {enabledOptionalSyncCount === 0
                      ? "Core workspace data only"
                      : `${enabledOptionalSyncCount} optional domain${enabledOptionalSyncCount === 1 ? "" : "s"} selected`}
                  </strong>
                </div>

                <div className="settings-sync-summary__block">
                  <span>Included on top of the base bundle</span>
                  <div className="settings-tag-list">
                    {bundleOptions.filter((option) => option.checked).length > 0 ? (
                      bundleOptions
                        .filter((option) => option.checked)
                        .map((option) => (
                          <span className="settings-tag" key={option.id}>
                            {option.title}
                          </span>
                        ))
                    ) : (
                      <span className="settings-tag">No optional domains selected</span>
                    )}
                  </div>
                </div>

                <div className="settings-sync-summary__block">
                  <span>Activity</span>
                  <div className="settings-sync-summary__timeline">
                    <div>
                      <small>Last export</small>
                      <strong>{lastExportedLabel}</strong>
                    </div>
                    <div>
                      <small>Last import</small>
                      <strong>{lastImportedLabel}</strong>
                    </div>
                  </div>
                </div>

                <div className="settings-action-row">
                  <button
                    className="primary-button"
                    disabled={syncBusyAction === "import"}
                    onClick={onExportBundle}
                    type="button"
                  >
                    <Download size={14} />
                    {syncBusyAction === "export" ? "Exporting..." : "Export bundle"}
                  </button>
                  <button
                    className="ghost-button"
                    disabled={syncBusyAction === "export"}
                    onClick={() => importInputRef.current?.click()}
                    type="button"
                  >
                    <Upload size={14} />
                    {syncBusyAction === "import" ? "Importing..." : "Import bundle"}
                  </button>
                </div>

                <input
                  accept=".json,application/json"
                  className="settings-page__file-input"
                  onChange={handleImportChange}
                  ref={importInputRef}
                  type="file"
                />
              </aside>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function buildCustomLauncherPreview(settings: HermesSettings) {
  const program = settings.customTerminalProgram.trim() || "No executable configured";
  const args = settings.customTerminalArgs.trim();
  return args ? `${program} ${args}` : program;
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Not yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}
