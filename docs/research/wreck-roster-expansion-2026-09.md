# Public-fleet wreck variety

## What changed

The contemporary battlefield pool now contains 32 distinct playable donors,
with explicit casts on all 30 maps. This adds recognizable light/missile/IFV
silhouettes—Sheridan, M60A2, Marder, Bradley, BMP-3, CV90 and BMPT—alongside
PL-01, Oplot-M, Leclerc XLR, Type 90 and other MBTs. These are the existing
first-party procedural vehicles, not external models or newly playable tanks.

The retired Leopard 2A7 was still in the default wreck pool and the Verdant,
Winter, Urban and Railyard casts. It remains an internal builder donor, but
is not publicly playable. Public Leopard 2A7V replaces it. A candidate
`merkava4` also failed the new admission test; the correct public donor is
`merkava4b`. Hidden/archived WWII donors no longer enter historical pools.

`wreckRoster.ts` checks the live `PRODUCTION_TANK_IDS` catalog after metadata
registration. Merely having saved specs or a loadable builder is insufficient.
Authored casts are filtered and stably deduplicated without mutating their
source arrays. Empty/wholly invalid casts use eligible era defaults; an empty
public catalog places nothing. Unknown era strings cannot access inherited
object properties. Selection itself imports no vehicle builders.

## Placement and cost

Desktop placement caps remain exactly 5–9 according to the original map;
mobile remains capped at two. Every modern donor appears in authored casts,
including their first-two-slot union across maps. This is authoring coverage,
not a promise that terrain and triangle limits allow every slot at every seed.

The first rendered pass exposed a pre-existing selection defect: a rejected
slope consumed its donor before any wreck existed. Verdant therefore placed
Sheridan twice while skipping M1A1. Selection now advances only on successful
placement, retaining the donor for the next supported site. Ground support,
spawn/road restrictions, triangle limits and seeded fallback selection remain.

Existing destroyed poses, char/rust paint, debris, merged static geometry and
lightweight shadow proxies are retained. Only selected families are acquired;
the expanded pool is not preloaded wholesale. The separate exact-paint
optimization is documented in
[the loading study](multiplayer-loading-paint-dedup-2026-09.md). Its frozen
performance evidence deliberately excludes these map-content changes.

## Verification

- Public admission test: 51 unique donors across all era pools; hidden IDs,
  live catalog updates, invalid/empty input, array ownership and builder-free
  selection checked.
- Real headless bake test: all 51 donors plus four repeated new-family poses
  passed finite geometry, normal/color/index, ground seating, storage, shadow
  and determinism checks without DOM/Canvas. Existing authored zero normals
  are explicitly reported, not silently altered.
- All 30 map configurations pass public cast, uniqueness, full authored
  coverage and unchanged count-budget tests.
- Final canonical collision capture completed on all 30 rendered maps.
  An independent exact diff against `5a13dadb0` found 160 removed / 163 added
  wreck-footprint records, paired identically for movement and shell collision.
  The other 158,668 packed records preserve exact content and order, including
  all 105,110 trees; all 119,105 concealers also remain unchanged. Placement
  counts changed by -1 on Badlands/Titan Gorge, +2 on Monsoon, and +1 on
  Caldera/Ruinspires/Blackglass. Exact fixed-census test receipts are updated;
  no tolerance or geometry acceptance limit was loosened.
- Eight legacy maps completed real renderer checks and sixteen close views
  with all authored wrecks present, no repeated donors, no browser errors and
  no context loss. All 37 changed/added footprints in those maps match the
  rendered position/height receipts. Close views retain existing destruction
  and terrain settling, not new pristine showroom models. These checks do
  not certify every possible seed or eliminate old scenery intersections.
- Final collision-index SHA256:
  `5107b4da30298e3196b2e099c2eb9ac966c5d70b991103c08b5b2d723b0f3f15`.
- Placement regression executes the real generator, covers rejected terrain,
  null bakes, cancellation and seeded fallback, and rejects an in-memory
  restoration of the old attempt-based advancement. It passed.
- Collision codec round trips, lazy loading/integrity, and dedicated-world
  fixed censuses passed on the final capture. Typecheck/core-unused passed
  after the selector correction; the production build passed for this wave.
- Scoped complexity/type metrics passed (four files, 75 functions, zero
  complexity violations or explicit `any`/`unknown`). The six-new-file
  React Doctor scan reported test-only diagnostics: serial awaited bakes
  deliberately bound peak memory, tiny bounded test-array searches, and a
  `new Function` fixture compiling only repository-owned source to compare
  the original paint pipeline. No network/user string is evaluated, no rule
  was suppressed, and no runtime-source diagnostic was reported. This scan
  exits nonzero and is not presented as an all-green full-suite run.

Local first-pass evidence is in
`/private/tmp/cot-wreck-variety-audit-20260908.96RZmg/` (30-map capture log,
eight map placement receipts and sixteen close views). Final selector evidence
is captured separately in
`/private/tmp/cot-wreck-variety-final-audit-20260908.Lne3DB/`.
No production deployment or broad multiplayer smoothness claim is made here.
