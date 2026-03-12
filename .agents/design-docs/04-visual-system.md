# Visual System

## Visual thesis
Hermes should feel premium through restraint.

The system must move away from:

- high-visibility grids
- full outlines on every container
- chunky toolbars
- floating stat cards
- arbitrary spacing

And toward:

- tonal surfaces
- clear hierarchy
- compact action language
- editor-like tabs
- disciplined spacing

## Aesthetic direction

### Desired tone
- blue-charcoal
- graphite
- cool slate
- warm-white text
- restrained electric-blue accent

### Explicit anti-direction
- pure black everywhere
- neon cyber styling
- decorative texture layers
- glowing sci-fi chrome
- glassmorphism-heavy UI
- shadows as a primary separator

## Surface model
Use a simple semantic surface stack.

### Surface 0 — App background
The overall shell background.

Characteristics:
- deepest tone
- low visual activity
- no persistent grid texture

### Surface 1 — Workspace surface
Primary content area behind terminal/editor-like content.

Characteristics:
- slightly lifted from app background
- low contrast separation
- minimal borders

### Surface 2 — Attached panel surface
Right-side contextual panels and the bottom dock.

Characteristics:
- subtle tonal lift
- slightly stronger divider presence
- still not a card pile

### Surface 3 — Elevated overlays
Menus, popovers, command palette, dropdowns, dialogs.

Characteristics:
- stronger separation
- subtle shadow allowed
- used sparingly

## Borders and separators

### Rule
Prefer tone and spacing over outlines.

### Allowed
- 1px low-contrast separators where structure is ambiguous
- subtle inset or divider lines in docks/panels
- active state indicators using fill + accent, not thick borders

### Avoid
- outlining every container
- nested boxes inside boxes
- bright strokes around inactive surfaces

## Radius system
Keep the system tight and deliberate.

- app shell / large attached surfaces: 12px
- cards / secondary regions / panels: 10px
- inputs / tabs / buttons: 8px
- chips and pills: full rounded

Rule:
No random radius escalation. Consistency matters more than softness.

## Shadows

### Allowed
- very subtle shadow for menus, popovers, dialogs
- faint depth on elevated overlays only

### Avoid
- permanent large card shadows
- panel stacks differentiated by shadow alone

## Typography

### Tone
UI typography should feel editorial and technical, not marketing-heavy.

### Hierarchy
Suggested type scale:

- page/home title: 24–28
- section title: 18–20
- panel title: 14–16
- body text: 13–14
- meta text: 11–12
- code/terminal: monospace

### Rules
- reduce uppercase labels drastically
- avoid gray-on-gray primary content
- make titles and state-bearing text noticeably stronger
- use weight and contrast before using color to create hierarchy

## Iconography

### Family
One icon family only.
Recommended default: Phosphor.

### Use
- repeated workspace verbs
- nav destinations
- state markers
- compact tool toggles

### Avoid
- mixing icon families
- decorative icons without semantic value
- visually heavy icon weights everywhere

## Buttons

### Design rule
Repeated actions should become compact icon or icon-led controls.

### Button categories

#### Primary button
Use sparingly.
For:
- Connect
- Save
- Confirm
- explicit setup/onboarding actions

#### Secondary button
Low-emphasis, text or icon-text.
For:
- contextual utilities that need labels

#### Icon button
Default for repeated workspace actions.
For:
- split
- reconnect
- toggle files
- open changes
- toggle commands
- overflow

### Avoid
- large persistent text-button bars in the active workspace
- multiple equal-weight buttons fighting each other

## Pills and chips
Use pills for compact context, not for decoration.

Good use cases:
- repo name
- branch name
- dirty count
- sync state
- host type

Bad use cases:
- turning every control into a pill
- overusing pills for navigation

## Empty space
Hermes should not feel sparse.

If a screen feels empty, fix it by:
- tightening layout
- improving grouping
- clarifying primary content

Do not fix it by:
- adding more cards
- adding decorative textures
- adding more borders

## Texture policy
The old grid treatment is removed.

If Hermes ever reintroduces texture, it must be:
- optional
- extremely subtle
- off by default in the main workspace
- never relied on for identity or polish
