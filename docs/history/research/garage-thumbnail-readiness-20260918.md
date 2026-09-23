# Garage thumbnail readiness — 2026-09-18

**Result: asynchronous portrait readiness, not a persistent missing asset.**
Both Griffin 50mm X and KF41 Lynx X eventually display their original packaged
portraits with normal framing on desktop and mobile graphics tiers. No game UI,
profile, geometry or shared runtime change was needed.

## Acquisition and observations

The two fresh runs used the actual Garage pointer controls, fresh Chromium,
4× CPU throttling, two normal cycles plus rapid switching, then an independent
thumbnail verification phase. Both used 1440×900 at DPR1; “mobile” here means
the graphics tier, not a phone viewport or physical mobile browser. Production
UI paths were served by Vite's development server, not a production bundle.

Evidence under `.qa-dev/tank-run/final-integration/`:

| Run | First Griffin screenshot DOM | First KF41 screenshot DOM | Repeat and settled results |
| --- | --- | --- | --- |
| `thumbnail-desktop-r1` | Selected ready; 9/9 visible portraits ready | 0/9 ready; selected image loaded at 256×256, framing complete, CSS opacity still 0 | Both selections and 9/9 visible portraits ready |
| `thumbnail-mobile-r1` | Selected ready; 7/9 visible portraits ready | 0/9 ready; selected image loaded at 256×256, framing/reveal pending, opacity 0 | Both selections and 9/9 visible portraits ready |

Final selected images use their expected `/icons/thumbs/<id>_angle.webp` URL,
fallback index0, `cotPortraitReady=true`, `cotPortraitFramed=true`, visibility
`visible` and opacity1. KF41's final framing is x−39.96px, y−44.60px, scale1.5709;
Griffin's is x−28.51px, y−31.62px, scale1.4039. No resource or browser errors,
timeouts or identity drift occurred. These are actual DOM observations just
after the corresponding screenshots, not exact first-visible timestamps.

The original historical Griffin blank and KF41 blank were also compared with
their full original-run repeat screenshots. Both repeats visibly contain the
portraits. Four historical images, the two new blank KF41 screenshots, and all
four new settled screenshots were actually inspected. All14 new PNG hashes
were independently verified against their reports.

## Cause and probe correction

`tankThumbs.ts` lets IntersectionObserver trigger image loading and serializes
alpha-bound normalization through an idle queue. Garage CSS intentionally keeps
unframed portraits transparent, then transitions them into view. Pedestal model
readiness does not mean that this independent process has completed.

The prior selection probe recorded its screenshot immediately after main-model
readiness and only dwelled afterward. `tools/tank-selection-probe.mjs` now:

- Saves passive image/DOM state after each original timing screenshot, including
  loaded dimensions, URL, fallback index, frame attributes/transform and computed
  opacity for every currently visible card.
- Runs thumbnail waits **after the entire original timing acquisition**, including
  rapid switching. This keeps the waits from prewarming later timed selections.
- Requires selected and visible portraits to finish loading, framing and fading;
  saves separate `thumb-settled-*` images and fails on timeout/incomplete state.
- Never drains the production queue, forces decode or edits UI state to pass.

Main-model timing retains its own stopwatch and original fields. The independent
thumbnail phase is eventual-readiness evidence, not cold portrait latency or a
new main-model performance measurement. Syntax validation and both actual
desktop/mobile browser runs pass.

## Receipt identities

- Captured acquisition SHA-256:
  `18beefc77a1269a800de79f2575db4eafed45b31db5488091d89f28d56e8ed3d`.
- Desktop report:
  `ab2a24656068e3cd8f8224057268b8cafb26df8143c7bcbedae6b4bf33fd9be6`.
- Mobile-tier report:
  `f2cfad446ba365b5742f77dc52311922c1a9c04bb7e6b6f41257f7429da9cfd7`.
- Desktop settled Griffin/KF41 PNGs:
  `cca47d088c56843e66e193758917f69e6d3aef95bbb16539c176aacfae13a094` /
  `be95b65a46b0f1e4ccc50fddb2c20aae7d0fd159311e1ee2b89c880a5c2d5c99`.
- Mobile-tier settled Griffin/KF41 PNGs:
  `ef7fb7c5455f0d9aaed48ccabf96cb55beca1872fd96a1a75ea984e13b66475f` /
  `1ccb0f9fae6aece484a4d64fdbe9536b7a262fb963fe8ef917d8fbcb9369c3e0`.

A subsequent acquisition-only guard records a missing identity file as null,
allowing the browser to report genuine asset failures/fallbacks instead of
throwing before capture cleanup. Every identity input existed in these two
receipts, so that branch is inactive for them; the historical acquisition hash
above is preserved. Browser/server instances were closed and both leases released.
