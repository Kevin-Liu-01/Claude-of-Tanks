# Environment richness and campaign flavour pass (2026-09-14)

Owner brief: "add back so much environmental details, they feel much barer now",
"AAA quality details from environment to map to settlements", campaign-mode flavour
(trenches, AA guns, explosions, planes, sounds, smoke), and "add back all the beautiful
shadows that make everything feel more textured instead of flat". The judge's third
review listed environment richness / settlement detail, campaign flavour beyond the
frontline layer, and shadow texture parity as the open items.

## Method

Identical spawn-pose captures against the 1049e4e reference checkout (dev server 5199)
and the current build (5197) with `.qa-dev/ref-ab-shot.mjs` (scene census by instance
class), `.qa-dev/band-stats.mjs` (per-band luminance contrast and gradient),
`.qa-dev/lum-hist.mjs` (percentiles), plus two new QA probes:

- `.qa-dev/shadow-census.mjs` — shadow-caster totals per class, cascade parameters,
  renderer shadow-map settings;
- `.qa-dev/material-census.mjs` — colour / roughness / env / AO / normal-map parameters of
  ground, grass and foliage materials.

## What the A/B showed before this pass

| map | metric | 1049e4e | current (deploy 15) |
| --- | --- | --- | --- |
| verdant | trees at the spawn pose (`treeFoliage`) | 899 | 812 |
| verdant | foliage cards | 82,734 | 77,445 |
| verdant | destructible props | 633 | 677 |
| urban | trees | 496 | 472 |
| alpine | trunk parts | 8,468 | 8,057 |
| verdant | ground band 400–600 px: luminance sd / mean gradient | 48.5 / 31.0 | 41.8 / 25.8 |
| urban | ground band 400–600 px: sd / gradient | 43.3 / 29.5 | 37.4 / 24.0 |

Shadow method and settings are identical (four PCF cascades 2048/2048/2048/1024, radius
1.25–1.4, shadow intensity 1, same biases; caster totals 3,845 reference vs 4,101 current
on verdant; material parameters identical on terrain, trunks and foliage). The ground
shadow coverage is at parity (dark-pixel fraction of the ground band: verdant 13.1 % vs
13.9 %, urban 11.8 % vs 14.3 %, desert 5.6 % vs 5.5 %). What differs is content:

1. **Trees**: the road, structure and spawn clearances added since 1049e4e trim 3–10 % of
   the trees, and the vertex shade of foliage cards was compressed in the restoration
   draft (broadleaf core/skirt `0.58+0.42 / 0.80+0.34 / 0.92+0.16` → `0.61+0.33 / 0.82+0.24
   / 0.90+0.14`; conifer tiers `0.48+0.40t+0.26` → `0.60+0.28t+0.18`). Flatter crowns.
2. **Grass**: 1049e4e painted blades 3–7 px wide on the 128 px card; the 2026-09-12 ground
   cover pass narrowed them to 2.1–4.9 px. Finer, lower-contrast sward at distance. The
   tuft normals are now a shallow fan (1049e4e: straight up), so blade lighting varies more,
   not less. Not changed here.
3. **Settlements and roadside**: destructible counts were already above the reference, but
   the parked-vehicle families were renamed (jeep/truck → sedan, wagon, pickup, van,
   box/flatbed trucks) so a raw kind diff misreads them as missing. Totals: verdant 7 → 9,
   alpine 10 → 14, urban 5 → 7, desert 7 → 9 vehicles.

## Changes

All multipliers are read at build time through `getDeviceTier()` (the tier resolves after
module evaluation, so nothing is computed at module scope) and stay at 1 on the mobile
tier. Authored per-map counts are untouched.

- `src/world/props.ts` — `environmentRichness()` (desktop 1.35) and `richCount(n, fallback)`
  applied at every settlement / roadside count read: stalls, benches, core clutter, bales,
  stooks, sleds, drums, pots, heavy and light road traffic, drum clusters, loose clutter,
  camps. Campaign flavour on the same lever: shell craters and burn scars, tread-torn
  approaches, sandbag nests (authored cap 9 → 12) and anti-tank hedgehogs.
  `richCount` is a function declaration because `roadStations.selftest.mjs` extracts and
  executes the production placement functions from this source.
- `src/world/vegetation.ts` — `treeRichness()` (desktop 1.1) on cluster and lone-tree
  targets with wider attempt caps (2200 → 2600, 700 → 800); bush richness 1.3 on field
  bushes (470 → 611), concealment clumps (58 → 75) and cluster fringe scrub; foliage vertex
  shade back to the 1049e4e ranges (both sites).
- `src/world/groundLitter.ts` — `candidatesPerCell` 210 with `mobileCandidatesPerCell` 150;
  the pool is sized for the desktop count, the tier is read per cell build.
- `src/world/frontlineAtmosphere.ts` — `FRONTLINE_LIMITS`: columns [6,10] → [8,14], sprite
  cap 32 → 48, aircraft 2 → 3, artillery interval [5,18] → [4,14] s, flak [12,40] → [9,30] s,
  flyovers [60,120] → [40,90] s, AA guns [2,3] → [3,4], tracer pool 48 → 64.
- `src/main.ts` — frontline scale 1.15 in every battle (was 1), Frontline Assault
  1.25 + 0.35·sector (was 0.8 + 0.35·sector).
