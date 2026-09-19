# ZTZ-100 Prototype historical restoration — 2026-09-19

The owner requested the earlier ZTZ-100 as a separate tier-9 `ztz100_prototype`, named **ZTZ-100 Prototype**. The target is the historical first-party model, not the corrected service `ztz100_x` or its newer source assessment. No current source comparison result is inherited.

## Authenticated recipe

The restored `src/vehicles/profiles/ztz100Prototype.ts` comes from `31d08f67378cd2bc5b883de3e0eba10513784612` (the parent of replacement `547457932`). Its original profile was introduced in `2b869b9d0` and remained byte-identical through that parent. Original Git blob: `f8c82e6965bac41b4df8cb5b33b6a1480032ae3a`; SHA-256: `19f8c7cfefc24bd32bed31b84988b5252fbda5e25c21e1c7f8d41b471d77e4b8`.

Only an explanatory preamble and public API/key names change: `ZTZ100_PROTOTYPE_DATUMS`, `ZTZ100_PROTOTYPE_PROFILES.ztz100_prototype`, and local builder `buildZtz100Prototype`. Reversing those renames reproduces the complete old source bytes. Historical part tags and assembly receipts remain unchanged. The original filled stern bin, rectangular deck rack, twin roof hatches, panoramic drum, generic remote weapon station, six round brake baffles, stub aerials and symmetric road-wheel stations are deliberately retained; replacing these with the service model would violate the requested restoration.

The original spec comes from the same commit's `chineseFrontlineSpecs.ts`: hull 6.94 m, overall 8.98 m, width 3.70 m, structural turret roof 2.31 m, full fitting height 3.04 m, 105 mm gun, 4.625 m barrel length and 0.072 m radius; turret pivot `[0,1.41,-0.55]`, turret-local trunnion `[0,0.35,1.10]`. Root integration retains that geometry and armor definition while tuning tier-9 gameplay independently. These are historical implementation parameters, not a new real-vehicle specification claim.

## Focused preservation evidence

Private receipt directory: `.qa-dev/tank-run/ztz100-prototype-restore/`.

`comparison.json` compares the historical and restored builders under the **same current factory and actual new prototype spec**. All emitted mesh positions, normals, UVs, other attributes, indices, groups, transforms, instances, colors and selected material descriptors match exactly, UUID-independent, in both HIGH and LOW. This is an unfilled receipt-mode comparison; it does not claim full historical shared-engine equivalence or final generated runtime qualification.

| Quality | Meshes | Expanded triangles | Shared-factory payload SHA-256 |
| --- | ---: | ---: | --- |
| HIGH | 49 | 81,258 | `c153ee209fd2936d6cd495d245116ae92e67d72c16d73e21c5368bb1d2eae4c0` |
| LOW | 47 | 75,492 | `609f72ae028366497247ca7aec3e278efd751f3745b240a877ad163597070146` |

The inherited LOW ratio is approximately 92.9%, above the current 75% target. Historical restoration does not erase that cost limitation. Geometry optimization would be a separate change to the requested preserved model.

`ztz100Prototype.selftest.mjs` authenticates the recipe independently of Git availability, checks actual emitted historical stock in both qualities, includes missing-bin/changed-brake negative controls, and probes actual optics ownership, internal-layout confidence and solved marking support/visibility/yaw. Shared manifest registration and final fleet generation belong to the parent integration.

## Qualification boundaries

The immutable comparison GLB must be exported from the clean historical checkout, never the restored candidate. The existing preservation policy uses a distinct 99-point floor and hash-pinned original source commit/ID; the service model retains its independent 92-point source requirement. Material rendering, modern shared track behavior, generated anatomy/fills/markings, final visual review and full release remain separate checks. This restoration note is not a release certificate.

## Immutable historical oracle and release integration

