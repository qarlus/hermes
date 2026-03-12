import type {
  ConnectLocalSessionInput,
  ServerAuthKind,
  ProjectRecord,
  ServerRecord,
  TerminalCommandRecord
} from "@hermes/core";
import type {
  RelayDevicePlatform,
  RelayDeviceRole,
  RelayDeviceStatus,
  RelayWorkspaceDeviceRecord
} from "@hermes/sync";
import { noxTheme } from "@hermes/ui";

export type DevicePlatform = RelayDevicePlatform;

export type LocalSessionPreset = {
  id: string;
  name: string;
  path: string;
};

export type LocalGitRepository = {
  id: string;
  name: string;
  path: string;
};

export type HermesThemeId = "nox" | "dawn" | "forest";

export type TerminalLaunchProfileId =
  | "system"
  | "powershell"
  | "pwsh"
  | "cmd"
  | "zsh"
  | "bash"
  | "fish"
  | "sh"
  | "opentui"
  | "charm"
  | "codex"
  | "claude"
  | "custom";

export type TerminalLaunchProfile = {
  id: TerminalLaunchProfileId;
  label: string;
  description: string;
  kind: "system" | "command" | "custom";
  program?: string;
  args?: string[];
};

export type HermesSettings = {
  themeId: HermesThemeId;
  terminalFontSize: number;
  terminalProfileId: TerminalLaunchProfileId;
  customTerminalProgram: string;
  customTerminalArgs: string;
  customTerminalLabel: string;
  syncIncludesSettings: boolean;
  syncIncludesSecrets: boolean;
  syncIncludesTmuxMetadata: boolean;
  syncIncludesHistory: boolean;
  syncIncludesCommands: boolean;
  syncIncludesPinnedRepositories: boolean;
  lastExportedAt: string | null;
  lastImportedAt: string | null;
};

export type SyncedKeychainItem = {
  name: string;
  kind: ServerAuthKind;
  secret: string;
  publicKey: string | null;
};

export type SyncedTmuxMetadataRecord = {
  serverRef: string;
  serverLabel: string;
  sessionNames: string[];
  lastAttachedSession: string | null;
  lastSeenAt: string;
};

export type SyncedTerminalHistoryRecord = {
  id: string;
  targetKind: "local" | "server";
  serverRef: string | null;
  serverLabel: string | null;
  title: string;
  cwd: string | null;
  tmuxSession: string | null;
  startedAt: string;
  endedAt: string;
  exitCode: number | null;
  reason: string;
};

type ThemeTerminalPalette = {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
};

export type HermesThemeDefinition = {
  id: HermesThemeId;
  label: string;
  description: string;
  colorScheme: "dark" | "light";
  app: {
    bg: string;
    bgRail: string;
    bgPanel: string;
    bgPanel2: string;
    bgPanel3: string;
    bgInput: string;
    text: string;
    textSoft: string;
    textFaint: string;
    border: string;
    borderStrong: string;
    accent: string;
    accentInk: string;
    success: string;
    danger: string;
  };
  terminal: ThemeTerminalPalette;
};

export type HermesSyncBundle = {
  version: 2;
  exportedAt: string;
  settings: HermesSettings | null;
  projects: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  servers: Array<{
    projectId: string;
    name: string;
    hostname: string;
    port: number;
    username: string;
    authKind: ServerAuthKind;
    credentialName: string | null;
    isFavorite: boolean;
    tmuxSession: string;
    useTmux: boolean;
    notes: string;
  }>;
  localSessionPresets: LocalSessionPreset[];
  localGitRepositories: LocalGitRepository[] | null;
  terminalCommands: TerminalCommandRecord[] | null;
  keychainItems: SyncedKeychainItem[] | null;
  tmuxMetadata: SyncedTmuxMetadataRecord[] | null;
  sessionHistory: SyncedTerminalHistoryRecord[] | null;
};

export const HERMES_SETTINGS_KEY = "hermes.settings";
export const HERMES_RELAY_STATE_KEY = "hermes.relayState";

export type RelayClientState = {
  localDeviceId: string;
  workspaceName: string;
  deviceName: string;
  hostServerId: string | null;
  installRuntime: "docker" | "appleContainer";
  relayPort: number;
  advancedRelayUrl: string;
  detectedRelayUrl: string | null;
  detectedRelayUrls: string[];
  tailscaleIpv4: string | null;
  tailscaleDnsName: string | null;
  relayInstalled: boolean;
  relayRunning: boolean;
  relayHealthy: boolean;
  relayVersion: string | null;
  lastHostCheckAt: string | null;
  workspaceId: string | null;
  relayId: string | null;
  currentDeviceId: string | null;
  currentDeviceRole: RelayDeviceRole | null;
  currentDeviceStatus: RelayDeviceStatus | null;
  adminToken: string | null;
  devices: RelayWorkspaceDeviceRecord[];
  latestSequence: number;
  latestSnapshotId: string | null;
  latestSnapshotAt: string | null;
  lastAppliedSequence: number;
  lastAppliedPayloadHash: string | null;
  lastAppliedBundleJson: string | null;
  syncConflict: string | null;
  lastConnectedAt: string | null;
  lastError: string | null;
};

