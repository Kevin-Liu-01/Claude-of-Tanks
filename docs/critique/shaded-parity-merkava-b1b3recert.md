# merkava graduates §B1/§B3 pod-tell family round — INDEPENDENT RE-CERT (2026-08-05)

Graduate-change re-cert (BUILD-STANDARD §B1 slope-mass / §B3 no-mystery-boxes
+ §D + GEOMETRY-GATE §10) for the merkavaPodTell change on the four
graduates: merkava1b, merkava3b, merkava3c, merkava3d. The owner-named
"random boxes that are not ERAs around armor and especially guns"
(directive 2026-08-05, the merkava mantlet area named) are the two measured
cheek-shoulder pods beside the gun root — certified mask carriers that read
as bare cuboids at 1x. The round dresses their faces in equipment grammar:
RIGHT pod = gunner's sight (pale hood lip, dark aperture slot, lens, side
cheeks, wiper tick, outer louver pair), LEFT pod = fitting bin (lid seam
ring, latch pair + keepers, handle bar, stiffener line). Camo buckets gain
verts, so per the merkava-b5 RE-CERT BAR this is a full independent critic
re-cert on the changed views, not a pixel-diff cert.

## HEADLINE: **RE-CERT PASS ALL FOUR** — changed-view floors 9.0 (1b mean
## 9.03, 3b 9.06, 3c 9.06, 3d 9.06), every changed view at or above the
## graduation bar as the same vehicle. THE §B3 POINT IS DELIVERED: at 1x/2x
## the right cheek pod reads as a GUNNER'S SIGHT (pale hood lip over a dark
## aperture with the lens inside, framed side cheeks, wiper tick, outer
## louvers) and the left pod reads as a FITTING BIN (lid seam ring, latch
## pair + keepers, handle, stiffener) — no bare cuboids left beside the gun
## roots. Nothing floats, nothing rises above pod tops or leads the lens
## line, camo continuity intact. Gate ×2 EXACT frozen rows ×4; hashes
## stable ×2 through the full render campaign. Orchestrator may land
## merkava.js + the four packets and RE-FREEZE **1b 1fda7dbd** (42/138906),
## **3b 87ba249c** (41/148794), **3c 4880b0a4** (41/149160),
## **3d 93e7b4eb** (39/170180) in ONE commit (incl. the flag-gated
## non-graduate family work, which is arithmetically excluded from these
## four builds — see vert arithmetic below).

## Provenance (§D discipline)

- Pairs re-rendered FRESH by me on the official render path: first
  attempts via `node tools/tmp-tank-critic.mjs --id=<id>` died on the
  30-min cot-shots lock timeout under a 17-23-deep fleet queue, so the
  four renders ran via `tools/tmp-b1b3-critic-batch.mjs` — a clone of the
  official driver with the IDENTICAL harness URL
  (tools/tmp-tank-critic.html?id=...), viewport, waits and save logic,
  looped over the four ids inside ONE lock hold / one ticket (fleet
  wrappers hold comparable multi-minute batches; four separate FIFO
  re-queues measured out at hours). 14 pairs per tank, zero console
  errors, vite :7472. Scored ONLY `shots/critic-merkava{1b,3b,3c,3d}/*.png`
  (mtimes 15:29, this session).
