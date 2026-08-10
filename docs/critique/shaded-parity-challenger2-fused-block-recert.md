# Challenger 2 fused-block repair — independent §B8 re-certification (2026-08-10)

**PASS.** The fourteen fresh source/procedural pairs in
`shots/critic-challenger2-fusedfix/` clear the mandatory >=9.0-per-view bar.
All files are distinct 1280x640 captures with a common fresh sitting time and
zero console errors. Three yaw diagnostics and two garage views separately
verify articulation and load paths.

Current procedural freeze: **3b4bd5f0**, reproduced x2 (42 meshes / 250,157
vertices).

## Receipt

| Check | Result |
|---|---:|
| Geometry gate x2 | PASS, minimum 90.1 |
| Hull / whole / turret | 90.5 / 90.1 / 90.3 |
| Stations / dimensions / floaters | 91.8 / 93.1 / 100 |
| Exact track clip | 0/0 |
| Standard check | contiguity 0; MG 1+1d |
| Turret parent | 0 stranded / 0 abutting / 0 dangling |
| Winding / yaw audit | 0 reversed / 0 mixed; 0 yaw candidates |

## Independent shaded-parity scores

| View | Score |
|---|---:|
| view-front | 9.1 |
| view-frontleft | 9.1 |
| view-left | 9.0 |
| view-rearleft | 9.0 |
| view-rear | 9.1 |
| view-rearright | 9.1 |
| view-right | 9.0 |
| view-frontright | 9.1 |
| view-top | 9.0 |
| hero-frontleft | 9.1 |
| hero-rearright | 9.1 |
| hero-toptilt | 9.0 |
| close-front | 9.1 |
| close-roof | 9.1 |

Floor **9.0**; mean **9.06**; **14/14 PASS**.

## Articulation verdict

Yaw/load paths pass at **9.3**. The shell, gun, RWS, hatches, optics, smoke
furniture and their bases rotate as one coherent turret. The former fixed
duplicate turret mass is gone; only the low physical ring landing remains
beneath it. No unsupported decoration, empty-air seam, occlusion island or
attachment split is visible. Rear-deck equipment correctly remains hull-owned.

The narrow bow bridge closes the centre-strip/cross-loft seam without widening
the nose, producing a false wall or colliding with the running gear. Preserve
the bridge and current parenting exactly as captured.

Repaired oracle SHA-256:
`f44e3b46ee07a457b04fff6cdf8950f880a45fd22d952226e2ef16a4bd3c49ba`;
pristine `.bak`:
`1be3ef855ac9c441e38262a4ae26600d14c763c70c867024554499a451f9ad48`.

**Verdict: Challenger 2 fused-block repair PASS.**
