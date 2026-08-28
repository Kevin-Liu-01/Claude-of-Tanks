# 0114 — Large static interface styles ship as CSS

## Context

The Garage and shared responsive rules were two static template strings inside
JavaScript modules. They added roughly 135 kB of CSS text to the serial module
graph even though the browser only needed to parse them as CSS. This increased
first-visit JavaScript transfer and parsing without providing runtime behavior.

## Decision

Keep the rules byte-equivalent in `garage.css` and `responsiveSurfaces.css`,
and let Vite emit them as one static stylesheet. The composition root imports
responsive rules before Garage rules, preserving their established DOM cascade.
The two font constants are expanded to their exact existing stack values.

## Consequences

- Production main JavaScript falls from 596.03 kB to 467.05 kB minified and
  from 202.01 kB to 175.50 kB gzip.
- The 19.38 kB gzip stylesheet can transfer and parse as a native render
  resource instead of occupying the JavaScript module graph.
- Selectors, declarations, responsive behavior, and visual precedence remain
  unchanged.
- Future static interface rules belong in CSS, not injected template strings.

## Verification

- `node src/ui/runtimeStyles.selftest.mjs`
- `node src/ui/responsiveLayout.selftest.mjs`
- `node src/ui/mobileLayout.selftest.mjs`
- `node src/game/killcamPresentation.selftest.mjs`
- `npm run typecheck`
- `npm run build`
