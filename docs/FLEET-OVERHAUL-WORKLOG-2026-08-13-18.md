# Fleet Overhaul Conversation Worklog

Dates: 2026-08-13 through 2026-08-18

Landed snapshot: `origin/main` at `38c9915366d95c9084db1f89d6dc214baae6d076`

Conversation boundary: `d9feca33` (`Remove Merkava IVm Windbreaker`) through
`38c99153` (`fix(vehicles): add AMX-30 mantlets`)

## Purpose and evidence

This document is the durable summary of the long fleet-authoring conversation
that ran from the Merkava IVm removal through the final KF51B, Leopard 2A6M,
Chieftain, and AMX-30 integration. It records the owner's corrections, the
implementation themes that reached `main`, the important reversals, and the
remaining verification limitations.

This is a historical worklog, not a replacement for the current authoring law.
Use the following sources when exact current state matters:

- `BUILD-STANDARD.md` and `GEOMETRY-GATE.md` own current authoring and
  acceptance rules.
- `PROGRAM-STATE.md` owns the detailed fleet ledger and round-by-round status.
- `references/tanks/<id>.md` owns each tank's source packet, known limitations,
  measurements, and certification history.
- `critique/` owns independent visual-review evidence.
- `FLEET-FREEZE-CURRENT.json` owns the current dual-fingerprint snapshot.
- Git owns what actually landed. A request in the conversation is not treated
  as complete unless it can be tied to the merged tree or a current receipt.

The ancestry interval contains 565 commits and touches 1,976 files, but it also
contains parallel multiplayer, rendering, world, and generated-asset work.
Those counts describe the landed interval, not the number of tank changes made
by this conversation.

## Executive summary

The work changed the fleet from a mix of regressions, duplicated running gear,
flat or detached armor packages, and ad-hoc review tools into a consistently
first-party procedural fleet with:

- one suspension-driven smart track course per side;
- family-specific track shapes, terminal wheels, fenders, and mudguards;
- physically seated turret armor, sights, guns, baskets, cages, and ERA;
- a browser surface-markup workflow for identifying exact geometry;
- custom per-tank markings and regenerated identity/damage assets;
- country, tier, then name ordering in the garage;
- a large new set of national variants and AFVs built from visual reference;
- source GLBs removed from the playable runtime and retained only as local
  authoring references where available;
- a stricter anatomy, track, yaw, muzzle, asset, and visual-proof loop.

The most important process correction was that track clearance may never be
achieved by deleting or broadly moving visible hull armor. The August 13
running-gear regression demonstrated that a numerically clear track corridor
can still destroy the tank's silhouette. The recovery moved to per-family,
component-owned edits with fresh visual evidence.

## Standing decisions established during the conversation

### Procedural runtime ownership

- Every playable tank is first-party procedural runtime geometry.
- User-supplied GLBs are visual and geometric authoring references. They are
  not a playable loading path and their geometry is not copied into runtime.
- `952561ea` removed the 3,183-line runtime tank GLB loader, its swap/polling
  branches, 101 tracked source GLBs, and 11 GLB backup files. Only runtime prop
  GLBs remained.
- Missing or retired reference GLBs must not be interpreted as a failed runtime
  tank. They block only the old source-comparison portion of a release gate.

### Running gear and armor preservation

- Keep one suspension-driven wheel and smart-track system. Remove duplicated
  static wheel faces, proxy tracks, or decorative tread layers.
- Preserve side skirts, top skirts, fenders, mudguards, sponsons, pressure hull,
  ERA, cages, and armor plates unless the owner explicitly marks the component
  for removal.
- A default wheel order is not a universal geometry transform. Idler, road
  wheel, final-drive, return-run, and shoulder relationships remain
  family-specific.
- Track treads may inherit a better visual shoe design, but the animated
  suspension course remains the owner of the running gear.
- Direct, elevated, front, rear, quarter, top, and yaw 0/90 views are required
  to catch duplicated layers, exposed corridors, detached skirts, and winding
  failures.

### Turret and equipment seating

- The turret shell, gun saddle, mantlet, barrel, cheek armor, roof, bustle,
  cages, ERA, optics, machine guns, smoke launchers, hatches, and antennas must
  visibly share a load path.