const MIN_TERMINAL_FONT_SIZE = 11;
const MAX_TERMINAL_FONT_SIZE = 20;

const THEMES: HermesThemeDefinition[] = [
  {
    id: "nox",
    label: "Nox",
    description: "Low-glare graphite with neutral contrast.",
    colorScheme: "dark",
    app: {
      bg: "#040506",
      bgRail: "#060708",
      bgPanel: "#090a0c",
      bgPanel2: "#0d0e11",
      bgPanel3: "#121418",
      bgInput: "#0d0f12",
      text: "#f5f5f6",
      textSoft: "rgba(245, 245, 246, 0.68)",
      textFaint: "rgba(245, 245, 246, 0.38)",
      border: "rgba(255, 255, 255, 0.08)",
      borderStrong: "rgba(255, 255, 255, 0.14)",
      accent: noxTheme.colors.accent,
      accentInk: "#050608",
      success: "#97d4a6",
      danger: "#ff9f9f"
    },
    terminal: {
      background: "#000000",
      foreground: "#f4f7fb",
      cursor: "#8ed2ff",
      cursorAccent: "#000000",
      selectionBackground: "rgba(255, 255, 255, 0.14)",
      black: "#000000",
      red: "#ff7d81",
      green: "#79f0b2",
      yellow: "#f5d06f",
      blue: "#8ed2ff",
      magenta: "#cba6ff",
      cyan: "#82e6e6",
      white: "#f4f7fb",
      brightBlack: "#586274",
      brightRed: "#ff9ca0",
      brightGreen: "#9ff7c4",
      brightYellow: "#ffe08d",
      brightBlue: "#bde8ff",
      brightMagenta: "#dbb9ff",
      brightCyan: "#9eeded",
      brightWhite: "#ffffff"
    }
  },
  {
    id: "dawn",
    label: "Dawn",
    description: "Warm paper surfaces for brighter rooms.",
    colorScheme: "light",
    app: {
      bg: "#f2ece3",
      bgRail: "#ece4d8",
      bgPanel: "#f7f2eb",
      bgPanel2: "#f2ebe2",
      bgPanel3: "#ebe2d6",
      bgInput: "#fbf7f1",
      text: "#1f1a16",
      textSoft: "rgba(31, 26, 22, 0.72)",
      textFaint: "rgba(31, 26, 22, 0.46)",
      border: "rgba(31, 26, 22, 0.10)",
      borderStrong: "rgba(31, 26, 22, 0.18)",
      accent: "#2f6b5d",
      accentInk: "#f8f6f1",
      success: "#2f7a54",
      danger: "#ad584d"
    },
    terminal: {
      background: "#fbf7f1",
      foreground: "#1f1a16",
      cursor: "#2f6b5d",
      cursorAccent: "#fbf7f1",
      selectionBackground: "rgba(47, 107, 93, 0.18)",
      black: "#1f1a16",
      red: "#b05549",
      green: "#2f7a54",
      yellow: "#9d7025",
      blue: "#2d6486",
      magenta: "#875e8c",
      cyan: "#2b7a78",
      white: "#d8d0c6",
      brightBlack: "#6f665d",
      brightRed: "#cf6d61",
      brightGreen: "#46996d",
      brightYellow: "#b88b3f",
      brightBlue: "#4d84a5",
      brightMagenta: "#a67daa",
      brightCyan: "#489896",
      brightWhite: "#ffffff"
    }
  },
  {
    id: "forest",
    label: "Forest",
    description: "Deep spruce panels with stronger green accents.",
    colorScheme: "dark",
    app: {
      bg: "#06100d",
      bgRail: "#071510",
      bgPanel: "#0a1612",
      bgPanel2: "#10201a",
      bgPanel3: "#142922",
      bgInput: "#0f1b17",
      text: "#eef7f0",
      textSoft: "rgba(238, 247, 240, 0.70)",
      textFaint: "rgba(238, 247, 240, 0.40)",
      border: "rgba(177, 223, 197, 0.12)",
      borderStrong: "rgba(177, 223, 197, 0.22)",
      accent: "#9cd1a8",
      accentInk: "#072014",
      success: "#91dfac",
      danger: "#f6a79d"
    },
    terminal: {
      background: "#07110d",
      foreground: "#eef7f0",
      cursor: "#9cd1a8",
      cursorAccent: "#07110d",
      selectionBackground: "rgba(156, 209, 168, 0.20)",
      black: "#06100d",
      red: "#ef8c84",
      green: "#8fdb9c",
      yellow: "#d8c174",
      blue: "#8dc6d4",
      magenta: "#b89fda",
      cyan: "#88d0bb",
      white: "#eef7f0",
      brightBlack: "#5e7068",
      brightRed: "#f6aaa3",
      brightGreen: "#ade8b5",
      brightYellow: "#e7d38d",
      brightBlue: "#aad8e4",
      brightMagenta: "#ccb9e7",
      brightCyan: "#a1e1d1",
      brightWhite: "#ffffff"
    }
  }
];

