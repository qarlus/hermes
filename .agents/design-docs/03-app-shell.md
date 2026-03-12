# App Shell

## Shell thesis
The Hermes shell must become thinner, quieter, and more connected.

The shell exists to support work, not to present every capability at once.

## Shell anatomy

### Left rail
Persistent.
Slim.
Mostly icon-led.

Contains:

- Home
- Sessions
- Connections
- Git
- Files
- Settings
- Logs

Rules:

- 56–64px visual width in compact mode
- optional expand-to-label mode for discoverability/settings
- active item uses filled/tonal state, not a loud outline
- tooltips always available
- no giant side cards or decorative blocks

### Top region
Two layers maximum.

1. Tab rail
2. Context line

No additional global page headers above this in active workspace mode.

### Main workspace
Largest surface in the application.

Rules:

- visually dominant
- minimal framing
- terminal content gets priority
- support splits without making the shell heavy

### Right-edge reveal
Hidden at rest.
Used for attached context tools.

### Bottom dock
Hidden at rest.
Used for diffs, logs, output, and inspect surfaces.

## Modes

### Normal mode
- left rail visible
- tab rail visible
- context line visible
- utilities hidden
- terminal dominant

### Focused mode
- side panel or bottom dock open
- shell remains restrained
- workspace still reads as one surface

### Immersive mode
- left rail collapses or fades away
- context line reduces or hides first
- tab rail remains minimal or reveals on hover
- side/bottom tools available by shortcut

## Top region in detail

### Tab rail
Purpose:

- switch live session containers
- show what is open
- expose low-noise state

Rules:

- 32–34px height target
- integrated with custom titlebar region
- editor-style tabs only
- no browser-tab treatment
- no capsule/pill tabs

### Context line
Purpose:

- show active session/workspace identity
- show repo/branch context
- expose a tiny action cluster

Rules:

- 34–36px height target
- no large text buttons
- no redundant headers
- no giant status strings

## Suggested top-region anatomy

### Left side
- workspace name
- active session title
- host alias
- optional path segment if useful

### Middle
Subtle pills for:

- repo
- branch
- dirty count
- optional sync/relay state

### Right side
Tiny icon actions only:

- new tab
- split
- reconnect
- toggle files
- toggle git
- overflow

Anything more should move into:

- right panel
- dock
- overflow menu
- command palette

## Tab model

### Tabs represent
Session containers.

### Splits represent
Layout inside the active session.

This distinction is important.

Tabs should not multiply to represent every split.

## Right-edge reveal

### Purpose
Reveal attached tools only on intent.

### Trigger options
- keyboard shortcut
- hover at right-edge hot zone
- explicit click from context controls

### Tool set
Recommended default set:

- Files
- Git Changes
- Quick Commands
- Session Details

### Behavior
- reveal affordance on edge hover
- click opens attached panel
- shortcut opens last-used tool directly
- escape closes if not pinned
- pin can keep it open temporarily

### Important rule
Hover reveals the tool chooser or affordance, not the full heavy panel by itself.

## Bottom dock

### Purpose
House horizontal or output-heavy surfaces.

### Ideal contents
- Diff viewer
- Logs
- Search results
- Command output
- Transfer progress
- Inspect/debug surfaces

### Behavior
- hidden by default
- opens on explicit action
- resizable
- collapsible
- expandable to a larger/full mode

## What the shell must not regress into

- stacked page headers
- always-open utility sidebars
- giant toolbars above terminal content
- visible panel borders for every region
- dashboard energy inside the active workspace
