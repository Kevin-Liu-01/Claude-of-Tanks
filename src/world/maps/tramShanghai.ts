// src/world/maps/tramShanghai.ts — a Shanghai Electric Construction Company tramcar of 1937 (Lane C, #24, 2026-10-14),
// for Blackglass's avenue (Suzhou Creek, autumn 1937): a single-deck bogie car about 11 m over its dashes, its body in the
// Settlement's green with a cream window band and letterboard, the window band glazed between its pillars and set back in
// them, the arched roof under its clerestory with the little deck lights, open vestibules at both ends behind their dashes
// and three-pane windscreens, the steps and lifeguards, the trolley pole on its base. The avenue's trams are burnt out
// (the battle of Shanghai): 'burnt' is that (the glass gone between the pillars, panels, pillars and the letterboard
// burnt away in places, two roof bays open to their carlines, the roof sagging, the pole wrenched up), 'collapsed' its
// break (the saloon crushed down onto the frame bay by bay, racked, the underframe slewed on its bogies). Built in the vehicle toolkit, +Z along
// the track, y up from the rail head, in the painted bucket's streams.
import * as THREE from 'three';
import { VehicleMesh, linearHex, material, vehicleWeathering } from './vehicleMesh.ts';
import { keepStreams } from '../geometryStreams.ts';

const GREEN = material('paint', linearHex(0x2f5a3c), 0.6, 0.05, 0, 1);
const CREAM = material('paint', linearHex(0xd8ccae), 0.62, 0, 0, 1);
const ROOF = material('paint', linearHex(0x585650), 0.85, 0, 0, 1);
const FRAME = material('steel', [0.03, 0.029, 0.028], 0.62, 0.35, 0, 1);
const WHEEL = material('steel', [0.05, 0.047, 0.044], 0.5, 0.55, 0, 1);
const GLASS = material('glass', [0.025, 0.03, 0.035], 0.06, 0, 0, 0.2);
const DARK = material('trim', [0.03, 0.03, 0.032], 0.55, 0, 0, 0.6);
const LAMP = material('lamp', [0.8, 0.78, 0.7], 0.2, 0, 0, 0.3);

