# Design Principles

## 1. Terminal first
The terminal is not one pane inside a larger app concept.
It is the center of the product.

Every screen, surface, and interaction should protect terminal flow.

## 2. Continuous workspace
Hermes should feel like one connected operating surface, not a sequence of unrelated pages.

A user should feel that they are still inside the same workspace when opening:

- Files
- Git changes
- Logs
- Quick Commands
- Session details

## 3. Context, not detours
Attached tools should appear beside or below the active session before they become separate destinations.

Default behavior:

- Files = side companion
- Git changes = attached context list
- Diff viewer = bottom dock
- Logs/output = bottom dock
- Session details = side panel

## 4. Hidden at rest
Capabilities should not be visible all the time.

At rest, Hermes should feel quiet:

- slim nav rail
- compact top region
- terminal/workspace surface
- no persistent right clutter
- no persistent bottom clutter

Tooling should appear on:

- shortcut
- deliberate hover into a reveal edge
- explicit click or command

## 5. Premium through discipline
Hermes should feel expensive because:

- hierarchy is obvious
- spacing is strict
- tabs are calm
- actions are compact
- states are clear
- motion is restrained

Not because of:

- textures
- glows
- oversized hero cards
- heavy borders

## 6. Density without noise
Hermes should be information-rich, but not from packing in labels and buttons.

Density should come from:

- reduced dead space
- tighter structure
- better state grouping
- lower chrome
- compact controls

## 7. User-owned trust model
Sync should feel infra-like and trustworthy.

The interface should communicate:

- your devices
- your relay
- your secrets
- your storage choices

It should not look like:

- mandatory account onboarding
- cloud upsell
- account-centric product shell

## 8. Fewer visible verbs
Repeated actions should become icon-led where possible.

Text is reserved for:

- setup
- onboarding
- destructive flows
- clarity-heavy decisions
- commit message entry

## 9. One system, not one-off fixes
No individual screen may invent its own:

- padding rhythm
- action size
- panel style
- radius model
- contrast scale
- tab treatment

## 10. Remove decorative structure
The redesign explicitly rejects:

- persistent grid textures
- visible framing for every region
- stacked toolbar bars
- dashboard stat clutter
- large empty page canvases
