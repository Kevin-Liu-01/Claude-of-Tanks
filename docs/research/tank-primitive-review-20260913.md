# Tank primitive review (2026-09-13 night)

Owner: "a collapse of all of our tank primitive reviews, from watertightness
to track thickness to wheels, in one place that we bring together to improve
and correct for the benefit of all tanks but also especially X tanks", plus
five specific items: the Leopard 2A5 X / K2 Black Panther X fender-to-skirt
gap, Revolution turret symmetry, Challenger 1/2/3 wheels, a fleet wheel
review (nation styles, super-bright wheels, the M1 X / Leclerc X "hollow"
look as a primitive for the older Abrams) and the "weird thing" between the
M1 tracks (`gear_wheelBayVoidDress`).

## 1. Watertight, fleet-wide

`tools/tank-watertight-check.mjs --ids=<all 181>` (the owner's pour-water
test, `tank-watertight-20260913.md`) found **every tank leaking**: panther_g
9,648 L, type10 6,300 L, type74 5,000 L, leo1a5 3,900 L, t14 3,530 L, k2
3,180 L, challenger_3x 2,720 L … the legacy M1s 620–800 L, the M1 X family
~450 L (the grille recess), Leclerc S2 218 L. Hulls here are open U-wells
under decks; any inward seam floods the whole interior.

Fixing 180 builders by hand was not an option, so the fix is generated:

- `tools/tank-voxel-body.mjs` — the voxel body core shared by the check and
  the generator (conservative voxelisation, exterior flood, deep-interior
  test with the hull/turret column-span rule).
- `tools/gen-interior-fills.mjs --all --cell=2 --min-fine=12` — greedy-meshes
  the leaking deep-interior voxels into axis-aligned boxes per component:
  a 5 cm pass for the bulk, then a 2.5 cm pass for the layers along sloped
  plates (boxes under 12 voxels are dropped as slivers). Voxels whose column
  is closed above or below by a gun, gun mount or mantlet are skipped so
  nothing pokes out when the gun elevates. Output: base64 Uint16 span
  sextets per tank in `src/vehicles/interiorFillGroups/<fleet group>.generated.ts`
  and a loader map, lazily loaded like the combat-anatomy calibrations
  (`ensureInteriorFills` next to `ensureCombatAnatomyCalibration` in
  `fleetFactory.ts`, `ensureAllInteriorFills` for node tools).
- `src/vehicles/interiorFills.ts` — registry, decoder and `applyInteriorFills`,
  called by `tankFactoryCore` right before `normalizeTankAppearance`: one
  merged `hullInteriorFill` / `turretInteriorFill` mesh per component in the
  dark gunmetal material, no shadows, `userData.interiorFill` so
  `geometryFingerprint` (the original-model receipts) ignores them.

Fills sit strictly inside the body's own shells (the deep-interior test
guarantees shell in all six directions), so no silhouette moves; behind a
real gap they read as the dark interior wall the eye expects. The fleet run:
30,433 boxes, 365k triangles (≈2k per tank), 96.5 % of the leaked litres
closed. Measured on the shipped tanks (fills applied):

| tank | authored shells | with fills |
| --- | --- | --- |
| panther_g | 9,648 L | 1.6 L |
| challenger_3 | 2,435 L | 6.9 L |
| k2 | 3,182 L | 60 L |
| t80u | 1,840 L | 99 L |
| type10 | 6,274 L | 22 L |
| m1a2 | 620 L | 5.5 L |
| leclerc | 218 L | 21 L |

Residuals are thin layers along sloped plates and the volumes under moving
guns. One trap: rigs may carry a profile scale or pivot — the first cut
authored boxes in the tank frame and dropped them straight into `rig_hull`,
which put the Challenger 3 fills 10 % off (1,550 L still leaking); the fill
geometry is now taken through the inverse of each rig's world matrix.

## 2. Wheels

`tools/wheel-review.mjs [--all|--ids] [--gate] [--json]` builds every tank
and reports the spec's wheel pattern against the built one, the hollow
construction, road-wheel paint and tire lightness, and how far the widest
dressing layer stands outboard of the tire face. Flags: BRIGHT, BRIGHT-TIRE,
PROUD (> 4 cm), MISMATCH.

What it drove:

- **Legacy M1 Abrams** (m1a1, m1a1ha, m1a2, m1a2_tusk, m1a2_sepv2,
  m1a2_sepv3, ua_m1a1): the near-black inter-wheel blocks
  (`gear_wheelBayVoidDress`, `abrams.ts tejasSuspensionDress`) are gone — the
  torsion arms `buildRunningGear` emits are the real connectors — and the
  road wheels draw the hollow paired construction the M1 X family uses, now a
  fleet primitive: `src/vehicles/hollowRoadWheelStock.ts`
  (`buildHollowPairedRoadWheel`, SEP v2 stations scaled to the wheel radius)
  through `AbramsHullConfig.hollowRoadWheels` on `TEJAS_HULL`.
- **Challenger 1**: the fixed face/hub dressing floated 7–13 cm outboard of
  the tire (outsets 1.505/1.510 from a 1.378 tire face) — the face disc now
  sits in the tire plane (1.372) and only the hub protrudes (1.398).
- **Challenger 2 / 2E / UA**: twelve dressing layers authored as
  `absoluteX − 1.33` reached 1.506 against a 1.44 tire face; the set moves
  62 mm inboard (`− 1.392`). Rubber `#545a50` (bright grey) → `#33372f`.