- Parenting to `rig_turret` is necessary but not sufficient. Every fitting must
  appear physically seated at yaw 0 and yaw 90.
- Flat cards, unsupported shelves, floating dots, detached roof plates, and
  cages that do not meet the bustle are regressions even if hashes and bounds
  are valid.
- Gun bores and rims are explicit geometry requirements across the fleet.

### Markings and impact placement

- Insignia locations are custom per tank and must be seated on a real surface;
  there is no universal decal plane that works for every hull and turret.
- `cd093b4c` added per-tank insignia anchors.
- `4c26be71` unified fleet identity and damage presentation assets.
- The same surface-anchor concept is the intended basis for impact-mark
  placement, so insignia and hit effects agree on local tank surfaces.

### Garage and review UX

- Garage ordering is country, then tier, then display name (`640ee048`).
- The standalone Surface Studio became an integrated app/gallery workflow.
- Carousel arrows, edge shadows, and affordances only appear when more content
  exists (`fd374090`, `0297cbc7`).
- Garage dossiers use the tank's flat 2D icon in the upper-right (`d012ae33`).

## Vehicle work by family

### Abrams family

The Abrams work covered M1A1, M1A1 HA, canonical M1A2, SEPv2, SEPv3, TUSK,
and AbramsX.

- Restored the intended Abrams/Leopard fidelity work and promoted the authored
  Tejas-grade M1A2 as the canonical M1A2 (`64892e2f`, `84458fb9`).
- Reworked cheek and reactive-armor packages so they conform to the turret
  instead of intersecting or floating (`2a00cc51`, `460a08f2`, `c8249295`).
- Applied Surface Studio removals to the marked left-cheek overlays and tapered
  the remaining cheek shelf (`d62c77d3`, `3a183bca`, `93c7ea95`).
- Removed duplicate road-wheel layers while retaining the suspension-driven
  set (`f7a1ce5b`).
- Shortened, shielded, and variant-angled right-side loader machine guns on
  SEPv2, SEPv3, TUSK, M1A1, and M1A1 HA (`cf4d21c8`, `64221fe7`, `a8a8ec5f`).
- Filled the front shoulder pockets, then corrected them into raked lower
  shoulders and closed both rear sprocket wells (`12c03798`, `24bd6a5a`).
- Unified TUSK's four-piece cheek tiles into one swept cassette per side and
  later corrected the exposed cheek behind the ERA (`09cd4783`, `e7c28eff`).
- Kept skirts, ARAT, roof weapons, suspension, and the single smart course
  intact throughout the shoulder and cheek corrections.
- Updated garage repair-bay dressing to use the canonical current M1A2
  (`d52c3945`).

### Leopard and KF51 family

- Restored Leopard 2A4 and 2A7V side skirts and upper side armor
  (`4a8c2d58`, `0c8c79a3`).
- Removed the repeated Leopard Revolution left-cheek card/shelf artifacts and
  applied exact Surface Studio markup (`891adc6f`, `738906ad`, `879d03ef`).
- Removed the Revolution's duplicate static course and kept its smart track
  system (`c7b3c9df`).
- Collapsed the duplicated 2A7V track layer and later unified
  suspension-driven wheel faces across affected families (`2183ff0d`,
  `217643ab`).
- Restored the Leopard 2A4M's large hull cage and armor assembly from its prior
  authored state (`dae146cd`).
- Rebuilt the Leopard 2A6M's incomplete front into the characteristic hollow,
  arrow-shaped spaced-armor wedge; sealed the crown, seated the front package,
  and flushed the side ERA (`6088d0d7`, `55cde73e`, `94c42f76`).
- Added KF51B as a separate variant rather than replacing KF51
  (`8fb6ce0f`). Its track course was reshaped and the complete turret rig was
  moved forward in two steps while preserving gun/equipment yaw ownership
  (`d9693c87`, `fb5616f0`).

### T-90, T-72, T-80, T-64, T-84, and BMPT families

#### T-90 variants

- Rebuilt base T-90 around the exact Burlak turret foundation, then restored
  the large rear bustle, variant-specific armor, Shtora eyes, and equipment
  (`08a50390`, `f5893ca9`, `7f494938`).
- Iterated the T-90 front package vertically in response to live views. The
  final landed state raises the gun, eyes, and frontal armor together and
  shifts them slightly toward the bow (`ef174d23`, `b8ae9fe1`, `f6070929`).