export function detectDevicePlatform(): DevicePlatform {
  if (typeof navigator === "undefined") {
    return "unknown";
  }

  const navigatorWithUAData = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform =
    navigatorWithUAData.userAgentData?.platform?.toLowerCase() ??
    navigator.platform?.toLowerCase() ??
    navigator.userAgent.toLowerCase();

  if (platform.includes("win")) {
    return "windows";
  }
  if (platform.includes("iphone") || platform.includes("ipad") || platform.includes("ios")) {
    return "ios";
  }
  if (platform.includes("android")) {
    return "android";
  }
  if (platform.includes("mac")) {
    return "macos";
  }
  if (platform.includes("linux")) {
    return "linux";
  }
  return "unknown";
}

export function getDevicePlatformLabel(platform: DevicePlatform) {
  switch (platform) {
    case "windows":
      return "Windows";
    case "macos":
      return "macOS";
    case "linux":
      return "Linux";
    case "android":
      return "Android";
    case "ios":
      return "iPhone";
    default:
      return "This device";
  }
}

export function getTerminalLaunchProfiles(platform: DevicePlatform): TerminalLaunchProfile[] {
  const shellProfiles: TerminalLaunchProfile[] =
    platform === "windows"
      ? [
          {
            id: "system",
            label: "System shell",
            description: "Use the device default shell from COMSPEC.",
            kind: "system"
          },
          {
            id: "powershell",
            label: "PowerShell",
            description: "Windows PowerShell with a clean startup.",
            kind: "command",
            program: "powershell.exe",
            args: ["-NoLogo"]
          },
          {
            id: "pwsh",
            label: "PowerShell 7",
            description: "Cross-platform PowerShell if pwsh is installed.",
            kind: "command",
            program: "pwsh.exe",
            args: ["-NoLogo"]
          },
          {
            id: "cmd",
            label: "Command Prompt",
            description: "Classic cmd.exe session.",
            kind: "command",
            program: "cmd.exe"
          }
        ]
      : [
          {
            id: "system",
            label: "System shell",
            description: "Use the device login shell from SHELL.",
            kind: "system"
          },
          {
            id: "zsh",
            label: "zsh",
            description: "Login zsh shell.",
            kind: "command",
            program: "/bin/zsh",
            args: ["-l"]
          },
          {
            id: "bash",
            label: "bash",
            description: "Login bash shell.",
            kind: "command",
            program: "/bin/bash",
            args: ["-l"]
          },
          {
            id: "fish",
            label: "fish",
            description: "Login fish shell if installed.",
            kind: "command",
            program: "fish",
            args: ["-l"]
          },
          {
            id: "sh",
            label: "sh",
            description: "POSIX sh fallback.",
            kind: "command",
            program: "/bin/sh",
            args: ["-l"]
          }
        ];

  return [
    ...shellProfiles,
    {
      id: "opentui",
      label: "OpenTUI",
      description: "Launch the local OpenTUI command directly.",
      kind: "command",
      program: "opentui"
    },
    {
      id: "charm",
      label: "Charm",
      description: "Launch the local Charm command directly.",
      kind: "command",
      program: "charm"
    },
    {
      id: "codex",
      label: "Codex",
      description: "Launch the Codex CLI in the current folder.",
      kind: "command",
      program: "codex"
    },
    {
      id: "claude",
      label: "Claude Code",
      description: "Launch the Claude Code CLI in the current folder.",
      kind: "command",
      program: "claude"
    },
    {
      id: "custom",
      label: "Custom command",
      description: "Provide your own executable path and optional arguments.",
      kind: "custom"
    }
  ];
}

export function createDefaultHermesSettings(platform: DevicePlatform): HermesSettings {
  return {
    themeId: "nox",
    terminalFontSize: 13,
    terminalProfileId: platform === "windows" ? "powershell" : "zsh",
    customTerminalProgram: "",
    customTerminalArgs: "",
    customTerminalLabel: "",
    syncIncludesSettings: false,
    syncIncludesSecrets: true,
    syncIncludesTmuxMetadata: true,
    syncIncludesHistory: true,
    syncIncludesCommands: true,
    syncIncludesPinnedRepositories: true,
    lastExportedAt: null,
    lastImportedAt: null
  };
}

export function getHermesThemes() {
  return THEMES;
}

export function getHermesTheme(themeId: HermesThemeId) {
  return THEMES.find((theme) => theme.id === themeId) ?? THEMES[0];
}

