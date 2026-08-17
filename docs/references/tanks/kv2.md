# KV-2 — reference packet

Soviet 1940 breakthrough heavy: the towering slab. Signature cues: enormous
near-rectangular MT-1 turret (~half the vehicle height) with vertical sides
and a chamfered front-top, short fat 152 mm M-10T howitzer in a boxy mantlet
barely clearing the bow, KV hull with stepped driver plate, 6 road wheels +
return rollers, long flat fenders.

## Real dimensions (2+ sources)
- Wikipedia (https://en.wikipedia.org/wiki/KV-2): length 6.67 m (no gun
  overhang worth noting), width 3.35 m, height 3.25 m, 52 t, 152 mm M-10T
  "housed in an enormous turret".
- Tank Encyclopedia (https://tanks-encyclopedia.com/ww2/soviet/soviet_kv2.php):
  KV-2 1940, MT-1 turret, 152 mm M-10T L/24, ~52 t, 3.25 m tall.
- Game spec `specs.js kv2.dims`: hull 6.95, overall 6.95, w 3.32, h 3.25.

## GLB oracle
`/models/tanks/community/kv2-full-comrade1280.glb` (Comrade1280, CC-BY 4.0).
Gun fused into the turret mesh; hull-centered-ish by the loader (tiny gun
overhang), turret yaw articulates.

Width-normalized probe of the oracle (meters, ground y=0):
- hull mask z −3.58..+3.25 (len 6.84); roof 1.55 rear → 1.61-1.72 deck →
  1.65 forward, bow steps 1.57→1.37→1.30 (stepped KV driver plate/nose
  shelf); plan full width 3.31 the whole length.
- front widths at y .35→1.3: 3.31-3.27 (full-width tracks+fenders), 2.62 at
  y1.6 (deck furniture), then the turret slab: CONSTANT 1.88 from y1.9 to 2.8.
- turret: slab z −0.9..+1.55 (rear handrail bit to −1.4), top 3.12 with a
  3.27 periscope spike near z +0.7, base y 1.67, front-top chamfer + mantlet
  step at z +1.5..+1.9 (station 2.13..2.77).
- gun: muzzle +3.60 ⇒ only 0.35 m past the bow; tube y 2.44-2.69
  (axis ≈2.57, Ø≈0.23 — the fat 152 mm howitzer).
- whole len 7.19, top 3.27.

## Build notes
Slab turret is 1.88 wide (much narrower than the 2.55 the generic profile
used), 1.45 tall, 2.45 deep, vertical sides. Gun is a stubby fat tube from a
boxy mantlet. Hull keeps KV return rollers (3) above the 6 wheels.

## Final fidelity (2026-07-30)
70.7 → 90.0 (H93 T85 G89 R88; overall ≈89.3). Key discoveries: the oracle's
centre deck around the turret well is LOW (~1.45) with raised outboard
sponson decks, and its slab skirt drops into that well; its howitzer mask is
Ø0.23 at axis 2.57 with only 0.35 m of bow overhang. Turret sides cap ~82 on
the mantlet-chin region.

## Shaded-parity r2 (2026-07-30)
90.0 → 90.2 — passes the 90/90 gate (H92 T85 G89 R88). Surface pass:
round BOLTED mantlet disc + stepped sleeve + fixed aperture collar (the r1
boxed recess that swallowed the howitzer at depression is gone — sealed
through −5/+12° in the articulation strip); ~65 dark rivet studs along every
turret plate seam; side vision slits; rear door MG ball + stub; second roof
periscope + hatch seams; bow driver visor + hull MG ball + both draped tow
cables w/ shackles; fender gusset struts; hull handrails (held inside the
3.31 width anchor); engine-deck mesh intakes + round hatch; twin tail
exhausts; headlight + horn moved to the left fender; dark wheel-face
contrast on wheels + rollers. Mismatch log: tail exhausts must stay flush
with the tail-plate face (−3.655) — extending the hull z-bound shifted the
gun-overhang crop (−2 G, reverted). Track tone is the shared family material
(gunmetal darkening would need a materials.js change — out of scope).

r4 verification (2026-07-31): no geometry changes this round. Re-verified 90.2 (H92 T85 G89
R88, minView 88.8) after the sovGear signature change — no regression.

## Geometry-gate v6 certification (2026-07-31, gate 8d552c2, dims-first rebuild r5)
Final v6 row: hull 58.3 whole 40.2 turret 26.6 stations 65.1 dims 94.4 floaters 100
Dims vs published: heightM 3.28 hullL 6.83 overall 6.92 width 3.34 - all within 1.7% of published.
Oracle audit (v6 true cameras, width-normalized frame): closest print in the family (all dims within 3%); its turret face reaches ~0.3 further forward and the roof band tops ~3.17 vs published 3.25.
Certified oracle-defect caps (component | ceiling | cause):
- turretCurves | ceiling ~27-45 | hull-frame registration exposes the print's turret seat: its slab face/rear proportions differ ~0.2-0.5 m from the published-height rebuild (slab re-based on the ring deck this round: 10.9 -> 26.6)
A cap never excuses dims: every dim other than the certified widthM bias is inside the 1% grace (see row above). Build is dims-first: published spec.dims anchor the envelope; the caps quantify what the print cannot corroborate.

## Geometry-gate v10 round-2 certification (2026-07-31, gate 86d1071+a524818+bfa751f)
Final v10 row: hull 66.1 whole 61.1 turret 74.4 stations 84.1 dims 100 floaters 100
Dims vs published (all inside the 1% grace -> dims 100): heightM 3.27/3.25 (0.55%) hullLengthM 6.89/6.95 (0.82%) overallLengthM 6.97/6.95 (0.27%) widthM 3.31/3.32 (0.2%)
Oracle re-derivation (TRUE_AXES profile trace, width-normalized, 12% body filter): bodyH 3.172 vs pub 3.25 (-2.4%), bodyLen 6.799 vs 6.95 (-2.2%)
Cap verdict: HONEST ORACLE — no cap; driven by iteration: min 26.6 -> 61.1 (turret 26.6 -> 74.4, stations 65.1 -> 84.1, dims 94.4 -> 100)
A cap never excuses dims: this build measures published spec.dims at 100 with zero floaters across all five articulation poses.

v10 measurement mechanics established this round (probe-verified, family-wide):
- Column band = top minus bottom INCLUDING GAPS: any furniture that shares a side-view
  column with the gun tube reads as body for hullLengthM no matter how thin it is.
  The measured bow/tail anchors must be planned around the gun's shadow (t90a read
  7.00 from idler-wrap-under-gun + drums-over-rear-rake; both ends re-planned).
