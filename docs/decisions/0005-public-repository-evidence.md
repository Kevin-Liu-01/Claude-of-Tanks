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

The final 96 referenced graduation and recertification receipts were removed
after their accepted findings were confirmed in the owning vehicle packets.
Their exact historical text remains recoverable from commit `d9303080`; the
public tree keeps the maintained packets, not duplicate review transcripts.
New iterative critique receipts must not be committed.

## Consequences

- Contributor-facing documentation has less historical execution noise.
- Fleet provenance and reproducible geometry inputs remain intact.
- Vehicle packets retain current accepted geometry, source, and release facts;
  historical review transcripts remain available through Git history.
- Tests remain tracked release contracts; age alone is not grounds to remove a
  test that still runs in `tools/selftest-suites.mjs`.
- The hygiene gate rejects tracked self-tests outside that registry and skill
  documents outside the small subsystem index, preventing old task checks or
  stray agent manuals from accumulating unnoticed.

## Verification

    test -z "$(git ls-files docs/critique)"
    node tools/public-repo-hygiene.selftest.mjs
    node tools/selftest-suites.selftest.mjs
    npm run agent-docs -- doctor . --json
