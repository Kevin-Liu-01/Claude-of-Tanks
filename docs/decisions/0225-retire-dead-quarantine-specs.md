# 0225 — Dead quarantine spec construction is not part of runtime

Status: accepted

## Decision

Delete `src/vehicles/userdrops.js` and remove it from both fleet facades and
the public-build registry probe. The module's two registration branches were
permanently disabled, while its replacement Type 74 combat row is already
owned by `src/vehicles/profiles/miscSpecs.ts` and its procedural visual by
`src/vehicles/profiles/misc.ts`.

Keep historical source-license information in attribution/reference documents,
not in an eagerly evaluated runtime module.

## Why

The dead module still built armor plates, module and crew boxes, three shell
records, community metadata, and a complete visual row during Garage startup.
None of those objects could enter the fleet registry. The misleading import
also made the public runtime appear to depend on quarantined source-model logic.

## Consequences

- No playable registration, model source, visual, or gameplay value changes.
- Garage boot no longer allocates the unreachable legacy Type 74 spec graph.
- Type 74 remains first-party procedural and receives its combat row from the
  typed boot-light owner.
- Roster, Type 74 assets/anatomy, public provenance, import integrity, and the
  production bundle certify the deletion.
