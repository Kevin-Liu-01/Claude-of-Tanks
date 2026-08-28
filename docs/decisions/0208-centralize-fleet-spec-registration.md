# 0208 — Fleet spec registration has one validated mutation boundary

Status: accepted

## Decision

Centralize legacy fleet dictionary adaptation in
`src/vehicles/fleetSpecRegistry.ts`. It owns runtime registry validation,
structured donor cloning, inherited silhouette cleanup, non-external armor
scaling, and idempotent spec/source/ID registration.

Country modules retain their explicit, typed delta schemas and post-clone
combat tuning. The shared layer does not interpret nation-specific options or
hide authored changes behind a generic merge bag.

## Why

Every national registration file repeated unchecked casts and subtly different
copies of the same mutation loop. That multiplied opportunities for donor
mutation, duplicate roster IDs, external-armor inflation, and missing source
metadata. The invariant mechanics need one tested owner; the actual design
deltas remain readable at their family boundary.

## Consequences

- K2B, AMX-40, and Type 74 already use the shared registration boundary.
- Further country migrations can remove boilerplate without homogenizing their
  combat rules.
- Invalid registry shapes, missing donors/specs, and invalid armor factors fail
  immediately with focused errors.