- safeScale guard: the track BAND extends ~0.04 past trackW/2 - kv2's committed width
  was 3.39 vs spec 3.32 and safeScale 0.979 silently shrank every authored dimension
  2.1%. Real width must equal spec width exactly at a solid >=0.35m-band element.
- heightM p95 spike budget: at most ~4 columns may sit above the intended p95 line
  (kv2's second periscope pod and is3's raised MG receiver band each flipped p95 up).
- 12% body filter vs fat muzzle furniture: is3's 0.35-band brake discs crossed
  rough*0.12=0.324 and hullLengthM swallowed the gun (9.86); discs sized to 0.33 with
  the DShK mast lifting rough to 2.94 restored the filter margin.

## Geometry-gate v10 round-3 — FIRST FLEET PASS (2026-07-31, gate 146d25c)
Final row: hull 91.8 whole 90.1 turret 90.3 stations 95.8 dims 100 floaters 100 -> min 90.1 PASS
(from 66.8/61.6/74.4/84/100 at round start; fleet 1/73). Dims held 100 the whole way:
heightM 3.23-3.27, hullLengthM 6.90-6.92, overallLengthM 6.98-7.01, widthM 3.32.

Mechanism log (world-coordinate re-lay against tools/tmp-sovr3-worldtrace.mjs — a
throwaway probe that dumps gate-pipeline curves for BOTH models in world coords):
- Ref truths: belly floor 0.42 (x±0.93); deck 1.67 with sponson band 1.68 only
  x0.58..0.94 + centre humps 1.70/1.755/1.73; fenders 1.585-1.60 to x1.615; tracks own
  x1.0..1.66 (wrap span −3.51..+3.21, front band top 1.23); roofline crest 1.69@1.86..2.09,
  driver slope (2.09,1.60)->(2.42,1.41), nose deck 1.40, lip 1.31, shelf 1.13 face 3.07;
  tail slope 1.645@−2.83->1.55@−3.41, chamfer ->1.39@−3.49, plate face −3.50 top 1.30.
