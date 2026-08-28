import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import './fleetFloorClearance.selftest.mjs';
import { createTank } from './tankFactory.js';
import {
  ALL_TANK_IDS,
  DEVELOPMENT_TANK_IDS,
  RETIRED_EXTERNAL_PLACEHOLDER_IDS,
  getSpec,
} from './specs.js';
import {
  TANK_ASSET_SCHEMA_VERSION, TANK_ASSET_VIEWS, expectedMuzzleBoreCount, geometryFingerprint, metadataFingerprint,
  requiredTankAssetFiles, tankAssetMetadata,
} from './tankAssets.js';
import { VEHICLE_ERA_META } from './taxonomy.ts';
import {
  TANK_PRESENTATION_ANCHORS,
  TANK_PRESENTATION_PROJECTIONS,
} from './presentationAnchors.generated.js';
import { isKillcamGhostSurface } from '../game/killcamGhostPolicy.ts';
import { FIRST_PARTY_LICENSE } from '../authorship.ts';

assert.equal(Object.keys(TANK_ASSET_VIEWS).length, 9, 'release contract includes nine views/diagrams');
assert.equal(Object.keys(TANK_PRESENTATION_ANCHORS).length, DEVELOPMENT_TANK_IDS.length,
  'rendered-pixel presentation receipt count matches the development fleet');
assert.equal(Object.keys(TANK_PRESENTATION_PROJECTIONS).length, DEVELOPMENT_TANK_IDS.length,
  'orthographic projection receipt count matches the development fleet');
for (const id of DEVELOPMENT_TANK_IDS) {
  assert.ok(TANK_PRESENTATION_ANCHORS[id],
    `${id}: rendered-pixel presentation receipt covers the saved development tank`);
  const projection = TANK_PRESENTATION_PROJECTIONS[id];
  assert.ok(Number.isFinite(projection?.centerYM)
    && Number.isFinite(projection?.topHalfM) && projection.topHalfM > 0
    && Number.isFinite(projection?.sideHalfM) && projection.sideHalfM > 0,
  `${id}: generated asset projection carries finite top/side fit envelopes`);
}
const assetManifest = JSON.parse(readFileSync(new URL('../../public/icons/tank-assets.json', import.meta.url)));
assert.equal(assetManifest.schemaVersion, TANK_ASSET_SCHEMA_VERSION,
  'generated manifest uses the current public taxonomy schema');
for (const id of DEVELOPMENT_TANK_IDS) {
  const record = assetManifest.tanks?.[id] || {};
  const assets = record.assets || {};
  assert.deepEqual(Object.keys(assets).sort(), Object.keys(TANK_ASSET_VIEWS).sort(),
    `${id}: all nine local-development presentation assets are indexed`);
  assert.ok(Number.isFinite(record.presentationAnchor?.xM)
    && Number.isFinite(record.presentationAnchor?.zM),
  `${id}: generated assets record their rendered-body presentation center`);
  assert.deepEqual(record.presentationProjection, TANK_PRESENTATION_PROJECTIONS[id],
    `${id}: public icon manifest and runtime hit-marker projection share one fit receipt`);
  assert.match(record.presentationHash || '', /^[0-9a-f]{8}$/,
    `${id}: generated assets fingerprint their structural presentation center`);
  for (const asset of Object.values(assets)) {
    assert(existsSync(new URL(`../../public/icons/${asset.file}`, import.meta.url)),
      `${id}: missing ${asset.file}`);
  }
}
assert.equal(expectedMuzzleBoreCount(getSpec('t72b3m')), 1,
  'single-cannon profiles require one bore/rim pair');
assert.equal(expectedMuzzleBoreCount(getSpec('bmpt_terminator2')), 2,
  'twin autocannon profiles require one bore/rim pair per barrel');

const displayNames = new Set();
const HULL_ONLY_SHADOW_IDS = new Set(['udes03', 'strv103', 'strv103a', 'jpz_e100', 'sturmtiger', 't95']);

