# m1a2 shaded-parity r2 — independent critic verdict (2026-08-03)

FIRST CRITIC ROUND vs the SEPv2 oracle (the pre-switch verdicts r1-r5 in this
folder judged the retired mislabeled-Leopard print — history, not precedent;
this file replaces the old-oracle r2 text at the orchestrator's instruction,
which survives in git history).

Provenance: pairs re-rendered FRESH via `node tools/tmp-tank-critic.mjs
--id=m1a2` at 13:51 while HEAD was **32a2252** (the landed visual-r2 commit)
with `src/vehicles/profiles/abrams.js` and `kit.js` clean. 14/14 saved, zero
console errors. HEAD moved to 617e66e during adjudication; audit of the
interval: the render's working tree carried the then-uncommitted device-tier
edits (materials.js 13:22 / tankFactory.js 13:33, landed as 0ff25fb) — the
critic rig pins `quality:'high'`, and the builder's r2 claim rects reproduce
TO THE DECIMAL below, proving the proc pixels are the landed r2 build; the
m1a2 NC-gate specs.js change (6cca518, mtime 14:00) postdates the render and
only gates the quarantined ref GLB out of PUBLIC builds (local dev — this
rig — keeps it). The scored pixels are the builder's landed round exactly.
Scored ONLY `shots/critic-m1a2/*.png`. Measurement: `tools/tmp-m1a2r2c-stats.py`
/ `-stats2.py` / `-crops.py` (ITU-601 luma; bg discriminator |px−0x151b20|
maxch ≤13; enclosed-air flood census with exact-clear-color hole
discrimination d≤1 vs dark-paint d6-13).