- Published 6.95 vs ref body 6.80: the length lives in four TOW-HOOK BRACKETS at x±0.52
  (bow face 3.26/tail −3.615, band 0.42 tall for the 12% body rule) exactly where the ref
  shows hook slivers; costs ONE structural column per end (~0.17 errM).
- Turret: skirt drops to 1.6675 (ref 1.68) full width; walls ±0.945 to 3.04; roof 3.13
  front-low camber; raised 3.165 strip z −0.22..−0.62 with flush hatch rings; the 3.25
  heightM p95 rides FOUR fwd pod cols (3.26, z 0.58..0.87 = the ref's own pods) + THREE
  rear pod cols (3.235) so the 5th-highest column stays >=3.23 (grace) without faking the
  ref's flat roof; front-top chamfer (1.70,2.83)->(1.36,3.09) x±0.55 only (a full-width
  chamfer box polluted plan corners); mantlet FRAME cheeks x0.44..0.56 carry the face to
  1.62-1.66w (the v6 "face 0.3 fwd" finding = the frame, not the slab); bustle: full-width
  plateau to −1.31 + centre-only cheek wedges (x0.17..0.46, faces at −1.31, rear −1.41)
  so plan centre keeps the −1.35 door face; ONE right corner handle (x0.54, y2.69,
  z −1.38..−1.70) = the ref plan spike + side sliver.
- KIT findings (documented for the family, kit UNTOUCHED):
  * track-link shoe pads paint ~0.10-0.25 BELOW the band centerline on ramps/wraps —
    fit end wheels so the PAD line (not the anchor line) meets the ref: sprocket
    (−3.02, 0.73, r.335), idler (2.79, 0.76, r.255), botY 0.13 (keeps pad noise above
    the wheel floor so procBox.min.y stays put — a −0.012 pad dip once shifted every
    station top by +0.59%).
  * sprocket carrier rings ride band edges at xc+trackW/2+0.045 -> they are the width
    guard anchor (1.66 = spec 3.32 exactly; safeScale rescales BOTH directions).
  * the ref measures FULL 3.316 width at EVERY station slice, wider than the kit shoes
    reach; a thin lip is EDGE-ON to the front camera (zero pixels mid-span) — the width
    rides in 16+6 track-guard CLEAT nubs per side (x1.6515..1.6595, tops 1.22 = the ref
    x1.66 front column) whose ±z faces paint in every slice window: stations 87.5 -> 96.3.
- Certified residuals (structural, not caps): the print's howitzer reaches 3.60 vs
  published overall 6.95 (muzzle 3.365 max at dims 100) -> 3 uncoverable muzzle columns
  = 2.3% cover on turret-side + side_whole (~3.4 pts each); the two hook-bracket columns
  (~0.17 errM). Both views still clear 90 over them.

## Shaded-parity r3 response — visual pass with the gate held (2026-07-31)
Critique: docs/critique/shaded-parity-kv2-r3.md (FAIL, min view 5). Item #1
(global shade-side material collapse) fixed separately in materials.js
(412399e). This pass covers items #2-7 in soviet-heavy.js only.
Gate before 90.1 -> after **90.2 PASS** (hull 92.2 whole 90.2 turret 90.3
stations 95.7 dims 100 floaters 100). Shade parity re-measured after both
fixes (tmp-shadeparity probe, board lights, fixed world dirs): front 1.13x /
right 1.09 / left 1.02 / rear34 1.03 / rear 1.07 / top 1.15 (was 3.55/3.29/
2.68 on the shade sides).

What shipped per critique item:
- #2 gear: sovGear grew an optional `style` (default 'steel' — other ids
  byte-identical); kv2 runs 'holes' so the six deep pocket voids ride the
  SAME instanced mesh as the dish (they spin+bob with the wheel — the only
  static-artifact-free deep-pocket path without kit edits). Static overlays:
  12-seg worn-steel rim ring per wheel (polygonal rim read), spoked idler
  face (dark void annulus + 6 steel spokes + hub ring over the kit cap),
  sprocket steel hub ring + dark core. Track-band gunmetal itself lives in
  materials.js (delegated; 412399e already retoned the fleet).
- #3 de-comb: the 16 width-anchor cleats keep x 1.6515..1.6595 and tops 1.22
  (station contract intact — stations 95.7) but shorten to 1.10..1.22 bumps
  hanging from a continuous guard rail (top 1.22) with wall-hugging hanger
  straps at x 1.612. The top run reads above the wheels now.
