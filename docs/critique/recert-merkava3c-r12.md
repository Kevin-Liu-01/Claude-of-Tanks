# merkava3c GRADUATE RE-CERT r12 (track-containment round) — 2026-08-03

Scope: dual-gate graduate (fleet graduate 9, r8 critic 9.0 all nine), re-cert
of CHANGED regions only — the §B4 containment set: wrap-station yB lifts
(z 2.28/1.95 → 1.13; z −3.47 → 1.06), keel.hwClamp 1.13, skirt
wallClamp/fillerClamp in-band walls, frontBoard z1 2.17 → 2.26,
rearFlaps[0] z −3.90 → −3.945, cornerCurtain v2 tiers outside the band
shell, tailRack.frontClear {z −3.92, bot 1.06} (+ its bottom-rail clamp,
backer re-seat, jerry-can re-seat). Graduation cert stands for unchanged
views. Renders: fresh `node tools/tmp-tank-critic.mjs --id=merkava3c` →
shots/critic-merkava3c/ (14 views, zero console errors) + zoom crops at
shots/critic-merkava3c/crops/ (crop tool tools/tmp-recert3c-crops.py).

## Official-rig evidence (my own runs, this tree)

- `tools/track-clip-audit.mjs --exact`: **front 0 / rear 0** (was 303/718 —
  the fleet-worst-class rear clip). The fix's whole point, confirmed on the
  official tool.
- `tools/tank-standard-check.mjs`: gate min **90.5**, components
  91.5/90.5/90.8/92/100/100 — the packet's PASS ×2 graduation-class line
  exactly (third independent confirmation). Contiguity **0 holes**, clip
  0/0. Decor `mg0+0d ✗` is the carried §I packet justification (3C roof
  guns are the hand-authored ref-parity instruments shared with 3B/3D,
  unchanged this round) — not a new failure.
- `tools/tmp-hashgeo.mjs`: merkava3c **1d9b026c** (41 meshes / 146136
  verts) — matches the packet's NEW HASH exactly. Same-run family reads for
  the orchestrator's ledger: merkava3b a4ed2c82, merkava3d 4515d944,
  merkava1b 6bcb98c9 (sibling verification belongs to their own rounds).
- `tools/visual-evaluator.mjs --id=merkava3c`: exit 0, **no RIG MISMATCH**
  — yawProxy ≤1.2° on all 14 views (worst 1.2° rear; abort threshold 10°).
  Evidence at shots/visual-eval-merkava3c/. frameOffset y 0.324 is
  registration data per §D, not a defect.
- RENDER PROVENANCE: my fresh 14-view set is **byte-identical (14/14)** to
  the builder's self-audit set at shots/merkava-r12/critic-merkava3c-final/
  — deterministic pipeline, same tree; the self-audit's before/after deltas
  (rearleft cornerL IDENTICAL, flapR med 99.8 → 97.7 toward ref 81.3,
  view-rear corners p25 IDENTICAL, wheel row byte-identical) describe
  exactly what I scored.
- SCOPE VERIFIED IN SOURCE: the 3C profile block carries exactly the
  declared containment params (hwClamp/wallClamp/fillerClamp/frontClear/
  cornerCurtain-v2/rearFlaps[0]/frontBoard + the two station yB lifts);
  every 3D-lane r12 param is ABSENT on 3C (softGoods, rackShelf, rackX,
  soft, tailFitLit, gearFloor, chainHex, fillerTop, idlerFlapDz, deckStow),
  and the shared-path M2/sliver edits are gated `opts.m2`/`p.rackShelf` —
  they do not touch 3C. The packet's "same minimal-footprint set as 3B"
  claim is honest.

## Evaluator flag audit vs the changed zones

Changed zones are LOW hull: y ≤ 1.13 over z 1.74..2.26 (sprocket wrap) and
z −3.37..−3.95 (idler wrap), plus interior in-band walls. NO flagged edge
lands inside either zone. The rear view — the fixed region — is the
cleanest edge set of all 14 (22 matched, ONE flag >1.5° at Δ+1.6°). Worst
flags elsewhere sit in regions r12 never touched (rear Δ−14.4° at
[1.58, 1.78, 0] hull-shoulder line; rearright Δ−11.9° at [1.37, 1.68, 1.36]
deck/fender line; left Δ−11.8° at y 1.87 z −3.36 rack-band top) — standing
graduation cert, plus the sub-0.25 m ±4°-floor corner classes (§D
calibration).

## Per-focus-view verdicts (changed regions, same-vehicle-same-tier)

