export const noxTheme = {
  colors: {
    background: "#09090b",
    panel: "#0f1012",
    panelMuted: "#0b0c0f",
    panelRaised: "#14161a",
    border: "rgba(255, 255, 255, 0.08)",
    borderStrong: "rgba(255, 255, 255, 0.16)",
    text: "#f5f5f6",
    textMuted: "rgba(245, 245, 246, 0.62)",
    accent: "#d7d8dc",
    accentStrong: "#ffffff",
    danger: "#ff8f8f",
    success: "#8fd8ab"
  },
  radii: {
    sm: "4px",
    md: "6px",
    lg: "8px"
  },
  shadows: {
    panel: "0 0 0 1px rgba(255, 255, 255, 0.04)"
  }
} as const;

export const noxTypography = {
  sans: '"Satoshi", "Segoe UI", sans-serif',
  mono: '"JetBrains Mono", "SFMono-Regular", monospace'
} as const;
