# Ariete family revision — 2026-09-21

Status: geometry, visual, anatomy, type and both builds pass; four stale
fleet-preservation test expectations block the composed release and are being
updated for this explicitly authorized Ariete revision.

## Owner target and scope

The owner selected the Tier IX C1 Ariete as the definitive family foundation,
asked for a larger model, retained the earlier C1 Serie 1 and C2 as prototypes,
and requested a substantially improved proper C2 derived from the definitive C1.

| Stable ID | Target |
| --- | --- |
| `ariete_c1_x` | Definitive C1 Ariete, Tier IX, uniformly enlarged by 12% |
| `ariete_c1` | C1 Ariete Prototype (Serie 1); preserve existing geometry and saved identity |
| `ariete_c2` | C2 Ariete Prototype; preserve existing geometry and saved identity |
| `ariete_c2_x` | New C2 Ariete, Tier X, derived from the enlarged definitive C1 |

The 12% amount is the implementation interpretation of “make it larger”, stated
to the owner before authoring; it is not a newly measured historical dimension.
The preseries `ariete` and Carro 45 t are unchanged. The C2 leads the Italian
roster, followed by the definitive C1. These names do not rewrite saved IDs.

## Frozen source and design contracts

The original C1 supplied source remains
`/Users/kevinliu/Downloads/Claude of Tanks Models/c1_ariete_main_battle_tank.glb`, SHA-256
`02043219575d2ac02c9846666efca20c8087727808e4c51245a28588242e26b4`.
The original source registration and `ARIETE_SUPPLIED_X_DATUMS` remain intact.
The new dated registration multiplies the original scale and translation by
exactly 1.12, about the canonical ground origin. No candidate fit, nonuniform
rescaling, source repair, or component removal is authorized by this revision.
The prior canonical source SHA-256 is
`fec5f915eb6862ef4b6e3c442355b0ec9dd5df6f1357ec560490e43c84fda08c`.

The installed C1 dimensions are 7.852776222592 m hull length,
9.55785351752 m overall length, 4.0432 m width, and 2.38710864 m body height.
These follow the owner's selected supplied-model proportions, not a claim that
the source's oversized side equipment matches the real vehicle's width.
The primary cannon keeps its 120 mm bore after enlargement. This differs by
1.408 mm from simply multiplying the source's previous 108.4 mm bore by 1.12.
The existing functional loader machine gun is preserved; the source's earlier
empty-fork equipment conflict remains documented in the C1 reference packet.

The new C2 is an explicitly authored family derivative. It uses the enlarged
C1 structure and prescribed primary datums, with photo-informed C2 equipment.
There is no supplied C2 3D comparison model and no invented source score.
Its separate frozen concept contract requires the same physical, visual,
performance, anatomy, and release checks as other playable additions.

## Primary C2 references and gameplay interpretation

