# TANK BUILD STANDARD — the one checklist (owner-ratified laws, 2026-08-03)

Every tank ships when it meets ALL of this. Builders self-check every round;
critics carry these as standing checks; the orchestrator lands nothing that
regresses them. This file supersedes scattered per-packet law restatements —
packets cite it. If this file and GEOMETRY-GATE.md disagree, GEOMETRY-GATE.md
wins and this file needs a patch.

LIVING RULEBOOK (owner directive 2026-08-04: "consistently be editing our
generating rules and procedures as were going through this"): this file is
edited CONTINUOUSLY, not at milestones. Every owner report becomes a law
here the same turn it arrives; every round's banked law discoveries that
generalize beyond one tank get folded in at landing (the per-packet law
bank stays the raw record). Builders and critics re-read this file at
round start — briefs cite section numbers, and a brief that predates a law
never excuses missing it.

## A. Geometry (the measured gate)
- `node tools/geometry-gate.mjs --ids=<id>` — every component ≥90
  (hullCurves, wholeCurves, turretCurves, stations, dims, floaters). Min is
  the headline. Dims sovereign to PUBLISHED dims (1% grace then −8/pct).
  Certified oracle-defect caps are the only exemption, never covering dims.
- Author from `tools/vertex-workorder.mjs` ABSOLUTE world columns (gate-JSON
  `at` values are camera-frame — never author from them).
- Registration counterweight: dims anchors symmetric about the ref's own
  12%-band mid, at the ref's own band heights.
- heightM p95 budget: ≤4 side columns above published height, aligned with
  the ref's own spikes.
- PROGRAM-FRAME CHIRALITY LAW (adjudicated 2026-08-07, two independent
  critics converged — ww2-resit + type74 verdicts): the program frame
  "+x = right" is CANON for authoring, even though glTF/three.js
  (+z forward, right-handed) makes physical vehicle-right = −x. Every
  ratified digest, side registration, and verdict crop is built on the
  program frame; a fleet x-flip would invalidate all of them for a
  sub-glance cosmetic. Consequences: (1) author handed kit per the
  program frame, uniformly; (2) a spec-true direct-drop print may read
  MIRRORED next to the proc in head-on pairs — bank a "mirrored in
  program frame" note in that oracle's packet (pt91m-class), it is NOT
  a build defect and costs no acid points; (3) critics judge handed
  kit for PRESENCE + CONNECTION, not side, unless the owner orders a
  specific side. Owner may override with a fleet x-flip order
  (schedule as its own wave; re-derive digests + re-crop verdicts).

## B. Silhouette identity (owner laws — all six are gate-blocking)
1. FRONT SLOPES: follow the reference's slopes — no flat fronts where the
   real vehicle rakes (M1 glacis is the canonical example). THIS INCLUDES
   TURRETS (owner directive 2026-08-04, with photo: "all abrams have
   sloped fronts of turrets"): the M1-family turret cheek faces rake back
   steeply — a vertical/slab turret front on any Abrams is a failing
   read. Critics: check the turret leading-edge angle in side/3-4 views
   against the reference photo class, not just the mask score.
   NO STAIRCASES (owner directive 2026-08-04, with screenshot: "prevent
   this little staircase effect in our tanks. we should have smoother
   slopes"): a slope is ONE raked surface — a slab, wedge, or loft —
   never a stack of boxes approximating it. Stepped quantization reading
   at 1× is a failing read even where the mask score tolerates it. Where
   the REAL vehicle carries plate courses (armor tiers, appliqué rows),
   author the actual course lines with co-planar or chamfered joints —
   not equal-height quantization steps. Mechanism: the smoothLoft /
   chord-limited-facet machinery (m47 r8 smoothBustle lineage) + slope
   caps co-planar onto the facet (FLAT-CAP-BEHIND-A-RAKE law). Critics:
   stair-step reads on any slope are an order, on every tank.
   SLOPE MOTIVATES THE MASS (owner directive 2026-08-05: "when we have a
   slope, keep in mind its not just a plate on stuff that makes a slope,
   it motivates the whole shaping"): a slope is never a plate laid over a
   boxy core — the raked surface drives the WHOLE volume's shaping. Side
   profiles follow the glacis rake, flanks and roofs meet raked faces on
   the slope's own lines, intersecting panels continue its geometry: real
   armor is a shaped mass, not a dressed box. Failing reads: a box corner
   or un-raked flank poking past a raked front; a rake that dead-ends
   into a vertical side wall the real vehicle blends; appliqué-slope over
   a rectangular silhouette. When authoring a slope, re-derive every
   surface it touches.
2. NO EMPTY AREAS / CONTIGUITY: no hollow pockets, no see-through voids, no
   gaps between masses, at ALL angles including top-down. Turrets are
   contiguous volumes; every standoff mass reads attached (mounts,
   brackets, contact shadows). Circular geometry reads circular in plan.
   NO TURRET HOLES: top-down and 55° tilt renders show filled decks — any
   sky/background reading through the hull or turret interior is a failure.
3. DECORATION MINIMUM: roof MACHINE GUNS are MANDATORY (multiple allowed
   and encouraged; add a tastefully-integrated pintle MG even where the ref
   lacks one — critics must not penalize that as parity deviation). Dress
   flat areas from: lights, ropes/tow cables, ladders, ERA/armor blocks,
   wooden trunks, canisters, bags, smoke launchers, railings/holders,
   crates, duffels, antennas. Use `KIT` fittings (kit.js) — don't hand-roll.
   NO MYSTERY BOXES (owner directive 2026-08-05: "there are just random
   boxes that are not ERAs around armor and especially guns and those
   need to be actual proper shapes or equipment instead of just
   rectangles" — named on the merkavas, t-xx series, m1a2 sepv2): every
   box-primitive must read as IDENTIFIABLE equipment at 1×. ERA carries
   its own grammar (tile pitch, wedge/brick profile, mounting rails);
   everything else must be a named thing with its tell — a sight has a
   hood + lens, a bin has a lid seam + latches, a launcher has tubes, a
   jerry can has its cross-stamping. Bare cuboids hovering near mantlets
   / gun roots / armor faces are a failing read: replace with the real
   equipment (KIT fittings first) or delete. Critics: unidentifiable
   rectangles are an order, everywhere, especially around guns.
4. TRACK CONTAINMENT: tracks never clip through the bow/stern — wrap arcs
   stay clear of hull solids (plates, fenders, flaps). Tracks are the
   two-layer shoe system (pads + inner chain/guide horns) riding real
   wheels; no clipping, no floating bands.
   Check: `node tools/track-clip-audit.mjs --exact --ids=<id>` — the check
   is now BOTH columns per zone, `bandVox + shoeVox`, and shoeVox is the
   PLAYER-VISIBLE bar (m1a1ha lesson, owner report 2026-08-05: shoes
   glitched through the rear plates while the band test read 0/0 — the
   band is NOT the visible surface). The visible track surface is the
   instanced shoe/pad envelope riding OUTSIDE the band: instance centers
   at rOut = trackTh/2 + 0.012 off the band centerline plus 0.073 m of
   pad+grouser depth (tankFactory buildRunningGear/trackShoeGeometries)
   = +0.085 m beyond the band outer face (~0.13 m off the centerline at
   the default trackTh 0.09). A plate can clear the band and still eat
   the shoes — bandVox=0 alone proves nothing about the visible read.
   Semantics: shoeVox counts hull-candidate surface voxels ≥1.5 cm
   INSIDE the world-transformed shoe instance solids at --exact
   (near-contact margin on the default run); hidden pads (coveredTop,
   thrown sides) don't count; per-side wrap-pad meshes and full-width
   dressing buckets that RIDE the envelope by design (abrams wrap-pad
   taxonomy) are conformance-excluded and reported under
   dressingSkipped — audit the exclusions, never delete them silently.
   Bars: bandVox ≤ ~60 per zone (kv2-graduate band, unchanged legacy
   trend line) AND shoeVox ≤ ~60 per zone with 0 the target for new
   builds; a blind spot (shoeVox > 0 while bandVox = 0) is a standing
   order for the owning family lane. Fleet comparison lives in
   shots/track-clip-shoes.json (blindSpots ranked worst-first).
5. TURRET FURNITURE PARENTING (owner law 2026-08-04: "stuff in the back of
   the turrets … just stays there and isn't rotating with the turret").
   Everything that visually belongs to the turret — bustle racks, duffels,
   chain curtains, boxes on/against casting walls, casting antennas — MUST
   live under `rig_turret` so it yaws with it. Hull deck furniture the
   bustle merely overhangs stays in `rig_hull`. Both failure directions
   violate this law: STRANDED (turret furniture in hullG — static while
   the turret turns; the sepv3/merkava report) and DANGLING (hull
   furniture in turretG — sweeps mid-air on yaw; the m1a1 tow-cable
   incident). Fix by RE-PARENTING with world pose preserved at rest
   (turret-local = world − turretPivot), never by re-modelling: rest-pose
   masks, the gate, and rest renders must hold byte/pixel-identical.
   Check: `node tools/turret-parent-audit.mjs --ids=<id>` — stranded and
   dangling must be 0; `abutting` is a REVIEW tier (adjudicate on the
   render: attached-to-casting ⇒ re-parent; deck gear ⇒ leave). Note the
   audit is AABB-coarse: raised-deck hulls (kf51) false-flag deck plates
   as stranded, whole-bucket merged lofts flag on partial content, and
   below-deck ring tubs smear the casting envelope (the tool clamps the
   envelope floor to ringY−0.10) — adjudicate against source + renders,
   never blind-move. Instanced meshes are not audited; check them by eye
   at yaw. Two adjudicated classes: ORACLE-REGISTRATION-PINNED (the REF
   keeps the furniture hull-side — m1a2 works field, merkava3b/3c tail
   packs; fix is COUPLED: followers extension in the three maps + proc
   re-parent + full re-gate in one landing) and audit-artifact (document
   the negative). Graduates take the §10 graduate-change flow. RE-CERT
   BAR (merkava-b5 correction): rest-pixel-diff proof only certifies
   NON-camo-bucket moves — camo buckets bake bakeDirt mottle in the
   merged bucket's LOCAL frame, so any re-parent on a pivotZ≠0 rig
   reseeds the jitter and pixel-identity is unreachable; those take a
   full independent critic re-cert on the changed views instead.
   Floaters 100 ×2 + the yaw-90° rotating-furniture pair are required
   in every variant.
6. TRACK RUN SILHOUETTE (owner law 2026-08-04: "tracks are the shape
   \\________/ not /_____/"). Side view: the ground run is the SHORT base
   of a trapezoid — approach/departure ramps rise to RAISED end wheels at
   BOTH ends. Never a parallelogram, never a flat/curl-to-ground front.
   Author both end wheels raised per the real vehicle (idler AND
   sprocket); `buildRunningGear`'s contact tangents then form the ramps
   (contactZF/contactZR pin the patch when needed). A low-authored end
   wheel (chieftain5's idler at wheel height) violates the law EVEN WHEN
   the oracle print carries the same defect — owner law outranks oracle
   matching (M1-slope precedent): build the real ramp, measure the
   oracle delta, certify the residual in the packet.

## C. Craft laws (mask economy + render truth)
- PALE-REFUND by default on every new thin member; paired refunds at razor
  margins; pintle-gun silhouette allowance ≤0.4 gate pts/tank.
- MG PHYSICS: sky-backed guns read pale top-lit (≥2px edges, 35-45px runs,
  receiver MASS not a stick, sky silhouette); pale-deck roof guns invert —
  dark crown-riding lines.
- Winding audit on every new slab (backface culling eats reversed slabs
  from top); probe corners after compound rotations; AABB framing on
  fittings (never change the model AABB with decoration).
- TWISTED-QUAD TOOTH ROW (merkava4 r-round): a strip-fan cheek under a
  large cheekRake renders a phantom tooth row when the plan pts polyline
  CURVES — each slab quad goes non-planar, its two triangles take
  different normals, and the lit/shaded alternation reads as sawteeth
  riding the wedge. At cheekRake > ~0.2 either keep the pts polyline
  straight (per-strip near-planarity, |(C−A)·n| ≲ 0.02r) or solve a top
  height for exact coplanarity; audit every slab() whose four corners are
  authored independently.
- PARTIAL-PIXEL MARGIN (russia-tail law, supersedes the bare 15mm at
  boundaries): masks light at ANY partial pixel coverage — boundary-
  critical faces need >=2px margins (~22mm side/plan, ~9mm front).
- dALONG-SIGN: at dAlong +d the gate compares ref column Z against the
  proc window [Z, Z+2d] — rear content seats half a column REARWARD of
  raw ref reads; check the sign before authoring from seats.
- Tone work hits the ORDERED class (floor-cliff regimes) — overshoot
  inverts the law. Material splits are free where geometry is priced
  (rear-visible content below the idler-wrap line writes side-mask
  bottoms — split materials instead).
- Shadow proxies: A/B mask dumps (russia r29) show proxies EXCLUDED from
  gate masks in the current harness — but their SIZES must still track
  the real geometry (a stale spec value ran a gun proxy 1.3m long).
  Verify per-harness before pricing either way; the older 'proxies ARE
  in masks' reading is stale for the gate path.
- SHADOW-NAMED RENDER FURNITURE (leopard §B5-r16): /shadow/i-named meshes
  render in critic/game views but are excluded from EVERY measurement
  mask (fidelity baseVisible, evaluator proxy-hide, critic framing) — the
  legal mechanism for honest voids/shadow reads the masks must not price
  (e.g. a turret-ring gap). Parent them to the mass that casts them (the
  turret, not the hull) and the §B5 parent audit stays clean.
- STATION END-CAPS (uk r3): station slices render front-on with near/far
  clipping — thin axis-aligned planes paint only their end caps and VANISH
  from mid slices. Segment long thin members (fenders, guards, skirt lips)
  into ≤0.48 m chunks. Related: decals ARE mask geometry (pin them on real
  planes); keep boundary-critical faces ≥15 mm clear of trace-column
  boundaries (AA bleed lights the neighbor column); one stray body-thick
  column at a silhouette edge shifts dAlong half a pitch and smears every
  row in that view.

## D. Measurement discipline (claims law)
- Done-gates measure on the OFFICIAL rigs only: gate runs +
  `tools/tmp-tank-critic.mjs --id=<id>` pairs. Bespoke harnesses are
  diagnosis-only. Custom crops never count as verdict evidence.
- ANGLES / EXACT GEOMETRY / ROUNDNESS (owner directive 2026-08-03):
  `node tools/visual-evaluator.mjs --id=<id>` is part of the official rig
  set — critics run it EVERY visual round (same 14 critic views, camoSeed
  4242, <10 s). Any claim about edge angles/slopes (glacis-rake class),
  rounded structures (radii, arc spans, domes reading polygonal — lathe
  facet counts), or silhouette profile deltas CITES ITS NUMBERS: segment
  Δangle with its printed ± noise band, arc radius/span/fit-residual and
  facet read, per-column top/bottom deltas in world meters. Eyeball reads
  of these classes no longer count as evidence. Round evidence lives at
  shots/visual-eval-<id>/ (report.json + annotated overlay per view).
  - RIG PARITY IS GATING: a `RIG MISMATCH` verdict (yaw-proxy > 10° —
    skew flip or principal-axis break; driver exits 2) ABORTS scoring.
    Fix registration first, never score a mismatched pair (the pt91m
    yaw-180 class would have been caught before round 1).
  - Calibration (re-derive with `--selftest`): angle σ ≈ 24/len_px°
    (~0.1° on ≥1 m edges); sub-0.25 m segments carry corner bias (±4°
    floor) — a Δ below the printed noise band is NO-FINDING. Radii honest
    to ~3%; facet count ±1; `reads polygonal` requires both >1.2° tangent
    steps AND overlay-visible sagitta.
  - Coordinates in findings are PROC-frame world (comparison itself is
    self-registered per-model rig; the printed ref↔proc world offset is
    registration data, not a defect).
- Sky/air claims: MASK-METHOD (bg |px−0x151b20| maxch ≤13 + rect) PLUS
  the BLUE-SIGNATURE term (revolution-r7 critic find): a sky pixel must
  also read B−R ≥ +8 — warm near-black track-shadow (e.g. 24,22,19)
  passes the maxch window alone and inflates hole counts 5-15×. Tone
  claims: ITU-601 luma rects WITH coordinates. Banked numbers re-derive
  from current renders before re-use.
- REF-RENDER OUTRANKS ROW ANALYSIS; ref-silhouette permit; perspective-
  volume verified in hero views.
- PROBE-FRAME LAW (ariete render-scale find, 6bf35b8): the fidelity
  harness scales BOTH roots so visible-box width = spec widthM — every
  external probe/raycast must apply that factor (or decode via a
  gate-identical in-page instrument) or it reads authored coords ~1%
  off the mask and "finds" phantom columns (the ariete ±1.72 class =
  its own skirt at scaled x; the bradley procTop divergence = the same
  family). The widest authored |x| sets the factor — grid boundaries
  are shared-box-relative.
- HERO-VOID BORDER-CLIP (r12 law, now in the tool): the evaluator
  reports open border-cut chains under `borderClips`, never as holes —
  critics stop ordering geometry at them.

## E. Oracle repairs (orchestrator lane ONLY — warp law v2)
- Fresh `.bak` from committed HEAD bytes per batch (equal-tris/fewer-verts
  census mismatch = STALE-BAK signature — refresh, never patch expects
  down). Legacy recipes demote to history when the baseline advances.
- Never flat-assign `REPAIRS[id]` over an existing entry.
- Every batch verifies IN THE GATE against a stable proc build before
  commit; documented retune debts are the only acceptable regressions.
- Builders/critics REPORT normalize plans + literals; they never run
  repairs or touch GLBs.
- VLO-BAKE POLLUTION (leo2_revolution §B5-r16): recovered prints'
  `*_vlo` whole-vehicle LOD shells ride the HULL node and bake at-rest
  articulated content into every hull/whole mask (128 polluted side
  columns measured on revolution — the proc then mirrors the bake and
  the turret "fuses"). Audit any print carrying `_vlo`-suffixed nodes
  before trusting its hull rows (t64bv1 / t72* / t90* class candidates).
  When a proc build mirrored the bake, the LOD-delete repair is a COUPLED
  graduate-change: repair alone gates 0 — both halves land in ONE commit.
- REQUEST-INTERCEPTION SIM: verify candidate oracle repairs against the
  UNMODIFIED official gate math via puppeteer request interception
  (`req.respond()` serving candidate GLB bytes at the reference URL) —
  full-fidelity coupled-state verification with zero shared-file edits.
  Prove rig parity to the decimal (committed bytes × HEAD tree) before
  trusting any simulated number.

## F. Round protocol (uniform for every family agent)
1. One agent per profile file (single-owner). NEVER commit. Env:
   `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"`; own vite
   74xx-77xx; FIFO lock respected.
   FIFO HARD RULES (fleet-proven 2026-08-05): the official browser tools
   (track-clip, turret-parent, standard-check, visual-evaluator,
   tank-critic) SELF-TICKET the FIFO — NEVER wrap them in an external
   lock hold (wrapping deadlocks the fleet; two independent jams proven).
   Tickets are 15-digit zero-padded — any other width corrupts the FIFO
   sort and queue-jumps. Under heavy contention official runs can die at
   the tools' 30-min queue timeout: retry honestly, never jump; for
   render batches hold ONE ticket with a batch driver on the identical
   render path (tmp-b1b3-critic-batch.mjs pattern).
2. Graduates in your file are HASH-FROZEN: verify with
   `node tools/tmp-hashgeo.mjs --ids=<graduates>` before reporting;
   shared-helper edits are opt-in params with byte-identical defaults.
   Do-not-gate list: m60a1, m60a3, kv2.
3. Every round ends with: gate line ×2, standard-check clean
   (`node tools/tank-standard-check.mjs --ids=<id>`), packet round section
   WRITTEN (landing law — orchestrator writes a landing note if missing,
   and that costs the round a discipline flag), shots under shots/<round>/.
4. Report format: per-tank before/after components, per-order done-gates
   with official-rig measurements, honest residuals, worst remaining
   columns, graduate hash proof, law discoveries for the bank.

## G. Definition of DONE (unchanged, dual gate)
Geometry ≥90 every component + independent critic ≥9.0 EVERY view (same
vehicle, same tier) + turntable eyeball + graduation per GEOMETRY-GATE.md
§10 in the same commit. Any geometry edit invalidates a prior critic
verdict.

## H. RIG STANDARD (owner directive 2026-08-03: standard + family rigs)
Tanks are built as RIGS, not bespoke mesh piles. Three layers:

1. **BASE RIG** (KIT layer, kit.js): every tank exposes the same skeleton —
   hull loft (station-profile driven), running gear (wheelZs/wheelR/idler/
   sprocket + the two-layer track system), turret ring + yaw pivot, gun
   assembly (trunnion/mantlet/tube/muzzle) with elevation pivot, fittings
   mounts (KIT.fittings consumers), family material slots. The gate's
   articulation poses and the game's damage/recoil systems assume this
   skeleton — a build that fights it is wrong even at 90+.

2. **FAMILY RIG** (one per family file): similar tanks SHARE one
   parameterized rig — abrams varieties (m1a1/m1a1ha/m1a2/tejas/tusk/
   abramsx/sepv2), leopard varieties (leo2a4/a5/a6/a7/a7v/revolution/
   proto), merkavas (1b/2b/2d/3b/3c/3d/4/4b), t-series lineages
   (t54/t62/t64/t72/t80/t84/t90 chains), pattons (m26/m45/m46/m47/m48/
   m60s), centurions, IS-line. A variant is a PARAM DELTA on its family
   rig (dims, turret planform, skirt/ERA kit, fittings selection, era
   dressing) — not a new loft. Litmus: adding the next variant of a family
   should be <150 lines of params, not a re-author. The t80/t80b/t80bv
   batch (russia r25) and merkava_batch4() are the live exemplars.

3. **MIGRATION RULE**: graduates are hash-frozen — they adopt the family
   rig ONLY inside a graduate-change round (fix → gate hold → critic
   re-cert → re-freeze, one commit), never as a side effect. New builds
   and rebuilds go through the family rig from birth; a family's first
   rig-conformant build defines the rig (document its param surface in the
   family packet). Orchestrator schedules rig-consolidation rounds per
   family once ≥2 variants pass the gate.

4. **VARIANT VARIETY (owner directive 2026-08-03)**: sharing a rig must
   NOT mean looking alike. Every variant in a family carries a DISTINCT,
   era/mark-appropriate loadout — different MG arrangements, stowage
   selections, ERA/appliqué kits, antennas, lights, dressing — such that a
   player can tell any two family members apart in the garage at a glance.
   Reference truth first (each mark's real distinguishing kit), then
   FITTINGS variety within the decoration law. Critics carry a standing
   VARIANT-DISTINCTIVENESS check whenever a family has ≥2 built members:
   name the tells; 'same tank re-badged' is a failing read. The t80 line
   (B brow applique, BV K-1 cheeks) and the abrams variety round are the
   exemplars.

## I. KIT.fittings usage (§B3/§B4 workflow — kit-fittings round)
Decoration is a WORKFLOW, not per-tank authorship: use
`KIT.fittings.<fn>` (src/vehicles/profiles/kit.js) — hand-authored
decorations need a packet justification.
- Library: `pintleMG` (M2/DShK/NSVT/MAG classes, tone
  'two-tone'/'pale'/'dark' per MG PHYSICS deck polarity, optional AA ring /
  ammo / shield), `stowageRack`, `towCable`, `jerryCans`,
  `spareTrackLinks`, `lightCluster`, `smokeBank`, `antennaWhip`,
  `unditchingLog`. All deterministic (seed param, no Math.random), material
  slots come from the caller's own family mats.
- Call pattern (in a profile builder):
  `import { KIT, FITTINGS } from './kit.js';`
  `const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2' });`
  `mg.position.set(x, roofY, z); P.turretG.add(mg);`
  (`KIT.fittings` is the same object on every runtime path; the `FITTINGS`
  import is the spelling that also survives synchronous top-level
  createTank rigs — kit.js evaluates inside the tankFactory module cycle,
  see the attach-site note in kit.js.)
  Anchor the WHOLE stamped envelope (`group.userData.aabb`) INSIDE the
  hull/turret AABB — fittings must never change the model AABB (§C).
- Census (§B3 machine check): every fitting mesh carries
  `userData.fitting`; `node tools/tank-standard-check.mjs --ids=<id>`
  requires mg ≥ 1 fitting instance and reports the dressing count, plus the
  §B2 top-down hole scan (0 enclosed cells). Hand-authored decoration
  censuses ZERO — migrate it or justify it in the packet.
- Library self-test: `node tools/tank-standard-check.mjs --fixture`
  (marker coverage, AABB stamp, seed determinism, top-down winding).

## J. Critic-lane laws (banked 2026-08-05, abrams+revolution re-cert wave)
- YAW-PAIR EVIDENCE IS HASH-STAMPED: a builder's rest/yaw90 proof pair is
  only valid at the hash it rendered; graduation/re-cert critics re-render
  the yaw pair at the verdict hash.
- PAIR-PNG LABEL BAND: flood/sky tooling on critic pair PNGs must exclude
  the REFERENCE/PROCEDURAL label band (y 13-21) — letter counters read as
  enclosed sky under the mask+blue-signature method.
- DE-BAKE CONTRAST WINDOW (§E corollary): dropping a vlo bake opens honest
  dark windows — previously-certified adjacent furniture inherits a new
  high-contrast read; any vlo-drop round re-audits furniture bordering new
  shadow windows even where its bytes did not change.
- YAW-PROOF STATIC-PIXEL FALSE-FLAG: rest-vs-yaw90 pixel diffs flag
  same-camo turret faces as "static" inside the ring zone; adjudicate
  against a rig_hull/rig_turret vertex census (instanced meshes included)
  before ordering geometry.

## §D addenda (russia tail-3, 2026-08-05)
- PROBE-FRAME AUTHORING LAW: the §D width-normalization factor bakes into
  AUTHORING — any build whose widest authored |x| exceeds the width anchor
  scales every coordinate (~1% inboard/short seats, dead ground columns,
  short hullLengthM). Keep the width-defining face AT the anchor: scale
  1.0, authored = world.
- AA-TEETER FAMILY: ref bands whose edges sit on column-window boundaries
  flip reads run-to-run as the shared box drifts; only >=2px-from-edge
  authoring is stable — single-run reads of such columns are NOT orders.
- STATION RE-PHASE COROLLARY: hullZRange span changes re-phase all 14
  slices; post-span-fix station drops are re-decode artifacts first.
- DIMS RAZOR-BAND: a body column hovering at the 12% threshold coin-flips
  dims ±8 pts — pin end columns with hard cross-section faces.
- BG-TOLERANCE DARK-TRACK BLINDNESS (§J addendum, m1a2 re-cert): mask
  diffs with bg tolerance maxch<=13 cannot see the 0x171614 track tone —
  pale dressing added there reads as false "silhouette growth"; decompose
  render diffs against changed stations before pricing.
- Record the pixel-diff threshold alongside banked px counts (t>4 vs t>2
  reads ~30% apart on identical bboxes).

## §C addendum — INVISIBLE-LOD ENVELOPE law (owner task, 2026-08-05)
Invisible meshes still carry world AABBs (Box3.setFromObject, icon
framing, probes, hashers all include them). State-gated visuals
(destruction kits, retracted gear) are built LAZILY at the state
transition — never parked hidden at their triggered pose; the rest scene
graph carries no geometry outside the visible hull envelope
(tools/tmp-lod-envelope-probe measures it). Corollaries: "invisible at
LOD0" is not proof of LOD1 geometry (lodWrap LOD1 levels are empty by
design); keep MATERIAL creation eager when deferring construction
(material ids are a draw-sort key — deferred clones renumber and break
pixel identity).
- DEEP-SHADE ALBEDO CLAMP (§J addendum, revolution r17): zero-variance
  dark zones (p10=p50=p90) are shadow reads — tint work provably cannot
  move them; critics check percentile spread before ordering mottle.
- BURIED-FURNITURE PROBE FALSE-ATTRIBUTION: world-box probes name
  occluded geometry; decode screen rects with the critic's own projection
  and verify tells by pixel-diff before dressing.
- BAKE-MIRROR NARROW-NOT-DROP: when one row read of a bake-mirror is
  real, narrow it to its witness column instead of deleting.
- LIVE-TREE FROZEN-SIB HAZARD (§F addendum): foreign shared-module WIP
  moves every family hash — clean-room worktrees are the honest frame for
  freeze proofs; handover sweeps can commit mid-round builder snapshots.
- PER-ROW BODY-FILTER / REGISTRATION-COUNTERWEIGHT LAW (§D addendum, m26
  r3): the 12% body filter uses each row's OWN rough — a dims tail anchor
  fat for side_whole is automatically fat for side_hull and shifts the
  hull-row registration mid; hull reg pins whole+turret (0.05 dAlong cost
  6 turret pts). Counterweight the HULL-row body symmetrically so proc
  mids == ref mids on every row.
- Station-boundary bumps >=10mm clear of slice boundaries (9mm slivers
  read full width). Shoe pads extend wrap faces +0.05-0.08 beyond
  r+CLEAR+TH/2 — seat end wheels by vertex probe.

## §B7. OWNER REF-WRONG OVERRIDE (owner ruling 2026-08-05, leo2_revolution turret)
When the owner rules a reference region WRONG ("the revolution turret
looks terrible because its source material is wrong — make it more like
the actual tank"), the REAL VEHICLE (photo class) governs that region,
not the print. Mechanics: (1) author the region to the real vehicle's
documented configuration; (2) the gate keeps recording honest rows — the
divergence is certified in the packet as an OWNER REF-WRONG cap (region,
rows, measured cost, owner quote + date); caps never cover dims; (3)
critics score the overridden region against the real-vehicle photo class,
ref parity applies everywhere else; (4) the override is per-region, not
per-tank — uncontested regions still chase the print; (5) prefer
mask-free real-vehicle reads first — spend gate points only where the
real configuration demands it.
- TURRET-FLIP CENSUS FRAME (§E addendum, batch-43): a print's TurretMesh
  content can render PI-YAWED about the turret pivot vs raw glb coords
  (loader rest-yaw) while the Gun subtree does not — glb-frame censuses
  map to gate meaning with x AND z negated for the turret node only.
  Attribute by station ownership before excising (the "fore strip" that
  owned st12 was the rotating bustle tail plate).
- DEGENERATE-SLIVER MASK CARRIERS: one zero-area triangle can carry
  double-digit gate points (a 3v/1t sliver held 34.6 turret pts on
  revolution). Component censuses must list 1-tri components, and
  oracle-excision rounds check them FIRST — they are free wins with
  differential-sim proof.

## §B3.1 GUN-ASSEMBLY ACCURACY (owner directive 2026-08-06: "sepv2 and
sepv3 and the merkavas have those really ugly gun rectangular prisms and
dont look accurate" + "many of the russian tanks have those weird
rectangular prisms that dont emulate actual armor or equipment")
The GUN ASSEMBLY itself is never a prism. Tube = cylinder; thermal
sleeve = larger cylinder with clamp rings; bore evacuator = the real
weapon's bulged sleeve at its real station; muzzle = the real brake/
reference collar; mantlet = the real casting/shroud shape (M256 boxy
shroud has RAKED faces, MG253 sits in a recessed collar, Russian 125mm
carries its distinctive mantlet boot). A rectangular prism anywhere on
the gun run is a failing read at 1x. This extends §B3 (equipment
grammar) to the weapon: author from the real gun's photo class, not
from mask convenience. Critics: prism reads on any gun run are an
order, on every tank, priority equal to a silhouette break.

## §B1.1 CHEEK SYMMETRY (owner directive 2026-08-06: "left cheek of all
abrams have weird rectangles instead of the correct slopes")
Both turret cheeks carry the real vehicle's rake — asymmetric detail
(sights, MG mounts) rides ON the raked plane; it never replaces the
plane with stacked rectangles. Failing read: a correct right cheek and
a boxy left cheek (or vice versa). Critics check BOTH cheeks in both
front-quarter views on every tank.

## §C addendum — MISSING-SIDE CLASS (owner report 2026-08-06: "ariete
and leclerc are missing left side of turrets")
Side masks image ONE side: a missing/reversed LEFT surface is invisible
to every side row and can survive to high gate scores. Mandatory checks
on every round: the §C winding audit + a LEFT-side render (or yaw-180
pair) compared against the right. A missing side is a §B2 void — gate
score is no defense.
- MISSING-SIDE MECHANISM DECODED (§C, misc left-side round 2026-08-06):
  mirror loops (`for s of [-1,1]` with x*s and no corner re-order) hand
  slab builders the OPPOSITE ring handedness — all six faces point
  inward, the solid is backface-culled in every FrontSide render (game,
  critic, standard-check) yet stays FULLY VISIBLE to the gate's
  DoubleSide mask material. The gate structurally cannot see this class.
  Device: an orientedSlab wrapper (face-outwardness census, re-orients
  reversed rings) — bind slab through it in every profile that mirrors.
  Known carriers still open: t80u (1), type90 (4+1), type74 (1+1).
- LOADER HEIGHT-CLAMP KEYING (§E, fv510 batch-44): modelLoader scales by
  min(len, width*1.08, height*1.30) — mast-heavy prints bind on HEIGHT
  and a pure z-warp is normalized away until a y-knee releases the
  clamp. Verify which min() term binds before authoring any warp; judge
  warps by ROW terms (mean/p95/cover/safeScale), never the 0-floored
  headline (curve score = 100 - 12*mean - 0.6*p95 - 1.5*cover: the 12x
  mean term floors short/shape-divergent prints at 0 regardless).
- Mirrored-slab winding guards are now per-profile devices: orientedSlab
  (misc.js) / sslab (uk.js) — every profile that mirrors slabs binds
  through one (§C missing-side law).
- INSCRIBED-DRUM CONVERSION CLASS (§B3.1, russia sweep): box->cylinder
  (r = w/2, axis-extreme) and box->elliptical-frustum swaps keep side AND
  plan mask rectangles identical — the free §B3.1 conversion; reach for
  it first on every prism. Corollaries: RING-CLIP (boot collars under
  cover slabs clip to the tube's front silhouette or corners poke);
  proud face-relief on certified rows is never free (flush or pay).
- ROUNDED-RECT CARRIER COMPOSITION (§B3.1, merkava gun round): de-prism a
  mask-certified box with flat cardinal carrier slabs on the certified
  extents + corner cylinders (AA-identical silhouette edges; corner
  rounds inset by the box bevel radius). Corollaries: the 45° SHOULDER
  ZONE of any convex round member is interior to both masks — dressing
  there is free; FLOATER-BY-BRIDGE (standoffs can idle under the island
  threshold bridged only by a neighbor's corner — audit helper-placed
  fittings per mark); island hunts run at GATE resolution (384px masks
  dilation-bridge gaps the 1024 gate keeps open).
- CYLINDER-AT-PRISM-ENVELOPE (§B3.1, abrams round): an elliptical
  z-cylinder at the box's half-extents produces byte-identical side/plan
  columns — the free swap wherever the front view is interior. GATE-GRID
  SPAN LAW: the gate's 96 columns end short of extreme tail content —
  verify grid membership before spending on workorder-only columns.
  SCORE SATURATION: err-9 only-proc columns dominate a row; when an
  uncertified only-proc class saturates, the CERT is the ceiling driver
  — file the cert extension, don't chase columns.
- CHANGED-VIEW LISTS ARE DIFF-DERIVED (§J, merkava gun re-cert): builders'
  occlusion reasoning under-lists — derive the critic's scoring contract
  from actual per-view pixel diffs. §B2 FLOOD-DELTA METHOD: fresh-vs-
  baseline enclosed-px per view separates new holes from banked censuses
  (delta-0 under a localized change = the clean re-cert signature).
  ROUNDED-RECT SEG floor: facet sagitta < 1 px at the largest critic zoom
  is the machine check for "no polygonal read".
- TONE-ROUND CRITIC TRIPLET (§J, revolution r19): self-colored-unit
  homogenization reads as p90 down + sd down with med free — read the
  triplet, not the med. Re-cert diffs spanning an oracle-repair landing
  decompose per pair-half before attribution. Flood delta-0 doubles as
  the whole-frame no-regression oracle for tone-only rounds.
- ENVELOPE-SWAP SIDE-READ (§B3.1 corollary, abrams re-cert): cylinder-at-
  prism-envelope conversions are silhouette-invisible in the preserved
  projections — critics judge them by shading gradient + ring grammar,
  not silhouette. CHIN-STEP ADJUDICATION (§B1.1 corollary): certified
  column bottoms pinning a stepped chin under a raked cheek always flag a
  horizontal-vs-chamfer delta — adjudicate against the packet constraint
  first; one constraint ledge is not the colonnade class.

## §B3.2 DECORATION DENSITY (owner directives 2026-08-06, with screenshots)
"add far more of these decorations on ALL abrams" + russia: "the most
common decorations still need to be modelled and added, and many more
machine guns of all varieties or automated machine gun emplacements".
§B3's minimum is now a DENSITY mandate: real vehicles are BUSY — every
tank carries its type's full common kit (lights + guards, mirrors, tow
cables + shackles, jerry cans, stowage bins/baskets LOADED, antennas,
straps, spare track links, tools) and crew-served weapons at real
density: MGs of all varieties (pintle, coax port, loader's, bow where
real) AND automated emplacements (CROWS/RWS with sensor heads) where the
mark carries them. Variant kits are REAL SYSTEMS: TUSK = ARAT ERA tiles
+ loader shield + TIP + slat + urban lights; SEP kits ride the family
base build (owner: sepv2/sepv3/tusk are "based off of our existing m1a1
abrams with the extra armoring and ERA and urban survival kit").
- STATIC-VS-MOVING-CHAIN (§B4, leopard shoe round): the wrap "inner
  void" is fiction — the shoe inner-chain (connector rails radial
  ~0.13-0.40 off wheel centers, guide horns, caps) SWEEPS it as tracks
  scroll; static furniture inside a wrap clears the component
  deep-windows, not the band. Drum-face rim rings sized to the drum are
  the standing carrier class. PROJECTION-PRESERVING SPLIT: an inboard
  x-sliver (side mask x-invariant) + a thin outer-z plate (plan/front
  faces exact) clears 3D shoe overlap with zero mask movement.
  Thin-component exemption: boxes with any dimension < 2x the depth bar
  cannot carry it — deep-window math skips them.
- COMPONENT-MASK FREE-LANE LAW (§C, russia density round): the
  "turret-shadow deck lane" does not exist in the hull-only mask — a
  proud deck rack costs hull AND shears registration. Hull-mask free
  lanes are: flush-recess to the deck polyline, nesting inside certified
  bump envelopes, or sub-line side cover. MATCHED-ENVELOPE MG SWAP:
  FITTINGS.pintleMG reproduces hand receivers within 4mm — droop longer
  barrels under local crests. COAX-PORT CLASS: flush ports inside
  scaled-ellipse mantlet rectangles are invisible to every mask.
- §B4 STERN-RESUME (abrams density round): a laneCarve window ending
  short of the tail-rake end deletes the outboard tail — hull builders
  resume full width behind the window. Corridor-annulus: LC.x closes to
  <=3.5cm of the band inner face or the gap reads as top-down sky.
  WF-SPLIT REGISTRATION ASYMMETRY: identical deck dressing can be free
  on one variant and cost another (works-mask absorption vs bare-deck
  registration) — bisect per variant. FLOOD IS BLIND TO WINDING:
  reversed slabs read as open background, never enclosed holes — renders
  are the witness. §H.4 corollary (owner check 2026-08-06): weapon kit
  is NATIONAL grammar — US marks read American (M2HB jacket collar +
  spade grips + hung can, M240 gas tube, CROWS sensor cluster), Soviet
  marks read NSVT/Kord; critics flag cross-national silhouettes.
- WIDTH-GUARD-BY-DRESSING (§D, leclerc front round): ONE proud fitting
  past the width anchor rescales the whole build (a 4cm guard post cost
  dims 100->53.6) — every fitting respects the anchor. RNG-STREAM
  STABILITY: inserting stowage() entries re-jitters every later priced
  bag — append at stream end or hand-stamp. EULER-COMPOSED FITTINGS:
  rx/ry-only helpers cannot reach vertical faces — check the composed
  frame. AA-SLIVER OWNERSHIP: a millimeter face kiss can own a column —
  re-own such lines with honest geometry, not deletion.

## §E addendum — ORACLE PROVENANCE (2026-08-06, base-21 wave)
Embedded `asset.extras` license/author is a STARTING point, never proof.
Before an oracle instruments a gate, check the LIVE source page:
description text (e.g. "from War Thunder"), tags (warthunder,
world-of-tanks, createdwithai), and the uploader's history. Three of one
eight-file wave failed: one confirmed game rip (deleted from the repo —
THE ONE ABSOLUTE RULE), one from an adjudicated rip-posting account
(quarantined to the gitignored candidates area pending owner
adjudication — held, not destroyed, absent per-asset evidence), one
AI-generated (kept but never registered: measurement-unusable). A
refused oracle NEVER writes a ledger row — a registration that cannot
load times out at 150 s and taxes every later fleet run, and the row it
would leave is a FALSE-0.

## §B2 CLARIFICATION — HOLES, NOT CHANNELS (owner ruling 2026-08-06, with
## screenshot; reverts gear r8/r8b)
Owner verbatim: "all tanks have this terrible gray rectangle under the
tanks - this is completely wrong ... when i talked abotu space under
slopes, i met having hulls not have holes, not just willy nilly filling
in space." The §B2 no-empty-areas law means the HULL VOLUME is closed —
you never see through a hull or into an unmodeled interior. It does NOT
mean the open air between the track runs gets filled: the ground
channel, wheel-train daylight, and under-sponson air are REAL on the
real vehicles. A factory-wide belly slab is the wrong mechanism twice
over — it curtains the running gear from the side (owner's gray
rectangle) and it breaks the §D width anchor on narrow-track builds.
The right mechanism is PER-TANK authored hull geometry: real belly
plates at the real height, sponson undersides, closure panels INBOARD
of the band inner faces (the ww2-lane channel-pan class, ±3cm clear) —
authored where the real tank has metal, never where it has air.
- FITTINGS-IMPORT-ONLY (§B3 mechanics, slice-3): extension-module
  builders use the top-level `import { FITTINGS }` — there is no
  kitFittings(); KIT.fittings attaches post-init via microtask; and an
  extension module as import ENTRY throws kit.js's TDZ spuriously —
  smoke-load via tankFactory.js. SWEPT-PLANAR CORE (§B1): behind
  plan-swept raked cheeks an axis-aligned core pokes the rake or opens a
  top-down valley — author L/R half-slabs with vertical front faces on
  the cheek top-rear edge line. CHEEK-APEX GLACIS SEAT: apex overhang
  floats over the raked plane — sink bottom rings interior (-0.08
  class). ERA-DEF/GEOMETRY COUPLING (§D): re-anchoring ERA-carrying
  geometry moves the era-kind armor defs in the SAME edit. Hash
  invariance pairs must be back-to-back at one tree state.
- ORIENTATION-ASSERT ADJUDICATION (§D/§E, onboarding wave): the glacis
  deck-descent heuristic misfires on hulls whose rear deck tops the bow
  run and on prints whose turret followers pollute the hull partition —
  a mismatch is a FLAG for deck-corner vertex adjudication, never an
  automatic block. PHOTOGRAMMETRY OUTLIER CRUSH: stray scan points
  inflate accessor min/max and every loader-parity consumer silently
  crushes the model — §E outlier-strip + min/max rebuild is MANDATORY
  before a scan oracle registers. DIMS-DATUM CLASS: when proc AND oracle
  both read mast-inclusive p95 above the published roof datum, a dims-0
  row is a datum-reconciliation work order, not a shape defect.

## §B3.1 addendum — MUZZLE BORE (owner directive 2026-08-06, with
## screenshot: "make tips of guns have holes, bruh")
No gun ends in a solid capped tip. Every muzzle face carries a visible
BORE: an annular rim at tube radius + a near-black bore disc recessed
2-4 cm inside the tube at ~0.55-0.70x tube radius (gunDark/void tone,
never camo). Muzzle BRAKES bore through the brake front face (and the
real side baffle windows already carry §B3.1). Reference collars/flash
hiders keep their rim grammar with the bore visible through. The disc is
interior to the tube silhouette by construction — mask-neutral from
side/plan; end-on it is the read the owner ordered. Applies fleet-wide:
MBT main guns, howitzers, autocannons (30/35mm — smaller disc), RARDEN,
MG muzzles at their scale (M2/NSVT get pinhole-class dark tips, not
drilled geometry). Graduates take the graduate-change flow (close-front
family views change).
- AO-WALL END-FACE CLIP CLASS (§B4, ww2 trio): factory layered-gear AO
  walls ending inside both wrap discs merge into a center-crossing clip
  candidate — end walls clear of the wrap poles (z ±2.50 class).
  RX-SIGN GENERALIZATION (§B1 mechanics): glacis furniture tilts are
  plate +rake / drum -(pi/2 - rake), derived per plate angle; aimed
  items (headlights) may keep aim on a riser — per-item judgment.
  FRUSTUM-BOTTOM-STRIP: silhouette-preserving split at the ramp line
  clears side-band bottoms from wrap sweeps.
- MUZZLE-BORE MECHANISM (§B3.1, leclerc round — MANDATORY for the fleet
  sweep): bucket-based bore rims grow the gun AABB ~3cm and re-frame the
  turret-row cameras (-6.2 measured) — implement bores as SHADOW-NAMED
  gun-group furniture (the misc.js muzzleBore() helper pattern: dark rim
  torus + mats.shadow recessed disc parented to P.gunG) — renders in
  game/critic, excluded from every mask AND framing recipe; gates
  byte-identical by construction. Corollaries: HARNESS-HIDES-SHADOW-NAMED
  (evidence tooling must re-show shadow-named nodes for crops);
  FITTING-CAP TAIL (whatsat the fitting AABB per slot before seating);
  KIT.torus lies flat (rotate for vertical rings).

## §C.1 RENDER-TRUTH CHECKER (owner order 2026-08-06, t72b3m screenshot:
## "many parts of the turret that should be part of the turret are not
## there... we need checkers to make sure there arent erroneous stuf
## like this")
The gate CANNOT see this class (DoubleSide masks) while players CAN (the
game culls back-faces): reversed-winding pieces score perfectly and
vanish in game. A FLEET-WIDE official winding/render-truth audit is now
law: FrontSide-vs-DoubleSide comparison per tank across views (the
tmp-misc-leftprobe pattern promoted to an official tool), reporting
reversed/mixed slab counts + per-view pixel deficits, ranked worst-first
— run at every round close like track-clip. Named carriers at order
time: t72b3m (graduate! gate 91.8 while the game shows a bare turret),
challenger-line. Every profile binds mirrored slabs through a winding
guard (orientedSlab/sslab class) — this is now a standing §C check, not
a per-incident fix.
- §C.1 CORRECTION (owner, same day): the t72b3m case is §B5 YAW-STRANDING,
  not winding — "i rotate my turret and a lot of stuff that should be
  moving with it especially in back doesnt." The turret-parent audit reads
  0/0/0 on it, so the strands live in the audit's BLIND SPOTS (instanced
  meshes — ERA tiles — are not audited; merged-bucket AABB false
  negatives). The checker therefore gets a SECOND MODE: YAW-STRANDED
  pixel audit — render rest vs yaw-90/180 FrontSide, diff the turret
  footprint, flag mass that fails to rotate (instanced included). Both
  modes are standing round-close checks.
- §C.1 CHECKER LANDED (tools/winding-audit.{html,mjs} — official,
  self-ticketing, --check exit-codes): mode 1 winding census (mesh-level
  edge-balance + signed volume is AUTHORITATIVE; slab call-sites are
  hints only) + render deficit (FrontSide-vs-DoubleSide, the catch-all);
  mode 2 yaw-stranded (rest/90/180 plan diffs, per-pixel surface-height
  gate at ringY+0.20 — the DECK-AT-RING law — flat-id attribution,
  coincidencePx per §J). Standing classes: LATENT REVERSED-CORE
  (deficit-0 inside-out solids — HARD when render-visible), CASEMATE
  mode-2 by-design (coincidencePx 0 signature). Run at round close like
  track-clip; fleet baseline banked shots/winding-audit-fleet-20260806.

## §B8 OWNER ACCEPTANCE BAR — PROPORTIONS FIRST (owner directive
## 2026-08-06, with garage screenshot)
Owner verbatim: "i genuinely wont accept any tank that came from old era
and looks like this. it just doesnt look like a tank. honestly i dont
know how the puma or type 89 passed the bar, the propertions are wrong
and just dont look like their references." RULINGS: (1) builder
SELF-READS are NOT an acceptance bar — every photo-class/no-oracle build
requires an INDEPENDENT photo-parity critic verdict before it counts as
delivered (the same severity discipline as graduation critics); (2)
PROPORTIONS COME FIRST: before any detail work, the build must match the
real vehicle's gross form — hull length:width:height ratios vs published
dims, turret mass/position/size relative to hull, gun bore-line height,
wheel count/diameter/spacing, silhouette at a glance from 4 compass
views. A critic scores proportions as a GATING sub-verdict (proportion
FAIL = round FAIL regardless of detail quality); (3) the acid question
on every view is the owner's: "does it read as the real tank" — not
"is it decorated." Applies retroactively: all 2026-08-06 photo-class
landings (puma, type89, k2, type99a, ww2 trio, leo2a4, challenger2, t14,
leo2a7v, fv510) are DELIVERED-PENDING-CRITIC until adjudicated.

## §B3.1 addendum — MANTLETS MANDATORY (owner 2026-08-06: "make sure all
## tanks including russian tanks have mantlets" + "type 90 needs a
## mantlet")
Every gun run carries its REAL mantlet/gun-shield mass at the turret
face — the cast collar, boot, or shield the actual vehicle mounts (§B3.1
grammar; russian marks: the boot/collar classes from the prism sweep;
japanese type90: its distinctive flat armored mantlet plate). A bare
tube exiting a turret face with no mantlet mass is a failing read
fleet-wide. Critics: check every tank's gun root.

## §D addendum — SCALE/SIZE TRUE-UP (owner 2026-08-06: "make sure to
## scale and size tanks correctly, i think type 90 is too small")
dims=100 only proves the build matches ITS SPEC — the spec itself can be
wrong, and cross-tank scale reads in-game are the check the program
lacked. Standing audit: per tank compare spec dims against published
real-vehicle dims (type90 first: verify width/height/length vs the real
3.43w x 2.34h x 9.76 overall) AND eyeball garage lineups for relative
scale. Spec true-ups are orchestrator-lane, verify-first.

## §B8.1 PROPORTION GATES (from the 2026-08-06 acceptance slate — 0/12
## passed; envelope-parity is FALSE COMFORT: all 12 matched pub dims
## within ~4% and all failed the glance test)
Measurable gates, checked BEFORE detail (detail cannot rescue form —
freeze decoration until these pass):
1. WHEEL EXPOSURE: per-family exposure fraction (real 40-70%); "can't
   count the wheels in the left view" = auto-FAIL (9/12 failed this).
2. GLACIS PLANE: brief carries glacis run + nose-height TARGET NUMBERS —
   spec anchors the nose z but nothing else constrains the plane (8/12).
3. TURRET SHAPE LINE: face height + roof plane + one falsifiable
   family-shape line (drum vs wedge vs cast dome) — footprint ratios
   pass while the grammar is wrong-family (5/12).
4. STRUCTURE-MERGE ALARM: turretMass length > ~55% of hull length =
   alarm (the a7v read 77% and swings at yaw — also the §C.1 INVERSE
   case: the yaw checker flags turret-footprint mass OUTSIDE the ring
   envelope).
5. GEAR PATTERN: encode the arrangement (HVSS pairs, Tiger interleave,
   Christie spacing), not the count.
6. The four-box probe (overall/hull/turret/gun + rig_muzzle boxes vs
   targets) is a standing round-close check for photo-class builds.
- REGISTRATION-ANCHOR LAW (§D, t90m round): body-span-extreme edits shift
  dAlong half a column and INVALIDATE every prior digest target — freeze
  the span extremes first, or re-derive all targets after any end edit.
  TEETER CO-LOCATION: teeter columns cluster at shared grid phases —
  fix them as a family. VERTEX-SCAN BLINDNESS (§C): world-box vertex
  scans cannot attribute merged/instanced content — AABB census +
  fitting tags are the attribution tools.
- STATION WHOLE-SLAB LAW (§D, moderns round): station slices render the
  WHOLE model per z-slab — turret-rear masts own hull-station tops; only
  the 2-slice trim absorbs a print's antenna spike. EXTRACT-FOLLOWER
  POLLUTION: extract hull rows include turretFollower content — author
  hull rows from the LIVE workorder, never extract hull curves.
  END-DRUM TUCK vs SPONSON (§B4): re-tucking end drums raises shoe
  orbits into full-width deck bands — split bands wrap-safe (spine +
  sponson floors + outer walls) BEFORE drum re-seats. DECAL FLOAT =
  PHANTOM COLUMN (§C): unpinned decals read as silhouette columns —
  asymmetric top reads are the tell.
- FLAT-SLAB GLACIS BUG (§B8.1 gate-2 mechanics, IFV rework): a "raked
  plane" authored with BOTH frustum rings spanning the full bow z is a
  flat slab with a near-vertical face — author bottom-ring-at-nose /
  top-ring-at-crest so the front face IS the plane; check ring spans on
  any one-plane claim. GLACIS-FURNITURE rx SIGN: descending-toward-+z
  planes take POSITIVE rx for flush plates. §B4 budgets clear the
  SHOE-STACK envelope (pin caps included), not the band apex. GATE
  FLOATERS = projected islands: stalked furniture needs >=10px-projected
  brackets at gate resolution.
- SHADOW-TONE PHYSICS (§C, revolution gray fix): raw-clone shadow
  furniture renders unmovable black (no ambient floor — rehook before
  grading); grade DIRECTION is physics (top-dark under overhangs,
  bounce-lit at the deck); and NO TONE PASS RESCUES AN OVERSIZED VOID —
  a 0.4m band needs real geometry (§B7 apron) + an honest slit.
  FITTING-CAP heightM p95: wide-span roof fittings own the p95 across
  columns — whatsat the fitting AABB before seating roof weapons on
  published-height builds.
- DETAIL-SLOT LOUD-CARRIER (§C, t90m adjudication): the mats.detail
  default is wheelTone-coupled TAN — profiles hanging large equipment on
  it must retint/re-bucket (t72b3m did; t90m's drums did not).
  INTERIOR-READ TRIAD: wheel exposure, hatch rings, and equipment tone
  are mask-invisible — §B8.1 wheel-countability applies to ORACLE-BACKED
  graduations too, judged vs the oracle render on every side pair.
  HASH-IMPL PINNING: tmp-hashgeo's float64-saturating FNV defines the
  recorded hashes — byte-identical arithmetic or no comparison.
- NATIVE-TONE SCORING (§B8.1 gate-1, leopard resit): equalized crops
  rescue tonally-dead geometry — the a4's "buried" wheels were exposed
  inside an ambient-black void; score wheel-countability at NATIVE tone.
  MID-GRAY FLAT (50-58) is pipeline-endemic and distinct from the
  owner's <=35 zero-variance defect class; dark camo patches mimic the
  signature (organic fill + paint-edge context separate them). Bore
  crops are excluded from rectangle verdicts.
- TONE-SLOT MECHANICS (§C, t90m r8): REPAINT-REGISTERED SLOTS
  (wheels/wheelsDark/detail) ignore retints — dead code; the AMBIENT
  FLOOR pins hooked vertical faces at ~52L (sub-40 targets need unhooked
  clones); small carriers re-bucketed to camo sample ONE PATCH (lottery
  — use cloth/steel slots); sample TOP views before accepting roof tones
  (warm-key flip). ORACLE-RENDER HEM SEMANTICS (§D): decode the ref's
  below-hem tone runs per column before authoring any curtain — the
  t90m ref's "curtain" was its wheels' lit upper arcs.
