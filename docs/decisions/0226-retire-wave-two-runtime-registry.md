# 0226 — Wave-two source references do not belong in runtime

Status: accepted

## Decision

Delete `src/vehicles/userdrops2.js` and remove it from both fleet facades and
the public-build registry probe. Keep the recovered GLBs, provenance, and
license records as explicitly isolated comparison inputs for authoring tools.

The live T-90M, Leclerc, Leopard 2A4, and BMP-2 remain repository-authored
procedural vehicles. BMP-1, M1128, and M1296 remain unregistered rather than
shipping the module's unreachable quarantine combat rows.

## Why

The module eagerly allocated three complete vehicle specifications even though
their registration gate was statically false. Its only active writes added
self-referential `variantOf` values and historical source-credit metadata to
T-90M and Leclerc; roster finalization immediately deleted those credits.
Self-referential inheritance is unnecessary and is already cycle-guarded by
the visual resolver.

Keeping dead source-model migration code on the playable boot path obscured
the first-party runtime guarantee and imposed avoidable parsing, evaluation,
and allocation work on every Garage visit.

## Consequences

- Playable geometry, visuals, combat data, ordering, and saved ids do not
  change.
- Garage boot no longer evaluates unreachable BMP/Stryker spec graphs or
  obsolete source-credit mutations.
- Local authoring tools may still compare procedural builds with licensed or
  quarantined references, but those references cannot become playables by an
  environment flag.
- Attribution describes these files as comparison inputs rather than runtime
  replacements.
