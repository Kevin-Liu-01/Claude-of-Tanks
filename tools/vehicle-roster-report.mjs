import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import '../src/vehicles/tankFactory.ts';
import {
  DEVELOPMENT_TANK_IDS,
  PRODUCTION_TANK_IDS,
  SAVED_TANK_IDS,
  TANK_SPECS,
} from '../src/vehicles/specs.js';
import { tankTier, tierNumeral } from '../src/vehicles/tier.ts';
import { vehicleEraLabel } from '../src/vehicles/taxonomy.ts';

const REPORT_URL = new URL('../docs/VEHICLE-ROSTER.md', import.meta.url);
const REASON_LABELS = Object.freeze({
  production: 'Production',
  'production-curation': 'Production curation',
  'historical-archive': 'Historical archive',
  'saved-development-model': 'Saved development model',
  'reference-placeholder': 'Reference placeholder',
  'development-only': 'Development only',
});

function cell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function buildReport() {
  const production = new Set(PRODUCTION_TANK_IDS);
  const rows = SAVED_TANK_IDS.map((id, index) => {
    const spec = TANK_SPECS[id];
    return {
      index: index + 1,
      status: production.has(id) ? 'PROD' : spec.roster?.localVisible ? 'DEV' : 'REF',
      id,
      name: spec.name,
      nation: spec.nation || 'Unknown',
      era: vehicleEraLabel(spec.era),
      tier: tierNumeral(id) || String(tankTier(id)),
      reason: REASON_LABELS[spec.roster?.reason] || spec.roster?.reason || 'Unknown',
    };
  });
  const devCount = DEVELOPMENT_TANK_IDS.length - PRODUCTION_TANK_IDS.length;
  const referenceCount = rows.length - DEVELOPMENT_TANK_IDS.length;
  const lines = [
    '# Complete vehicle roster',
    '',
    '> Generated from `TANK_SPECS` by `npm run tank:roster`. Do not maintain a second hand-written roster.',
    '',
    `Claude of Tanks currently retains **${rows.length} saved vehicle records**: **${PRODUCTION_TANK_IDS.length} production-visible**, **${devCount} local development models**, and **${referenceCount} non-playable reference placeholders**. Production carousels, matchmaking, the Tank Gallery, and Scene Studio use the production projection.`,
    '',
    'To inspect every playable saved model locally, copy `.env.example` to `.env.local` and run the Vite development server. The `VITE_COT_DEV_FLEET_KEY` switch is accepted only when Vite reports `DEV=true`; it is ignored by production builds. Development-only entries display a blue `DEV` tag in vehicle pickers. `REF` records remain report-only because they are generic community placeholders, not first-party playable models.',
    '',
    '| # | Status | Stable ID | Vehicle | Nation | Tier | Era | Roster reason |',
    '| ---: | :---: | --- | --- | --- | :---: | --- | --- |',
    ...rows.map((row) => `| ${row.index} | ${row.status} | \`${cell(row.id)}\` | ${cell(row.name)} | ${cell(row.nation)} | ${cell(row.tier)} | ${cell(row.era)} | ${cell(row.reason)} |`),
    '',
    '## Policy ownership',
    '',
    '- `src/vehicles/rosterPolicy.ts` owns explicit production exclusions and the local-development gate.',
    '- `src/vehicles/taxonomy.ts` owns the public era taxonomy and every saved vehicle assignment.',
    '- `src/vehicles/specs.js` owns the central `TANK_CATALOGS` registry; garage, gallery, bots, runtime, and tools consume shared projections rather than copied lists.',
    '- Production visibility is independent from record retention: hiding a vehicle never deletes its authored spec or tooling access.',
    '',
  ];
  return lines.join('\n');
}

const output = buildReport();
if (process.argv.includes('--check')) {
  const current = await readFile(REPORT_URL, 'utf8').catch(() => '');
  if (current !== output) {
    console.error('docs/VEHICLE-ROSTER.md is stale; run npm run tank:roster -- --write');
    process.exitCode = 1;
  } else {
    console.log(`vehicle-roster-report: ${SAVED_TANK_IDS.length} saved vehicles are current`);
  }
} else if (process.argv.includes('--write')) {
  await writeFile(REPORT_URL, output, 'utf8');
  console.log(`wrote ${fileURLToPath(REPORT_URL)} (${SAVED_TANK_IDS.length} vehicles)`);
} else {
  process.stdout.write(output);
}