for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id);
  assert.equal(spec.community, undefined, `${id}: obsolete community/source credit leaked into selectable spec`);
  assert.notEqual(String(spec.nation || '').toLowerCase(), 'community', `${id}: Community nation is not selectable`);
  assert.equal(spec.authorship?.creator, 'Kevin B. Liu', `${id}: named first-party creator`);
  assert.equal(spec.authorship?.copyright, 'Copyright © 2026 Kevin B. Liu', `${id}: first-party copyright`);
  assert.equal(spec.authorship?.license, FIRST_PARTY_LICENSE, `${id}: first-party license`);
  assert.equal(spec.authorship?.geometry, 'first-party-procedural', `${id}: first-party geometry authorship`);
  assert.equal(spec.authorship?.runtimeExternalGeometry, false, `${id}: runtime external geometry disabled`);
  assert.equal(spec.publicVisualFallback, undefined, `${id}: own first-party public visuals`);
  const metadata = tankAssetMetadata(spec);
  assert.equal(Object.hasOwn(metadata, 'class'), false, `${id}: retired class is absent from asset metadata`);
  assert.ok(VEHICLE_ERA_META[metadata.era], `${id}: asset metadata uses a canonical era`);
  const files = Object.values(requiredTankAssetFiles(id));
  assert.equal(new Set(files).size, 9, `${id}: asset filenames are unique`);
  assert(Number.isInteger(metadata.tier) && metadata.tier >= 1 && metadata.tier <= 10, `${id}: tier`);
  assert(metadata.tierNumeral, `${id}: Roman tier`);
  assert(metadata.countryCode, `${id}: flag country code`);
  assert.equal(metadata.markings.countryCode, metadata.countryCode, `${id}: flag and painted insignia country agree`);
  assert(metadata.markings.designation && metadata.markings.insignia, `${id}: tactical designation and insignia`);
  assert.equal(metadata.name, metadata.label.displayName, `${id}: canonical display label`);
  assert(metadata.label.shortName && metadata.label.shortName.length <= 28, `${id}: compact card label`);
  assert.equal(metadata.label.id, id, `${id}: stable id label key`);
  assert(!/\bMk\./.test(metadata.name), `${id}: consistent Mk typography`);
  assert(!displayNames.has(metadata.name), `${id}: unique display label (${metadata.name})`);
  displayNames.add(metadata.name);
  assert(metadata.gun.caliberMm > 0, `${id}: gun caliber`);
  assert(metadata.gun.shells.length > 0, `${id}: penetration data`);
  assert(metadata.armor.plates.length > 0, `${id}: armor hit areas`);
  assert(metadata.armor.modules.length > 0, `${id}: module volumes`);
  assert.equal(metadata.armor.schemaVersion, 3, `${id}: segmented combat-anatomy schema`);
  assert.equal(new Set(metadata.armor.plates.map((plate) => plate.hitboxId)).size, metadata.armor.plates.length, `${id}: unique hitbox ids`);
  assert.equal(new Set(metadata.armor.modules.map((box) => box.volumeId)).size, metadata.armor.modules.length, `${id}: unique module ids`);
  assert.equal(metadataFingerprint(metadata), metadataFingerprint(tankAssetMetadata(spec)), `${id}: stable metadata hash`);
}

const sepv2Metadata = tankAssetMetadata(getSpec('m1a2_sepv2'));
const sepv2OpticsMetadata = sepv2Metadata.armor.modules.find((box) => box.name === 'optics');
assert(sepv2OpticsMetadata.parts.length >= 4,
  'SEPv2 asset metadata fingerprints the separate CROWS and sight volumes');

for (const id of RETIRED_EXTERNAL_PLACEHOLDER_IDS) {
  assert.equal(ALL_TANK_IDS.includes(id), false, `${id}: retired external placeholder is not selectable`);
}

assert.equal(getSpec('m1a2').name, 'M1A2 Abrams', 'Tejas is the canonical M1A2 identity');
assert.equal(getSpec('m1a2_legacy').name, 'M1A2 Abrams (Legacy)', 'former M1A2 retains the legacy identity');
assert.equal(getSpec('m1a1ha').name, 'M1A1 Abrams HA', 'Abrams family naming is consistent');
assert.equal(getSpec('m1a2_sepv3').name, 'M1A2 Abrams SEPv3', 'SEPv3 carries the family name');
assert.equal(getSpec('bwp1').name, 'BWP-1 (Bojowy Wóz Piechoty 1)',
  'BMP-derived Upior entry is publicly named BWP-1');
assert.equal(ALL_TANK_IDS.includes('upior_ifv'), false,
  'retired Upior IFV id is absent from the runtime roster');
assert.equal(getSpec('upior').name, 'Upiór IFV',
  'separate ground-up Upior identity remains unchanged');
assert.equal(getSpec('strv122').name, 'Stridsvagn 122',
  'Swedish vehicle uses its operator-standard public name');
assert.equal(getSpec('k2').label.shortName, 'K2',
  'K2 keeps the canonical designation as its concise public label');
