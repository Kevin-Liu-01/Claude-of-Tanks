# ADR 0096: Replaceable snapshot packets have a strict binary codec

- Status: accepted
- Date: 2026-08-28

## Context

Snapshots and live inputs use a compact binary JSON-array format on the
replaceable transport lane. The codec was JavaScript and trusted implicit row,
metadata, protocol-version, and normalized-input shapes. Corrupt state-lane
packets could therefore cross the codec boundary before later consumers
rejected them.

## Decision

Move `src/net/snapshotWireCodec.js` to strict TypeScript. Export explicit
snapshot payload and replaceable-envelope contracts. Validate outer envelopes
through protocol v7, normalize decoded player input, require bounded record
rows, and reject invalid snapshot timestamps, acknowledgements, baselines, and
protocol versions before returning decoded state.

Preserve entity/shell column order, limits, sparse ERA semantics, binary
encoding, delta metadata, and byte-size accounting exactly.

## Consequences

- Malformed replaceable packets fail at the codec/transport boundary.
- Input packets return the same normalized contract as reliable protocol input.
- Channel transport no longer casts the snapshot codec.
- Valid packet bytes and compression ratios remain unchanged.

## Verification

    npm run typecheck
    node src/net/net.selftest.mjs
    node src/net/privateMatchHandoff.selftest.mjs
    node server/dedicatedMatch.selftest.mjs
    npm run test:net:entry
    npm run build
