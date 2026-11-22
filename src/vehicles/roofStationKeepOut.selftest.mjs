// No decor inside a roof station's traverse, on every tank (275, lane roof-station-keepout-275; the owner on the Oplots:
// the "light tower" must stop blocking the machine gun). decorations.ts reserves every station's swept volume
// (stationSweepKeepOut.ts) and turns away any decor piece that enters it; this receipt holds the fleet to that without
// building it, and checks the keep-out's geometry on a station made here.
//
// 1. The fleet: tools/vehicle-controls-inventory.mjs measures every tank it builds (tools/roof-station-probe.mjs
//    decorInStationArcs: each station's barrel lines swept against the decor alone, whole degrees inside its arc) and
//    writes decorInStationArcs.generated.ts, level to full elevation and down to the depression the authority allows).
//    Any entry fails here.
// 2. The keep-out's volume, on a made station (a 12.7 on a pitch group, a 1.1 m barrel): it holds what the barrel sweeps
//    from its deepest depression (the weapon's, or its mount's table) to full elevation round the whole circle, leaves the
//    deck under the depressed barrel and the air beyond its reach, keeps to an authored arc, and puts the pitch group back
//    as it stood. The live builds (the integ/274.0 pass's worst
//    stations, with a negative control) are roofStationKeepOutLive.selftest's, in the tanks suite.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DECOR_IN_STATION_ARCS } from './decorInStationArcs.generated.ts';
import { isRoofStation, stationSweepKeepOut, stationSweepMet } from './stationSweepKeepOut.ts';

// 1. the fleet table
const listed = Object.entries(DECOR_IN_STATION_ARCS)
  .map(([id, hits]) => `${id}: ${hits.map((h) => `${h.station} ${h.blockedDeg.map(([a, b]) => `${a}..${b}`).join(',')}`).join('; ')}`);
assert.deepEqual(listed, [], 'no tank carries decor inside a roof station\'s traverse (decorInStationArcs.generated.ts)');

// 2. a made station: the frame is a turret group, the station stands on its roof at (0.4, 0.5, -0.3), its trunnion 0.3 m
// over the ring, the barrel 1.1 m to the muzzle (station-local)
function madeStation(yawArc = null) {
  const frame = new THREE.Group();
  frame.position.set(0, 1.6, 0.2);
  const station = new THREE.Object3D();
  station.name = 'madeStation';
  station.position.set(0.4, 0.5, -0.3);
  station.userData = { remoteControlled: true, firingAxis: '+Z', auxiliaryPivot: [0, 0.3, 0], muzzleLocalZ: 1.1,
    barrelAxisLocalY: 0.3, caliberMm: 12.7, ...(yawArc ? { yawArc } : {}) };
  const pitch = new THREE.Object3D();
  pitch.name = 'auxiliaryWeaponPitch';
  pitch.position.set(0, 0.3, 0);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.0, 8).rotateX(Math.PI / 2).translate(0, 0, 0.6));
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.5).translate(0, 0, -0.05));
  pitch.add(barrel, receiver);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 12).translate(0, 0.125, 0));
  station.add(ring, pitch);
  frame.add(station);
  frame.updateMatrixWorld(true);
  return { frame, station, pitch };
}
// a box in the frame, `dist` m from the station's axis on bearing `bearing` (radians from its rest bearing, +x of +z),
// `y0`..`y1` over the station's ring (the station's own y is 0.5 in the frame)
const boxAt = (dist, bearing, y0, y1, half = 0.08) => {
  const x = 0.4 + Math.sin(bearing) * dist, z = -0.3 + Math.cos(bearing) * dist;
  return new THREE.Box3(new THREE.Vector3(x - half, 0.5 + y0, z - half), new THREE.Vector3(x + half, 0.5 + y1, z + half));
};

