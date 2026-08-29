# DESIGN — historical tank-generation program architecture

> Historical document. This describes the vehicle-generation program that
> produced and certified the fleet. For the current game runtime, use
> [SYSTEMS.md](SYSTEMS.md). For current vehicle acceptance law, use
> [BUILD-STANDARD.md](BUILD-STANDARD.md) and [GEOMETRY-GATE.md](GEOMETRY-GATE.md).

(2026-08-06, owner order: "make skills for everything and design.md and other .mds and
organize our codebase better." This document explains HOW the machine is built; the law
lives in docs/BUILD-STANDARD.md + docs/GEOMETRY-GATE.md and outranks this file wherever
they overlap. Navigation: docs/INDEX.md. History-as-narrative: docs/LESSONS.md.)

The program has four interlocking systems:

1. the RUNTIME — procedural tank construction (src/vehicles/);
2. the MEASUREMENT STACK — headless instruments that score builds against oracles;
3. the PROGRAM LOOP — builders → orchestrator landings → critics → ratification →
   graduation;
4. the ORACLE LIFECYCLE — community GLB → extract → registration → repairs →
   retirement at graduation.

---

## 1. The runtime

### 1.1 Spec layer — src/vehicles/specs.ts
- `TANK_SPECS` (specs.ts:543) — every playable's stats, `dims` (published real-vehicle
  dimensions: the gate's sovereign anchor), `armor` (incl. `turretPivot`/`gunPivot` —
  the rig seats), `visual` knobs (trackWidthM, camoScale, bakeDirtDeckEq...).
- `MODEL_SOURCE` (specs.ts:1690) — the per-tank source-of-truth switch: which ids load a
  GLB, with registration config (turretNode/gunNode regexes, autoPivot, yawOffset,
  flip). Procedural-only ids simply have no row. The userdrops*.js modules override rows
  in the eager facade's declared import order—later waves land on top.
- `getSpec` (specs.ts:2013), `ALL_TANK_IDS` (specs.ts:1678).
  `combatVariantSpecs.ts` registers the core Abrams/T-90 combat variants by
  side effect before roster finalization.

### 1.2 Build pipeline — typed facades, geometry kernel, and `tankFactoryCore.ts`
`tankFactory.ts` eagerly registers the complete fleet for release tools and
headless audits. Player boot uses `fleetFactory.ts` to acquire only the exact
builder and receipt families it needs. Both typed facades configure the same
cycle-free `tankFactoryCore.ts` implementation, whose
`createTank(specId, engineCtx, options)` is the single synchronous constructor.
Vehicle-agnostic transforms, primitive geometry, connected lofts, box UVs, and
merge behavior live in the strict `factoryGeometry.ts` kernel; the legacy core
retains fleet policy, rigs, running gear, and presentation state while those
contracts are migrated independently.
Flow:

1. **Rig skeleton** (`tankFactoryCore.ts`): `root` → `rig_hull` + `rig_turret` (at
   `armor.turretPivot`) → `rig_gun` (at `gunPivot`) → `rig_recoil`. This skeleton is the
   §H BASE RIG — the gate's articulation poses, damage/recoil systems, and the §B5
   parenting law all assume it. Decoration groups `rig_decor_hull`/`rig_decor_turret`
   attach at the end (skipped for proceduralOnly/metrology so the
   gate measures bare silhouettes).
2. **The builder runs** (`tankFactoryCore.ts`): `resolveBuilder(specId)` picks the
   profile function; extension tables merge in from `modern1.ts`, `modern2.ts`,
   and `modern3.ts`, plus `PROFILED_BUILDERS` (`profiledProcedurals.ts` →
   `src/vehicles/profiles/`, the
   program's family files; PROFILED_BUILDERS wins over legacy tankFactory builders —
   the leo2a4/ww2.ts override mechanism).
3. **Bucket grammar**: builders never touch meshes — they call
   `P.add(bucket, geo, x,y,z, rx,ry,rz, s)`. `BUCKET_DEF` in
   `tankFactoryCore.ts` maps bucket name → (parent rig group, material slot); e.g.
   'hull'/'hullDark'/'hullDetail' → rig_hull, 'turret*' → rig_turret, 'gun*' →
   rig_recoil/rig_gun. `P.clear(...)` lets variants replace a family's turret/gun while
   keeping its hull. `P.addGunExtra*` = pitches but does not
   recoil. `P.eraCluster` places instanced ERA bricks (hull- or turret-frame).
