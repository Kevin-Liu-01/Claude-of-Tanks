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
- [0016 — Network recovery presentation has one typed owner](0016-network-recovery-presentation-owner.md)
- [0017 — Boot staging has one typed lifecycle owner](0017-typed-boot-lifecycle.md)
- [0018 — Browser network frames have one typed pump](0018-typed-network-frame-pump.md)
- [0019 — Battle-only imports have one typed access owner](0019-typed-battle-module-access.md)
- [0020 — Browser room integration has one typed coordinator](0020-typed-network-room-coordinator.md)
- [0021 — Rendered drive tests have one typed controller](0021-typed-drive-test-controller.md)
- [0022 — RTC rendezvous is scoped to page sessions](0022-session-scoped-rtc-rendezvous.md)
- [0023 — Shader warming matches the production render path](0023-production-path-shader-warming.md)
- [0024 — Optional garage construction uses one idle lane](0024-serialized-garage-idle-work.md)
- [0025 — Demand-load the battle client runtime](0025-battle-client-runtime-boundary.md)
- [0026 — Speculative garage work waits for a quiet window](0026-garage-quiet-window.md)
- [0027 — Opening terrain creates only visible residency](0027-exact-opening-terrain-residency.md)
- [0028 — Cold RTC recovery preserves room readiness](0028-cold-rtc-generation-recovery.md)
- [0029 — Decorative garage rendering follows playable readiness](0029-decorative-garage-runtime-boundary.md)
- [0030 — Custom camouflage authoring is an intent-loaded deep module](0030-custom-camouflage-studio-boundary.md)
- [0031 — Engineering diagnostics are absent from player boot](0031-engineering-diagnostics-runtime-boundary.md)
