# leo2a6 GRADUATE RE-CERT r4 (track-containment round) — 2026-08-03

Scope: dual-gate graduate, re-cert of CHANGED regions only (bow mudguard
plank + glacisLaneCut + fenderFore sliver, drum-face rim-ring de-embed
both ends, sponsonLaneLift). Graduation cert stands for unchanged views.
Renders: fresh `node tools/tmp-tank-critic.mjs --id=leo2a6` →
shots/critic-leo2a6/ (14 views, zero console errors) + zoom crops at
shots/critic-leo2a6/crops/ (crop tool tools/tmp-recert-crops.py).

## Official-rig evidence (my own runs, this tree)

- `tools/track-clip-audit.mjs --exact`: **front 0 / rear 0** (was
  418/148). The fix's whole point, confirmed on the official tool.
- `tools/tank-standard-check.mjs`: gate min **90.9**, components
  91.2/90.9/90.9/92.6/91/100 — matches the builder's PASS ×2 line (this
  is a third independent confirmation). Contiguity **0 holes**, clip
  0/0. Decor `mg0+0d ✗` is the carried §B3 packet justification
  (r6-refreeze MG3 hand-authored, predates KIT.fittings, unchanged this
  round) — not a new failure.
- `tools/tmp-hashgeo.mjs`: leo2a6 **80b76338** (46 meshes / 154164
  verts) — matches the packet's NEW HASH exactly. Siblings byte-exact
  per §F2: leo2_revolution 44acdee0, leo2a7v e28fc316, leopard2_proto
  5647ef3e — all three match the packet triple. (leo2a5 dabf2a27 is not
  in the frozen triple — it is the other active build of this round,
  out of my scope.)
- `tools/visual-evaluator.mjs --id=leo2a6`: exit 0, **no RIG MISMATCH**
  — yawProxy ≤1.4° on all 14 views (worst close-front 1.4°, next 0.9°
  rear; abort threshold 10°). Evidence at shots/visual-eval-leo2a6/.

## Per-focus-view verdicts (changed regions, same-vehicle-same-tier)

| view | score | read |
|---|---|---|
| front | 9.2 | Tracks proud of nose both sides, ZERO clip at 1x. Planks continuous with the full-width fender line; centre notch open (bare glacis tip) like the ref; shackle/light fittings row inboard. Evaluator front-view flags (worst Δ-9.8° at midWorld [1.72,1.92,1.60]) sit in the turret-side band — untouched region, standing cert. p95 Δtop 0.177m / Δbot 0.128m, yawProxy 0.6°. |
| frontleft | 9.1 | 3x crop: idler wrap arc fully clear, plank hugs the crest, dark hullRubber nose lip reads as the ref's rubber mudguard front. Attached read: plank merges into the fender line + light-pot mount inboard, contact shadow under the lip. Bow-region flags are sub-0.3m corner segments at the ±4° floor (worst Δ-7.1° len 0.28m at [1.91,1.08,3.57] = plank outboard corner, floor+3.1) — render read is correct; no-finding class. |
| frontright | 9.1 | Mirror-clean of frontleft (Δ+7.5° same corner class at [-1.91,1.08,3.57]). Wrap clear, plank attached, no see-through between plank and glacis. |
| close-front | 9.2 | The money view: full idler wrap visible with teeth, NO hull solid through the band (old kit wings gone), plank + rubber band read exactly as the ref's diving mudguard at this tier. yawProxy 1.4° (parity OK). Paired arc is the muzzle (ref r 0.122m/145.4° vs proc 0.112m/123.8°, rms 2.6/3.4mm) — untouched region, within same-tier read. |
| hero-frontleft | 9.1 | Perspective volume verified; bow reads attached and dives over the wrap; no float, no clip. |
| hero-rearright | 9.0 | Sprocket drum + sponson region clean. The evaluator's `proc enclosed-void 2.688m² @ [-1.08, 2.20, 0.88]` is the under-barrel/deck gap class its own note disclaims — the ref pair shows the same open region, and the §B2 machine scan reads 0 enclosed cells. No-finding. |
| hero-toptilt | 9.1 | 55° tilt: deck FILLED, no sky through hull or turret, planks read as mudguard tops. Bow flag Δ9.3° is one 0.28m ±4°-floor corner segment ([1.95,1.56,3.33]) — no-finding. |
| left | 9.1 | Drum rim-rings (idler front, sprocket rear) read as face-detail rings fully INSIDE the band at 5x — no embedding, wrap silhouettes toothed and clean. Bow profile: plank top reads flush with the ref's 1.129 side-col law; the declared single-column −0.04m residual at z≈3.66 is a 1-2px dip at 5x, invisible at 1x. REARDRUM flag Δ-11.5° (0.84m at z −3.60, y 1.02) is the stern rake line — untouched this round, standing cert. p95 Δtop 0.081m. |
| right | 9.1 | Mirror: both drum faces clean (bolt ring + hub rings inside the wrap), bow tip identical read. Δ+12.3° at z −3.60 = same untouched stern class. p95 Δtop 0.098m. |
| top | 9.1 | Plan: front face reads straight at the planks (3.77 plan law) with the open centre notch, matching the ref's own recessed nose centre; no plan-view track/hull overlap; deck filled. Long plan procOnly side edges (proc x 1.68..1.70 vs ref x 1.77..1.78, different z spans) are dims/width class already priced in the held gate (dims 91). |

Rear view (non-focus, checked because sponsonLaneLift claimed it): zero
rear-view slit above either track — skirt tops meet the lifted 1.42
floor. Confirmed.

## RE-CERT: YES

All changed views ≥9.0 (min 9.0 hero-rearright; max 9.2). The bow shows
no track clipping at 1x anywhere (0/0 on the exact audit), the plank
reads attached per the contiguity law, drum rings de-embedded, and the
90.9 gate + 80b76338 hash match the packet. Re-freeze at the
orchestrator's landing commit is approved from the critic side.

Residuals (declared, priced, non-blocking): single side column z≈3.66
at 1.106 vs old-wing 1.147 (−0.04, in the held gate); muzzle arc span
delta (untouched region); stern rake Δ~12° left/right (pre-round,
covered by the standing graduation cert).
