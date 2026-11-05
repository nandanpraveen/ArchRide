# ArchRide design system

ArchRide helps UGA students choose a destination, compare a walk with a bus and follow the trip. The map and the next useful action lead every screen. The owner requested a simpler interface on November 5, 2026: remove promotional copy, repeated explanations, decorative blocks and unnecessary cards.

Use one compact desktop header and five mobile bottom-navigation destinations. On phones, Home prioritizes the trip form; the interactive map lives on the Map screen so its renderer does not delay planning. Keep the Home trip form open on the canvas beside the map; avoid nested panels. Use plain rows and whitespace for saved places, classes and settings. Empty states need one short instruction and one action. Show essential errors immediately; put source evidence, full service notices and detailed rules behind native disclosures. Never hide a boarding stop, uncertain parking permission or an expired prediction behind visual polish.

Palette: canvas #f7f8fa, surface #ffffff, ink #18222b, secondary #65717c, UGA red #ba0c2f, divider #e6e9ed. Dark surfaces #141a20/#1b232c use a muted pink accent and pale text. Semantic colors and bus route colors always have text labels. `src/theme.ts` owns these tokens.

Self-hosted variable Roboto serves headings and body with deliberate weight and spacing. Use 28–36 px main headings, 18 px section headings and 14–16 px body/controls. Tabular numerals distinguish travel time. Keep descriptions short; use ordinary sentence case and consistent action names.

Use 12 px panels, 8 px controls, a shared 8 px spacing scale, 20 px mobile gutters and 44–48 px touch targets. Use explicit pixel strings for local MUI radius overrides because numeric sx radii multiply the theme radius. Buttons wrap at enlarged text. Vertical trip actions have explicit mobile widths to stay stable during WebKit focus. Bus markers use fixed 28 px glyph tiles in 44 px targets (34 px selected); map controls are 44 px on phones and 32 px on desktop. Grid tracks use minmax(0,1fr). Preserve zoom, visible keyboard focus, reduced motion and safe-area padding.

The signature is the actual campus map paired with a concise whole-journey decision. There are no promotional heroes, ornamental metrics, stock imagery, sidebar sales cards or decorative animation. Motion is limited to short interaction feedback. Verify 320–1440 px, light/dark, keyboard, 150% and 200% text, stale/offline data and engine-specific behavior.
