// src/vehicles/printCatalog.js — §5.31b PRINT VIEWER (owner order 2026-08-08:
// era groups show OUR custom builds; "then make sources have ALL actual tank
// models"). Every retired community print lives machine-readable as a
// MODEL_SOURCE candidateGlb row (kv2/t30 flip pattern). This module derives
// the Sources print catalog from those rows and registers a VIEW-ONLY
// pseudo-spec per print ('print:<baseId>') in TANK_SPECS + MODEL_SOURCE so the
// EXISTING pedestal/thumb pipelines (owner-WIP main.js buildPedestalVisual ->
// createTank -> registry glb swap) render the print with zero changes there.
//
// Containment contract (why this can't leak into gameplay):
//   * print ids are NEVER pushed to ALL_TANK_IDS — every roster iteration
//     (bots/state.js, icons, strip/audit tools, matchmaking pools) walks
//     ALL_TANK_IDS and stays blind to them by construction.
//   * registration is LAZY: nothing registers until getPrintCatalog() is
//     called, and the only caller is the garage UI. Node tools and probes
//     that import the spec chain never see print rows.
//   * spec.printViewer = true marks the rows for the garage's view-only
//     guards (BATTLE hard-blocked, camo/equipment pickers hidden).
//   * variantOf = baseId keeps tankFactory.resolveBuilder on the base
//     vehicle's procedural build as the pre-swap stand-in / failure
//     fallback, exactly like a normal sourced tank.
import { TANK_SPECS, MODEL_SOURCE } from './specs.js';

const PUBLIC_BUILD = typeof import.meta !== 'undefined'
  && import.meta.env && !!import.meta.env.VITE_PUBLIC_BUILD;

// Paths a public artifact strips — keep in sync with NC_PATH_RE +
// STRIP_DIRS/STRIP_FILES in tools/strip-nc-assets.mjs (that guard also
// FAILS the build if a candidateGlb row points at a stripped path, so this
// filter staying in sync is enforced from the build side).
export const PUBLIC_STRIPPED_RE =
  /(quarantine\/|community-candidates\/|candidates-gen2\/|community\/recovered\/|m1a2_tejas\.glb|abramsx-mortavex\.glb)/;

/** 'print:<baseId>' -> baseId (null for non-print ids). */
export const printBaseId = (id) =>
  (typeof id === 'string' && id.startsWith('print:')) ? id.slice(6) : null;

const copy = (v) => JSON.parse(JSON.stringify(v));

let catalog = null;

/**
 * Build (once) and return the Sources print catalog. Registers the view-only
 * pseudo-specs on first call; idempotent under HMR re-entry.
 * @returns {Array<{id:string, baseId:string, spec:object}>}
 */
export function getPrintCatalog() {
  if (catalog) return catalog;
  catalog = [];
  for (const [baseId, row] of Object.entries(MODEL_SOURCE)) {
    const cfg = row && row.candidateGlb;
    if (!cfg || !cfg.path) continue;
    // public artifacts list exactly the prints they ship
    if (PUBLIC_BUILD && PUBLIC_STRIPPED_RE.test(cfg.path)) continue;
    const base = TANK_SPECS[baseId];
    if (!base) continue;
    const id = `print:${baseId}`;
    if (!TANK_SPECS[id]) {
      const spec = copy(base);
      spec.id = id;
      spec.printViewer = true;
      spec.variantOf = baseId;
      TANK_SPECS[id] = spec;
      // Render the retired print through the normal sourced-GLB swap path.
      MODEL_SOURCE[id] = { source: 'glb', glb: { ...cfg } };
    }
    catalog.push({ id, baseId, spec: TANK_SPECS[id] });
  }
  return catalog;
}
