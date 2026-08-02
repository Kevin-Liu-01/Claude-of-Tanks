# m1a1 trio shaded-parity r1 — independent critic (2026-08-02)

Covers the shared build of m1a1 / m1a1ha / m1a2_tejas (one geometry, one
tejas oracle). Geometric gate 90.4 gatePassed all three (bf7ae1d).
Verdict: FAIL — min 6.0.

front 7.0 · fl 7.0 · left 6.5 · rl 6.5 · rear 6.0 · rr 6.5 · right 6.5
· fr 7.0 · top 7.5. FILL PASS (bustle over-closed — crate not rack).
CIRCULARITY PASS (square cog teeth = fabrication style, not faceting).
Compressed furniture heights correctly NOT penalized (warp-normalized).

## Defect list (fleet-recipe mapping in brackets)

1. Suspension fabrication: flat hub discs printed on a continuous
   skirt-bottom plate, no round wheel volumes below the skirts, pure-
   black cog-tooth track slab [isu122s r3 channel law + wheel packages;
   3-D tone law: ref is warm brown-gray].
2. Turret massing: second-story superstructure + khaki crate stack —
   too tall/boxy/long (~2/3 hull length vs ~45% ref) [merkava r3
   cheek-wash + raked-spine recipe — interior volumes, envelope holds].
3. Rear plate blank — M1-signature full-width fine-pitch exhaust grille
   missing [leo2a6 tilted-slat law for rear-face light].
4. Bustle = closed tan crate with false panels — needs rack depth +
   stowage read [merkava r3 open-frame basket recipe; kill the tan].
5. Untextured gray placeholder boxes mid-height in both rear track runs.
6. Black debris fragments along fender/glacis edges + a stray pole on
   the glacis [same class as isu122s orange fragments — bucket audit].
7. Track tone pure glossy black [3-D tone law on-element].
8. Smoke dischargers one-sided pink/maroon; opposite cheek lone beige
   cylinder — matched dark clusters both sides needed.
9. Saturated BLUE slivers at hull/turret junction, commander ring, rear
   roof [recurring class — palette audit].
10. Invented corner hardware (square posts w/ beige caps, black
    L-brackets) absent from ref — delete.
11. Muzzle needs the MRS collar step; pintle MG barely visible [bulk
    laterally under p95, merkava precedent].

Gate must hold 90.4 all three; m1a1_aim 53.6 holds; dims-p95 raster law
(edges ≥6mm from column boundaries) applies to any new geometry.