- **Challenger 3 / 3X**: paint `#5c6156`, the brightest wheel literal in the
  fleet → `#3f4438`.
- **T-80U Kursk, T-80BV UA**: `wheelHex 0x4b503d` → `0x3b3f31`.
- Nation styles already exist (`wheelPatterns.ts` FAMILY_RULES and
  NATION_FALLBACKS). Fleet run (181 tanks): spec and built patterns agree
  except four deliberate per-tank overrides (fv4034 deep-dish-eight,
  strv122_x and challenger1_x pressed-six, t90a_burlak_x deep-dish-eight);
  hub caps 3–4 cm proud of the tire are normal and pass the 4 cm bar; the
  remaining PROUD reads are design questions, not offsets: ariete and amx40
  register their outer dish / rim-ring cadence 20–24 cm outboard on the
  skirt plane, kf51 hub caps and the t80u_x wheel shell sit 8 cm out. The
  Patton family's wheel paint is a camouflage-mapped material whose colour is
  a multiplier (>1), which the first read flagged as white.

## 3. Bodywork

- **Leopard 2A5 X**: the rear six skirt panels crowned at 1.308 while the
  sponson shelf undersides at 1.480 — a 17 cm slot showing the bare hull
  wall. A flush continuation of the skirt skin (hull wall 1.704 → skirt face
  1.737) rises to the shelf over z −3.49..1.50, and the 1.50..1.672 slot
  closes against the first hanger. `leopardA5XDetails` fingerprints repinned.
- **K2 Black Panther X**: the inner skirt skin crowned at 1.3404 for its whole
  run against a shelf underside of 1.5235 aft and 1.3975 through the centre
  (an 18 cm slot). Per-run lips rise to the shelf with conservative tops
  where it slopes, plus a wedge over the sloped stretch. `westXGeometry`
  skin pin 1.3404 → 1.380.
- **Leopard 2 Revolution**: face-on, the left cheek (−X, inner start 0.39)
  is the template; the right started at 0.94 because of a metre-deep EMES
  pocket. Both cheeks now start at 0.39 and the sight is a flush armoured
  window with a brow on the right cheek's leading face. Receipt rewritten to
  assert symmetry.

## 4. Also in this batch

- Pre-battle countdown: warm hold moved from "1" to "3", whole-second visible
  count ≥ 3 (`preBattleCountdown.ts`; probe: production opened on "2" and
  held "1" for 4.1 s; patched build 3 → 2 (1.02 s) → 1 (0.99 s) → ROLL OUT).
- Water pass 5: world-position value-noise sediment field varies body colour
  and reflection across every lake and bay (`shallowWater.ts`).

## Verification

Regen chain in the main worktree: presentation anchors for the 18 changed ids
(`--check` PASS, 208 tanks, max residual 0.00 px), fleet combat anatomy and
marking seats, icons for the 18 ids, `tank:anatomy:check` PASS (module-hit
0 FAIL, 181 tanks), sealed ledger for the 18 ids (challenger2's row was
already open before this batch — 97 px in 3 views, unchanged), watertight
sample with fills (table above). Release gate: `leo2a5_x` 92.4/92 and `k2_x`
93.4/92 PASS; `leo2_revolution` cannot be scored here ("registered exemplar
comparison oracle unavailable") and the legacy ids (M1s, Challengers) have no
registered oracle rows at all — an untouched control (`t72b3`) fails the same
way — so the receipts and the sealed ledger are the gate for those.

## Receipts: the fail-fast trap

`tools/run-selftests.mjs` stops a group soon after its first failure (gate 18
ran 60 of 315 pre receipts, gate 19 64, gate 20 133), so each gate exposed
only the next pinned digest this batch had moved (trackShoeDimensions,
roadWheelRestHeights, returnRollerOutset, mbt70UpperFenders, equipmentDamage,
tankFactoryStaging, villageWear, mangroveWaterPalette …). A no-fail-fast
sweep of all 976 pre + core receipts (scratch runner, six at a time, 20 min)
surfaced the remaining three at once: playableRelief and badlandsRelief (map
authoring receipts that now project the 2026-09-13 sky lines back to their
historical text, the way they already projected the restored Alpine horizon)
and wrecks (m1a1 / type10 bake fixtures: every tank now carries interior
fills, so the bakes gained triangles). garageArchitecture's 100 ms build
budget fails under that load and passes quiet. The MBT-70 and AbramsX
configs spread the Tejas hull config and briefly inherited the hollow wheel;
both now pin `hollowRoadWheels: false` and were regenerated.

## Deploy 13 (2026-09-14 00:46 PDT, 24418ce08)

Gate 21 on 24418ce08: pre 315/315, core 661/661, post 42/42, build green.
Pushed 6b2cd6c9f … 24418ce08 to origin/main (countdown, water pass 5, interior
fills, the wheel/bodywork review, the receipt repins). Manual Vercel deploy
from the gate checkout; bundle `main-CqOcRcpE.js` → `main-BRGBR8Ne.js`.
Production verification: render-truth cull parity 0, determinism 0 (shadow
pixels 54,854); garage renders of m1a2, challenger2, leo2a5_x, k2_x,
leo2_revolution and t80u load on production with their lazy interior-fill
chunks; the reservoir shows the pass-5 sediment field.