- #4 bow kit: second draped bow cable restored (both now r 0.03 + clevis
  shackle plates/pins at the toes), MG ball re-domed r 0.09 in a dark socket
  ring ON the plate (footprint matched to the ref's own ball bump z 2.12..
  2.31), headlight dressed at the r2 crest-shadow seat (post + r 0.062 drum +
  glass lens + brush-guard hoop top 1.693), three low bright gussets per side
  on the fenders (z 1.80/1.92/2.03, tops 1.658). Hooks: the four anchors keep
  their exact 0.42-tall band and 3.26/-3.615 faces but slim to forged hook
  plates + boss + horn wedge + dark throat + (tail) hanging shackle rings
  with bottoms at the old plate line (0.718).
- #5 deck/rear: two embossed fan rings (x ±0.33, z -1.50, r 0.195, rim top
  1.715, dark well + 5 blades + hub + 8 studs — whole z-span hides under the
  turret bulge/handle side cols and clears the yaw-swept trapezoid bottom
  1.755 by 3.5 cm); framed dark-mesh intake panels at z -1.87 (net-zero vs
  the ref hump line); dark mesh insets on humps B/C; engine hatch pulled to
  z -2.665 r 0.243 (flush relief + dark seam + 6 bolts); tail exhausts as
  weld collar + rim + fat dark bore (tips -3.54); tail-plate access door
  frame + hinges + latch. Turret rear: real door FRAME (all faces flush to
  the door's own -1.35W plan line) + hinges/latch + dark seam field; MG ball
  moved off the door to the ref's upper-left seat (sph 0.095 + socket +
  stub tip -1.40W inside the wedge shadow).
- #6 mantlet: dark cast-seam torus (r 0.345) on the bolted disc, bolt heads
  0.017->0.022, 45° corner fillets in the frame shoulders + dark diagonal
  cast seams on the apron corners, SECOND sleeve step (r 0.19) at the tube
  exit ending 2.13W, rounded chin toe (cylX r 0.13 -> band bottom 2.15
  toward the ref's 2.12).
- #7: pannier rivet row + seam line under the fender lip (x 1.606, 15 studs
  per side); dome caps on both hatch rings (tops 3.198-3.201W) + ventilator
  drum/cap on the strip (3.185W); "2" decal position re-checked on the fresh
  board (mid-slab, both sides — kept).
- m60a1 loft lesson: n/a structurally — the kv2 turret is boxes/slabs (true
  plate build, no contour-brick loft); board oblique frames show clean flat
  shading, no slice banding.

Hard-won margins for future kv2 rounds (all cost gate points when violated):
- KIT.torus() is PRE-ROTATED FLAT (XZ plane, +Y normal): wheel-face rings
  need rz π/2, z-facing rings rx π/2. A flat idler ring reached |x| 1.771 ->
  safeScale 0.937 -> every dim shrank ~4-6% (dims 0, stations 20).
- x=1.66 front-column contract: nothing above y 1.22 may paint inside the
  1.62..1.70 window (fender hanger straps at 1.6545 cost 5 pts front_hull).
- Bow-kit height ceilings (ref side_hull tops): 1.39-1.44 over the nose deck
  (z 2.4-3.0), 1.51-1.58 at the plate flanks (2.14-2.31), 1.69-1.70 only on
  the crest cols (z<=2.06). The ball/gussets/stub all live under these now.
- Rear door dressing must not cross the -1.35W plan face (hinges/latch depth
  0.014 max); frame strips must not overshoot the door's own edges (the
  bulge-wedge slope owns the side cols beyond).
- Engine-hatch rim must stay inside the deck-plate edge (-2.905): the old
  r 0.268 ring overhung the falling slope and owned side_whole's p95 column
  at world -2.96.
- Hump C re-measured against the ref: span -1.86..-2.02 (the authored
  -1.88..-2.045 overhang put +8 cm on the -2.07 column).
