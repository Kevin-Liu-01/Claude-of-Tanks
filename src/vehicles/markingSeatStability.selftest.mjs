// Marking seat stability (netting-225, 2026-10-14; the coordinator's ruling on the netted hulls' markings).
//
// The marking solver (vehicleMarkingSeating.ts finalizeVehicleMarkingSeats, run only by
// tools/gen-vehicle-marking-seats.mjs) searches outward from each profile's anchor and takes the first candidate that
// reads best. Regenerating after the netted hulls' garnish came to lie flat moved 25 markings that still read clear, by
// up to 3.6 m, and revived the Type 90A's own builder stations (0.4 and 0.7 m off its seats). The rule: a re-solve starts
// from the vehicle's verified seats (the registry). This receipt holds it:
//   1. a re-solve reproduces the verified record exactly where every seat still reads its recorded clear count (the
//      Type 90A, whose builder stations stay retired while its profile seats stand; the CV90 and the Merkava Mk 4B,
//      netted hulls);
//   2. a seat that no longer reads its recorded count is searched again no farther than 0.5 m from where it stood (here
//      the CV90's insignia, recorded as reading more samples than the receipt casts, so it cannot stand);
//   3. without a verified record the solver's own search runs as before (the seat it finds is a verified one).
import assert from 'node:assert/strict';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

installCanvasFixture();
const warn = console.warn;
console.warn = () => {};
const { createTank } = await import('./tankFactory.ts');
const { vehicleMarkingSeats, registerVehicleMarkingSeatRecords } = await import('./vehicleMarkingSeatRegistry.ts');

const round = (value) => Number(Number(value).toFixed(7));
function solvedSeats(id) {
  const visual = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, solveMarkingSeats: true });
  const seats = [];
  visual.root.traverse((object) => {
    if (!object.userData?.vehicleMarking) return;
    const kind = object.userData.markingKind;
    if (kind !== 'insignia' && kind !== 'designation') return;
    seats.push({
      kind, parent: object.userData.surfaceOwner, size: round(object.scale.x),
      pos: object.position.toArray().map(round), quaternion: object.quaternion.toArray().map(round),
      surfaceMesh: object.userData.surfaceMesh, anchorProfile: object.userData.markingAnchorProfile,
      visibilitySamples: object.userData.visibilitySamples, visibilityClearSamples: object.userData.visibilityClearSamples,
      visibilityRatio: round(object.userData.visibilityRatio), maximumSurfaceErrorM: round(object.userData.maximumSurfaceErrorM),
    });
  });
  visual.dispose();
  return seats;
}
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// 1. stable re-solves
for (const id of ['type90a', 'cv90', 'merkava4b']) {
  const record = vehicleMarkingSeats(id);
  assert.ok(record?.length, `${id}: a verified record is registered`);
  assert.deepEqual(solvedSeats(id), record.map((seat) => ({ ...seat })), `${id}: a re-solve keeps every seat that still reads as recorded`);
}

// 2. a seat that cannot stand is searched again within reach
const cv90 = vehicleMarkingSeats('cv90').map((seat) => ({ ...seat }));
const insignia = cv90.find((seat) => seat.kind === 'insignia');
registerVehicleMarkingSeatRecords({ cv90: { schemaVersion: 1, seats: cv90.map((seat) => (seat === insignia
  ? { ...seat, visibilityClearSamples: seat.visibilitySamples + 1 } : seat)) } });
const reseated = solvedSeats('cv90').find((seat) => seat.kind === 'insignia');
assert.ok(reseated && reseated.visibilityClearSamples >= 6, 'the re-searched insignia is a verified seat');
const moved = distance(reseated.pos, insignia.pos);
assert.ok(moved <= 0.5 + 1e-6, `the re-searched insignia stays within 0.5 m of its seat (moved ${moved.toFixed(3)} m)`);

// 3. no record: the solver's own search
registerVehicleMarkingSeatRecords({ cv90: { schemaVersion: 1, seats: [] } });
const fresh = solvedSeats('cv90');
assert.ok(fresh.some((seat) => seat.kind === 'insignia') && fresh.some((seat) => seat.kind === 'designation'),
  'without a record the solver seats both markings');
for (const seat of fresh) assert.ok(seat.visibilityClearSamples >= 6, `${seat.kind}: verified (${seat.visibilityClearSamples}/9)`);
registerVehicleMarkingSeatRecords({ cv90: { schemaVersion: 1, seats: cv90 } });

console.warn = warn;
console.log(`markingSeatStability: 3 records re-solved unchanged; a seat that cannot stand moved ${moved.toFixed(3)} m (<= 0.5); a fresh solve seats both`);
