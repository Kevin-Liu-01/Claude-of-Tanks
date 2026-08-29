# 0278 — Audio policy is independent from the WebAudio runtime

## Decision

Keep baked-sample manifests, distance and perspective curves, powertrain and
weapon-report catalogs, seeded randomness, safe scheduling, and reload cue
planning in `src/audio/audioPolicy.ts`. The lazy `audio.ts` mixer imports and
re-exports that public policy while retaining exclusive ownership of browser
audio nodes, event subscriptions, voices, and world-loop lifetimes.

## Why

The former audio owner mixed approximately 220 lines of pure product policy
with a large gesture-gated WebAudio graph. Tests and asset-generation tools had
to import the complete mixer to inspect static catalogs, and the eventual
strict TypeScript migration had no narrow boundary between deterministic rules
and browser resources.

## Consequences

- Tests and asset tools can validate audio policy without acquiring or parsing
  the WebAudio implementation.
- Existing consumers of exports from `audio.ts` remain compatible.
- Sound values, sample names, random sequences, distance curves, perspective
  mixes, reload timings, and lazy gesture behavior are unchanged.
- The remaining mixer migration can focus on node ownership, event payloads,
  and teardown contracts rather than unrelated catalog data.
