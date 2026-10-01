# September 30 fleet renewal — publication accounting

The owner requested publication of the entire thread batch to `origin/main`,
explicitly including Object 148, new vehicles, vehicle changes and fixes, and
all items in the reattached pasted checklist. This instruction follows the
reported failed reference comparisons and incomplete broad qualification.
Publication does not convert those failures to passes or imply deployment.

## Pasted checklist

The September 30 reattachment is byte-identical to the earlier attachment used
for implementation. Its surface-markup records identify parts by stable vehicle,
mesh and local coordinates; the accompanying prose governs the requested repair.

| Request | Implementation |
| --- | --- |
| Rebuild T-72M1 Jaguar around the new T-72B3 | `t72m1_jaguar` uses the complete `t72b3_x` donor through `profiles/t72ModernVariants.ts`. |
| New Polish T-72 based on T-80U | New `t72_rys`, T-72 Ryś (Concept), with `t80u_x` foundation and Polish equipment. |
| Upiór 10% larger and more equipped | Uniform 1.10 size policy; supported cages, packs, sensors and side equipment in `profiles/afvFamily.ts`. |
| Attach the three marked CV90 Mk4 roof fittings | `profiles/cv90MkivSourceX.ts`: structural hatch coaming, hinge foot and lowered rear sight shoe. |
| Attach the Wotan and Light Tiger optical heads | Shared `openYokeRws` in `profiles/kit.ts` joins each optical head to its own mount. |
| AMX-30B2 uses AMX-30B casting, retaining equipment | `profiles/misc.ts` uses `buildAmx30Casting` from `amx30X.ts`; ERA and roof kit are seated on that casting. |
| Close AMX-30 and AMX-30B2 hull waist gaps | Continuous structural riser in `profiles/misc.ts`, clear of track return lanes. |
| Only the replica retains Type 89 name | `type89_x` is Type 89; retained originals are Hayate IFV (`type89`) and Raijū IFV (`type89_light_tiger`). IDs are stable. |
| Type 89 fender/skirt gap and insignia | Continuous upper apron in `profiles/type89SourceX.ts`; marking seats and images regenerated. |

## Other thread changes included

- Object 148 (`t14`): entirely new hull and turret in
  `profiles/object148Prototype.ts`, with open gun channel, optical recesses,
  independent cheek modules, capsule hull, side cassettes and open rear cages.
  The previous body builder is removed, not layered under the redesign.
- Nineteen modeled roof weapons use the shared independent automatic-gun system.
  Actual 7.62/12.7/30 mm classes, range, cadence, muzzle articulation and separate
  main-gun reload behavior are covered by `remoteGunFleet.selftest.mjs`.
  All 46 authored mounts receive named cartridge identities; see
  `remote-roof-guns-20260930.md`.
- Two existing B3M slots preserved as approved: detailed `t72b3m_x` becomes
  obr. 2016; `t72b3m` becomes the modernized obr. 2022 on the detailed foundation.
- BMPT Terminator 2 uses the new 2022 hull; T-80UK uses `t80u_x`;
  T-72BU 1989 uses `t72bu_x`, with lower ERA chevron halves restored on both BUs.
- T-64BV1 and UA Donbas use modernized `t72b3_x` foundations; T-62MV-1 is
  rebuilt on the T-62 obr. 1975 with new ERA and equipment.
- Three new Chinese concepts combine the detailed Russian foundations and
  Type 96B turret variations: `type96_72_long`, `type96_80_feng`,
  `type96_72m_lei`. Together with Ryś, the roster is 205 vehicles.
- T-80UK exterior voxel-grid artifacts are removed by excluding its sealed
  native body from inappropriate generated filling.
- AMX-30B2 roof additions include the commander cupola on negative local X,
  separate loader hatch, two supported decorative machine guns, optics,
  smoke banks, antennas and service kit. See `amx30b2-roof-20260930.md`.
- Eight marked underbody removals: Chieftain Mk 3/Mk 9, Jagdpanzer E100,
  K2B/XK2, Strv 103A/103B and UDES 03. Actual wheels, tracks, structural hulls
  and turrets remain. See `underbody-removal-20260930.md`.

Earlier IFV additions, renames/resizes, Marder 2 and attachment repairs already
present in the starting main history are retained; this batch adds to that tree.

## Verification and limitations

Before integration, focused renewal, roof-gun firing/articulation, AMX roof
contact and underbody-removal regressions pass. Anatomy/marking receipts cover
205 vehicles. The all-fleet module-hit probe reports 1,789 modules and 410 track
sides, zero failures/outside-envelope hits and 96 dimension-drift warnings.
Type checking and production build pass on the authoring tree.

The 49 stale or missing presentation values reported in the previous anatomy
run were refreshed for the 15 affected vehicles. Their 150 image/diagram assets
pass freshness checks; maximum exported top-view centering error is 0.18 px.

Full reference/release qualification is not green. The retained latest whole-
model scores include AMX-30B2 geometry 84.1/90 and fidelity 88.8/90; Chieftain
Mk 3 geometry 0/90 and fidelity 30.8/90; Strv 103B geometry 72.9/90 and fidelity
85.3/90; Strv 103A geometry 22.4/90 and fidelity 89.2/90. Jagdpanzer E100 passes
at 93/92 and 98.7/92. Some vehicles have no registered exact 3D comparison.
Object 148's production-model comparison remains failed; its requested original
prototype has separate concept datums. Historical whole-builder checks also
include failures predating this batch and expectations superseded by requested
redesigns. None is silently recast as successful qualification.

Publication validation and overlap evidence are retained under the isolated
worktree's `.qa-dev/publish-fleet-20260930/`; earlier scoped logs and actual
1280 px garage captures remain in `.qa-dev/fleet-renewal-20260930/` and
`.qa-dev/underbody-removal-20260930/`. External comparison GLBs remain ignored
local authoring inputs and are not included in the commit or playable runtime.
