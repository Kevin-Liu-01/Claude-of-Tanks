# Type 90 Kyu-maru (`type90`)

**Exact variant modeled:** Type 90 (JGSDF, 1990s–2000s fit) — Rh-120 L/44
(license), autoloader, standard skirts, no dozer blade.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 7.5 m (roster dims 7.45) | weaponsystems.net/system/167-Type+90 (7.5); historyofwar.org Type 90 |
| Overall length (w/ gun forward) | 9.76 m | en.wikipedia.org/wiki/Type_90_tank (9.755); weaponsystems.net |
| Width | 3.43 m | Wikipedia; weaponsystems.net |
| Height (turret roof / overall) | 2.34 m roof / 3.05 m over sights+MG | weaponsystems.net; Wikipedia (2.34) |
| Gun (model, caliber, tube length) | Rh-120 L/44 (license JSW), ~5.28 m tube, sleeve + evacuator + MRS | Wikipedia; globalsecurity.org type-90-arms |
| Road wheels / rollers / sprocket | 6 road wheels/side, return rollers behind skirts, REAR drive sprocket (rear powerpack; weaponsystems' "front sprocket" contradicts JGSDF photos — rear kept), front idler | weaponsystems.net (6 wheels); tank-afv.com Type-90 photos |

## Identity cues (what makes this vehicle unmistakable)

- Turret plan-form and roof layout: Leopard-2A4-like WELDED SLAB turret —
  vertical flat sides, narrow gun throat between swept cheek plates, long
  near-parallel autoloader bustle with clipped rear corners; commander's
  stabilized periscope sight in a tall box FORWARD-RIGHT on the roof
  (offset right of the gun), gunner's primary sight embedded in the roof
  front-right; 12.7 mm M2 on a CENTER pintle between the two hatches.
- Mantlet/gun mount: low wide aperture under a shallow brow; heavy inner
  collar.
- Hull front: shallow two-step glacis, driver front-LEFT with a flush
  polygonal hatch; rear deck dominated by two rectangular cooling banks and
  a transverse louvre row.
- Running gear + skirts: 6 wheels (hybrid hydropneumatic/torsion), rear
  sprocket; 6-panel skirts with the leading panel cut at a slant.
- Signature equipment: 2x3 smoke dischargers on the bustle flanks, TWO long
  whip antennas raked outboard from the bustle corners, rear turret stowage
  rack overhanging the engine deck, side-mounted rear-view mirrors folded on
  the front fenders (often stowed).

## Reference links (links only — no downloaded images committed)

1. https://en.wikipedia.org/wiki/Type_90_tank — infobox 9.755/3.43/2.34
2. https://weaponsystems.net/system/167-Type+90 — hull 7.5, roof 2.34/3.05 overall, 6 wheels
3. https://www.globalsecurity.org/military/world/japan/type-90-arms.htm — gun/armament
4. https://tank-afv.com/modern/Japan/Type-90_Kyu-Maru.php — photo set

## Local GLB oracle notes

Path: `public/models/tanks/community/recovered/type90.glb` (LOCAL-ONLY).
KNOWN NORMALIZATION DEFECT: width-normalized to 3.43 the oracle reads ~20%
TALL — deck ≈ 2.17, roof ≈ 2.90, raked antenna to ≈ 4.4 (its modeled width
under-covers the real 3.43, so the lab's width normalization over-scales
the rest; HANDOFF §4 "wrongly normalized" case). Published dimensions win:
the procedural stays at real proportions and the residual vertical-band
mismatch is a documented cap, not gamed. Shape truths still taken from it:
prominent forward-right roof sight cluster + center MG, big rear bustle
rack overhang, long raked whip antennas, gun overhang ≈ 2.26 m real
(oracle agrees proportionally), track band low under shallow skirts.

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 78.9 | 76.2 | 87.8 | 61.6 | 73.4 | 84.0 | baseline (generic kit profile in misc.js; muzzle 0.8 m SHORT of the real L/44 station) |
| 2026-07-30 | 79.0 | 80.4 | 87.3 | 73.0 | 49.7 | 81.0 | wave-2 final: turret raised to the real 2.33 roof (+0.22), commander sight tower + center M2 + rear rack overhang + vertical whips, evacR 1.9 gun rebuild, L/44 muzzle at the TRUE bow+2.26 station (gunZ stays 0 — a forward gun origin detached the kit mantlet, r1 floater fixed). GUN CAP ACCEPTED: the oracle is width-under-normalized (~20% tall/long), so its hull swallows most of the true overhang window — the honest muzzle costs G 73→50 while every view score RISES (minView 76.2→80.4); HANDOFF §4 says published dims win |

## GATE-V10 RE-VERIFIED ORACLE-DEFECT CAP — all curve components + stations (2026-07-31)

Re-measured under gate v10 from the fresh post-batch-6 extraction
(docs/references/profiles/type90.json, mask-trace-1024): width-normalized
to 3.43 m the print reads **p95 body roof 3.35 m vs the published 2.34 m
(+43 %)**, box height 4.42 (raked antennas), box length 9.29 vs the
published 9.76 — the whole print remains ~20 % tall/long relative to its
width; no rigid transform repairs proportions, so the v9 cap STANDS with
the v10 numbers. The build carries PUBLISHED dims (sovereign): hull 7.45 /
overall 9.76 / width 3.43 / p95 height 2.34. hullCurves / wholeCurves /
turretCurves / stations are **certified capped at their measured v10
residuals (53 / 31.3 / 3.1 / 0)**. dims + floaters pass (96.7 / 100).

## Round-3 cap re-verification (2026-07-31, post kit track fix 146d25c)
Re-measured on gate v10 after the kit contact-span/ground-clamp fix and
the family-wide raisedEnds-workaround removal: the certified oracle/print
defect cap STANDS (curve/station rows unchanged at their capped levels)
and dims HOLDS >= 90. No compensation was re-introduced; end wheels are
plain kit-native fits.

## Zero-row triage + normalize plan (2026-08-03, misc agent)

Ledger 0 is HONEST (reference renders; stations row bottomed, not false-0:
gate rows carry real ref values). Extract REG appended (recovered/
type90.glb, ^Turret$ autoPivot yaw -PI/2). Measured stylization: bodyH
+59.3% (roof band 2.8-2.9 = +21%, 13 cols, under a REAR MAST CLUSTER to
4.42 at z -3.24..-2.56 that holds p95 at 3.73), decks 1.553/1.733 print
+9..+21% tall, hullMask +2.7%, overall -4.9% (short tube), width -0.8%.
**Normalize plan authored** (tools/vertex-normalize.mjs `type90`):
two-knee y map (decks -> 1.42/1.46, roof 2.90 -> 2.31, mast tail -> 2.40;
sim p95 2.359 +0.8%), z body x0.974 about -0.813 + muzzle -> rear'+9.76.
DO NOT BUILD against this print pre-warp (>2% law) — the v9/v10 "no rigid
transform repairs proportions" note is RETIRED by the piecewise warp
toolchain; post-warp the certified caps (53/31.3/3.1/0) dissolve.

## VERTEX ROUND r2 note (2026-08-03, misc agent) — post-warp standing, NOT rebuilt

Post-warp gate rows (v11, fresh oracle): hull 53.6 / whole 30.2 / turret
4.4 / stations 0 / dims 94.1 — the certified caps are gone and the rows
are HONEST residuals vs the now-true-proportioned print. Fresh workorder
captured (scratchpad wo-type90-full); key structural findings for the
next round, all world-frame:
- REGISTRATION: side reg dAlong 0.782 / plan dy 0.79 — the warped print
  (z body x0.974 about -0.813, muzzle -> rear'+9.76) sits ~0.8 aft of
  our zero-centered build. Translation registration absorbs that, BUT
  the print's TURRET mass (side cols -2.9..-1.0, tops 2.31-2.37) sits
  ~0.6-0.9 further AFT relative to its own hull mid than ours does —
  the whole turret (and therefore a correspondingly longer visible
  tube to keep overallLengthM) must move aft in the next re-lay; that
  single move is most of turret 4.4 and the whole-row 30.2.
- Ref hull deck line reads 1.48 at its rear cols and its bow line falls
  1.32 -> 0.77 over its 1.8..3.2 — our deck 1.43/1.41 + steeper bow is
  close in shape but offset by the registration issue above.
- stations 0 is REAL (the two hull z-ranges slice different features;
  fixing the turret offset + hull ends should restore most rows).
- dims 94.1: heightM 2.37 (+1.33% — shave the M2/whip cluster to the
  2.34 line) and hullLengthM 7.34 (-1.41% vs 7.45 — the bow/stern body
  columns lost ~0.1; re-anchor when the hull is re-laid).
DO NOT trust the r1-era "certified capped at 53/31.3/3.1/0" numbers for
anything — the caps are RETIRED; these are now live work orders.

## VERTEX ROUND r3 (2026-08-03, misc agent) — build attempts REVERTED; §B4 + §B3 landed; frame pathology diagnosed

Final state: gate rows AT BASELINE (hull 27.3 / whole 0 / turret 0 /
stations 0 / dims 98.7 / floaters 100 — byte-identical hull/turret layout to
HEAD except the items below). Track-clip exact: **front 14 / rear 6** (from
275/224): flaps re-hung at the fender line above the wrap arcs, lower nose
narrowed to x<=1.10 below the glacis (same z-extent, dims-safe). §B3: the
hand M2 is now FITTINGS.pintleMG m2 (scale 0.85, foot 0.61 — receiver rides
AT the published 2.34 roofline; at 0.72 its 8-column run pushed heightM p95
to 2.39/-9.2 dims. The stowed-whip spike stays the p95 anchor). Boards:
shots/misc-r3/after/type90.png.

TWO FULL RE-LAYS WERE BUILT AND REVERTED (gate refused both; ledger kept):
1. r3a: packet-ordered turret-aft 0.75 + gear inboard + thin skirts + bow
   recess -> hull 21.7, dims 83.5. 2. r3b: front-row-derived heights (deck/
   fender line 1.46-1.48 per the r2 packet's own "ref deck line reads 1.48",
   tub belly 0.61, wheels exposed to x~1.10, thin 0.67..0.87 skirt band,
   xc 1.25/trackW 0.50) + bustle/rack extension to world -3.43 (the ref
   turret front matches ours 0.79 vs 0.82; its REAR is 0.86 longer — the r2
   "move the whole turret aft" order is WRONG, it is a bustle extension)
   -> hull 21.2, dims 76. Both reverted to HEAD bytes.

PATHOLOGY (measured, for the orchestrator/next agent):
- The warped print lives in an aft frame: plan body 2.574..-4.816 (mid
  -1.12), muzzle 4.88. The gate REGISTERS it (side dAlong 1.045, plan dy
  1.117) yet side_whole mean stays 10.1% (score 0) while plan rows score
  83-85 (mean 1.1!) — the same geometry matches top-down and fails in side.
- A rigid whole-build z-shift of -1.10 (hullG experiment) did NOT improve
  side rows (hull 21.7 -> 19) — the offset is absorbed; the failure is NOT
  the frame per se. Something in the side/front row comparison of THIS print
  disagrees with the legacy board, which scores the SAME build 72.2 overall
  (hull 89.9, masks 77-96, shots/misc-r3/probe/type90.png) — i.e. the print
  and build visually overlap at ~80-90 when width-normalized, but the gate's
  raw side comparison reads means of 5-10%.
- HYPOTHESIS for next round: the print's side silhouette is scale-true in z
  but its y-profile (deck 1.48, roof 2.31) vs our published-dims build
  differs by a near-uniform band it cannot register away (the gate has no
  y-scale registration; the legacy lab normalizes). Verify by dumping the
  gate's own side_hull ref curve (docs/geometry-gate/type90.json worst cols
  decode with y = val + centerY) BEFORE building anything; if the ref side
  curve is uniformly ~+0.1-0.2 over ours, this is a certified-cap class
  (dims sovereign) or an oracle y-warp retune, NOT a build order.
- The r3b hull numbers (deck 1.46/fenders 1.475/thin skirts/tub 0.61/bow
  recess 3.42/gear xc 1.25) are BANKED here for reuse once the row
  pathology is resolved — they match the front rows and the r2 packet's own
  measured deck/bow lines.

## Side-row pathology SOLVED (orchestrator probe, 2026-08-03)
The r3 escalation (side rows mean 10% while plan rows 83-85) is the REF
GUN ELEVATED AT REST: the probe overlay shows the red barrel line riding
above the proc's level tube across the forward columns — every forward
side-column's refTop reads the raised barrel, not the deck (m48 pitched-
tube class; gun component reads 8.3 vs hull 89.9). Fix = batch-32 class
gun-node rest-pitch-zero rotation (orchestrator lane, law v2: fresh
baseline + probe/gate-in-loop). ariete + type74 share the class (type74
via its Gun_7 bone rest pose). Builds resume after the batch.

## batch-32 scoping (orchestrator): REGION-ROTATION op required
Node-level reads: type90 + ariete have NO gun/barrel/cannon node at all —
the pitched tube is FUSED into turret geometry (m48 class exactly);
type74's Gun_7 is a bone with an axis-frame rest quaternion. One new
repair op serves all four prints (m48/type90/ariete/type74): rotate verts
in a geometric region (z>=z0, |x|<=x0, y-band) about a pivot axis, census-
guarded, law-v2 (fresh baseline + probe/gate-in-loop). Until it lands,
the three misc builds stay parked (side rows honestly floored by the
elevated ref tubes); m48's banked decision joins the same batch.