export function loadHermesSettings(platform: DevicePlatform): HermesSettings {
  if (typeof window === "undefined") {
    return createDefaultHermesSettings(platform);
  }

  try {
    const raw = window.localStorage.getItem(HERMES_SETTINGS_KEY);
    if (!raw) {
      return createDefaultHermesSettings(platform);
    }

    return sanitizeHermesSettings(JSON.parse(raw), platform);
  } catch {
    return createDefaultHermesSettings(platform);
  }
}

export function persistHermesSettings(settings: HermesSettings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(HERMES_SETTINGS_KEY, JSON.stringify(settings));
}

export function createDefaultRelayClientState(platform: DevicePlatform): RelayClientState {
  return {
    localDeviceId: createRelayLocalDeviceId(),
    workspaceName: "",
    deviceName: getDefaultRelayDeviceName(platform),
    hostServerId: null,
    installRuntime: "docker",
    relayPort: 8787,
    advancedRelayUrl: "",
    detectedRelayUrl: null,
    detectedRelayUrls: [],
    tailscaleIpv4: null,
    tailscaleDnsName: null,
    relayInstalled: false,
    relayRunning: false,
    relayHealthy: false,
    relayVersion: null,
    lastHostCheckAt: null,
    workspaceId: null,
    relayId: null,
    currentDeviceId: null,
    currentDeviceRole: null,
    currentDeviceStatus: null,
    adminToken: null,
    devices: [],
    latestSequence: 0,
    latestSnapshotId: null,
    latestSnapshotAt: null,
    lastAppliedSequence: 0,
    lastAppliedPayloadHash: null,
    lastAppliedBundleJson: null,
    syncConflict: null,
    lastConnectedAt: null,
    lastError: null
  };
}

export function loadRelayClientState(platform: DevicePlatform): RelayClientState {
  if (typeof window === "undefined") {
    return createDefaultRelayClientState(platform);
  }

  try {
    const raw = window.localStorage.getItem(HERMES_RELAY_STATE_KEY);
    if (!raw) {
      return createDefaultRelayClientState(platform);
    }

    return sanitizeRelayClientState(JSON.parse(raw), platform);
  } catch {
    return createDefaultRelayClientState(platform);
  }
}

export function persistRelayClientState(state: RelayClientState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(HERMES_RELAY_STATE_KEY, JSON.stringify(state));
}

export function sanitizeHermesSettings(
  value: unknown,
  platform: DevicePlatform
): HermesSettings {
  const defaults = createDefaultHermesSettings(platform);
  const candidate = isRecord(value) ? value : {};
  const availableProfiles = new Set(getTerminalLaunchProfiles(platform).map((profile) => profile.id));

  const themeId =
    typeof candidate.themeId === "string" && THEMES.some((theme) => theme.id === candidate.themeId)
      ? (candidate.themeId as HermesThemeId)
      : defaults.themeId;

  const terminalProfileId =
    typeof candidate.terminalProfileId === "string" && availableProfiles.has(candidate.terminalProfileId as TerminalLaunchProfileId)
      ? (candidate.terminalProfileId as TerminalLaunchProfileId)
      : defaults.terminalProfileId;

  return {
    themeId,
    terminalFontSize: clampNumber(candidate.terminalFontSize, MIN_TERMINAL_FONT_SIZE, MAX_TERMINAL_FONT_SIZE, defaults.terminalFontSize),
    terminalProfileId,
    customTerminalProgram:
      typeof candidate.customTerminalProgram === "string" ? candidate.customTerminalProgram : defaults.customTerminalProgram,
    customTerminalArgs:
      typeof candidate.customTerminalArgs === "string" ? candidate.customTerminalArgs : defaults.customTerminalArgs,
    customTerminalLabel:
      typeof candidate.customTerminalLabel === "string" ? candidate.customTerminalLabel : defaults.customTerminalLabel,
    syncIncludesSettings:
      typeof candidate.syncIncludesSettings === "boolean"
        ? candidate.syncIncludesSettings
        : defaults.syncIncludesSettings,
    syncIncludesSecrets:
      typeof candidate.syncIncludesSecrets === "boolean"
        ? candidate.syncIncludesSecrets
        : defaults.syncIncludesSecrets,
    syncIncludesTmuxMetadata:
      typeof candidate.syncIncludesTmuxMetadata === "boolean"
        ? candidate.syncIncludesTmuxMetadata
        : defaults.syncIncludesTmuxMetadata,
    syncIncludesHistory:
      typeof candidate.syncIncludesHistory === "boolean"
        ? candidate.syncIncludesHistory
        : defaults.syncIncludesHistory,
    syncIncludesCommands:
      typeof candidate.syncIncludesCommands === "boolean" ? candidate.syncIncludesCommands : defaults.syncIncludesCommands,
    syncIncludesPinnedRepositories:
      typeof candidate.syncIncludesPinnedRepositories === "boolean"
        ? candidate.syncIncludesPinnedRepositories
        : defaults.syncIncludesPinnedRepositories,
    lastExportedAt:
      typeof candidate.lastExportedAt === "string" || candidate.lastExportedAt === null
        ? candidate.lastExportedAt
        : defaults.lastExportedAt,
    lastImportedAt:
      typeof candidate.lastImportedAt === "string" || candidate.lastImportedAt === null
        ? candidate.lastImportedAt
        : defaults.lastImportedAt
  };
}

