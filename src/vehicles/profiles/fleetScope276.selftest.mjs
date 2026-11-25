// Release 276 (cn-turrets-276b): the cn-turrets-276 redesign reaches only its three turrets. That lane rewrote the
// VT-4A1's turret plates inside vtFamilyTurretPlates, which the Type 96B frame's armour also called, so the Type 96B and
// the six tanks that copy its armour (type96_72_long, type96_80_feng, type96_72m_lei, t80u_yun, t72b3_qilin,
// t72b3m_kunlun) took the VT-4A1's plates: the integrator measured the k2-tier9-peer duel move from 0.75 to 0.083. Kevin's
// standing rule is that stats hold unless he says otherwise.
//
// This receipt builds every playable id and fingerprints its armour envelope (the spec the simulation traces), its build
// (tools/fleet-geometry-digest.mjs, HIGH) and its committed combat anatomy row. Every id outside ZTZ-99A2, ZTZ-99A and
// VT-4A1 must match fleetScope276.baseline.json, which was measured on integ/276 with cn-turrets-276's three builder
// files (china.ts, chineseFrontline.ts, type99Armor.ts) put back as they stood before it. Planted control: one plate of
// type96_80_feng's armour changed in memory must be caught and named, and a change to a target id must pass.
//
//   node src/vehicles/profiles/fleetScope276.selftest.mjs            # the check (manual fleet suite: the whole fleet built)
//   node src/vehicles/profiles/fleetScope276.selftest.mjs --write    # re-pin the baseline from this tree (a lane that
//                                                                    # moves another id on purpose re-pins and says so)
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import '../../../tools/tank-surface-collect.mjs';
import { digestTankRoot, fleetRoster, ledgerBuildOptions } from '../../../tools/fleet-geometry-digest.mjs';
import { COMBAT_ANATOMY_GROUP_LOADERS } from '../combatAnatomyLoaders.generated.ts';
import { getSpec } from '../specs.ts';
import { createTank } from '../tankFactory.ts';

const BASELINE = fileURLToPath(new URL('./fleetScope276.baseline.json', import.meta.url));
const TARGETS = Object.freeze(['ztz99a2', 'ztz99a', 'vt4a1']);
// Other 276 lanes that move an id on purpose, each with its owner ruling; every id not named here stays pinned.
const MOVED_ON_PURPOSE = Object.freeze({
  olifant_mk2: "Kevin OK'd Olifant Mk 2 on the Loggim turret for 276 (11-24 18:40); ttd and olifant_mk1b held byte-identical",
});
const KINDS = Object.freeze(['armor', 'build', 'anatomy']);
const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

const anatomy = {};
for (const load of Object.values(COMBAT_ANATOMY_GROUP_LOADERS)) Object.assign(anatomy, (await load()).COMBAT_ANATOMY_CALIBRATIONS);

const rows = {};
for (const id of fleetRoster()) {
  const tank = createTank(id, null, ledgerBuildOptions('high'));
  try {
    rows[id] = { armor: fingerprint(getSpec(id).armor), build: digestTankRoot(tank.root).digest, anatomy: fingerprint(anatomy[id] ?? null) };
  } finally { tank.dispose(); }
}

/** The ids outside the targets whose fingerprints differ from the baseline (or that it lacks), with the kinds moved. */
function outOfScope(baseline, measured) {
  const moved = [];
  for (const id of Object.keys(measured).sort()) {
    if (TARGETS.includes(id) || Object.hasOwn(MOVED_ON_PURPOSE, id)) continue;
    const before = baseline[id];
    const kinds = before ? KINDS.filter((kind) => before[kind] !== measured[id][kind]) : ['missing from the baseline'];
    if (kinds.length) moved.push(`${id} (${kinds.join(', ')})`);
  }
  return moved;
}

if (process.argv.includes('--write')) {
  writeFileSync(BASELINE, `${JSON.stringify({ release: 276, targets: TARGETS, rows }, null, 1)}\n`);
  console.log(`fleetScope276: wrote ${Object.keys(rows).length} rows to ${BASELINE}`);
} else {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')).rows;
  const moved = outOfScope(baseline, rows);
  assert.deepEqual(moved, [], `ids outside ${TARGETS.join(', ')} moved from the pre-cn-turrets-276 fleet: ${moved.join('; ')}`);

  // planted control: one plate of a non-target id changed must be caught and named; a target id may move
  const feng = structuredClone(getSpec('type96_80_feng').armor);
  feng.turretPlates[0].physicalMm += 1;
  const planted = { ...rows, type96_80_feng: { ...rows.type96_80_feng, armor: fingerprint(feng) } };
  assert.deepEqual(outOfScope(baseline, planted), ['type96_80_feng (armor)'], 'control: a 1 mm change to one Feng plate is caught');
  const target = { ...rows, ztz99a2: { armor: 'moved', build: 'moved', anatomy: 'moved' } };
  assert.deepEqual(outOfScope(baseline, target), [], 'control: the target ids may move');
  // the Olifant Mk 2 may move; its TTD sibling, which shared its old turret builder, may not
  const ttd = { ...rows, ttd: { ...rows.ttd, build: 'moved' } };
  assert.deepEqual(outOfScope(baseline, ttd), ['ttd (build)'], 'control: the TTD moving is caught');

  console.log(`fleetScope276.selftest: ${Object.keys(rows).length - TARGETS.length - Object.keys(MOVED_ON_PURPOSE).length} ids outside ${TARGETS.join(", ")} and ${Object.keys(MOVED_ON_PURPOSE).join(", ")} keep their armour, build and anatomy fingerprints; planted Feng plate change caught PASS`);
}
