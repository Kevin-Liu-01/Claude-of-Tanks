import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { buildOplotModern, OPLOT_FRAME } from './oplotModern.ts';
import { getSpec } from '../specs.ts';
import { createTankState } from '../../sim/movement.ts';

// Main's owner-directed Oplot rebuild (2026-10-02, 245aa4e4e, src/vehicles/profiles/oplotModern.ts) retired the KMDB
// welded/Duplet turret this receipt used to describe: its t84OplotTurretReceipt, 16 cheek and 8 flank cassettes, and
// paneled bustle no longer exist. The T-84 now carries the T-72B3M obr. 2016 hull and a new angular welded turret:
// one sectioned body, two closed cheeks either side of a 0.80 m gun opening, three cheek and three flank reactive
// cassettes per side, a roof station and a rear cage. The receipt checks that design on the real geometry:
// articulated ownership, the rebuild record and frames, discrete cassette lids, an open gun channel at every legal
// elevation, cheeks closed onto the body, the rear station, and every cassette seated on the structural shell.
const id = 't84';
const cassettes = [];
registerProfiledBuilders({ [id](P) {
  const addExternalArmor = P.addExternalArmor;
  P.addExternalArmor = (owner, geometry, ...transform) => {
    // eraCassette bodies carry marked hit faces; their lids are furniture (no hit faces)
    if (owner === 'turret' && geometry.userData.eraHitFaceVertexStarts?.length) {
      geometry.computeBoundingBox();
      cassettes.push({ size: geometry.boundingBox.getSize(new THREE.Vector3()).toArray(), transform: [...transform] });
    }
    return addExternalArmor(owner, geometry, ...transform);
  };
  buildOplotModern(P);
} });
let tank;
try {
  tank = createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
} finally {
  registerProfiledBuilders({ [id]: buildOplotModern });
}

