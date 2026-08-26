# ADR 0005: Public main keeps contracts, not iterative receipts

- Status: accepted
- Date: 2026-08-26

## Context

The vehicle program accumulated hundreds of per-round critique reports in the
tracked documentation tree. Those reports were useful while a model was being
authored, but most are superseded execution output rather than maintained
documentation. Their volume hides the current architecture, verification
commands, source packets, and accepted design decisions from contributors.

The procedural fleet still depends on maintained source-reference packets,
profile extracts, provenance records, and the current geometry ledger. Those
are inputs or reproducible contracts and are not disposable build output.

## Decision

`main` tracks maintained system documentation, ADRs, source/provenance packets,
current generated contracts, and tests. Iterative critic output belongs in the
ignored `.qa-dev/` workspace and in Git history once its accepted findings have
been folded into a maintained packet or decision.

Public documentation also excludes generated audit JSON/Markdown, performance
trend ledgers, dated implementation-program narratives, and conversational
development histories. The owning tool writes current evidence below ignored
`.qa-dev/` or `.qa-device/`; maintained subsystem docs and ADRs retain only
the reproducible contract and durable conclusion.

Referenced vehicle graduation and recertification receipts remain until their
conclusions are consolidated into their owning vehicle packets. New iterative
critique receipts must not be committed.

## Consequences

- Contributor-facing documentation has less historical execution noise.
- Fleet provenance and reproducible geometry inputs remain intact.
- A smaller follow-up can consolidate the remaining referenced vehicle
  receipts without creating broken citations.
- Tests remain tracked release contracts; age alone is not grounds to remove a
  test that still runs in `tools/selftest-suites.mjs`.

## Verification

    git grep -n 'docs/critique/' -- ':!docs/critique/**'
    node tools/public-repo-hygiene.selftest.mjs
    node tools/selftest-suites.selftest.mjs
    npm run agent-docs -- doctor . --json
