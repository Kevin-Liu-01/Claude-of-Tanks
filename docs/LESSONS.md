# LESSONS — the stories behind the laws

(2026-08-06. Onboarding prose: why the rulebook says what it says. Every incident below
is codified in docs/BUILD-STANDARD.md or docs/GEOMETRY-GATE.md — those current
contracts are authoritative; this file is the memory.
New lessons land in BUILD-STANDARD the turn they arrive; add the story here when it
teaches something a section number can't.)

## The backwards tank, and why eyeballs are mandatory

The gate's registration is translation-only. That makes it ruthless about scale and
position — and completely blind to a mirror. t62mv1 shipped with its hull BACKWARDS and
its turret seated at the stern while scoring ~70; the owner caught it on sight. The fix
became three mandatory layers: builder-side vertex asserts (bow direction and turret
seat derived from the reference's own vertices), the v11 mirror check (which
near-symmetric hulls still evade), and the rule that no sheet ships without a turntable
eyeball. Curve scores alone never certify a tank again. The root cause was ultimately
fixed at the ORACLE (`_rotate_mesh_180y`) — when the reference itself faces −z, repair
the oracle, never mirror the build.

## The gunNode incident, or: mirror what the runtime saw

Graduation retires a tank's GLB registration but keeps measuring against the print via
override maps in three harness pages. When leo2a5 graduated, the map mirrored the
registration's SURFACE call — and the `articulated` helper it used silently injects
`gunNode:'^Gun'`. The mirrored config lacked it; at load-prove the graduate cratered to
min 0. The law: mirror the HELPER-EXPANDED runtime config, dumped from
tmp-modelsource-dump (full import chain), never the call site. Same family of lesson:
the evaluator ABORTS on graduates missing its committed override map — three maps, not
two (the isu152 re-cert finding).

## The t84 double-warp, and stale bytes generally

Oracle repairs are append-only recipes over a pristine `.bak`. The t84 packet earned its
scar when a duplicate `REPAIRS['t84']` key ran a STALE batch and double-warped the
print; the restore came from the fresh `.bak` (committed bytes). Hence warp law v2:
fresh .bak from committed HEAD bytes per batch, never flat-assign over a live recipe
(python asserts must target the LAST definition site — rindex), demote superseded
recipes to history with archived baks, census expect guards, byte-idempotency proven
twice, and a pre-flight that reproduces committed bytes BEFORE extending the chain.
Related bug class: a landing script asserted against the in-memory copy it had just
appended — assert against the FILE.

## The "inert" warp that wasn't

fv510's normalize warp was disabled for a round because it "did nothing": headline 0
before, 0 after. The re-adjudication decoded the mechanism instead of the headline: the
curve score is 100 − 12·mean − 0.6·p95 − 1.5·cover, and a print that is 10.9% short and
shape-divergent is floored at 0 by the 12·mean term no matter what the warp fixes. The
warp had in fact collapsed single-sided cover 5.29 → 1.12 and trued the frame. Second
mechanism in the same story: the game loader normalizes by
min(length, width·1.08, height·1.30) — a mast-heavy print binds on HEIGHT, so a pure
z-stretch is normalized away until a y-knee releases the clamp. Judge warps by the row
TERMS (mean/p95/cover/safeScale), never a 0-floored headline; verify which min() term
binds before authoring.

## The parked turret (m26), and the value of re-diagnosis

Every early m26 measurement said "sunken turret" — a certified short-barrel cap was
even built on it. A vertex census of the pristine print finally showed the truth: the
fused turret was authored PARKED for printing — laid flat, 1.77 m aft and 0.53 m left of
the hull's perfectly-circular ring pit. One rigid translate seated it; the "short
barrel" premise dissolved (the M3 was never short; the whole assembly sat aft of
station). The lesson threads through the caps case law: caps must be PROVABLY the
oracle's defect, and a repair that re-frames the print retires every conclusion measured
against the old pose. m26's full arc — 70.6 baseline → batch-42 body warp → r3 re-anchor
(90.4, first pass) → r4 facet retune → graduation as the 26th — is the program's
worked example that honest re-measurement beats fighting a number.

