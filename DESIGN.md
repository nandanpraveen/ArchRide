# ArchRide design system

## Direction

Students use ArchRide on sunny campus sidewalks while deciding how to reach class. Start with a light, high-contrast Material interface, familiar controls, and restrained red accents. Material UI supplies components; Tailwind supplies layout utilities.

## Color

Use OKLCH tokens. White background, neutral surfaces, dark readable text, red primary actions, and semantic state colors. Route colors convey route identity and always have text labels. Never use color alone to convey urgency or freshness.

| Role | Token |
| --- | --- |
| Background | `oklch(1 0 0)` |
| Surface | `oklch(0.97 0 0)` |
| Text | `oklch(0.20 0 0)` |
| Secondary text | `oklch(0.43 0 0)` |
| Primary | `oklch(0.48 0.18 24)` |
| Outline | `oklch(0.83 0 0)` |

## Typography and spacing

Roboto with a system sans fallback. Material typography variants, a 4 px spacing rhythm, 16–24 px screen gutters, and 48 px principal touch targets. Keep body copy short. Use 12–16 px card radii and pill buttons. Apply elevation only where needed.

## Navigation and components

Five destinations: Home, Map, Plan, Saved, Profile. Material bottom navigation on phones becomes a rail on wider screens. Route, stop, alert, notification, class, and active-trip details open within this structure. Use Material fields, chips, lists, sheets/dialogs, progress indicators, and snackbars consistently.

## States and motion

Show loading, empty, unavailable, stale, denied-location, error, retry, and signed-out states. Unknown arrivals have no countdown. Transitions communicate state in 150–250 ms and respect reduced motion. Keep focus visible and restore it after dialogs close.
