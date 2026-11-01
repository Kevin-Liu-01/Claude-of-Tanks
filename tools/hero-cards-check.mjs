// Tank hero cards receipt (CPU only): the shipped layers under public/icons/hero/ and their manifest.
//   - every fleet vehicle has a card row under the current policy; measured through the card lens, its hull's
//     bow and its gun both point left (owner 2026-10-20: "Whole tank faces left"; the turret turned modestly
//     toward the lens, the gun still forward); a turretless or limited-arc mount follows the hull, and only a
//     handful of those may exist (a turret rig the renderer could not find reads as one);
//   - each row's flag is its nation's flag (src/ui/flagCodes.ts) and that flag layer is shipped;
//   - every named file exists with the recorded sha256 prefix and byte count, and nothing else is there;
//   - no layer was CLIPPED, and the whole tank fits every card kind inside the side margins;
//   - byte budgets: tank layers (p95 per rung), flag layers, the directory and the manifest;
//   - changed-only: rows whose inputs (geometry, look, flag) moved are reported for a re-render
//     (a failure with --strict; a warning otherwise, so a geometry landing is not blocked by the GPU step).
// First-party tooling: Kevin B. Liu (NOTICE.md).
//
//   node tools/hero-cards-check.mjs [--strict]

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  HERO_BUDGETS, HERO_CAMERA, HERO_CARD_LAYOUT, HERO_GUN_SIDE, HERO_MANIFEST_FILE, HERO_POLICY_VERSION, HERO_POSE,
  HERO_SIDE_MARGIN, heroFlagFiles, heroGunSide, heroTankFiles, placeTank,
} from '../src/ui/heroCardPolicy.ts';
import { flagIconCode } from '../src/ui/flagCodes.ts';
import {
  HERO_DIR, HERO_MANIFEST_PATH, fleetRecords, flagPolicyKey, planHeroCards, readHeroManifest, sha, tankPolicyKey,
} from './hero-cards-plan.mjs';

const strict = process.argv.includes('--strict');
const failures = [];
const warnings = [];
const fail = (message) => failures.push(message);

const manifest = readHeroManifest();
if (!manifest) {
  console.error(`hero-cards check: FAIL: no manifest at ${HERO_MANIFEST_PATH}`);
  process.exit(1);
}
const fleet = fleetRecords();

// 0. The owner's ruling (2026-10-20, "Whole tank faces left"): the policy itself puts the bow and the gun left.
if (HERO_CAMERA.facing !== 'left') fail(`the policy faces ${HERO_CAMERA.facing}; the owner's ruling is bow left`);
if (HERO_GUN_SIDE !== 'left') fail(`the policy's turret pose points the gun ${HERO_GUN_SIDE}; the owner's ruling is gun left, forward with the hull`);

// 1. The manifest is the current policy's.
if (manifest.schema !== 1) fail(`schema ${manifest.schema}, expected 1`);
if (manifest.policyVersion !== HERO_POLICY_VERSION) fail(`policyVersion ${manifest.policyVersion}, the policy is ${HERO_POLICY_VERSION}`);
if (manifest.facing !== HERO_CAMERA.facing) fail(`cards face ${manifest.facing}, the policy ${HERO_CAMERA.facing}`);
if (manifest.tankPolicyKey !== tankPolicyKey()) fail(`tank policy key ${manifest.tankPolicyKey} != ${tankPolicyKey()} (the camera, light, framing or encode moved: re-render with --all)`);
if (manifest.flagPolicyKey !== flagPolicyKey()) fail(`flag policy key ${manifest.flagPolicyKey} != ${flagPolicyKey()} (re-ship the flags)`);

// 2. Files: every named file matches its row; the directory holds nothing else.
const named = new Set([HERO_MANIFEST_FILE]);
const checkFiles = (label, files, row) => {
  files.forEach((file, index) => {
    named.add(file);
    let bytes;
    try { bytes = readFileSync(resolve(HERO_DIR, file)); } catch { fail(`${label}: missing ${file}`); return; }
    if (bytes.length !== row.bytes?.[index]) fail(`${label}: ${file} is ${bytes.length} B, the manifest says ${row.bytes?.[index]}`);
    if (sha(bytes) !== row.sha?.[index]) fail(`${label}: ${file} sha ${sha(bytes)} != ${row.sha?.[index]}`);
  });
};
for (const [code, row] of Object.entries(manifest.flags || {})) checkFiles(`flag ${code}`, heroFlagFiles(code), row);

