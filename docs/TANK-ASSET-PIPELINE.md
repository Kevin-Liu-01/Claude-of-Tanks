# Tank asset and release pipeline

Every registered playable tank owns the same generated presentation package.
The package is derived from the shipped model and the combat spec; it is not a
second hand-authored source of truth.

## Required outputs

`public/icons/tank-assets.json` records all registered ids and these eight files:

| Output | Purpose |
| --- | --- |
| `<id>_angle.webp` | garage hero portrait |
| `<id>_top.webp` | top-down shaded view |
| `<id>_side.webp` | side shaded view |
| `<id>_top_silhouette.png` | minimap mask |
| `<id>_side_silhouette.png` | team-panel / damage-panel mask |
| `<id>_hit_zones_side.png` | actual collision-plate hit areas |
| `<id>_armor_side.png` | effective KE armor values + best-shell penetration reference |
| `<id>_modules_side.png` | actual module and crew damage volumes |

The manifest also stores the official flag country code, tier, caliber, shell
penetration values, plate/module data, live geometry fingerprint, metadata
fingerprint, dimensions, byte sizes, and SHA-256 hashes.

### Renderer choice

The shaded source portraits stay on the game's WebGL/PBR render path. Three.js
[`SVGRenderer`](https://threejs.org/docs/pages/SVGRenderer.html) is resolution
independent, but its documented lack of textures, advanced shading, and shadows
would discard the actual garage material read. Three.js
[`EdgesGeometry`](https://threejs.org/docs/pages/EdgesGeometry.html) extracts
visible mesh creases; it cannot represent the simulation's separate collision
plates, armor values, module AABBs, or crew volumes. Those semantic layers are
therefore drawn deterministically into PNGs over the WebGL side portrait from
the combat spec, instead of inferred from cosmetic mesh edges.

## Tank landing procedure

Run from the clean worktree that contains the intended landing candidate:

```sh
npm run tank:assets -- --ids=<tank-id>
npm run tank:release:check -- --ids=<tank-id>
```

Use comma-separated ids for a family wave. `--tanks <ids>` is an equivalent
generator spelling. `tank:release:check` fails before commit/push when:

- a registered tank, tier, country code, view, diagram, armor plate, shell
  penetration row, or module volume is missing;
- an asset has the wrong dimensions, bytes, or hash;
- the live model geometry or combat metadata changed after generation;
- the cannon has no machine-verifiable recessed muzzle bore;
- the straight-on visual/raycast probe cannot see a dark muzzle opening;
- the existing geometry/track/contiguity/fittings standard fails;
- `npm test` or the private production build fails.

`--gate` forwards to the existing fresh geometry-gate phase when that tank is
eligible for it. The do-not-gate list in `docs/BUILD-STANDARD.md` still applies.

## Fleet bootstrap and audit

Regenerate and verify every registered tank after a pipeline-schema change:

```sh
npm run tank:assets
npm run tank:assets:check
```

Selective generation requires an existing complete manifest. Scratch pilots
may use `--out <temporary-directory> --allow-partial`; partial manifests never
pass the full-fleet checker.

`npm run tank:assets:check -- --live-only` audits the live registry and the
fleet-wide bore/metadata invariants without reading generated files. It is a
diagnostic; only the default manifest-backed mode is a release proof.
`npm run tank:bore:probe` additionally saves straight-on visual proofs for a
representative MBT, autocannon IFV, and howitzer under
`/private/tmp/cot-muzzle-bore-proof/`, checks the dark-center contrast, and
writes the per-tank metrics and center-ray evidence to `report.json` there.
Procedural mouths are seated from a centerline cap ray (6 mm throat / 16 mm
rim beyond the measured face); GLB mouths use the swap pipeline's sampled tip.
Use `npm run tank:bore:probe -- --all` for the release-time visual sweep of
every registered tank, or `--ids=id_a,id_b` while iterating on specific models.
`--out=<directory>` relocates both proofs and the report for an evidence packet.

## Ownership rules

- `src/vehicles/tier.js` is the only tier table. UI and matchmaking use it.
- `src/ui/flagCodes.js` is the nation-to-official-flag-code table.
- `src/vehicles/specs.js` and registration modules own armor, penetration,
  module, crew, and dimension data.
- `src/vehicles/tankAssets.js` owns the required output contract.
- `tools/icons-page.html` renders; `tools/genIcons.mjs` writes; the checker
  verifies. Generated files never become independent gameplay truth.