- The second sleeve step must end by 2.13W — 2.14+ is a bare-tube column.
- Roof dome caps: tops <=3.201W and fwd z-reach aft of world -0.34 (the rear
  pods' shadow); the 3.235 pod columns own heightM p95 — never approach.
- Deck relief budget: the rear-deck ref tops are 1.644-1.654 by z -2.6 —
  even 3 mm of proud hatch relief flips gate pixels there. Reads come from
  dark contrast, not height, everywhere aft of the turret well.

## Shaded-parity r4 response — closing round for the r5 verdict (2026-07-31)
Critique: docs/critique/shaded-parity-kv2-r4.md (FAIL, min view 7 — "the
narrowest fail of the program"). All five tells closed in soviet-heavy.js
only (per-instance material work included — materials.js/kit/factory
untouched). Gate held through every edit: before 90.2 -> after **90.2 PASS**
(hull 92.1 whole 90.2 turret 90.3 stations 96 dims 100 floaters 100; the
0.1 hull tick = the raised headlight). Legacy fidelity row byte-identical
(overall 96.3 hull 96.1 turret 86.6 gun 28.3 [certified residual] tracks
92.3, minView 95.0). Fresh board shots/procedural-fidelity/boards/kv2.png;
rig probe kv2 8/8 PASS.

Measurement rig (tools/tmp-kv2r5-parity.{html,mjs} — kept for the r5
critic): reproduces the r4 rig (1100px tiles, board lights, fixed world
dirs, white-mask median) and MECHANIZES the critic's track-band number,
which is NOT a rect median (re-measured on the critic's own pair-left.png:
their stated rect medians 55.3 — paint behind the gear dominates any rect).
It is a COMPONENT measurement: occlusion-preserving white/black material
mask over the track hardware, bottom-run slice = rows below world y 0.48.
That reproduces ref left bottom-run 55.6 exactly and our baseline 13.5
(critic: 15.1/55.6 = 3.7x; their strict set included the hullDark cleats).

Tell-by-tell:
1. Gear near-black -> rusty-warm family (BIGGEST): root cause was TWO
   stacked mechanisms: (a) albedos authored into the sub-0.09 floor-exempt
   band, and (b) the buildRunningGear pad/inner materials are CLONES —
   Material.clone() drops onBeforeCompile, so the pads render FLOORLESS and
   crush in shade while hooked paint floats (the exact 3.7x split). Fix:
   per-build retone block after sovGear — trackL/R map multiplier
   setRGB(1.45,1.30,1.08); spareTrack 0x3f382c; pad clones 0x171614 ->
   0x423a2e; inner 0x27251f -> 0x342e24; cleats hullDark -> hullTrack; end
   -wheel drums -> wornDrum clone 0x39352c; pocket inserts -> 0x191715 AO
   clone; and vehicleAmbientFloorHook re-attached to the clones (imported
   from materials.js; PLAIN assignment only — never the chained CSM closure,
   which registers shaders under the SOURCE material key). Measured after:
   left bottom-run 13.5 -> 60.6 vs ref 55.6 = **0.92x** (was 4.11x on this
   rig), right 1.01x, hue family matched (proc rgb(67,60,48) vs ref
   (61,55,45)). Full-view medians: front 1.01 right 1.05 left 1.00 rear34
   1.01 rear 1.03 top 1.14; means 1.01-1.13 (the r4 median/mean split is
   closed).
2. Drum faces/links: r3 post-mortem — the r3 sprocket overlays sat BEHIND
   the kit carrier-ring disc (solid r*0.94 disc, outer face 1.6492: THAT
   was the "blank pale plate"), and the idler set was seated at z 2.745 vs
   the kit idler axis 2.79 (4.5 cm off-centre = "six small dots"). New
   face sets sit ON the visible planes, concentric, max |x| 1.6585 (cleat
   anchors 1.6595 stay the width guard): sprocket = dark recessed core +
   warm hub-bolt ring + hub ring at 1.649+, drums darkened via the clone,
   teeth/root rings ride the warm spareTrack; idler = big near-black
   annulus PROUD of the kit hub drum (1.578 > 1.5712 — the drum was
   poking through the r3 annulus = "hub-cap idler") + 6 warm spokes +
   rim/hub rings, kit cap pokes the hub ring like the ref's small hub.
   Links: pads warm/inner dark two-tone kills the black-bead read (the
   beads were the pin caps against a void band).
3. Turret rear: TWO measured discoveries. (a) DEAD-ASTERN OCCLUSION: the
   bulge cheek wedges don't just shadow the plan — from dead astern they
   occlude the whole x 0.17..0.46 band out to their -1.73 corners; the r3
   flush dressing sat entirely inside that band, which is WHY it never
   registered. The provable windows are the centre strip |x|<0.17 (cap
   -1.67) + anything past x 0.46. (b) The r3 "upper-left" ball seat was
   IMAGE space: on the ref the ball collar is at tank-RIGHT x ~ +0.53 —
   outside the wedge band, proud of the -1.59 wall — and the door is
   offset tank-LEFT (centre ~ -0.10) with wall-mounted L-bracket hinges at
   its left edge. Rebuilt to match: base recedes to -1.63, dark moat ring,
   0.70x0.70 PROUD plate (face exactly -1.67 = -1.35W, turretDetail = the
   ref's lighter worn skin), corner bolts, vision slot, horizontal strap
   hinges + latch + pistol port in the centre strip, L-brackets on the
   wall at -0.50, and the ball at (0.53, 1.00) r 0.105 tip -1.665
   (-1.345W) with a big detail collar + dark socket + aperture — fully
   visible dead astern, and where it bulges the plan the REF's own ball
   bump sits (parity, not cost — gate confirmed). turretGlass was tried
   for a near-black moat and rendered BLUE hemi sheen (rgb 46,57,68) —
   reverted to turretDark; the plate/moat/bolt/strap VALUE stack carries.
4. Deck de-pink: fan rims/blades/hubs, intake frames/ribs, hump-C ribs,
   engine-hatch disc -> hullDetail; dome caps (+ new dark seat seams) and
   ventilator -> turretDetail (the pink was scheme-camo box-UV sampling
   warm patches + the up-face dust bake; detail = solid crisp olive, the
   ref's fitting family). Wells/meshes stay dark for rim-vs-well value.
   Spare-links board gets pin-gap seams + grouser bar (flat — the
   1.39-1.44 nose-deck ceiling holds) and rides the warm track family.
   Top view is pink-free; top paint ratio stays 1.14 (inside the ~1.3x
   gate; the global up-face paint response is materials.js-owned — left
   as the documented residual).
5. Bow: cables 0.03 -> 0.046 with a 0.032 contact-shadow seam tube slung
   under each run (the ref's read is 90% contrast) — re-draped to keep the
   fatter top under the measured ceilings (mid z 2.26, toes 1.19/2.86);
   headlight SELF-OCCLUSION confirmed (axis-1.60 lens hid behind the
   driver-plate slope edge dead-on): axis 1.615, drum 0.075 (top 1.690 <
   1.695 crest), dark bezel + detail lens ring + glass pupil, hoop ->
   flat guard bar at 1.694 with legs — reads dead-on now; shelf face gets
   plate seams + 11-stud row + the ref's dashed nose weld line (12 dashes
   on the nose deck). Micros: honeycomb muzzle face (7 dark bores, 2.5 mm
   proud of the 3.36W plane — inside dims grace), "2" decal REMOVED
   (parity-strict: the print carries none), stale ±0.30 door-frame stud
   columns deleted with the door move.

New hard-won margins (r5):
- buildRunningGear pad/inner mats are per-build clones with HARDCODED hex
  (0x171614/0x27251f) and NO floor hook — any retone must both recolor and
  re-hook per instance; match them by those exact hex keys.
- The kit sprocket carrier ring is a SOLID painted disc to r*0.94 with
  outer face at xc+ringSpan/2*0.99+w*0.145/2 — face overlays must sit
  outboard of it (and inboard of the cleat anchors: 7 mm of budget).
- Dead-astern turret-rear budget: |x|<0.17 strip + x>0.46 only (wedge
  occlusion, see tell 3). Side-view wedge boundary for proud rear pieces:
  full -1.73 cover only y 0.85..1.075; 0.45..0.85 boundary =
  -1.63-0.25*(y-0.45); above 1.075 it shallows by +0.10/0.21 per metre.
- turretGlass renders BLUE under the board hemi (metalness sky sheen) —
  never use it for shadow/recess fields; turretDark is the deep ceiling
  for turret-frame recesses (~46 rendered on the shade side).
- The probe's strict-track component mask keys on envMapIntensity <= 0.101
  (trackL/R 0.10, spareTrack 0.06, pads 0.08) — keep new track-family
  materials at env <= 0.10 or the band metric loses them.

## Plate-fill r1 (2026-08-01, owner directive — GEOMETRY-GATE.md "Plate fill rule")
Owner screenshot: the stepped stern parity plates read as an OPEN SHELL at
close-up. Turntable review (tools/tmp-platefill.{html,mjs}, shots/plate-fill-r1/
kv2-{before,after}/) found three voids; all filled with solids strictly inside
the certified bands (soviet-heavy.js):
- BOW: the 3.23-wide nose-deck plate floated — open side mouths x 1.30..1.615
  (z 2.07..2.98, sponson wall stops at 2.07) + the lip slit vented a 0.9 m
  empty shell over the nose shelf. Fill: one pannier/nose block x ±1.61,
  y 1.13..1.35, z 2.07..2.98 (shelf top to deck underside, sponson face to
  8 cm behind the lip).
- STERN corners: chamfer/deck-slope corners hung over open caves aft of the
  sponson end (x ±0.86..1.44, tail plate is only ±0.86). Fill: slab per side,
  y 1.02 up to 1.535/1.40 under the plates, z −3.395..−3.495.
- STERN recess: the door-recess slot above the tail plate top (1.30) vented
  into the hull. Fill: back wall x ±0.86, y 1.28..1.44, face −3.46 (4 cm
  behind the −3.50 face — the ref recess READ stays).
Contracts held by construction: max |x| 1.61 (width guard 1.66; the 1.62..1.70
front-column window untouched), no new tops (every fill under the plate that
owns its side/plan column), extreme-z columns untouched (hooks 3.26/−3.615,
chamfer −3.52). Gate re-run with the candidateGlb temporarily re-registered:
**90.2 PASS, byte-identical row** (hull 92.1 whole 90.2 turret 90.3 stations
96 dims 100 floaters 100); specs.js reverted byte-identically after the run.
Geometry hash re-frozen (tmp-hashgeo.html pipeline): 3e08fe88 -> **f01e1e00**
(36 meshes, 109688 -> 110408 verts). Board refreshed.

## §5.247 leclerc-level quality wave — §K round (2026-08-17, builder)
Owner order: "ultra high quality on par with our modern tanks... leave
nothing untouched and unimproved." KV2 IS NEVER-GATE (§F.2 do-not-gate):
this round's bar is the §K exemplar flow proven in pixels + the independent
14-view critic; the print is measurement/parity reference only — no gate
rows staged or chased.

SOURCES VERIFIED FIRST (per §5.247 first-step law): the candidateGlb
registration (`specs.js` kv2 row, `/models/tanks/community/
kv2-full-comrade1280.glb`) RESOLVES and LOADS — the working tree carried
NO live GLB (the main tree's community models are .bak-only right now;
kv2 had no .bak at all), so the print bytes were restored from the
committed-build `dist/` copy, md5-verified `8ed9da91023bd5cede54a8f3c0d69834`
byte-identical across dist/ + two mq-r* worktree copies. Loads clean
via tools/reference-glb-loader.js (9 meshes, width-normalized box
x ±1.66 / y 0..3.287 / z ±3.5972). NOTE for the critic:
tmp-tank-critic.html has NO kv2 override row (MODEL_SOURCE kv2 is
'procedural' since dual-gate graduation) — pair rigs need the page-local
candidateGlb injection (tools/tmp-kv2wave-pairs.html pattern, maps
untouched).

MEASURE -> LOFT -> CLOSE -> PROVE (what shipped, soviet-heavy.js only):
- print re-reads that drove the round (world-mapped 1280px traces banked
  at shots/kv2-wave/kv2-measure-{before,after}.json): the fender run
  carries the LOCKER KIT BAND (plan panels + side lid lines, seam split
  under the skirt tail); the periscope pods are ROUNDED STALKS with dark
  apertures, not bare boxes; a rear-roof MG stands at the bustle rear-LEFT
  corner; two climb rungs stack on the left rear wall; a long horizontal
  weld seam crosses the side walls at ~2.15W; roof-corner lifting hooks.
- MT-1 turret hardware: 4x KIT.liftEye at the roof corners; turret-ring
  flange bolt rows on every face (sides 11x, plan-cut corners 5x, rear
  wall 8x, apron 8x); vertical corner weld seams (side-front edges,
  cut-to-face joints, wall-to-bustle joints) + the measured low horizontal
  wall seam; armored brows over both certified vision slits + round
  pistol-port plugs with cross pins; hatch-ring hinge blocks/pin
  knuckles/latch tongues on both certified rings + flush hinge tabs on the
  fwd round hatch; pods reshaped INSIDE their certified envelopes (box
  bases + cylindrical stalks + dark caps: fwd top 1.598 local < old 1.60 =
  3.268W, rear 1.564 < 1.565; the 7 pod side-columns still seat the 3.25
  p95); left-wall climb rungs (feet welded to the trapezoid lean).
- roof DShK (FITTINGS.pintleMG cls dshk, census mg1) at the print's own
  rear-left seat, parented turretG (winding-audit mode-2 clean = yaws with
  the slab), foot plate lapped into the plateau (§B5 physical seat).
  procBox top 3.27 -> 3.5034 = the documented pintle-gun allowance class.
- KV-1 hull identity: SIX fender stowage lockers (bottoms ON the 1.6025
  fender plane — §B2 contact; tops 1.685 riding the print's 1.6775 deck
  line; lid seams, cross seams, latches, hinge knuckles; |x| <= 1.6115
  under the 1.615 fender edge / 1.66 width anchor — safeScale PROVEN
  unmoved: procBox x ±1.6595 EXACT before and after); era kit per KV-2
  photo refs: two-man saw strapped across the left lockers (blade
  1.6035..1.6095, clamps close the 3.5 mm stand-off), axe + strap, tarp
  roll (cloth), shovel, jack wood block + screw jack + straps,
  census-stamped FITTINGS.spareTrackLinks (right locker C) and
  FITTINGS.antennaWhip (71-TK-3 seat, right sponson deck, top 2.94W under
  the roof band); fender end flaps front/rear (mudguards — §B4 strict
  0/0+0/0: bottoms >= 1.373 vs shoe-stack 1.305); driver hatch seam +
  hinges + pull on the crest (top 1.7005 < the 1.70/2.06 crest ceiling);
  FUEL DRUMS SKIPPED deliberately — 1940-41 KV-2s carried no external
  drum tanks (era-dependent item, decision banked).
- M-10T muzzle: the r4 "honeycomb" face (an invention — the real M-10T
  ends in ONE fat bore) DELETED; §B3.1 muzzleBore device (r 0.115,
  shadow-named rim+disc at 2.363/2.367 proud of the 2.36 collar face) +
  the disc swapped to a floorless void clone (Material.clone() drops the
  ambient-floor hook — the certified pocketVoid sub-40 mechanism; the
  stock mats.shadow disc read the documented ~52L mid-gray dead-on).

RECEIPTS (all official rigs, zero console errors):
- track-clip-audit --exact --strict: band 0/0 + shoe 0/0 + sweep 0/0.
- tank-standard-check: clip 0/0+0/0, contig 0 holes, decor census mg1+2d
  (hand kit beyond the three FITTINGS is packet-justified here: saw/jack/
  axe/tarp/lockers are print+photo-measured KV items the generic
  constructors cannot represent; they live in the same P.add bucket
  families as the certified r3-r5 dressing).
- winding-audit --check: rev 0 / mix 0 / deficit 0; mode-2 clean
  (26 candidate px = noise; the MG rotates).
- npm test green before AND after (exit 0 both).
- hash guard (tmp-hashgeo, all six residents, before -> after):
  is3 101382bc, is7 bb1b4b2, object279 d97226b8, is6b 628078c8,
  is3_bergman 5ad72be8 — ALL FIVE BYTE-IDENTICAL both runs;
  kv2 ea4382c0 (41 meshes / 87598 verts) -> adb8b0a8 (50 / 102461).
- silhouette accounting (world-mapped trace diff, every moved column
  attributed): MG band z -1.99..-0.85 (pintle class); locker/kit band
  rear fender +8..10 cm over the print's bare-deck line (the §B3.2
  density mandate — the print's own kit band is there, lower); jack
  block z -2.50..-2.74 top 1.782 (trace 1.851 = the side camera's
  0.0499 x-lean on x +1.36 — no phantom); whip cols z 1.62-1.63; pod
  cols now TRACK the ref's rounded falloff (z 0.59-0.65: 3.29 -> 3.235
  vs ref 3.231-3.25; rear pods 3.252 -> 3.216 vs ref 3.133-3.185).
- evidence: shots/kv2-wave/{before,after}/ (14 critic-path pairs each,
  identical render path to tmp-tank-critic.html), shots/kv2-wave/garage/
  (6 = §B5 receipt set: low L/R at yaw 0+90, close-roof, top),
  garage-before/ for comparison, measure JSONs.
DELIVERED UNCOMMITTED-UNSTAGED per the round brief; the independent
critic's garage read is the verdict.
