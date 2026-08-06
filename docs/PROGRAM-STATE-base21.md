# BASE-21 ROSTER — exact id enumeration (registry §4 deliverable)

OWNER CORRECTION (2026-08-06, mid-slice, verbatim): "for the ww2 base-21
slice, its not all ww2, theres many modern tanks like challenger and t14
armata in there, and focus on those first." — slice 2 REORDERED: modern
base originals first (challenger2, t14 = the named priorities; exact ids —
no `t14_armata`/`k2_black_panther` ids exist in TANK_SPECS), sherman/
tiger1/t34_85 drop to last-if-budget. Ownership per the correction:
abrams.js / russia.js / misc.js / uk.js / leopard.js are owned by other
live agents — modern base tanks whose family homes are owned get QUEUED
notes; challenger2 (modern1.js) and t14 (modern2.js) rebuild IN their
current profile homes, which no live agent owns.

Slice-2 builder (WW2 originals + modern-first correction), 2026-08-06. Method: runtime cross-check —
`tools/tmp-modelsource-dump.mjs` (104 registered TANK_SPECS ids, 34 glb-sourced)
vs `docs/geometry-gate/ledger.json` (88 rows; `cruiser` is a ledger row with no
registered spec). **17 registered ids carry NO ledger row and NO registered GLB
source.** Of those, 15 are the original base-game customs; 2 (`t30`, `is1`) are
community-wave ids whose prints failed QA (quarantined `candidateGlb`, fallback
procedural) — listed for completeness, flagged non-original. The owner's "21
originals" resolves as: 15 no-oracle originals + the originals that since
gained recovered/community oracles and modernize through the normal GATE lanes
(9 ids, second table). 15 + 9 = 24 original customs; the exact no-oracle
photo-class pool is the 15.

FALSE-0 LAW for every id in table A: **never gate them** (no reference GLB —
tmp-tank-critic refuses, the gate would print a meaningless 0). The bar is the
PHOTO-CLASS FLOW (leo2a4 law, banked in docs/references/tanks/leo2a4.md):
proc-only 14-view rig + §B machine battery + published-dims self-anchoring.

## A. The no-oracle photo-class pool (no ledger row, no registered GLB)

| id | profile home (builder) | current state (2026-08-06) |
|---|---|---|
| challenger2 | **modern1.js buildChallenger2 (rebuilt in place)** | **REBUILT this round (owner-named priority)** — was: authored ±1.895 vs the 3.52 spec width, 11.9 overall vs 11.50, clip 102/78 + shoe 182/74, mg0. uk.js (family home) is OWNED by the live uk round-4 agent — family-rig migration QUEUED for that lane |
| t14 | **modern2.js buildT14 (rebuilt in place)** | **REBUILT this round (owner-named priority)** — was: ±2.04 authored vs 3.9 spec width, rear furniture to −4.57 vs ±4.35, clip 67/12 + shoe 140/10, mg0. russia.js is OWNED — family-lane migration QUEUED |
| leo2a7 | tankFactory.js buildLeo2A7 | ancient base-game modern (hero-tex set); leopard.js OWNED by live leopard agent — QUEUED for that lane (family V3 rig ready; a4/a7v precedents) |
| chieftain_mk10 | modern3.js MODERN3_BUILDERS | ancient old-machinery modern; uk.js OWNED — QUEUED (chieftain5 recipes apply). Next modern-slice candidate in modern3.js |
| k2 | modern3.js | ancient old-machinery modern; no family lane — modern3.js free, next modern-slice candidate |
| type10 | modern3.js | ancient old-machinery modern; no family lane — modern3.js free, next modern-slice candidate |
| type99a | modern2.js | ancient old-machinery modern; modern2.js free (this slice owns it) — next modern-slice candidate |
| leo1a5 | modern2.js | ancient old-machinery build; Leopard 1 ≠ Leopard 2 rig (a new family rig either way) — modern2.js free |
| t72b3 | modern1.js MODERN1_BUILDERS | ancient old-machinery modern; russia.js OWNED (t72b3m recipes live there) — rebuild in modern1.js possible next slice |
| leo2a4 | **profiles/leopard.js buildLeo2A4** | **DONE — slice 1 (2026-08-06)**: photo-class rebuild, batteries clean, self-read floor 8.5 |
| m4a3e8 | tankFactory.js → **profiles/ww2.js buildShermanE8 (WRITTEN, parked)** | rebuild authored this round, smoke-passed (46 meshes); photo-class ladder + battery PARKED by the owner's modern-first correction — glacis-furniture rx sign fix pending (derivation banked) |
| tiger1 | tankFactory.js → **profiles/ww2.js buildTigerI (WRITTEN, parked)** | rebuild authored, smoke-passed (46 meshes); ladder parked per correction. HIGH-VIS: garage BAY_A display + marketing closeup target |
| t34_85 | tankFactory.js → **profiles/ww2.js buildT3485Base (WRITTEN, parked)** | rebuild authored, smoke-passed (36 meshes); ladder parked per correction |
| is2 | tankFactory.js buildIS2 | ancient (r7-era slab glacis; census 0; §B6 unaudited) — ww2/soviet-heavy lane, later slice |
| panther_g | tankFactory.js buildPanther | ancient; ww2 lane, later slice |
| t30 (non-original: community wave 2) | profiles/ww2.js buildT30 | bespoke procedural (candidateGlb quarantined "single fused mesh"); zero/low-triage "walls" item stands |
| is1 (non-original: community wave 3) | none — `visualBase: 'is2'` chain | renders the is2 build re-badged; candidateGlb quarantined; inherits whatever is2's modernization lands |

