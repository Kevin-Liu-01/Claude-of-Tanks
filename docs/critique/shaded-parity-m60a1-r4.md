# Shaded-parity critique — m60a1, round 4 (independent critic, dual-gate half 2)

**Reviewer:** independent shaded-parity critic, 2026-07-31. Single subject:
m60a1 after the builder's r3 response round (commit 34f69b8 "loft weld +
fittings", on top of the fleet shade-collapse fix 412399e). Geometric gate
still PASS (min 90.7, dims 100) — this round judges the visual half only.
**Evidence (all freshly rendered, own vite :7455/:7456):** full board
`tools/procedural-fidelity.html?id=m60a1&board=1` at 2520 px viewport +
native-res board canvases; shaded ref|proc pairs re-rendered from all nine
proof-view directions through the page's own scene/lights (`__FIDELITY_DEBUG`
+ a second renderer on the page's own three instance; no source edits); the
kv2-r3 critic's fixed-world sun-opposite method: per-view median LUMINANCE
over tank pixels only (mask-selected), ref vs proc, under the board's exact
lights (hemi 1.05 / sun 2.2 @ (30,42,24) — left/rear/rearLeft are the shade
faces); hero-perspective pairs from three world directions; eight perspective
closeups; six tell crops; 7-frame back-lit turntable strip at 700 px (the r3
"venetian flash" reproduction conditions). All captures in
`shots/critique-m60a1-r4/` (inventory at bottom). Mask context this run:
**identical to r3 to the decimal** — overall 96.0 / hull 96.7 / turret 91.1 /
gun 96.4 / tracks 95.3, min view 94.45 (rearRight) — the builder's claim
that the weld is silhouette-identical is verified live, not taken from the
commit message. Same question as r1-r3: does the procedural read as the same
vehicle at the same asset-quality tier from a garage camera? Gate: **every
view >= 9/10**, lower-when-uncertain, masks not accepted as proof of likeness.

## VERDICT: **FAIL** (min view 7/10) — but the r3 kill item is dead

Not the program's first dual-gate pass. Close now, and for a completely
different reason than r3. The turret casting war is won: `m60Loft` emits
welded grids with averaged normals and the dome finally survives being lit —
no corrugation, no bustle sawtooth, no open-box tail, from any of the 33
directions sampled this round, including the back-lit yaws that made the r3
turntable flash. The fleet shade-collapse fix holds on this tank: median
tank-pixel luminance ratios ref/proc are 1.01-1.16x across all nine views
(shade faces: left 1.05, rearLeft 1.07, rear 1.16 — the kv2-r3 failure mode
was 2.7-3.6x; the "one paint batch" band of ~1.3x is met everywhere). Front,
hero, side and top now carry the identity effortlessly.

