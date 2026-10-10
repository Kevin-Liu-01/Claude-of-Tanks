// src/world/maps/regional/shaft.ts — how a shaft comes down (the facades lane, 2026-10-08; docs/DESTRUCTION.md §16.3;
// the coordinator's ruling: towers, minarets and stacks are "tall silhouettes; collapse must read from far").
//
// A stack, a water tower, a minaret or a tower (damage.ts describeShaft reads its bands off its parts) breaches, spalls
// and loses a band as a house's wall does; it does not settle into a heap where it stood. It breaks low and topples: the
// stump stands a metre or three over its foot in its own courses, and the shaft lies along the ground in the drums it
// broke into, gaps of its own rubble between them, its crown (a tank, a lantern, a cap) at the far end; a small heap
// round the foot over the sim's mound.
import {
  damageRng,
  type DamageMeshWriter, type DamagePieceWriter, type DamageStageResult, type FractureSlot, type Rgb, type StructureDamageAnatomy, type Vec3,
} from '../../destructionKit.ts';
import {
  FacePen, HEAP_LIFT_M, Mesh, bodyCentre, cross3, extrasOf, fallbackSurface, heapChunk, heapSkin, norm3, remnantWall, type MoundHeight,
} from './fracture.ts';

type Writers = { mesh: DamageMeshWriter; pieces: DamagePieceWriter };

/** What a shaft's anatomy carries for its collapse beside the house surfaces (damage.ts describeShaft). */
interface ShaftExtras {
  crown: { y0: number; y1: number; x0: number; x1: number; z0: number; z1: number; bucket: string; tint: Rgb } | null;
}

export function shaftOf(anatomy: StructureDamageAnatomy): ShaftExtras | null {
  const k = anatomy.kitPlan as { damage?: { shaft?: ShaftExtras } } | undefined;
  return k?.damage?.shaft ?? null;
}

/**
 * A drum of the shaft lying on the ground: centre `c`, its long axis `axis` (horizontal), half length `l`, half width
 * `w` across it and half height `h`, its corners chamfered (a stack's octagon, a minaret's dressed corners), rolled by
 * `roll` about its axis; eight long faces and two broken ends, in its bucket.
 */
function lyingDrum(mesh: Mesh, c: Vec3, axis: Vec3, l: number, w: number, h: number, roll: number, tint: Rgb, rng: () => number): void {
  if (!mesh.fits(8 * 4 + 2 * 9)) return;
  const side0 = norm3([-axis[2], 0, axis[0]]), up0: Vec3 = [0, 1, 0];
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const side: Vec3 = [side0[0] * cr + up0[0] * sr, side0[1] * cr + up0[1] * sr, side0[2] * cr + up0[2] * sr];
  const up: Vec3 = [-side0[0] * sr + up0[0] * cr, -side0[1] * sr + up0[1] * cr, -side0[2] * sr + up0[2] * cr];
  const ch = 0.3 * Math.min(w, h);
  const ring: Array<[number, number]> = [[w - ch, h], [w, h - ch], [w, -(h - ch)], [w - ch, -h], [-(w - ch), -h], [-w, -(h - ch)], [-w, h - ch], [-(w - ch), h]];
  // the broken ends stand ragged: each end's ring pushed in or out along the axis a little
  const rag = [ring.map(() => (rng() - 0.5) * 0.35 * Math.min(w, h)), ring.map(() => (rng() - 0.5) * 0.35 * Math.min(w, h))];
  const P = (end: number, k: number): Vec3 => {
    const [s0, u0] = ring[k], a = end * l + rag[end > 0 ? 1 : 0][k];
    return [c[0] + axis[0] * a + side[0] * s0 + up[0] * u0, c[1] + axis[1] * a + side[1] * s0 + up[1] * u0, c[2] + axis[2] * a + side[2] * s0 + up[2] * u0];
  };
  for (let k = 0; k < 8; k++) {
    const j = (k + 1) % 8;
    const mid: [number, number] = [(ring[k][0] + ring[j][0]) / 2, (ring[k][1] + ring[j][1]) / 2];
    const n = norm3([side[0] * mid[0] + up[0] * mid[1], side[1] * mid[0] + up[1] * mid[1], side[2] * mid[0] + up[2] * mid[1]]);
    const lit = 0.7 + 0.3 * Math.max(0, n[1]);
    mesh.quadUvAlong(P(-1, k), P(1, k), P(1, j), P(-1, j), n, 0, [tint[0] * lit, tint[1] * lit, tint[2] * lit]);
  }
  for (const end of [-1, 1]) {
    const n: Vec3 = [axis[0] * end, axis[1] * end, axis[2] * end], dark = 0.62;
    const centre: Vec3 = [c[0] + axis[0] * end * l, c[1] + axis[1] * end * l, c[2] + axis[2] * end * l];
    const ids = [mesh.rawVertex(centre, n, 0.5, 0.5, [tint[0] * dark * 0.85, tint[1] * dark * 0.85, tint[2] * dark * 0.85])];
    const pts: Vec3[] = [];
    for (let k = 0; k < 8; k++) { const q = P(end, k); pts.push(q); ids.push(mesh.rawVertex(q, n, ring[k][0] * 0.5 + 0.5, ring[k][1] * 0.5 + 0.5, [tint[0] * dark, tint[1] * dark, tint[2] * dark])); }
    for (let k = 0; k < 8; k++) {
      const j = (k + 1) % 8, a = pts[k], b = pts[j];
      // wound to face out of the end, whichever way the ring runs round the axis
      const g = cross3([a[0] - centre[0], a[1] - centre[1], a[2] - centre[2]], [b[0] - centre[0], b[1] - centre[1], b[2] - centre[2]]);
      if (g[0] * n[0] + g[1] * n[1] + g[2] * n[2] >= 0) mesh.rawTriangle(ids[0], ids[1 + k], ids[1 + j]); else mesh.rawTriangle(ids[0], ids[1 + j], ids[1 + k]);
    }
  }
}

