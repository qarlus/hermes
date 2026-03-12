# Sessions Specification

## Sessions thesis
Sessions is the emotional and operational core of Hermes.

If Sessions feels right, the product feels right.
If Sessions still feels boxed, cluttered, or page-like, the redesign has failed.

## Role of Sessions
Sessions must support:

- local shell work
- SSH shell work
- rapid context switching
- split layouts
- attached Git inspection
- attached file browsing
- quick commands
- session metadata without interruption

## Visual priority
The terminal surface must dominate.

That means:

- minimal chrome around terminal content
- no large top-button bars
- no page-header feeling
- no detached widgets competing for attention

## Top structure
Two layers maximum:

1. tab rail
2. context line

## Tab rail

### Intent
Editor-style session tabs.

### Rules
- 32–34px high
- flat/rectangular with subtle radius
- no heavy outlines
- inactive tabs are quiet
- active tab is anchored by fill and text contrast
- close button appears on hover

### Tab contents
Keep to:
- leading session-type icon or tiny state mark
- short session title
- hover close affordance

### Do not include
- repo/branch text
- verbose connection labels
- repeated “connected” text
- file path strings
- multi-line metadata

## Context line

### Left
- workspace name or session title
- active host alias
- optional current path segment when helpful

### Middle
subtle pills for:
- repo
- branch
- dirty count
- optional relay/sync state

### Right
small icon actions only:
- new tab
- split
- reconnect
- toggle files
- toggle git
- overflow

## Split model

### Rule
A tab is a session container.
A split is layout inside the session container.

### Consequence
Splits should not create more top-level tab noise.

### Focus behavior
The context line updates to reflect the currently focused split.

## Empty Sessions state
When no terminal is open, Sessions should still feel useful.

Show:

- recent connections
- quick connect
- open local shell
- recent workspace resume
- recent commands or snippets

Do not show:
- giant generic empty card
- decorative art
- verbose onboarding copy blocks

## Session actions

### High-frequency actions
Prefer icon-first:
- new tab
- close tab
- split
- reconnect
- reveal files
- reveal git
- reveal commands
- reveal details

### Lower-frequency actions
Move into overflow or palette:
- rename tab
- duplicate session
- move to workspace
- advanced reconnect options

## Status language
Use compact signals instead of repeated text.

Examples:
- connected/disconnected/reconnecting via dot/icon state
- host type via icon
- dirty repo via pill count

## Immersive mode
Sessions should support a true reduced-chrome mode.

### Behavior
- left rail hides/collapses
- context line collapses first
- tab rail becomes quieter or hover-reveal
- side/dock tools remain shortcut accessible

### Goal
The user should feel they are almost directly inside the terminal workspace.

## Performance and motion
Sessions must feel instant.

### Design consequence
Avoid UI treatments that imply expensive rendering:
- persistent blur layers
- decorative gradients over large surfaces
- many stacked borders and shadows
- unnecessary animation

## Quality bar
The benchmark for Sessions is:

- it feels lighter than the current Hermes
- it feels more continuous than a page-based tool
- it keeps the terminal visually central
- it makes Git/Files feel attached rather than bolted on