What fails the gate is concentrated at the REAR ASPECT and in two material
overshoots: (1) the reference's wrap-around bustle rack with its stowage and
roof ring — the M60A1's rear identity, already named by r3, already present
as red slivers in the gate masks — is still absent as a shaded read (the
builder's flush frame reads only from high angles and vanishes at side/rear);
(2) the rear-plate grille shipped as 4 thin slats where the reference carries
a full-width diagonal louver wall; (3) the new pale-lens glass BLOWS OUT to
white on upward-tilted faces — the two glacis periscope panes are the
brightest pixels on the vehicle and read as glowing rectangles the reference
simply does not have (cupola vision blocks same family, milder); (4) the
undercarriage renders near-black gunmetal against the reference's
camo-washed track band — structurally the proc gear is now a tier ABOVE the
oracle, but tonally it reads as a different paint batch in every side and
3/4 view. Items 3-4 are material-only and gate-free to fix; items 1-2 are
the flagged silhouette items r3 predicted would need the gate in the loop.

## Per-view scores (9 = same 3D model at game distance; 10 = garage closeup)

| view | r3 | r4 | Δ | verdict driver |
|---|---:|---:|---:|---|
| front | 6 | 8 | +2 | casting clean, twin lamp lenses land, muzzle counterbore reads, cupola correct; two glowing hood panes mid-glacis (ref has none), track columns charcoal vs ref pale tan, searchlight lens doesn't read front-on |
| front-3/4 hero | 4 | 8 | +4 | corrugation GONE — dome is one smooth casting, camo + "123" flow continuously; residuals at hero range: white optic pips, dark track band, uniform grey searchlight box |
| side (right, lit) | 6 | 8 | +2 | silhouette + casting excellent, roofline clean, evacuator now compact mid-tube, decals; undercarriage ~2 stops darker than ref with a crisp black horn-comb fringe the ref's washed band doesn't show |
| side (left, shade) | — | 8 | — | NEW row (kv2 method): shade-side parity HOLDS (1.05x) — no cutout; same undercarriage-tone deduction; cable present but sub-visible (matches ref's own subtlety) |
| rear-3/4 (shade) | 3 | 7 | +4 | r3's three drivers dead (slicing, sawtooth, hollow box); deck louvres read as machinery; REMAINING: no rack/stowage silhouette on the bustle (ref shows rails + boxes + jerry can + roof ring), grille sparse from this angle, grey flap slabs, track tone |
| rear (shade) | 5 | 7 | +2 | bustle tail solid + flush (fixed); grille = 1.18 m slat patch vs ref's full-width louver wall — ref rear still reads "machinery", proc reads "camo wall with a vent"; rack absent from the top-edge silhouette |
| top | 7 | 9 | +2 | plan parity (mask 98.7) + louvres/grille/rack-frame/rails all read from plan; deck arguably busier than this print's own subtle bays — sub-identity |
| articulation strip | 9 | 9 | 0 | all six poses sealed, searchlight pitches with the gun, zero floaters/voids; optic pips visible in every cell |
| turntable (24×15°) | 8 | 9 | +1 | fully coherent; the r3 venetian-blind flash at back-lit yaws is DEAD (re-verified at 700 px on frames 7-13) |

Gate "every view >= 9": **FAIL** (front 8, hero 8, side 8+8, rear-3/4 7, rear 7).
min view 3 → 7; five of nine rows at 8+ short by exactly the items below.

r2-continuity line (SD/MA/WT/TC/HC/SP/OV): **7 / 7 / 8 / 8 / 8 / 9 / 7**
(r3: 4/5/8/3/7/9/4). Turret character 3 → 8 is the weld; materials 5 → 7 is
the shade fix minus the glass blowout and track batch.

## The four tells that hold the gate (with crops)

1. **Bustle rack + stowage absent as a shaded read** —
   `crops/tell4-bustle-rack.png`: ref cell (x 0-800) shows stanchions + twin
   rails wrapping the bustle with two stowage slabs, a handled jerry can and
   the roof tarp ring; proc cell (x 800-1600) shows a roofline-flush frame
   (visible only from high angles), bare wall from side/rear. Also
   `shaded-closeup-turret-rear-left.png`, `shaded-rear.png` (ref rails read
   above the bustle at game distance). r3 flagged this exact item as a real
   silhouette feature the masks already want (red slivers at bustle top rear).
2. **Blown-out pale glass on upward faces** —
   `crops/tell2-glacis-optics.png`: the two periscope hood panes render
   near-white ((910,315)-(1080,375), (1355,360)-(1500,425) in the proc cell)
   — the single brightest surface on the tank; the ref glacis carries NO pale
   optics at all. Same family: cupola vision blocks
   (`crops/tell6-cupola-blocks.png`, three white chips) — r3 asked for glass
   tone and "lighter" blocks; the shipped material overshoots from
   near-black chips to lit-LED white. Round lamp LENSES (vertical faces) are
   correct — the blowout is the sun-normal tilted panes.
3. **Rear-plate grille coverage** — `crops/tell3-rear-plate.png`: ref rear
   plate is a full-width diagonal-louver wall (two banks, upper 2/3 of the
   plate); proc is flat camo with the transmission ring + four 1.18 m slat
   bars. `shaded-rearRight.png` shows the game-distance consequence: ref rear
   reads ribbed machinery, proc reads plain.
4. **Undercarriage tone batch** — `crops/tell5-track-tone.png`: proc track =
   near-black shoes/horns/connectors + tan inner band (structurally the best
   gear in the fleet, better than the low-poly oracle); ref = camo-washed
   grey-olive band, wheels included. ~2-stop local delta over the largest
   contiguous region of every side/3/4 view, and the crisp horn comb reads as
   a black sawtooth strip above the wheels where the ref shows a soft band.
   (Direction INVERTED vs r3's "slightly warm/tan" note — the shade fix
   re-based both models' response.)

Cosmetic (not gate-holding): cupola spine blade + M85 stub + searchlight body
are unpainted grey — the blade especially reads as an unexplained grey plank
at closeup (`crops/tell6`); searchlight bezel/lens never reads front-on
(`shaded-front.png`) though the instrument-not-camo-box ask is met; proc
surface stipple is visible at garage range where the ref is smooth; rear
corner flap slabs are squarer than the ref's rounded curled panels.

## Per-component notes

- **Turret casting (r3 KILL ITEM — CLOSED):** welded grids verified in every
  view including 700 px back-lit turntable frames; hard creases only at the
  true knuckles (left cliff shoulder, ridge, right roof break) — correct cast
  language; camo blotches and both "123" decals flow unbroken; bustle tail is
  a flush camo face. The masks this run equal r3's to the decimal, proving
  the weld moved zero silhouette pixels.
- **M19 cupola:** structure complete (ring, band, 7 blocks, domed cap, M85
  box + stub, blade). Blocks now GLASS but white-hot (tell 2); blade/stub
  grey. Reads as the right cupola with odd lighting.
- **AN/VSS-1 searchlight:** dark-steel body + lid + two-arm yoke + trunnion —
  reads as an instrument, exactly what r3 prescribed; the recessed lens/bezel
  fails to read at any distance (flat dark face), body uniform at closeup.
- **Gun/mantlet:** compact evacuator collar sits mid-tube matching the ref
  band; muzzle carries a dark counterbore that reads a bore from the front;
  boot/rotor unchanged and correct-width; root collar still slightly chunky.
- **Hull front:** twin lamp pods with pale lenses inside the hoops — the r3
  "dark sockets" tell is closed and matches the ref's twin-lens pods; splash
  board, hoods, shackles, camo-painted mud flaps (black-void box CLOSED).
  Hood glass panes are tell 2.
- **Hull rear/deck:** louver banks on the crown read as intake machinery from
  rear-3/4/top (r3 item CLOSED); rear grille only a patch (tell 3); pintle +
  ring present; tow cable on the left fender with cleats — present, reads
  only at closeup, parity-consistent with the ref's own faint cable.
- **Running gear:** best-in-fleet structure (bolted hubs, rubber ring,
  linked track with horns + end connectors, correct wraps and ramps, two-tone
  band); tone batch mismatch is tell 4.
- **Materials:** shade-side ambient collapse FIXED and verified by
  measurement (`pair-luminance.json`: all nine views 1.01-1.16x, shade faces
  included; pre-fix fleet was 3.8-4.7x per docs/critique/shade-parity-*.json).
  Camo palette/scale matches the print family. Glass overshoots (tell 2).

## Prioritized fix list

1. **Calm the pale-glass response on tilted/up-facing panes (material-only,
   gate-free).** Hood panes worst, cupola blocks second: drop albedo toward
   ~0x6a7a85 and raise roughness ~0.55, or keep the pale tone but tilt the
   panes off the sun normal. Success test: panes no longer the brightest
   pixels on the front ortho; lamp lenses may stay as-is. Fixes front + hero
   + articulation-cell pips at once.
2. **Undercarriage tone parity (material-only, gate-free).** Lift track
   shoe/horn albedo toward the ref's grey-olive family (or apply the camo
   overwash tint the print carries) and soften horn-tip contrast (paint horns
   the band tan). Success test: side-view local track-band median within
   ~1.4x of ref's. Fixes the largest-area delta in four views.
3. **Real bustle rack + stowage (SILHOUETTE — gate in the loop, r3 item 7).**
   Stanchions + proud top rail at the masks' red-sliver band, 1-2 stowage
   slabs + jerry can inside the frame, roof tarp ring at the ref's (565-760,
   330-420) crop station. The gate already wants this volume (ref-only
   slivers at bustle top rear); done measured, it should IMPROVE turretCurves
   / IoU while closing the last rear-identity gap. This is the single item
   between rear/rear-3/4 and 9.
4. **Rear-plate grille to full width (small geometry, flush precedent
   holds).** Extend the slat treatment to the ref's full-width band (dark
   inset + 8-10 slats or louver texture at the -3.2805 flush plane). Cheap
   gate risk; re-run --ids=m60a1,m60a3 to confirm.
