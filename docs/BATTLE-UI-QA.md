# Battle UI layout regression

The battle HUD now assigns bounded left/right lanes between the visible team
rosters (or touch minimap) and the bottom controls. Chat and incoming alerts
share the left lane; outgoing reports and the combat log share the right lane.
The lanes update through ResizeObserver and viewport/panel events, not the
render loop. Resizing a window or enlarging the minimap recalculates an already
open report. Reports scroll within their lane; alert density reduces when
space is tight. The results footer has its own layout row.

Primary owners: `src/ui/battleHudLayout.ts`, `src/ui/battleHudLayout.css`.
The shared modal Tab boundary also applies to battle Settings.

## Reproduce

Start the regular Vite server, then run:

```sh
node src/ui/battleHudLayout.selftest.mjs
node tools/battle-hud-layout.browser.mjs --url=http://127.0.0.1:5189 --out=/absolute/new-evidence-directory
```

The rendered gate uses Playwright and installed Chrome. If Playwright is
provided outside the repository, pass
`--playwright-module=/absolute/path/to/playwright/index.mjs`.
Its fixture imports the **production** HUD, damage panel, input, touch controls,
room chat, Settings, results UI, and responsive CSS. It does not duplicate their
markup or use a simulated CSS layout engine. No full WebGL scene is needed for
this deterministic geometry gate; verify the live battle separately as well.

## Coverage

- Mouse: 1920×1080, 1366×768, 1280×720, 1024×600, 820×1180,
  540×720, 390×844, 844×390.
- Touch: 1024×768, 768×1024, 390×844, 360×640, 844×390, 667×375.
- Chinese: 1280×720 mouse and 390×844 touch; all other cases use English.
- States: ordinary HUD, countdown, incoming/outgoing hit reports, combat log,
  chat, simultaneous chat/log/hits, spectator, Settings, sniper, enlarged map,
  expanded touch ammo, special action, and results.
- Settings tabs are clicked through; Shift+Tab is checked at the focus boundary.
- Each case also rotates/resizes with chat/log open and enlarges the map, then
  returns to its original size. Both resized layouts are measured.
- The production killcam phase class is checked for leaked chat/touch controls;
  the results fixture includes both Battle Again and Return to Garage actions.

The full run contains **297 state/viewport checks**. It fails on overlapping
screen-fixed regions, offscreen bounds, failed ammo disclosure, focus escaping
Settings, or browser exceptions. JSON geometry receipts and selected/failing
screenshots are saved under `--out`. Keep evidence outside tracked source.

This is emulated Chromium coverage, not physical iOS/Safari certification.
World-space tank names remain attached to their projected vehicles and are
intentionally excluded from screen-fixed panel collision checks. Full-screen
modal backdrops intentionally cover the battlefield; their internal regions
are checked instead. The 3D killcam presentation is not part of this fixture.

The older `mobileLayout.selftest.mjs` currently stops at an unrelated Garage
source-regex assertion expecting pre-localization literal English markup.
Do not treat that as a passing full-suite result or remove the assertion to
make this HUD change appear green. The focused rendered gate is independent.