export function sanitizeRelayClientState(
  value: unknown,
  platform: DevicePlatform
): RelayClientState {
  const defaults = createDefaultRelayClientState(platform);
  const candidate = isRecord(value) ? value : {};

  return {
    workspaceName:
      typeof candidate.workspaceName === "string" ? candidate.workspaceName : defaults.workspaceName,
    localDeviceId:
      typeof candidate.localDeviceId === "string" && candidate.localDeviceId.trim()
        ? candidate.localDeviceId
        : defaults.localDeviceId,
    deviceName:
      typeof candidate.deviceName === "string" && candidate.deviceName.trim()
        ? candidate.deviceName
        : defaults.deviceName,
    hostServerId:
      typeof candidate.hostServerId === "string" || candidate.hostServerId === null
        ? candidate.hostServerId
        : defaults.hostServerId,
    installRuntime:
      candidate.installRuntime === "appleContainer" || candidate.installRuntime === "docker"
        ? candidate.installRuntime
        : defaults.installRuntime,
    relayPort: clampNumber(candidate.relayPort, 1, 65535, defaults.relayPort),
    advancedRelayUrl:
      typeof candidate.advancedRelayUrl === "string"
        ? candidate.advancedRelayUrl
        : defaults.advancedRelayUrl,
    detectedRelayUrl:
      typeof candidate.detectedRelayUrl === "string" || candidate.detectedRelayUrl === null
        ? candidate.detectedRelayUrl
        : defaults.detectedRelayUrl,
    detectedRelayUrls: Array.isArray(candidate.detectedRelayUrls)
      ? candidate.detectedRelayUrls.filter((value): value is string => typeof value === "string")
      : defaults.detectedRelayUrls,
    tailscaleIpv4:
      typeof candidate.tailscaleIpv4 === "string" || candidate.tailscaleIpv4 === null
        ? candidate.tailscaleIpv4
        : defaults.tailscaleIpv4,
    tailscaleDnsName:
      typeof candidate.tailscaleDnsName === "string" || candidate.tailscaleDnsName === null
        ? candidate.tailscaleDnsName
        : defaults.tailscaleDnsName,
    relayInstalled:
      typeof candidate.relayInstalled === "boolean"
        ? candidate.relayInstalled
        : defaults.relayInstalled,
    relayRunning:
      typeof candidate.relayRunning === "boolean"
        ? candidate.relayRunning
        : defaults.relayRunning,
    relayHealthy:
      typeof candidate.relayHealthy === "boolean"
        ? candidate.relayHealthy
        : defaults.relayHealthy,
    relayVersion:
      typeof candidate.relayVersion === "string" || candidate.relayVersion === null
        ? candidate.relayVersion
        : defaults.relayVersion,
    lastHostCheckAt:
      typeof candidate.lastHostCheckAt === "string" || candidate.lastHostCheckAt === null
        ? candidate.lastHostCheckAt
        : defaults.lastHostCheckAt,
    workspaceId:
      typeof candidate.workspaceId === "string" || candidate.workspaceId === null
        ? candidate.workspaceId
        : defaults.workspaceId,
    relayId:
      typeof candidate.relayId === "string" || candidate.relayId === null
        ? candidate.relayId
        : defaults.relayId,
    currentDeviceId:
      typeof candidate.currentDeviceId === "string" || candidate.currentDeviceId === null
        ? candidate.currentDeviceId
        : defaults.currentDeviceId,
    currentDeviceRole:
      candidate.currentDeviceRole === "master" || candidate.currentDeviceRole === "member"
        ? candidate.currentDeviceRole
        : defaults.currentDeviceRole,
    currentDeviceStatus:
      candidate.currentDeviceStatus === "pending" ||
      candidate.currentDeviceStatus === "approved" ||
      candidate.currentDeviceStatus === "revoked"
        ? candidate.currentDeviceStatus
        : defaults.currentDeviceStatus,
    adminToken:
      typeof candidate.adminToken === "string" || candidate.adminToken === null
        ? candidate.adminToken
        : defaults.adminToken,
    devices:
      Array.isArray(candidate.devices) && candidate.devices.every(isRelayWorkspaceDeviceRecord)
        ? candidate.devices
        : defaults.devices,
    latestSequence: clampNumber(candidate.latestSequence, 0, Number.MAX_SAFE_INTEGER, defaults.latestSequence),
    latestSnapshotId:
      typeof candidate.latestSnapshotId === "string" || candidate.latestSnapshotId === null
        ? candidate.latestSnapshotId
        : defaults.latestSnapshotId,
    latestSnapshotAt:
      typeof candidate.latestSnapshotAt === "string" || candidate.latestSnapshotAt === null
        ? candidate.latestSnapshotAt
        : defaults.latestSnapshotAt,
    lastAppliedSequence: clampNumber(
      candidate.lastAppliedSequence,
      0,
      Number.MAX_SAFE_INTEGER,
      defaults.lastAppliedSequence
    ),
    lastAppliedPayloadHash:
      typeof candidate.lastAppliedPayloadHash === "string" || candidate.lastAppliedPayloadHash === null
        ? candidate.lastAppliedPayloadHash
        : defaults.lastAppliedPayloadHash,
    lastAppliedBundleJson:
      typeof candidate.lastAppliedBundleJson === "string" || candidate.lastAppliedBundleJson === null
        ? candidate.lastAppliedBundleJson
        : defaults.lastAppliedBundleJson,
    syncConflict:
      typeof candidate.syncConflict === "string" || candidate.syncConflict === null
        ? candidate.syncConflict
        : defaults.syncConflict,
    lastConnectedAt:
      typeof candidate.lastConnectedAt === "string" || candidate.lastConnectedAt === null
        ? candidate.lastConnectedAt
        : defaults.lastConnectedAt,
    lastError:
      typeof candidate.lastError === "string" || candidate.lastError === null
        ? candidate.lastError
        : defaults.lastError
  };
}

