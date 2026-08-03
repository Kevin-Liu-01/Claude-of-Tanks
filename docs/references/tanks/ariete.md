# C1 Ariete (`ariete`)

**Exact variant modeled:** C1 Ariete series production (Esercito Italiano,
1995–2002 fit) — 120 mm OTO Breda L/44, GALIX launchers, TURMS fire control,
no PSO/AMV appliqué package.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 7.59 m | weaponsystems.net/system/837-Ariete; army-technology.com/projects/ariete |
| Overall length (w/ gun forward) | 9.52 m | en.wikipedia.org/wiki/Ariete; weaponsystems.net |
| Width (hull / over skirts) | 3.42 m hull / 3.61 m over skirts | weaponsystems.net (3.42 hull); Wikipedia infobox 3.61 |
| Height (turret roof / over sights) | 2.45 m roof; ~2.7 over commander pano | Wikipedia; army-technology.com |
| Gun (model, caliber, tube length) | OTO Breda 120 mm smoothbore L/44 (~5.28 m tube), thermal sleeve + fume extractor + MRS | Wikipedia; army-technology.com |
| Road wheels / rollers / sprocket | 7 dual road wheels/side (shock absorbers on 1,2,3,6,7), return rollers behind skirts, rear drive sprocket, front idler | Wikipedia (damper stations imply 7); tanknutdave.com |

## Identity cues (what makes this vehicle unmistakable)

- Turret plan-form and roof layout: long low WELDED turret, slab side walls
  with a slight inward cant, cheek plates converging on a narrow flat front;
  gunner's TURMS primary sight in an armored split-door box on the RIGHT
  front roof; commander's SP-T-694 panoramic on a pedestal aft of it;
  loader hatch left; flat roof; stowage baskets/rails wrap the bustle rear.
- Mantlet/gun mount: distinctive ANGULAR MANTLET CHEEKS — a protruding
  central mantlet block flanked by two backward-raked wedge plates; coax port
  right of gun.
- Hull front: very long shallow one-piece glacis running almost to mid-hull,
  flush driver hatch right with 3 episcopes, V splash rail.
- Running gear + skirts: 7 rubber-tired wheels, rear sprocket; full-length
  side skirts, front two panels heavier armor with a slanted leading cut.
- Signature equipment: GALIX 80 mm launchers (4-tube bank each turret side),
  left-hull rear exhaust outlet, rear turret basket, two whip antennas.

## Reference links (links only — no downloaded images committed)

1. https://weaponsystems.net/system/837-Ariete — spec table (7.59 hull, 3.42 w)
2. https://en.wikipedia.org/wiki/Ariete — infobox 9.52/3.61/2.45, L/44, GALIX
3. https://www.army-technology.com/projects/ariete/ — TURMS, layout notes
4. https://tanknutdave.com/the-italian-c1-ariete-main-battle-tank/ — walkaround-style detail notes

## Local GLB oracle notes

Path: `public/models/tanks/community/ariete-dustymojito.glb` (LOCAL-ONLY
quarantine; registered for the lab through LOCAL_REFERENCE_OVERRIDES).
Width-normalized to 3.60: overall length reads 9.07, hull ≈ 7.0, height 2.79
(over pano/antennas). The asset is proportionally STUBBIER than the published
hull (7.0 vs 7.59 at the same width, ~8%) and its fused gun carries a slight
droop; the procedural keeps the published 7.59 hull and a level tube, so a
few silhouette points are structurally capped (documented, not gamed).
Shape truths taken from the oracle: turret roof ≈ 2.40 m with stepped
shoulder masses, sight cluster forward-right to ~2.7 m, bustle + basket
running well aft over the engine deck, gun axis ≈ 1.84 m, gun overhang past
the bow ≈ 1.7–1.9 m, wheels visible below the skirt line.

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 77.3 | 80.0 | 89.8 | 68.7 | 40.2 | 78.3 | baseline (modern3 canonical builder) |
| 2026-07-30 | 79.0 | — | 89 | 76 | 46 | 76 | bespoke misc.js build: taller welded turret (roof 2.38) + angular mantlet cheek wedges, sealed trunnion roll, TURMS box + pano, bustle + basket, GALIX, 7-wheel gear w/ dark recesses, L/44 re-seated |
| 2026-07-30 | 80.0 | — | 89 | 76 | 50 | 77 | r2: gun len to the oracle overhang (4.90) + fatter sleeve, skirt bottom raised (wheels exposed), side shelves + GALIX outboard, sight cluster forward, whips raked aft |
| 2026-07-30 | 79.8 | 82.1 | 88.9 | 75.8 | 50.2 | 76.9 | r3 final: glacis headlight pods + fender rib, evac at 0.44. CAPS: the oracle tube DROOPS (fused ~1.5° decl.) — a level tube tops out near G≈50; oracle hull is ~8% stubbier than the published 7.59 m (kept real), costing edge overlap in side views |