- Rebuilt the T-90A family on a welded T-90SM-derived base and retained
  variant-specific fittings (`f8649fda`).
- Recentered T-90A Vladimir on its hull ring, moved the eyes into the cheeks,
  enlarged the bustle, raised the gun, joined the turret crown, and restored
  large seated Shtora eyes (`48449e4f`, `94e07884`, `bcba0361`, `49711041`).
- Made T-90SM side panels flush to the turret rake and joined the rear cage
  into a flowing connected complex (`a4f83dd4`, program-state round
  `1829fcb7`).
- Deepened T-90M Proryv's shoulders, upper/lower glacis, roof equipment,
  bustle, armor, track profile, searchlight placement, and rear detailing
  (`0b7c1c65`, `6cd8c119`, `fa1de72a`).

#### T-72 variants

- Standardized T-72 family ownership and brought T-72BU closer to the current
  B3 quality level (`cf7219ec`, `0c447ac1`).
- Added and repeatedly rebuilt T-72B obr. 1987 on the current family language,
  then placed it in the modern roster (`197a727a`, `675a5cec`, `95872d7f`,
  `c6d15621`).
- Centered T-72B3M obr. 2022 on the garage platform, reconciled turret-owned
  packs, removed duplicated fake-track proxies, and unified its palette
  (`c848a4c7`, `0714e2ee`, `831e55db`, `28609991`).
- Preserved the smart suspension course while removing the marked olive/static
  running-gear geometry.

#### T-80, T-64, T-84, and BMPT

- Shortened and reshaped T-80 family turret sections, corrected Kontakt and
  smoke layouts, and added visible roof equipment, hatches, cupolas, machine
  guns, racks, and BV-specific armor (`6fdac376`, `36ad5d55`).
- Rebuilt T-64BV-1 from the owner's authoritative reference and corrected its
  top silhouette (`c628d39d`, `5f26bfde`).
- Added and refined Ukrainian T-64BV, T-80BV, T-80U Kursk, and T-84BM
  Oplot-M variants. The Oplot's missing turret cheek walls were restored in
  follow-up rounds (`69a16752`, `ec4606ac`, `31254734`).
- Replaced inconsistent T-72/BMPT light olive and uncolored materials with the
  family palette (`9494e143`).
- The Terminator/BMPT lane was iterated and re-bound; an obsolete BMPT row was
  removed before the later T-90-hull twin-30 mm implementation landed. Treat
  the current roster/specs, not the intermediate request list, as canonical.

### British vehicles

- Corrected Challenger 1's turret-ring center, removed the detached gun blob,
  seated the side assemblies flush to the turret, and reoriented obscured roof
  equipment (`7dc43a2b`, `f15fe963`, `5ab1352f`).
- Lowered and joined Challenger 3's rear crown to the forward turret, attached
  its floating side details, and reseated roof equipment (`688b89ae`).
- Restored FV510 Warrior's segmented side armor and deep WRAP/zigzag modules,
  improved the glacis and sights, and corrected its running gear without
  deleting armor (`b380378e`, `484b1b7a`, `6a519389`).
- Added the tier-9 FV510 Warrior MILAN with expanded armor, optics, lighting,
  missile/gun equipment, hatches, and upper-glacis detail (`05c38fd3`).
- Rebuilt Chieftain Mk 5 and Mk 10 with family-specific turret/hull shaping,
  terminal-wheel/mudguard integration, additional armor, and the final
  fidelity pass (`db74ade2`, `35dfb066`).

### French vehicles

- Corrected Leclerc's track course, mudguards, shoulder height, continuous
  glacis, and rear terminal wheel (`23d86bcc`, `84ce5e3f`, program-state round
  `dbfea889`).
- Added Leclerc XLR and AMX 56 variants as distinct family members rather than
  aliases (`eb637d9f`).
- Rebuilt AMX-30 and AMX-30B2 on the requested skirtless AMX-40-derived base,
  corrected turret-to-hull proportions, expanded cupolas/equipment/Brenus
  armor, and added proper mantlets (`6a1b854f`, `6eec9271`, `58379fee`,
  `38c99153`).

### Italian vehicles

- Preserved the earlier Ariete as the preserie branch and added distinct C1,
  C2, and Carro 45t builds from the supplied visual references.
