import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ALL_TANK_IDS, TANK_SPECS } from '../specs.ts';

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const n = new THREE.Vector3();

function triangles(mesh, accept) {
  const position = mesh.geometry.getAttribute('position');
  const normal = mesh.geometry.getAttribute('normal');
  const found = [];
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    n.fromBufferAttribute(normal, i).normalize();
    const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    const face = { centroid, normal: n.clone(), area };
    if (accept(face)) found.push(face);
  }
  return found;
}

// The removed chevron bars were single 0.8 m-wide panels. Their broad face
// triangles exceeded 0.10 m² inside this front-cheek envelope. Real T-80/B
// applique returns and the BV's individual Kontakt cassettes remain smaller.
for (const id of ['t80', 't80b', 't80bv']) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const track = tank.root.getObjectByName('turretTrack');
  const continuousBars = track?.geometry ? triangles(track, ({ centroid, area }) =>
    area > 0.10 && Math.abs(centroid.x) > 0.45 && Math.abs(centroid.x) < 1.4
      && centroid.y > 0.15 && centroid.y < 0.75 && centroid.z > 0.70) : [];
  assert.equal(continuousBars.length, 0,
    `${id} has no redundant continuous turret ERA bar`);
  assert.ok(track === undefined,
    `${id} cheek protection inherits turret camouflage instead of generic gray track steel`);
  tank.dispose();
}

