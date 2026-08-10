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
| `<id>_armor_side.png` | effective KE armor values; live reticle remains shell-relative |
| `<id>_modules_side.png` | actual module and crew damage volumes |

The manifest also stores the official flag country code, tier, caliber, shell
penetration values, plate/module data, live geometry fingerprint, metadata
fingerprint, dimensions, byte sizes, and SHA-256 hashes.

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

## Ownership rules

- `src/vehicles/tier.js` is the only tier table. UI and matchmaking use it.
- `src/ui/flagCodes.js` is the nation-to-official-flag-code table.
- `src/vehicles/specs.js` and registration modules own armor, penetration,
  module, crew, and dimension data.
- `src/vehicles/tankAssets.js` owns the required output contract.
- `tools/icons-page.html` renders; `tools/genIcons.mjs` writes; the checker
  verifies. Generated files never become independent gameplay truth.
