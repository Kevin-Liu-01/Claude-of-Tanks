// src/world/maps/railYardR2.ts — the rail yard's gantry crane and maintenance shed (the looks lane's r2 sweep, sub-stream
// b-west, 2026-10-16): moved out of railKit.ts (Lane B, parked) to be rebuilt to the r2 standard here. railKit.ts keeps
// them in RAIL_BUILDERS and re-exports them.
import * as THREE from 'three';
import { box, jitterUV, pitchRoofPlane } from '../propGeometry.ts';
import type { GeometryBuckets, StructureDimensions } from './exteriorDetailKit.ts';

/** A part new to the builder's stream: it takes no draws from the shared stream (props.ts jitterBuildingUvs). */
function dressing<T extends THREE.BufferGeometry>(geo: T): T {
  geo.userData.uvJitter = 'none';
  return geo;
}

type P3 = readonly [number, number, number];
/** A member from a to b (its section t x d), new to the stream (dressing). */
function memberGeo(a: P3, b: P3, t: number, d = t): THREE.BufferGeometry {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = dir.length();
  const g = box(t, d, Math.max(0.01, len), 1.0);
  // (its length along z turned onto the member's direction: a near-vertical stile keeps its rake)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return dressing(g);
}

/** A box new to the stream (dressing), centred at (x, y, z). */
function boxAt(w: number, h: number, d: number, x: number, y: number, z: number, uv = 1.0): THREE.BufferGeometry {
  const g = box(w, h, d, uv);
  g.translate(x, y, z);
  return dressing(g);
}

/** A ladder up from y0 to y1 at (x, z): two stiles across `span` along `along` ('x' | 'z'), rungs every 0.35 m. */
function ladderGeos(x: number, z: number, y0: number, y1: number, along: 'x' | 'z', span = 0.45): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const ax = along === 'x' ? span / 2 : 0, az = along === 'z' ? span / 2 : 0;
  for (const s of [-1, 1]) out.push(boxAt(0.05, y1 - y0, 0.05, x + s * ax, (y0 + y1) / 2, z + s * az));
  for (let y = y0 + 0.3; y < y1 - 0.05; y += 0.35) out.push(boxAt(along === 'x' ? span : 0.03, 0.03, along === 'z' ? span : 0.03, x, y, z));
  return out;
}

/**
 * Rail-served gantry crane: two braced leg towers, a deep bridge girder
 * spanning them, trolley + hook block and a cabin — the yard's skyline
 * landmark (~12.5 m).
 */