- `src/world/authoredTreePlacement.ts` — authored stations (orchard rows, headlands, mangrove
  banks) now displace a procedural squatter of another species: the nearest eligible donor takes
  the station and the squatter moves onto the donor's old ground, only when that ground clears the
  same structure / wall / root-support rules a station must (`displaceSquatter`, receipt field
  `displaced`). With 10 % more procedural trees the mangrove banks had dropped to 54/64 stations
  (84 %, under the receipt's 85 % floor); with displacement they place 61/64.
- Receipts: `mapIntegration.selftest.mjs` (loose-clutter source pin), `roadStations.selftest.mjs`
  and `loggingYard.selftest.mjs` (extract or port `richCount` at the authored counts),
  `propsScheduling.selftest.mjs` (ground-scars body hash, `richCount` port),
  `autumnHeadlands.selftest.mjs` (frozen predecessor twin follows the count reads),
  `treePoolCapacity.selftest.mjs` and `authoredTreePlacement.selftest.mjs` (supply `treeRichness`,
  count displaced squatters), `tidalMangrove.selftest.mjs` (admission 4792 → 5092 trees, 4520 → 4734
  obstacles, donor-identity hash). `inhabit.modernClutter` stays authored: it is a number or a
  per-kind record, not a plain count.

## After (same poses)

| map | metric | 1049e4e | before | after |
| --- | --- | --- | --- | --- |
| verdant | trunk parts | 6,174 | 6,060 | 6,286 |
| verdant | destructibles | 633 | 677 | 676 |
| verdant | ground litter pieces | 0 | 1,799 | 1,800 |
| verdant | frontline smoke columns / AA tracers | 0 / 0 | 11 / 64 | 11 / 64 |
| alpine | trees (`treeFoliage`) | 1,500 | 1,544 | 1,689 |
| alpine | props (`props/v101`, `props/v183`) | 460 / 235 | 577 / 288 | 577 / 288 |
| urban | destructibles | 643 | 691 | 688 |
| desert | trunk parts | 1,811 | 1,853 | 2,039 |
| desert | destructibles | 371 | 401 | 401 |
| verdant | tree band 300–400 px gradient | 18.7 | 16.5 | 17.1 |

The spawn-pose census cannot see the whole map (partition and LOD), so the tree numbers
are lower bounds; the desktop target is +10 % clusters and lone trees, admission permitting.
Instanced totals move by well under 1 % per map; triangle counts by 0.5 %.

Ground-band fine gradient stays 15–18 % under the reference (blade width, see above);
the earlier sharpness pass (RCAS floor, TAA off) recovered the rest and is documented in
`lighting-sharpness-20260913.md`.

## Campaign flavour evidence

Frontline Assault on verdant from the spawn pose (`.qa-dev/ref-ab-shot.mjs --mode=frontline_assault`):
11 smoke columns on the horizon, 3 AA gun bases with heads, 48 artillery flashes and 48 flak
bursts pooled, 64 tracers pooled, 14 sandbag nests in view of the census, a baked wreck beside the
approach road, tread-torn approaches and crater decals along the AI corridors. Standard battles
carry the same front at 1.15 (verdant 11 columns, urban 13, alpine 10, desert 11 at the spawn
pose). The 1049e4e reference has no frontline layer at all (0 columns / 0 tracers in every census).

## Fleet-wide world-build smoke (gate 24)

`tools/map-environment-audit.mjs --shots --establishing-only --tier=desktop` built all 30 maps
(exit 0, no entry failures; medians 12–22 ms on the shared Mac, which is pacing noise, not a
signal). Against the 2026-09-12 audit report (`010faabc`, the pre-restoration build):

| total over 30 maps | 2026-09-12 | gate 24 |
| --- | --- | --- |
| scene instances | 1,376,364 | 1,455,921 (+5.8 %) |
| destructible props | 18,918 | 20,310 (+7.4 %) |
| concealers (bushes + canopies) | 116,402 | 135,460 (+16.4 %) |

Per map the destructible count rises 5–12 % (verdant 629 → 676, urban 649 → 688, foundry
940 → 1,024, caldera 677 → 756) and concealers 8–80 % (desert 1,822 → 3,291, saltwind
2,649 → 4,075, coastal 2,612 → 4,274). Reservoir's instance total falls (79,422 → 74,089) for
reasons outside this pass: the 2026-09-12 baseline predates two days of map work, so the table
is a fleet-wide richness indicator, not an isolated measurement of these edits (the isolated
before/after is the spawn-pose census above).

## Gate 24 and deploy 16

Commit `fe9d98125` (gate checkout at the same head). Gate 24: all-map world-build smoke exit 0
(30 maps, no entry failures), pre 315/315, post 42/42, private build green. The fail-fast core
group stopped at 95/661 on `garageArchitecture.selftest.mjs` (the 100 ms headless geometry budget,
124 ms under the six-way receipt load; it passes quiet) and was rerun as a whole: 661/661. The
no-fail-fast sweep before the commit ran 976 pre + core receipts with the same single timing
flake. Pushed fast-forward to origin main, then deployed manually from the gate checkout
(`vercel pull` → `vercel build --prod` → `vercel deploy --prebuilt --prod`, scope kl01s-projects).

Production (`https://cot.kevinliu.studio`, bundle `main-B7lqtmGI.js`, identical to the gate
build): `.qa-dev/prod-map-smoke.mjs` enters battle on verdant, urban and mangrove with zero page
errors (6.6–9.1 s to battle); the production spawn-pose census on verdant equals the local
"after" census exactly (6,286 trunk parts, 809 canopy proxies, 1,800 litter pieces, 11 smoke
columns, 3 AA bases, 64 tracers, 676 destructibles).