4. **Merge + camo bake**: each bucket merges to ONE mesh; CAMO_BUCKETS get
   box-UV + `bakeDirt` in `tankFactoryCore.ts` — vertex-color dirt baked
   in the merged bucket's LOCAL frame (why §B5 camo-bucket re-parents reseed the mottle
   and force a critic re-cert). Track-family buckets get `userData.trackBucket` for the
   §B4 audit.
5. **LOD + laziness**: non-LOD0 buckets wrap in `lodWrap` (LOD1
   ~150 m de-greeble). State-gated visuals (de-track destruction kit,
   in `tankFactoryCore.ts`) are built lazily at the state transition — the INVISIBLE-LOD
   ENVELOPE law (BUILD-STANDARD §C addendum): invisible meshes still carry world AABBs
   that icon framing/probes/hashers see; nothing parks hidden at a triggered pose.
   Materials stay EAGER (material ids are a draw-sort key; deferred clones renumber and
   break pixel identity).
6. **Running gear**: `buildRunningGear(P, cfg)` in `tankFactoryCore.ts` — wheels/idler/
   sprocket positions, contact-tangent ramps (§B6 trapezoid), the two-layer track:
   band + `trackShoeGeometries` in `tankFactoryCore.ts`, with instanced shoes riding
   rOut = trackTh/2 + 0.012 off the band centerline + 0.073 m pad/grouser depth — the
   PLAYER-VISIBLE surface the §B4 shoe audit voxelizes. Multi-unit rigs supported
   through explicit running-gear-unit receipts.
7. **Sync**: `syncFromState(state, dt)` drives yaw/pitch/recoil/tracks; visual timelines
   age on the shared FX clock so frozen screenshot captures step
   deterministically.

### 1.3 Profiles — `src/vehicles/profiles/` (single-owner law)
Family modules own their profile data and family-only helpers; everything generic
lives in `kit.ts` so two family owners never have to edit the same file. Families:
Abrams, Leopard, Merkava, Patton, Russia, UK, misc, casemate, Soviet-heavy, and WW2
(plus `modern1.ts`, `modern2.ts`, and `modern3.ts` homes for base-21 rebuilds).
§H FAMILY RIG: a variant is a <150-line param delta on its family
rig, never a re-author; per-profile winding guards (orientedSlab in misc.ts, sslab in
uk.ts) wrap every mirrored slab (§C missing-side law).

### 1.4 KIT / FITTINGS — src/vehicles/profiles/kit.ts (§I)
`import { KIT, FITTINGS } from './kit.ts'` — deterministic, seeded decoration library
(pintleMG m2/dshk/nsvt/mag classes with MG-PHYSICS tones, stowageRack, towCable,
jerryCans, spareTrackLinks, lightCluster, smokeBank, antennaWhip, unditchingLog).
Every fitting mesh carries `userData.fitting` (the §B3 census marker); the stamped
envelope (`group.userData.aabb`) must stay INSIDE the model AABB (§C — fittings never
change framing). `FITTINGS` is the import spelling that survives the kit.js/tankFactory
module cycle on synchronous top-level rigs. Self-test:
`node tools/tank-standard-check.mjs --fixture`.

### 1.5 Source-geometry comparison path
Playable vehicles never load third-party GLBs. Historical source geometry may
still be inspected by isolated authoring and comparison tools, but production
registration, Garage presentation, battles, thumbnails, and multiplayer all
use the first-party procedural builders. Public builds strip quarantined source
assets, and source-loader behavior is not a gameplay fallback.

---

## 2. The measurement stack

All instruments launch their own vite (74xx-77xx; owner plays on 5001) and drive
headless Chromium. The browser-render tools serialize on the /tmp/cot-shots.lock FIFO —
dir-lock + 15-digit zero-padded tickets in /tmp/cot-shots.queue, 5-min lock staleness,
30-min acquire timeout, ENOTDIR fallback for foreign plain-file locks (the shared
acquireLock block, e.g. visual-evaluator.mjs:21-66). Official rigs SELF-TICKET — never
wrap them (§F.1).

