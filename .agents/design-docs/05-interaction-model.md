# Interaction Model

## Interaction thesis
Hermes should reveal capability at the moment of intent.

The interaction model should minimize ambient chrome while keeping the product discoverable and fast.

## Core rule
At rest, Hermes is quiet.
On intent, Hermes reveals context.
On focus, Hermes gets out of the way.

## Discoverability model
Hidden-at-rest must not become hidden-and-secret.

Discoverability should come from:

- keyboard shortcuts
- edge reveal affordances
- command palette entries
- subtle state pills/context indicators
- good hover/focus behavior

Not from always-open panels.

## Right-edge reveal

### Purpose
Access contextual side tools without permanently reserving width.

### Trigger behavior
- hover near the right edge reveals a subtle entry strip or handle
- shortcut opens the last-used panel directly
- click opens the chosen tool

### Recommended tools
- Files
- Git Changes
- Quick Commands
- Session Details

### Open/close model
- open on click or shortcut
- close on `Esc` if not pinned
- pinned state available
- reopening restores last active tool/tab

## Bottom dock

### Purpose
A stable home for output-heavy or horizontally-oriented content.

### Good residents
- Diff viewer
- Logs
- Search results
- Transfer progress
- Inspect surfaces
- command output history

### Behavior
- opens on explicit click or shortcut
- supports resize
- supports collapse
- supports expand into fuller mode
- remembers last active view per workspace if appropriate

## Hover behavior
Hover should suggest possibility, not trigger heavy state changes by itself.

### Good hover uses
- reveal close button on tabs
- reveal file-row affordances
- reveal right-edge utility strip
- preview button affordances

### Avoid
- full dock opening solely on hover
- aggressive panel expansion on incidental cursor movement

## Click behavior
Click should commit to a state change.

Examples:
- clicking a changed file opens its diff in the bottom dock
- clicking Files opens the side panel
- clicking a repo pill opens Git context

## Keyboard-first operation
Hermes must support fluent keyboard use.

### Mandatory shortcut classes
- new tab
- close tab
- next/previous tab
- split horizontal/vertical
- focus next split
- toggle files
- toggle git changes
- toggle quick commands
- toggle session details
- open/close bottom dock
- command palette
- reconnect
- search in active context
- immersive mode toggle

## Focus states
Keyboard focus must always be obvious.

Rules:
- visible but restrained focus ring
- focus should not rely on color alone
- focused dock/panel/tab/split should be clear at a glance

## Motion
Motion should clarify relationships.

### Timing guidance
- hover/fade: 120–160ms
- panel/dock reveal: 180–220ms
- tab state transition: 120–160ms

### Motion style
- restrained
- direct
- no playful springiness in the core workspace

## Error and transient states

### Connection status
Use small status indicators instead of repeated verbose labels.

### Reconnect
Should be a compact action and contextual state, not a large disruptive banner.

### Sync status
Should be present, but quiet and trustworthy.

## Persistence rules
Hermes should remember:

- last workspace
- open tabs
- split layout where feasible
- last used right-side tool
- last used dock view
- immersive mode preference if user-set

## Commit and Git interactions

### Git context pattern
- repo state is visible in context line
- Git panel is opened on demand
- clicking a changed file loads the diff into the dock
- commit entry lives inside Git context, not in the global top bar

This avoids clutter while keeping the flow close to the terminal.
