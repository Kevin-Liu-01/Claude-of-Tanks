import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { addVehicleGhillieSuit, GHILLIE_SUIT_CONFIGS } from './ghillieSuit.ts';
import { FLEET_GHILLIE_SUITS } from './ghillieFleetSuits.ts';
import { applyCamoPatterns, setCamoOverride } from './materials.ts';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

const ids = [
  'ua_t64bv', 'pt91_twardy', 'm1a2_sepv3',
  'strv103a', 'strv103', 't84', 'ua_m1a1', 'leo2a6_ua',
];

// 2026-10-09 (owner: "add ... a ton more netting and camo leaves all over ... t90-AM"): the T-90AM carries a fleet field
// net (ghillieFleetSuits.ts) and left this control list; the others stay net-free
for (const id of ['t90a', 'strv122', 'ua_t84_oplot_m']) {
  const control = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
    quality: 'high',
  });
  assert.equal(control.root.getObjectByName(`${id}_ghillie_hull_net`), undefined,
    `${id} remains net-free instead of inheriting a generic family blanket`);
  control.dispose();
}

function belongsTo(object, parent) {
  for (let node = object; node; node = node.parent) if (node === parent) return true;
  return false;
}

// Round 5 (2026-10-08, the lane lead: "make the new suits seat or hang from real support; no garnish or leaf pieces
// should float clear of the net or the hull"): every garnish card (one connected piece of a leaves mesh) has a vertex
// within 15 mm of its owner's net or armour, and every net piece rests on or hangs from the armour within 15 mm.
const TOUCH_M = 0.015;
function ownerTriangles(rig, skipRig, predicate) {
  const tris = [];
  const a = new THREE.Vector3();
  rig.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position || !predicate(o)) return;
    for (let p = o; p && p !== rig; p = p.parent) if (skipRig && p === skipRig) return;
    for (let p = o; p; p = p.parent) if (p.parent?.isLOD && p.parent.levels.findIndex((l) => l.object === p) > 0) return;
    const pos = o.geometry.attributes.position, index = o.geometry.index, n = index ? index.count : pos.count;
    const w = [];
    for (let k = 0; k < n; k++) w.push(a.fromBufferAttribute(pos, index ? index.getX(k) : k).applyMatrix4(o.matrixWorld).clone());
    for (let k = 0; k + 2 < n; k += 3) tris.push([w[k], w[k + 1], w[k + 2]]);
  });
  const grid = new Map();
  const cell = 0.1;
  tris.forEach((t, i) => {
    const box = new THREE.Box3().setFromPoints(t);
    for (let x = Math.floor(box.min.x / cell); x <= Math.floor(box.max.x / cell); x++)
      for (let y = Math.floor(box.min.y / cell); y <= Math.floor(box.max.y / cell); y++)
        for (let z = Math.floor(box.min.z / cell); z <= Math.floor(box.max.z / cell); z++) {
          const key = `${x},${y},${z}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(i);
        }
  });
  const tri = new THREE.Triangle(), closest = new THREE.Vector3();
  return (points) => {
    let best = Infinity;
    for (const v of points) {
      // the point's cell and its neighbours: a triangle just across a cell boundary is still within reach
      const cx = Math.floor(v.x / cell), cy = Math.floor(v.y / cell), cz = Math.floor(v.z / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const i of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
          tri.set(...tris[i]); tri.closestPointToPoint(v, closest);
          best = Math.min(best, v.distanceTo(closest));
          if (best <= TOUCH_M) return best;
        }
      }
    }
    return best;
  };
}
/** Distance from points to a net's triangles outside one of its pieces (a drape hangs from the roof net it rolls off). */
function otherPieces(mesh, pieceList) {
  const owner = new Map();
  pieceList.forEach((piece, i) => { for (const v of piece) owner.set(`${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`, i); });
  const pos = mesh.geometry.attributes.position;
  const tris = [];
  for (let k = 0; k + 2 < pos.count; k += 3) {
    const t = [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(pos, k + j).applyMatrix4(mesh.matrixWorld));
    tris.push({ t, piece: owner.get(`${t[0].x.toFixed(4)},${t[0].y.toFixed(4)},${t[0].z.toFixed(4)}`) });
  }
  const tri = new THREE.Triangle(), closest = new THREE.Vector3();
  return (points, self) => {
    let best = Infinity;
    for (const v of points) for (const { t, piece } of tris) {
      if (piece === self) continue;
      tri.set(...t); tri.closestPointToPoint(v, closest);
      best = Math.min(best, v.distanceTo(closest));
      if (best <= TOUCH_M) return best;
    }
    return best;
  };
}
/** Connected pieces of a non-indexed mesh, welded by position, as world-space vertex lists. */
function pieces(mesh) {
  const pos = mesh.geometry.attributes.position, n = pos.count;
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const welded = new Map();
  for (let i = 0; i < n; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    if (welded.has(key)) parent[find(i)] = find(welded.get(key)); else welded.set(key, i);
  }
  for (let t = 0; t + 2 < n; t += 3) { parent[find(t + 1)] = find(t); parent[find(t + 2)] = find(t); }
  const out = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!out.has(r)) out.set(r, []);
    out.get(r).push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
  }
  return [...out.values()];
}
function suitContact(tank, id) {
  const report = [];
  for (const owner of ['hull', 'turret', 'gun']) {
    const rig = tank.root.getObjectByName(`rig_${owner}`);
    const net = tank.root.getObjectByName(`${id}_ghillie_${owner}_net`);
    const leaves = tank.root.getObjectByName(`${id}_ghillie_${owner}_leaves`);
    if (!rig || !net) continue;
    const skip = owner === 'hull' ? tank.root.getObjectByName('rig_turret') : owner === 'turret' ? tank.root.getObjectByName('rig_gun') : null;
    const armour = ownerTriangles(rig, skip, (o) => !/_ghillie_|procShadow|InteriorFill/.test(o.name));
    const netTris = ownerTriangles(rig, null, (o) => o === net);
    const netPieces = pieces(net);
    const hangsFrom = otherPieces(net, netPieces);
    for (const [index, piece] of netPieces.entries()) {
      // rests on the armour, or hangs from another piece of its net that does (a drape rolling off the roof net)
      let gap = armour(piece);
      if (gap > TOUCH_M) gap = Math.min(gap, hangsFrom(piece, index));
      if (gap > TOUCH_M) {
        const box = new THREE.Box3().setFromPoints(piece), f = (v) => v.toArray().map((x) => x.toFixed(2)).join(',');
        report.push(`${owner} net piece of ${piece.length} vertices (${f(box.min)} .. ${f(box.max)}): nearest armour ${(gap * 100).toFixed(1)} cm`);
      }
    }
    if (!leaves) continue;
    for (const card of pieces(leaves)) {
      const gap = Math.min(netTris(card), armour(card));
      if (gap > TOUCH_M) report.push(`${owner} garnish card at ${card[0].toArray().map((v) => v.toFixed(2)).join(',')}: nearest ${(gap * 100).toFixed(1)} cm`);
    }
  }
  return report;
}

for (const id of ids) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
    quality: 'high',
  });
  tank.root.updateMatrixWorld(true);
  const hullRig = tank.root.getObjectByName('rig_hull');
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  assert.ok(hullRig && turretRig && gunRig, `${id} retains canonical hull/turret/gun rigs`);
  const cfg = GHILLIE_SUIT_CONFIGS[id];

  for (const owner of ['hull', 'turret', 'gun']) {
    if (!cfg[owner]) continue;
    const rig = owner === 'hull' ? hullRig : owner === 'turret' ? turretRig : gunRig;
    // 2026-10-05 (tank-accessories lane): the garnish is one spray-card draw per owner (vehicleFoliage.ts)
    const expectedLayers = cfg.foliage === false ? ['net'] : ['net', 'leaves'];
    for (const layer of expectedLayers) {
      const name = `${id}_ghillie_${owner}_${layer}`;
      const mesh = tank.root.getObjectByName(name);
      assert.ok(mesh?.isMesh && mesh.geometry, `${name} is a merged equipment mesh`);
      assert.ok(belongsTo(mesh, rig), `${name} follows its canonical owner rig`);
      assert.ok(mesh.geometry.getAttribute('position').count > 120,
        `${name} is detailed geometry, not a token rectangle`);
    }
    if (cfg.foliage === false) {
      for (const layer of ['leaves']) {
        assert.equal(tank.root.getObjectByName(`${id}_ghillie_${owner}_${layer}`), undefined,
          `${id} keeps the carrier net but has no artificial leaf layer`);
      }
    }
  }

  const floating = suitContact(tank, id);
  assert.deepEqual(floating, [], `${id} suit pieces touch nothing within ${TOUCH_M * 1000} mm:\n  ${floating.join('\n  ')}`);

  const hullNet = tank.root.getObjectByName(`${id}_ghillie_hull_net`);
  const hullBounds = new THREE.Box3().setFromObject(hullNet);
  assert.ok(hullBounds.min.y > 0.52, `${id} ghillie stays above the live track corridor`);
  if (id === 'ua_t64bv') {
    // 2026-10-01: the owner's Donbas rebuild (cdbfe54dc, "ua_t64bv with supported foliage, net and cages";
    // profiles/donbasFieldCover.ts) replaced the deck-wide blanket with supported flank drapes over the five side
    // ERA cassettes (z -1.9..1.7 on the t72b3_x hull) and a bustle cover behind the open sights and hatches.
    const cover = turretRig.userData.fieldCover;
    assert.deepEqual(cover, { supported: true, sightsOpen: true, hatchesOpen: true, revision: 1 },
      `${id} field cover is carried on real rails with sights and hatches open`);
    assert.ok(hullBounds.min.x < -1.7 && hullBounds.max.x > 1.7, `${id} drapes hang on both flanks`);
    assert.ok(hullBounds.min.z <= -1.9 && hullBounds.max.z >= 1.7,
      `${id} flank drapes run past every side cassette instead of one selected panel`);
  } else {
    assert.ok(hullBounds.max.z - hullBounds.min.z > 5.5,
      `${id} hull blanket spans the vehicle instead of one selected panel`);
  }

  if (cfg.turret) {
    const turretNet = tank.root.getObjectByName(`${id}_ghillie_turret_net`);
    // The exact center of each authored face is the reserved cannon corridor.
    // A forward-to-rear ray may meet bustle cloth, but never the front face.
    const gunWorldY = turretRig.position.y + 0.38;
    const hits = new THREE.Raycaster(
      new THREE.Vector3(0, gunWorldY, 8), new THREE.Vector3(0, 0, -1), 0, 14,
    ).intersectObject(turretNet, false);
    assert.ok(hits.every((hit) => hit.point.z < turretRig.position.z - 0.72),
      `${id} leaves the complete mantlet/gun corridor open`);
  }

  if (id === 't84') {
    const net=tank.root.getObjectByName('t84_ghillie_turret_net'),hard=[];
    turretRig.traverse(o=>{if(o.isMesh&&!/ghillie|Fill|Shadow|Decal/i.test(o.name))hard.push(o)});
    for(const [x,z] of [[0,-.9],[0,-1.73],[.74,.62]]){
      const origin=turretRig.localToWorld(new THREE.Vector3(x,2,z));
      const probe=new THREE.Raycaster(origin,new THREE.Vector3(0,-1,0),0,3);
      const cloth=probe.intersectObject(net)[0],seat=probe.intersectObjects(hard)[0];
      assert(cloth&&seat,'Oplot cloth has actual roof or stowage beneath it');
      const gap=cloth.point.y-seat.point.y;
      assert(gap>.005&&gap<.055,`Oplot cloth stays seated on the rebuilt hard surface (${gap}m)`);
    }
    // Live gunner lens and roof-MG muzzle have a clear forward view/fire lane.
    const cover=[];turretRig.traverse(o=>{if(o.isMesh&&/ghillie/.test(o.name))cover.push(o)});
    for(const point of [[-.56,1.035,-.16],[.52,1.21,.31]]){
      const probe=new THREE.Raycaster(turretRig.localToWorld(new THREE.Vector3(...point)),new THREE.Vector3(0,0,1),0,8);
      assert.equal(probe.intersectObjects(cover).length,0,'Oplot foliage leaves working roof equipment clear');
    }
    const local=new THREE.Vector3().fromBufferAttribute(net.geometry.getAttribute('position'),0);
    const rest=net.localToWorld(local.clone());
    turretRig.rotation.y=1.4;tank.root.updateMatrixWorld(true);
    assert(net.localToWorld(local.clone()).distanceTo(rest)>.4,'bustle net turns with the turret');
    turretRig.rotation.y=0;tank.root.updateMatrixWorld(true);
  }

  if (cfg.gun) {
    // 2026-10-08 (round 5; the coordinator after wave 269 on the Leopard 2A6 UA: the barrel "left mostly clear (real
    // crews wrap only short sections)"): the gun carries short wraps along the tube, never a sleeve the length of it
    const gunNet = tank.root.getObjectByName(`${id}_ghillie_gun_net`);
    const gunBounds = new THREE.Box3().setFromObject(gunNet);
    const toGun = new THREE.Matrix4().copy(gunRig.matrixWorld).invert(), at = gunNet.geometry.getAttribute('position');
    const wrapped = new Set();
    for (let i = 0; i < at.count; i++) {
      wrapped.add(Math.floor(new THREE.Vector3().fromBufferAttribute(at, i).applyMatrix4(gunNet.matrixWorld).applyMatrix4(toGun).z / 0.05));
    }
    assert.ok(wrapped.size * 0.05 > 0.5 && wrapped.size * 0.05 <= 1.4,
      `${id} wraps short sections of the tube (${(wrapped.size * 0.05).toFixed(2)} m), its bore open`);
    assert.ok(gunBounds.max.z < tank.root.getObjectByName('rig_muzzle').getWorldPosition(new THREE.Vector3()).z,
      `${id} gun shroud stops behind the live muzzle anchor`);
  }

  tank.dispose();
}

// the suits with their own receipts (the A4) or their own field configs (the Ukrainian national rebuilds, push 3:
// nationalUkraineProtection.ts) are held to the same contact rule
for (const id of ['leo2a4', 'ua_t72b3m_hetman_ii', 'ua_t72b3_modern', 'ua_t80u_modern', 'ua_t72b3m_modern']) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality: 'high' });
  tank.root.updateMatrixWorld(true);
  const floating = suitContact(tank, id);
  assert.deepEqual(floating, [], `${id} suit pieces touch nothing within ${TOUCH_M * 1000} mm:\n  ${floating.join('\n  ')}`);
  tank.dispose();
}

// 2026-10-08 (round 5; the lane lead on push 3b's field roof cage: "the turret-roof net must not pass through the cage
// bars or legs"; "drape the net over the cage top and let it fall over the wing edges, the way Ukrainian crews hang nets
// on cope cages. Keep the central hatch, sight and weapon corridor open"): every suited hull with main's roof cage
// carries a net on each wing's lattice that hangs over the wing's outer tube, nothing of it reaches in over the corridor
// between the wings, and no suit triangle (net or garnish) passes into a tube or leg of the cage.
{
  // the cage's tubes, wing by wing, by fieldRoofCage.ts's rule (kept apart from the builder's own copy)
  const cageOf = (wing) => {
    const [c0, c1, c2] = wing.corners;
    const s = c0[0] < 0 ? -1 : 1, inner = Math.abs(c0[0]), outer = Math.abs(c1[0]), y = c0[1];
    const z0 = Math.min(c0[2], c2[2]), z1 = Math.max(c0[2], c2[2]);
    // a leg is a flat-ended tube up to the lattice's tube line (the frame and rows carry on above it)
    const tubes = wing.feet.map(([x, base, z]) => ({ a: [x, base + 0.01, z], b: [x, y - 0.021, z], r: 0.021 }));
    for (let i = 0; i < 4; i++) tubes.push({ a: wing.corners[i], b: wing.corners[(i + 1) % 4], r: 0.019 });
    const rows = Math.ceil((z1 - z0) / 0.145);
    for (let i = 1; i < rows; i++) { const z = z0 + ((z1 - z0) * i) / rows; tubes.push({ a: [s * inner, y, z], b: [s * outer, y, z], r: 0.008 }); }
    for (let i = 1; i < 4; i++) { const x = s * (inner + ((outer - inner) * i) / 4); tubes.push({ a: [x, y, z0], b: [x, y, z1], r: 0.008 }); }
    const braceX = Math.max(...wing.feet.map((f) => Math.abs(f[0])));
    for (const z of new Set(wing.feet.map((f) => f[2]))) tubes.push({ a: [s * braceX, y - 0.12, z], b: [s * outer, y, z], r: 0.012 });
    return { s, inner, outer, y, z0, z1, tubes: tubes.map((t) => ({ a: new THREE.Vector3(...t.a), b: new THREE.Vector3(...t.b), r: t.r })) };
  };
  // closest distance between segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection 5.1.9)
  const segmentGap = (p1, q1, p2, q2) => {
    const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
    const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
    let s = 0, t = 0;
    if (a <= 1e-12 && e <= 1e-12) return r.length();
    if (a <= 1e-12) t = THREE.MathUtils.clamp(f / e, 0, 1);
    else {
      const c = d1.dot(r);
      if (e <= 1e-12) s = THREE.MathUtils.clamp(-c / a, 0, 1);
      else {
        const b = d1.dot(d2), denom = a * e - b * b;
        s = denom > 1e-12 ? THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
      }
    }
    return p1.clone().addScaledVector(d1, s).distanceTo(p2.clone().addScaledVector(d2, t));
  };
  for (const id of ['ua_t72b3m_hetman_ii', 'ua_t72b3_modern', 'ua_t80u_modern', 'ua_t72b3m_modern']) {
    const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality: 'high' });
    tank.root.updateMatrixWorld(true);
    const turret = tank.root.getObjectByName('rig_turret');
    const record = turret.userData.fieldRoofCage;
    assert.ok(Array.isArray(record) && record.length === 2, `${id} carries push 3b's two-wing roof cage`);
    const toTurret = new THREE.Matrix4().copy(turret.matrixWorld).invert();
    const local = (name) => {
      const mesh = tank.root.getObjectByName(name);
      assert.ok(mesh?.isMesh, `${name} is built`);
      const m = toTurret.clone().multiply(mesh.matrixWorld), pos = mesh.geometry.attributes.position, index = mesh.geometry.index;
      const n = index ? index.count : pos.count, out = [];
      for (let k = 0; k < n; k++) out.push(new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(k) : k).applyMatrix4(m));
      return out;
    };
    const net = local(`${id}_ghillie_turret_net`), leaves = local(`${id}_ghillie_turret_leaves`);
    // a wing the roof gun traverses low over is left bare for its field of fire (nationalRoof.selftest holds the sweep
    // clear of the suit); every other wing carries its net
    let netted = 0;
    for (const wing of record.map(cageOf)) {
      const over = net.filter((v) => wing.s * v.x > wing.inner && wing.s * v.x < wing.outer && v.z > wing.z0 && v.z < wing.z1
        && v.y > wing.y + 0.004 && v.y < wing.y + 0.1).length;
      if (over >= 40) {
        netted++;
        const hanging = net.filter((v) => wing.s * v.x > wing.outer + 0.01 && wing.s * v.x < wing.outer + 0.12
          && v.z > wing.z0 && v.z < wing.z1 && v.y < wing.y - 0.08 && v.y > wing.y - 0.45).length;
        assert.ok(hanging >= 10, `${id} hangs the wing's net over its outer tube (${hanging} vertices below it)`);
      }
      // this wing's half of the corridor: from the centre line out to 3 cm inside its inner tube
      const inward = net.filter((v) => wing.s * v.x > -0.02 && wing.s * v.x < wing.inner - 0.03 && v.y > wing.y - 0.05
        && v.z > wing.z0 - 0.05 && v.z < wing.z1 + 0.05).length;
      assert.equal(inward, 0, `${id} keeps the corridor inboard of its ${wing.s > 0 ? 'left' : 'right'} wing open`);
      const lo = new THREE.Vector3(Math.min(wing.s * wing.inner, wing.s * wing.outer) - 0.1, -Infinity, wing.z0 - 0.1);
      const hi = new THREE.Vector3(Math.max(wing.s * wing.inner, wing.s * wing.outer) + 0.1, wing.y + 0.1, wing.z1 + 0.1);
      const crossings = [];
      for (const [layer, verts] of [['net', net], ['garnish', leaves]]) {
        for (let k = 0; k + 2 < verts.length; k += 3) {
          const t = [verts[k], verts[k + 1], verts[k + 2]];
          if (t.every((v) => v.x < lo.x) || t.every((v) => v.x > hi.x) || t.every((v) => v.y > hi.y)
            || t.every((v) => v.z < lo.z) || t.every((v) => v.z > hi.z)) continue;
          for (const tube of wing.tubes) {
            const edge = [[0, 1], [1, 2], [2, 0]].some(([i, j]) => segmentGap(t[i], t[j], tube.a, tube.b) < tube.r - 0.001);
            const dir = tube.b.clone().sub(tube.a), len = dir.length();
            const hit = new THREE.Ray(tube.a, dir.normalize()).intersectTriangle(t[0], t[1], t[2], false, new THREE.Vector3());
            if (edge || (hit && hit.distanceTo(tube.a) <= len)) {
              crossings.push(`${layer} at ${t[0].toArray().map((v) => v.toFixed(3)).join(',')} through the tube ${tube.a.toArray().map((v) => v.toFixed(2)).join(',')} -> ${tube.b.toArray().map((v) => v.toFixed(2)).join(',')}`);
              break;
            }
          }
        }
      }
      assert.deepEqual(crossings.slice(0, 8), [], `${id}: ${crossings.length} suit triangles pass into the cage`);
    }
    assert.ok(netted >= 1, `${id} drapes a net over its roof cage`);
    tank.dispose();
  }
}

// 2026-10-08 (round 5, the lane lead's integration rehearsal): the suit is laid after assembly through the port's
// afterAssemble list. A profile step that assigns postAssemble before the suit call and a field kit that wraps it after
// both keep running, the suit still builds, and nothing recurses (an accessor on postAssemble once looped forever
// against a wrapper that captured it).
{
  const box = (w, h, d, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial()); m.position.y = y; return m; };
  const hullG = new THREE.Group(), turretG = new THREE.Group(), gunG = new THREE.Group();
  hullG.add(box(3, 1, 6, 0.5)); turretG.add(box(2, 0.6, 3, 0.3)); turretG.position.y = 1;
  const root = new THREE.Group(); root.add(hullG, turretG, gunG); root.updateMatrixWorld(true);
  const calls = [];
  const P = { spec: { id: 'receipt_port' }, q: true, hullG, turretG, gunG, mats: { canvasCloth: new THREE.MeshStandardMaterial() },
    disposables: [], postAssemble: null, afterAssemble: [] };
  P.postAssemble = () => calls.push('profile');
  const cfg = { id: 'receipt_port', seed: 7, style: 'leafy', density: 1, leafScale: 1, light: 0x667744, dark: 0x334422, netColor: '#334422',
    turret: { top: [{ x0: -0.9, x1: 0.9, z0: -1.4, z1: 1.4, nx: 8, nz: 12, yAt: () => 0.62, seed: 1 }],
      side: [-1, 1].map((side) => ({ side, z0: -1.3, z1: 1.3, nz: 8, ny: 4, topAt: () => 0.6, bottomAt: () => 0.1, outAt: () => 1.02, seed: 2 + side })) } };
  assert.equal(addVehicleGhillieSuit(P, cfg), true);
  const before = P.postAssemble;
  P.postAssemble = (rig) => { before?.(rig); calls.push('field kit'); };
  const rig = { root, hullG, turretG, gunG, recoilG: gunG };
  P.postAssemble(rig);
  for (const step of P.afterAssemble) step(rig);
  assert.deepEqual(calls, ['profile', 'field kit'], 'both profile postAssemble steps still run around the suit');
  assert.ok(turretG.getObjectByName('receipt_port_ghillie_turret_net')?.isMesh, 'the suit builds after assembly');
}