- Closed the original front hull/upper-glacis gap (`00b9b397`).
- Rebuilt and later re-certified the C1/C2/Carro family with distinct slopes,
  turret fittings, ERA, skirts, machine guns, and running gear (`9555f7fe`,
  `2dc97236`).
- Widened and raised C1/C2 running gear to restore Ariete proportions, then
  refreshed the targeted assets (`674de8ee`, `6895845f`).

### Merkava family

- Removed the playable Merkava IVm Windbreaker at the owner's request
  (`d9feca33`). The later Merkava Mk 4B is a distinct authored variant.
- Rebuilt Mk 1B, Mk 2B, Mk 2D, Mk 3B/Mk 3C/Mk 3D, and Mk 4B hull/turret
  families from the supplied visual references while preserving first-party
  procedural runtime ownership (`8fb6ce0f`).
- Deepened hull armor, tracks, equipment, ERA, turret armor, and roof fittings
  (`bf5338c6`, `68c5c51a`, `a9221836`).
- Rebuilt the Merkava gun housings into narrower square-pyramid masks that
  extend into the turret, then added surface detail and engraving
  (`22ef740c`, `985f4647`, `4a12897f`).
- Reused the proven Mk 1B track course on Mk 4B at the correct scale
  (`3ca4cbec`).
- Flattened/reseated rear turret interfaces so bustle and cage assemblies meet
  the shell (`550f4e2e`).
- Fixed malformed mantlet fasteners that rendered as multi-meter vertical
  lines without deleting legitimate antennas (`031a275f`).

### United States legacy and AFV work

- Rebuilt M48A5 and the M60A1/M60A2/M60A3 family from their supplied visual
  references with distinct silhouettes, turret equipment, ERA, and fittings
  (`c7782d79`, `745214ee`).
- Added the missing M60A2 track fenders (`2013b4bd`).
- Rebuilt M3A3 Bradley's turret from the M2A2 language, added side/upper-glacis
  armor and fittings, then reduced turret height by 20 percent and reseated the
  equipment (`a14c9e37`, `a3c99aa2`).

### National expansion waves

The conversation supplied local visual references for several national waves.
The landed implementations remained procedural and treated the files only as
authoring oracles.

| Wave | Landed work |
| --- | --- |
| Ukraine | T-84BM Oplot-M, T-80U Kursk, Ukrainian T-64BV and T-80BV, plus later asymmetry/cheek fixes (`69a16752`, `ec4606ac`) |
| China | ZTZ-85-III and ZTZ-99A2 family additions and correction rounds; ZTZ-99A2 bustle basket filled (`20c18dd1`, `76196647`, `c876c5a3`) |
| Sweden | Strv 81, Strv 103, and Strv 122 work (`4c8112fb`); several initial rebuilds were later explicitly reverted by owner order (`33260080`) |
| Poland | PL-01, T-72M1 Jaguar, and PT-91A/Twardy family (`c8384c4b`, `f38c6b2e`) |
| Japan | Type 10B, Type 90A, and related modern family work (`10800aa3`, `3b9c1b20`); Type 10 later received an owner-directed restore/pin before further track and pivot fixes |
| Germany | Leopard 2A4M, Leopard 2A6M, and KF51B modernization family (`fa0f307a`, `b66d6d03`) |
| IFV/AFV | Korean BMP-3, Ukrainian Bradley, BMPT/Terminator, Upior, Marder 1A3, M3A3 Bradley, and SPz Puma family work (`2fc642fb`, `fe7b8d00`) |

These waves included both rebuilds and later owner-directed reverts. The final
roster and per-tank packets are authoritative; intermediate conversation names
must not be used as a roster source.

## Fleet-wide running-gear recovery

The initial modern-wheel pass (`f16c9659`) reproduced the exact failure mode
the owner warned about: terminal-wheel and track normalization removed or
moved visible skirts and hull surfaces. `4b3b8f2f` reverted the broad envelope
regressions, and `POSTMORTEM-RUNNING-GEAR-REGRESSION-2026-08-13.md` recorded the
root cause.

The replacement program used narrow, family-owned repairs:

