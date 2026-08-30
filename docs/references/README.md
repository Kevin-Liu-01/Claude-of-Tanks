# Vehicle authoring references

This directory contains maintained inputs and current accepted constraints for
the first-party procedural fleet. Vehicle references record source envelopes,
distinctive geometry, ownership, accepted measurements, freeze hashes, and
release facts used by builders and verification tools.

They are reference data, not contributor task logs. Iterative screenshots,
critic transcripts, generated audits, and per-round work orders belong in the
ignored `.qa-dev/` workspace. The last tracked set of historical visual-review
receipts is recoverable from Git commit `d9303080`; its accepted conclusions
were retained in the corresponding tank packets before removal.

The final legacy `*-packet` and `*-residue` work orders are recoverable from
Git commit `ff929285b`. Their still-binding conclusions live in canonical
vehicle references, builder comments, generated anatomy receipts, and release
gates. New reference filenames use stable vehicle IDs rather than task or
round identifiers.

When editing a vehicle reference:

- keep current source, geometry, rig, material, and release constraints;
- replace superseded round narratives with the final durable conclusion;
- link reproducible tools or accepted design decisions, not temporary output;
- never commit generated evidence that can be recreated by an existing gate.
