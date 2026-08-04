# m1a1ha GRADUATE RE-CERT r4 (abrams track-rig + variety round) — 2026-08-03

Scope: dual-gate graduate, re-cert of CHANGED regions only. Changed set
(shared with m1a1, per m1a1.md/m1a1ha.md round sections): TEJAS_HULL
laneCarve (bow window z 2.60..3.49, stern z −3.61..−2.90, blade/wedge
narrowed to ±1.08), gear_wrapPads per-side migration (render-identical
claim), rear grille doors narrowed onto the ±0.9925±0.0925 inter-track
wall + TIP box re-mount, and the DISTINCT §H.4 loadout: rackDufMul
[1,0,0] + stowed pintleMG 'm2' WITH SHIELD + FITTINGS.spareTrackLinks
strip on the freed rack floor. Graduation cert stands for unchanged
views. Renders: fresh `node tools/tmp-tank-critic.mjs --id=m1a1ha` →
shots/critic-m1a1ha/ (14 views, zero console errors, this session) +
zoom crops at shots/critic-m1a1ha/crops/ (tools/tmp-recert-crops-m1a1ha.py).

## Official-rig evidence (my own runs, this tree)

- `tools/track-clip-audit.mjs --exact --ids=m1a1ha`: **front 0 / rear 0**
  (was 1139/683 pre-round on the shared family build). The §B4 point of
  the round, confirmed on the official tool.
- `tools/tank-standard-check.mjs`: gate min **89.4**, components
  91.7/89.4/89.6/93.5/100/100 — matches the packet's bisect-proven hold
  line exactly (whole/turret carry the pre-existing tejas-oracle
  override-path drift; pristine HEAD reads the identical 89.4 ×3 per the
  packet — orchestrator lane, NOT a render defect; I judged renders as
  briefed). Contiguity **0 holes** ✓, clip 0/0 ✓, decor census
  **mg1+1d ✓** (the stowed rack M2 fitting + the link-strip dressing;
  the roof CWS gun remains the certified hand-authored §I class).
- `tools/tmp-hashgeo.mjs`: m1a1ha **b14be581** (46 meshes / 158212
  verts) — exact match to the packet's NEW FREEZE HASH. m1a1 reads
  4640af94 (46/158680): the two graduates now hash differently, as the
  variety round intends.
- `tools/visual-evaluator.mjs --id=m1a1ha`: exit 0, **RIG PARITY OK**
  (11 ortho views, max dYawProxy 1.7° @close-roof, max |dCentroid|
  0.041 m — no RIG MISMATCH, abort threshold 10°). Evidence at
  shots/visual-eval-m1a1ha/ (report.json + annotated overlays).

## Per-focus-view verdicts (changed regions, same-vehicle-same-tier)

| view | score | read |
|---|---|---|
| front | 9.2 | Both track bands read complete columns with ZERO bow-blade material through them at 1x/2x; carve walls tuck behind the tracks as dark inboard faces; belly rim attached to the lower plate. Evaluator: p95 Δtop 0.168 m / Δbot 0.114 m, yawProxy 1.2°, worst matched flag Δ+3.1°±0.5° on a 0.47 m plumb-vs-lean edge at x −1.09 y 0..0.20 (dark under-hull band, ~2.5 cm — sub-tier). |
| close-front | 9.2 | The money view: glacis rakes per §B1, bow DIVES over the idler wrap, wrap arc full with shoes, fender wings attached, no see-through anywhere in the changed window (z 2.60..3.49). Flagged deltas (Δ+12.3° @z 2.15..2.31 y 2.90; profile Δtop +0.403 @z 3.37) live in the certified CWS/gun-over-bow band — untouched region, standing height-stylization cert. yawProxy 0.9°. |
| rear | 9.1 | Sprocket wraps untouched by the narrowed grille: pale slat grille + cage posts sit fully INBOARD on the surviving inter-track wall, symmetric, green wall visible between grille end and each track band. TIP box re-mount reads attached inboard of the left band (no wrap contact). refOnly 31 edges are oracle-side rear clutter (pre-existing parity class). Worst flag Δ+4.4°±0.7° on a 0.31 m wrap-edge lean at x 1.81 (track-lump class). p95 Δtop 0.143 / Δbot 0.076, yawProxy 0.8°. |
| left | 9.2 | Tightest view of the set: p95 Δtop 0.084 / Δbot 0.084, yawProxy 0.1°. Skirt/track seam continuous, stern and bow wraps clean behind the skirt line — the gear_wrapPads migration is render-neutral on the numbers. Worst flag Δ+13.3° is a 0.33 m stern-lip corner segment AT the ±4° floor → §D no-finding class. |
| right | 9.2 | Mirror-clean: p95 Δtop 0.061 / Δbot 0.084, yawProxy 0°. The Δ−8°±0.8° 0.37 m fender-tip droop at z 3.47..3.82 is certified fender geometry (unchanged this round). |
| top | 9.1 | Deck FILLED (§B2 machine scan 0 enclosed cells; no sky through hull or turret in plan). Loadout stays inside the certified rack envelope: M2 reads as a transverse dark gun with the SHIELD cross-plate breaking the barrel line; link strip reads as a low flat stack (tops 2.00, deliberately under the stowed barrel — faint in straight plan, clear at tilt). Nothing pokes the rack rails. Worst matched flag Δ−1.9°±0.1° (gun-tube plan taper); the big Δbot lines are the tool's own declared cliff-offset non-findings. |
| hero-toptilt (55°) | 9.1 | No sky through hull/turret at tilt. The §H.4 showcase: shield plate upright over a real receiver MASS (not a stick), muzzle out over the freed floor, three raked link shoe-faces beside it — all under the rail line. The 6.035 m² "enclosed void" is the tool-disclaimed barrel/deck-gap class (§B2 scan reads 0). Δ+4°±0.2° stern-quarter rake (1.25 m) is the pre-round class covered by the standing cert; remaining flags are ±4°-floor corners. |