export function resolveLocalTerminalLaunch(
  settings: HermesSettings,
  platform: DevicePlatform
): {
  profile: TerminalLaunchProfile;
  connectInput: Omit<ConnectLocalSessionInput, "cwd" | "label"> & { label?: string };
  error: string | null;
} {
  const profiles = getTerminalLaunchProfiles(platform);
  const profile =
    profiles.find((candidate) => candidate.id === settings.terminalProfileId) ??
    profiles[0];

  if (profile.kind === "system") {
    return {
      profile,
      connectInput: {},
      error: null
    };
  }

  if (profile.kind === "custom") {
    const program = settings.customTerminalProgram.trim();
    if (!program) {
      return {
        profile,
        connectInput: {},
        error: "Set a custom executable path before launching a local terminal."
      };
    }

    return {
      profile,
      connectInput: {
        program,
        args: parseArgumentString(settings.customTerminalArgs),
        label: settings.customTerminalLabel.trim() || undefined
      },
      error: null
    };
  }

  return {
    profile,
    connectInput: {
      program: profile.program,
      args: profile.args,
      label: profile.label
    },
    error: null
  };
}

export function buildHermesSyncBundle(input: {
  settings: HermesSettings | null;
  projects: ProjectRecord[];
  servers: ServerRecord[];
  localSessionPresets: LocalSessionPreset[];
  localGitRepositories: LocalGitRepository[] | null;
  terminalCommands: TerminalCommandRecord[] | null;
  keychainItems: SyncedKeychainItem[] | null;
  tmuxMetadata: SyncedTmuxMetadataRecord[] | null;
  sessionHistory: SyncedTerminalHistoryRecord[] | null;
}): HermesSyncBundle {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: input.settings,
    projects: input.projects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description
    })),
    servers: input.servers.map((server) => ({
      projectId: server.projectId,
      name: server.name,
      hostname: server.hostname,
      port: server.port,
      username: server.username,
      authKind: server.authKind,
      credentialName: server.credentialName,
      isFavorite: server.isFavorite,
      tmuxSession: server.tmuxSession,
      useTmux: server.useTmux,
      notes: server.notes
    })),
    localSessionPresets: input.localSessionPresets,
    localGitRepositories: input.localGitRepositories,
    terminalCommands: input.terminalCommands,
    keychainItems: input.keychainItems,
    tmuxMetadata: input.tmuxMetadata,
    sessionHistory: input.sessionHistory
  };
}