/** A fixed hash in [0, 1) of a bay or panel and a salt: the wreck's damage, the same every build. */
function hash(k: number, salt: number): number {
  const h = Math.sin(k * 127.1 + salt * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * The fire's marks on a burnt car's wooden body (the vehicle toolkit's burn is a steel body's: oxide and rust, a little
 * char): most of it charred black in broad patches, blistered brown where the paint held, the faces turned up ash-grey,
 * the char heaviest along the window band where the fire left the saloon. Written over the built colours.
 */
function charWoodBody(g: THREE.BufferGeometry): void {
  const pos = g.getAttribute('position'), nrm = g.getAttribute('normal'), col = g.getAttribute('color');
  // linear colours: char near-black, the blistered paint's dull rust-brown islands, the mid-grey ash of burnt boards
  const CH = [0.0065, 0.006, 0.0055], RUSTY = [0.07, 0.034, 0.019], ASHY = [0.115, 0.11, 0.1];
  const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ny = nrm.getY(i);
    // broad patches (two metres and more) with a finer edge, in about [-1, 1]
    const t = (Math.sin(z * 1.3 + y * 0.8 + x * 0.5) + 0.6 * Math.sin(z * 3.1 - y * 2.2 + 1.7) + 0.4 * Math.sin(y * 5.3 + z * 4.7 + x * 2.0)) / 2;
    const streak = Math.sin(z * 7.9 + x * 3.3) * Math.sin(y * 1.9 - z * 0.7);
    // the window band and the roof burnt worst: char there over a wider threshold
    const band = y > 1.6 ? 0.25 : 0;
    const char = smooth(-0.5 - band, -0.15 - band, t);
    let r = col.getX(i), gg = col.getY(i), b = col.getZ(i);
    // the paint left: blistered to rust where the char did not take
    r += (RUSTY[0] - r) * 0.7; gg += (RUSTY[1] - gg) * 0.7; b += (RUSTY[2] - b) * 0.7;
    r += (CH[0] - r) * char; gg += (CH[1] - gg) * char; b += (CH[2] - b) * char;
    // (the ash a mid-grey on the faces turned up and in thin streaks down the sides, never a whole panel)
    const ash = ny > 0.55 ? 0.7 * smooth(-0.1, 0.35, t) : 0.35 * smooth(0.8, 0.95, streak) * char;
    r += (ASHY[0] - r) * ash; gg += (ASHY[1] - gg) * ash; b += (ASHY[2] - b) * ash;
    col.setXYZ(i, r, gg, b);
  }
  col.needsUpdate = true;
}

/** Half the car's width and length over its dashes (m): the destructible's footprint. */
export const SHANGHAI_TRAM_SIZE = { hw: 1.15, hl: 5.7, h: 3.35 } as const;

export function buildShanghaiTram(state: 'intact' | 'burnt' | 'collapsed', coarse = false): THREE.BufferGeometry {
  const mesh = new VehicleMesh();
  mesh.coarse = coarse;
  const wreck = state !== 'intact', collapsed = state === 'collapsed';
  const hw = 1.1, bodyL = 4.9, floor = 0.78, sill = 1.72, head = 2.62, eave = 2.82;
  // the bogies: frames, wheels on their axles, the axle boxes (driven down under a collapsed car)
  for (const bz of [-3.3, 3.3]) {
    mesh.push();
    if (collapsed) mesh.translate(0, -0.1, 0).rotateZ(0.04);
    mesh.box(0, 0.5, bz, 1.7, 0.28, 2.1, FRAME, 0);
    for (const az of [-0.7, 0.7]) for (const side of [1, -1]) {
      mesh.push().translate(side * 0.66, 0.33, bz + az).scale(side, 1, 1);
      mesh.lathe([[0.0001, -0.06], [0.3, -0.06], [0.33, -0.03], [0.33, 0.04], [0.35, 0.06], [0.0001, 0.06]], coarse ? 8 : 12, () => WHEEL);
      mesh.pop();
      if (!coarse) mesh.box(side * 0.86, 0.36, bz + az, 0.12, 0.2, 0.22, FRAME, 0);
    }
    mesh.pop();
  }
  // the underframe the whole length (a collapsed car's slewed on its bogies and dropped onto them)
  mesh.push();
  if (collapsed) mesh.translate(0, -0.12, 0).rotateY(0.05);
  mesh.box(0, floor - 0.06, 0, 2.0, 0.14, bodyL * 2 + 1.2, FRAME, 0);
  // The saloon, bay by bay between its pillars (eight bays). A burnt car (the battle of Shanghai: wooden bodies on
  // steel underframes) has lost panels, pillars and roof boards in places: a bay's lower panel burnt away shows the
  // frame and the seat frames, a pillar burnt to a stub, the letterboard gone, two of the roof's bays open to their
  // carlines. A collapsed car gave way bay by bay: each bay crushed toward the floor to under half its height, racked
  // over to one side, no two alike, so the roof comes down in steps and the pillars lean.
  const n = 8, bayL = (bodyL * 2) / n, ar = coarse ? 4 : 8, sag = wreck ? 0.26 : 0;
  const mid = (z: number) => 1 - Math.pow(z / bodyL, 2);
  const pose = (k: number, zc: number, end = false): void => {
    if (!collapsed) return;
    const keep = end ? (zc > 0 ? 0.56 : 0.46) : 0.4 + 0.12 * Math.abs(zc) / bodyL + 0.1 * (hash(k, 3) - 0.5);
    const rack = end ? 0.12 : 0.22 + 0.12 * (hash(k, 5) - 0.5);
    // (an end's vestibule droops outward off the crushed saloon)
    const droop = end ? Math.sign(zc) * 0.1 : 0.05 * (hash(k, 7) - 0.5);
    mesh.translate(0, floor, zc).rotateZ(rack).rotateX(droop).scale(1, keep, 1).translate(0, -floor, -zc);
  };
  const pillar = (side: number, z: number, part: number): void => {
    const h = (head - sill) * part;
    mesh.box(side * (hw - 0.03), sill + h / 2, z, 0.07, h, 0.1, CREAM, 0);
  };
  for (let k = 0; k < n; k++) {
    const z0 = -bodyL + k * bayL, z1 = z0 + bayL, zc = (z0 + z1) / 2;
    mesh.push();
    pose(k, zc);
    for (const side of [1, -1]) {
      const id = k * 2 + (side > 0 ? 0 : 1);
      if (!(wreck && hash(id, 11) < 0.3)) {
        mesh.box(side * (hw - 0.03), (floor + sill) / 2, zc, 0.06, sill - floor, bayL - (wreck ? 0.03 : 0), GREEN, 0.01);
        if (!coarse) mesh.dressing(() => {
          for (const y of [floor + 0.12, sill - 0.08]) mesh.box(side * hw, y, zc, 0.02, 0.04, bayL - 0.04, CREAM, 0);
          mesh.box(side * hw, (floor + sill) / 2, z0 + 0.06, 0.02, sill - floor - 0.3, 0.03, CREAM, 0);
        });
      }
      pillar(side, z0, wreck && k > 0 && hash(id, 13) < 0.25 ? 0.3 + 0.35 * hash(id, 17) : 1);
      if (k === n - 1) pillar(side, z1, 1);
      // glass set 4 cm back of the pillars' faces (none on a burnt car: the window band open between its pillars)
      if (!wreck) mesh.box(side * (hw - 0.07), (sill + head) / 2, zc, 0.015, head - sill - 0.06, bayL - 0.1, GLASS, 0);
      if (!(wreck && hash(id, 19) < 0.3)) mesh.box(side * (hw - 0.02), (head + eave) / 2, zc, 0.06, eave - head, bayL, CREAM, 0);
      mesh.box(side * (hw - 0.03), sill + 0.02, zc, 0.1, 0.04, bayL, CREAM, 0);
      // the seat frames a burnt car shows through its open windows
      if (wreck) mesh.box(side * 0.75, floor + 0.42, zc, 0.42, 0.06, bayL * 0.8, FRAME, 0);
    }
    // the arched roof over the bay (a burnt car's sagging through its middle; two bays burnt open to their carlines)
    const open = wreck && !collapsed && (k === 2 || k === 5);
    const za = z0 - (k === 0 ? 0.03 : 0), zb = z1 + (k === n - 1 ? 0.03 : 0);
    if (!open) {
      mesh.grid(1, ar, (i, j, out) => {
        const z = i ? zb : za, a = Math.PI * (j / ar);
        out[0] = Math.cos(a) * (hw + 0.04);
        out[1] = eave + 0.18 * Math.sin(a) - sag * mid(z);
        out[2] = z;
      }, () => ROOF, { flip: true });
    } else {
      for (const z of [z0 + bayL / 3, z0 + (2 * bayL) / 3]) {
        const arch: [number, number, number][] = [];
        for (let j = 0; j <= ar; j++) { const a = Math.PI * (j / ar); arch.push([Math.cos(a) * (hw + 0.02), eave + 0.16 * Math.sin(a) - sag * mid(z) - 0.03, z]); }
        mesh.tube(arch, 0.025, coarse ? 3 : 4, wreck ? DARK : ROOF, { caps: true });
      }
    }
    // the clerestory along the roof's crown with its deck lights (from a metre in from either end)
    const c0 = Math.max(z0, -bodyL + 0.8), c1 = Math.min(z1, bodyL - 0.8);
    if (!open && c1 > c0) {
      mesh.box(0, eave + 0.26 - sag * 0.7 * mid((c0 + c1) / 2), (c0 + c1) / 2, 1.0, 0.16, c1 - c0, ROOF, 0);
      if (!coarse && k > 0 && k < n - 1) for (const side of [1, -1]) {
        mesh.box(side * 0.505, eave + 0.26 - sag * 0.7 * mid(zc), zc, 0.01, 0.1, 0.4, wreck ? DARK : GLASS, 0);
      }
    }
    // the trolley pole on its base over the fourth bay (a burnt car's wrenched up and over; a collapsed car's comes down
    // with its roof)
    if (k === 3) {
      const base = eave + 0.4 - sag * 0.6;
      mesh.box(0, base, -1.0, 0.4, 0.1, 0.4, FRAME, 0);
      const tip: [number, number, number] = wreck ? [0.9, eave + 1.5, 1.6] : [0, eave + 0.55, 3.6];
      mesh.tube([[0, base + 0.05, -1.0], tip], 0.035, coarse ? 4 : 6, FRAME, { caps: true });
    }
    mesh.pop();
  }
  // the bulkheads closing the saloon at both ends, their doors (dark), the vestibules beyond: dash, windscreen, the
  // steps on their hangers, the lifeguard tray hung under the dash
  for (const end of [1, -1]) {
    const z = end * bodyL;
    mesh.push();
    pose(end > 0 ? n : -1, z, true);
    mesh.box(0, (floor + eave) / 2, z, hw * 2 - 0.06, eave - floor, 0.06, GREEN, 0);
    mesh.box(0, (floor + head) / 2 + 0.1, z + end * 0.035, 0.7, head - floor - 0.3, 0.02, DARK, 0);
    const vz = z + end * 0.75;
    mesh.box(0, floor - 0.06, z + end * 0.4, 1.9, 0.12, 0.8, FRAME, 0);
    mesh.box(0, (floor + sill) / 2 + 0.05, vz, 1.9, sill - floor + 0.1, 0.06, GREEN, 0.01);
    if (!coarse) mesh.dressing(() => mesh.box(0, floor + 0.35, vz + end * 0.03, 0.9, 0.06, 0.02, CREAM, 0));
    for (const x of [-0.92, -0.32, 0.32, 0.92]) mesh.box(x, (sill + head) / 2 + 0.05, vz, 0.06, head - sill + 0.1, 0.06, CREAM, 0);
    if (!wreck) for (const x of [-0.62, 0, 0.62]) mesh.box(x, (sill + head) / 2 + 0.05, vz - end * 0.03, 0.54, head - sill, 0.015, GLASS, 0);
    // the canopy over the vestibule, the headlamp on the dash, the destination box
    mesh.box(0, eave + 0.04, z + end * 0.4, hw * 2, 0.06, 0.9, ROOF, 0);
    mesh.push().translate(0, sill - 0.25, vz + end * 0.04).rotateY(end > 0 ? -Math.PI / 2 : Math.PI / 2);
    mesh.lathe([[0.0001, 0], [0.1, 0], [0.11, 0.06], [0.0001, 0.07]], coarse ? 6 : 10, () => (wreck ? DARK : LAMP));
    mesh.pop();
    mesh.box(0, head + 0.12, vz - end * 0.05, 0.9, 0.2, 0.08, DARK, 0);
    // the lifeguard tray on its two hangers from the vestibule's frame
    mesh.box(0, 0.22, vz + end * 0.15, 1.6, 0.04, 0.4, FRAME, 0);
    for (const x of [-0.6, 0.6]) mesh.box(x, 0.43, z + end * 0.74, 0.05, 0.42, 0.05, FRAME, 0);
    // the steps either side, each on two hangers from the vestibule's frame
    for (const side of [1, -1]) {
      mesh.box(side * 0.98, floor - 0.32, z + end * 0.45, 0.3, 0.04, 0.5, FRAME, 0);
      for (const dz of [0.25, 0.65]) mesh.box(side * 0.9, floor - 0.22, z + end * dz, 0.04, 0.2, 0.04, FRAME, 0);
    }
    mesh.pop();
  }
  mesh.pop();
  const built = mesh.build(vehicleWeathering({
    dirtRgb: linearHex(0x2c2824), dirt: 0.55, dirtTop: 1.2, dustRgb: linearHex(0x4a4640), dust: 0.15, rust: wreck ? 0.6 : 0.3,
    burnt: wreck, wheels: [-4.0, -2.6, 2.6, 4.0].map((z) => ({ z, y: 0.33, r: 0.33 })), seed: 23, voxelAo: !coarse,
  }));
  // (built fresh without the surface stream: the tram's pool draws it; geometryStreams.ts)
  const g = keepStreams(built, Object.keys(built.attributes).filter((name) => name !== 'surf'));
  if (wreck) charWoodBody(g);
  g.computeBoundingBox();
  const lift = -g.boundingBox!.min.y;
  if (Math.abs(lift) > 1e-6) g.translate(0, lift, 0);
  delete g.userData.bodyBox;
  return g;
}