| Instrument | What it measures |
|---|---|
| tools/geometry-gate.mjs (:1-12) + tools/procedural-fidelity.html?geo=1 | THE gate. Both models through the identical 1024-px ortho-mask → column-polyline pipeline; components hullCurves/wholeCurves/turretCurves/stations/dims/floaters, min is the headline; curve score = 100 − 12·mean% − 0.6·p95% − 1.5·cover% (fidelity page ~:1007); hull-anchored translation-only registration; writes docs/geometry-gate/<id>.json + tool-written ledger.json (merge, never shrink — gate.mjs:68) |
| tools/vertex-extract.mjs (:1-25) | Reads the oracle GLB directly (no browser), replicates loader registration + normalization; emits docs/references/vertex/<id>.json — polylines at ~4.5 mm/px, the 14 station sections, landmark corners, dims replica, stylization factors, glb↔gate affine map. Every tank starts here |
| tools/vertex-workorder.mjs (:1-11) | One headless gate run dumping BOTH models' 96-column curves per scored row in ABSOLUTE world coords + worst-first error lists — the builder's authoring numbers (gate-JSON `at` is camera-frame; never author from it) |
| tools/vertex-normalize.mjs (:1-20) | Per-axis piecewise-linear oracle warp PLANS (gate meters → GLB control points) for repair_oracles.py batches; width never warped; --verify re-extracts |
| tools/visual-evaluator.mjs (:1-15) + visual-evaluator-page.html | §D numbers for angle/roundness claims: edge Δangles with noise bands, arc fits + facet reads, per-column deltas; RIG MISMATCH (yaw-proxy >10°) exits 2 and ABORTS scoring; --selftest calibrates; graduates need the committed CRITIC_REFERENCE_OVERRIDES mirror |
| tools/tmp-tank-critic.mjs + tmp-tank-critic.html | The official 14 shaded ref/proc pairs (front..close-roof) at camoSeed 4242 → shots/critic-<id>/; `--final` additionally writes 14 yaw0 + 14 yaw90 procedural frames with a shared union camera frame; the critic's raw evidence; graduates measure via its CRITIC_REFERENCE_OVERRIDES map |
| tools/track-clip-audit.mjs (:1-18) | §B4 voxel interpenetration at bow/stern wrap zones — bandVox AND shoeVox per zone (--exact = true interpenetration; shoe = player-visible bar); dressingSkipped conformance exclusions; shots/track-clip*.json, blind spots ranked |
| tools/turret-parent-audit.mjs (:1-8) | §B5 stranded (hull-parented furniture in the casting envelope) / dangling (turret-parented below the ring) / abutting (review tier); AABB-coarse — adjudicate vs source + renders |
| tools/tank-standard-check.mjs (:1-20) | Aggregate: latest gate components, §B4 clip, §B2 top-down hole scan (0 enclosed cells; FrontSide render doubles as the winding audit), §B3 fittings census (mg ≥ 1); --fixture = KIT self-test |
| tools/tmp-hashgeo.mjs (:1-3) + tmp-hashgeo.html | Deterministic geometry hash (FNV-1a over position buffers + world matrices, camoSeed 4242 pinned, mesh-order independent) — the graduate freeze instrument |
| tools/tmp-modelsource-dump.mjs (:1) | Dumps runtime MODEL_SOURCE (full import chain) — the load-prove + HELPER-EXPANDED mirror source |
| tools/tmp-lod-envelope-probe.mjs | Measures geometry outside the visible hull envelope at rest (invisible-LOD law's instrument) |
| tools/genIcons.mjs + tools/tank-assets-check.mjs | 8 outputs per tank from the shipped model: hero/top/side, two silhouettes, hit-zone/KE-armor/module diagrams; manifest binds file hashes + dimensions to live geometry, tiers and combat volumes |
| tools/muzzle-bore-probe.mjs | Visual fleet gate: straight-on render + center ray proves the machine-tagged cannon mouth is dark and exposed; emits per-tank PNGs and `report.json` |
| tools/repair_oracles.py (:1-33) | Append-only oracle repair recipes: node-level surgery, pristine .bak, byte-idempotent, census-guarded; sanctioned mesh-byte exceptions documented in its header (§E) |
| tools/quietcert.mjs | Perf certification that REFUSES contended machines by design (docs/cert-r6-*) |
| tools/screenshot.mjs | The 20-view deterministic screenshot contract (docs/SCREENSHOT_CONTRACT.md) — game-wide, not tank-specific |

Photo-class instruments (no-oracle lane): tools/tmp-leo-photoclass.{html,mjs} and
tools/tmp-ww2-photoclass.{html,mjs} — proc-only renders on the critic's exact 14-view
rig + yaw pose. Batch drivers holding ONE FIFO ticket for pair renders:
tools/tmp-b1b3-critic-batch.mjs (+ per-round clones like tmp-density-critic-batch.mjs).

Anti-gaming by construction: builders never hand the gate numbers; min() everywhere;
published dims anchor scale; symmetric coverage counts excess geometry; the ledger is
tool-written; a false-0 row (missing ref) is never recorded.

---

## 3. The program loop

```
owner directive ──► BUILD-STANDARD law (same turn) ──► builder briefs cite §§
     │
     ▼
family BUILDER (one per profile file, never commits)
     │  vertex-extract → author → workorder → gate ... → battery → packet → §F.4 report
     ▼
ORCHESTRATOR landing (verify hashes/gates itself → pathspec/cacheinfo commit → npm test
     │   → push → registry rows)                       [skill: land-round]
     ▼
independent CRITIC (adversarial; own renders at bracketed hashes; diff-derived
     │   changed views; verdict output in .qa-dev/)      [skill: spawn-critic]
     ▼
RATIFICATION (orchestrator re-freezes on PASS; laws fold into BUILD-STANDARD)
     │
     ▼
GRADUATION (dual gate + turntable → §10 in ONE commit → hash-frozen registry row)
                                                        [skill: graduate]
```

State lives in three places, by design re-entrant after any transcript loss:
- **packets** docs/references/tanks/<id>.md — the tank's single source of truth (rounds,
  caps, freezes, banked orders);