// 2026-10-08 (round 5): a garage pattern switch repaints a vehicle in place, without rebuilding it. The suit's net
// follows the scheme into its theatre (wave 253: "the desert Abrams wears green nets ... against sand paint").
{
  const restoreCanvas = installCanvasFixture();
  const warn = console.warn;
  console.warn = () => {};
  try {
    const tank = createTank('leo2a4', null, { proceduralOnly: true, quality: 'high', camoSeed: 4242 });
    const net = tank.root.getObjectByName('leo2a4_ghillie_turret_net');
    assert.match(net?.material?.map?.name ?? '', /^ghillieNet:woodland:/, 'the A4 wears a woodland net on its woodland scheme');
    setCamoOverride('leo2a4', 'desert');
    applyCamoPatterns('leo2a4');
    assert.match(net.material.map.name, /^ghillieNet:desert:/, 'a switch to a desert scheme carries the net to the desert');
    setCamoOverride('leo2a4', null);
    applyCamoPatterns('leo2a4');
    assert.match(net.material.map.name, /^ghillieNet:woodland:/, 'and back');
    tank.dispose();
    // the decor's rolled nets follow too: the M60A1's sand roll turns woodland on a woodland scheme
    const m60 = createTank('m60a1', null, { quality: 'high', camoSeed: 4242, decor: true });
    let roll = null;
    m60.root.traverse((o) => { if (o.isMesh && o.material?.name === 'Decor_net') roll = o; });
    assert.match(roll?.material?.map?.name ?? '', /^ghillieNet:desert:/, 'the M60A1 rolls a sand net on its desert coat');
    setCamoOverride('m60a1', 'summer');
    applyCamoPatterns('m60a1');
    assert.match(roll.material.map.name, /^ghillieNet:woodland:/, 'a woodland scheme carries the roll to woodland garnish');
    setCamoOverride('m60a1', null);
    applyCamoPatterns('m60a1');
    m60.dispose();
  } finally {
    console.warn = warn;
    restoreCanvas();
  }
}

