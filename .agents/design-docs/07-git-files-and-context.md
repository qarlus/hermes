# Git, Files, and Attached Context

## Thesis
Git and Files should primarily behave as **attached context surfaces** within the active workspace.

They may still support expanded/full-surface modes, but routine interaction should not feel like leaving the session.

## Attached tool model

### Side-oriented tools
Best placed in the right-side contextual panel:

- Files
- Git changed-files list
- Quick Commands
- Session Details

### Bottom-oriented tools
Best placed in the bottom dock:

- Diff viewer
- Logs
- Search results
- Transfer/output inspection

## Git

### Default Git presence
Git should appear first as compact session context:

- repo pill
- branch pill
- dirty count pill

This lives in the context line.

### Opening Git
Git should open through:

- shortcut
- right-edge reveal
- clicking repo/branch context

### Git side panel
The side panel should focus on:

- changed files
- staged/unstaged grouping if used
- status counts
- branch actions
- quick fetch/pull/push actions

### Git diff workflow
Recommended behavior:

1. Git context is opened
2. changed files are listed in the side panel
3. hovering a file highlights it and may prefetch metadata
4. clicking a file opens its diff in the bottom dock
5. the dock supports collapse, resize, and expand-to-full mode

### Commit workflow
Commit entry belongs inside Git context, not in the global top bar.

Recommended layout:
- compact commit message field in side panel or dock header
- quick stage/stage-all actions nearby
- compact push/pull/fetch controls

### Action language
Use icon-led controls for repeated actions such as:
- fetch
- pull
- push
- stage all
- open diff
- expand review mode

Use text where clarity matters:
- commit message input
- destructive confirmations
- advanced branch operations

## Files

### Default Files presence
Files is a side companion.

It should be easy to open without feeling like opening a separate file manager application.

### Files side panel
Should support:
- current directory tree or root-aware file list
- breadcrumbs/path context
- open/reveal/copy path actions
- transfer shortcuts if relevant

### Rules
- prioritize current host/session context
- keep the toolbar compact
- move rare actions into overflow
- avoid icon overload in the header

### Expansion model
Files can expand into a wider/full mode for heavier tasks, but the default should stay attached.

## Quick Commands

### Role
Quick Commands is an attached utility, not a page.

### Recommended behavior
- opens in right-side panel or command tray
- scoped to active session where appropriate
- supports send-to-terminal and copy
- searchable and shortcut-friendly

## Session Details

### Role
Host/session metadata should be available without cluttering the workspace.

### Best placement
Right-side panel tab.

### Contents
- host info
- auth method summary
- connection latency/status if useful
- relay/sync state
- environment summary

## Expand-to-full behavior
Attached tools can support a promoted/full-surface mode when needed.

Examples:
- large diff review
- full repo history browsing
- wider file transfers
- detailed logs

But this is the secondary path, not the primary product posture.

## Anti-patterns
Do not regress into:

- a giant Git toolbar above the terminal
- a fully detached file manager by default
- always-visible text buttons for push/pull/commit
- loading diffs into hover-only unstable surfaces
- forcing every Git task into its own page switch