// 3. Every fleet vehicle has its card, its nation's flag, a clean fit, its bow and its gun on the policy's side
//    (sides measured by projection when the layer was rendered, never from a yaw sign).
let gunsTurned = 0;
const fixedMounts = [];
const tankBytes = [[], [], []];
for (const record of fleet.values()) {
  const row = manifest.tanks?.[record.id];
  if (!row) { fail(`${record.id}: no hero card`); continue; }
  const flag = flagIconCode(record.nation);
  if (row.flag !== flag) fail(`${record.id}: flag ${row.flag}, its nation ${record.nation} is ${flag}`);
  if (!manifest.flags?.[row.flag]) fail(`${record.id}: flag layer ${row.flag} is not shipped`);
  checkFiles(record.id, heroTankFiles(record.id), row);
  row.bytes?.forEach((value, index) => tankBytes[index].push(value));
  if (row.clipped) fail(`${record.id}: the layer was CLIPPED`);
  const [cx, cw, ch, cb, fx0, fx1] = row.b || [];
  if (![cx, cw, ch, cb, fx0, fx1].every((value) => Number.isFinite(value) && value >= 0 && value <= 1) || !(fx1 > fx0) || !(cw > 0) || !(ch > 0)) {
    fail(`${record.id}: bad bounds ${JSON.stringify(row.b)}`);
    continue;
  }
  const [bow, gunSide] = row.face || [];
  const [traverse, yaw, pitch] = row.pose || [];
  if (bow !== HERO_CAMERA.facing) fail(`${record.id}: the hull's bow points ${bow || '?'}, the policy ${HERO_CAMERA.facing}`);
  if (![traverse, yaw, pitch].every(Number.isFinite)) fail(`${record.id}: no recorded pose ${JSON.stringify(row.pose)}`);
  else if (!row.mount) {
    if (traverse !== HERO_POSE.turretTowardCameraDeg) fail(`${record.id}: turret traversed ${traverse} deg, the policy ${HERO_POSE.turretTowardCameraDeg}`);
    if (Math.abs(Math.abs(yaw) - traverse) > 0.5) fail(`${record.id}: turret yaw ${yaw} deg does not match its ${traverse} deg traverse`);
    if (gunSide !== HERO_GUN_SIDE) fail(`${record.id}: the gun points ${gunSide || '?'}, the pose wants it ${HERO_GUN_SIDE} (turned toward the lens, forward with the hull)`);
    else gunsTurned++;
  } else {
    if (!['none', 'turretless', 'arc'].includes(row.mount)) fail(`${record.id}: unknown mount ${row.mount}`);
    if (!(traverse < HERO_POSE.turretTowardCameraDeg)) fail(`${record.id}: a ${row.mount} mount at the full ${traverse} deg traverse`);
    if (gunSide !== heroGunSide(traverse)) fail(`${record.id}: a ${row.mount} mount's gun points ${gunSide || '?'}, its ${traverse} deg traverse puts it ${heroGunSide(traverse)}`);
    fixedMounts.push(`${record.id} (${row.mount} ${traverse} deg)`);
  }
  // Level, or raised only where the spec's depression curve lifts it over the rear deck.
  if (Number.isFinite(pitch) && pitch < HERO_POSE.gunPitchDeg - 0.01) fail(`${record.id}: gun pitch ${pitch} deg below the level pose`);
  for (const [kind, L] of Object.entries(HERO_CARD_LAYOUT)) {
    const artH = L.height - L.nameBand;
    const { k, dx, dy } = placeTank({ cx, cw, ch, cb, fx0, fx1 }, {
      w: L.width, artH, baseline: artH + 2, coreShare: L.coreShare, coreHeight: L.coreHeight, centerX: L.centerX,
      gunSide: gunSide === 'left' || gunSide === 'right' ? gunSide : undefined,
    });
    const left = dx + fx0 * k, right = dx + fx1 * k;
    const margin = L.width * HERO_SIDE_MARGIN;
    if (left < margin - 0.5 || right > L.width - margin + 0.5) fail(`${record.id}: ${kind} card cuts the tank (${left.toFixed(1)}..${right.toFixed(1)} of ${L.width})`);
    if (dy + (cb - ch) * k < 0) warnings.push(`${record.id}: ${kind} card: the dense core rises above the card top`);
  }
}
const ids = Object.keys(manifest.tanks || {});
// A turret rig the renderer could not find reads as a fixed mount: more than a handful means the pose broke.
if (fixedMounts.length > Math.max(4, fleet.size * 0.03)) fail(`${fixedMounts.length} cards keep the gun on the hull axis (${fixedMounts.slice(0, 8).join(', ')}): expected only the turretless and limited-arc mounts`);

