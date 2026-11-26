#!/usr/bin/env node
// Every vehicle's shown name equals its roster name (278, scope-and-names). Copyright (c) 2026 Kevin B. Liu. First-party
// tool; see NOTICE.md.
//
// The shown name has one source: the registry's finalize stamps `spec.name = tankLabelRecord(spec).displayName`
// (src/vehicles/specs.ts; a LABEL_OVERRIDES displayName wins over the authored name), and the Tank Gallery's dossier and
// rows, the Garage and docs/VEHICLE-ROSTER.md (tools/vehicle-roster-report.mjs) all print it. What can drift is the
// committed roster file, which no gate regenerated or checked before this receipt. So:
//  - the roster file is current (the report's own --check);
//  - each roster row's name is the name the game shows for that id (tankDisplayName), or an alias declared below;
//  - each gallery record (the production projection the page lists) has a roster row with that same name;
//  - the link the gallery writes for an id (galleryHref: `?id=<id>&ids=<schema>`) opens that id.
// An unstamped link is read under id schema 1 (src/vehicles/tankIdAliases.ts, SSOT 2.19): `/gallery?id=t90m` is the
// T-90AM, whose schema-1 id was t90m, and the gallery rewrites the address to `?id=t90am&ids=<schema>` once it loads.
// The 278 finding ("/gallery?id=t90m shows T-90AM, the roster says T-90M Proryv") was that rule, not a drift; the
// swap ids it applies to are counted in the PASS line.
//   node tools/vehicle-roster-names.selftest.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import '../src/vehicles/tankFactory.ts';
import { SAVED_TANK_IDS, TANK_SPECS, VISIBLE_TANK_IDS, getSpec } from '../src/vehicles/specs.ts';
import { tankDisplayName } from '../src/vehicles/tankLabels.ts';
import { buildGalleryRecords } from '../src/gallery/catalog.ts';
import { galleryHref, linkTankId } from '../src/game/tankIdBoundaries.ts';
import { TANK_IDS } from '../src/vehicles/tankIdAliases.ts';

/** id -> a roster name accepted in place of the shown name. Each entry needs its reason; none is needed today. */
const DECLARED_ALIASES = Object.freeze({});

const ROSTER = new URL('../docs/VEHICLE-ROSTER.md', import.meta.url);

/** The roster table's rows: id -> name (a `\|` in a cell is a literal bar). */
export function parseRoster(text) {
  const rows = new Map();
  for (const line of text.split('\n')) {
    const m = line.match(/^\| \d+ \| (?:PROD|DEV|REF) \| `([^`]+)` \| ((?:[^|\\]|\\\|)*) \|/);
    if (m) rows.set(m[1], m[2].trim().replaceAll('\\|', '|'));
  }
  return rows;
}

/** Every disagreement between the roster rows and the names shown: [] when they agree. */
export function rosterNameFindings(rows, { savedIds, shownName, galleryRecords, aliases = DECLARED_ALIASES }) {
  const findings = [];
  const accepted = (id, name) => name === shownName(id) || aliases[id] === name;
  for (const id of savedIds) {
    if (!rows.has(id)) findings.push(`${id}: no roster row`);
    else if (!accepted(id, rows.get(id))) findings.push(`${id}: roster "${rows.get(id)}", shown "${shownName(id)}"`);
  }
  for (const record of galleryRecords) {
    const name = rows.get(record.id);
    if (name === undefined) findings.push(`${record.id}: in the gallery, no roster row`);
    else if (name !== record.displayName && aliases[record.id] !== name) {
      findings.push(`${record.id}: roster "${name}", gallery "${record.displayName}"`);
    }
  }
  for (const id of Object.keys(aliases)) if (!savedIds.includes(id)) findings.push(`${id}: an alias for no saved vehicle`);
  return findings;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  // the roster is the generator's output for this tree
  execFileSync(process.execPath, [new URL('./vehicle-roster-report.mjs', import.meta.url).pathname, '--check'], { stdio: 'pipe' });

  const rows = parseRoster(readFileSync(ROSTER, 'utf8'));
  assert.equal(rows.size, SAVED_TANK_IDS.length, `the roster has ${rows.size} rows for ${SAVED_TANK_IDS.length} saved vehicles`);
  const galleryRecords = buildGalleryRecords(VISIBLE_TANK_IDS.map(getSpec));
  const shownName = (id) => tankDisplayName(TANK_SPECS[id]);
  const findings = rosterNameFindings(rows, { savedIds: SAVED_TANK_IDS, shownName, galleryRecords });
  assert.deepEqual(findings, [], `shown names drifted from the roster:\n${findings.join('\n')}`);

  // the receipt sees a drift on either side (its own negative controls)
  const t90m = rows.get('t90m');
  assert.equal(t90m, 'T-90M Proryv', 'the roster names t90m the T-90M Proryv');
  const staleRow = new Map(rows).set('t90m', 'T-90AM');
  assert.ok(rosterNameFindings(staleRow, { savedIds: SAVED_TANK_IDS, shownName, galleryRecords }).some((f) => f.startsWith('t90m:')),
    'a roster row that drifted is found');
  const overridden = (id) => (id === 't90m' ? 'T-90AM' : shownName(id));
  const driftedRecords = galleryRecords.map((r) => (r.id === 't90m' ? { ...r, displayName: 'T-90AM' } : r));
  assert.ok(rosterNameFindings(rows, { savedIds: SAVED_TANK_IDS, shownName: overridden, galleryRecords: driftedRecords })
    .some((f) => f.startsWith('t90m:')), 'a shown name that drifted is found');

  // the link the gallery writes opens its own vehicle
  for (const record of galleryRecords) {
    const params = new URLSearchParams(galleryHref(record.id).split('?')[1]);
    assert.equal(linkTankId(params), record.id, `${galleryHref(record.id)} opens ${record.id}`);
  }
  // an unstamped link is schema 1: these ids name another vehicle without &ids= (t90m among them)
  const bare = galleryRecords.filter((r) => linkTankId(new URLSearchParams(`id=${r.id}`)) !== r.id);
  assert.equal(linkTankId(new URLSearchParams('id=t90m')), 't90am', 'an unstamped ?id=t90m is the T-90AM (schema 1)');
  assert.ok(bare.some((r) => r.id === 't90m'));

  console.log(`vehicle-roster-names.selftest: ${rows.size} roster rows equal the names shown (${galleryRecords.length} in the gallery, `
    + `${Object.keys(DECLARED_ALIASES).length} aliases); every gallery link opens its vehicle; ${bare.length} ids open another `
    + `vehicle when linked without &ids=${TANK_IDS.schema} (schema 1) PASS`);
}