assert.equal(getSpec('spz_puma').name, 'Schützenpanzer Puma',
  'Puma uses the Bundeswehr vehicle-class designation');
assert.equal(getSpec('marder1a3').name, 'Schützenpanzer Marder 1A3',
  'Marder uses the standardized German vehicle-class designation');
assert.equal(ALL_TANK_IDS.includes('m1a2_tejas'), false, 'retired Tejas alias is not selectable');
const canonicalM1A2 = createTank('m1a2', null, { proceduralOnly: true, geometryReceipt: true });
const legacyM1A2 = createTank('m1a2_legacy', null, { proceduralOnly: true, geometryReceipt: true });
await Promise.resolve();
assert.notEqual(
  geometryFingerprint(canonicalM1A2.root),
  geometryFingerprint(legacyM1A2.root),
  'canonical and legacy M1A2 ids resolve to distinct procedural profiles',
);
function verifyAuthoredShadowCasters(id, tank) {
  const casters = [];
  const submittedCasters = [];
  tank.root.traverse((object) => {
    if (object.userData?.authoredShadowProxy) casters.push(object);
    if ((object.isMesh || object.isInstancedMesh) && object.castShadow) {
      submittedCasters.push(object);
    }
  });
  const expectedNames = HULL_ONLY_SHADOW_IDS.has(id)
    ? ['procShadow_hull']
    : ['procShadow_gun', 'procShadow_hull', 'procShadow_turret'];
  assert.deepEqual(casters.map((object) => object.name).sort(), expectedNames,
    `${id}: complete bounded articulation-aware shadow caster set`);
  assert.deepEqual(submittedCasters.map((object) => object.name).sort(), expectedNames,
    `${id}: detailed render meshes never leak into CSM submissions`);
  let proxyTriangles = 0;
  let sourceTriangles = 0;
  for (const caster of casters) {
    const position = caster.geometry.getAttribute('position');
    const triangles = (caster.geometry.index?.count || position.count) / 3;
    proxyTriangles += triangles;
    sourceTriangles += caster.geometry.userData.shadowSourceTriangles;
    assert.equal(caster.castShadow, true, `${id}/${caster.name}: casts`);
    assert.equal(caster.material.colorWrite, false, `${id}/${caster.name}: shadow-only material`);
    assert.equal(isKillcamGhostSurface(caster), false,
      `${id}/${caster.name}: shadow hull never leaks into kill-cam x-ray`);
    assert.equal(caster.customDepthMaterial?.name, 'ProceduralShadowProxyDepth',
      `${id}/${caster.name}: isolated biased depth material`);
    assert.equal(caster.customDepthMaterial.polygonOffset, true,
      `${id}/${caster.name}: shadow-depth slope bias enabled`);
    assert.equal(caster.geometry.userData.authoredShadowHull, true,
      `${id}/${caster.name}: derived from authored geometry`);
    assert(caster.geometry.userData.shadowInsetM > 0,
      `${id}/${caster.name}: caster inset inside visible armor`);
    assert(caster.geometry.userData.shadowAxisScale.every((scale) => scale <= 1 && scale >= 0.8),
      `${id}/${caster.name}: bounded inset axis scale`);
    assert(triangles <= 120,
      `${id}/${caster.name}: bounded shadow triangle budget (${triangles})`);
  }
  assert(sourceTriangles > proxyTriangles * 8,
    `${id}: authored sources remain materially richer than the bounded shadow set`);
  assert(proxyTriangles <= 320,
    `${id}: authored shadow budget (${proxyTriangles} triangles)`);
  if (id === 'm1a2') {
    assert(proxyTriangles > 92,
      'authored silhouette carries more shape information than the retired box/cylinder proxy');
  }
}

verifyAuthoredShadowCasters('m1a2', canonicalM1A2);
verifyAuthoredShadowCasters('m1a2_legacy', legacyM1A2);
for (const id of ALL_TANK_IDS) {
  if (id === 'm1a2' || id === 'm1a2_legacy') continue;
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  // Profile microtasks used to overwrite factory shadow geometry. Give any
  // future callback the opportunity to run before certifying the final tree.
  await Promise.resolve();
  verifyAuthoredShadowCasters(id, tank);
  tank.dispose();
}
canonicalM1A2.dispose();
legacyM1A2.dispose();

console.log(`tankAssets.selftest: ${ALL_TANK_IDS.length} tanks have tier, flag, gun, hit-area and module metadata`);
