# m1a2_tejas GRADUATE RE-CERT r4 (family variety + §B4 containment round) — 2026-08-03

Scope: dual-gate graduate, re-cert of CHANGED regions per the graduate-change
protocol: §B4 true containment (TEJAS_HULL laneCarve bow [2.60,3.49] / stern
[−3.61,−2.90] @ ±1.08; wrap-pad family migrated to per-side gear_wrapPads;
rear outboard grille doors narrowed onto the inter-track wall ±0.9925±0.0925)
+ the §H.4 variety loadout (rackDufMul [0.7,0,1], stowed loader's pintleMG
'mag', FITTINGS.antennaWhip base pot by the rear rack post; CROWS identity
kept). This was the tank in the owner's original track-clip screenshot — the
fleet-worst front at 1139. Graduation cert stands for unchanged views/members.
Renders: fresh `node tools/tmp-tank-critic.mjs --id=m1a2_tejas` →
shots/critic-m1a2_tejas/ (14 views, zero console errors) + zoom crops at
shots/critic-m1a2_tejas/crops/ (tools/tmp-recert-crops-m1a2_tejas.py,
tmp-recert-crops2-m1a2_tejas.py + inline 5-8x probes and the §H.4
h4-rackband-strip / h4-roofstation-strip built from the sibling variants'
own critic sets).

## Official-rig evidence (my own runs, this tree)

- `tools/track-clip-audit.mjs --exact --ids=m1a2_tejas`: **front 0 / rear 0**
  (was 1139/683 — the fleet-worst front). The round's whole point, confirmed
  on the official tool.
- `tools/tank-standard-check.mjs --ids=m1a2_tejas`: gate min **89.4**,
  components **91.7/89.4/89.6/93.5/100/100**, clip 0/0 ✓, contiguity **0
  holes** (§B2 machine scan), decor census **mg1+1d ✓** (the stowed MAG +
  pot are real KIT.fittings). The 89.4 matches the packet's pristine-HEAD ×3
  read exactly — the 90.5→89.4 delta is documented pre-existing
  override-path drift on this oracle (bisect-proven neutral, orchestrator
  lane). I judge renders per the graduate-change protocol.
- `tools/tmp-hashgeo.mjs --ids=m1a2_tejas`: **526341c0** (47 meshes / 158248
  verts) — matches the packet's NEW FREEZE HASH exactly; I judged the exact
  re-freeze state.
- `tools/visual-evaluator.mjs --id=m1a2_tejas`: exit 0, **no RIG MISMATCH** —
  yawProxy ≤1.7° on all 14 views (worst close-roof 1.7°, front 1.2°; abort
  threshold 10°), no flip, axis conditioned everywhere. Evidence at
  shots/visual-eval-m1a2_tejas/ (report.json + overlays).
- Evaluator hole detector: proc **holes [] on all 12 ortho/close views**.
  The only two enclosed-region flags are perspective heroes — hero-rearright
  2.517 m² @ (−1.13, 2.20, 0.20) and hero-toptilt 6.035 m² @ (1.40, 0.90,
  1.29) — both are the gun-tube-over-deck projection-loop class the tool
  itself caveats ("barrel/deck gaps also read as voids"): sky pockets closed
  BETWEEN the tube silhouette and the roof/fender lines, not through any
  surface. Cross-checked against the §B2 machine scan (0) and the renders.

## Per-focus-view verdicts (changed regions, same-vehicle-same-tier)

| view | score | read |
|---|---|---|
| front | 9.1 | Dead-front containment clean at 1x and 4x: both track columns are pure two-layer shoe stacks under the fender line, no shoe pierces the glacis/splash-board, the small hull-tone tabs inboard of the runs are hull-wall fittings BEHIND the lane (audit-classified gear, 0 in-band voxels). §B1 rake present. Evaluator: the only sub-noise-exempt low-zone flags are Δ+3.1° (noise 0.47°) len 0.476 m @ [−1.09, 0.09, 1.01] and Δ+2.1° (noise 0.25°) len 0.399 m @ [1.72, 0.24, 1.00] — the proc's track-band verticals read true 89.3–90° where the warped oracle flares 86–88°: the certified oracle-stylization class, at the band columns, not a bow-plate defect. Upper flags are the certified turret-crest micro-segment classes (len ≤0.22 m, ±4° floors). |
| close-front | 9.2 | The owner's screenshot region, fixed: at 3–5x both idler wraps show the FULL arc — pad stubble + chain/horns riding the wheel — with honest air under the bow toe, the tow/laneCarve bracket seated clear ABOVE the arc, and no green solid crossing either wrap window. Matches the ref's own bow grammar (fender drapes over a visible wrap). Glacis rake: Δ+2.45° (noise 0.55°) on the 0.765 m upper-front line @ [0.41, 1.67, 4.03] vs the +34.8%-height stylized oracle — certified scale-mismatch class, nowhere near a flat front. Bow lower-rake deltas ≤2.5° on ≥0.37 m segments. Upper-left Δ12.3° @ [−1.12, 2.90, 2.23] is the certified swept-cheek/crest cap class (unchanged member). |
| rear | 9.1 | Narrowed grille doors read APPLIED to the surviving inter-track wall: pale-lattice louvres (family polarity law), dark hinge straps, raised door frames ending before the sprocket wraps — both track cross-sections are solid-free top to bottom (audit rear 0 exact). Taillights, TIP box at (0.98, 1.52), rack silhouette above with legible content. No flagged edge sits on the doors; rear flags are 0.09–0.31 m side-edge/crest micro-segments (±4° floors, worst true finding Δ+4.4° noise 0.69° at the lower-right band toe — the same certified band-flare class as front). refOnly 31 = the oracle's busier stylized rear furniture (certified cap). |
| left | 9.1 | Lane edge at 4–5x: bow wrap climbs the idler as continuous pad stubble under the nose rake, stern wrap descends from the flap hem to the run — both arcs unbroken, wrap-pads read as gear RIDING the wraps (the migration is render-identical as claimed: same geometry/material). No poke through skirts, no floating band. Flags: Δ±13.3° stern-corner pair @ z −3.67/−3.71 with ±4° floors on 0.21–0.33 m = the rear-flap-hem/rack-rail organic class (unchanged members); Δ+3.4° (noise 0.36°) len 0.742 @ [0.04, 2.02, 3.06] is the certified cheek-front cap class. |
| right | 9.1 | Mirror-clean: both wraps continuous at 5x, fender tip over the bow arc, inter-track shadow honest. Only 3 flags: two ±4°-floor stern/bow micro-segments and Δ+1.6° (noise 0.14°) on the 3.26 m tube/cheek top line — tube-class, sub-2°. |
| top | 9.1 | §B2 filled everywhere (machine 0 + evaluator holes []). The §H.4 loadout is legible in plan: slim left duffel, stowed MAG (dark receiver @ x −0.5..0, barrel toward +x, muzzle at the right-duffel gap), full right duffel, and the antenna pot's dark cap EXACTLY at the computed (−1.0, −3.05) left-rear rack corner (8x probe). Plan flags ≤1.9° (two 1.79 m tube flanks + one 0.86 m board edge) — plan geometry matched. |
| hero-toptilt | 9.1 | The 55°-class shaded view: decks filled, hatch rings read circular, rack content reads as 3D masses behind the rails, CROWS-side station + skeletal M2 + whip pair certified-state. The 6.035 m² "void" is the tube-over-bow-deck projection loop (cited above), not a hole — the §B2 scan and all ortho hole reads are 0. |