/**
 * A shaft topples (§16.3 Collapse, for a tall narrow body): its lowest band stands to a ragged stump in its own courses
 * (the corners higher), the rest lies along the ground in drums of the bands it broke into — each its section there,
 * turned a little off the line and rolled — with its own rubble in the breaks; its crown crumpled at the end; a heap
 * round the foot over the sim's mound; the bricks and the cap thrown down the line.
 */
export function collapseShaft(anatomy: StructureDamageAnatomy, seed: number, out: Writers, mound: MoundHeight): DamageStageResult {
  const rng = damageRng(seed);
  const mesh = new Mesh(out.mesh);
  // (dcore 2026-10-10) a shaft that comes down as bodies (fx/collapseBodies.ts: its stump its own courses, its drums and
  // its crown falling where they fall): the heap round its foot and a few bursts off it only
  const bodies = (out as { bodies?: boolean }).bodies === true;
  const bands = anatomy.storeys, b0 = bands[0];
  if (!b0) return { cuts: [], hides: [{ section: null, partClass: null }] };
  const extras = extrasOf(anatomy), shaft = shaftOf(anatomy);
  const [cx, cz] = bodyCentre(anatomy);
  const H = bands[bands.length - 1].y1 - b0.y0;
  // 1. the stump: a metre to three and a half over the heap banked round its foot (the sim's mound stands high round a
  //    narrow shaft), in the lowest bands' own courses, ragged, its corners higher; it runs on into the band above
  //    where it stands that high
  const stumpH = 1.2 + rng() * Math.min(2.3, H * 0.15);
  const baseY = b0.y0;
  const lines = b0.faces.map((f) => {
    const half = f.width / 2, lobes = Array.from({ length: 4 }, () => [rng() * 2 - 1, rng() * Math.PI * 2]);
    // the stump's top over the shaft's foot along this face
    return (u: number): number => {
      let v = 0;
      for (let k = 0; k < lobes.length; k++) v += lobes[k][0] * Math.sin(u * (k + 1) * 2.1 + lobes[k][1]) / (k + 1);
      const corner = Math.max(0, 1 - (half - Math.abs(u)) / 0.5) * 0.5;
      const banked = Math.max(0, mound(f.origin[0] + f.u[0] * u, f.origin[2] + f.u[2] * u) + HEAP_LIFT_M - (f.origin[1] - baseY));
      return Math.max(0.4, banked + stumpH * (1 + 0.3 * v) + corner);
    };
  });
  for (const band of bodies ? [] : bands.slice(0, 2)) {
    band.faces.forEach((f, k) => {
      const floor = f.origin[1] - baseY, line = lines[k];
      // (a face whose stump stays under this band's floor everywhere along it draws nothing here)
      let reaches = false;
      for (let t = -0.5; t <= 0.5 && !reaches; t += 0.125) reaches = line(t * f.width) > floor + 0.2;
      if (!reaches) return;
      const here = (u: number): number => Math.min(f.height, Math.max(0.15, line(u) - floor));
      remnantWall(mesh, new FacePen(f, extras?.surfaces.get(f.section) ?? fallbackSurface(f)), anatomy, rng, here);
    });
  }
  // 2. the heap round the foot over the sim's mound (a hand over it), in the walls' own material
  const top = (x: number, z: number): number => { const m = mound(x, z); return m + HEAP_LIFT_M * Math.max(0, Math.min(1, (m - 0.12) / 0.5)); };
  const slots = anatomy.rubble.filter((s) => s.share > 0.005);
  heapSkin(mesh, anatomy, slots, top, cx, cz, rng);
  // 3. the fall: the drums along a line from the stump, out of the foot's reach — the line it toppled along when the
  //    presentation names it (the blow's direction, body frame: structureStages structureTopple), else its own
  const ang = rng() * Math.PI * 2;
  const given = (out as Writers & { fallAxis?: [number, number] }).fallAxis;
  const gl = given ? Math.hypot(given[0], given[1]) : 0;
  const axis: Vec3 = given && gl > 1e-3 ? [given[0] / gl, 0, given[1] / gl] : [Math.cos(ang), 0, Math.sin(ang)];
  const foot = Math.max(b0.faces[0].width, b0.faces[1].width) / 2;
  let along = foot + 0.3 + rng() * 0.5, from = b0.y0 + stumpH + Math.max(0, mound(cx, cz));
  const wall: FractureSlot = b0.faces[0].layers[b0.faces[0].layers.length - 1] ?? anatomy.rubble[0];
  for (let k = 0; k < (bodies ? 0 : bands.length); k++) {
    const b = bands[k], y0 = Math.max(from, b.y0);
    if (b.y1 - y0 < 0.4) continue;
    const across = (b.faces[0].width + b.faces[2].width) / 4, thick = (b.faces[1].width + b.faces[3].width) / 4;
    const pieces = b.y1 - y0 > 3.5 ? 2 : 1;
    const slot = b.faces[0].layers[b.faces[0].layers.length - 1] ?? wall;
    for (let p = 0; p < pieces; p++) {
      const L = (b.y1 - y0) / pieces * (0.85 + rng() * 0.15);
      const yaw = (rng() - 0.5) * 0.35, roll = (rng() - 0.5) * 0.5;
      const dir: Vec3 = [axis[0] * Math.cos(yaw) - axis[2] * Math.sin(yaw), 0, axis[0] * Math.sin(yaw) + axis[2] * Math.cos(yaw)];
      const mx = cx + axis[0] * (along + L / 2), mz = cz + axis[2] * (along + L / 2);
      const rest = Math.max(across, thick) * 0.85;
      if (mesh.begin(b.faces[0].bucket, 'rubble')) {
        lyingDrum(mesh, [mx, top(mx, mz) + rest * 0.9, mz], dir, L / 2, across, thick, roll, b.faces[0].layers[0]?.tint ?? slot.tint, rng);
      }
      // the break behind it: its rubble
      if (mesh.begin(slot.bucket, 'rubble')) {
        for (let c = 0; c < 8; c++) {
          const gx = cx + axis[0] * (along - 0.2 + rng() * 0.6) + (rng() - 0.5) * across * 2.4;
          const gz = cz + axis[2] * (along - 0.2 + rng() * 0.6) + (rng() - 0.5) * across * 2.4;
          const sx = 0.12 + rng() * 0.22, sy = 0.08 + rng() * 0.14, sz = 0.1 + rng() * 0.2;
          heapChunk(mesh, slot, gx, top(gx, gz) + sy * 0.4, gz, sx, sy, sz, rng() * Math.PI, (rng() - 0.5) * 0.9, rng);
        }
      }
      along += L + 0.25 + rng() * 0.6;
    }
    from = b.y1;
  }
  // 4. the crown at the far end: crumpled where it struck
  const crown = shaft?.crown;
  if (crown && !bodies && mesh.begin(crown.bucket, 'rubble')) {
    const w = (crown.x1 - crown.x0) / 2, d = (crown.z1 - crown.z0) / 2, h = (crown.y1 - crown.y0) / 2;
    const mx = cx + axis[0] * (along + Math.max(w, h)), mz = cz + axis[2] * (along + Math.max(w, h));
    lyingDrum(mesh, [mx, top(mx, mz) + Math.min(w, d) * 0.7, mz], axis, h * 0.9, w * 0.92, d * 0.75, (rng() - 0.5) * 0.9, crown.tint, rng);
  }
  mesh.end();
  // 5. the throw: the shaft's units down the line
  const reach = bodies ? foot + 1 : along;
  for (let i = 0; i < (bodies ? Math.floor(out.pieces.capacity / 4) : out.pieces.capacity); i++) {
    const t = rng(), slot = slots[Math.floor(rng() * slots.length)] ?? wall;
    if (!slot) break;
    // (dcore 2026-10-09) a shaft the presentation toppled lies on the ground when this is laid: its courses burst off
    // the line where it struck, low; otherwise they rain down it from the height they fell from
    const x = cx + axis[0] * reach * t, z = cz + axis[2] * reach * t;
    // (bodies: they burst off the stump as the shaft goes, low)
    const y = given || bodies ? 0.4 + rng() * 1.2 : 0.5 + (1 - t) * 0.5 * H + rng() * 2;
    const spin = rng() * Math.PI * 2, shape = slot.material === 'brick' ? 'brick' : slot.material === 'adobe' ? 'clod' : slot.material === 'plaster' ? 'plate' : 'block';
    if (!out.pieces.push(slot.bucket, shape, Math.floor(rng() * 4), x, y, z, 0, Math.sin(spin / 2), 0, Math.cos(spin / 2),
      0.18 + rng() * 0.2, 0.09 + rng() * 0.1, 0.12 + rng() * 0.16, slot.tint[0], slot.tint[1], slot.tint[2],
      axis[0] * (1 + rng() * 2) + (rng() - 0.5), given || bodies ? 0.5 + rng() * 2.5 : -1 - rng() * 2, axis[2] * (1 + rng() * 2) + (rng() - 0.5))) break;
  }
  return { cuts: [], hides: [{ section: null, partClass: null }] };
}
