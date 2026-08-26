# Architecture decisions

This directory records decisions that constrain future implementation. Add an
ADR when a change establishes a durable boundary, migration rule, ownership
contract, or non-obvious trade-off. Do not add task status, agent handoffs,
benchmark dumps, or conversation transcripts.

Each ADR states the context, decision, consequences, and verification. Current
runtime documents remain authoritative for behavior.

## Index

- [0001 — Incremental strict TypeScript migration](0001-incremental-typescript.md)
- [0002 — Cooperative loading without visual degradation](0002-cooperative-loading.md)
- [0003 — Private-room connectivity uses direct ICE with TURN fallback](0003-private-room-connectivity.md)
- [0004 — Deployment pinning preserves canonical module URLs](0004-canonical-module-urls.md)
- [0005 — Public main keeps contracts, not iterative receipts](0005-public-repository-evidence.md)
- [0006 — Network input cadence is independent from display refresh](0006-display-independent-network-input.md)
- [0007 — Local correction is physical-role presentation state](0007-physical-role-prediction-correction.md)
- [0008 — Battle UI is a demand-loaded runtime boundary](0008-battle-ui-demand-boundary.md)
- [0009 — Optional garage set pieces load behind a light-stable boundary](0009-optional-garage-set-piece-boundary.md)
- [0010 — Settings are a retryable intent-loaded runtime](0010-settings-demand-boundary.md)
- [0011 — Plate-level aim inspection is battle-owned](0011-armor-inspection-demand-boundary.md)
- [0012 — Camera and physical-bore aim share one typed owner](0012-shared-aim-controller.md)
- [0013 — Battlefield construction has one typed coordinator](0013-world-build-coordinator.md)
- [0014 — Engineering telemetry has a typed read-only owner](0014-diagnostic-telemetry-owner.md)
- [0015 — RTC loss preserves the private-room seat](0015-private-room-seat-recovery.md)
