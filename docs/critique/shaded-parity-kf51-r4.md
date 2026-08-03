# kf51 shaded-parity r4 — independent critic verdict (2026-08-02)

Rig: shots/critic-kf51/ (b69fd6e state); ITU-601 on-element; cap laws
cross-checked (UNITS: builder "V" = HSV percent; V21-22% ≈ luma 52 — the
capped elements render 52.6 exactly).

## Verdict: FAIL — min 8.0 (6.5 → 6.5 → 7.0 → 8.0: biggest move yet)
front 8 · rear 8 · ALL other twelve views 8.5. Same-vehicle read solid
everywhere; deltas are tone amplitude + roof furniture, not identity.
FILL PASS. CIRCULARITY PARTIAL (pano ring circular but zero-volume).

## R3 verification: moat FIXED (31-32 luma over 8px both sides + toptilt
28-32 — reads in perspective) · brow FIXED (ladder 40.7/48.6/61.7 in
band) · tower FIXED (open frame, step 26, see-through) · SEOSS FIXED-
marginal (crest reads close-roof only; +18.5mm ≈ 2px at view scale) ·
bay FIXED (floor at cap; residual idler daylight notch) · plate PARTIAL
(hex position/size right at cap; CHEVRON ~15% of ref weight — the one
plainly missed item) · camo FIXED-mostly (turret sweeps in family; hull
lacks the bimodal giants) · ring dia capped-accepted, LIP not delivered
(engraving read stands).

## LAW CORRECTION (major): THE AMBIENT FLOOR IS BEATABLE VIA ALBEDO —
the moat material (0x1d1e13, env 0.05) renders luma 31 on a top-facing
face. The "V21/luma-52 unreachable" claim is RETIRED: dark-albedo +
near-zero env reaches ref-black classes. Apply to hex bores, flaps,
dark panels fleet-wide. (Critic flagged as observation; adopted as law.)

## R5 work order (two targets + tone passes)
1. CHEVRON TO REF WEIGHT (holds rear at 8.0): 15-20px beveled recessed-
   frame members (~7x current), tie bar to match.
2. FRONT OPTICS CLUSTER (holds front at 8.0): pano head hint within the
   certified head-depth bound (two-eyed drum) + dark lens bores on the
   SEOSS face — restore the "face" of the primary view; kill the rack
   mullion billboard crest read.
3. TRACK BRIGHTS: shoes p90 83/max 92 → ref p90 59.5/max 67; variation
   INTO darks (ref p10 32) — tone-only, link-pitch-safe; use the
   dark-albedo route.
4. PANO RING VOLUME: bright rim arc + inner groove shadow (dia stays).
5. ROOF PER-PLATE VALUE BREAKS: rubber-dark panels + pale strips per ref.
6. REAR DECK: fan disc + slat grilles + shoulder arcs → dot-perforated
   plate + stowage boxes (hero-zoom item).
7. WHEEL/SKIRT AMPLITUDE: Δ3 → toward ref Δ24 (wheels darker, polarity
   kept; dark-albedo route now available).
8. RACK SLATS: camo'd + irregular (currently pale metronome).
