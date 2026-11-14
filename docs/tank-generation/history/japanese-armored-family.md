# Japanese armored-family oracle record

The three owner-supplied GLBs were used only as local visual and metric
oracles. Runtime tanks are original first-party procedural constructions; no
source vertices, indices, textures, materials, animations, or topology are
copied into the repository or production bundle.

| Playable | External oracle | SHA-256 | License | Source |
| --- | --- | --- | --- | --- |
| Type 10B | `type-10_main_battle_tank.glb` | `2cc5748e4357722fc1c21bf7759ec21c29f84b2cfaf1203b5bee995f4cfeca67` | CC BY 4.0 | [Sketchfab](https://sketchfab.com/3d-models/type-10-main-battle-tank-7d14267918e7441b92ccc9f77869cb37) |
| STB-1 | `stb_1.glb` | `81ab9724a572410cb0eebeda0d716c65bf9c7ad2bddb1ef77a9f715d2184b7a6` | CC BY-NC 4.0 | [Sketchfab](https://sketchfab.com/3d-models/stb-1-b0f59399010542ae90a2aa9bd5b21e53) |
| Type 90A | `type_90_kyu-maru_japan.glb` | `d47c9446d82e511922c92244c375afca7701b9202ff11d601197e3a898adeaac` | CC BY-NC 4.0 | [Sketchfab](https://sketchfab.com/3d-models/type-90-kyu-maru-japan-0b0e862581234f05a5d0ac2883577e33) |

The STB-1 and Type 90 files are noncommercial and therefore strictly
quarantined outside the project. The Type 10 file is also kept external so
the entire family follows the same first-party-only authorship rule.

## Source-semantic identity retained

- **STB-1:** low rounded prototype casting, five large road-wheel stations,
  exposed single-course suspension, pronounced multi-pane searchlight,
  asymmetric cupolas/rangefinders, flank ventilation and an open rear basket.
- **Type 90A:** broad low welded turret, six-wheel hull, boxy autoloader
  bustle, JGSDF optics/smoke cadence and modular NERA cheek package.
- **Type 10B:** compact five-wheel hull, shallow faceted welded turret,
  stepped modular skirts, dense asymmetric EO suite and loaded bustle rack.

All additions are parented to the correct hull/turret rig, are visibly seated
on armor or a broad foundation, and retain each donor's single suspension-
driven smart track course.

## First-party geometry receipts

STB-1 is now a standalone procedural build rather than a Type 74 donor
decoration pass. Its owner-source packet contains 15 source/authored pairs,
15 authored yaw-0 frames, and 15 authored yaw-90 frames. The corrected track
corridor records zero front, rear, sweep, or individual-shoe intersections;
the duplicate-course and muzzle-bore probes also pass. `type90a 15b33ac0`
(67 / 80,045) and `type10b 567f2a28` (76 / 74,830) retain their previously
recorded receipts. Type 10B retains the donor Type 10's hull-owned cloth and
tow cable; the yaw audit reports that same fixed-hull candidate on both the
donor and derivative, while the final turntable confirms the turret package
rotates cleanly and the cloth remains correctly attached to the hull.
