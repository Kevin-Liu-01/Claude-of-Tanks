# Track-containment audit — fleet state (2026-08-03)

Owner law (GEOMETRY-GATE.md owner directive #4, commit 7c5f64e): tracks must
not clip through the front or rear of the tank. Tool:
`node tools/track-clip-audit.mjs [--exact] [--ids=a,b]` — voxel overlap (2cm)
between the two track band meshes (DynamicDrawUsage fingerprint) and
center-reaching hull solids in the front/rear wrap zones. `--exact` counts
true surface coincidence; the default adds a 2cm near-contact margin.
Full JSON: shots/track-clip.json (local).

## Exact-overlap results (voxels; ≥300 = visible clip class)

| tank | front | rear | class | routing |
|---|---|---|---|---|
| m1a2_tejas | 1139 | 219 | SEVERE (owner screenshot tank) | abrams lane, graduate-change protocol after the in-flight m1a2 visual round |
| m1a1ha (+m1a1, same build) | 1139 | 219 | SEVERE | with the tejas fix (shared build) |
| kf51 | 765 | 144 | SEVERE | leopard lane r2, graduate-change protocol |
| merkava3b | 315 | 727 | SEVERE (rear) | merkava lane, graduate-change protocol after r10 |
| merkava3c | 303 | 718 | SEVERE (rear) | with 3b |
| leo2a4 | 83 | 420 | SEVERE (rear) | base-game tank — wave-2 (no ledger family) |
| leo2a6 | 418 | 148 | SEVERE (front) | leopard lane r2, graduate-change protocol |
| type74 | 370 | 260 | SEVERE | misc lane (in-flight agent notified) |
| leo2a7 | 111 | 230 | moderate | base-game — wave-2 |
| isu122s | 34 | 215 | moderate (rear) | casemate lane after isu152 r4 |
| tiger1 | 67 | 134 | low | base-game — wave-2 |
| kv2 | 115 | 18 | low | watch |
| m60a1/m60a3 | 26 | 22 | clean-ish | none |
| is2 / leo1a5 | ≤36 | ≤20 | clean-ish | none |

Dilated (near-contact) sweep of all 31 procedural ids flagged 30 — the 2cm
margin reads design-normal skirt/sponson seams; use --exact for orders.
Anomaly: t30 builds 0 band meshes (different track path?) — investigate in
its family round.

## Fix pattern
The wrap arcs at bow/stern intersect the merged hull mesh (rig_hull) and
unnamed fender/plate pieces. Fixes are per-profile: pull the lower bow/stern
plate lip clear of the wrap (or shorten fender overhangs), keeping the
geometric gate ≥90 (nose/tail curve rows have 1-2 col tolerance for a 2-4cm
lip move). Graduates follow the graduate-change protocol: fix → gate hold
via override → critic re-cert ≥9.0 → re-freeze hash, one commit.