export function makeGantry(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const span = 15 + rng() * 2, legH = 9.5 + rng() * 1.2, girderH = 1.35;
  const mk = (geometry: THREE.BufferGeometry): void => { buckets.dark.push(geometry); };
  for (const s of [-1, 1]) { // A-frame leg towers
    const lx = s * span / 2;
    for (const dz of [-1.7, 1.7]) {
      const leg = box(0.42, legH, 0.42, 1.0);
      leg.translate(lx, legH / 2, dz);
      mk(leg);
    }
    // cross braces (X read from a distance is carried by two diagonals)
    for (const dir of [-1, 1]) {
      const br = box(0.16, Math.hypot(legH * 0.55, 3.4), 0.16, 1.0);
      br.rotateX(dir * Math.atan2(3.4, legH * 0.55));
      br.translate(lx, legH * 0.45, 0);
      mk(br);
    }
    const foot = box(1.4, 0.5, 4.6, 0.8);
    foot.translate(lx, 0.22, 0);
    buckets.stone.push(jitterUV(foot, rng));
    // Cap beam joins both A-frame legs to the central bridge. Previously the
    // girder visually hovered between the two z-offset towers.
    const cap = box(0.62, 0.42, 4.0, 0.8);
    cap.translate(lx, legH + 0.14, 0);
    mk(cap);
  }
  // bridge girder + rail, overhanging one side
  const gird = box(span + 4.5, girderH, 1.5, 0.7);
  gird.translate(0.8, legH + girderH / 2, 0);
  mk(gird);
  const rail = box(span + 4.5, 0.14, 0.2, 1.0);
  rail.translate(0.8, legH - 0.07, 0);
  mk(rail);
  // trolley + cable + hook block
  const tx = (rng() - 0.5) * span * 0.6;
  const trolley = box(1.5, 0.7, 1.9, 1.0);
  trolley.translate(tx, legH + girderH + 0.3, 0);
  mk(trolley);
  const drop = 2.2 + rng() * 2.6;
  const cable = box(0.05, drop, 0.05, 2.0);
  cable.translate(tx, legH - drop / 2, 0);
  mk(cable);
  const hook = box(0.55, 0.75, 0.4, 1.0);
  hook.translate(tx, legH - drop - 0.35, 0);
  mk(hook);
  // operator cabin under the girder
  const cab = box(1.6, 1.5, 1.6, 0.8);
  cab.translate(-span / 2 + 1.4, legH - 0.9, 1.3);
  mk(cab);
  // Twin hangers physically seat the operator cabin under the girder.
  for (const x of [-span / 2 + 0.95, -span / 2 + 1.85]) {
    const hanger = box(0.12, 0.54, 0.12, 1.0);
    hanger.translate(x, legH + 0.08, 0.62);
    mk(hanger);
  }
  if (buckets.glass) {
    const gl = box(1.4, 0.7, 0.06);
    gl.translate(-span / 2 + 1.4, legH - 0.65, 2.11);
    buckets.glass.push(gl);
  }
  // (props census #3, lane B 2026-10-14; the judges: "no lattice, no sill beams, bogies or rails, no walkway, ladder or
  // handrails") the parts below are new to the stream (dressing: no draws), the crane's members and access: the girts
  // across each A-frame, the sill beams on their bogies and wheels on the rails along the runway feet, the girder's
  // web stiffeners, the walkway along it with its toe board and two-rail handrail, the ladder up a leg to it, the
  // cabin's side lights and roof, the hook block's sheave cheeks and the second fall of rope
  for (const s of [-1, 1]) {
    const lx = s * span / 2;
    for (const t of [0.33, 0.66]) mk(boxAt(0.14, 0.14, 3.4, lx, legH * t, 0));
    mk(boxAt(0.5, 0.55, 4.3, lx, 0.47 + 0.12 + 0.3 + 0.27, 0));
    for (const dz of [-1.7, 1.7]) {
      const wheel = new THREE.CylinderGeometry(0.3, 0.3, 0.18, 10);
      wheel.rotateZ(Math.PI / 2);
      wheel.translate(lx, 0.47 + 0.12 + 0.3, dz);
      mk(dressing(wheel));
    }
    mk(boxAt(0.1, 0.12, 4.6, lx, 0.47 + 0.06, 0));
  }
  for (let x = -span / 2 + 0.6; x < span / 2 + 2.9; x += 1.4) for (const sz of [-1, 1]) mk(boxAt(0.06, girderH - 0.1, 0.06, x, legH + girderH / 2, sz * 0.78));
  const wx0 = -span / 2 - 0.2, wx1 = span / 2 + 2.8, wz0 = 0.74, wz1 = 1.5;
  mk(boxAt(wx1 - wx0, 0.05, wz1 - wz0, (wx0 + wx1) / 2, legH + girderH - 0.05, (wz0 + wz1) / 2));
  mk(boxAt(wx1 - wx0, 0.1, 0.02, (wx0 + wx1) / 2, legH + girderH + 0.05, wz1 - 0.01));
  for (let x = wx0 + 0.05; x <= wx1; x += 1.5) mk(boxAt(0.05, 1.0, 0.05, x, legH + girderH + 0.5, wz1 - 0.03));
  for (const h of [0.5, 1.0]) mk(boxAt(wx1 - wx0, 0.04, 0.04, (wx0 + wx1) / 2, legH + girderH + h, wz1 - 0.03));
  for (const g of ladderGeos(-span / 2 - 0.235, -1.7, 0.47, legH + 0.2, 'z', 0.42)) mk(g);
  if (buckets.glass) for (const sx of [-1, 1]) buckets.glass.push(boxAt(0.06, 0.7, 1.2, -span / 2 + 1.4 + sx * 0.81, legH - 0.65, 1.3));
  mk(boxAt(1.9, 0.08, 1.9, -span / 2 + 1.4, legH - 0.12, 1.3));
  mk(boxAt(0.05, drop, 0.05, tx + 0.3, legH - drop / 2, 0));
  for (const sx of [-1, 1]) mk(boxAt(0.06, 0.5, 0.42, tx + sx * 0.3, legH - drop - 0.2, 0));
  const crook = new THREE.TorusGeometry(0.18, 0.05, 6, 10, Math.PI * 1.4);
  crook.rotateZ(Math.PI * 0.8);
  // (its eye up in the block's cheeks: the integrity gate found it 9 cm clear of them)
  crook.translate(tx, legH - drop - 0.84, 0);
  mk(dressing(crook));
  return { w: span + 5, d: 5.4, h: legH + girderH + 0.8 };
}

