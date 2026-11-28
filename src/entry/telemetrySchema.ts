/**
 * src/entry/telemetrySchema.ts — what the page's beacon (telemetry.ts) and the services' record
 * (server/telemetryRecord.ts) must agree on, in one leaf both import (schema v2, docs/ENTRY-RESILIENCE.md; arch-2): the
 * schema version, the record's timing and note limits, and the boot stages that own an Analytics Engine column (the
 * beacon keeps them first). Plain TypeScript with no imports: it loads before the renderer and runs in Node, workerd
 * and the Vercel bundler.
 */

export const TELEMETRY_SCHEMA_VERSION = 2;
export const TELEMETRY_MAX_TIMINGS = 24;
export const TELEMETRY_MAX_NOTES = 6;
/** The boot stages that own a fixed Analytics Engine double; gaps and extras stay in the timings blob. */
export const TELEMETRY_STAGE_SLOTS = Object.freeze([
  'imports', 'renderer', 'sky', 'lighting', 'garage', 'vehicle', 'hud', 'ui', 'audio', 'post', 'studio', 'ready',
] as const);