[CIO's C2 description](https://idv-otomelara.com/ariete-c2/) identifies
a 1,500 hp engine, revised transmission, wider tracks, seven road-wheel pairs
and four return rollers per side, electric turret controls, Attila-D commander
and Lothar-SD gunner sights, and a 120 mm main gun with roof machine guns.
The [Italian Army's 2023 report](https://www.esercito.difesa.it/Rapporto-Esercito/Documents/2023/ok_RE23_A4_ITA.pdf)
also describes added protection kits and a belly anti-mine plate.

Those features motivate the new first-party construction. Armor effectiveness,
reload, stabilization and survivability values are game balance, not published
classified protection claims. No active protection system or guided missile
armament is inferred. Add-on protection needs finite visible stock and matching
gameplay faces; cosmetic sights and weapons must not inflate armor volumes.

## Baseline and frozen rendering budgets

Baseline: `b50b20878e2ec9218e522a874adff50e45e60e2e`, isolated branch
`codex/ariete-family-revamp-20260921`.
Native baseline receipt: `.qa-dev/ariete-family/baseline.json`.
Main through `0e2f77db3489efdc114b18950f5aa824ec930275` was integrated before
final qualification. Its movement changes, authored Factory paint, national
colors and left-facing portraits are preserved. The four Ariete asset sets
were regenerated with that portrait policy; unrelated fleet asset rows remain
unchanged.

| Model / state | HIGH triangles / batches | LOW triangles / batches |
| --- | --- | --- |
| Original definitive C1, native | 96,142 / 40 | 83,950 / 38 |
| Original definitive C1, filled | 97,714 / 43 | 85,522 / 41 |

C1 uniform enlargement must not increase the existing filled triangle cost.
Its inherited LOW cost is disclosed rather than expanded into an unrelated
running-gear redesign. C2 is capped at 100,000 HIGH rendered triangles and
LOW at 75% of HIGH, with a target at or below 74,000. C2-only tessellation
changes must preserve the authored curves, physical stock and wheel/track
contact; stored geometry counts do not substitute for rendered-instance cost.

## Required verification

- C1 registered source comparison at the unchanged exemplar floor: aggregate,
  every valid view and every applicable geometry component at least 92.
- Native HIGH/LOW physical and articulation checks, full moving-shoe and band
  clearance, meaningful bores, attachment paths, and armor edge/gap shots.
- Independent 14-view review for both new forms, plus actual Gallery/Garage
  selection and cold/warm/rapid-switch cost evidence.
- Exact preservation of the legacy prototype geometry and unaffected vehicles.
- Full anatomy update/check, generated markings and portraits, targeted release,
  type checking, public/private builds, and attribution checks.

Fresh final measurements are recorded below. Earlier passes and historical
source continuity failures are not transferred to this revision. Shared source
geometry stays local and is never a playable asset.

## Physical and performance results

Final loaded-fill geometry (native rendered instances, not stored buffers):

| Vehicle | HIGH triangles / batches | LOW triangles / batches |
| --- | --- | --- |
| Definitive C1 | 96,418 / 41 | 84,226 / 39 |
| New C2 | 97,514 / 44 | 69,538 / 42 |

C1 stays below the original filled budget. C2 LOW is 71.3% of HIGH, below both
the 75% ceiling and the 74,000-triangle target. The C2 uses a dedicated simpler
LOW shoe; shared fleet track rendering is unchanged.

The first independent image review found permanent armor, hatches and optic
supports disappearing through an inherited empty-far detail LOD. The final
family-only assembly retains those fitted parts with their original materials
and armor/equipment ownership. Running-gear LOD remains unchanged. Actual
60 m rendered costs are 65,450 / 53,258 triangles for C1 HIGH / LOW and
66,546 / 51,842 for C2. Visibility checks also cover 100 m, 200 m and mobile.
The C2 roof weapon was rotated on its circular mounting foot to clear the
panoramic sight; receiver, barrel and mounting stock remain one seated assembly.

The physical fixture checks filled HIGH/LOW construction, 820 legal poses,
finite barrel-wall rays, optics, roof weapons, recoil and deliberate moved-stock
and blocked-bore failures. Rough-field tests retain the existing clearance
limits: maximum measured cut 0.1 mm, daylight 0, and suspension travel 267 mm
(C1) / 272 mm (C2). A 1.12-aware gear adapter converts world travel and terrain
into the unchanged source solver frame.

The enlarged C1 reverses to its authored source within 0.000000171 m for the
448k checked HIGH/LOW vertex instances, apart from the explicit 120 mm bore
correction and a hidden underside relief in the muzzle-reference fitting.
The latter preserves the visible fitting outline while removing inherited
intrusion into the bore. Legacy `ariete`, `ariete_c1`, and `ariete_c2` geometry,
indices, UVs, transforms and instances remain exact in all six checked builds.

### Measured gun clearance

Testing the complete barrel found inherited interference with the front skirt
shoulder and engine deck. The new optional `gunPitchByYawDeg` contract provides
a symmetric, piecewise mechanical stop for these two definitive models only.
The knots are in `arieteXFamilyFrame.ts`; the same pure function is used by
live aiming, held poses, Gallery, Studio, shot reconstruction and killcam.
Front and broad side arcs retain −9° depression. The local 35° shoulder uses
−5°; fully rear-facing minima are +1° for C1 and +2° for C2. These are clearance
limits measured for the selected game model, not historical gun-arc claims.

Both signs of yaw were checked at 5° intervals, with 60 finite rays inside the
actual barrel metal per tested pose. This is sampled physical verification,
not a proof over every continuous surface point. No hull armor was removed to
make the barrel pass. Fixed-step tests cover the changing limit during traverse,
wrapped headings, held/imported poses, and unchanged vehicles without the field.

### Retained source openings

The two raw rear continuity cells in HIGH and LOW are genuine tow-coupler air.
The [bounded opening record](ariete-rear-openings-20260921.md) preserves their
raw failure counts and requires the authenticated source, each quality's actual
raster, and complete finite stock/air witnesses. There are no unexpected cells.
The source corroborates only the retained C2 rear assembly, not the C2 design
as a whole. Small inherited collar/shank contour differences remain disclosed.

The separate [sealed-surface calibration](ariete-sealed-scale-20260921.md)
uses the immutable historical C1 geometry enlarged by exactly 1.12. Its 196
classified pixels, rather than the candidate's lower 192, define the new
scale-aware reference. Independent review traced all 42 scale-added cells to
inherited wheel backfaces crossing the unchanged 80 mm cutoff. No check
threshold or other vehicle's baseline changed; this does not claim to repair
the inherited inverted wheel faces.

## Final integration status

Full anatomy, marking-seat and technical-diagram generation completed. All ten
asset files for each of the four affected roster entries were regenerated.
The second native capture contains all 56 HIGH/LOW images; independent grading
passed at 9.0–9.3, with all 28 quality/camera pairs and image hashes verified.
Six ordinary Gallery keyboard poses confirm the mechanical gun limits. All 27
Gallery and desktop/mobile Garage selection measurements converged with no
recorded page errors, resource errors or input drift. Median / p95 UI readiness
was 530.3 / 599.5 ms in Gallery, 84.4 / 465 ms in desktop Garage, and
329.1 / 415.1 ms in mobile-tier Garage under 4× CPU slowdown. These are Vite
measurements with prefetch enabled, not FPS, cold-network or handset claims.
LOW atlas repetition remains a disclosed cosmetic limitation. A display-only
rounding correction removes a floating-point tail from the gun-angle label.

Full anatomy/asset freshness,
type checking and the public build have passed, alongside the focused motion,
replay, metadata, armor and source-authority checks. The anatomy check covers
201 vehicles, 1,736 modules and 402 track sides with zero failures or modules
outside their envelopes; 92 historical dimension warnings remain disclosed.

Release attempt 2 rejected a tooling assumption that conventional shells must
declare individual counts. The game uses shared per-type capacities when those
optional counts are absent. The concept checker now calls that canonical
resolver and still rejects malformed explicit counts. The actual registered C2
loadout and negative controls pass without changes to runtime ammunition.
Release attempt 3 passed that concept check, sealed checks and C1 fidelity
(97.7 aggregate; 97.1 minimum), but rejected two C2 shoe/hull contact cells.
Finite investigation confirmed actual contact introduced by the wider shoes;
the earlier suspension proof did not cover shoe-versus-hull intersections.
That contact is now repaired in the C2's receiving hull stock. The lower tub
retains its complete floor, roof heights and exterior envelope while its
concealed end walls narrow through twelve longitudinal stations. Two skirt
carriers retain their outer faces and 29 mm of closed stock, with inner faces
moved outward by 20.16 mm in the installed frame. Nine of the twelve primary
hull pieces remain exact. The tub removes 351.164 L (2.93%); each carrier
removes 4.222 L. C1 and the prototype shapes are unaffected.

The final fixture samples the complete moving course at four quarter-link
phases in HIGH/LOW, including both native shoe LOD streams, against all three
revised stocks. Restoring either the old tub or the old carriers fails the
negative controls. Strict HIGH/LOW front, rear and full-sweep band/shoe checks
now report zero intersections for both definitive tanks. This does not claim
that every inherited edge contact is eliminated: the separate end-window
fixture retains nine HIGH shoulder/floor contacts versus fourteen in C1,
outside the three repaired stocks.

The ordinary whole-hull collision slicing would bridge the new clearance air,
so C2 alone now uses an offline producer for the twelve actual primary hull
pieces. Its 225 cells and 2,086 faces preserve the bearing well, ring and track
clearances. HIGH/LOW cells match exactly. Each quality passes 1,260 complete
stock-interval rays, twelve actual runtime armor first-hit rays at hull yaw,
and missing/shifted stock and filled-air negative controls. Published anatomy
is checked against those produced cells, with unchanged render buffers and
materials. No other tank's collision producer changes behavior.

The exact C2 collision costs more than the old ten-cell approximation. Five
alternating rounds of 5,200 mixed whole-model traces measured 11.412 µs before
and 14.588 µs after (+3.177 µs, +27.8%); serialized collision data grows from
6,199 to 166,125 bytes. These are native CPU microbenchmarks, not browser FPS
claims. The detailed receipt is
`.qa-dev/ariete-integration/c2-collision/bench-final.json`.

After the repair, a separate critic inspected all twelve new C2 originals:
front, rear, both hero angles and both underside views in HIGH/LOW. Grades
were 9.0–9.2, with six exact quality/camera pairs, image hashes and 1,220 input
pins verified. No new visible hole, unsupported carrier or silhouette defect
was found. Review receipt SHA-256:
`5708f0034f964ebd76f49ebdfb4225f1ab1384bf1760409842e3ffb059e9fdfa`.
The earlier full C1 review remains valid for its unchanged geometry; this is
not a claim of pixel equality across the incoming Factory-paint integration.

Release attempt 4 passed geometry, physical concept, equipment,
strict tracks, bounded source openings, sealed surfaces and C1 fidelity
(97.7 aggregate; 97.1 minimum), all fleet probes and the private build.
Its pretest phase passed 395 of 399 files. Four historical whole-fleet
expectations rejected the authorized prototype name changes, enlarged C1
registration and new C2 ammunition/marking entries. Those expectations need
narrowly authenticated Ariete deltas while preserving their historical
non-Ariete assertions. No final composed release pass is claimed yet.