5. **Free cosmetics:** camo-paint the cupola blade + M85 stub; give the
   searchlight a pale bezel ring + dark glass disc so the face reads
   front-on; consider the rear flap slab corners (ref's are rounded/curled).

Items 1-2 take front/hero/sides to 9 without touching a silhouette pixel;
items 3-4 take rear/rear-3/4 to 9 with the gate in the loop. That is the
full dual-gate pass, one round away, and for the first time the list
contains no unknowns — every remaining item has a named mechanism and a
measurable success test.

## r3 ledger (what this round actually moved)

CLOSED from r3: contour-slice corrugation (kill item) — welded, verified
mask-identical live; bustle sawtooth rim + open-box end cap — flush cap
reads solid; venetian-blind turntable flashing — dead at 700 px back-lit;
headlight sockets — twin pale lenses per pod; muzzle flat cap — counterbore
bore; front-left black-void fender box — camo-painted; engine deck bare —
louvre banks read; evacuator over-long/root-biased — compact mid-tube
collar; fender tow cable — present with cleats; grab rails hairline —
0.034 stock reads in plan; searchlight two-camo-boxes — dark instrument
with yoke; glass nowhere — glass everywhere (now too hot: new tell);
shade-side ambient collapse (fleet) — measured 1.01-1.16x.
STILL OPEN from r3: bustle rack + rear stowage (flush frame is not a rack);
rear-plate grille (patch, not wall); searchlight lens read.
NEW in r4: pale-glass blowout on tilted panes; undercarriage tone batch
(inverted from r3's warm/tan note); grey blade/stub/searchlight paint nits.

The dual gate stands: geometry locked at 90.7, and the shaded half now
fails on a short, fully-mechanized list instead of a casting rebuild. Weld
held, lights lit, shade fixed — hang the rack, spread the grille, calm the
glass, wash the tracks, then this tank passes.

### Shot inventory (shots/critique-m60a1-r4/)

`board-fullpage.png`, `shaded-hero-pair.png` (board native),
`articulation-strip.png`, `turntable-24x15.png`, `turntable-backlit-7f.png`,
`shaded-{front,frontLeft,left,rearLeft,rear,rearRight,right,frontRight,top}.png`
(2000x1000 ref|proc pairs, page cameras + lights),
`shaded-hero-{front-right,rear-left,left}.png` (per-model perspective),
`shaded-closeup-{turret-front-right,turret-rear-left,bow,running-gear,garage,deck-rear,muzzle,cupola}.png`,
`crops/tell1-searchlight-face.png`, `crops/tell2-glacis-optics.png`,
`crops/tell3-rear-plate.png`, `crops/tell4-bustle-rack.png`,
`crops/tell5-track-tone.png`, `crops/tell6-cupola-blocks.png`,
`fidelity-report.json` (masks: 96.0 overall, min view 94.45 — r3-identical),
`pair-luminance.json` (per-view median tank-pixel luminance, ref/proc/ratio).