/** Open-sided loading shed: platform, posts, mono-pitch roof, crate stacks. */
export function makeShed(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const w = 9 + rng() * 2, d = 6.4, ph = 3.4 + rng() * 0.4;
  const roofAngle = 0.09;
  const roofCenterY = 0.55 + ph + 0.06;
  const roofBottomOffset = 0.07;
  const plat = box(w, 0.55, d, 0.6);
  plat.translate(0, 0.27, 0);
  buckets.stone.push(jitterUV(plat, rng));
  for (const [sx, sz] of [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]]) {
    const z = sz * (d / 2 - 0.5);
    // Follow the actual mono-pitch underside. Equal-height posts left the
    // uphill row visibly short and drove the downhill row through the roof.
    const roofUndersideY = roofCenterY + Math.tan(roofAngle) * z - roofBottomOffset;
    const postH = roofUndersideY - 0.55;
    const post = box(0.22, postH, 0.22, 1.2);
    post.translate(sx * (w / 2 - 0.5), 0.55 + postH / 2, z);
    buckets.wood.push(jitterUV(post, rng));
  }
  const roof = box(w + 0.8, 0.12, d + 0.8, 0.35);
  pitchRoofPlane(roof, 'z', -1, roofAngle, 'skillion');
  roof.translate(0, roofCenterY, 0);
  buckets.roof.push(jitterUV(roof, rng));
  // (props census #4/#13, lane B 2026-10-15; the Ironworks court's donor: "a slab on six sticks") the frame under the
  // roof: an eave beam along each row of posts, rafters down the slope over the posts and purlins across them, knee
  // braces from the end posts, the posts' base plates; the sheet's ribs down the slope, the gutter along the low eave
  // and its downpipe; all new to the stream, none on the platform's band (the court's support)
  const under = (z: number): number => roofCenterY + Math.tan(roofAngle) * z - roofBottomOffset;
  const frame = buckets.wood, steel = buckets.dark;
  const xs = [-(w / 2 - 0.5), 0, w / 2 - 0.5];
  for (const sz of [-1, 1]) {
    const z = sz * (d / 2 - 0.5), y = under(z);
    frame.push(memberGeo([-(w / 2 - 0.3), y - 0.11, z], [w / 2 - 0.3, y - 0.11, z], 0.18, 0.22));
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.5);
      frame.push(memberGeo([x, y - 0.95, z], [x - sx * 0.8, y - 0.2, z], 0.09, 0.09));
      frame.push(memberGeo([x, y - 0.95, z], [x, y - 0.2, z - sz * 0.75], 0.09, 0.09));
    }
    for (const x of xs) steel.push(boxAt(0.36, 0.05, 0.36, x, 0.575, z));
  }
  const za = -(d / 2 - 0.2), zb = d / 2 - 0.2;
  for (const x of xs) frame.push(memberGeo([x, under(za) - 0.07, za], [x, under(zb) - 0.07, zb], 0.14, 0.12));
  for (const z of [-d / 6, d / 6]) frame.push(memberGeo([-(w / 2 - 0.3), under(z) - 0.05, z], [w / 2 - 0.3, under(z) - 0.05, z], 0.08, 0.1));
  const top = (z: number): number => roofCenterY + Math.tan(roofAngle) * z + 0.06;
  // (structureConnectivity: the ribs lie in the sheet's plane through the shared orientation helper, as the sheet does)
  for (let x = -(w / 2 + 0.1); x <= w / 2 + 0.1; x += 0.6) {
    const rib = pitchRoofPlane(box(0.05, 0.04, (d + 0.7) / Math.cos(roofAngle), 1.0), 'z', -1, roofAngle, 'skillion');
    buckets.roof.push(dressing(rib.translate(x, top(0), 0)));
  }
  const low = -(d / 2 + 0.45), gy = top(low) - 0.12;
  steel.push(dressing(new THREE.CylinderGeometry(0.07, 0.07, w + 0.8, 7, 1).rotateZ(Math.PI / 2).translate(0, gy, low)));
  steel.push(dressing(new THREE.CylinderGeometry(0.05, 0.05, gy - 0.55, 6, 1).translate(w / 2 + 0.3, (gy + 0.55) / 2, low)));
  for (let k = 0, n = 3 + ((rng() * 4) | 0); k < n; k++) {
    const cs = 0.55 + rng() * 0.5;
    const crate = box(cs, cs, cs, 1.0);
    crate.rotateY(rng() * Math.PI * 0.5);
    crate.translate((rng() - 0.5) * (w - 2.2), 0.55 + cs / 2, (rng() - 0.5) * (d - 2.2));
    buckets.wood.push(jitterUV(crate, rng));
  }
  return { w: w + 0.8, d: d + 0.8, h: ph + 1.0 };
}