// 2026-10-09 (the netting lane; the owner's order of that night): the fleet field nets on twenty-one hulls. Each is a
// real suit per configured owner (net and garnish, detailed geometry), rests on its armour or hangs from its own net
// (garnish on its net or the armour) within 15 mm, keeps its hull hems above the hull's hem floor and the track
// corridor, fires no smoke discharger into itself, lays nothing of an owner over that owner's hatch lids and cupolas,
// and leaves the mantlet and gun corridor open.
for (const [id, cfg] of Object.entries(FLEET_GHILLIE_SUITS)) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality: 'high' });
  tank.root.updateMatrixWorld(true);
  const rigs = { hull: tank.root.getObjectByName('rig_hull'), turret: tank.root.getObjectByName('rig_turret'), gun: tank.root.getObjectByName('rig_gun') };
  const suit = { hull: [], turret: [], gun: [] };
  for (const owner of ['hull', 'turret', 'gun']) {
    if (!cfg[owner]) continue;
    for (const layer of cfg.foliage === false ? ['net'] : ['net', 'leaves']) {
      const mesh = tank.root.getObjectByName(`${id}_ghillie_${owner}_${layer}`);
      assert.ok(mesh?.isMesh && belongsTo(mesh, rigs[owner]), `${id}: ${owner} ${layer} is a merged mesh on its owner rig`);
      assert.ok(mesh.geometry.getAttribute('position').count > 120, `${id}: ${owner} ${layer} is detailed geometry`);
      assert.equal(mesh.userData.fieldSuit, true, `${id}: ${owner} ${layer} is marked for the decor's turret-load guard`);
      suit[owner].push(mesh);
    }
  }
  const floating = suitContact(tank, id);
  assert.deepEqual(floating, [], `${id} fleet suit pieces touch nothing within ${TOUCH_M * 1000} mm:\n  ${floating.join('\n  ')}`);
  const toHull = new THREE.Matrix4().copy(rigs.hull.matrixWorld).invert();
  const hullBox = new THREE.Box3();
  for (const mesh of suit.hull) {
    const pos = mesh.geometry.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) hullBox.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(toHull));
  }
  if (suit.hull.length) {
    assert.ok(hullBox.min.y > Math.max(0.52, Math.min(cfg.hemFloorM ?? 0.545, 0.545) - 0.06),
      `${id}: the hull suit stays above the track corridor (${hullBox.min.y.toFixed(3)})`);
  }
  const all = [...suit.hull, ...suit.turret, ...suit.gun];
  const ray = new THREE.Raycaster();
  tank.root.traverse((o) => {
    for (const socket of o.userData?.smokeSockets ?? []) {
      ray.set(new THREE.Vector3().fromArray(socket.position).applyMatrix4(o.matrixWorld),
        new THREE.Vector3().fromArray(socket.direction).transformDirection(o.matrixWorld));
      ray.far = 1.5;
      assert.equal(ray.intersectObjects(all, false).length, 0, `${id}: the smoke discharger on ${o.name} fires clear of the suit`);
    }
  });
  tank.root.traverse((o) => {
    const lid = /^(hull|turret)(Hatch|Cupola)$/.exec(o.name);
    if (!o.isMesh || !lid) return;
    const own = suit[lid[1]];
    const box = new THREE.Box3().setFromObject(o);
    for (const mesh of own) {
      const pos = mesh.geometry.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        // lids are merged per bucket: a ray down onto the bucket's own pieces, within 0.6 m (a net lying on or near the
        // lid; a net thrown over a cage a metre above the hatches leaves them free to open)
        if (v.y < box.max.y - 0.03 || v.y > box.max.y + 0.6) continue;
        ray.set(v, new THREE.Vector3(0, -1, 0)); ray.far = 0.62;
        assert.equal(ray.intersectObject(o, false).length, 0, `${id}: ${mesh.name} lies over ${o.name} at ${v.toArray().map((q) => q.toFixed(2))}`);
      }
    }
  });
  if (suit.turret.length) {
    // the bore's line ahead of the trunnion (world frame: the rigs ride the hull's suspension)
    const net = suit.turret.find((m) => /_net$/.test(m.name));
    const trunnion = new THREE.Vector3().setFromMatrixPosition(rigs.gun.matrixWorld);
    const hits = new THREE.Raycaster(new THREE.Vector3(trunnion.x, trunnion.y, trunnion.z + 8), new THREE.Vector3(0, 0, -1), 0, 8)
      .intersectObject(net, false);
    assert.deepEqual(hits.map((hit) => hit.point.toArray().map((v) => +v.toFixed(2))), [], `${id} leaves the gun's bore line open`);
  }
  tank.dispose();
}

const twardy = GHILLIE_SUIT_CONFIGS.pt91_twardy;
const twardyTop = twardy.turret.top[0];
assert.ok(twardyTop.yAt(0, 0) > 0.82 && twardyTop.yAt(0, 0) < 0.86,
  'Twardy net keeps a small suspended air layer over the dome crown');
assert.ok(twardyTop.yAt(1.05, 0.45) < 0.74,
  'Twardy net descends onto the ERAWA cheek instead of retaining a flat roof plane');
assert.ok(twardyTop.yAt(0, -1.48) < 0.72,
  'Twardy net seats onto the bustle roof instead of floating at crown height');
assert.ok(twardy.turret.side[0].topAt(0.90) < twardy.turret.side[0].topAt(-0.40),
  'Twardy side drape follows the falling front shoulder');
assert.ok(twardy.turret.face[0].zAt(1.0, 0.42) < twardy.turret.face[0].zAt(0.35, 0.42),
  'Twardy front drape follows the swept ERAWA wedge instead of one flat face');

console.log('Shared physical-ghillie suit selftest passed');