Supporting (non-focus, checked): frontleft/frontright/rearleft/rearright
obliques show zero piercing at every corner (the ±0.7–0.96 m Δbot flags in
those views are all the evaluator's self-declared vertical-edge cliff-offset
class at the skirt/fender steps); hero-frontleft bow grammar clean;
hero-rearright rack + whips certified (its 2.517 m² flag = the same tube
projection-loop class); close-roof cluster is the certified flat-silhouette
station (slew ring visible, skeletal M2, EO head, whip pots) — unchanged
members, cert stands.

## §H.4 VARIANT-DISTINCTIVENESS (standing check, family has 4 built members)

Verified against the siblings' own current critic sets (h4-rackband-strip /
h4-roofstation-strip, same window per id). Garage-glance tells:

- **m1a2_tejas**: bustle floor carries a SHORT SLIM stowed MAG (half the M2
  receiver mass, muzzle ending at the right-duffel gap) flanked by TWO
  duffels (slim left, full right — rackDufMul [0.7,0,1]) + the dark antenna
  base pot at the left-rear rack corner; roof station wears the CROWS slew
  ring. Census mg1+1d ✓.
- **vs m1a1**: m1a1's rack shows a LONG bare stowed M2 (muzzle reaching
  x≈+0.88, no shield) with a SINGLE left duffel and empty right floor, plus
  its left-flank wall tow-cable run (tejas flank is bare); roof station is
  the CWS drum (6-lug ring) not a slew ring.
- **vs m1a1ha**: same M2 position but WITH SHIELD — the T-cross silhouette
  over the receiver is unmistakable top-down — plus the flat spare-link
  strip beside it. Tejas has neither shield nor links.
- **vs m1a2** (recovered SEPv2 oracle): different vehicle build entirely —
  proud 3D CROWS RWS standing over the roof, full-width busy bustle field,
  different turret planform. Trivially distinct.

Not 'same tank re-badged': any two of the four are tellable apart in one
top/rear glance. (m1a2_tusk shares the tejas loadout by design; its ARAT
kit is its tell — out of my scope, chimera-oracle caps noted in the packet.)

## RE-CERT: YES

All changed views ≥9.0 (min 9.1; max 9.2 close-front). The owner's original
defect class is dead: front/rear containment 0/0 on the exact audit and the
wrap windows read as full pad-stubble arcs from every angle at up to 5x with
honest air under both toes. The narrowed grille doors sit on the inter-track
wall clear of the wraps, the wrap-pad migration is render-identical, the
variety loadout reads and censuses (mg1+1d), and the CROWS identity + every
certified unchanged member (skeletal M2, whips, crest grammar, skirt hems)
survives. Hash 526341c0 (47/158248) matches the packet; rig parity clean on
all 14 views. Re-freeze at the orchestrator's landing commit is approved
from the critic side. No coordinate orders.

Residuals (declared, priced, non-blocking): the two hero-view enclosed-region
flags are gun-tube-over-deck projection loops (tool-caveated class, §B2
machine 0, ortho holes [] ×12); track-band verticals vs the warped oracle's
~3° flare (front lower flags ≤3.5°) and the swept-cheek/crest micro-segment
classes are the certified oracle-stylization caps on unchanged members; the
antenna pot reads only at zoom/top by design (h 0.20 inside the rack frame);
the MAG muzzle shows a small plan gap to the right duffel edge (stamp-origin
cosmetic). The 89.4 gate line is the documented pre-existing override-path
drift on pristine HEAD — orchestrator lane, outside this cert.