const { frame, station, pitch } = madeStation();
assert.ok(isRoofStation(station), 'the made station is a roof station');
const restMatrix = pitch.matrix.clone();
const sweeps = stationSweepKeepOut(frame, [frame], 'made_vehicle');
assert.equal(sweeps.length, 1, 'one station, one swept volume');
assert.ok(pitch.matrix.equals(restMatrix), 'the pitch group is put back as it stood');
const met = (box) => stationSweepMet(sweeps, box) !== null;
// at bore height, round the whole circle and to the muzzle
for (const bearing of [0, Math.PI / 2, Math.PI, -2.4]) {
  assert.ok(met(boxAt(0.7, bearing, 0.2, 0.4)), `a chest at bore height 0.7 m out on bearing ${bearing.toFixed(1)} is in the sweep`);
}
assert.ok(met(boxAt(1.05, 1.0, 0.25, 0.35, 0.03)), 'a can at bore height under the muzzle is in the sweep');
assert.ok(met(boxAt(0.5, -1.2, 0.0, 1.8, 0.01)), 'a whip 0.5 m from the axis reaches through the sweep');
// above the barrel, where it elevates (heavy profile: 0.75 rad): 0.4 m out and 0.3 m over the bore
assert.ok(met(boxAt(0.4, 0.3, 0.55, 0.62)), 'a load the barrel meets as it elevates is in the sweep');
// the barrel depresses (heavy profile: 0.18 rad, 13 cm down 0.7 m out) into a load under its level line
assert.ok(met(boxAt(0.7, 0.5, 0.0, 0.2)), 'a load the barrel meets as it depresses is in the sweep');
// the deck under the depressed barrel and the air beyond its reach stay free
assert.ok(!met(boxAt(0.7, 0.5, 0.0, 0.05)), 'a low load under the depressed barrel 0.7 m out is clear');
assert.ok(!met(boxAt(1.4, 0.5, 0.2, 0.4)), 'a chest at bore height past the muzzle\'s reach is clear');
// the receiver's swing: behind the trunnion at its height
assert.ok(met(boxAt(0.28, Math.PI, 0.22, 0.3, 0.05)), 'the receiver swings through a load just behind the trunnion');

// a mount whose table holds the barrel level all round (src/sim/auxiliarySystems.ts depressionAt) leaves that load be
const level = madeStation();
level.station.userData.depressionByYaw = [[-Math.PI, 0], [Math.PI, 0]];
const levelSweeps = stationSweepKeepOut(level.frame, [level.frame], 'made_vehicle');
assert.ok(!stationSweepMet(levelSweeps, boxAt(0.7, 0.5, 0.0, 0.2)), 'held level by its table, the barrel clears the load');
assert.ok(stationSweepMet(levelSweeps, boxAt(0.7, 0.5, 0.2, 0.4)), 'and still meets one at bore height');

// an authored arc keeps the sweep to it: +-0.5 rad round the rest bearing
const arced = madeStation([-0.5, 0.5]);
const arcSweeps = stationSweepKeepOut(arced.frame, [arced.frame], 'made_vehicle');
const metArc = (box) => stationSweepMet(arcSweeps, box) !== null;
assert.ok(metArc(boxAt(0.7, 0, 0.2, 0.4)), 'inside the arc: in the sweep');
assert.ok(metArc(boxAt(0.7, 0.45, 0.2, 0.4)), 'at the arc\'s edge: in the sweep');
assert.ok(!metArc(boxAt(0.7, Math.PI / 2, 0.2, 0.4)), 'a quarter turn round, outside the arc: clear');
assert.ok(!metArc(boxAt(0.7, Math.PI, 0.2, 0.4)), 'astern, outside the arc: clear');
assert.ok(metArc(boxAt(0.15, Math.PI, 0.2, 0.4, 0.03)), 'at the axis the station\'s own turning stock sweeps every bearing');
// a station of another frame is not this frame's
const hull = new THREE.Group(), turret = new THREE.Group();
hull.add(turret);
turret.add(madeStation().frame);
hull.updateMatrixWorld(true);
assert.equal(stationSweepKeepOut(hull, [hull, turret], 'made_vehicle').length, 0, 'a turret station is not reserved in the hull frame');
assert.equal(stationSweepKeepOut(turret, [hull, turret], 'made_vehicle').length, 1, 'it is reserved in the turret frame');

console.log(`roofStationKeepOut: no tank carries decor inside a roof station's traverse (${Object.keys(DECOR_IN_STATION_ARCS).length} `
  + 'entries); the made station\'s sweep holds the circle, the depression, the elevation and the receiver, frees the deck and the air, keeps its arc');