## The fused turret that was a LOD shell (vlo bakes)

The owner reported leo2_revolution's turret "fused with its hull". The cause was not the
build: the recovered print carries `chassis_vlo`, a whole-vehicle LOD shell riding the
HULL node, baking the at-rest turret into every hull mask — 128 polluted side columns.
The proc had faithfully mirrored the bake into rig_hull, building a turret-shaped hull
that never yawed. And the trap inside the trap: deleting the vlo ALONE re-frames the
hull-anchored registration and gates the un-relaid proc at 0 — the oracle repair and
the proc re-lay are ONE coupled landing. The §E law now orders a `_vlo` audit on any
print before trusting its hull rows, and the request-interception sim (serving candidate
GLB bytes to the UNMODIFIED gate page via puppeteer) exists so coupled states can be
proven without touching shared files.

## Reversed windings: the missing left side

"ariete and leclerc are missing left side of turrets." The decode: mirror loops
(`for s of [-1,1]` with x·s and no corner re-order) hand slab builders the OPPOSITE
ring handedness — all six faces point inward. The gate's masks are DoubleSide and see
the solid fine; the game and critic render FrontSide and cull it. A whole face of a
tank can vanish while scoring 90+. The gate STRUCTURALLY cannot see this class — hence
per-profile winding guards (orientedSlab/sslab) on every mirrored slab, the §C
missing-side render check (LEFT view against right on every round), and the corollary
that flood tools are also blind to it (reversed slabs read as open background, never
holes — renders are the witness).

## The shoes that clipped while the test read 0/0

The owner watched m1a1ha's track shoes glitch through its rear plates; the band-voxel
audit read 0/0. The band is the INNER loop — the player-visible surface is the instanced
shoe/pad envelope riding ~0.085 m outside it. §B4 grew a second column: shoeVox, the
player-visible bar, with blind spots (shoe>0 while band=0) ranked fleet-wide and a
standing order on the owning lane. Sibling lessons: dressing that legitimately rides the
envelope is conformance-EXCLUDED and audited, never deleted silently; and the "wrap
inner void" is fiction — the moving chain sweeps it (static furniture there clears
deep-windows, not the band).

## Invisible geometry still frames

Icons framed loose; probes found phantom envelope. The de-track destruction kit was
parked `visible=false` at its THROWN pose — and Box3.setFromObject, icon framing,
hashers and probes all see invisible meshes' AABBs. The fix (lazy-build the kit at the
state transition) re-froze all 24 graduates in one landing, with LOD0 pixels proven
byte-identical twelve ways. Corollaries that only make sense knowing this: "invisible at
LOD0" proves nothing about LOD1 (lodWrap LOD1 is empty by design), and materials must
stay EAGERLY created when construction defers — material ids are a draw-sort key, and
deferred clones renumber and break pixel identity.

## FIFO scars: locks, tickets, wrappers, and waiting

The browser tools serialize on /tmp/cot-shots.lock. Everything about its law is a scar:
a foreign plain-FILE lock wedged the dir-lock (all tools now fall back rmdir→ENOTDIR→
unlink); a 16-digit ticket queue-jumped the 15-digit sort (width is law); wrapping a
SELF-TICKETING official tool in an external lock hold deadlocked the fleet — twice; and
under fleet load official runs die at the 30-minute queue timeout (retry honestly; for
render batches hold ONE ticket with a batch driver on the identical render path).
The behavioral twin: agents that stop "to wait on watchers" end their own runs — chains
run sequentially in-process, and stalled agents get a finalize nudge, not a rescue.
Also: vite serves LIVE bytes at navigation time — a queued driver renders the tree as of
lock-acquisition, so treat in-flight runs as measuring the current tree.