Non-focus sweep (regression check only, standing cert regions):
frontleft/frontright 9.1 — the ONE genuinely new silhouette class of the
round lives here: with the blade narrowed, the lower-bow quarter edge at
z 2.96..3.11 y 0.40..0.66 is now the track's climb line, Δ−10.9°/+8.9°
(±0.8°) vs the ref's blade toe over 0.42 m (~6 cm, dark under-bow seam).
It is SYMMETRIC, reads correct at 1x/2x (tracks proud of hull solids —
the §B4 trade, leo2a6 r4 precedent scored the same class 9.1), and I
declare it below as the round's residual. rearleft/rearright clean
(grille inboard at quarter angles, wrap full). hero-frontleft,
hero-rearright, close-roof carry only certified-band flags (the
hero-rearright paired arc r0.32 vs 0.35 fit ±3.6 mm reports the REF
polygonal at 8 facets — oracle-side, no order); hero-rearright void
2.517 m² is the same disclaimed class as toptilt.

## §H.4 VARIANT-DISTINCTIVENESS (standing check, 4 built family members)

Not a re-badge — the garage tells, named (evidence: same-box top-view
crops top-proc-rack vs top-m1a1-rack vs top-tejas-rack under
shots/critic-m1a1ha/crops/):

- **vs m1a1** — the HEADLINE TELL is the ARMOR SHIELD on m1a1ha's stowed
  rack M2: in plan a dark cross-plate breaks the barrel line; at
  tilt/rear it stands upright over the receiver (top 2.27, under the
  2.31 fill class — confirmed riding below the rail line in
  hero-rearright). m1a1's stowed M2 is BARE (only the round cradle knob
  on the barrel run). Second tell: m1a1ha's 3-link spare-track strip flat
  on the freed floor (three raked shoe faces at tilt) where m1a1's floor
  is empty — m1a1's own tell being the tow-cable run along its left
  sponson wall band. (A straight pixel diff of the two top views is NOT
  usable evidence — per-id camo seeds repaint the whole deck; see
  tools/tmp-rackdiff-m1a1ha.py header.)
- **vs m1a2_tejas / m1a2_tusk** — tejas stows the slighter M240/MAG
  (short bare barrel resting at the right-duffel edge), KEEPS a right
  duffel (rackDufMul [0.7,0,1] vs m1a1ha's [1,0,0] single-duffel rack)
  and adds an antenna base pot by the rear-left post; roof identity
  differs (CROWS head vs the m1a1/m1a1ha CWS station), and tusk adds the
  full TUSK kit besides.

## RE-CERT: YES

All changed/focus views ≥9.0 (min 9.1, max 9.2). Containment is real on
the official audit (0/0 exact, target ≤60), the loadout is distinct,
census-clean and envelope-contained, RIG PARITY holds on every view, and
hash b14be581 (46/158212) matches the packet freeze line exactly.
Re-freeze at the orchestrator's landing is approved from the critic side.

Conditions/orders for the orchestrator (none blocking the render cert):
1. The §A gate lands at 89.4 = the bisect-proven PRE-EXISTING
   override-path drift (pristine HEAD identical ×3). My YES certifies
   the renders and the changed regions; the drift adjudication stays in
   the orchestrator lane per the brief and should land with the freeze.
2. Declared residual to carry in the packet: bow-toe quarter-silhouette
   now follows the track climb line (Δ~9-11° over 0.42 m at z ~3.0,
   symmetric) — the priced §B4 trade, not a defect.
3. Optional polish, NOT an order: in straight plan the link strip reads
   flush/faint (tops 2.00 over the 1.88 floor). If a later variety round
   wants a louder plan tell, a second stacked link (~2.08) still clears
   the 2.31 class. The tilt/garage read is already unmistakable.

Residuals otherwise: certified height-stylization deltas in the CWS/roof
band (close-roof Δtop +0.41 m class), oracle-side rear clutter and the
8-facet ref drum — all pre-round, covered by the standing graduation cert.
