# Type 90A — packet

First-party JGSDF Type 90 Kai mark (`type90a`). Spec row is a `variant()`
clone of `type90` in `src/vehicles/japan.ts`; visual build is
`profiles/japan.ts buildType90A` = the `buildType90` donor (profiles/misc.js)
plus `addType90APackage`. Donor history lives in
docs/references/tanks/type90.md — this file carries only the A-mark delta.

## Registration status — FALSE-0 class (documented)
type90a has NO registered oracle and NO geometry-gate row: there is no
`docs/references/vertex/type90a.json`, no `type90a` entry in
`tools/procedural-fidelity.html`'s `LOCAL_REFERENCE_OVERRIDES`, no
`MODEL_SOURCE.type90a.glb`, therefore no `type90a` in `window.__REFERENCE_IDS`
and no row in `docs/geometry-gate/ledger.json` (118 rows, verified after each
gate run this round). Per §E law a row cannot be written without a registered
reference — the absence is the correct state, not a defect. Evidence class is
procedural frames + probe numerics + the donor's gate row + freeze hashes.

## §5.364 GUN RE-PLANT — attachment / mantlet / arc (2026-08-17, recovery lane) — hash **61cd559a** (68 meshes / 86,975 verts)
Owner order verbatim: *"and fix the type 90s guns. they should properly be
attached to the tank and have a proper mantlet and arc up and down porperly"*
— "the type 90s" = both marks. The rig re-plant, wide mantlet plate, fixed
slot frame, seated recoil housing, tube re-station and pivot re-auth all
arrive through the donor; full derivation, before/after arc table and the
turret-preservation proof are in the type90.md §5.364 packet.

### A-mark delta re-seated in the donor's new trunnion frame
`buildType90` now pitches about world (0, 1.686, 1.30), so gunExtra world =
local + that. The old A-package stations (0.38 / 0.67), authored for the
retired scale-preserving seat, would have floated ~0.4 m ahead of the new
mantlet. The beefier A-mark mask read is re-authored as layered applique ON
the donor's wide plate:
- applique collar frame `box(0.92, 0.44, 0.06)` at local z 0.245 => z_w
  1.515..1.575, seated 5 mm into the donor face plate (1.49..1.52) — §B2 no
  air;
- strengthened sleeve root `cylZ(0.15, 0.34, 18, 0.12)` at local 0.60 => z_w
  1.73..2.07, overlapping the donor recoil housing (1.52..2.42);
- long coax sleeve wrapping the donor's face port at the same station;
- `'90-A'` decal re-expressed for the now-unscaled turret frame
  (0.2856 / −0.6396 = the old 0.42 / −0.78 through the 0.68/0.82 shell scale);
- `P.topY 1.46 -> 0.9928`, keeping rig_turretTop at world 2.3928.

### Arc proof (`tools/tmp-type90-arc.mjs`, spec arc −10 dep / +20 elev)
13 steps from −10 to +20: **|rendered − commanded| = 0.0000 deg at every
step**; muzzle radius about the trunnion **4.6594 m, spread 0.0001 m**; muzzle
world 5.9594 at rest; mantlet rear holds z_w 0.67..0.72 versus the 1.4236 face
plane throughout; tube cross-section round (±0.1725 x and y). Chin-vs-deck at
max depression **≤ 0.091 m contact** (HEAD 0.239 m — improved 15 cm), no
daylight at any pose. Frames: `shots/type90-guns/arc-recov/type90a_*` and
`shots/type90-guns/recov/type90a_*` (sidewide + quarter + front at −10/0/+20).

### Preservation + battery
- `turret` armor bucket vs HEAD: **96 triangles removed (the two dead
  gun-shield cheek cylinders), 0 added, all 3,442 survivors
  world-position-exact**; turret / turretDetail / turretEquipment / hull /
  running-gear world AABBs byte-identical.
- Sim frame: inherits the donor's re-authored `gunPivot [0, 0.2397, 1.0713]`
  and `gunBarrel.lengthM 4.66` verbatim through `variant()` (which clones
  armor without refitting pivots), composing with `turretPivot
  [0, 1.4462686567164178, 0.2287280701754386]` to the rendered trunnion
  (0, 1.6860, 1.3000). §5.361 rig-anchor law: authored data, never a remap.
- combat anatomy row = previous envelope × shell scale exactly
  (0.02->0.0136, 1.105->0.7514, ∓2.04/1.98->∓1.6728/1.6236); world hit
  envelope unchanged. `gen-combat-anatomy --check` PASS (116 rows) in a
  clean-room worktree carrying only this lane's four files.
- muzzle-bore probe **PASS** (inner 16.9 / surround 134.9 / contrast 118.0).
- `npm test` **exit 0**; hashgeo guard 34/36 byte-held (only this pair moved).
- KNOWN, PRE-EXISTING: `tank-assets-check --ids=type90a` fails stale
  geometry + metadata **at clean HEAD too** (a35ac3a7 landed proportions with
  no icon regen; §5.372's regen skipped this pair). Fix path: clean-worktree
  icon regen for `type90,type90a` per the §5.246 recipe.
- Retires the type10b packet's `type90a 71208238` guard hash.
- DELIVERED UNCOMMITTED-UNSTAGED.
