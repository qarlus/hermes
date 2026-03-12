# Product Brief

## Product statement

Hermes is a **beautifully modern SSH client** with a **terminal-first workflow**, **user-owned sync**, and **attached tooling** for Git, Files, and Commands so developers can stay in flow.

## Positioning

Hermes should sit in the space between:

- the utility expectations of Tabby/Termius-style SSH clients
- the flow-preserving feel of Warp-like session handling
- the restraint and hierarchy quality seen in products like Linear and Cursor

But Hermes should remain lighter, quieter, and more trustworthy in its sync story.

## Core promise

> Hermes lets developers resume their real terminal workspace instantly, manage remote systems beautifully, and inspect the context around their work without bouncing into other tools.

## Primary differentiators

### 1. SSH-first, not AI-first
Hermes is designed around terminals, hosts, sessions, and workspaces.

### 2. User-owned sync
Hermes can sync through a self-hostable relay and should not require a third-party cloud account for the core product experience.

### 3. Context without context switching
Git diffs, files, logs, quick commands, and connection details should appear as **attached context surfaces** instead of pulling users into detached admin pages.

### 4. Premium feel without heavy UI
Hermes should feel high-end through structure, motion, typography, and contrast discipline rather than decorative effects.

## Target user

Primary:

- developers working across local shells and remote machines
- users who care about ownership, speed, and polish
- users who want modern terminal UX without SaaS dependence

Secondary:

- teams operating internal infrastructure over SSH
- developers who want light Git/file inspection close to the terminal
- users migrating from Tabby/Termius/Warp but dissatisfied with weight or lock-in

## Product character

Hermes should feel:

- calm
- direct
- trustworthy
- technical
- deliberate
- lightweight

Hermes should not feel:

- flashy
- ornamental
- dashboard-like
- enterprise-admin
- gamer/cyberpunk

## Core entities

### Workspace
Persistent user context.

Contains:

- last active sessions
- preferred layout
- recent commands
- attached context state
- repo/file context
- relay/sync state

### Session
Live operational surface.

Contains:

- local shell or SSH shell
- tabs
- splits
- focus state
- active host/path/repo context
- attached tools

### Connection
Reusable endpoint.

Contains:

- host configuration
- auth method
- labels/groups
- relay/keychain storage metadata
- connection policy

## Default product behavior

On launch, Hermes should reopen into the **last workspace / active sessions** whenever possible.

This is not a dashboard-led product. It is a resume-your-work product.

## Product constraints

- must remain visually and operationally lightweight
- must not rely on large always-visible toolbars
- must not require a hosted vendor service for sync
- must keep terminal activity as the visual center
- must make adjacent tools discoverable without keeping them permanently open
