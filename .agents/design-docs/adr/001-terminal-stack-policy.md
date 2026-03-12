# ADR 001: Terminal Stack Policy

## Status
Accepted

## Decision
For terminal and terminal-adjacent TUI surfaces, Hermes will support **only the following implementation directions in v1**:

- **OpenTUI**
- **Charm ecosystem**
- **Ghostty-inspired / Ghostty-aligned terminal behavior and constraints where applicable**

No additional terminal/TUI frameworks should be introduced in v1 without a new ADR.

## Why this ADR exists
Hermes risks becoming visually coherent but technically fragmented if multiple rendering or TUI paradigms are added opportunistically.

This ADR creates a hard constraint so the product remains:

- lightweight
- consistent
- easier to reason about
- easier to maintain

## Interpretation of the rule

### OpenTUI
Acceptable where Hermes needs rich terminal-adjacent or embedded TUI surfaces with a modern native core and TypeScript-friendly integration.

### Charm ecosystem
Acceptable where Hermes benefits from proven terminal UX patterns and tooling approaches in the Charm ecosystem.

### Ghostty direction
Hermes should benchmark terminal behavior, rendering quality expectations, and low-noise UX expectations against the quality bar associated with Ghostty-style terminal excellence.

This does **not** mean Hermes must become Ghostty or clone its UI.
It means terminal correctness, speed expectations, and native-feeling restraint remain the bar.

## Explicitly not allowed in v1
- ad hoc additional TUI libraries added for convenience
- multiple competing terminal surface paradigms in the same product area
- one-off embedded terminal UI solutions that bypass the design system

## Future expansion
Support for additional terminal/TUI implementations can be considered later, but only if:

1. a concrete use case exists
2. performance or correctness requires it
3. it does not fragment the product model
4. a new ADR approves the addition

## Product consequences

### Positive
- cleaner implementation strategy
- easier long-term maintenance
- more consistent terminal-adjacent experiences
- fewer accidental UI paradigms

### Negative
- some tempting libraries may be excluded initially
- some features may need to wait for the chosen stack to mature

## Enforcement guidance
- architecture review should block new terminal/TUI dependencies unless they conform to this ADR
- feature proposals touching terminal rendering, embedded TUI, or terminal-adjacent rich surfaces must reference this ADR