// 4. Nothing unnamed in the directory (old renders and stray files leave with their rows).
for (const file of readdirSync(HERO_DIR)) if (!named.has(file)) fail(`stray file public/icons/hero/${file}`);

// 5. Budgets.
const p95 = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : 0;
};
const budgets = [
  ['tank AVIF 480 p95', p95(tankBytes[0]), HERO_BUDGETS.tankAvif480],
  ['tank AVIF 960 p95', p95(tankBytes[1]), HERO_BUDGETS.tankAvif960],
  ['tank WebP 480 p95', p95(tankBytes[2]), HERO_BUDGETS.tankWebp480],
  ['largest flag AVIF', Math.max(0, ...Object.values(manifest.flags || {}).flatMap((row) => (row.bytes || []).slice(0, 2))), HERO_BUDGETS.flagAvif],
  ['largest flag WebP', Math.max(0, ...Object.values(manifest.flags || {}).map((row) => row.bytes?.[2] || 0)), HERO_BUDGETS.flagWebp],
  ['manifest', statSync(HERO_MANIFEST_PATH).size, HERO_BUDGETS.manifest],
  ['public/icons/hero', readdirSync(HERO_DIR).reduce((sum, file) => sum + statSync(resolve(HERO_DIR, file)).size, 0), HERO_BUDGETS.directory],
];
for (const [label, value, budget] of budgets) if (value > budget) fail(`${label} ${value} B over its ${budget} B budget`);

// 6. Changed-only: rows whose inputs moved since they were rendered.
const plan = planHeroCards({ manifest });
const stale = plan.stale.filter((row) => !row.why.includes('no card'));
const staleFlags = plan.flags;
const staleLine = `${stale.length} stale cards${stale.length ? ` (${stale.slice(0, 8).map((row) => `${row.id}: ${row.why.join(', ')}`).join('; ')}${stale.length > 8 ? '; ...' : ''})` : ''}, ${staleFlags.length} stale flag layers`;
if (stale.length || staleFlags.length) (strict ? failures : warnings).push(`${staleLine}: node tools/genHeroCards.mjs --plan, then hero-cards-compose.mjs ship --plan`);
for (const id of plan.extra) warnings.push(`row ${id} is no longer in the fleet`);
const audit = ids.filter((id) => fleet.get(id) && manifest.tanks[id].audit?.[0] && manifest.tanks[id].audit[0] !== fleet.get(id).geometryHash);
if (audit.length) warnings.push(`${audit.length} rows whose rendered geometry fingerprint differs from its tank-asset row (${audit.slice(0, 6).join(', ')}${audit.length > 6 ? ', ...' : ''}): the tank-asset render is the planner's key`);

for (const warning of warnings) console.warn(`hero-cards check: WARN ${warning}`);
if (failures.length) {
  for (const failure of failures.slice(0, 60)) console.error(`hero-cards check: FAIL ${failure}`);
  if (failures.length > 60) console.error(`hero-cards check: ... ${failures.length - 60} more`);
  process.exit(1);
}
console.log(`hero-cards check: ok: ${ids.length} cards for ${fleet.size} vehicles, ${Object.keys(manifest.flags).length} flags, hulls facing ${manifest.facing}, ` +
  `${gunsTurned} turrets turned ${HERO_POSE.turretTowardCameraDeg} deg toward the lens (gun ${HERO_GUN_SIDE}), ${fixedMounts.length} fixed mounts (${fixedMounts.join(', ') || 'none'}), ` +
  budgets.map(([label, value, budget]) => `${label} ${(value / 1024).toFixed(1)}/${(budget / 1024).toFixed(0)} KB`).join(', '));