Registration audit: all 14 pane bboxes within ±6px (view-top IDENTICAL
203×545 both panes; sides dW 0-2). Proc side panes run dH +5 (tallest point
~9cm over ref's this run) and hero-toptilt proc touches the frame bottom
(y639, ref stops 621) — framing artifacts of per-model bboxes, noted, not
scored. BISTABLE GATE-REF law honored: the ref's CROWS pose this run is
slewed forward over the bow; no pose-dependent column is faulted below.

## HEADLINE: FAIL — no view reaches 9.0. Floors 8.0: view-top,
## hero-toptilt, close-roof. The twelve remaining views 8.5. Mean 8.39.

The identity question is settled: every view reads "same vehicle, same tier"
as an M1A2 SEPv2 at arm's length — stance, one-line raked glacis, low wide
turret, busy racks, skirted hull over live running gear. This is also the
cleanest claims round this vehicle has had: **every builder number I
re-measured reproduced on the official rig** (trackband to the decimal), and
the disclosed-residual list is accurate. What separates 8.5 from 9.0 is
concentrated in five drivers: roof-from-above relief+level, the MG read
(law), the rear grille ladder, the sight-band daylight slit (the one
undisclosed defect), and the front dark-glacis anchor.

## Per-view scores (builder self-read in parens)

| view | score | justification |
|---|---|---|
| view-front (9.0) | **8.5** | Registration exact (549px both). Cheek staircase-moiré DEAD (flip% 1.47/0.14 vs ref 1.04/0.80). M250 bank, corridor baffles, flaps, bore ring all read. Held under 9 by: glacis band +12L bright of ref's dark anchor (proc (820,340)-(1100,430) L64.6 vs ref L52.3); the mantlet PORTAL (two vertical legs + header, x930-1010) reads architectural vs ref's shadowed embrasure; no weapon anywhere on the roofline (the ref shows its M2 station); turret rows y140-260 run +10..+33px wider — works-field walls fuse into one slab skyline where the ref's fittings line is broken by sky. |
| view-frontleft (8.8) | **8.5** | Rake reads, skirts+wheels+smoke bank good. Boxy two-story roof skyline (rack corner towers + fused works walls); sight-band crates over the bow; no MG read. |
| view-left (8.9) | **8.5** | Trackband claim EXACT (proc (700,352)-(1120,392) L52.8 sd8.1; ref L56.0 sd7.3) — the r1 flat slab is genuinely cured; wheels, link seams, grousers, skirt bevels/slits/mount strips all read. Held under 9 by: the DAYLIGHT SLIT under the sight band — 147px of exact clear-color enclosed at (1034,303)-(1055,311), z≈2.25..2.63, vs the ref's own 52px pocket at the same station (class ref-endorsed, size ~3x over) — the crates read detached; fused container-stack turret skyline over z −1..−3; skirt band ~7L dark of ref with smaller pale patches (largest blob 493px vs ref 1067). |
| view-rearleft (8.8) | **8.5** | Corner rack + jerry boxes read SEPv2-busy; corridors dark; duffel row reads. Rear-flank louver ladder bright (echo of the view-rear driver); boxy turret skyline. |
| view-rear (8.7) | **8.5** | The rack row is the best element on the tank: rounded duffels + strap arcs + crate + jerry slats, ref-class. Held down by the GRILLE LADDER: proc door fields carry 4-5 bright slat rows rowmax L83-85 over bed 66.5 vs the ref's FUSED dark louvers (0-1 peaks, rowmax 66-68); plate field proc L69.3 sd9.9 vs ref 61.1 sd4.4 (reproduces the builder's residual); camo patches painted on a plate the ref keeps bare-dark; works-field shelf band above reads wide and flat. |
| view-rearright (8.8) | **8.5** | As rearleft, mirrored. Slat ladder visible on the rear face at 1x. |
| view-right (8.9) | **8.5** | Mirror of left: slit 159px exact-bg at (864,303)-(886,311) vs ref 40px; sight-band slab dominant at the gun root; wheels/track band parity good. |
| view-frontright (8.8) | **8.5** | As frontleft. Cheek planes smooth; right M250 full bank reads. |
| view-top (8.8) | **8.0** | FLOOR. Registration identical; bow half (chevron, shackle tees, tube covers, grille beds, fuel caps) near-exact. Roof half carries four misses: whole roof −8L dark of ref (proc (880,220)-(1040,330) L53.8 vs ref 62.1; p95 63 vs 81 — the ref's bright patch tops have no answer); saddle reads as a hard-edged DARK PIT (tarp+pad rectangle (916-986,170-217), p05 42) where the ref shows fat pale duffel sausages; track flanks dark/flat (proc R sd 5.7 vs ref 15.9 — the sun-lit scalloped link tops missing); CROWS = one black slot + thin frame, no gun read (the ref's M2 shape is legible from top). |
| hero-frontleft (8.8) | **8.5** | Strongest hero: rake, stance, busy racks, dark corridors. Boxy roofline + no MG + plain works-field side faces hold it. |
| hero-rearright (8.8) | **8.5** | Rack/duffels/flaps good; grille ladder bright on the rear face; roof = flat rings + slots at hero range; works-field sides plain camo slabs. |
| hero-toptilt (8.8) | **8.0** | FLOOR. Contiguity holds (zero exact-bg through decks — every dark cluster is paint, d6-13). But the roof is still a DRAWING at 55°: both hatch rings render as painted circles with 1-2px lips (ref pane: proud drums with real rim shadows at the same tilt); saddle pit; roof −8L; only the M240 pintle curl breaks flatness. The certified 2.4275 lid ceiling explains flush LIDS — it does not require a flush PLATE (recess unexecuted; order 1). |
| close-front (8.9) | **8.5** | Moiré numerically dead; shroud/collar/bore, splash strip, visor blocks, shackles, chunky grousers all read. Glacis wears bright turret-family camo vs the ref's near-black plate; sight-band crates + portal own the upper read where the ref shows doghouse + M2. |
| close-roof (8.8) | **8.0** | FLOOR. Ref pane: proud cupola drum + open hatch ring + sight masses. Proc pane: two FLAT painted rings with tick blocks, black slots, 1-2px plate steps — a decal-sheet read at inspection range. The M240 exists (pintle + receiver + short barrel beside the ring — the set's only gun-ish read) but is ~10px and crest-less; the CROWS M2 never reads as a weapon in any of the 14 views (slots + frame only). |

## Claims audit (§D — official pairs, re-measured)

- **view-left trackband**: proc L52.8 sd8.1 / ref L56.0 sd7.3 — EXACT to the
  decimal on all four numbers. Running-gear identity claim BANKED.
- **view-front wrap**: my lit-side rects ref L76.7 sd15.2 / proc L62.2 sd10.5
  (builder L73/L64 — same class, direction honest). The "beige cardboard
  drums" are dead; corridors genuinely dark. Note: proc wraps are
  L/R-symmetric (62.2/62.5) where the ref's respond to the sun (76.7/60.2).
- **rear plate residual**: proc L69.3 sd9.9 vs ref L61.1 sd4.4 (builder
  69.6/10.5 vs 61.3/4.4) — reproduces; honest disclosure, now the top order.
- **bustle zone**: proc L68.0 sd11.8 vs ref L70.7 sd11.3 — parity class as
  claimed.
- **moiré killed**: verified (cheek flip% at/below ref class both sides).
- **salmon end-caps killed**: verified fleet-wide — 0 strong-warm px (R−G≥18)
  on ALL 14 proc panes, max 2 weak px; the ref itself carries 1925-7455 warm
  px (its rust band), so the proc is now the cooler of the two panes.
- **duffel row**: DELIVERS from rear/quarters (sacks + strap arcs + crate);
  does NOT deliver from top (dark pit — see floors).
- **Disclosed residuals all confirmed**: proud-cupola bin ceiling (flat
  rings), sight-band crate massing, low-slung CROWS, works-field plain side
  faces, camo patch structure (my rects measure proc patches SMALLER than
  ref's, not larger — structure differs either way), skipped whips (moot this
  run: the ref pane rendered no whip either; zero score impact).
- **Undisclosed finding**: the sight-band daylight slit (147/159px exact
  clear-color enclosed vs the ref's own 52/40px pocket at z≈2.2-2.6).

## Standing checks (§B owner laws)

- **FRONT-SLOPE**: PASS. One-line raked glacis reads at close-front, both
  front heroes and quarters (foreshortening + splash-strip ridge + highlight
  gradient); certified profile 1.14@3.97 → 1.40@2.19 intact.
- **CONTIGUITY / NO HOLES**: PASS-with-flag. Top + 55° tilt: ZERO exact-bg
  enclosed pixels — every dark cluster is paint (d6-13), no sky through hull
  or turret. Flag: the side-view sight-band slit IS true see-through
  (exact-bg), a class the ref itself endorses at 40-52px at the same station;
  the proc's 3-4x oversize is ordered closed to ref class (order 7), not
  ruled a law breach.
- **DECORATION / MG PHYSICS**: **FAIL as rendered.** Both guns exist in
  geometry (census passes; pedestal/receiver/barrel parts verifiable in
  crops) but the law requires they READ: the CROWS M2 reads as a black slot +
  thin frame from every one of the 14 views; the loader's M240 reads only at
  close-roof/toptilt as a ~10px pintle curl. The ref's M2 reads as a weapon
  from front, sides and close-front this run — pose-aided, but the mechanism
  (a barrel crossing a LOW local deck line) is copyable without faulting
  pose columns. Orders 4-5.
- **TRACK CONTAINMENT**: PASS (renders judged; the audit tool is blind to
  this hand-rolled track). Front/rear ortho corners + close-front: wrap
  arcs, ramps and grousers stay clear of the bow shackle row and the stern
  notch wall/flaps; no clipping, no floating bands in any of the six
  relevant views.

## Fix orders (r3), grouped by driver — floors first

DRIVER 1 — ROOF RELIEF + LEVEL (view-top 8.0, hero-toptilt 8.0, close-roof 8.0):
1. **Roof-recess architecture** (the gate-free path the 2.4275 ceiling
   allows): sink a local 2-3cm recess plate around BOTH hatch rings so ring
   walls present ≥8px of true shaded wall at close-roof/toptilt (ref class:
   proud drum with rim shadow); lids keep their ≤2.4275 crowns. Stations:
   octagon (+0.55,+0.30), cupola (−0.64,+0.17) — pane-top rings
   (925,302)/(995,296).
2. **Roof level +6-8L on top-facing faces** (roof plate, works-field lids,
   tarp, cloth tops): proc view-top (880,220)-(1040,330) L53.8 → ref 62.1.
   Inverse of the correctly-rejected top-grime experiment. Cloth 0x3a4030 →
   ~0x424936 class; re-measure against the cream-duffel failure ceiling
   (0x4d4d3a known bad).
3. **Saddle must read as duffels from above**: pale top-lit crown highlights
   on the three capsules + break the tarp/pad rectangle's hard edges (the
   (916-986,170-217) pit, p05 42 → field-class ~54 with round-form shading).

DRIVER 2 — MG READ (law; close-roof, view-top, view-front, heroes):
4. **CROWS M2**: give it a weapon gestalt: slew the barrel forward over the
   saddle/deck gap (the ref's own read mechanism — the local deck line is
   LOW there) and/or crest the works-field walls by 2-3px inside the
   2.44-2.4525 grace class; receiver keeps MASS (not a stick), pale top cap
   per top-lit physics; the r2 barrel-to-z1.53 gate break marks the priced
   boundary — the read needs ~0.4m of barrel over a low background, not 1m.
5. **Loader M240**: lengthen the barrel run + raise the pintle so a dark
   crown-riding line crosses the cupola ring at close-roof/toptilt
   (pale-deck inversion — dark gun on mid-olive deck).

DRIVER 3 — REAR GRILLE LADDER (view-rear + both rear quarters + hero-rr):
6. **Fuse the louvers**: bright-slat rows 4-5 @ rowmax L83-85 → ref class:
   slat luma ≤ bed+6 (≈L72), double slat count / halve pitch, door-field
   base −4L; keep frames, hinges, taillights. Remove camo patches from the
   rear plate (the ref plate is bare dark — patch-mask it off). Target: proc
   plate rect L≤64 sd≤6 (ref 61.1/4.4).

DRIVER 4 — SIGHT-BAND SLIT + PORTAL (left/right/front/close-front):
7. **Close the slit to ref class**: fill the aft ~60% of the daylight gap
   under D1/D2 with the bracket/root mass the ref carries (gun z 2.2-2.6
   band): target enclosed exact-bg ≤60px per side (ref 40-52; proc 147/159).
8. **Soften the portal**: merge the two vertical mantlet-surround legs into
   the swept cheek planes (chamfer + tone-match); certified rows untouched.

DRIVER 5 — FRONT DARK ANCHOR (front, front quarters, close-front, toptilt):
9. **Glacis plate dark-bias**: plate-local dark-patch dominance or −10L
   overlay on the glacis camo only: proc (820,340)-(1100,430) L64.6 → ~55
   (ref 52.3). Zero silhouette cost.

DRIVER 6 — TOP TRACKS (view-top, hero-toptilt):
10. **Lit link tops on the sun side**: pad-top highlight faces or texture
    variance on the top runs: proc right flank sd 5.7 → ref-class 12-16,
    mean +5L. The scalloped-link identity is currently side-view-only.

MINOR (polish; no view held under 9 by these alone): works-field SIDE-face
dressing (straps/ribs — tops only today); open 2 sky lanes in the front
skyline rows y140-180 at the ref's own lane stations (+18..+33px fused);
wheel-disc radial shading (flat cookies vs the ref's soft falloff).

Gate notes for the orchestrator: orders 2, 3, 6, 9, 10 are tone/material
(zero silhouette); order 1 is geometry BELOW existing crowns (recess —
gate-free by construction; watch the §B2 top-down hole scan on the recess
walls); orders 4-5 spend within the banked 2.4525 grace class and the ≤0.4pt
pintle allowance — re-price the front/side bins before raising anything;
order 7 ADDS mass inside the certified sight-band rows (plan risk near cols
±0.37-0.40 — the r5-old mantlet-fix bins); order 8 re-lofts inside
certified rows.

Verdict: **FAIL — graduation blocked; visual gate NOT met.** Floors 8.0
(view-top, hero-toptilt, close-roof); twelve views at 8.5. Claim discipline
is now bankable and the running-gear/rear-rack/cheek work is real — r3 is a
roof-and-read round (relief, level, guns), plus one texture fuse (grille)
and one paint anchor (glacis).
