# isu122s shaded-parity r1 — independent critic verdict (2026-08-02)

Rig: fixed-world per-model ortho pairs at the board's 9 views + 2 hero
perspectives + 2 closeups (mantlet, roof cluster), board light rig, camoSeed
4242, quality high — `tools/tmp-isu122s-critic.{html,mjs}` (tmp, gitignored;
pairs at `shots/critic-isu122s-r1/`). Critic: independent agent, fresh eyes,
rubric "same vehicle, same tier", pass = ≥9.0 every view.

Harness note: the r1a capture was rejected by the critic itself (blank
procedural halves — bounding boxes computed on a root left hidden by the
previous render pass; every camera after the first pair was garbage). Fixed
by computing both boxes once while both models are visible + projected-extent
framing + a lit-pixel floor guard that refuses to write near-empty pairs.

## Verdict: FAIL — min view 4/10 (geometric gate 90.6 stands)

front 4 · frontleft 5 · left 4 · rearleft 4 · rear 4 · rearright 4 ·
right 4 · frontright 5 · top 4.

The defect classes are precisely the geometric gate's blind spots — depth
volumes inside the certified silhouette, sub-mask-resolution furniture, and
material/tone. This is the dual-gate working as designed (m60a1 precedent:
r3 min 3 → r5 min 9 was all readability/material work at held masks).

## Defect list (critic's, most severe first)

1. Ball mantlet missing — gun exits a flat stepped plate. The ball is a
   DEPTH volume: invisible to every ortho mask, decisive at any shaded view.
2. Casemate/low-deck silhouette break reads weak — rear deck furniture
   (oversized vent strips) visually fills the step so the profile reads as
   one long box under flat shading.
3. Running-gear tier: monolithic unlit-black track slabs, exposed toothed
   top run, wheels read flat with triangular cutouts instead of six large
   twin IS wheels; see-through gaps between link stacks at close range.
4. Rear-fender fuel drums absent (identity cue; present on the ref print).
5. Roof furniture density ~20% of ref at closeup (cupola rims, periscope
   heads, ventilator dome underscaled/missing).
6. Hollow black void between sponson overhang and track run (all quarter
   views) — §7.2 plate-fill class; web at the fender plane, match ref voids.
7. Stray ORANGE fragments on ≥5 views — mis-materialed prop(s).
8. The certified hullLengthM rod-stowage beam reads as FLOATING geometry
   ahead of the bow (right side) — needs a support bracket to the bow
   (silhouette-neutral), not deletion (it carries dims).
9. Front fenders/mudguards absent; bow shows lamination striations.
10. Engine-deck grille field = three oversized flat strips; needs measured
    grille texture/relief.
11. Muzzle brake simplified — restore the double-baffle read (dark slot
    core, two baffle rings).

## Standing law for the fix round

- Geometry additions must stay INSIDE the certified silhouette; gate must
  re-verify ≥90 every component after the round (any geometry edit
  invalidates this verdict — re-run BOTH gates).
- isu152 shares isuCommon() — its 72.4 row must not regress.
- Track/material work follows the m60a1 r5 recipe (shade-floor materials,
  tone parity ~0.92-1.16 luminance ratio) + kv2 track band tone law.