export function parseHermesSyncBundle(
  raw: string,
  platform: DevicePlatform
): HermesSyncBundle {
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed) || (parsed.version !== 1 && parsed.version !== 2)) {
    throw new Error("Unsupported Hermes sync bundle.");
  }

  if (typeof parsed.exportedAt !== "string") {
    throw new Error("Sync bundle is missing its export timestamp.");
  }

  if (!Array.isArray(parsed.projects) || !parsed.projects.every(isSyncProjectRecord)) {
    throw new Error("Sync bundle projects are invalid.");
  }

  if (!Array.isArray(parsed.servers) || !parsed.servers.every(isSyncServerRecord)) {
    throw new Error("Sync bundle servers are invalid.");
  }

  if (
    !Array.isArray(parsed.localSessionPresets) ||
    !parsed.localSessionPresets.every(isLocalSessionPreset)
  ) {
    throw new Error("Sync bundle local presets are invalid.");
  }

  if (
    !(
      parsed.version === 2
        ? parsed.localGitRepositories === null ||
          (Array.isArray(parsed.localGitRepositories) &&
            parsed.localGitRepositories.every(isLocalGitRepository))
        : Array.isArray(parsed.localGitRepositories) &&
          parsed.localGitRepositories.every(isLocalGitRepository)
    )
  ) {
    throw new Error("Sync bundle pinned repositories are invalid.");
  }

  if (
    !(parsed.terminalCommands === null || parsed.version === 1 || Array.isArray(parsed.terminalCommands)) ||
    (Array.isArray(parsed.terminalCommands) && !parsed.terminalCommands.every(isTerminalCommandRecord))
  ) {
    throw new Error("Sync bundle terminal commands are invalid.");
  }

  return {
    version: 2,
    exportedAt: parsed.exportedAt,
    settings:
      parsed.version === 1
        ? sanitizeHermesSettings(parsed.settings, platform)
        : parsed.settings === null
          ? null
          : sanitizeHermesSettings(parsed.settings, platform),
    projects: parsed.projects,
    servers: parsed.servers,
    localSessionPresets: parsed.localSessionPresets,
    localGitRepositories:
      parsed.version === 1
        ? parsed.localGitRepositories
        : parsed.localGitRepositories === null
          ? null
          : parsed.localGitRepositories,
    terminalCommands:
      parsed.version === 1
        ? parsed.terminalCommands
        : parsed.terminalCommands === null
          ? null
          : parsed.terminalCommands,
    keychainItems:
      parsed.version === 2 && Array.isArray(parsed.keychainItems) && parsed.keychainItems.every(isSyncedKeychainItem)
        ? parsed.keychainItems
        : null,
    tmuxMetadata:
      parsed.version === 2 && Array.isArray(parsed.tmuxMetadata) && parsed.tmuxMetadata.every(isSyncedTmuxMetadataRecord)
        ? parsed.tmuxMetadata
        : null,
    sessionHistory:
      parsed.version === 2 && Array.isArray(parsed.sessionHistory) && parsed.sessionHistory.every(isSyncedTerminalHistoryRecord)
        ? parsed.sessionHistory
        : null
  };
}

export function isLocalSessionPreset(value: unknown): value is LocalSessionPreset {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.path === "string"
  );
}

export function isLocalGitRepository(value: unknown): value is LocalGitRepository {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.path === "string"
  );
}

export function isSyncedKeychainItem(value: unknown): value is SyncedKeychainItem {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.name === "string" &&
    (value.kind === "sshKey" || value.kind === "password" || value.kind === "default") &&
    typeof value.secret === "string" &&
    (typeof value.publicKey === "string" || value.publicKey === null)
  );
}

export function isSyncedTmuxMetadataRecord(value: unknown): value is SyncedTmuxMetadataRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.serverRef === "string" &&
    typeof value.serverLabel === "string" &&
    Array.isArray(value.sessionNames) &&
    value.sessionNames.every((item: unknown) => typeof item === "string") &&
    (typeof value.lastAttachedSession === "string" || value.lastAttachedSession === null) &&
    typeof value.lastSeenAt === "string"
  );
}

export function isSyncedTerminalHistoryRecord(value: unknown): value is SyncedTerminalHistoryRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    (value.targetKind === "local" || value.targetKind === "server") &&
    (typeof value.serverRef === "string" || value.serverRef === null) &&
    (typeof value.serverLabel === "string" || value.serverLabel === null) &&
    typeof value.title === "string" &&
    (typeof value.cwd === "string" || value.cwd === null) &&
    (typeof value.tmuxSession === "string" || value.tmuxSession === null) &&
    typeof value.startedAt === "string" &&
    typeof value.endedAt === "string" &&
    (typeof value.exitCode === "number" || value.exitCode === null) &&
    typeof value.reason === "string"
  );
}

export function isTerminalCommandRecord(value: unknown): value is TerminalCommandRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.command === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isSyncProjectRecord(
  value: unknown
): value is HermesSyncBundle["projects"][number] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string"
  );
}

function isSyncServerRecord(
  value: unknown
): value is HermesSyncBundle["servers"][number] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.projectId === "string" &&
    typeof value.name === "string" &&
    typeof value.hostname === "string" &&
    typeof value.port === "number" &&
    typeof value.username === "string" &&
    typeof value.authKind === "string" &&
    (typeof value.credentialName === "string" || value.credentialName === null) &&
    typeof value.isFavorite === "boolean" &&
    typeof value.tmuxSession === "string" &&
    typeof value.useTmux === "boolean" &&
    typeof value.notes === "string"
  );
}

function parseArgumentString(value: string) {
  const input = value.trim();
  if (!input) {
    return [];
  }

  const args: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (const character of input) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }

    if (/\s/u.test(character)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += character;
  }

  if (current) {
    args.push(current);
  }

  return args;
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object";
}

function isRelayWorkspaceDeviceRecord(value: unknown): value is RelayWorkspaceDeviceRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.platform === "string" &&
    (value.role === "master" || value.role === "member" || value.role === null) &&
    (value.status === "pending" || value.status === "approved" || value.status === "revoked") &&
    typeof value.linkedAt === "string" &&
    (typeof value.approvedAt === "string" || value.approvedAt === null) &&
    typeof value.lastSeenAt === "string" &&
    (typeof value.revokedAt === "string" || value.revokedAt === null) &&
    isRecord(value.publicKeys) &&
    typeof value.publicKeys.encryptionPublicKey === "string" &&
    typeof value.publicKeys.signingPublicKey === "string" &&
    value.publicKeys.encoding === "base64"
  );
}

