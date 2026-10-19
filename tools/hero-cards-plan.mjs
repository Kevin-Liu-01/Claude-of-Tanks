// Tank hero cards, changed-only planner (CPU only): which ids need a new GPU tank layer and which
// nations a new flag layer, and why. A card is fingerprinted by what it shows:
//   - geometry: the tank's geometryHash in public/icons/tank-assets.json, which the combat-anatomy
//     procedure keeps current for every geometry or profile change (genIcons);
//   - look: the sha256 of that tank's packaged angle render in the same manifest, which moves when
//     its paint or markings move (genIcons renders the finished vehicle);
//   - flag: the nation's flag code (src/ui/flagCodes.ts), its flag-icons SVG bytes and the flag policy;
//   - policy: HERO_POLICY_VERSION plus the camera, light, framing and encode numbers. A policy change
//     marks every card stale, and the renderer then needs an explicit --all (full fleet only on request).
// First-party tooling: Kevin B. Liu (NOTICE.md).
//
//   node tools/hero-cards-plan.mjs              list the stale ids and nations with their reasons
//   node tools/hero-cards-plan.mjs --ids-only   print the stale ids as one comma list (for --ids=)
//   node tools/hero-cards-plan.mjs --check      exit 1 when anything is stale

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flagIconCode } from '../src/ui/flagCodes.ts';
import {
  HERO_CAMERA, HERO_ENCODE, HERO_FLAG, HERO_FLAG_FACING, HERO_FRAME, HERO_LIGHTS, HERO_MANIFEST_FILE,
  HERO_POLICY_VERSION, HERO_PUBLIC_DIR, HERO_RUNGS,
} from '../src/ui/heroCardPolicy.ts';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const HERO_DIR = resolve(ROOT, 'public', HERO_PUBLIC_DIR);
export const HERO_MANIFEST_PATH = resolve(HERO_DIR, HERO_MANIFEST_FILE);
const TANK_ASSETS = resolve(ROOT, 'public/icons/tank-assets.json');
export const FLAG_SVG_DIR = resolve(ROOT, 'node_modules/flag-icons/flags/4x3');

export const sha = (bytes, n = 12) => createHash('sha256').update(bytes).digest('hex').slice(0, n);

let records = null;
/** The fleet as the tank-asset manifest records it: id -> { name, nation, flag, tier, geometryHash, lookSha }. */
export function fleetRecords() {
  if (records) return records;
  const manifest = JSON.parse(readFileSync(TANK_ASSETS, 'utf8'));
  records = new Map();
  for (const [id, row] of Object.entries(manifest.tanks)) {
    records.set(id, Object.freeze({
      id,
      name: row.label?.displayName || row.name || id,
      shortName: row.label?.shortName || row.label?.displayName || row.name || id,
      nation: row.nation,
      flag: flagIconCode(row.nation),
      tierNumeral: row.tierNumeral || '',
      geometryHash: row.geometryHash || '',
      lookSha: String(row.assets?.angle?.sha256 || '').slice(0, 12),
    }));
  }
  return records;
}

/** Every fleet id, in the tank-asset manifest's order. */
export function fleetIds() {
  return [...fleetRecords().keys()];
}

/** The tank layer's policy fingerprint: the numbers the GPU render and the encode read. */
export function tankPolicyKey() {
  return sha(JSON.stringify({ v: HERO_POLICY_VERSION, camera: HERO_CAMERA, lights: HERO_LIGHTS, frame: HERO_FRAME, encode: HERO_ENCODE, rungs: HERO_RUNGS }));
}

/** The flag layer's policy fingerprint (the cloth, its facing layout and the encode). */
export function flagPolicyKey() {
  return sha(JSON.stringify({ v: HERO_POLICY_VERSION, flag: HERO_FLAG, facing: HERO_CAMERA.facing, layout: HERO_FLAG_FACING[HERO_CAMERA.facing], encode: HERO_ENCODE, rungs: HERO_RUNGS }));
}

/** A tank row's input fingerprint, in the manifest's `in` order: [geometryHash, look sha]; the flag code is `flag`. */
export function tankInputs(record) {
  return [record.geometryHash, record.lookSha];
}

/** A flag layer's input fingerprint: [svg sha, flag policy key]. */
export function flagInputs(code) {
  return [sha(readFileSync(resolve(FLAG_SVG_DIR, `${code}.svg`))), flagPolicyKey()];
}

export function readHeroManifest(path = HERO_MANIFEST_PATH) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * The plan: stale tank ids and flag codes with reasons, the ids the manifest holds that the fleet
 * no longer has, and whether the policy moved (every row stale: the renderer then needs --all).
 */
export function planHeroCards({ manifest = readHeroManifest() } = {}) {
  const fleet = fleetRecords();
  const tankKey = tankPolicyKey();
  const policyMoved = !!manifest && manifest.tankPolicyKey !== tankKey;
  const stale = [];
  for (const record of fleet.values()) {
    const row = manifest?.tanks?.[record.id];
    const why = [];
    if (!row) why.push('no card');
    else {
      if (policyMoved) why.push('policy');
      const want = tankInputs(record);
      const [geometry, look] = row.in || [];
      if (geometry !== want[0]) why.push(`geometry ${geometry || '-'} -> ${want[0]}`);
      if (look !== want[1]) why.push(`look ${look || '-'} -> ${want[1]}`);
      if (row.flag !== record.flag) why.push(`flag ${row.flag || '-'} -> ${record.flag}`);
    }
    if (why.length) stale.push({ id: record.id, why });
  }
  const codes = [...new Set([...fleet.values()].map((record) => record.flag))].sort();
  const flags = [];
  for (const code of codes) {
    const want = flagInputs(code);
    const have = manifest?.flags?.[code]?.in || [];
    const why = [];
    if (!manifest?.flags?.[code]) why.push('no layer');
    else {
      if (have[0] !== want[0]) why.push(`svg ${have[0] || '-'} -> ${want[0]}`);
      if (have[1] !== want[1]) why.push('flag policy');
    }
    if (why.length) flags.push({ code, why });
  }
  const extra = Object.keys(manifest?.tanks || {}).filter((id) => !fleet.has(id));
  return { stale, flags, extra, policyMoved, tankPolicyKey: tankKey, flagPolicyKey: flagPolicyKey(), codes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const plan = planHeroCards();
  const args = process.argv.slice(2);
  if (args.includes('--ids-only')) {
    console.log(plan.stale.map((row) => row.id).join(','));
  } else {
    console.log(`[hero-plan] ${plan.stale.length} stale of ${fleetIds().length} ids; ${plan.flags.length} stale flag layers of ${plan.codes.length}${plan.policyMoved ? '; POLICY MOVED (render needs --all)' : ''}`);
    for (const row of plan.stale.slice(0, 40)) console.log(`  ${row.id}: ${row.why.join(', ')}`);
    if (plan.stale.length > 40) console.log(`  ... ${plan.stale.length - 40} more`);
    for (const row of plan.flags) console.log(`  flag ${row.code}: ${row.why.join(', ')}`);
    for (const id of plan.extra) console.log(`  extra row (not in the fleet): ${id}`);
  }
  if (args.includes('--check') && (plan.stale.length || plan.flags.length || plan.extra.length)) process.exit(1);
}
