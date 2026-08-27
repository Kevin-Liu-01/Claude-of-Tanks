# ADR 0058: First-visit recovery has an enforceable latency budget

- Status: accepted
- Date: 2026-08-27

## Context

The cold-load probe proved that pristine contexts eventually reached Garage,
but did not fail when the same path became unacceptably slow. Eventual success
cannot satisfy the product requirement that a new player loads quickly and
never needs to refresh.

## Decision

The standard production cold profile uses cache-disabled browser contexts,
4× CPU slowdown, 150 ms network latency, 1.6 Mbps download, and 750 Kbps
upload. Every ordinary first visit must reach `__GAME_READY` within 8 seconds
of navigation and its post-transfer application work must stay within 2.5
seconds.

The probe continues to inject a failed main download, failed main evaluation,
and two failed selected-vehicle builder downloads. Each recovery must reach
Garage automatically with the existing bounded retry counts. Custom harsher
network profiles may supply explicit timing ceilings; omission never silently
weakens the standard budgets.

## Consequences

- A loading path that merely avoids hanging but regresses latency fails release
  certification.
- Network transfer and application work are reported separately.
- Multiple pristine contexts are required for a reliability claim.

## Verification

    npm run build
    npm run perf:cold -- --sessions 3 --summary 1
