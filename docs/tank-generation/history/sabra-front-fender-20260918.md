# Sabra Mk.2 X — source-measured front fender repair, 2026-09-18

The final mudguard test found a real detached front flap, not a reference-pose conflict. The previous front flap had a 189.322 mm AABB gap and the native straight shelf ended at z2.88. The supplied model has a thin crown curving over the front idler into a short sloping terminal sheet. The previous official 14-view acceptance is superseded for this changed region; fresh filled captures and independent review remain required.

## Authenticated inputs

- Canonical source: `public/models/community-candidates/sabra_mk2_x_source.glb`, SHA-256 `5ea261fb70f728d3547159a6a6cf1519af2403e05e57c02d87d394ec9f573a2b`.
- Previous profile: `5a012503e14803574ea9b3dce3224e917cafbc4e9a0c144fcabae18f0aca6d32`.
- Repaired `src/vehicles/profiles/sabraMk2SourceX.ts`: `0313cd94507489f4be68f3bbb92df6a420f7a9968453b7659bead62840e325fc`.
- Focused `src/vehicles/profiles/sabraFrontFender.selftest.mjs`: `5a757da5f6be429a56371983cb8fcb34f3dea9a34fcf39192082952580762f5b`.

The actual prior `close-front.png` and `right.png` originals under `.qa-dev/tank-run/final-shadow-review/official14/sabra_mk2_x/` were inspected. The reference, camera registration and source geometry remain unchanged. No source vertices, indices or textures enter the procedural build.

## Source measurements and construction

Actual Object_4 ray calipers locate the broad crown between x≈1.055–1.70, with folded edges extending to approximately 1.01–1.752. At x1.45 its top is y1.43945 at z2.60, 1.43174 at 2.80, 1.37224 at 3.00, 1.29577 at 3.15 and1.21954 at 3.30. Central thickness is approximately 26 mm. The terminal sheet is approximately 12 mm thick: y1.19946 at z3.33, 1.17501 at 3.35, 1.10836 at 3.40 and1.05179 at 3.44. Longitudinal rays distinguish the terminal web and return from the surrounding air channel.

The old shelf is trimmed only forward of z2.34. Independently constructed closed longitudinal sections form the crown, folded side returns, terminal web, return lip and short sloping flap. The real narrow space below the folded return remains open. The rear shelf/fenders, turret, gun stock and measured running gear are retained.

A finite ray exposed a 0.799 mm root gap caused by the existing shelf primitive's bevel: its actual front surface at y1.43 is z2.334201, behind the nominal 2.34 bound. The crown's buried receiving edge therefore starts at 2.330, giving real overlap without changing its exposed source curve. Failed initial receipts are preserved; the gate was not relaxed.

## Native validation and limits

The focused test passes **142 checks across HIGH and LOW**, with existing interior-fill records loaded. It tests held-out source surface heights, folded edge winding/air, finite crown-to-shelf and crown/web/flap intervals, and empty track clearance. Deliberately displacing the actual front flap opens the diagonal joint witness; restoring it restores contact. Separate mudguard labels identify crown, web, return and flap.

The native motion witness samples both actual instanced shoe detail levels over 16 opposed track phases through the full repaired x/z extent:

| Quality | Sampled shoe vertices under fender | Minimum measured air | Maximum shoe z | Vertices reaching flap z≥3.307 |
|---|---:|---:|---:|---:|
| HIGH | 25,208 | 0.116312 m | 3.258781 | 0 |
| LOW | 12,624 | 0.116836 m | 3.258456 | 0 |

This is a sampled vertex-to-actual-surface witness, **not** a claim of complete triangle-intersection coverage. The independent strict moving-band/shoe audit remains required after regeneration.

Both qualities retain byte-identical geometry attributes, world matrices and instance matrices for all 19 running-gear meshes. All 36 aft probe stations per quality are unchanged. The shortened shelf's triangulation changes, so no whole-hull byte-identity claim is made. Expected secondary changes are derived marking seats and the LOW static batch containing changed hull stock; root regeneration refreshes those records.

Private evidence: `.qa-dev/tank-run/sabra-front-fender/{rays,calipers,edges,terminal,native-before,native-final,freeze}.json`, `focused-freeze.log`, original profile copy, and retained failing `focused*.log` receipts. The profile author performed this native verification; independent source-detail/shadow review, refreshed fill/anatomy/marking/assets, strict checks, cost and official 14-view/Garage captures are separate final work owned by the integration lead.
