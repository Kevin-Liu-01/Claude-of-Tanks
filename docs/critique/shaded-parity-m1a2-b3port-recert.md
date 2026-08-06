# m1a2 §B3 GRADUATE-CHANGE PORT — INDEPENDENT RE-CERT (2026-08-05)

Adversarial re-cert critic for the m1a2 graduate-change §B3 round: the
builder ported sepv2's proven §B3 equipment-grammar fixes (gun-root
armored sleeve, sensor-head wind post, bow pad plates + horn dots,
rail-bin grammar) by un-gating the shared buildM1a2 blocks, with an
m1a2-authored Z-split plane-tiling mechanism for the one split-dependent
item (rail bins: turret-mask here vs sepv2's hull-mask). State
certified: the abrams.js round bytes at proc hash **248a8468**
(46 meshes / 116840 verts) — begun as the uncommitted working tree;
mid-session the orchestrator's device-handover snapshot (2a6094b)
committed abrams.js with exactly the 113-line diff audited below, and a
POST-COMMIT third hash leg re-verified 248a8468 + all five sibling
hashes byte-exact on the committed tree. The verdict certifies the
bytes now at HEAD.

## HEADLINE: **RE-CERT PASS (re-freeze 248a8468)** — gate ×2 at the
## frozen row EXACTLY (verified by this critic, both runs identical to
## the digit); all FOURTEEN views ≥ 9.0 (floor 9.0, mean 9.11) as the
## same M1A2, same tier. The sepv2-graduation critic's banked order is
## answered: the gun root reads tube-exits-a-ring dead-ahead (boot
## collar + concentric rings inside the ref-endorsed shadow pocket, not
## a wall), the wind post reads as a driver's wind sensor, the bow
## stacks read as stowed track shoes, and both rail bins carry the lid
## seam + latch + hinge grammar at the exact certified planes. Every
## changed render pixel decodes to the four §B3 items — nothing
## out-of-scope moved. §H.4 four-up verified: the tells do NOT converge;
## m1a2's identity survives sepv2 running the same blocks.

## Provenance (§D discipline — everything below measured by this critic)

- Source audit: the working diff's abrams.js hunks are EXACTLY the four
  claimed ports, all inside buildM1a2 (`if (sep)` → unconditional on the
  D/E crown-pair + D-left corner + E band + collars + boot and on the
  shoe pad-plates/horn-dots; the wind-sensor swap unconditional with its
  bare-box else deleted; the m1a2 turret-mask rail branch re-authored as
  `binTile` Z-split plane tiling at the exact certified outer planes —
  left box −1.445, right step 1.415, right box seam in its exposed
  2.042..2.115 band). No shared helper, no other builder touched.
  kit.js / tankFactory.js / specs.js / variants.js / modelLoader.js and
  both official rigs CLEAN at HEAD.
- HASH BRACKET (tools/tmp-hashgeo.mjs before AND after every render):
  m1a2 **248a8468 (46/116840)** both legs — the claimed new hash (was
  f3c34424, +4044 verts). Siblings byte-exact both legs: m1a1 97c10194,
  m1a1ha f5c556dc, m1a2_tejas 3fcae440, m1a2_sepv2 **b489ba14**,
  m1a2_tusk f7ecade4 — the port changed only m1a2, hash-proven.
- GATE ×2 (consecutive, run by me): **min 91 | hull 93 whole 92.8
  turret 91 stations 93.4 dims 100 floaters 100 PASS** — the FROZEN ROW
  TO THE DIGIT, both runs identical. Ledger sub-display decode (current
  vs HEAD JSON): of 32 numeric score fields exactly ONE moved —
  curveRows.front_whole.score 93.40522 → 93.40635 (+0.00114, IMPROVED;
  one sub-display AA flip toward the ref). 7/8 curve rows byte-equal;
  stations/dims/floaters/reg byte-equal. Zero §C allowance consumed.
- Pairs rendered FRESH by this critic (tmp-b1b3-critic-batch.mjs, ONE
  FIFO ticket, official render path): m1a2 + m1a1 + m1a1ha + m1a2_sepv2,
  14/14 each, zero console errors. My m1a2 set is **byte-identical
  14/14** to the builder's shots/critic-m1a2 evidence (archived before
  overwrite, cmp-proven); my m1a1/m1a1ha/sepv2 sets are byte-identical
  to their prior-round archives — frozen siblings render identical
  pixels, beyond the geo-hash proof.
