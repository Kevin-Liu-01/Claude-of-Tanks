# 0137: Context dossiers have one typed resolver

## Status

Accepted — 2026-08-28

## Decision

`src/ui/contextInfo.ts` owns live/static dossier media resolution, optional
technical sections, JSON copy behavior, and its reusable information trigger.
It composes the typed shared modal lifecycle and publishes an explicit
disposable button contract to Garage, Studio, Gallery, docs, and archives.

Invalid or failed live media entries are discarded without blocking the
dialog. Images remain lazy and asynchronous so contextual help stays outside
the pristine boot path.

## Consequences

- Callers share one typed media/section vocabulary.
- Failed optional dossier assets cannot prevent modal use.
- Feature screens retain their visuals while local unchecked DOM extensions
  are removed.
