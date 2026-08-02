# leo2a6 shaded-parity r5 — independent critic (2026-08-02)

Gate 91.0 gatePassed (78e3d8a). Verdict: FAIL — min 8.5. SEVEN views at
9.0 (front 8.5, rear 8.5). Laws hold, no regression. Trajectory
6.5→7.0→8.0→8.5→8.5 with the floor narrowing to two single-mechanism
views.

R4 items: bustle backing FIXED (0.0% bg straight-on) · band sat
IMPROVED (20-21% vs ref front-face 15.2-15.3 — 1.35x, was 1.8x;
SAMPLING LESSON: builder's ref rects matched the SIDE run 21.7-23.5%,
not the FRONT faces being scored — sample the rect on the VIEW/element
scored) · grille IMPROVED (real separators now, but renders ~7 rows at
1/3 ref contrast: delta 8-17 lum vs ref 30-45) · front wrap NOT FIXED
(proc corner 1.19-1.23x LIGHTER than its own face; ref wrap is DARKER
than face ~0.92x — the darkening never landed) · barrel bands present.

## R6 work order — two elements + one hero patch

1. FRONT WRAP: darken the track top/corner zone to ~0.92x of the face
   lum (ref's wrap accent) — proc tops 64.6/67.5 vs ref 54.2/54.8;
   kill the residual pink band. This alone unblocks view-front.
2. REAR GRILLE + GRID: separator delta to ~30-40 lum (lines ~52-61 →
   ~45, slat faces ~69 → ~80; true 10-row render needs >4.5px pitch);
   tint bustle grid cells toward bin-green (cells 63.9 lum/14.3 sat vs
   ref bins 78.2/25.9). This unblocks view-rear.
3. Band front faces: one desat notch (20-21 → ~16%), hue +6 toward 34,
   shadow floor p10 55 → ~46 (same move as 1, one material family).
4. HERO-ONLY (not scored, game-visible): seal fan-well floors +
   deck-edge triangle — 504 enclosed bg px punch through at low oblique
   (sky leak in game).