// Release 262: the T-84U Oplot is the Oplot-M/T family's 2000 stage (profiles/oplotBM.ts variant 'u'): its Kontakt-5
// boxes on the glacis, the turret front and the forward skirt panels wear the vehicle's paint, every gameplay ERA plate
// of its spec has exactly one visual cluster, and the fleet's layered ERA finish holds.
const oplot = createTank('t84bm_oplot_m', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
assert.ok(oplot.root.getObjectByName('turretTrack') === undefined,
  'T-84U Kontakt-5 turret boxes inherit the turret camouflage palette');
assert.ok(oplot.root.getObjectByName('hullTrack') === undefined,
  'T-84U Kontakt-5 glacis and skirt boxes inherit the hull camouflage palette');
const oplotEraPlates = [...new Set(
  [...TANK_SPECS.t84bm_oplot_m.armor.hullPlates, ...TANK_SPECS.t84bm_oplot_m.armor.turretPlates]
    .filter((plate) => plate.kind === 'era')
    .map((plate) => plate.name),
)].sort();
assert.deepEqual(oplot.root.userData.eraClusterNames, oplotEraPlates,
  'every T-84U gameplay ERA plate has one exact visual cluster');
const finish = oplot.root.userData.eraFinishReceipt;
assert.ok(finish, 'the T-84U publishes the fleet layered ERA finish receipt');
assert.equal(finish.revision, 'fleet-layered-vehicle-scale-camo-r1');
assert.equal(finish.camoProjection, 'vehicle-scale-box-uv');
assert.equal(finish.bodyAndCoverUseVehiclePaint, true,
  'T-84U cassette bodies and top layers both inherit the vehicle camouflage');
assert.deepEqual(finish.owners, ['hull', 'turret']);
assert.equal(finish.maximumDrawBuckets, 2,
  'all T-84U ERA remains in one static merged bucket per articulation owner');
assert.equal(finish.perFrameWork, false);
assert.ok(oplot.root.getObjectByName('turretExternalArmor')?.geometry,
  'T-84U turret Kontakt-5 bodies and covers share the external-armor mesh');
assert.ok(oplot.root.getObjectByName('hullExternalArmor')?.geometry,
  'T-84U glacis and skirt Kontakt-5 share the external-armor mesh');

oplot.dispose();

// Runtime depletion is physical visual state: every authoritative ERA plate
// maps to exact authored vertices, collapses independently after activation,
// and returns only when a new round resets the rig.
{
  const t90am = createTank('t90am', null, {
    proceduralOnly: true,
    geometryReceipt: true,
  });
  const countCollapsed = () => {
    let collapsed = 0;
    t90am.root.traverse((node) => {
      const position = node.geometry?.getAttribute?.('position');
      if (!position) return;
      for (let index = 0; index < position.count; index++) {
        if (position.getY(index) < -900) collapsed++;
      }
    });
    return collapsed;
  };
  const plateNames = [...new Set(
    [...TANK_SPECS.t90am.armor.hullPlates, ...TANK_SPECS.t90am.armor.turretPlates]
      .filter((plate) => plate.kind === 'era')
      .map((plate) => plate.name),
  )].sort();
  assert.deepEqual(t90am.root.userData.eraClusterNames, plateNames,
    'every T-90M gameplay ERA plate has one exact visual cluster');
  const before = countCollapsed();
  let previous = before;
  for (const plateName of plateNames) {
    assert.equal(t90am.stripEra(plateName), true,
      `${plateName} resolves an authored visual cassette cluster`);
    const next = countCollapsed();
    assert.ok(next > previous, `${plateName} removes visible authored vertices`);
    assert.equal(t90am.stripEra(plateName), true, `${plateName} depletion is idempotent`);
    assert.equal(countCollapsed(), next, `${plateName} is not depleted twice`);
    previous = next;
  }
  assert.equal(t90am.resetEra(), true, 'new round restores authored ERA placement');
  assert.equal(countCollapsed(), before, 'restored ERA has no collapsed cassette instances');
  t90am.dispose();
}

// 267 (Main's tanks-suite triage, ruled "armour and visuals agree in both directions"): on every id the gameplay ERA
// plates of its spec and the ERA clusters its build draws are the same set. A spec ERA plate with nothing drawn on it
// is armour a player cannot see (the T-90AM carried the Proryv's skirt and turret-flank Relikt plates over a T-90SM
// build that draws neither); drawn ERA with no plate under it is armour that stops nothing (the T-90MS obr. 2011's
// turret-flank K-5 boxes). t90MarkFrames.ts agreeDrawnEra settles both; this holds the whole fleet to it.
const eraPlateNames = (spec) => [...new Set([...spec.armor.hullPlates, ...spec.armor.turretPlates]
  .filter((plate) => plate.kind === 'era').map((plate) => plate.name))].sort();
const eraAgreement = (plates, drawn) => ({
  specUndrawn: plates.filter((name) => !drawn.includes(name)),
  drawnUnspecced: drawn.filter((name) => !plates.includes(name)),
});
// Disagreements held while another lane owns the fix: { id: { specUndrawn: [...], drawnUnspecced: [...] } }. A held
// id may not gain one and must be removed as it is fixed (the check is exact both ways). Empty at 267: the fleet agrees.
const KNOWN_ERA_DISAGREEMENTS = Object.freeze({});
const drawnEra = new Map();
{
  const found = {};
  for (const id of ALL_TANK_IDS) {
    const tank = createTank(id, null, { proceduralOnly: true, quality: 'low', geometryReceipt: true });
    const drawn = [...(tank.root.userData.eraClusterNames ?? [])].sort();
    tank.dispose();
    drawnEra.set(id, drawn);
    const { specUndrawn, drawnUnspecced } = eraAgreement(eraPlateNames(TANK_SPECS[id]), drawn);
    if (specUndrawn.length || drawnUnspecced.length) found[id] = { specUndrawn, drawnUnspecced };
  }
  const report = Object.entries(found).map(([id, { specUndrawn, drawnUnspecced }]) =>
    `  ${id}: spec plate(s) with nothing drawn [${specUndrawn.join(', ')}]; drawn ERA with no plate [${drawnUnspecced.join(', ')}]`);
  assert.deepEqual(found, KNOWN_ERA_DISAGREEMENTS,
    `gameplay ERA and drawn ERA disagree (held: ${Object.keys(KNOWN_ERA_DISAGREEMENTS).length}):\n${report.join('\n')}`);
  console.log(`eraSeating.selftest: ${ALL_TANK_IDS.length} ids' gameplay ERA plates and drawn ERA clusters agree both ways `
    + `(${Object.keys(found).length} held)`);
}
// Negative controls, one per direction, on the two disagreements this receipt was written for, as they stood: the check
// must name them. The T-90AM's plates before the ruling were its donor record's (armorT90M; the T-90M Proryv still
// carries it whole), against the T-90SM build the T-90AM draws; the obr. 2011's plates without the Tagil flank pair,
// against the flank boxes it draws.
{
  const amDrawn = drawnEra.get('t90am'), msDrawn = drawnEra.get('t90ms_2011');
  assert.deepEqual(eraAgreement(eraPlateNames(TANK_SPECS.t90m_proryv), amDrawn),
    { specUndrawn: ['side_era_L', 'side_era_R', 'skirt_era_L', 'skirt_era_R'], drawnUnspecced: [] },
    'control: the T-90AM\'s former Proryv plates are four spec plates with nothing drawn on them');
  assert.deepEqual(eraAgreement(eraPlateNames(TANK_SPECS.t90ms_2011).filter((name) => !/^side_era_/.test(name)), msDrawn),
    { specUndrawn: [], drawnUnspecced: ['side_era_L', 'side_era_R'] },
    'control: the obr. 2011 without its flank plates draws two ERA sectors with no plate under them');
  // and the added flank plates are bound to the drawn boxes' own faces (the ERA visual binding), as the family's are
  const ms = createTank('t90ms_2011', null, { proceduralOnly: true, geometryReceipt: true });
  for (const name of ['side_era_L', 'side_era_R']) {
    const rows = ms.root.userData.eraVisualBindingReceipt.plates.filter((row) => row.name === name);
    assert.ok(rows.length && rows.every((row) => row.registered && row.ownerMatches && row.fittedSurfaces.length > 0),
      `t90ms_2011 ${name}: registered on the turret with hit faces fitted to its drawn boxes`);
    assert.equal(ms.stripEra(name), true, `t90ms_2011 ${name} strips its drawn boxes`);
  }
  assert.equal(ms.resetEra(), true);
  ms.dispose();
  console.log('eraSeating.selftest: negative controls (spec-undrawn on the T-90AM\'s former plates, drawn-unspecced on the obr. 2011 without its flank plates) fail as they must');
}

console.log('eraSeating.selftest: ERA caps are seated, consumable, and resettable');
