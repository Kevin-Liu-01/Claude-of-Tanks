# ABRAMS FAMILY §B3.2 KIT-DENSITY ROUND — INDEPENDENT RE-CERT (five graduates)

Date 2026-08-06. Independent adversarial re-cert critic for the landed
fdd00a1 abrams density round (owner directive: "add far more of these
decorations on ALL abrams"). This round SUPERSEDES the ratified
cheek+gun freezes (66f953e4 / cd209f68 / b78279b4 / 25304310 /
b74366ac). Under review: five graduate kit-density candidates — m1a1 /
m1a1ha / m1a2 / m1a2_tejas / m1a2_sepv2 — additions ONLY in proven-free
mask classes (satchel, bedroll, helmet bag on duffel crowns; RIGHT-ledge
cable / spare-link strip; deck tie-down D-rings), frozen rows HELD. All
renders and measurements below are my own runs on the official rigs
(§D), fresh this session, at the verdict hashes.

## VERDICT — RE-CERT PASS, all five tanks

| tank        | floor | mean | gate x2 (frozen rows EXACT)                | re-freeze hash       |
|-------------|-------|------|--------------------------------------------|----------------------|
| m1a1        | 9.1   | 9.17 | 89.4 = 89.4 (91.7/89.4/89.8/93.9/100/100)  | 5290e3bc (42/153724) |
| m1a1ha      | 9.1   | 9.15 | 89.4 = 89.4 (91.7/89.4/89.8/93.9/100/100)  | 4023964c (43/154252) |
| m1a2        | 9.3   | 9.30 | 91.0 = 91.0 (93/92.8/91/93.4/100/100)      | 75e981e0 (42/111284) |
| m1a2_tejas  | 9.1   | 9.15 | 89.4 = 89.4 (91.7/89.4/89.8/93.9/100/100)  | 93a9a890 (44/153400) |
| m1a2_sepv2  | 9.2   | 9.28 | 91.3 = 91.3 (93.1/92.4/91.3/93.4/100/100)  | b284b8ac (42/112100) |

(Floors/means over each tank's DIFF-DERIVED changed-view contract of §5
— my own per-view pixel diffs against the superseded-freeze baseline,
per the §J CHANGED-VIEW-LISTS-ARE-DIFF-DERIVED law. Contracts: m1a1 9
views, m1a1ha 11, m1a2 5, m1a2_tejas 11, m1a2_sepv2 5.)

Orchestrator may re-freeze all five at the candidate hashes. No
gate-blocking orders. The owner's American-MG question is answered YES
with the audit table in §3. Residuals in §6.

## 1. Provenance

- Arrived at HEAD 90749e7; landed round fdd00a1 + registry recovery.
  I made NO src/GLB edits, no checkouts/restores/stashes; scratch
  tooling only under tools/tmp-* (untracked), evidence under shots/
  (gitignored), this doc.
- Pre-existing working-tree state on arrival: uncommitted probe-field
  jitter in docs/geometry-gate/{leclerc,m1a1,m1a1ha,m1a2_sepv2,
  m1a2_tejas,type74,ledger}.json (post-landing gate runs by other
  sessions; frozen component rows identical to committed) + live-agent
  WIP in src/vehicles/profiles/misc.js (leclerc lane — NOT an abrams
  dependency: abrams.js imports only three/kit.js/materials.js). My own
  gate runs rewrite the same tool-owned gate artifacts.
- HASH BRACKET x3 (tools/tmp-hashgeo.mjs): all five ids at the
  candidate hashes (table above) BEFORE all browser work, AFTER the
  render/measure phase, and AGAIN after the two mid-run landings —
  every render in this verdict was made at the verdict hashes (§J law).
- MID-RUN LANDINGS: a9eeeb1 (leopard shoe re-cert ratification) and
  4a27afe (leclerc turret front + misc winding fixes) landed while I
  worked. Path-byte check: a9eeeb1 is docs-only; 4a27afe touches docs +
  src/vehicles/profiles/misc.js ONLY — `git diff 90749e7 4a27afe --stat`
  over abrams.js / kit.js / tankFactory.js / specs.js / the critic and
  yaw harness pages is EMPTY, and hash bracket run 3 (post-landing tree)
  reproduces all five candidate hashes. No render straddles an
  abrams-path byte change. (4a27afe's new §D laws cross-checked: dims
  100 x5 x2 = no WIDTH-GUARD-BY-DRESSING violation by the new kit; gate
  EXACT x2 = no RNG-STREAM re-jitter.)
- FIFO discipline (§F.1): all 5x14 critic pairs + the two §J yaw pairs
  (m1a1ha, m1a2_sepv2 — this round's yaw ids) rendered under ONE ticket
  by a batch driver on the identical render path
  (tools/tmp-density-critic-batch.mjs, clone of the
  tmp-cheekgun-critic-batch precedent; zero console errors, favicon 404
  only). Official self-ticketing rigs (standard-check, turret-parent,
  visual-evaluator) ran bare, never wrapped; geometry-gate runs its own
  vite (not FIFO-listed).
- DETERMINISM: my fresh pairs (shots/critic-<id>-densityrecert/) are
  0-diff (t>2, label band excluded) against the builder's evidence
  (shots/critic-<id>-b32/) on ALL 14 views x ALL 5 tanks — builder
  evidence = shipping truth at the verdict hashes.
- CHANGE LOCALITY (fresh vs my own cheekgun-recert baselines at the
  superseded freezes, t>4, halves split): REF halves 0 px on all 70
  pairs (no framing drift — the new kit stays inside the model AABBs,
  §C law). PROC diffs concentrate exactly at the claimed kit stations
  (duffel crowns, right ledges, deck ring stations); full per-view
  table in §5. All rear/right-side deltas on m1a2/m1a2_sepv2 are
  LITERALLY 0 — their only change is the ring stations.

## 2. Standing checks (all measured myself)

| check | result |
|---|---|
| geometry-gate x2 | frozen rows EXACT both runs, all five (verdict table); trio 89.4 wholeCurves = the banked 2026-08-03 baseline, unchanged |
| tmp-hashgeo bracketing | x3 runs — five candidates stable at 5290e3bc/4023964c/75e981e0/93a9a890/b284b8ac (§1) |
| §J yaw-90 pairs (m1a1ha + m1a2_sepv2) | re-rendered by me at the verdict hashes (shots/abrams-density-recert/yaw{0,90}-*): ha right-ledge cable HULL-FRAME POSE-STATIC at yaw90 (same ledge line, pixel-position identical below the ring zone); bedroll/satchel-class rack kit rides rig_turret; sepv2 works field stays hull-side per its ORACLE-REGISTRATION-PINNED cert, CROWS + twin-fifty + crate ride the yawed turret; exposed decks read FILLED at yaw90 — no §B2 sky through interiors (§B4 stern-resume holds: stern full-width, no top-down sky) |
| tank-standard-check | clip 0/0, contig 0 — all five; census m1a1 mg1+1d, m1a1ha mg1+2d, m1a2 mg1+1d, m1a2_tejas mg1+2d, m1a2_sepv2 mg1+1d (= packet claims; machine-gate "2/5" line is the gate>=90 term — the trio's 89.4 is the certified baseline row, held exact) |
| §B5 turret-parent audit | m1a1/m1a1ha/m1a2/m1a2_tejas stranded 0 / abutting 0 / dangling 0; m1a2_sepv2 stranded 2 (unnamed 45% + unnamed 26%) = EXACTLY the certified registration-pinned works-field classes (graduation cert; packet documents the identical flags on committed HEAD; adjudicated LEAVE) |
| visual-evaluator (camoSeed 4242, per id) | RIG PARITY OK all five — max dYawProxy 1.3-1.4°, max dCentroid 0.039-0.061 m (abort bar 10°); flag decomposition in §6 |

## 3. SPECIAL OWNER CHECK — "were making the american style machine guns on the abrams right"

Answer: **YES on all five.** Audited every crew-served station at 2x-4x
(upscaled crops OF the official close-roof / view-top / hero-toptilt /
view-front pairs, both halves). No Soviet-silhouette read anywhere: no
NSVT/Kord conical flash hider (the kit nsvt cone class is 0.035 r —
every authored abrams muzzle device is the 0.015-0.021 r short M2
collar class), no DShK fin jacket, no humped top cover. Grammar per
station:

| tank | station | read at 2x-4x | verdict |
|---|---|---|---|
| m1a1 | CWS pintle M2 (band top) | bold BLACK SKELETAL M2 fused on the plateau — heavy rectangular receiver run, plain straight barrel to the band edge, cradle X-arms, grip nubs at the rear, ammo box beside the receiver, receiver/pintle hump in the head column; matches the warped ref's own flattened-M2 mechanism (certified visual-r3 design) | AMERICAN |
| m1a1 | loader's M240 (skate) | slim low receiver + shield + thin plain barrel seated low across the ring, ammo pouch | AMERICAN (GPMG class) |
| m1a1 | stowed rack M2 (KIT m2, seed 11) | heavy receiver MASS + visible sleeve/jacket collar at the barrel root + plain barrel + spade grips; can authored on the gun's left | AMERICAN |
| m1a1ha | CWS M2 + loader M240 | shared trio lines (byte-shared, verified on its own renders) | AMERICAN |
| m1a1ha | stowed rack M2 WITH SHIELD (seed 12) | the shield plate stands at the receiver front — reads apart from m1a1's bare gun at a glance | AMERICAN + §H.4 tell |
| m1a2_tejas | CROWS station | slew ring on the base + EO head block at 2.4843 with dark window + glass band (sensor cluster present) + the skeletal M2 + loader M240 | AMERICAN |
| m1a2_tejas | stowed rack M240 (KIT mag, seed 13) | visibly SLIMMER/shorter than the sibling fifties — the GPMG stowed read | AMERICAN + §H.4 tell |
| m1a2 | CROWS on R1 | receiver mass w/ pale top cap riding the hatch ring, plain M2 barrel + small hider running out over the LEFT cheek, spade grips, EO pod + lens (sensor cluster), hung ammo can w/ lid seam, slew cage hoop | AMERICAN |
| m1a2 | loader's M240 | slim 0.10 receiver + 0.012 barrel + small hider + front sight, dark crown-riding line over the recessed ring (MG PHYSICS pale-deck inversion) | AMERICAN (GPMG class) |
| m1a2_sepv2 | CROWS | shared m1a2 lines | AMERICAN |
| m1a2_sepv2 | loader's SECOND M2 (twin fifties) | fatter 0.13 receiver + heavier barrel/hider + spade grips + bigger can on the SAME certified caps — reads apart from the m1a2's M240 side-by-side at 4x | AMERICAN + §H.4 SEPv2 tell |

CROWS sensor clusters present on all three SEP-family marks (tejas,
m1a2, sepv2); CWS drum class on the two A1-era marks — correct per
mark. MG PHYSICS holds: sky-backed CROWS barrels read pale top-lit;
pale-deck loader guns read as dark crown-riding lines.

One heraldry nit for the family lane (non-blocking, §6): the
hand-authored CROWS/band ammo cans sit on the gun's RIGHT; the M2's
left-feed tell would hang them gun-left (the KIT stowed guns author
this correctly). Identifiability is unaffected at any zoom.

## 4. The new kit, hunted at 2x-5x (§B3 grammar + floats)

- m1a1 SATCHEL + cinch (left duffel crown): canvas strip with rim
  highlight cradled between the rack posts (view-rear 5x), boxy bag
  read from rearleft/top; seated ON the duffel, no float gap.
- m1a1ha BEDROLL (left duffel crown): rolled cylinder with a visible
  cinch strap tab (view-rear 5x, view-top); rides the duffel.
- m1a1ha RIGHT-ledge tow cable + 3 clamps: continuous cable lay along
  the skirt ledge with clamp thickenings (view-right 4x-6x) and the
  S-curve drape termination down the rear corner — the EXACT mirror of
  the m1a1's certified LEFT cable (m1a1 drape verified side-by-side);
  hull-frame static at yaw90 (§2). §H.4: the pair reads apart from
  either flank (m1a1 cable LEFT / ha cable RIGHT).
- m1a2_tejas RIGHT-ledge SPARE-LINK strip (4 links + 2 clamps):
  SEGMENTED read — individual link ridges with gaps + pale clamp bands
  (hero-rearright 3x, view-right 6x, close-roof); half-sunk on the
  ledge, tops at the certified 1.458 cap. Distinct from the ha cable —
  the trio flank ledger (LEFT cable / RIGHT cable / RIGHT links) holds.
- m1a2_tejas HELMET BAG (right duffel crown): soft-cornered bag with
  strap seam (view-top BA 4x); seated on the duffel.
- DECK D-RINGS (m1a1/ha/tejas glacis ±0.55,2.75 + rear ±0.86,-2.20;
  m1a2 glacis ±0.60,2.60; sepv2 glacis + mid-deck ±0.85,1.55): read as
  REAL tie-down rings at 3x-4x — half-sunk tori with readable loop
  openings, seated on the deck with both feet in contact (view-front
  4x on all five; rear pair on the trio at 6x). Not mystery boxes.
- FLOATS: none — gate floaters 100 x5 x2 runs, clip 0/0 x5, every item
  visually seated (above), yaw pairs show attachments move with their
  owners.
- The m1a2/sepv2 REVERTED items (right-edge rack fill, duffel straps,
  m1a2 mid-deck pair) are genuinely absent from the renders — the
  packet's decode-and-revert discipline is real (their rear/right view
  diffs are 0 px).

## 5. Scores — DIFF-DERIVED changed views, graduation bar (>=9.0 every view)

My per-view PROC-half diff counts (t>4, label band excluded, 640x610
scored px) vs the superseded-freeze baseline, and scores. Views below
each tank's AA-noise floor (<20 px, unlisted) inherit their carried
verdicts — every such cluster was still eyeballed (all are ring-station
or shared-station pixels).

| view | m1a1 px / score | m1a1ha px / score | m1a2 px / score | m1a2_tejas px / score | m1a2_sepv2 px / score |
|---|---|---|---|---|---|
| view-front      | 58 / 9.2   | 399 / 9.2  | 95 / 9.3 | 267 / 9.2 | 108 / 9.3 |
| close-front     | 24 / 9.2   | 23 / 9.2   | 35 / 9.3 | 23 / 9.2  | 35 / 9.3  |
| close-roof      | 22 / 9.2   | 1158 / 9.2 | 19 / 9.3 | 644 / 9.2 | 16 / 9.3  |
| hero-toptilt    | 104 / 9.2  | 918 / 9.2  | 11 / 9.3 | 418 / 9.2 | —         |
| hero-frontleft  | —          | —          | 18 / 9.3 | —         | 22 / 9.3  |
| view-frontleft  | —          | —          | —        | —         | 15 / 9.2  |
| view-frontright | —          | 440 / 9.1  | —        | 97 / 9.1  | —         |
| view-right      | —          | 602 / 9.1  | —        | 129 / 9.1 | —         |
| view-top        | 28 / 9.2   | 531 / 9.2  | —        | 221 / 9.2 | —         |
| view-rear       | 419 / 9.1  | 839 / 9.1  | 0        | 245 / 9.1 | 0         |
| view-rearleft   | 45 / 9.1   | 33 / 9.1   | 0        | 23 / 9.1  | 0         |
| view-rearright  | 51 / 9.1   | 502 / 9.1  | 0        | 114 / 9.1 | 0         |
| hero-rearright  | 55 / 9.2   | 816 / 9.2  | —        | 340 / 9.2 | —         |
| floor / mean    | 9.1 / 9.17 | 9.1 / 9.15 | 9.3 / 9.30 | 9.1 / 9.15 | 9.2 / 9.28 |

The 9.1s are honest: the rear/right orthos are the family's dark-zone
reads and carry the pre-existing trio residual classes (§6) alongside
this round's small kit; the additions themselves integrate cleanly in
every one of them. m1a2/sepv2 score high because their round is two/
four rings on already-strong certified fronts.

- Contract derivation note (§J law + §D threshold addendum): my t>4
  counts run up to ~9x the packet's percentages on the same underlying
  states (m1a1 view-rear 419 px vs the packet's 0.011% ~ 45 px) — the
  changed-view SETS agree; magnitudes are not portable across diff
  harnesses even with thresholds recorded. My contract additionally
  scores tejas view-right / view-rearright / view-frontright (129/114/
  97 px — real link-strip reads the packet called AA-noise class) and
  the trio's small close-front / rearleft / rearright / top clusters.
  Builder under-listing, diff-derivation catches it: that is the law
  working, not a defect; all such views score >=9.1.

## 6. Honest residuals (documented, none gate-blocking; family lane)

- CARRIED CLASSES, pre-existing and unchanged this round (pixel-proof:
  their zones diff 0 vs the superseded baseline; flags byte-match the
  cheekgun re-cert's list): trio chin-step (frontleft Δ+14.5°±0.6 @
  z 2.04..2.37 — the certified-bottoms constraint ledge), trio
  evac/tube transition (right Δ-14.6°±4 @ z 3.38..3.70) + 3.26 m tube
  line Δ+1.6°±0.1, trio hero-frontleft Δ-12.9° @ x 1.06..1.08 y
  1.70..2.02 and rearright Δ-11.3° @ z 2.24..2.49 y 1.82..1.90 (both
  shared-line carries — identical on m1a1 which carries NO right-ledge
  kit; outside every change bbox), m1a1ha bow-zone frontright
  Δ+14.9°±4, m1a2/sepv2 rear-zone classes (their rear views diffed 0
  this round). All evaluator flags decompose into these carries — none
  sits in a changed zone.
- CROWS/BAND AMMO-CAN SIDE (new, non-blocking): the hand-authored
  stations hang the can on the gun's RIGHT (m1a2-family CROWS can at
  perpendicular offset -0.118; trio band can inboard at x -0.445 vs gun
  -0.60); the M2's left-feed tell would put it gun-left, as the KIT
  stowed guns already do. Flip in a priced round if the family lane
  wants the heraldry exact; certified rows pin the current envelopes.
- m1a2_sepv2 §B5 stranded 2 = the certified ORACLE-REGISTRATION-PINNED
  works field (adjudicated LEAVE at graduation; reproduced exactly).
- Builder packet under-listing on tejas (three right-side changed views
  called AA-noise) — §5 note; discipline flag only, scores clean.
- The trio's free-class surface is now thin (m1a1 packet's own
  residual): rack floors FULL, deck lines exact outside the ring slack.
  Density beyond this needs a priced round — concur with the builder.

## 7. Per-tank verdicts

- m1a1: RE-CERT PASS (re-freeze 5290e3bc)
- m1a1ha: RE-CERT PASS (re-freeze 4023964c)
- m1a2: RE-CERT PASS (re-freeze 75e981e0)
- m1a2_tejas: RE-CERT PASS (re-freeze 93a9a890)
- m1a2_sepv2: RE-CERT PASS (re-freeze b284b8ac)

Orders: none mandatory. Recommended (family lane, non-blocking): the
ammo-can side flip (§6) whenever a priced roof round next opens; keep
the trio chin-step + evac-taper classes on the certified-row roadmap
(carried from the cheekgun verdict).

## 8. Law discoveries (for the bank)

- DIFF-COUNT NON-PORTABILITY (§J/§D corollary): changed-view pixel
  COUNTS are harness-local even at recorded thresholds (t>4 vs the
  builder's tooling read ~9x apart on identical states) — the
  diff-derived contract binds on the view SET; magnitudes only rank
  within one harness. Re-derive, never re-use, cross-harness counts.
- MID-RUN LANDING PROTOCOL reconfirmed (cheekgun precedent, now twice):
  path-byte stat check over the target family's build+harness files PLUS
  a post-landing hash-bracket run keeps in-flight render evidence valid
  without re-rendering — foreign-profile landings (misc.js) are
  hash-neutral to non-importing families.
- NATIONAL-GRAMMAR AUDIT WORKFLOW (§H.4): the kit MG class table
  (m2/dshk/nsvt/mag — hider radius class, jacket type, receiver
  proportions) gives the critic decodable SOURCE tells to verify
  against 2x-4x crops of the official pairs; the Soviet-read test is
  concrete (0.035 r cone / fin jacket / top-cover hump), not vibes.
- Reconfirmed: one-ticket batch drivers on the identical render path
  for 5x14 pairs + 2 yaw pairs (§F.1 shape); §J yaw evidence re-rendered
  at verdict hashes; REF-half 0-diff as the framing/AABB invariance
  witness on kit-only rounds.