## GATE-V9 CERTIFIED ORACLE-DEFECT CAP — hull/whole coverage + stations (2026-07-31)

Measured from docs/references/profiles/ariete.json: the dustymojito print's
hull body spans **7.03 m vs the published 7.59 m (−7.4 %)** (hull-mask span
7.26), its gun tube ends 0.63 m short of the published overall (9.04 vs
9.67), and the print sits ~1.2 m off-centre in its normalized frame (hull
z −4.97..+2.29 in the trace frame) with a band-thin fender tail that drops
out of the 12 % body rule — shifting the hull-anchored registration
midpoint (measured dAlong ≈ 0.75). The dims-sovereign build carries the
published envelope: after mid-alignment its body overhangs the oracle's by
≈ 0.28 m per end (cover + tail/nose band error → **side/plan hullCurves
ceiling ≈ 85-90**), the published-length gun reads as build-only columns in
the whole rows (**wholeCurves ceiling ≈ 80-85**), and the ref station
z-range (7.26 m) vs the published-length build (7.59 m) drifts slice
features ≈ 4.5 % (**stations ceiling ≈ 70-85**). dims + floaters sovereign.

### V10 re-verification (2026-07-31, round 2)

Fresh extraction confirms the certified short print: ref box z ±4.54
(9.07 m overall vs published 9.52), the −7.4 % hull span and off-centre
frame unchanged. Cap STANDS at the measured v10 residuals (hull 30.1 /
whole 0 / turret 0 / stations 26.4); dims + floaters pass (100/100).

## Round-3 cap re-verification (2026-07-31, post kit track fix 146d25c)
Re-measured on gate v10 after the kit contact-span/ground-clamp fix and
the family-wide raisedEnds-workaround removal: the certified oracle/print
defect cap STANDS (curve/station rows unchanged at their capped levels)
and dims HOLDS >= 90. No compensation was re-introduced; end wheels are
plain kit-native fits.

## Zero-row triage + normalize plan (2026-08-03, misc agent)

Ledger 0 (wholeCurves/turretCurves) is HONEST — the quarantine reference
renders (gate rows carry real ref values); the zeros are big residuals vs
a SHORT print, not registration failure. Extract REG appended (quarantine
oracle path, ^Turret$ autoPivot). Stylization: hullMask -4.0% (7.29 vs
7.59), overall -6.3% (9.059 vs 9.67), bodyH +5.3% (a 12-col pano/sight
furniture band 2.55-2.78; roof plateau 2.25-2.35 is honest under the
published 2.50), width -0.7%. **Normalize plan authored**
(tools/vertex-normalize.mjs `ariete`): y identity to 2.40 then band ->
2.50/2.52 (sim p95 2.500, h -0.1%); z body x1.0412 about -0.884 + muzzle
-> rear'+9.67. DO NOT BUILD pre-warp (>2% law).

## VERTEX ROUND r2 note (2026-08-03, misc agent) — post-warp standing, NOT rebuilt

Post-warp gate rows (v11): hull 29.6 / whole 0 / turret 0 / stations
26.2 / dims 100. Zeros are honest big residuals (no orientationFlip;
reg side dAlong 0.759 dy 0.101 / plan dy 0.788). The stretched print
(z body x1.0412 about -0.884, muzzle -> rear'+9.67) now measures the
published envelope, so the old short-print caps (hull 30.1 / whole 0 /
turret 0 / stations 26.4) DISSOLVED into live work orders of nearly
identical magnitude — i.e. the build must now actually match the
stretched geometry it was never tuned to. Same structural class as
type90: the print sits ~0.8-0.9 aft of our frame (registration handles
the translation; the internal hull-to-turret offsets and the hull end
profiles must be re-derived from a fresh vertex-workorder dump). dims
already 100 — dims-sovereign scaffolding is in place; the next round is
a leclerc-style worst-first hull+turret re-lay against fresh dumps.
