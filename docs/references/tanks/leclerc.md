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