try {
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  const turret = turretRig?.getObjectByName('turret');
  const turretDark = turretRig?.getObjectByName('turretDark');
  const turretExternalArmor = turretRig?.getObjectByName('turretExternalArmor');
  const gunMount = gunRig?.getObjectByName('gunMount');
  assert.ok(turretRig && gunRig && turret?.isMesh && turretDark?.isMesh && turretExternalArmor?.isMesh && gunMount?.isMesh,
    'T-84 keeps structural turret, ERA detail and gun geometry on articulated rigs');
  assert.ok(turret.position.lengthSq() === 0 && turret.scale.x === 1, 'merged turret stock is authored in the turret frame');

  // Rebuild record and frames.
  assert.deepEqual(turretRig.userData.oplotRebuild, { donorHull: 't72b3m_x', revision: 'angular-20261002', gunOpeningM: .80 },
    'T-84 exposes its angular rebuild record');
  assert.deepEqual(turretRig.position.toArray(), [...OPLOT_FRAME.turret], 'turret ring at the rebuilt frame');
  assert.deepEqual(gunRig.position.toArray(), [...OPLOT_FRAME.gun], 'gun trunnion at the rebuilt frame');
  const spec = getSpec(id);
  assert.deepEqual(spec.armor.turretPivot, [...OPLOT_FRAME.turret], 'hit frame and installed ring agree');

  // Discrete reactive cassettes: six cheek and six flank bodies, each with its own lid face.
  const side = (c) => c.size[0] < c.size[1] && c.size[0] < c.size[2];
  assert.equal(cassettes.filter(side).length, 6, 'three flank cassettes on each side');
  assert.equal(cassettes.filter((c) => !side(c)).length, 6, 'three cheek cassettes on each side');
  const position = turretExternalArmor.geometry.getAttribute('position');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const cheekLidNormal = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(.25, 0, 0));
  let cheekLidTriangles = 0, flankLidTriangles = 0;
  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index); b.fromBufferAttribute(position, index + 1); c.fromBufferAttribute(position, index + 2);
    n.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    // lid faces: 94% of the cassette's receiving face, 10 mm proud of it
    if (Math.abs(area - .205 * .94 * .17 * .94 / 2) < 2e-4 && n.dot(cheekLidNormal) > .999
      && Math.abs(centroid.x) > .45 && Math.abs(centroid.x) < 1.25 && centroid.z > 1.3 && centroid.z < 1.75) cheekLidTriangles++;
    if (Math.abs(area - .43 * .94 * .39 * .94 / 2) < 2e-4 && Math.abs(n.x) > .999 && Math.sign(n.x) === Math.sign(centroid.x)
      && Math.abs(Math.abs(centroid.x) - 1.54) < .002 && centroid.z > -1.7 && centroid.z < -.4) flankLidTriangles++;
  }
  assert.equal(cheekLidTriangles, 12, `all six cheek cassette lids remain discrete (${cheekLidTriangles} face triangles)`);
  assert.equal(flankLidTriangles, 12, `all six flank cassette lids remain discrete (${flankLidTriangles} face triangles)`);

  // Open gun channel: the pitching cover stays between the cheeks' inner faces at every legal elevation.
  const halfOpening = turretRig.userData.oplotRebuild.gunOpeningM / 2;
  const cheekSpan = [.28, 1.63];
  const state = createTankState(spec, new THREE.Vector3(), 0);
  const coverClears = () => {
    const p = gunMount.geometry.getAttribute('position'), point = new THREE.Vector3();
    let widest = 0;
    for (const degrees of [-spec.gunDepressionDeg, 0, spec.gunElevationDeg]) {
      state.gunPitch = THREE.MathUtils.degToRad(degrees);
      tank.syncFromState(state, 1);
      tank.root.updateMatrixWorld(true);
      const toTurret = turretRig.matrixWorld.clone().invert().multiply(gunMount.matrixWorld);
      for (let i = 0; i < p.count; i++) {
        point.fromBufferAttribute(p, i).applyMatrix4(toTurret);
        if (point.z > cheekSpan[0] && point.z < cheekSpan[1]) widest = Math.max(widest, Math.abs(point.x));
      }
    }
    state.gunPitch = 0; tank.syncFromState(state, 1); tank.root.updateMatrixWorld(true);
    assert.ok(widest > .3 && widest < halfOpening, `the pitching cover stays inside the ${halfOpening * 2} m opening (${widest})`);
  };
  coverClears();
  gunMount.geometry.scale(1.1, 1, 1);
  assert.throws(coverClears, assert.AssertionError, 'a cover wider than the opening is rejected');
  gunMount.geometry.scale(1 / 1.1, 1, 1);
  coverClears();

  // The structural stock: closed shell parity and closest distance, in the turret frame.
  const shell = new THREE.Mesh(turret.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const crossings = (origin, direction, far) => {
    const hits = new THREE.Raycaster(origin, direction, 0, far).intersectObject(shell, false), seen = new Set(), rows = [];
    for (const hit of hits) {
      const entering = hit.face.normal.dot(direction) < 0, key = `${Math.round(hit.distance * 1e6)}:${entering}`;
      if (!seen.has(key)) { seen.add(key); rows.push({ distance: hit.distance, delta: entering ? 1 : -1 }); }
    }
    return rows.sort((u, v) => u.distance - v.distance);
  };
  const winding = (point) => {
    const direction = new THREE.Vector3(.31, .53, .79).normalize();
    return crossings(point.clone().addScaledVector(direction, -9), direction, 9).reduce((depth, row) => depth + row.delta, 0);
  };
  const inside = (point) => winding(point) > 0;
  const triangle = new THREE.Triangle(), closest = new THREE.Vector3(), shellPosition = turret.geometry.getAttribute('position');
  const shellIndex = turret.geometry.index;
  const distanceToShell = (point) => {
    let best = Infinity;
    for (let i = 0; i < (shellIndex?.count ?? shellPosition.count); i += 3) {
      const at = (k) => new THREE.Vector3().fromBufferAttribute(shellPosition, shellIndex ? shellIndex.getX(i + k) : i + k);
      triangle.set(at(0), at(1), at(2)).closestPointToPoint(point, closest);
      best = Math.min(best, closest.distanceTo(point));
    }
    return best;
  };

  // Cheeks closed onto the body: along the flank, structural stock runs without air from the body into each cheek.
  for (const x of [-.9, .9]) {
    const origin = new THREE.Vector3(x, .3, -.6), direction = new THREE.Vector3(0, 0, 1);
    let depth = winding(origin);
    assert.ok(depth > 0, `body stock behind the ${x < 0 ? 'left' : 'right'} cheek`);
    let reached = false;
    for (const row of crossings(origin, direction, 2.5)) {
      if (-.6 + row.distance >= cheekSpan[1] - 1e-3) { reached = true; break; }
      depth += row.delta;
      assert.ok(depth > 0, `${x < 0 ? 'left' : 'right'} cheek joins the body without air (z ${(-.6 + row.distance).toFixed(3)})`);
    }
    assert.ok(reached, `${x < 0 ? 'left' : 'right'} cheek stock runs to its ${cheekSpan[1]} m front face`);
  }

  // Rear station: the closed bustle reaches the hit frame's rear turret station.
  turret.geometry.computeBoundingBox();
  assert.ok(turret.geometry.boundingBox.min.z <= -2.15 + .01, 'closed bustle reaches the -2.15 m rear station');

  for (const yaw of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    turretRig.rotation.y = yaw;
    tank.root.updateMatrixWorld(true);
    assert.equal(gunRig.parent, turretRig, `gun remains turret-owned through yaw ${yaw}`);
    assert.equal(turret.parent, turretRig, `structural bustle remains turret-owned through yaw ${yaw}`);
  }
  turretRig.rotation.y = 0;
  tank.root.updateMatrixWorld(true);

  // Every reactive cassette sits on the structural shell: the centre of its inboard face (the face opposite its lid)
  // lies inside the closed turret stock or within 4 mm of it. Checked last, so every other invariant above has run.
  const seatGap = (cassette) => {
    const [w, h] = cassette.size, [x, y, z, rx = 0, ry = 0, rz = 0] = cassette.transform;
    const inboard = (side(cassette) ? new THREE.Vector3(-Math.sign(x) * w / 2, 0, 0) : new THREE.Vector3(0, -h / 2, 0))
      .applyEuler(new THREE.Euler(rx, ry, rz)).add(new THREE.Vector3(x, y, z));
    return inside(inboard) ? 0 : distanceToShell(inboard);
  };
  // Seeded defect: a seated cheek cassette lifted clear of its cheek (0.25 m along its own normal) reads as unseated.
  const cheek = cassettes.find((cassette) => !side(cassette));
  assert.equal(seatGap(cheek), 0, 'the first cheek cassette is embedded in its cheek');
  const [cx, cy, cz, ...rotation] = cheek.transform;
  const lift = new THREE.Vector3(0, .25, 0).applyEuler(new THREE.Euler(...rotation));
  assert.ok(seatGap({ ...cheek, transform: [cx + lift.x, cy + lift.y, cz + lift.z, ...rotation] }) > .004,
    'a cassette lifted off the shell is reported unseated');
  const unseated = [];
  for (const cassette of cassettes) {
    const gap = seatGap(cassette), [x, y, z] = cassette.transform;
    if (gap > .004) unseated.push(`${side(cassette) ? 'flank' : 'cheek'} cassette at (${[x, y, z].map((v) => v.toFixed(3)).join(', ')}) stands ${(gap * 1000).toFixed(0)} mm off the shell`);
  }
  assert.deepEqual(unseated, [], `every reactive cassette is seated on the structural turret:\n  ${unseated.join('\n  ')}`);
} finally {
  tank.dispose();
}

console.log('t84OplotTurret.selftest: angular rebuild record, discrete cassette lids, open gun channel, closed cheeks, rear station and seated cassettes verified');
