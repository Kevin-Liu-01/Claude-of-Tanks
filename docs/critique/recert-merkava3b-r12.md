# merkava3b GRADUATE RE-CERT r12 (track-containment round) — 2026-08-03

Scope: dual-gate graduate (freeze 5296950a, r8 critic 9.0 all nine), re-cert
of CHANGED regions only per the graduate-change protocol: sponson-floor
station lifts (interior), keel.hwClamp 1.13 (belly strips), cornerCurtain
tiers re-seated OUTSIDE the band shell, rearFlaps[0] −3.90 → −3.945,
frontBoard z1 2.17 → 2.26, in-band tone-wall clamps, tailRack.frontClear
{z −3.92, bot 1.06}. Graduation cert stands for unchanged views/members.
Renders: fresh `node tools/tmp-tank-critic.mjs --id=merkava3b` →
shots/critic-merkava3b/ (14 views, zero console errors) + zoom crops at
shots/critic-merkava3b/crops/ (tools/tmp-recert-crops-merkava3b.py,
tmp-recert-crops2-merkava3b.py; enclosed-sky scans
tmp-recert-skyscan-merkava3b.py, tmp-recert-holeprobe-merkava3b.py).

## Official-rig evidence (my own runs, this tree)

- `tools/track-clip-audit.mjs --exact --ids=merkava3b`: **front 0 / rear 0**
  (was 315/727, the fleet-worst rear). The fix's whole point, confirmed on
  the official tool.
- `tools/tank-standard-check.mjs --ids=merkava3b`: gate min **90.1**,
  components **90.4/90.1/90.5/93.5/100/100** — matches the builder's PASS ×2
  line exactly (third independent confirmation, at the graduation-class
  line). Contiguity **0 holes** (§B2 machine scan), clip 0/0 ✓. Decor
  `mg0+0d ✗` is the carried §I packet justification (3B roof guns are
  hand-authored ref-parity graduation anatomy, same owner call as 3D) — not
  a new failure.
- `tools/tmp-hashgeo.mjs`: merkava3b **a4ed2c82** (41 meshes / 146058
  verts) — matches the packet's NEW re-freeze hash exactly. (merkava3c
  1d9b026c / merkava3d 4515d944 recorded for the orchestrator — their own
  r12 re-certs cover them, out of my scope.)
- `tools/visual-evaluator.mjs --id=merkava3b`: exit 0, **no RIG MISMATCH** —
  yawProxy ≤1.1° on all 14 views (worst front 1.1°, rear 1.0°; abort
  threshold 10°). Evidence at shots/visual-eval-merkava3b/.
- My 14 fresh critic views are BYTE-IDENTICAL to the builder's
  shots/merkava-r12/critic-merkava3b-final set — the builder's self-audit
  rects (corner zones ε-class or ref-ward, wheel rows byte-identical) were
  computed on exactly the state I judged.

## Per-focus-view verdicts (changed regions, same-vehicle-same-tier)

| view | score | read |
|---|---|---|
| rear | 9.1 | Dead-rear containment clean: flap curtains cover both track cross-sections, no hull solid in either band, no sky slit between flap hems and track blocks (enclosed-sky scan: ~7 px of specks in-tank; the recurring y13-21 clusters every view are letter-holes in the pane's header text, not tank). Corner stacks keep the certified crumpled grammar; flap band tone moved TOWARD ref (builder-sampled med 93.8 → 87.8 vs ref 70.8). Rear-face flags are the certified canvas/chain organics at y 2.2-2.6 (unchanged members). |
| rearleft | 9.1 | 3-4x stern crops: idler wrap arc round and UNBROKEN (pad stubble + horns silhouette), curtain-slat tops meet the hull tail line (attached), slats occlude the band correctly now that tiers sit OUTSIDE the shell, flaps clear of the wrap rear face (no coincident-face shimmer). Builder's cornerL med IDENTICAL 72.3. Evaluator's stern low-zone flag is Δ−1.8° against a printed 4.0° noise band at [−0.07, 0.51, −4.03] — no-finding class. |
| rearright | 9.0 | Mirror-clean wrap + curtains; corners p25 86.3/87.1 moved toward ref 93.7/93.8 (builder rects, same tree). One 5×5 px sky pocket at px(779-783,365-369) = under the frontBoard rear end (see close-front note) — sub-visible at 1x, board still reads attached. The Δ−11.3° len 0.48 at [1.37, 1.68, 1.37] is the glacis/skirt-lip corner class on an unchanged member (standing cert). |
| front | 9.1 | Bow bands head-on: pads + in-band fill walls + board faces, no sky slit, no solid through either band — the clamped tone walls read as the ref's own flap-curtain fill. The 1-px "enclosed" column at x738 sampled med (72,71,58) — AA seam, not background; no-finding. All front flags are turret-roof/crest micro-segments (unchanged, most below the ±4° floor). |
| close-front | 9.2 | The money view: sprocket wrap arc fully visible with pad texture and NO plate crossing the ring — the old frontBoard underside crossing (z 2.17..2.24) is gone; the board shelf now hugs the crest with honest air beneath and its root buried in the bow mass. Glacis, louvres, light pods, hem teeth all certified-state. The 175-px enclosed strip at px(796-826,248-256) is air under the certified sagging cable run (attached both ends, unchanged zone); Δ−9.7° len 0.31 at [−1.01, 0.23, 1.99] is the skirt-arch-vs-ref class the held gate prices (r12 touched only interior fills there). |
| left | 9.1 | Lane edge: belly strips fully behind the run after keel.hwClamp (no poke below or through, 4x belly strip crop clean), run continuous two-layer shoes, bow AND stern wraps clear at 4-6x, curtain occlusion correct. MG rod float lines, wavy hem, band grammar all survive. Stern flags at z −3.26..−3.39 sit at y 1.77-1.87 = basket-rim/pack-crown organics (unchanged, certified canvas grammar), not the wrap. |
| right | 9.1 | Mirror: wrap arcs clean, curtain tops attached (J2 crop), board junction seam reads as a 1-2 px panel shadow at 6x. Low-zone flags either below noise floor or the same unchanged corner classes as left. |

Supporting (non-focus, checked): hero-rearright perspective corner reads
attached with certified open-frame basket windows; hero-toptilt deck FILLED
(§B2) — its enclosed-air chain is the certified cut-hem scallop /
under-sponson openings along the skirt run (ref shows the same class;
machine top-down scan 0 cells); view-top muzzle-flank slots are the gun
overhang over the bow boards (certified anatomy). No new see-through void
anywhere; every r12-moved member (curtain tiers, flaps, board, rack front
third) reads attached per §B2.

## RE-CERT: YES

All changed views ≥9.0 (min 9.0 rearright; max 9.2 close-front). Bow and
stern show zero track clipping at 1x from every angle (0/0 on the exact
audit), the re-seated corner curtains and pulled-back flaps/board read
attached, the graduation-certified look (canvas crumple, chain fringe,
open-frame rack, rod float lines, wavy hem, pale sand tone) survives
untouched, and the 90.1 gate line + a4ed2c82 hash match the packet.
Re-freeze at the orchestrator's landing commit is approved from the critic
side. No coordinate orders.

Residuals (declared, priced, non-blocking): 5×5 px under-board air pocket
at the board rear end in view-rearright only (ε-class, standoff-plank
grammar); board-to-skirt 1-2 px junction seam in elevations; the
pre-existing whip-tip aliasing pair, ringTub quantization, and
skirt-arch-vs-ref hem class all stand under the graduation cert.
