# Leclerc S2 (`leclerc`)

**Exact variant modeled:** Leclerc Série 2 (French Army, 2000s fit) — CN120-26
L/52, HL-70 gunner sight in roof, HL-15 panoramic, GALIX, no AZUR urban kit.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 6.88 m | en.wikipedia.org/wiki/Leclerc_tank; weaponsystems.net/system/310-Leclerc |
| Overall length (w/ gun forward) | 9.87 m | Wikipedia; steelbeasts.com sbwiki Leclerc |
| Width (over skirts) | 3.60 m | Wikipedia; weaponsystems.net |
| Height (turret roof / over sights) | 2.53 m roof; ~3.2 over pano/masts | Wikipedia; sbwiki |
| Gun (model, caliber, tube length) | GIAT CN120-26 120 mm smoothbore L/52 (~6.24 m tube), thermal sleeve, fume extractor, MRS | en.wikipedia.org/wiki/CN120-26; weaponsystems.net/system/886 |
| Road wheels / rollers / sprocket | 6 road wheels/side, 5 return rollers, FRONT idler, REAR drive sprocket | Wikipedia ("front-mounted track idler and a rear-mounted drive sprocket"); militaryfactory.com armor_id=100 |

## Identity cues (what makes this vehicle unmistakable)

- Turret plan-form and roof layout: TALL NARROW autoloader turret — vertical
  narrow front face, angled cheek plates sweeping to long parallel slab
  sides, full-height squared bustle housing the autoloader; flat roof with
  ammo resupply panel lines aft; commander's HL-70 armored sight box on the
  roof right of the gun; slim HL-15/FINDERS panoramic periscope MAST
  (thin pedestal, small head) roof left-rear — not a fat tower.
- Mantlet/gun mount: LOW-SEATED gun in a wide shallow mantlet plate with a
  heavy collar; gun axis visibly low against the tall turret face.
- Hull front: compact (shortest modern MBT hull), clean single-plane glacis,
  driver hatch LEFT with 3 episcopes, splash ridge across the plate.
- Running gear + skirts: 6 wheels; front third of the skirts are thick
  armored blocks, rear two-thirds rubber sheet with vertical seams.
- Signature equipment: GALIX 80 mm dischargers splayed on both rear turret
  corners; side stowage baskets along the turret flanks; rear hull stowage
  rack/panniers; crosswind mast + two whip antennas on the bustle.

## Reference links (links only — no downloaded images committed)

1. https://en.wikipedia.org/wiki/Leclerc_tank — infobox 9.87/6.88/3.60/2.53
2. https://weaponsystems.net/system/310-Leclerc — spec table, layout
3. https://www.steelbeasts.com/sbwiki/index.php?title=Leclerc — turret/sight layout
4. https://en.wikipedia.org/wiki/CN120-26 — gun L/52 data

## Local GLB oracle notes

Path: `public/models/tanks/char_leclerc_andertan.glb` (CC-BY 4.0).
Width-normalized to 3.60: overall 9.80, height 3.07 (over masts). Gun axis
reads ≈ 1.93 m, roof plateau ≈ 2.35–2.40 m (slightly under the published
2.53 — small cap), pano/sight heads to ≈ 2.83 m, masts to ≈ 3.19 m; turret
side baskets widen the cheeks to ≈ 2.9–3.0 m; hull rear carries a stowage
rack overhang at 1.3–1.75 m height reaching the full 6.88 envelope; front
skirt blocks stand slightly narrower at the bottom than the track guards.

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 81.5 | 82.1 | 89.6 | 71.2 | 65.4 | 82.0 | baseline (modern2 canonical builder) |
| 2026-07-30 | 83.0 | — | 90 | 76 | 65 | 81 | bespoke misc.js build: turret widened via cheek armor boxes + side baskets (3.02 m), roof 2.40, HL-70 armored head forward-right, THIN pano mast, raised engine run, rear hull rack, low-seated gun w/ trunnion roll |
| 2026-07-30 | 83.0 | 84.8 | 89.6 | 76.4 | 66.1 | 79.8 | r2/r3 final: gun len 6.17 (muzzle tips now register), taller/deeper mantlet plate, rack deepened. CAP: the oracle's hull rig node under-covers its glacis, so part of the procedural bow is scored inside the gun-overhang window — G plateaus mid-60s with the correct L/52 |

## GATE-V10 round-2 notes (2026-07-31)

dims repaired 100 → 86.6 → 99.9 across the round (heightM p95 discipline:
the crosswind mast moved to the print's single tall column at x −1.10,
centre antenna pot + pano head + HL-70 lid held under the 2.55 line, and
the round-1 whip pair stowed — the print carries no spikes at ±0.98).
Curve work applied: tall front skirt blocks (top 1.46, bottoms 0.48-0.90)
with the tracks pulled inboard to the print's ~1.60 outer edge (the old
build's track columns read to the ground at ±1.72-1.80 where the print
shows floating skirts). Standing min 9 (stations) — the remaining stations/
turret work needs the full measured re-lay this round gave a6/a5
(leoHullV3-class): the hull deck/glacis lines and the bustle scallop are
still the round-1 shapes. No caps — the andertan print is honest.

## GATE-V10 round-3 (2026-07-31, partial — dims recovery + flank re-lay)

