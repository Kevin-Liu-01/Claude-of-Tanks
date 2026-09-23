# Fleet roster and presentation update — 2026-09-19

The earlier ZTZ-100 returns as a separate Tier IX **ZTZ-100 Prototype**. Its
historical procedural model is preserved; the current service ZTZ-100 remains
separate. Kurganets-25 advances to Tier X. The two CV90 names are now **CV90
Mk 4 X** and **CV90 Mk 4**, retaining their stable IDs and search aliases.

The national Garage leading sequences are:

| Nation | Leading vehicles, left to right |
| --- | --- |
| China | VT-4A1, ZTZ-100, Type 96B, AFT-10 X, Type 100 IFV, ZTZ-99A2 |
| Sweden | Strv 122, CV90 Mk 4 X, Strv 103B, Strv 122A, CV90 Mk 4 |
| USA | M1A3, M1A2 SEP v3, M1A2 SEP v2, M1A2 TUSK, M551A1 TTS, M3A3 Bradley, Griffin |
| Russia | T-90M, T-90SM, T-14 Armata, Kurganets-25, BMP-3M Dragun 125, T-90A Vladimir, T-90A, Object 695 |

The German sequence places KF41 Lynx immediately before KF51 EVO. All existing
tier ordering remains descending; the restored prototype sits in Tier IX.

## Geometry and presentation

The marked negative-X forward shoulder of Merkava Mk 3D now forms a continuous
slope. Only four intermediate section heights change. Roof, outer-edge and
right-side stations stay fixed, preserving the asymmetric envelope. The exact
owner camera was compared before/after in HIGH and LOW; physical regression
checks retain the earlier wheel, track and end-return contracts.

Object 695 uses the corrected Kurganets Epokha turret construction: 57 mm cannon,
four Kornet tubes, eight Bulat tubes, sights, smoke equipment and aerials.
Its hull/running gear and the donor Kurganets exterior remain unchanged. The
comparison target is derived from authenticated source owners, without copying
source geometry into playable assets or relaxing comparison floors.

Dragun becomes a mobile, lightly armored Tier X assault gun: 1,850 HP, 72/30
km/h forward/reverse speed, 5.4-second reload, 40 rounds and distinct thin armor
ratings. Its 125 mm ammunition retains the existing effects and penetration;
aiming, traverse, mobility and survivability are tuned as a complete package.

Seven Israeli variants gain distinct muted olive/khaki/tan default patterns:
Mk 2D, Mk 3D, the saved Mk 4, Mk 4 X, Trophy, Barak and Namer. The older saved
Mk 4 remains development-only. Factory paint and explicit player selections
remain available. All seven names are localized in the English and Chinese
camouflage menus. Technical diagrams, artwork and roster counts are refreshed.

## Evidence and limits

- [Israeli review](israeli-visual-review-20260919.md): 54 final geometry/Garage
  originals pass their stated visual scope; a separate review passes all 21
  newly generated camouflage views.
- [Prototype restoration](ztz100-prototype-restoration-20260919.md): authenticated
  historical geometry, 99.6/99 geometry gate and independent fourteen-view
  historical-preservation review, with scores 9.2–9.5.
- [Object turret and Dragun balance](object695-epokha-dragun-balance-20260919.md):
  the new turret passes all fourteen scoped visual views at 9.0. The unchanged
  rear hull still lacks reference louver/door detail; whole-vehicle manual
  detail qualification remains open, with a minimum of 8.0.

The targeted geometry gates pass for prototype, Mk 3D, Object 695, Kurganets and
Dragun, respectively: **99.6/99, 92.7/92, 94.7/92, 94.6/92 and 93.3/92**.
Strict equipment/track/opening, sealed-interior and fidelity checks pass for
all five. Full-fleet anatomy, marking seats and technical assets are current.
Type checking and the public/private production builds pass.

The Object turret reduces filled triangle counts from 83,386/79,098 to
82,162/75,860 in HIGH/LOW. Its retained hull still exceeds the newer IFV budget,
and both Object and the historical prototype retain excessive LOW/HIGH ratios.
These are disclosed optimization gaps, not measured frame-rate improvements.
No rendering or simulation performance optimization is reverted by this pass.

All **1,098 registered test entries** have passing coverage: 383 pre checks,
672 core checks in the composed run, the corrected Factory camouflage check
in its focused retry, and all 42 post checks in the final run. The camouflage
test now explicitly recognizes saved/development-only Mk 4 while retaining
release-roster membership checks for every other Signature owner. It also
checks all seven new defaults and explicit player-paint precedence.

The composed release command itself ended with that one outdated assertion;
it is not relabeled as a clean pass. Its vehicle gates and private build
passed, and the failed test plus the previously unreached post suite were
completed separately. A redundant full-suite replay was stopped deliberately.
Evidence is retained in `.qa-dev/roster-polish/release-r4.log`,
`.qa-dev/roster-polish-camo-labels/factory-camo-focused.log`,
`.qa-dev/roster-polish/final-post-tests.log`, and
`.qa-dev/roster-polish/final-builds.log`.

Final input revalidation confirms that both fourteen-view captures still
represent the shipped model/rendering inputs. Subsequent differences are
limited to seven Garage label bindings, their translations and test-only
corrections. Comparison originals and failed earlier receipts remain intact.
