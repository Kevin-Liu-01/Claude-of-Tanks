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
