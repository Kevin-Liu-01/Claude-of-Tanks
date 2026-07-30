# M1A2 Abrams (Tejas) — reference packet

Variant: baseline M1A2 Abrams (CROWS-fitted M1A2-style roof on the Tejas asset).
No SEP CROWS-II mast farm, no TUSK ARAT, no AbramsX cues.

## Real-vehicle dimensions (corroborated)
- Hull length ~7.93 m, overall w/gun forward 9.77 m, width 3.66 m, height 2.44 m
  (turret roof), M256 120 mm L/44 tube ~5.28 m (44 × 120 mm).
  Sources: GlobalSecurity M1 specifications
  (https://www.globalsecurity.org/military/systems/ground/m1-specs.htm),
  GDLS M1A2 datasheet (https://international.gdls.com/english/products/ABRAMS/M1A2.pdf),
  Wikipedia M1 Abrams (https://en.wikipedia.org/wiki/M1_Abrams).
- 7 road wheels per side, rear drive sprocket, front idler; 3 heavy front skirt
  panels; long full-width turret bustle with slatted stowage rack; low wide
  flat-faceted turret; gunner's primary sight doghouse right-forward of the
  ring; CITV left-forward (M1A2); loader's M240 left, commander's weapon right.
  Prime Portal walkaround index: https://www.primeportal.net/tanks/ (M1 Abrams).

## Local GLB oracle (what the lab actually scores against)
`/models/tanks/m1a2_tejas.glb` (Tejas V., CC BY-NC-ND, local-only quarantine).
modelLoader height-clamps this asset (tall whip antennas), the fidelity page
then re-normalizes both silhouettes to width 3.66. Measured in the scoring
frame (meters, ground = 0, +z = bow):
- hull: x ±1.83, deck 1.40 (bow tip, z 3.95) → 1.57 (midship) → 1.81–1.84
  (raised engine deck, z −2.2…−3.4), tail 1.76; z −3.95…3.95.
- nose: bottom rake from (z 3.8, y 0.86) to (z 2.7, y 0.02); tail rake
  (−2.8, 0.07) → (−4.0, 0.97). Belly ~0.34. Track band x 1.07…1.73,
  ground contact z −2.6…2.7, track top ~1.29. Skirt bottom edge y ≈ 0.50.
- turret (yaws correctly): shell z −3.17…+2.35 world (ring at y 1.57,
  z 0.35), cheek-front roof ~2.19 rising to ~2.42 at the bustle, shell
  bottom ~1.39; width 3.53 (sponson boxes). Bustle rack to z −3.17.
- CROWS left-front x −1.16…−0.31, y 2.24…3.29, z −0.03…1.61; loader M240 +
  shield right x 0.44…1.34, y 2.31…2.93. GPS doghouse right, top ≈ 2.95.
- gun: tube y 1.78…2.08 (axis ≈ 1.90), trunnion ≈ (0, 2.0, 1.9),
  muzzle z ≈ 5.70; overhang past bow 3.95 → 1.75 m of clear tube.
- two whip antennas to y ≈ 4.1 near the bustle.

## Notes
- The oracle is smaller than real-world scale before the width
  re-normalization; all targets above are already in the scoring frame.
- Same GLB serves m1a1, m1a1ha and (with the runtime ARAT kit) m1a2_tusk.

## Outcome (final lab state)
Baseline 75.4 (H79 T43 G83 R87) -> 87.1 (H92 T78 G87 R88), min view ~84.
Key: bespoke hull with measured deck stations + raised engine deck, long
2.0 m cheek reach, CROWS/M240/doghouse massing at measured stations, gun
axis 1.88 / muzzle 5.70.

## Shared-machinery findings (not fixable in abrams.js)
- The fidelity page's setPart visibility split is defeated by THREE.LOD for
  all *Detail/*Dark/*Cloth/*Glass buckets (LOD.update re-asserts child
  visibility during render): turret-parented detail leaks into the hull mask
  and is subtracted out of the turret mask. The rebuilt profiles route all
  turret-frame geometry through the LOD0 'turret' bucket as a workaround; a
  tool-side fix would be to disable LOD autoUpdate (or force level selection)
  before mask renders, after which turret detail buckets become usable again.
- The right/left proof cameras carry a 0.05 lateral tilt: full-width flat
  decks read ~+0.09 at the silhouette edge. Deck stations here are authored
  to match the resulting silhouette line, not the physical plate height.
