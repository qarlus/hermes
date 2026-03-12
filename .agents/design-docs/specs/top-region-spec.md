# Top Region Spec

## Goal
Reduce the top of Hermes from a large, cluttered header into a compact editor-like control area.

## Hard constraints
- maximum two horizontal layers in normal mode
- no persistent text-button toolbar
- no page-title bar above active sessions
- no repeated verbose connection status text

## Layer 1: Tab rail

### Height
32–34px

### Content
- session tabs
- optional new-tab affordance
- drag region integration
- window control integration as appropriate per OS

### Tab behavior
- editor-style tabs only
- subtle radius
- active tab uses tonal fill
- inactive tab is quiet until hover
- close button on hover

## Layer 2: Context line

### Height
34–36px

### Left zone
- active session label
- active host alias
- optional path fragment

### Middle zone
Compact context pills:
- repo
- branch
- dirty count
- sync/relay state if relevant

### Right zone
Maximum 5 visible icons:
- split
- reconnect
- toggle files
- toggle git
- overflow

Rule:
Any new proposed top-bar action must justify why it cannot live in:
- command palette
- overflow
- right-side panel
- bottom dock

## Immersive behavior
- context line hides first
- tab rail stays or reduces in contrast
- full reveal available on hover near top edge

## Top-region quality check
A design fails this spec if:
- the top area feels like a web app header
- there are multiple equal-weight buttons
- the tab strip feels like browser tabs
- the top region competes with terminal content
