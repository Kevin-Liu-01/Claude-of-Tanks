// Release 274 (the owner, 2026-11-21: "for floodlights or whatever lights these are, and the one on the kaitaku, for those
// lights they have to turn on when you press N! and there should actually be lights there. same for the m40s and m48s
// that have em. audit"): every drawn searchlight, floodlight and IR lamp is a night searchlight (vehicleNightLighting.ts).
// Per id: its searchlights register, each is lit at rest (a lamp on the gun mount or the turret is never held dark by the
// remote stations' own-gun mask, which blanked every Luna drum beside its gun for good), and each shows its glass from
// straight ahead (the Kaitaku's floodlight lens stood 5 mm inside its own bezel). The decor roof drum's glass is a
// searchlight lens, and a searchlight's own cone is a searchlight's only.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { buildSearchlight } from './accessoryKits.ts';
import { markVehicleNightLens, vehicleNightLensFrames, vehicleNightLightEmittersFor, SEARCHLIGHT_CONE_RAD } from './vehicleNightLighting.ts';
import { NIGHT_EMISSION_ATTRIBUTE } from '../engine/nightEmissionMaterial.ts';

/** Each pinned id's searchlight count: the lane's own lamps and one of each kind it marked. */
const SEARCHLIGHTS = {
  type10_dozer: 2, // the 7.62 station's illuminator and the floodlight beside the gun
  m48a5_patton: 1, m60a1: 1, m48a2ga2: 1, m60a2: 1, // the AN/VSS-1 and -3, the GA2's square light, covers off
  t80u_husarz: 1, // a gun floodlight beside the gun (addGunFloodlight), masked dark before 274
  t62_1975: 2, // the L-2G Luna and the commander's OU-3GK
  t72bu: 1, // the commander's OU-3GA2M, its dark lens marked in place
  bmp3: 2, // the commander's OU-3GA2 and the gunner's lamp, on roof-sight fittings
  t72b3_zubr_ii: 1, // the remote station's illuminator, still under the own-gun mask
};
/** The share of a lens's sampled aperture seen from 0.5 m along its beam (guard bars may cross it). */
const MIN_SEEN = .4;

const ray = new THREE.Raycaster();
for (const [id, expected] of Object.entries(SEARCHLIGHTS)) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality: 'high', camoSeed: 4242 });
  try {
    tank.root.updateMatrixWorld(true);
    const meshes = [];
    tank.root.traverse((o) => { if (o.isMesh && !o.userData.shadowOnly) meshes.push(o); });
    let count = 0;
    tank.root.traverse((owner) => {
      const lamps = vehicleNightLightEmittersFor(owner);
      const mask = owner.geometry?.getAttribute(NIGHT_EMISSION_ATTRIBUTE), position = owner.geometry?.getAttribute('position');
      for (const lamp of lamps) {
        if (!lamp.searchlight) continue;
        count++;
        const label = `${id} ${owner.name} searchlight`;
        assert.ok(!lamp.isActive || lamp.isActive(), `${label}: lit at rest`);
        // its aperture: the masked vertices nearer this lamp than any other of the owner's, pulled 30 % to its seat
        const seat = new THREE.Vector3().fromArray(lamp.position), samples = [seat.clone()], v = new THREE.Vector3();
        for (let i = 0; i < position.count; i++) {
          if (!(mask.getX(i) > 0)) continue;
          v.fromBufferAttribute(position, i);
          const d = v.distanceTo(seat);
          if (d < .36 && lamps.every((other) => other === lamp || v.distanceTo(new THREE.Vector3().fromArray(other.position)) >= d)) {
            samples.push(v.clone().lerp(seat, .3));
          }
        }
        assert.ok(samples.length > 3, `${label}: its masked aperture is found`);
        const aim = new THREE.Vector3().fromArray(lamp.direction).transformDirection(owner.matrixWorld);
        let seen = 0;
        for (const sample of samples) {
          const at = sample.applyMatrix4(owner.matrixWorld);
          ray.set(at.clone().addScaledVector(aim, .5), aim.clone().negate()); ray.far = .496;
          if (!ray.intersectObjects(meshes, false).length) seen++;
        }
        assert.ok(seen / samples.length >= MIN_SEEN, `${label}: its glass shows from ahead (${seen} of ${samples.length})`);
        if (id === 'type10_dozer' && !owner.name.includes('_pitch_')) assert.equal(lamp.coneRad, .2, `${label}: the floodlight's broad cone`);
      }
    });
    assert.equal(count, expected, `${id}: its searchlights`);
  } finally {
    tank.dispose?.();
  }
}

// the decor roof drum (accessoryKits.ts buildSearchlight): its glass is a searchlight lens, its seat on the drum's axis
for (const v of ['ir_large', 'ir_small']) {
  const lenses = [];
  const painter = new Proxy({ detail: 1 }, { get: (target, key) => key in target ? target[key]
    : key === 'lens' ? (g) => lenses.push(g) : () => {} });
  buildSearchlight(painter, v, 1);
  const frames = vehicleNightLensFrames(lenses);
  assert.equal(frames?.length, 1, `decor ${v}: one lamp`);
  assert.ok(frames[0].searchlight && frames[0].direction[2] > .99, `decor ${v}: a searchlight aimed along its drum`);
}

// a searchlight's own cone: a searchlight's only, defaulting to the pencil beam
assert.throws(() => markVehicleNightLens(new THREE.CylinderGeometry(.1, .1, .01).rotateX(Math.PI / 2), 'headlight', { coneRad: .2 }), /searchlight/);
assert.equal(SEARCHLIGHT_CONE_RAD, .11);
console.log(`searchlightCoverage: ${Object.keys(SEARCHLIGHTS).length} ids' searchlights registered, lit at rest and seen from ahead; the decor drum's lens: PASS`);
