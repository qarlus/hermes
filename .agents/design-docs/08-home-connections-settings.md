# Home, Connections, and Settings

## Home

### Purpose
Home replaces the idea of a large dashboard.

It is a lightweight launch and resume surface.

### It should answer
- what can I reconnect to right now?
- what was I doing last?
- what saved connections are available?
- what is the state of my sync/relay?

### Recommended sections
- recent workspaces
- recent connections
- quick connect
- saved/favorited hosts
- sync/relay summary

### Home should not become
- a metrics dashboard
- a hero-card page
- a sparse empty canvas with floating stats

### Visual approach
- compact modules
- strong hierarchy
- no decorative texture
- minimal framing
- one obvious next action

## Connections

### Purpose
Connections is where Hermes manages reusable endpoints and their security/storage model.

### Tone
Technical, trustworthy, explicit.

### Should support
- create/edit connection
- auth method selection
- labels/groups/tags
- relay-backed sync visibility
- secret storage explanation
- quick connect/test actions

### Visual rules
- no marketing sync language
- no oversized account-centric UI
- settings-like composure, but more operational

## Settings

### Purpose
Settings is the control center for the design system and behavior model.

It should define:
- theme
- density
- font defaults
- tab/layout behavior
- panel behavior
- sync/relay preferences
- keyboard preferences

### Tone
Polished but not hero-heavy.

The previous Hermes settings direction hinted at a better product. In the redesign, Settings should remain strong, but it must belong to the same visual system as Sessions.

### Settings sections
Recommended high-level grouping:

1. Appearance
2. Workspace
3. Terminal
4. Connections & Security
5. Sync & Relay
6. Shortcuts
7. Advanced / Diagnostics

## Appearance
Should include:

- theme selection
- accent selection
- density mode
- nav mode (rail vs expanded)
- immersive behavior preferences

## Workspace
Should include:

- reopen last workspace toggle
- default startup behavior
- panel memory behavior
- dock behavior
- split preferences

## Terminal
Should include:

- font family
- font size
- line height
- cursor style
- shell integration toggles
- scrollback limits if supported

## Connections & Security
Should include:

- host key behavior
- credential storage strategy
- SSH config integration rules
- confirmations and warnings

## Sync & Relay
Should include:

- relay endpoint
- enable/disable sync
- local-only mode
- device visibility
- conflict handling policy
- last sync / health state

## Settings design rule
Every Settings component should look like a member of the same system as Sessions:

- same surfaces
- same radius
- same typography model
- same action sizing
- same contrast scale

Settings must not become the only screen that looks premium.
