# 0210 — Chinese variant registration is strict TypeScript

Status: accepted

## Decision

Register ZTZ-85-III and ZTZ-99A2 in `src/vehicles/china.ts` through the shared
fleet registry. Their delta contract permits only identity, presentation,
dimensions, bounded mobility/aiming fields, reload, an optional replacement
armor envelope, and non-external armor scaling.

Consume the strict `createType99Armor` result directly. ADR 0216 migrated the
geometry-derived constructor and removed the temporary legacy assertion; the
focused Type 99 armor suite validates the envelope.

## Why

The former helper combined unchecked donor cloning, silhouette cleanup, armor
replacement, scaling, and fire-control mutation. Strict options make authored
changes reviewable and prevent unrelated fields from leaking into a combat
row while retaining the distinct ZTZ-99A2 envelope.

## Consequences

- Both Chinese ground-up builds own their silhouette receipts.
- ZTZ-85-III's 125 mm fire-control package remains explicit and unchanged.
- Type 99 armor, ZTZ attachments/rear service, and the 46-vehicle ERA finish
  sweep are required proof for this boundary.
