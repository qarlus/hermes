# Implementation Roadmap

## Goal
Implement the redesign as a controlled system migration, not a collection of isolated screen fixes.

## Phase 1 — Foundations

### Deliverables
- semantic color system
- spacing/radius/type tokens
- icon family selection and component wrappers
- top-region rules documented in code
- button taxonomy
- tab system rules
- panel and dock primitives

### Success criteria
- the old grid treatment is removed
- new theme tokens compile across the shell
- tabs/buttons/pills/nav all share one visual language

## Phase 2 — Shell rebuild

### Deliverables
- slim left rail
- editor-style tab rail
- thin context line
- right-edge reveal primitive
- bottom dock primitive
- immersive mode behavior

### Success criteria
- top region is reduced to two layers max
- persistent utility chrome is gone
- the shell feels connected even before feature surfaces are redesigned

## Phase 3 — Sessions overhaul

### Deliverables
- terminal-first Sessions surface
- tab/split handling cleanup
- compact action cluster
- empty-state replacement
- session status model

### Success criteria
- terminal visually dominates
- split handling feels native to the workspace
- no large text button bars remain

## Phase 4 — Attached context tools

### Deliverables
- Files side panel
- Git changes side panel
- Quick Commands side panel
- Session Details side panel
- Diff/log/output dock views

### Success criteria
- routine Git and file work no longer requires leaving the workspace
- changed-file click opens docked diff cleanly
- right-edge reveal and shortcut model feel stable

## Phase 5 — Home / Connections / Settings

### Deliverables
- Home replaces dashboard behavior
- Connections reflects trust and ownership model
- Settings updated to same visual system
- Sync & Relay flows aligned with the product character

### Success criteria
- Home is lightweight and useful
- Settings no longer looks like a different product
- sync feels technical and trustworthy, not SaaS-led

## Phase 6 — Polish and validation

### Deliverables
- keyboard pass
- accessibility pass
- motion tuning
- microcopy cleanup
- empty state cleanup
- performance review of Electron surfaces

### Success criteria
- keyboard users can drive primary workflows smoothly
- focus states are clear
- no janky reveal/dock interactions
- shell remains visually calm under real usage

## Acceptance checklist

A build is on the right track if:

- the app no longer feels dashboard-like
- there are dramatically fewer visible borders
- the top region is compact and editor-like
- Git/Files feel attached, not bolted on
- the terminal is always the center of gravity
- the default dark theme feels blue-charcoal and premium
- sync surfaces communicate ownership and trust
