// Digest of the fleet registry as the facade loaded in this process finalized it (fleetParity.selftest.mjs).
// Every own enumerable field of every saved spec takes part: armor plates and their vertices, modules, crew boxes,
// hit shells and contact points, gun, mobility, dims, labels, visual. Numbers compare exactly (JSON's shortest
// round-trip form), so a vertex moved in its last bit changes the digest.
import { createHash } from 'node:crypto';
import { MODEL_SOURCE, TANK_CATALOGS, TANK_IDS, TANK_SPECS } from './specs.ts';

const FINALIZED = Symbol.for('claude-of-tanks.combat-anatomy.v2');

function stable(value, path = new Set()) {
  if (typeof value === 'function') return '[fn]';
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return `${value}n`;
  if (value === null || typeof value !== 'object') return value;
  if (path.has(value)) return '[cycle]';
  path.add(value);
  let out;
  if (Array.isArray(value) || ArrayBuffer.isView(value)) out = Array.from(value, (entry) => stable(entry, path));
  else {
    out = {};
    for (const key of Object.keys(value).sort()) out[key] = stable(value[key], path);
  }
  path.delete(value);
  return out;
}

export function stableDigest(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 20);
}

/** Per spec: the whole-spec digest, one digest per top-level field, and whether combat anatomy is finalized. */
export function fleetDigest() {
  const specs = {};
  for (const id of Object.keys(TANK_SPECS)) {
    const spec = TANK_SPECS[id];
    const fields = {};
    for (const key of Object.keys(spec).sort()) fields[key] = stableDigest(spec[key]);
    specs[id] = { digest: stableDigest(fields), fields, finalized: spec[FINALIZED] === true };
  }
  const catalogs = Object.fromEntries(Object.entries(TANK_CATALOGS).map(([name, ids]) => [name, ids.slice()]));
  return { specs, catalogs, tankIds: TANK_IDS.slice(), modelSource: stableDigest(MODEL_SOURCE) };
}