- `node tools/visual-evaluator.mjs --id=m1a2` (camoSeed 4242): **RIG
  PARITY OK** — max yawProxy 1.357° @front (the §B1 baseline figure),
  max |dCentroid| 0.066 m @left, no flips, verdict OK. Flagged rows are
  the documented carry classes only (corner-handover Δbot −0.65..−0.72
  @ z −2.15..−2.17 ×3, vertical-edge cliff offsets, short re-segmented
  close-roof contours). Report + overlays: shots/visual-eval-m1a2/.
- `track-clip-audit --exact`: **front 0 / rear 0**. `standard-check`:
  gateMin 91 (93/92.8/91/93.4/100/100), clip 0/0 ✓, contig 0 ✓, decor
  mg1+1d ✓. `turret-parent-audit`: **stranded 0 / abutting 0 /
  dangling 0** = the §B1 freeze state exactly.

## Changed-view verification (my f3c34424 A/B, official pairs)

Diffed my fresh pairs against shots/abrams-b1/after-m1a2 (the f3c34424
certified set, byte-verified by the §B1 critic):

- REF panes: **0 differing pixels, all 14 views** — deterministic
  pipeline, no reference pollution, no framing drift.
- PROC panes: ALL 14 carry visible change; at the builder's t>4 diff
  threshold my counts land on the claim to a few px (view-rear 671 vs
  675, view-left 361 vs 366, close-front 782 vs 795) with bbox
  agreement to the pixel — the claimed counts are honest (my t>2 sweep
  reads ~30% higher, threshold convention only).
- DIFF-OVERLAY DECODE (view-front colorized): every changed pixel rides
  one of the four §B3 items — D1/D2 crown lines + D-left corner, the
  boot ring at the tube root, the wind-sensor station, both bow shoe
  stacks, and the rail bins' faces INCLUDING their end faces at the
  front-view flank skyline (see law discovery 2). Zero out-of-scope
  pixels in any view.