- modern Russian families: T-72, T-80, T-90, T-64;
- Abrams, Leopard, KF51, K1A1, K2, Ariete, Leclerc, Merkava;
- Bradley, FV510, Challenger, Chieftain, Patton, AMX, Strv;
- WWII and Cold War families including T-34, IS, Sherman, Panther, Tiger,
  Pershing, Centurion, Comet, Charioteer, and casemates.

The resulting terminology is:

- **native course**: the authored first-party suspension and linked tread path;
- **track corridor**: the narrow clearance volume required by that moving
  course, not permission to erase adjacent armor;
- **proxy/static track**: non-suspension geometry that duplicates a live wheel
  or tread layer and should be removed only when ownership is proven;
- **smart shoe course**: the retained suspension-driven tread system whose shoe
  appearance can be improved without creating a second course.

`c376dd7b` unified smart shoe-course technology, while later family commits
handled the actual geometry and preserved each vehicle's armor envelope.

## Surface Studio and Tank Gallery

The owner proposed a small studio that could highlight a tank surface and
export JSON describing exact removals, additions, or reshapes. That evolved in
three stages:

1. `076a1863` added the first-party Tank Surface Studio.
2. `a592b73d` integrated the workbench into the app and `d1120010` exposed
   reproducible camera state.
3. `6cfe4abc` consolidated the Surface Lab into the public Tank Gallery, with
   the markup implementation moving to `src/gallery/surfaceMarkup.js`.

The JSON packets used in the conversation identify:

- tank ID and procedural build options;
- hull/turret ownership and rig path;
- mesh, material, geometry bounds, and face indices;
- local/world centroid, representative triangle, surface normal, and anchor;
- requested operation: remove, add, or reshape.

This workflow directly resolved Abrams cheek overlays, Leopard Revolution
artifacts, T-90/T-90SM seating, T-72 proxies, Challenger assemblies, and other
hard-to-name geometry. A markup packet is an exact diagnosis; source geometry
still must be edited at its semantic owner rather than deleting an arbitrary
runtime bucket.

## Garage, roster, icons, hit assets, and labels

- Garage nation blocks were first sorted by name (`85d52328`), then the final
  policy became country, tier, display name (`640ee048`).
- T-72B obr. 1987 moved into the modern grouping (`c6d15621`).
- The modern repair bays were updated to authored T-90 and M1A2 displays
  (`7b872948`, `d52c3945`).
- Contextual carousel edges/arrows replaced always-visible navigation
  affordances (`fd374090`, `0297cbc7`).
- Flat tank portraits were added to the garage dossier (`d012ae33`).
- Fleet labels, country identity, markings, hit zones, armor maps, module maps,
  silhouettes, and icons were normalized and regenerated (`5ce6f9c4`,
  `4c26be71`).
- Per-tank insignia anchors were seated on actual vehicle surfaces
  (`cd093b4c`).
- Combat anatomy was recalibrated and all technical diagrams/receipts were
  refreshed (`3635217c`).

## Performance and runtime cleanup

`952561ea` was the main performance/legacy cleanup integrated during this
conversation:

- retired the tank GLB runtime and source-selection UI;
- deleted the runtime GLB loader and polling/swap branches;
- removed tracked source/reference tank GLBs from the shipped bundle;
- scheduled garage/transition work more safely;
- removed a duplicate full-roster combat warm pass.

The integration report recorded the following sustained 4-core/4 GB results:

- ready: 4.142 s;
- garage p95 24.3 ms, p99 25.5 ms, max 36.6 ms, no freezes;
- uncached first battle 27.786 s total;
- live battle p95 24.4 ms, max 67.2 ms, no long tasks/freezes;
- no console errors in the verified garage/studio/battle paths.

These figures are historical evidence for that commit, not a permanent
performance guarantee.

## Verification and release evidence

Vehicle changes in this period used combinations of:

- `npm test` and production build;
- targeted tank asset checks;
- combat-anatomy update and check;
- track band, shoe, full-sweep, and duplicate-course audits;
- muzzle, bore, rim, winding, parent, and module checks;
- deterministic geometry hashes;
- paired/yaw packets at 0 and 90 degrees;
- multi-angle shaded-parity packets and independent critic sittings;
- garage, studio/gallery, and battle browser verification.

The final August 18 integration added four clean commits on top of the then
current `origin/main`:

