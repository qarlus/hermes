# Theme and Tokens

## Theme thesis
Hermes should ship with a default dark theme that feels calm, blue-charcoal, and premium without becoming theatrical.

Theme customization should be built on semantic tokens, not one-off color overrides.

## Theme architecture
Use a semantic token model with three layers:

### 1. Base palette
Raw color values.

### 2. Semantic tokens
Meaningful roles such as:
- app background
- workspace background
- panel background
- text primary
- text secondary
- accent
- success
- warning
- danger
- border subtle

### 3. Component tokens
Specific usage roles such as:
- tab active background
- nav active background
- dock divider
- input focus ring
- diff added background
- diff removed background

## Default theme

### Name
Hermes Midnight

### Character
- blue-charcoal
- graphite panels
- warm white text
- cool restrained accent

### Color roles

#### Core neutrals
- app background: `#0A0D12`
- shell background: `#0D1117`
- workspace background: `#10151D`
- panel background: `#141B24`
- panel elevated: `#18212C`
- divider subtle: `#273140`

#### Text
- text primary: `#E6EDF6`
- text secondary: `#A6B3C2`
- text tertiary: `#7C8795`
- text disabled: `#5B6572`

#### Accent
- accent primary: `#5B8CFF`
- accent hover: `#709CFF`
- accent muted background: `rgba(91, 140, 255, 0.14)`
- focus ring: `rgba(91, 140, 255, 0.45)`

#### Semantic status
- success: `#49B67D`
- warning: `#D9A54B`
- danger: `#D96A6A`
- info: `#5DA8FF`

#### Git diff roles
- diff added bg: `rgba(73, 182, 125, 0.16)`
- diff added border: `rgba(73, 182, 125, 0.38)`
- diff removed bg: `rgba(217, 106, 106, 0.16)`
- diff removed border: `rgba(217, 106, 106, 0.38)`
- diff context bg: `rgba(255, 255, 255, 0.02)`

## Optional theme variants for v1
Support only if implemented through the same semantic token system.

### Hermes Graphite
Slightly less blue, more neutral graphite.

### Hermes Slate
Slightly brighter and cooler for users who want more contrast.

Rule:
Do not add many themes before the semantic system is stable.

## Accent customization
V1 may allow accent selection.

### Guardrails
- accent must not change core semantic status colors
- accent must preserve focus visibility and contrast
- accent must not recolor the entire app into a novelty skin

Good accent targets:
- active nav state
- focused tabs
- selected pills
- focus ring
- hover emphasis

## Density modes
Support through tokens, not ad hoc component changes.

### Compact
- tighter gaps
- smaller panel padding
- smaller row heights
- preferred default for power users

### Comfortable
- slightly larger row heights
- slightly larger panel padding
- still far denser than current Hermes

## Spacing tokens
Suggested baseline:

- 4px micro
- 8px compact gap
- 12px medium gap
- 16px panel padding base
- 20px panel padding relaxed
- 24px page/section spacing

## Radius tokens
- 8px control
- 10px panel
- 12px shell/dock
- full pill

## Typography tokens
- font ui: system or Inter-like neutral sans
- font mono: terminal monospace of choice
- text sizes as semantic roles, not arbitrary per page

## Theme behavior rules

### At rest
- most of the UI lives in neutral tones
- accent is sparse
- state is carried by contrast and grouping first

### On interaction
- hover lifts slightly through tone
- selected state uses fill + contrast + accent support
- focus ring is visible and accessible

### On alert
- semantic colors stay softened and controlled
- red/amber do not dominate the overall UI

## Forbidden theming patterns
- persistent visible grid overlays
- strong gradients across major surfaces
- bright outlines on every panel
- black-on-black with low text contrast
- neon accents without semantic discipline
