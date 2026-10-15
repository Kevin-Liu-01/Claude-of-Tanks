// src/world/maps/tramShanghai.ts — a Shanghai Electric Construction Company tramcar of 1937 (Lane C, #24, 2026-10-14),
// for Blackglass's avenue (Suzhou Creek, autumn 1937): a single-deck bogie car about 11 m over its dashes, its body in the
// Settlement's green with a cream window band and letterboard, the window band glazed between its pillars and set back in
// them, the arched roof under its clerestory with the little deck lights, open vestibules at both ends behind their dashes
// and three-pane windscreens, the steps and lifeguards, the trolley pole on its base. The avenue's trams are burnt out
// (the battle of Shanghai): 'burnt' is that (the glass gone between the pillars, the roof sagging, the pole wrenched
// up), 'collapsed' its break (the body crushed down onto the frame and slewed). Built in the vehicle toolkit, +Z along
// the track, y up from the rail head, in the painted bucket's streams.
import * as THREE from 'three';
import { VehicleMesh, linearHex, material, vehicleWeathering } from './vehicleMesh.ts';

const GREEN = material('paint', linearHex(0x2f5a3c), 0.6, 0.05, 0, 1);
const CREAM = material('paint', linearHex(0xd8ccae), 0.62, 0, 0, 1);
const ROOF = material('paint', linearHex(0x585650), 0.85, 0, 0, 1);
const FRAME = material('steel', [0.03, 0.029, 0.028], 0.62, 0.35, 0, 1);
const WHEEL = material('steel', [0.05, 0.047, 0.044], 0.5, 0.55, 0, 1);
const GLASS = material('glass', [0.025, 0.03, 0.035], 0.06, 0, 0, 0.2);
const DARK = material('trim', [0.03, 0.03, 0.032], 0.55, 0, 0, 0.6);
const LAMP = material('lamp', [0.8, 0.78, 0.7], 0.2, 0, 0, 0.3);

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
  // the body (a collapsed car crushed down onto its frame to half its height, slewed and rolled)
  mesh.push();
  if (collapsed) mesh.translate(0, floor - 0.18, 0).rotateY(0.06).rotateZ(0.1).scale(1.06, 0.5, 1).translate(0, -floor, 0);
  mesh.box(0, floor - 0.06, 0, 2.0, 0.14, bodyL * 2 + 1.2, FRAME, 0);
  // the lower panels in green, their mouldings; the window band's pillars and its glass set back; the letterboard
  for (const side of [1, -1]) {
    mesh.box(side * (hw - 0.03), (floor + sill) / 2, 0, 0.06, sill - floor, bodyL * 2, GREEN, 0.01);
    if (!coarse) mesh.dressing(() => {
      for (const y of [floor + 0.12, sill - 0.08]) mesh.box(side * hw, y, 0, 0.02, 0.04, bodyL * 2 - 0.1, CREAM, 0);
      for (let k = 0; k < 7; k++) mesh.box(side * hw, (floor + sill) / 2, -bodyL + 0.7 + k * ((bodyL * 2 - 1.4) / 6), 0.02, sill - floor - 0.3, 0.03, CREAM, 0);
    });
    const n = 8;
    for (let k = 0; k <= n; k++) {
      const z = -bodyL + (k / n) * bodyL * 2;
      mesh.box(side * (hw - 0.03), (sill + head) / 2, z, 0.07, head - sill, 0.1, CREAM, 0);
    }
    // glass: set 4 cm back of the pillars' faces (none on a burnt car: the window band open between its pillars)
    if (!wreck) for (let k = 0; k < n; k++) {
      const z0 = -bodyL + (k / n) * bodyL * 2 + 0.05, z1 = -bodyL + ((k + 1) / n) * bodyL * 2 - 0.05;
      mesh.box(side * (hw - 0.07), (sill + head) / 2, (z0 + z1) / 2, 0.015, head - sill - 0.06, z1 - z0, GLASS, 0);
    }
    mesh.box(side * (hw - 0.02), (head + eave) / 2, 0, 0.06, eave - head, bodyL * 2, CREAM, 0);
    mesh.box(side * (hw - 0.03), sill + 0.02, 0, 0.1, 0.04, bodyL * 2, CREAM, 0);
  }
  // the interior a burnt car shows through its open windows: the seat frames along the sides, the floor
  if (wreck) for (const side of [1, -1]) for (let k = 0; k < 5; k++) {
    mesh.box(side * 0.75, floor + 0.42, -bodyL + 0.9 + k * 2.0, 0.42, 0.06, 1.4, FRAME, 0);
  }
  // the bulkheads closing the saloon at both ends, their doors (dark), the vestibules beyond: dash, windscreen, steps
  for (const end of [1, -1]) {
    const z = end * bodyL;
    mesh.box(0, (floor + eave) / 2, z, hw * 2 - 0.06, eave - floor, 0.06, GREEN, 0);
    mesh.box(0, (floor + head) / 2 + 0.1, z + end * 0.035, 0.7, head - floor - 0.3, 0.02, DARK, 0);
    const vz = z + end * 0.75;
    mesh.box(0, floor - 0.06, z + end * 0.4, 1.9, 0.12, 0.8, FRAME, 0);
    mesh.box(0, (floor + sill) / 2 + 0.05, vz, 1.9, sill - floor + 0.1, 0.06, GREEN, 0.01);
    if (!coarse) mesh.dressing(() => mesh.box(0, floor + 0.35, vz + end * 0.03, 0.9, 0.06, 0.02, CREAM, 0));
    for (const x of [-0.92, -0.32, 0.32, 0.92]) mesh.box(x, (sill + head) / 2 + 0.05, vz, 0.06, head - sill + 0.1, 0.06, CREAM, 0);
    if (!wreck) for (const x of [-0.62, 0, 0.62]) mesh.box(x, (sill + head) / 2 + 0.05, vz - end * 0.03, 0.54, head - sill, 0.015, GLASS, 0);
    // the canopy over the vestibule, the headlamp on the dash, the destination box, the lifeguard tray
    mesh.box(0, eave + 0.04, z + end * 0.4, hw * 2, 0.06, 0.9, ROOF, 0);
    mesh.push().translate(0, sill - 0.25, vz + end * 0.04).rotateY(end > 0 ? -Math.PI / 2 : Math.PI / 2);
    mesh.lathe([[0.0001, 0], [0.1, 0], [0.11, 0.06], [0.0001, 0.07]], coarse ? 6 : 10, () => (wreck ? DARK : LAMP));
    mesh.pop();
    mesh.box(0, head + 0.12, vz - end * 0.05, 0.9, 0.2, 0.08, DARK, 0);
    mesh.box(0, 0.22, vz + end * 0.15, 1.6, 0.04, 0.4, FRAME, 0);
    for (const side of [1, -1]) mesh.box(side * 0.98, floor - 0.32, z + end * 0.45, 0.3, 0.04, 0.5, FRAME, 0);
  }
  // the arched roof (a burnt car's sagging through its middle), the clerestory with its deck lights, the trolley pole
  const sag = wreck ? 0.18 : 0;
  const ar = coarse ? 4 : 8;
  mesh.grid(6, ar, (i, j, out) => {
    const a = Math.PI * (j / ar), u = i / 6, mid = 1 - Math.pow(2 * u - 1, 2);
    out[0] = Math.cos(a) * (hw + 0.04);
    out[1] = eave + 0.18 * Math.sin(a) - sag * mid;
    out[2] = (u - 0.5) * (bodyL * 2 + 0.06);
  }, () => ROOF, { flip: true });
  mesh.box(0, eave + 0.26 - sag * 0.7, 0, 1.0, 0.16, bodyL * 2 - 1.6, ROOF, 0);
  if (!coarse) for (const side of [1, -1]) for (let k = 0; k < 6; k++) {
    mesh.box(side * 0.505, eave + 0.26 - sag * 0.7, -bodyL + 1.3 + k * ((bodyL * 2 - 2.6) / 5), 0.01, 0.1, 0.4, wreck ? DARK : GLASS, 0);
  }
  mesh.box(0, eave + 0.4 - sag * 0.6, -1.0, 0.4, 0.1, 0.4, FRAME, 0);
  const tip: [number, number, number] = wreck ? [0.9, eave + 1.5, 1.6] : [0, eave + 0.55, 3.6];
  mesh.tube([[0, eave + 0.45 - sag * 0.6, -1.0], tip], 0.035, coarse ? 4 : 6, FRAME, { caps: true });
  mesh.pop();
  const g = mesh.build(vehicleWeathering({
    dirtRgb: linearHex(0x2c2824), dirt: 0.55, dirtTop: 1.2, dustRgb: linearHex(0x4a4640), dust: 0.15, rust: wreck ? 0.6 : 0.3,
    burnt: wreck, wheels: [-4.0, -2.6, 2.6, 4.0].map((z) => ({ z, y: 0.33, r: 0.33 })), seed: 23, voxelAo: !coarse,
  }));
  g.deleteAttribute('surf');
  g.computeBoundingBox();
  const lift = -g.boundingBox!.min.y;
  if (Math.abs(lift) > 1e-6) g.translate(0, lift, 0);
  delete g.userData.bodyBox;
  return g;
}