- SILHOUETTE NEUTRALITY (the camo-phase render-only claim): gate-level
  proof is the ×2 zero-delta row (metric silhouette byte-held; the one
  moved sub-display field IMPROVED). Render-level mask-diff (bg-distance
  >13 test) shows 892 px of flips across all 14 panes, which decompose
  fully into: (a) AA flips hugging existing edges (0.61–0.87
  edge-adjacency in front/hero views), (b) pale shoe/bin dressing
  appearing inside near-bg-dark track regions the bg-test cannot see
  (view-top's clusters sit at the two bow shoe stations exactly — law
  discovery 1), and (c) the designed D/E crown corner arcs + bin-end
  tile-tone AA (≤2 px wide slivers, the packet's "front corner arc
  slivers sub-threshold" class). No footprint relocation anywhere.

## §B5/§J yaw evidence AT THE VERDICT HASH (my own renders)

tools/tmp-b5-shots.mjs rest + yaw90 → shots/critic-m1a2-b3yaw/
(byte-identical to the builder's shots/abrams-m1a2-b3port sets, so the
builder's evidence is proven rendered at 248a8468). At yaw 90 the
shell, works field, RAIL BINS (new tiling), bustle rack, CROWS/M240 and
gun rotate as ONE body; the wind sensor, bow shoe stacks, deck kit,
skirts and running gear stay hull-side; nothing sweeps mid-air, nothing
drags the deck. Bucket census confirms by construction: binTile writes
`tb()` (turret family, ring-local), sensor writes `hb()`/hullDark, shoes
write `sb('hullTrack')` — parenting audited 0/0/0.

## §B2 flood (maxch ≤13 AND B−R ≥ +8, label band excluded; my pairs)

front 0 / rear 0 / hero-toptilt 0 / close-front 0 / close-roof 0;
quarters 1–6 px; view-top 14 px (two tail-notch slivers; ref's own 403);
heroes 18/18 px (certified rack-gap class; ref's own 253/277);
view-left 315 px = lane pocket 187 @(963,258) + slit 117 @(1034,303),
view-right 405 px mirrored (277+114) — the certified §B5-recert
stations and counts EXACTLY (b5recert read 315/405 at the same rects).
UNCHANGED from the freeze state; no new enclosed-air class.

## §B3 — the ported grammar, verified at 1×–6× on the official pairs

- GUN-ROOT D/E BAND: dead-ahead (view-front 5×) the tube reads as
  CONCENTRIC RINGS — dark bore, tube wall, boot collar — inside the
  recessed root pocket; the band above carries rounded crown top edges
  (highlight rolls, no razor box corner). Side views (4–5×): crown
  highlight lines on D1/D2 tops, the clamp-collar stations read as
  flank plates with dark tension-bolt segments at z 2.49/3.06, the tube
  exits through the dark boot at the E face. No bare stacked rectangles
  from any of the 14 angles. The close-front dark pocket between the
  cheek tips and D1 is the REF-ENDORSED root shadow pocket (present in
  the ref half at station) — kept, correctly.
- WIND SENSOR: head + dark lens slot + slim mast + collar + base
  bracket read as an instrument dead-ahead and in close-front; the head
  and bracket read from plan next to the periscope ring.
- BOW SHOE STACKS: pad-plate segmentation (3 plates per block) + pale
  guide-horn dots on the outer faces (view-left 8×, both bow corners in
  the heroes; the horn-dot rows also read from plan at the two bow
  track stations). Inner faces stay dark — mask-lawful, hidden behind
  the track from inboard angles.
- RAIL BINS (the m1a2-authored mechanism): both bins carry a 6 mm dark
  lid-seam line + lid band segmented camo | 3 dark latch tabs
  (z −1.80/−1.47/−1.14) | 2 pale hinge points (z −1.965/−0.975) at the
  EXACT certified planes; the right box adds its seam in the exposed
  2.042..2.115 band. Readable at 4–6× from both sides AND end-on from
  dead ahead (the bins' end faces sit at the front-view flank skyline).

## RIGHT-BIN SUBTLE-GRAMMAR ADJUDICATION (the priced residual, honest)

Side-by-side at 6× (m1a2 vs sepv2, same station, my fresh panes): sepv2's
6 mm x-proud dressing casts true relief shadows; m1a2's tone-tiled
grammar reads the same seam/latch/hinge language ~one notch subtler (no
relief shadow), fully readable at 4×+, a faint seam line at 1× ortho.
The proud mechanism is banned here twice over (turret_side 91.03 sits
0.03 over the frozen print line; the right step face 1.415 has zero
proud headroom against the ~1.43 plan-bin boundary — §B5-r2 finding 5,
boundary law). VERDICT: **priced residual delivered, not a miss** —
visible grammar, lawful mechanism, subtler-than-sepv2 as declared.

## Per-view scores (all fourteen, graduation bar ≥9.0 every view,
## fresh pairs, same-vehicle same-tier)

| view | score | named reads |
|---|---|---|
| view-front | **9.1** | Tube-exits-a-ring dead-ahead (boot + bore rings in the root pocket); crown lines on the band; sensor mast + bracket read; bin end faces carry grammar at the flank skylines; certified glacis anchor + skyline lanes hold; flood 0. |
| view-frontleft | **9.1** | Bow shoes + gun band improve the bow corner; §B1 cheek rake; certified corner-handover row carries; flood 6. |
| view-left | **9.2** | Bin seam + 3 latch tabs + hinges at 6×; shoe plates + horn dots at the bow; crown + collar + boot down the tube; certified lane-pocket/slit stations only (315 px = b5recert figure); §B6 trapezoid holds. |
| view-rearleft | **9.1** | Bin grammar from the rear quarter; sprocket bay + wheel row certified reads hold; flood 5. |
| view-rear | **9.1** | Louvered doors + certified plate parity untouched (1 px total render delta); both guns sky-crossing; flood 0. |
| view-rearright | **9.1** | Mirror; contained corners; flood 1. |
| view-right | **9.2** | Bins mirrored (step face = exposed bin face, grammar readable); certified pocket stations (405 px = b5recert figure); trapezoid holds. |
| view-frontright | **9.0** | Sun-quarter disc-pop residual carries (certified polish class, untouched by this round); §B3 items clean. |
| view-top | **9.1** | Shoe horn-dot rows read at both bow track stations from plan; bin lid seams faint from above; works lids/duffel lobes certified reads hold; flood 14 (ref 403). |
| hero-frontleft | **9.1** | Shoes + crowned band at hero range; slope motivates the mass; 18 px = certified rack-gap class. |
| hero-rearright | **9.1** | Bins read as stowage bins at hero range; works field massing certified; 18 px certified class. |
| hero-toptilt | **9.1** | Filled decks; drums/hatch rings circular; bins attached at every angle; flood 0. |
| close-front | **9.2** | The §B3 money view: sleeve band + collars + boot at 4×; shoe plates + horn dots; glacis one-line; ref-endorsed root pocket kept; zero bare cuboids near the gun. |
| close-roof | **9.0** | CROWS + M240 planted; drums circular; rail-window strip stark-at-this-angle certified class carries; bin lids read from the tilt. |

Floor **9.0**, mean **9.11**. No view degraded from its graduation/
B5-recert score; front and close-front IMPROVE on the §B3 axis (the
bare D/E band was the named 1× class).

## §H.4 variant distinctness (four-up, MY fresh proc pixels, one-ticket
## batch: m1a1 / m1a1ha / m1a2 / m1a2_sepv2)

Tells do NOT converge: m1a1 clean-green + bare-roof M2 + hull cable +
exposed wheels + open rack; m1a1ha red-brown two-tone + shielded stowed
M2 + links strip; m1a2 green-dominant + CROWS post + loader M240 +
dressed works field + coil/links flank pair + wavy deep skirts +
scallop pad row; sepv2 red-brown streak + CIP cheek panels + rigid
slatted crate + deck cable + twin fifties. The ported §B3 items are
family REALISM on both buildM1a2 variants (identical grammar, different
bin mechanism), not variant tells — the sep-gated tell blocks stayed
sep-gated (sepv2 b489ba14 byte-exact is the proof). 'Same tank
re-badged' read: absent.

## Honest residuals (carried, priced, none blocking)

- RIGHT/LEFT-BIN grammar is tone-tiled, one notch subtler than sepv2's
  relief dressing at 1× — priced by the 1.415/1.43 boundary law + the
  0.03 turret_side print slack (adjudicated above).
- Bin tiling re-derives boxUV per segment: camo-phase shifts on bin
  faces are render-only — verified silhouette-neutral (gate ×2
  zero-delta; all render deltas decode to §B3 faces + ≤2 px AA).
- Bin END faces at the front-view flank skyline carry 1–2 px AA flips
  at tile-tone boundaries (new, named here; sub-threshold for every
  gate trace — law discovery 2).
- CITV/GPS hoods remain law-blocked (r3 roof-recess 2.4275 lid
  ceiling); ring drums carry the station reads. Documented, not §B3.
- All prior certified carry classes stand byte-unchanged: slit floor,
  drum caps, low-slung CROWS, BISTABLE ref columns, corner-handover
  rows, BIN-EXTENT rear-flank void, frontright disc pop, glsaa_8/CDR
  turret_side triple (0.112 ×3).

## LAW DISCOVERIES (bank)

1. BG-TOLERANCE MASK DIFFS ARE BLIND TO DARK-TRACK REGIONS: the fleet
   dark track/shoe tone (0x171614 class) sits within maxch ≤13 of the
   pane bg 0x151b20 on every channel — a critic's bg-distance mask diff
   counts pale dressing added on dark-track content as "silhouette
   growth" (and B−R keeps it out of the FLOOD, so only mask-style
   instruments are fooled). Decompose mask deltas against the changed
   stations before claiming a footprint move: this round's view-top /
   hero-toptilt "growth" clusters were exactly the two bow shoe
   stations.
2. BIN END FACES ARE FRONT-VIEW SKYLINE CONTENT: aft sponson bins poke
   past the turret planform, so their end faces form the front-view
   flank skyline — Z-split tile tones show end-on there, and tile
   boundaries can flip 1–2 px of edge AA even when every gate trace is
   byte-equal. Expect and name this class on any Z-split tiling port.
3. The builder's changed-view px counts reproduce at diff threshold
   t>4 (t>2 reads ~30% higher on the same bboxes) — record the
   threshold with the counts when banking diff evidence.

## Verdict

**RE-CERT PASS (re-freeze 248a8468, 46 meshes / 116840 verts).**
The round bytes are already at HEAD via the handover snapshot 2a6094b
(hash re-verified post-commit); the orchestrator ratifies this re-cert
+ the packet round section and re-freezes m1a2 at 248a8468; siblings
unchanged (m1a1
97c10194, m1a1ha f5c556dc, m1a2_tejas 3fcae440, m1a2_sepv2 b489ba14,
m1a2_tusk f7ecade4 all verified byte-exact twice). Any geometry edit
before landing invalidates this verdict. Independent critic: m1a2
§B3-port re-cert lane, 2026-08-05.
