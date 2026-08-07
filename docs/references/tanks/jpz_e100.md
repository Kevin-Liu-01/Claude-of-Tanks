# Jagdpanzer E 100 (`jpz_e100`)

**Exact variant modeled:** the World-of-Tanks-style Jagdpanzer E 100
("Krokodil") — a fan reconstruction of Krupp's 17 cm StuK L/53 assault gun on
the E 100 chassis (project of 1944; only a 1:5 wooden model was ordered).
This is a PAPER/FAKE vehicle: the oracle GLB (WoT-style print) is the
authoritative shape target; book dims below are the chassis program's.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length (E 100 chassis) | ~8.7 m | tanks-encyclopedia.com/15-17-cm-sturmgeschutz-auf-e100-fahrgestell/; wiki.wargaming.net/en/Tank:G72_JagdPz_E100 |
| Overall length (w/ 17 cm gun) | ~11.1 m | wargaming wiki model; spec sheet 11.1 m |
| Width | ~4.3 m (E 100 with combat tracks + skirts) | tanks-encyclopedia (E 100 4.48 m over skirts); spec 4.3 m |
| Height | ~3.29 m | spec sheet; oracle 3.32 (normalized) |
| Gun | 17 cm StuK/PaK L/53 (~9 m full tube; WoT model shows ~5 m exposed), plain thick muzzle | tanks-encyclopedia fake-tank article; wargaming wiki |
| Running gear | E 100: overlapped wheel stations behind FULL-LENGTH heavy side skirts, drive moved to the REAR on the real chassis | tanks-encyclopedia (CIOS data) |

## Identity cues

- Enormous central casemate: front plate strongly sloped (~30°), sides
  sloped in, flat roof with two hatches + vents; casemate front blends into
  a Maus-like flat 45° glacis.
- Gun: very thick 17 cm tube in a broad saukopf-ish cast collar low on the
  casemate front; stepped sleeve at the root.
- Hull: full-width sponsons over HEAVY slab side skirts covering the top run
  (Maus/E 100 look); flat fore deck ahead of the casemate; tow eyes on the
  vertical bow shelf.
- Running gear: mostly hidden — wheel bottoms + deep skirt; wide tracks.
- Roof/deck: engine deck grilles behind the casemate, jack + stowage on the
  rear deck, spare links on the bow shelf.

## Reference links

1. https://tanks-encyclopedia.com/jagdpanzer-e100/ — fake-tank provenance
2. https://tanks-encyclopedia.com/15-17-cm-sturmgeschutz-auf-e100-fahrgestell/ — the real 1944 project + E 100 chassis data
3. https://wiki.wargaming.net/en/Tank:G72_JagdPz_E100 — the modeled shape

## Local GLB oracle notes

Path: `public/models/tanks/community/jagdpanzer_e100_haphazard.glb`
(fixedMount). Width-normalized to 4.3 m: 11.09 m long × 3.32 m tall.
Casemate roof well above the r1 parametric build (2.65 m); baseline proc was
LONGER than the oracle (11.71) — gun must come in. Fused mesh: component
masks N/A. For a paper vehicle the oracle IS the identity target.

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | whole | tracks | change |
|---|---|---|---|---|---|
| 2026-07-30 | 83.3 | 81.6 | 83.8 | 81.4 | baseline (parametric CASEMATE box) |
| 2026-07-30 | 83.4 | 78.4 | 83.9 | 81.4 | bespoke rebuild: Maus-like 46° glacis + long fore deck w/ grilles (front powerpack), REAR-set casemate (roof to z −3.38), saukopf collar on bolted ring (sealed), 17 cm tube to the oracle's +6.72 muzzle, heavy slab skirts w/ panel joints, hidden dished gear |

Remaining gap: rear 78.4 — the oracle's rear face is bulkier low (its
casemate rear blends into a fuller tail); front/rear masks trade against
the side views on this print. Paper vehicle: oracle is the identity
target per the packet.


## Geometry gate v9 (2026-07-31, from-scratch agent)

Two-layer rebuild: piecewise sloped roof (2.76@+0.76 -> 3.30@-3.0), skirts
0.95..1.50 at exactly +-2.15, prow beam + cheeks carrying published
hullLengthM, oracle-fat 17cm tube (r 0.15-0.185). v9: min 31.9 with dims
99.6, stations 68.4, floaters 100; hull=whole 31.9 is front-view-limited
(crown width + skirt band lip) — the cleanest oracle in the family, no cap
needed beyond the +-0.26 m hull-span stretch (oracle body 8.18 vs published
8.7) which costs ~4 end columns and every plan column ~0.25 m.


## Geometry gate v10 round-2 (2026-07-31)
Round-2 row: hull 66.6 whole 66.5 turret 100 (fixedMount) stations 68.6
dims 99.6 floaters 100 (ledger: 31.9/31.9/100/68.4/99.6/100 — front_hull
was the 31.9 floor at mean 5.3%).
Front-view fixes per the differ: the bow rows carried b 0.08-0.14 across
the full 1.60 half-width (the ref's belly line between the tracks is 0.45
— raised, prow narrowed to its ±0.72/±1.05 point); the tail-chamfer rows'
top edge projected a wide diagonal in front view (narrowed to the ref's
(1.02, 3.04)->(1.30, 2.58) corner line); fender lip pulled inboard to
±1.72 (the ref's skirt tops at x 2.0-2.15 are 1.0-1.45).

## 2026-08-06 FLEET MUZZLE-BORE + §C.1 WINDING SWEEP (fleet-sweep one-liner)
- §B3.1 bore inside the 17cm muzzle collar step (hullG, z 6.85); §C.1 0 reversed; F-vs-D 0; gate HELD x2 EXACT 66.5; hash not frozen; mantlet mass verified per MANTLETS-MANDATORY (db9168c). Mechanism: kit.js muzzleBore shadow-named furniture + orientedSlab guard (3fca39b / 1017339); end-on+quarter crops shots/muzzle-sweep/{before,after}/.