export function getDefaultRelayDeviceName(platform: DevicePlatform) {
  return `Hermes ${getDevicePlatformLabel(platform)}`;
}

function createRelayLocalDeviceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `relay-device-${Math.random().toString(36).slice(2, 12)}`;
}

export function buildRelayUrls(input: {
  hostServerHostname: string | null;
  relayPort: number;
  advancedRelayUrl?: string;
}) {
  const advanced = input.advancedRelayUrl?.trim();
  const normalizedAdvanced = advanced ? advanced.replace(/\/+$/u, "") : "";
  const host = input.hostServerHostname?.trim();
  const derivedHostUrl = host ? `http://${host}:${input.relayPort}` : "";

  return {
    primary: normalizedAdvanced || derivedHostUrl,
    derived: derivedHostUrl,
    advanced: normalizedAdvanced
  };
}

export function buildRelayCheckCommand(runtime: RelayClientState["installRuntime"]) {
  const dockerChecks = [
    "set -e",
    "echo 'Checking Hermes Relay prerequisites...'",
    "command -v curl >/dev/null && curl --version | head -n 1 || echo 'curl missing'",
    "command -v git >/dev/null && git --version || echo 'git missing (needed for private repo fallback)'",
    "command -v docker >/dev/null && docker --version || echo 'docker missing'",
    "command -v tailscale >/dev/null && tailscale status || echo 'tailscale missing'"
  ];

  const appleChecks = [
    "set -e",
    "echo 'Checking Hermes Relay prerequisites...'",
    "command -v curl >/dev/null && curl --version | head -n 1 || echo 'curl missing'",
    "command -v git >/dev/null && git --version || echo 'git missing (needed for private repo fallback)'",
    "command -v container >/dev/null && container system info || echo 'apple container missing'",
    "command -v tailscale >/dev/null && tailscale status || echo 'tailscale missing'"
  ];

  return ["bash", "-lc", `'${(runtime === "appleContainer" ? appleChecks : dockerChecks).join("; ").replace(/'/g, "'\\''")}'`].join(" ");
}

export function buildRelayInstallCommand(input: {
  runtime: RelayClientState["installRuntime"];
  relayPort: number;
}) {
  const base = [
    "set -e",
    "command -v curl >/dev/null 2>&1 || { echo 'curl is required to install Hermes Relay.'; exit 1; }",
    'RELAY_REF="${HERMES_RELAY_REF:-master}"',
    'RELAY_BASE_URL="${HERMES_RELAY_BASE_URL:-https://raw.githubusercontent.com/qarlus/hermes/${RELAY_REF}/apps/server}"',
    'RELAY_REPO="${HERMES_RELAY_REPO:-https://github.com/qarlus/hermes.git}"',
    "mkdir -p ~/hermes-relay-package",
    "cd ~/hermes-relay-package",
    "rm -f Dockerfile index.js",
    'if curl -fsSL "$RELAY_BASE_URL/Dockerfile.runtime" -o Dockerfile && curl -fsSL "$RELAY_BASE_URL/dist/index.js" -o index.js; then echo \'Downloaded Hermes Relay runtime artifacts.\'; else echo \'Raw relay artifact download failed. Falling back to git clone.\'; rm -f Dockerfile index.js; command -v git >/dev/null 2>&1 || { echo \'git is required when relay artifacts are not publicly downloadable.\'; echo \'Set HERMES_RELAY_REPO to an accessible clone URL if this repository is private.\'; exit 1; }; rm -rf ~/hermes-relay-src; git clone --depth 1 --branch \"$RELAY_REF\" \"$RELAY_REPO\" ~/hermes-relay-src; cp ~/hermes-relay-src/apps/server/Dockerfile.runtime Dockerfile; cp ~/hermes-relay-src/apps/server/dist/index.js index.js; fi'
  ];

  const docker = [
    ...base,
    "docker build -t hermes-relay:latest .",
    "docker rm -f hermes-relay >/dev/null 2>&1 || true",
    `docker run -d --name hermes-relay --restart unless-stopped -p ${input.relayPort}:8787 -v hermes-relay-data:/data hermes-relay:latest`
  ];

  const appleContainer = [
    ...base,
    "container build -t hermes-relay:latest -f Dockerfile .",
    "container rm -f hermes-relay >/dev/null 2>&1 || true",
    `container run --name hermes-relay --detach --publish ${input.relayPort}:8787 hermes-relay:latest`
  ];

  const selected = input.runtime === "appleContainer" ? appleContainer : docker;
  return ["bash", "-lc", `'${selected.join("; ").replace(/'/g, "'\\''")}'`].join(" ");
}
