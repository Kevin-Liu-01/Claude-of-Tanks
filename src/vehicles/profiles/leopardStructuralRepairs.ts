import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { KIT } from './kit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** Welded Panther stock keeps the authored silhouette stations; its actual
 * supporting planes replace inward quad diagonals and a concave cap fan.
 * This is explicitly scoped to that convex shell, never a casting normal fix. */
export function convexCrownedStock(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const points = new Map<string, THREE.Vector3>();
  const p = source.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    points.set(v.toArray().map(n => n.toFixed(7)).join(','), v);
  }
  const geometry = new ConvexGeometry([...points.values()]);
  const positions = geometry.getAttribute('position'), uv: number[] = [];
  for (let i = 0; i < positions.count; i++) uv.push(positions.getX(i), positions.getZ(i));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  source.dispose();
  return geometry;
}

/** Finite shallow skin over a nonplanar cheek. Both faces use the same
 * diagonal: opposite diagonals on a warped quad cut through a thin panel. */
export function leopardThermalSkin(
  corners: readonly (readonly number[])[], backing: readonly number[],
): THREE.BufferGeometry {
  const front = corners.map(p => new THREE.Vector3(p[0], p[1], p[2]));
  const offset = new THREE.Vector3(backing[0], backing[1], backing[2]);
  if (new THREE.Triangle(front[0], front[1], front[2]).getNormal(new THREE.Vector3()).dot(offset) > 0) {
    [front[1], front[3]] = [front[3], front[1]];
  }
  const rear = front.map(p => p.clone().add(offset)), positions: number[] = [];
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => { positions.push(...a.toArray(), ...b.toArray(), ...c.toArray()); };
  triangle(front[0], front[1], front[2]);triangle(front[0], front[2], front[3]);
  triangle(rear[0], rear[2], rear[1]);triangle(rear[0], rear[3], rear[2]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    triangle(front[i], rear[i], rear[j]);triangle(front[i], rear[j], front[j]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
  geometry.computeVertexNormals();
  geometry.userData.primaryStockRole = 'leo2a6m-thermal-skin';
  return geometry;
}

export function addLeo2PrototypeMantlet(P: TankBuilderPort): void {
  const segments = P.q ? 28 : 16;
  const shape = new THREE.Shape();
  const ring = [[-.315,-.17],[.315,-.17],[.385,-.10],[.385,.205],
    [.315,.275],[-.315,.275],[-.385,.205],[-.385,-.10]];
  shape.moveTo(ring[0][0],ring[0][1]);
  for(const [x,y] of ring.slice(1))shape.lineTo(x,y);
  shape.closePath();
  for(const [x,y,r] of [[0,0,.145],[.245,.05,.028]]) {
    const hole = new THREE.Path();hole.absarc(x,y,r,0,Math.PI*2,true);shape.holes.push(hole);
  }
  const shield = new THREE.ExtrudeGeometry(shape,{depth:1,steps:1,bevelEnabled:false,curveSegments:segments/2});
  const positions=shield.getAttribute('position');
  for(let i=0;i<positions.count;i++) {
    // One continuous raked front plane: no pinched cap or folded upper lip.
    const front=.40-.28*positions.getY(i);
    positions.setZ(i,THREE.MathUtils.lerp(-.12,front,positions.getZ(i)));
  }
  shield.computeVertexNormals();shield.userData.primaryStockRole='leopard-proto-rocking-shield';
  P.addGunExtra(shield);
  // The coax and cannon each have a real passage through the finite shield.
  // The main sleeve clears the retained 120.75 mm breech collar radius.
  const profile=[[.132,-.10],[.16,-.10],[.16,.37],[.172,.41],[.165,.48],
    [.13,.60],[.098,.71],[.084,.71],[.09,.56],[.132,.48],[.132,-.10]];
  P.addGunExtra(new THREE.LatheGeometry(profile.map(([r,z])=>new THREE.Vector2(r,z)),segments).rotateX(Math.PI/2));
  const socket=[[.021,.29],[.035,.29],[.035,.435],[.021,.435],[.021,.29]];
  P.addGunExtra(new THREE.LatheGeometry(socket.map(([r,z])=>new THREE.Vector2(r,z)),16).rotateX(Math.PI/2),.245,.05,0);
  P.addGunExtraDark(KIT.cylZ(.020,.012,12),.245,.05,.30);
  // Separate journals enter the blind cheek bearings while leaving the
  // longitudinal recoil passage unobstructed through the pitching axis.
  for(const side of [-1,1]) {
    P.addGunExtra(KIT.cylX(.175,.24,segments),side*.32,0,0);
    for(const y of [-.12,.16])
      P.addGunExtraDark(KIT.cylZ(.014,.012,8),side*.32,y,.40-.28*y+.002);
    P.addGunExtra(KIT.box(.035,.035,.07),side*.255,.276,.13);
  }
}
