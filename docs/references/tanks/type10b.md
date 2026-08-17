# Type 10B — packet

First-party JGSDF Type 10 up-armored variant (`type10b`, profiles/japan.js).
History through §5.308 lives in docs/references/tanks/type10.md (the
japan-wave base was pinned verbatim for this mark as buildType10BBase,
hashgeo 77870ef0).

## §5.336 OWNER ORDER — enlargement + fleet gear + quality (2026-08-17)
Order verbatim: "make the type 10s larger make their tracks much better
using our better track system and make their hulls and turrets much mcuh
beter" — "the type 10s" = BOTH marks.

- **The §5.299/§5.308 byte-pin (77870ef0) is RETIRED BY OWNER AUTHORITY.**
  The §5.299 "keep the type 10b" bound to its LOOK; this order supersedes
  the byte-freeze: buildType10BBase now delegates to the rebuilt ×1.10
  shared base (modern3.js buildType10Native2026 — full receipts in
  type10.md §5.336). The pinned copy's two §B4 deltas (sprocket-bay roof
  split, trimmed fender/relief ends) were absorbed into the shared base at
  the new stations, so nothing of the pin's content is lost — it is
  superseded, at scale, for both marks.
- **B-variant identity delta PRESERVED, re-seated at ×1.10** (profiles/
  japan.js addType10BPackage): swept modular cheek shell, 2×5 cassette rows
  per cheek, six high hull cassettes per flank (inner faces re-seated on
  the new 1.6606 skirt outer plane — §B2 no-air; outer 1.7102 inside the
  ±1.782 width anchor), paired EO stations (JGSDF asymmetry), shielded
  commander RWS (roofWeapon, MG scale 0.858), 6-tube smoke banks, joined
  bustle basket + rails, twin whips, Type 10 Kai closed mask + strengthened
  sleeve, '10-B' decal. Shared japan.js helpers took an opt-in `s` scale
  param with byte-identical defaults (§F.2): A/B receipt — type90a
  71208238 + stb1 f3ee84d8 hash EXACTLY the same with HEAD's japan.js vs
  this lane's.
- Spec dims ×1.10 exact: **7.513 / 10.439 / 3.564 / 2.838** (variant()
  copies the scaled type10 armor frame verbatim; armorFactor 1.16 thickness
  multipliers unchanged).

## Registration status — FALSE-0 class (documented)
type10b has NO registered oracle and NO geometry-gate row ("no gate json" in
tank-standard-check; docs/geometry-gate/ has no type10b.json; the ledger has
no type10b row). Per §E law a row cannot be written without a registered
reference — the absence is the correct state, not a defect. Evidence class
is therefore procedural-only frames + the shared-base gate row (type10
67.2 ×2, dims 100) + the full audit battery below.

## §5.336 battery (final bytes, hashgeo ca20604 — 79 meshes / 98,612 verts)
- track-clip --exact --strict: **0 front / 0 rear / 0 shoe / 0 sweep**.
- duplicate-course: PASS (one suspension-driven integrated layer).
- standard-check: holes **0**, decor census **mg2+14d**, clip 0/0+0/0.
- turret-parent: 0 dangling / 0 abutting / 5 stranded = the certified
  false-flag deck-gear class inherited from the shared base (adjudicated
  LEAVE; yaw90 receipts shots/type10-enlarge/after/type10b/yaw90/ show the
  whole B kit — shell, cassettes, RWS, basket, whips — rotating as one).
- winding audit: m1 0 reversed / 0 mixed; m2 clean.
- muzzle-bore probe: PASS (bore + collar through the Kai mask).
- assets: 9 files regenerated (tank:assets), tank-assets-check PASS.
- npm test && production build exit 0.
- Evidence: shots/type10-enlarge/before/critic-type10b/ (14 procedural-only
  frames at the pre-edit tree) + shots/type10-enlarge/after/type10b/
  (14 paired + 14 yaw0 + 14 yaw90 at final bytes); garage family read in
  shots/type10-enlarge/after-garage/pair-s1.png (X Type 10B beside IX
  Type 10 / Type 90 in the JP tab).