| Commit | Result |
| --- | --- |
| `fb5616f0` | Centered the complete KF51B turret rig |
| `94c42f76` | Seated Leopard 2A6M turret armor |
| `35dfb066` | Deepened Chieftain Mk 5/Mk 10 fidelity |
| `38c99153` | Added AMX-30 family mantlets |

For those changes, the full test suite, production build, combat-anatomy
receipts, and targeted assets passed. The old GLB comparison phase timed out
for KF51B, Leopard 2A6M, and Chieftain because the referenced local GLBs had
been deliberately deleted or were not registered. That is a source-oracle
limitation, not a runtime geometry failure.

At the final integration point, the fleet-wide asset checker still reported
188 stale generated geometry/metadata entries outside the six targeted tanks.
The six-target asset check passed. This backlog must remain visible until a
separate clean fleet regeneration reconciles it.

## Important reversals and superseded work

The conversation included several corrections where the first implementation
was intentionally retired:

- the broad modern idler/track envelope pass was reverted after it removed or
  displaced skirts and hull surfaces;
- Leopard 2A6 changes that degraded the existing turret were undone before the
  later 2A6M-specific arrowhead work;
- Swedish source-wave rebuilds were partially reverted by explicit owner
  order;
- Type 10 was restored/pinned after an early source-wave version introduced a
  floater, then received narrower follow-up track/pivot work;
- obsolete BMPT registration was removed before a later replacement
  implementation landed;
- repeated T-90 front-package moves were superseded by the final unified
  raise-and-forward correction;
- early Merkava gun masks that were too wide or blocky were superseded by the
  narrower buried square-pyramid housings;
- superseded feature branches and generated QA exhaust were not merged merely
  because they existed.

This is why commit ancestry, current specs, and current tank packets outrank a
single intermediate screenshot or branch name.

## Known limitations and follow-up rules

- Reference-fidelity gates that depend on deleted local GLBs cannot currently
  run to completion for every tank. Do not recreate a runtime GLB path to solve
  this; either restore an authorized local authoring oracle outside the shipped
  runtime or use the documented no-oracle/photo-class path.
- Fleet-wide generated assets had an outstanding stale-entry backlog at the
  final snapshot. Regenerate from a clean worktree and stage only intended
  outputs.
- Some national-wave implementations were later reverted or superseded. Check
  the current roster and tank packet before scheduling a new redesign.
- A numerical geometry score never overrules live pixels. Visible holes,
  floating parts, wrong winding, duplicate courses, and missing armor block
  graduation.
- A new fleet-wide geometry transform is prohibited unless component ownership
  is explicit and a small representative sample passes before expansion.

## Milestone commit index

| Area | Representative commits |
| --- | --- |
| Merkava IVm removal | `d9feca33` |
| Track regression and recovery | `f16c9659`, `4b3b8f2f`, `c376dd7b` |
| Low-end/runtime GLB cleanup | `952561ea` |
| Surface Studio and Gallery | `076a1863`, `a592b73d`, `6cfe4abc` |
| Garage ordering and dossier UX | `640ee048`, `fd374090`, `d012ae33` |
| Fleet identity and anatomy | `4c26be71`, `cd093b4c`, `3635217c` |
| Abrams family | `64892e2f`, `f7a1ce5b`, `24bd6a5a`, `09cd4783` |
| Leopard/KF51 | `879d03ef`, `dae146cd`, `6088d0d7`, `94c42f76`, `fb5616f0` |
| T-90/T-72/T-80 family | `08a50390`, `49711041`, `95872d7f`, `36ad5d55`, `fa1de72a` |
| British/French/Italian | `05c38fd3`, `35dfb066`, `688b89ae`, `eb637d9f`, `38c99153`, `674de8ee` |
| Merkava rebuild | `8fb6ce0f`, `22ef740c`, `3ca4cbec`, `031a275f` |
| National waves | `69a16752`, `20c18dd1`, `4c8112fb`, `c8384c4b`, `10800aa3`, `fa0f307a` |
| Final landed snapshot | `38c99153` |

## Handoff

Future work should begin with the current tank packet and a live gallery view,
not with the oldest request in this conversation. When a visual issue is hard
to describe, export a Surface Markup packet, identify the semantic source
owner, make the narrowest family-specific edit, regenerate only targeted
assets, and verify both mechanical receipts and live pixels before landing.