## B. Original base-game customs that HOLD oracles (normal gate lanes — not photo-class)

| id | profile home | ledger 2026-08-06 |
|---|---|---|
| m1a2 | profiles/abrams.js | 91.0 PASS (recovered print; abrams lane) |
| leo2a6 | profiles/leopard.js | 90.9 PASS |
| leclerc | profiles/misc.js | 85.3 (left-side fix landed) |
| m2a2_bradley | modern3.js (no profile override) | 84.7 |
| bmp2 | modern3.js (no profile override) | 84.0 (ceiling) |
| ariete | profiles/misc.js | 82.3 (wrap break landed) |
| t90m | profiles/russia.js | 81.7 |
| t80u | profiles/misc.js | 75.4 (orientedSlab carrier open) |
| merkava4 | profiles/merkava.js | 0 (family rebuild lane; evac-at-station find) |

## C. Slice-2 status (this round, post-correction)

- **challenger2 DONE** (modern1.js rebuild in place): clips 102/78+182/74
  -> 0/0+0/0, contig 0, census mg1+5d, §B5 0/0/0 + yaw-90 proof, dims
  true (±1.76 / 11.505 overall), self-read floor 8.6. Hash 22c8127
  (52/68820). Packet: docs/references/tanks/challenger2.md.
- **t14 DONE** (modern2.js rebuild in place): clips 67/12+140/10 ->
  0/0+0/0, contig 0, census mg1+2d, §B5 0/0/0 + yaw-90 proof, dims true
  (±1.95 / 10.80 / rear envelope ±4.35), self-read floor 8.6. Hash
  1d232727 (41/49720). Packet: docs/references/tanks/t14.md.
- npm test 166 + track-geometry PASS at the round tree.
- ww2.js resident hash invariance PROVEN (9 ids byte-identical before/
  after this round's ww2.js additions): t30 83b4de0, t34_85_cad
  d6d7ddd0, newc_tiger 7dcbf040, newc_pziii c574b162, pziii_konserwa
  4e3e5d94, leichttraktor 4c282c54, q_heavy 6ca8cdcc, tiger2 f134d19c,
  sherman_jumbo b52ae76c.
- sherman (m4a3e8), tiger1, t34_85: rebuilds AUTHORED in
  `src/vehicles/profiles/ww2.js` (WW2_PROFILES override — the leo2a4
  PROFILED_BUILDERS-wins mechanism; old tankFactory builders stay as
  frozen CANONICAL donors) and smoke-passed (46/46/36 meshes; hashes
  f0989754 / b9c5939c / 343016a4). Their photo-class ladders (battery
  iteration + self-reads + packets) are PARKED per the owner's
  modern-first correction. Known pending fix banked: glacis-furniture
  plate-class rx signs on m4a3e8 (+0.76 plates / −0.81 drum axes —
  derivation in the round report).
- Photo-class rig for the slice: tools/tmp-ww2-photoclass.{html,mjs}
  (leo rig clone per the PHOTO-CLASS FLOW law; id-generic — used for the
  moderns too).

## D. Recommended next slices (orchestrator lane to schedule; modern
## first per the owner correction)

1. MODERN slice 3 (modern3.js free): k2 + type10 (+ chieftain_mk10 if
   the uk lane stays busy — its natural recipes live in owned uk.js).
2. MODERN slice 4 (modern2.js): type99a + leo1a5.
3. t72b3 (modern1.js home; russia lane owns the t72b3m recipes — either
   rebuild in place or wait for that lane).
4. leo2a7 (leopard lane when it frees — V3 rig param delta, cheapest).
5. ww2 finish: m4a3e8 / tiger1 / t34_85 ladders (builds already
   authored + parked in profiles/ww2.js), then is2 + panther_g (is1
   inherits is2 for free).