| view | score | read |
|---|---|---|
| rear | 9.3 | The fixed 718-voxel zone. Corner flap stacks + v2 curtain tiers read as the ref's own brown corner curtains — contiguous tiered mass, no track through any solid at 1x. MASK-METHOD (coords per §D): under-tail clearance band proc rect(830,540,1090,580) 97% sky vs ref rect(200,540,425,580) 100% — same open-clearance class; tail-plate band above proc 4% vs ref 9% sky — solid on both. Cleanest evaluator edge set of all views. Proc tier seams read crisper than the ref's smooth fabric at 3x — the certified r6 fold-band residual class, invisible at 1x. |
| rearleft | 9.1 | Near rear corner IDENTICAL to the graduation read (self-audit p5/p25/med 29.5/64.3/78.7 unchanged). Track passes UNDER the lifted rack front (frontClear bot 1.06) with a real shadow gap; curtain tiers hang clear of the wrap; under-tail track visibility matches the ref's own under-overhang track language. Flagged edges are the ground-line + turret-zone classes, unchanged regions. |
| rearright | 9.1 | flapR med 99.8 → 97.7 moved TOWARD ref 81.3 (self-audit). Under-rack gap probed rect(1090,415,1180,430) **0/1350 sky px** = shadow, not see-through — attached read holds (§B2). The dark strip right of the corner flap rect(1222,395,1242,455) is 97% sky = open background PAST the silhouette edge, not a hole. Track guide-horn row under the rack reads as contained track, matching the ref's under-tail. Worst flag Δ−11.9° at the deck/fender line — untouched, standing cert. |
| front | 9.2 | Lane edges clean both sides: full-width track front faces, flap/eyelet hardware above them, glacis toe clear of the band inner faces (hwClamp 1.13 — dark lane separation visible, no hull solid in either band). Bow rakes per the ref (§B1). Wrap-zone y ≤ 1.13 carries zero evaluator flags; remaining flags are 0.11–0.17 m ±4°-floor corner segments at skirt/track corners. |
| close-front | 9.2 | The front money view: sprocket wrap complete with the two-layer track (pads + chain/guide horns) curving over the drum, frontBoard tail ENDS clear of the wrap crest (z1 2.26), fringe hangs forward of the wrap face, nothing slices the arc. 1 paired arc, yawProxy 0.6°. Raked glacis + chin wedge + sleeve rings = the graduation look intact. |
| left | 9.1 | Both lane ends contained: sprocket wrap toothed and clear under the diving bow/board; idler wrap arc FULLY visible behind the hanging curtain tiers (the r6 tiers used to sit inside this annulus) with the rack floor passing over it. Bow-toe flags are sub-0.25 m ±4°-floor class; p95 Δtop 0.414 m columns are the certified whip/mast classes. |
| right | 9.1 | Mirror-clean: board + light pot at the nose, fringe forward of the wrap, curtain tiers hanging clear at the idler with sky between tier bottoms and the exiting track run. No clip, no float. |

Supporting (non-focus) checks: hero-rearright — perspective attached reads
throughout (chains/rack/wings/whips), track under the rack in real shadow;
hero-toptilt + view-top — decks FILLED, no sky through hull or turret (§B2
machine scan 0 holes; the evaluator's 5.007 m² "enclosed-void" is its
disclaimed under-barrel/parallax class, same as the leo2a6 precedent); top
plan extremes untouched (curtain tiers w 0.50 inside the flap w 0.64
footprint; pods 3.055 / tail frame −4.52 span carriers untouched in the
diff).

## RE-CERT: YES

All changed views ≥9.0 (min 9.1 rearleft/rearright/left/right; max 9.3
rear). The rear wrap that carried 718 exact voxels now reads as a clean
contained wrap at every angle (0/0 on the official audit), every moved
member reads attached (curtain tiers, flap stack, rack front segment,
board tail), and the graduation look survives — renders byte-identical to
the self-audited set, gate held at the graduation-class line 90.5 ×2, hash
1d9b026c matches the packet. Re-freeze at the orchestrator's landing is
approved from the critic side.

Residuals (declared, priced, non-blocking): curtain tier seams crisper
than the ref's fabric at 3x (r6 fold-band class); under-tail track row
more lit/regular than the ref's shadowed under-tail (within the r8
dead-rear cert); hull-shoulder/deck-line edge flags in unchanged regions
(standing graduation cert); whip-tip aliasing pair + s4 window
quantization (packet-carried since r5).