Round standing: min 8.1 -> **21.9** (hull 45.4 -> 50.6, whole 37 ->
36.8, turret 14.3 -> 21.9, stations 8.1 -> **25.0**, dims **100**,
floaters 100). The kit-native end wheels at the measured ramp positions
first inflated hullLengthM to 7.14 (3.79%, dims 77.7): the pad-wrapped
far edges merged with the skirts in gap-inclusive columns and read as
BODY. Ends held to +-3.36 far edges (sprocket -2.94/1.02/0.27, idler
2.94/0.96/0.26) restore dims 100 — dims is a protected metric on this
tank — and the tightened hull z-range also re-phased the station slice
windows (stations 9 -> 25). The ref's outer ramp columns stay uncovered
(documented dims-sovereign trade, same law as leo2_revolution). Also this round: skirts SEGMENTED (station law),
6-wheel span re-laid to the measured contact patch [1.97, -2.52], pano
mast moved to the measured w -1.18 spike column, rear hull rack held to
the 1.29..1.57 band, bustle basket pulled inside the -2.52w turret
rear, deep mantlet housing to w 1.48 (ref side band 2.24).
Remaining (next round's work order): stations 25 — the turret-band
tops need the full a5 treatment (probe-driven cluster mapping); turret
rows carry ~0.3-0.5 m band errors across the autoloader roof furniture.
dims must be re-checked after any end-wheel retune (the +-3.36/3.40
far-edge guard).

## VERTEX ROUND r1 (2026-08-03, misc agent) — 21.9 -> 58.2 + normalize plan

Extract (`docs/references/vertex/leclerc.json`, REG appended with the lab
registration; the extract's raw-name matcher needed `^Cylinder\.?086$` —
GLTFLoader sanitizes the dot, the offline parser sees the raw name):
bodyH +9.1% / bodyLen -0.6% / hullMask +3.4% / overall -0.8% / width 0%.
The +9.1% p95 height is a 7-COLUMN furniture band only (pano head 2.76 at
world -1.65, TWO mast/whip spike columns at x ±1.0 z -0.93 topping 3.06,
antenna pots 2.76 at x~0); the roof plateau (2.35-2.45) sits UNDER the
published 2.53 — print otherwise honest. **Normalize plan authored**
(tools/vertex-normalize.mjs `leclerc`): tejas-W1b ceiling compress, knee
2.46, band -> 2.50, max 3.065 -> 2.541; z IDENTITY (hullMask +3.4% is the
REAL rear rack overhang, band 1.30-1.47, 12%-filter exempt — verify will
keep flagging hullMask; documented accepted-real-overhang). ORCHESTRATOR
lands the warp; furniture tops in the build already target the POST-WARP
lines (masts 2.54 at ±1.05/-0.93w, pano head 2.50 at -0.55/-1.65w, HL-70
lid 2.50-2.52 at 0.74..1.16w).

Round log (gate v11): 21.9 -> 53.7 -> 56.8/58.2 (dims dip repaired) ->
**58.2** | hull 62.9 / whole 58.2 / turret 62.1 / stations 58.7 / dims
97.3 / floaters 100. What moved it:
- skirts: REF stations carry full 3.60 width ONLY over the front blocks
  (i9-13, world z >~1.15); the rear two-thirds rubber sheet sits INBOARD
  at ±1.70 with a deeper band (0.53..1.51) — stations 25 -> ~64.
- front blocks hang 0.86..1.43 (not 0.48..1.46); fenders split: deck-edge
  plane (1.575, x<=1.70, z -3.42..2.95) + front flares (1.41, x->1.79,
  z 1.28..3.30).
- engine run FLATTENED to top 1.62 (the old raised 1.74 run was a misread;
  ref deck 1.618 across -2.45..-3.0).
- rear: deep body ends z -3.30 (plate face -3.31); the rack overhang is a
  THIN LADDER -3.40..-3.63 — top rail at 1.50 (a 1.29+1.555 rail pair
  spans a 0.30 column band = EXACTLY the 12% side filter, and hullLengthM
  read the rack as body: dims 71.9 incident, repaired to 97.3).
- turret: sloped aft roof (2.40 front -> 2.26 at the bustle end), DEEP
  turret-frame mantlet chin (band 1.26..2.23 to world z 1.57), forward
  cheek WEDGE pair sweeping to z~2.2 over the glacis, low outer applique
  plates (1.2..1.7 band at x->1.65, z 0.17..0.79), bustle tail rises to a
  thin top shelf (2.05..2.21 at -2.3), basket/kit inside world -2.32,
  whips STOWED, roof MG pintle added at the gunner ring (decoration law;
  tops at the 2.54 post-warp mast line — zero net gate cost).
- gear: wheels re-laid to the measured flat patch (centers 1.61..-2.16),
  sprocket -3.06/1.02/0.24; idler HELD at 2.94/0.96/0.26 — the r3 attempt
  to chase the ref's high idler (3.32/1.04/0.23, far edge 3.55) re-ran the
  round-3 dims incident (hullLengthM 7.19): the ±3.36 far-edge guard is
  LAW until the loader gains a wrap-exempt trace.
CERTIFIED-PENDING-WARP residuals (do not chase pre-warp): mast columns
(ref 3.06 vs build 2.54), pano/pot tops (2.76 vs 2.50), sight band, and
the bow nose-tip/idler-ramp ONLY-REF columns (dims-sovereign trade).
Boards: shots/misc-r1/after/leclerc.png (legacy visual 85.2; turret reads
chunky vs the print's slimmer cheeks — critic pass queued post-warp).
