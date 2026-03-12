# Hermes Design Documentation

This folder defines the redesign direction for **Hermes**, a modern SSH client built on Electron.

Hermes is being redesigned as a **terminal-first workspace**:

- SSH and shell sessions are the center of gravity
- the app resumes into the last active workspace by default
- Git, Files, Quick Commands, Logs, and Session Details are **attached context**, not noisy full-time chrome
- sync is **user-owned and self-hostable**, not a mandatory third-party SaaS dependency
- the visual system is calm, dense, and restrained

This documentation exists to stop the redesign from drifting back toward:

- dashboard software
- admin-console framing
- decorative textures
- large text-button toolbars
- page-first architecture

## Reading order

1. [00-product-brief.md](./00-product-brief.md)
2. [01-design-principles.md](./01-design-principles.md)
3. [02-information-architecture.md](./02-information-architecture.md)
4. [03-app-shell.md](./03-app-shell.md)
5. [04-visual-system.md](./04-visual-system.md)
6. [05-interaction-model.md](./05-interaction-model.md)
7. [06-sessions.md](./06-sessions.md)
8. [07-git-files-and-context.md](./07-git-files-and-context.md)
9. [08-home-connections-settings.md](./08-home-connections-settings.md)
10. [09-theme-and-tokens.md](./09-theme-and-tokens.md)
11. [10-implementation-roadmap.md](./10-implementation-roadmap.md)
12. [adr/001-terminal-stack-policy.md](./adr/001-terminal-stack-policy.md)
13. [tokens/theme.tokens.json](./tokens/theme.tokens.json)
14. [tokens/theme.css](./tokens/theme.css)

## Scope

This is not a loose moodboard. These docs are intended to be used as the source of truth for:

- product direction
- IA and navigation
- shell anatomy
- theme behavior
- interaction rules
- component constraints
- implementation sequencing
- stack decisions for terminal/TUI surfaces

## Non-goals

Hermes is **not** trying to be:

- an IDE replacement
- a cloud account product with SSH attached
- a cyberpunk terminal skin
- a plugin maze
- a metrics dashboard

## Success condition

The redesign is successful when Hermes feels like:

- one connected workspace
- low chrome, high clarity
- premium through discipline
- self-hostable and trustworthy
- fast to operate without needing to leave the terminal flow
