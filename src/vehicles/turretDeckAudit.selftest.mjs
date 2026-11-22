// The turret-deck check (turretDeckAudit.test-support.mjs) on one clean build and two negative controls: the T-72B3's
// turret passes as built, fails (a) once its rig is lowered onto the deck round its ring, and fails (b) once a fender
// bin taller than its foot stands beside it. The measurement restores the turret's pose (the fleet pass's rule). The
// ring-zone guard (ringZoneGuard.ts) names the same bin, and passes a box the same size standing under the foot.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { combatAnatomyCalibration } from './combatAnatomyCalibrationRegistry.ts';
import { DECK_CLEAR_M, PROP_MARGIN_M, measureTurretDeck } from './turretDeckAudit.test-support.mjs';
import { ringZoneViolations } from './ringZoneGuard.ts';

const ID = 't72b3';
const tank = createTank(ID, null, { proceduralOnly: true, geometryReceipt: true });
const receipt = combatAnatomyCalibration(ID)?.turretRing;
assert(receipt, `${ID}: a published ring receipt`);
const turret = tank.root.getObjectByName('rig_turret'), hull = tank.root.getObjectByName('rig_hull');
const pose = [...turret.position.toArray(), ...turret.quaternion.toArray()];

const clean = measureTurretDeck(tank.root, receipt);
assert.deepEqual(clean.deck, [], `${ID}: turret clear of its deck at every yaw (${JSON.stringify(clean.deck[0])})`);
assert.deepEqual(clean.props, [], `${ID}: no hull prop over the turret's foot (${JSON.stringify(clean.props[0])})`);
assert(clean.minClearM >= DECK_CLEAR_M, `${ID}: least clearance ${clean.minClearM} m`);
assert.equal(turret.userData.turretSeatShortfall, undefined, `${ID}: the seat brings its whole foot onto its plane`);
assert.deepEqual([...turret.position.toArray(), ...turret.quaternion.toArray()], pose, 'the yaw sweep restores the turret');

// (a) the turret lowered until its floor stands 3 cm into the deck at its tightest point (its seat gap gone round its foot)
const drop = clean.minClearM + 0.03;
turret.position.y -= drop / hull.scale.y;
const sunk = measureTurretDeck(tank.root, receipt);
turret.position.y += drop / hull.scale.y;
assert(sunk.deck.length > 0 && sunk.deck[0].clearM < 0, `${ID} lowered ${drop.toFixed(3)} m: (a) flags its floor`);
assert.equal(sunk.deckYaws, 16, `${ID} lowered: flagged at every yaw`);

// (b) a bin beside the turret's foot standing 10 cm over it, on the left fender, inside the prop margin
const [sx, , sz] = receipt.seat;
const footY = receipt.deckY + clean.footMinOverDeckM;
const binH = footY + 0.10 - (receipt.deckY - 0.05);
const bin = new THREE.Mesh(new THREE.BoxGeometry(0.2, binH, 0.4), new THREE.MeshStandardMaterial());
bin.name = 'controlBin';
const footR = Math.max(receipt.footR, receipt.rimR + 0.05);
bin.position.set(sx + footR + PROP_MARGIN_M / 2 + 0.1, receipt.deckY - 0.05 + binH / 2, sz);
hull.add(bin);
const binned = measureTurretDeck(tank.root, receipt);
hull.updateMatrixWorld(true);
bin.geometry.computeBoundingBox();
const binBox = bin.geometry.boundingBox.clone().applyMatrix4(bin.matrix);
hull.remove(bin);
assert(binned.props.some((patch) => patch.hull.includes('controlBin') && patch.riseM > 0.05),
  `${ID} + bin: (b) flags the bin (${JSON.stringify(binned.props)})`);
// the guard: the bin's box as a kit entry point hands it over (hull frame), then the same box sunk under the foot
const gun = tank.root.getObjectByName('rig_gun');
const caught = ringZoneViolations({ specId: ID, hullG: hull, turretG: turret, gunG: gun, parts: [{ bucket: 'hullEquipment', box: binBox }] });
assert(caught.length === 1 && caught[0].riseM > 0.05 && caught[0].bearingDeg > 45 && caught[0].bearingDeg < 135,
  `${ID} + bin: the ring-zone guard names it on the left (${JSON.stringify(caught)})`);
const sunk2 = binBox.clone().translate({ x: 0, y: -(binBox.max.y - (receipt.deckY + 0.005)), z: 0 });
assert.deepEqual(ringZoneViolations({ specId: ID, hullG: hull, turretG: turret, gunG: gun, parts: [{ bucket: 'hullEquipment', box: sunk2 }] }), [],
  `${ID}: a box under the foot passes the guard`);
tank.dispose();
console.log(`turretDeckAudit selftest PASS (${ID} clear ${clean.minClearM} m; lowered ${sunk.deck[0].clearM} m; bin +${binned.props[0].riseM} m, guard +${caught[0].riseM} m)`);