## The orchestrator's staging discipline

The owner's parallel session stages deletions and edits into the shared index; twice
they were swept into landings. Hence: check `git diff --cached --name-only` before every
commit, never `git commit -a`, and land precise pathspecs. The ledger (tool-written, not
hand-editable, constantly rewritten by other agents' runs) is staged by index-blob
surgery — build HEAD-plus-target-rows content, `git hash-object -w`, `git update-index
--cacheinfo` — without touching the worktree file. Shared code files holding two
batches get split-staged the same way. And a rider grep at every landing: profile diffs
referencing BUCKET_DEF entries or cfg params must resolve in COMMITTED files, or HEAD
lands mid-state.

## External reverts, stashes, and clean rooms

A builder ran `git stash` on the fleet tree and swept OTHER agents' concurrent WIP into
the stash (recovered via `git checkout stash -- <file>`). Never stash in the fleet
tree — snapshot your own file to the scratchpad. The freeze-proof twin: foreign
shared-module WIP moves EVERY family's hash, so clean-room worktrees (HEAD + your file)
are the honest frame for freeze proofs, and handover sweeps can legitimately commit
mid-round builder snapshots. Tank assets have the same shape: they render the LIVE
tree, so graduates regenerate from a clean landing-candidate worktree with
`npm run tank:assets -- --ids=<id>`, then prove the exact nine files and manifest
row against live geometry with `npm run tank:release:check -- --ids=<id>`.

## Measurement discipline: numbers with provenance or nothing

Recurring shape: a confident claim, then a decode showing the instrument meant something
else. Banked pixel counts don't survive re-renders (re-derive before re-use); diff
COUNTS don't port across harnesses even at recorded thresholds (~9x apart on identical
states — the view SET binds, magnitudes rank only within one harness); sky floods need
the blue-signature term or warm track-shadow inflates hole counts 5-15x; pair-PNG label
bands read as enclosed sky; the critic's top view puts the bow at image BOTTOM
(gun-overhang check before turret-front reads); browser-pane screenshots read black on
this box (verify via the repo puppeteer rigs, never pane screenshots); zsh splits
`for t in $VAR` as one word (use `${=VAR}`). Cross-critic severity disputes calibrate
against the ratified chieftain5 anchor — measurements, not vibes.

## The gate is honest; help the builder be honest too

A family of laws exists because the gate's mechanics can be gamed accidentally:
- dims anchors fat enough for the whole-row shift the HULL row's registration mid
  (counterweight symmetrically — the m26 law that recovered six points);
- station slices clip a 0.52 m slab, so long thin prisms vanish (segment ≤0.48 m);
- features near column/station boundaries coin-flip reads (≥2 px margins, ≥10 mm
  boundary clearance, AA-teeter columns are not orders);
- a deck polyline traced WITH the ref's furniture double-counts when that furniture is
  re-added proud (tone-pure dressing over trace-authored lines);
- one proud 4 cm fitting past the width anchor rescaled a whole build (dims 100 → 53.6);
- degenerate 1-triangle slivers can own 30+ gate points — census them first.

## Owner reads are orders, and they generalize

Nearly every §B law began as one owner sentence with a screenshot: sloped Abrams turret
fronts, no staircases, slope-motivates-the-mass, no mystery boxes (then §B3.1: gun runs
are never prisms; then §B3.2: real vehicles are BUSY), turret furniture must rotate
(§B5), tracks are \\________/ not /_____/ (§B6), track containment, the ring-gap
"disembodied turret" read, "compare the 510 to an actual model" (photo-parity rounds
with numbered gap tables), and §B7 — when the owner rules the SOURCE wrong, the real
vehicle governs that region and the divergence is certified, priced, and bounded.
The meta-lesson is the LIVING RULEBOOK directive itself: the rule generalizes the same
turn it arrives, and a brief that predates a law never excuses missing it.