The clean independent snapshot `/private/tmp/cot-ztz100-historical-31d08` is pinned to the full historical commit above. The existing `tools/export-first-party-preservation.mjs` exported original ID `ztz100_x`, then a second run added `--candidate-id=ztz100_prototype`. That existing assertion passed: **436 visible mesh instances and all world/articulation-owned triangles match the full historical build at 1 µm precision**. Both exports produce identical GLB bytes. Three.js is 0.185.1 in both lockfiles.

- Geometry SHA-256: `50d6b799d51ab196f9991dba5ba390daae3849fc2de72205f027583cd1dd0f7a`.
- GLB SHA-256: `ffbc0a0709328f693597054cfe048fcc0d7e289f720d9c777ffaf585722e86b6`.
- Export receipt: [ztz100-prototype-preservation-export-20260919.json](ztz100-prototype-preservation-export-20260919.json).
- Comparison input: ignored `public/models/community-candidates/ztz100_prototype_preservation.glb`; it is not a playable model or a tracked runtime binary.

The export uses the original tool's HIGH, `camoSeed:4242`, `proceduralOnly:true`, `materialMode:'geometry-only'` contract. Neither historical nor current candidate import preloads the lazy generated fills. Thus the stronger historical-engine triangle parity is still **unfilled geometry-only parity**, not final loaded-fill or painted-marking certification. New generated fills and solved markings require their ordinary runtime checks; the historical oracle must not be regenerated from the candidate to conceal differences.

`tools/preservation-oracle.ts` pins the exact original commit, original ID, GLB hash and triangle hash for the new ID only. `tools/procedural-fidelity.html` registers the immutable GLB with its preserved gun/turret rig names. The existing 99-point historical-preservation floor applies. The service `ztz100_x` keeps its existing source registration and 92-point source requirement unchanged; cross-ID, cross-baseline, changed-field and changed-byte controls pass in `tools/preservation-oracle.selftest.mjs`.

The initial missing-insignia preflight was resolved by moving the anchor onto the retained turret's left stock. Both insignia and designation pass all nine visibility samples in HIGH and LOW, with 26 cm marks and 6 mm surface lift. The diagnostic keeps distinct mark meshes with `deferStaticBatch:true`; normal runtime batching remains unchanged. The failed experiments and final receipt are preserved in `.qa-dev/tank-run/ztz100-prototype-marking/`.

The integration's fresh geometry run measures **99.60519441596549/99** minimum against the immutable historical oracle, with unchanged floor and passing dimension/floater components. Generated fills, anatomy, two marking seats and presentation assets have been refreshed. The complete composed release remains a separate qualification; this measured preservation pass is not a blanket release claim.

## Independent final14 visual preservation

An independent reviewer who did not author the prototype restoration opened all fourteen actual HIGH originals in `.qa-dev/tank-run/ztz100-prototype-final14/r2/`. Each view passes the existing 9/10 visual minimum, with scores **9.2–9.5** against the pinned historical model. The characteristic roof station, twin hatches, long stepped gun, turret form and rear racks remain recognizable and aligned. Current camouflage/materials differ from the plain geometry-only reference; muzzle-baffle and dark rear-rack contrast are weaker, without a demonstrated newly missing historical part.

The review rehashed all 18 manifest artifacts and all 2,879 captured inputs against the current files, finding no drift. The report labels its mode `legacy-per-model-camera`; all fourteen recorded reference/candidate world and projection matrix pairs are nevertheless exactly equal. Loaded fills and rig parity are confirmed. The original favicon-only 404 is preserved, with no recorded model/module loading error. The separate, hash-verified HIGH/LOW articulation receipt reports legal yaw/pitch poses and recoil −0.11375 m at 0.12 s returning to zero after a further 0.9 s; these are numerical checks, not additional posed visual reviews.

The immutable review is `.qa-dev/roster-polish/final-fleet-visual-review/ztz100_prototype/review.json`, SHA-256 `2fdc675a73dfc9cdadbf5ba9cf6fe4aafe43152066c14b2665e48dd9454d0276`; its adjacent README states the scope. This establishes HIGH historical visual preservation only, not real-world accuracy, LOW/Garage/shadow presentation, performance or complete release qualification.
