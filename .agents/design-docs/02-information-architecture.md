# Information Architecture

## IA thesis
Hermes is not organized as several equal-weight pages. It is organized as a workspace with a primary operational surface and secondary attached tools.

## Primary navigation

### Home
Role:

- lightweight entry surface
- recent workspaces
- recent connections
- quick connect
- sync/relay state

Notes:

- not a “dashboard” in the SaaS sense
- should be visually light
- should not compete with Sessions

### Sessions
Role:

- primary product surface
- tabs
- splits
- active terminal state
- attached tools

Notes:

- this is the center of gravity
- should define the emotional feel of the app

### Connections
Role:

- saved hosts
- credentials/auth methods
- grouping/tagging
- relay storage metadata
- connection actions

Notes:

- technical and trustworthy
- no marketing tone

### Git
Role:

- optional full-surface mode for deeper repo work
- history, branch operations, multi-file review

Notes:

- most routine Git work should be contextual from Sessions
- this route exists for depth, not as the default workflow

### Files
Role:

- optional full-surface mode for deeper file browsing/transfers

Notes:

- most routine file work should be contextual from Sessions

### Settings
Role:

- customization
- theme/density/layout preferences
- terminal defaults
- sync/relay settings
- keyboard behavior

### Logs
Role:

- support/debug surface
- low prominence in primary nav or secondary placement

## Launch behavior

### Default
Reopen the last active workspace and its sessions.

### Fallback
If there is no resumable workspace, show Home.

## Navigation hierarchy

### Stable shell navigation
Always available:

- left rail
- command palette
- keyboard shortcuts

### Contextual workspace navigation
Appears only when relevant:

- right-edge reveal tools
- bottom dock
- panel expand actions
- repo/file context affordances

## Recommended left rail order

1. Home
2. Sessions
3. Connections
4. Git
5. Files
6. Settings
7. Logs

## What should not be first-class navigation
These should be surfaced contextually rather than as primary routes:

- Quick Commands
- Session Details
- Diff Viewer
- Search Results
- Transfer Progress

## Mental model

A user should interpret Hermes like this:

- left rail = product destinations
- top region = current session/workspace state
- right side = attached context tools
- bottom dock = inspect/output surfaces

Not like this:

- every feature is a page
- every page has its own toolbar system