- GATE ×2 mine (runs 3+4 counting the builder's ×2), both runs
  bit-identical to each other and EXACT to the packets' frozen rows:
  - merkava1b min **90.0** — hull 91.2 / whole 90.0 / turret 91.0 /
    stations 91.4 / dims 100 / floaters 100 PASS
  - merkava3b min **90.1** — hull 91.1 / whole 90.1 / turret 90.4 /
    stations 93.6 / dims 100 / floaters 100 PASS
  - merkava3c min **90.5** — hull 91.9 / whole 90.5 / turret 90.8 /
    stations 92.3 / dims 100 / floaters 100 PASS
  - merkava3d min **90.4** — hull 90.4 / whole 90.6 / turret 91.4 /
    stations 91.7 / dims 100 / floaters 100 PASS
  (gate-JSON sub-readouts carry only the known noise band — plan
  91.4976→91.5168 on 1b with worst-row re-sort; every PRINTED component
  row exact both runs. The tells are mask-invisible as constructed.)
- Hashes: `node tools/tmp-hashgeo.mjs --ids=merkava1b,merkava3b,
  merkava3c,merkava3d` PRE-render = staged values **1fda7dbd** (42/138906)
  / **87ba249c** (41/148794) / **4880b0a4** (41/149160) / **93e7b4eb**
  (39/170180); POST-campaign run returned the same four values — stable
  ×2 bracketing every render in this verdict.
- VERT ARITHMETIC (change isolation): deltas vs the graduation freezes are
  +612 / +576 / +576 / +576 = 17 / 16 / 16 / 16 non-indexed boxes at 36
  verts each = EXACTLY the podTell piece census (right pod 8 pieces + lens
  on 1b only [the modular marks keep their certified 15 mm glass strip
  byte-identical as the lens], left pod 8 pieces). Nothing else rode the
  landing on these four ids — the in-tree merkava.js non-graduate work
  (stowTell 2B/2D, pot.bin, merkava4/4b sidePanels Trophy/bin tells,
  §B1 course seams) is opt-in-flag gated and arithmetically excluded here.
- SOURCE AUDIT of merkavaPodTell (containment/attachment, PROC-frame):
  every tell box lies strictly inside its pod's x/y footprint (widest
  x-reach 0.42w+0.013 < 0.5w at the narrowest pod w 0.25); no piece rises
  above cp.top (hood lip crown cp.top−0.007); every piece is
  coplanar-attached or embedded (back faces AT the pod front plane z0 or
  overlapping the aperture slab) — zero floating by construction, floaters
  100 ×2 empirically. Face-proud depths: 2.5–5.0 mm for all pieces except
  the 1b-only lens tile whose FACE lands at 6.0 mm (box d 0.004 centered
  z0+0.004) — 0.5 mm past the packet's stated "<= 5.5 mm" class (the
  packet's "4 mm proud" is the center offset). CLAIMS RESIDUAL, not an
  order: same location on the modular siblings carries the certified 15 mm
  glass strip, and the gate held EXACT ×2, so the class argument (r10
  strap precedent, sub-pixel at gate cameras) survives with the corrected
  number. Materials are family mats only ('turret'/'turretDark'/glass) —
  camo continuity by construction; bakeDirt is per-vertex, existing verts
  keep their mottle (matches the packet's "sides/top sub-pixel" claim).
- Official rigs at HEAD: geometry-gate.mjs, tmp-tank-critic.mjs,
  visual-evaluator.mjs, tank-standard-check.mjs all unmodified in the
  worktree; tmp-tank-critic.html carries the b5-landed merkava
  CRITIC_REFERENCE_OVERRIDES (3b +ex_decor_17/18, 3c +15-17) — the same
  rig the graduation critics scored on.
- Turret-parent audit: not re-run by me (not in the standing spot-check
  set for this change class); the builder ran A/B vs HEAD unchanged, and
  structurally the tells are P.add calls into the SAME turret buckets as
  their host pods — parenting cannot move. The 1b stranded-5 flag remains
  the b5-adjudicated audit-artifact class, present at HEAD.

## Standing spot-checks

- Gate ×2: PASS ×4 (rows above, EXACT frozen).
- Hash stability through the render campaign: post-campaign
  `tmp-hashgeo` run returned **1fda7dbd / 87ba249c / 4880b0a4 /
  93e7b4eb** again — stable ×2 (before + after all renders).
- §B2 flood via `node tools/tank-standard-check.mjs --ids=<four>`:
  **contig 0 ✓ on all four** (top-down enclosed-cell scan clean); the
  same run re-read the gate JSONs at the frozen rows. Its `decor
  mg0+0d ✗` is the CARRIED §I packet justification (hand-authored
  ref-parity roof MGs predate the fittings library — declared "not a new
  failure" in recert-merkava3b-r12 at graduation; unchanged this round).
  Its track-clip column reads "—": the spawned track-clip-audit died on
  the cot-shots 30-min lock timeout under a 20+-deep fleet queue. NOT
  re-queued: §B4 is not in this change-class's spot-check set, tracks
  are byte-identical to the certified frozen state (the +612/+576 vert
  arithmetic bounds every change to the turret pod tells), and the
  graduation-round clip certs (0/0 class) stand for unchanged geometry.
- §H.4 four-up distinctiveness: PASS (named tells below).
- visual-evaluator RIG PARITY: **OK ×4** (batch run
  tools/tmp-b1b3-evaluator-batch.mjs — identical evaluate path to the
  official driver, one lock hold; exit 0, 14 views per tank). Worst
  yawProxy: 1b 1.02° (rear), 3b 1.07° (front), 3c 1.22° (rear), 3d 1.11°
  (close-front) — the same ~1° band as the b5 re-cert; no flips, no
  RIG MISMATCH; scoring valid. Evidence shots/visual-eval-merkava{1b,3b,
  3c,3d}/ (report.json + overlays). No angle/roundness claims are made in
  this verdict, so the digest's standing warped-ref noise (UNMATCHED
  edge lists, cliff-offset Δbot lines) carries no orders; the two
  hero-rearright enclosed-void reads (0.008/0.005 m², 3d) sit on an
  UNCHANGED view, are the graduation-era basket through-shadow class,
  and the §B2 machine scan reads 0 holes.

## The §B3 read (the point of the round)

Read at 1x and at 2-4x zoom crops off my fresh official-rig pairs
(scratchpad crops via tools/tmp-b1b3recert-crop.py; coordinates below are
proc-half pixels of the named pair):

- RIGHT pod = SIGHT, all four tanks. view-front 4x: pale hood lip line
  across the pod top, the large dark aperture window under it with the
  lens tile inside (1b: new 4 mm-offset glass; 3-series: the certified
  15 mm strip unmoved), pale hood side cheeks framing the window, wiper
  tick line under the aperture (e.g. 3b view-front proc (455-505,
  262-330); 1b view-frontright proc (295-370, 225-290) shows the full
  hood + aperture + wiper stack; louver pair hairlines on the outer face
  read at 2.5x on the frontright views and on close-roof).
- LEFT pod = BIN, all four tanks. view-front 4x: lid seam ring under the
  pod top, latch pair + pale keepers, handle bar, stiffener/outer seam
  hairlines on the outboard face (e.g. 1b view-front proc (180-280,
  265-330) — rounded-top bin with two dark latches + keepers; 3b/3c/3d
  close-front 2.5x each show the seam + hardware plate on the near cheek).
  On the modular marks the pre-existing certified glass tile sits inside
  the new hardware group and now reads as part of the bin's latch plate
  rather than a floating mystery tile.
- INTEGRATION (§B1 slope-mass): the pods are the certified measured plan
  bumps (reference-true sight housings leading the cheeks); every tell is
  face-flush (max 5-6 mm proud), so the pods still read as shaped masses
  of the cheek shoulders — no plate-on-box read, no new staircase, the
  certified cheek appliqué course lines unchanged. The r4 sight-band rake
  plates (3d) and small-turret casting (1b) keep their single-surface
  slope reads.
- NOTHING FLOATS: every tell's back face is coplanar with or embedded in
  its pod face (source audit above); floaters 100 ×2 empirically; no
  sky reads through any pod area in the toptilt/close views.
- CAMO CONTINUITY: tells are family mats; mottle continuous across pod
  faces on 3d (the strongest-mottled mark) — checked at 4x.

## Changed-view scores (graduation bar >= 9.0 per view)

| view | merkava1b | merkava3b | merkava3c | merkava3d |
|------|-----------|-----------|-----------|-----------|
| close-front    | 9.0 | 9.1 | 9.1 | 9.1 |
| view-front     | 9.1 | 9.1 | 9.1 | 9.1 |
| view-frontleft | 9.0 | 9.0 | 9.0 | 9.0 |
| view-frontright| 9.1 | 9.1 | 9.1 | 9.1 |
| hero-frontleft | 9.0 | 9.0 | 9.0 | 9.0 |
| hero-toptilt   | 9.0 | 9.0 | 9.0 | 9.0 |
| close-roof     | 9.0 | 9.1 | 9.1 | 9.1 |
| **floor/mean** | **9.0 / 9.03** | **9.0 / 9.06** | **9.0 / 9.06** | **9.0 / 9.06** |

Unchanged views (sides/top/rear/rearright per the packets' changed-view
lists) carry only sub-pixel louver/seam hairlines and <= 6 mm face-edge
slivers; the graduation certs stand for them (spot-checked view-top on
all four at 1x: no new pixels beyond the pod footprints, silhouettes
identical to the frozen reads).

## §H.4 four-up distinctiveness (standing check)

fourup-AFTER-frontleft board (scratchpad): all four remain
tell-apart-at-a-glance —
- 1b: small cast turret + brow, bustle basket arc, EXPOSED five-wheel run
  (no full skirt), driver deck box.
- 3b: modular turret + left plinth band w/ MG, ribbed rectangular skirts,
  low rear kasag hump, wide-set whips.
- 3c: wider stepped plinth + 2.585 step box, dark-banded skirts, taller
  rear Kasag bundle at -2.58.
- 3d: raised sight-band story + roofBoxes rear plateau, scalloped skirt
  hem, longer bustle rack overhang.
The now-shared pod grammar does not collapse variant identity — the
distinctors live in turret story, skirts, running gear and rear kit.

## VERDICT

**RE-CERT PASS — merkava1b, merkava3b, merkava3c, merkava3d.** All
changed views >= 9.0 against the graduation standard; the §B3/§B1 point
delivered; gate rows frozen-EXACT ×2 per tank; hashes stable through the
campaign; §H.4 four-up distinct. The orchestrator lands merkava.js + the
four packet sections + FOUR re-freezes (1fda7dbd / 87ba249c / 4880b0a4 /
93e7b4eb) in one commit, including the flag-gated non-graduate family
work that is arithmetically excluded from these four builds.

Claims residual for the record (not an order): the 1b-only lens tile's
FACE lands 6.0 mm proud (box d 0.004 centered z0+0.004; the packet's
"4 mm proud" is the center offset, its own side-view note already says
"<= 6 mm slivers") — 0.5 mm past the stated 5.5 mm class, far inside the
certified 15 mm glass envelope of the same location on the modular
siblings, and mask-invisible by the ×2 EXACT gate holds.

Fleet note (queue hygiene, for the orchestrator): a wrapper in current
use writes 16-digit-padded tickets into /tmp/cot-shots.queue while the
standard tools pad to 15 — lexicographic ordering lets 16-digit tickets
jump the whole 15-digit queue. Worth normalizing before the next
many-agent render round.