- **ledger** docs/geometry-gate/ledger.json — tool-written scores of record;
- **registry** docs/VEHICLE-ROSTER.md plus docs/FLEET-FREEZE-CURRENT.json —
  generated fleet state and deterministic geometry fingerprints.

Concurrency rules that make 6-8 parallel agents safe: single-owner profile files;
graduates hash-frozen (any sibling edit must prove byte-identity); FIFO for browser
tools; scratchpad snapshots instead of stashes; the orchestrator is the only committer.

---

## 4. The oracle lifecycle

1. **Sourcing** — community CC models only (docs/ATTRIBUTION.md records every asset +
   evaluation verdicts). THE ONE ABSOLUTE RULE: no commercial-game extractions, ever —
   provenance screening happens on the binary's own metadata. NC/ND/unverifiable
   licenses live in local-only quarantine (recovered/, quarantine/; strip-nc-assets.mjs
   scrubs public builds). [skill: onboard-oracle]
2. **Onboarding** — place under public/models/tanks/community/, ATTRIBUTION row,
   MODEL_SOURCE registration, vertex-extract REG, gate baseline x2.
3. **Service** — the print is the measured reference; certified oracle-defect caps
   (never dims) record where it is wrong; §B7 lets the owner rule photo-class over a
   wrong region.
4. **Repairs** — orchestrator-lane batches in repair_oracles.py (seat/rotate/warp),
   planned by vertex-normalize, verified byte-idempotent + census-guarded + gate-in-loop,
   simulated first via request interception. [skill: oracle-repair]
5. **Retirement (graduation)** — runtime registration dropped; the print stays on disk
   as the measurement oracle via the three override maps (procedural-fidelity /
   visual-evaluator-page / tmp-tank-critic); freeze verification moves to geometry hash.
   Flip-era tanks (mass registration flip c487188) were retired ahead of graduation and
   only need mirror verification.

---

## 5. Where the numbers can lie (design-level caveats)

Each of these is law in BUILD-STANDARD/GEOMETRY-GATE; listed here because they are
consequences of the architecture above:
- masks are DoubleSide but the game renders FrontSide → reversed-winding slabs are
  gate-invisible and render-invisible-from-outside (§C missing-side; winding guards).
- hull-anchored registration → dims tail anchors shift hull-row mids (counterweight
  law); short-barreled oracles cap only wholeCurves.
- station cameras render a ~0.52 m clipped slab → long axis-aligned prisms vanish
  (segment ≤0.48 m).
- the 12% body filter + p95 roof define what "counts" for dims; whips don't count for
  width, skirts do.
- the loader's min() normalization means width and height clamps can eat warps and
  oversized fittings rescale everything (probe-frame law: external probes must apply
  the harness scale factor).
- bakeDirt is bucket-local → re-parents reseed mottle → pixel-diff proofs die at camo
  buckets.
- invisible geometry still frames (AABB law) → lazy destruction kits, eager materials.
