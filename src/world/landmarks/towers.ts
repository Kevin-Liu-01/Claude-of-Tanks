// src/world/landmarks/towers.ts — the towers (the landmarks lane, 2026-10-05): the water tower (a railway's octagonal
// brick shaft under its timber tank house, the Soviet steel Rozhnovsky tower, a timber trestle tank), the windmills
// (the Kursk governorate's post mill and smock mill, the Dutch brick tower mill with its stage), the free-standing
// belfry, the Dalmatian campanile, the fire lookout and a reservoir's valve tower with its footbridge. Sizes from the
// type: a railway water tower of the 1880s stands 16-20 m, a smock mill's cap 10-12 m with sails of 9-10 m, a campanile
// 25-45 m, the Roer dams' valve towers 15-20 m over the water.
import { LocalFrame, PartSink, faceBox, facePoint, normalize3, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { emitRoof, roofGeometry, type RoofSpec } from '../maps/regional/house.ts';
import { archSurround, archWindow, archedBody, archedSlab, bar, cornerPilasters, cross, dome, drum, extrude, moulding, railing, revolve, smoothRender, tentRoof, type ArchHole, LIMEWASH_UV } from './kit.ts';
import { ageWall } from './age.ts';
import type { LandmarkBuilder } from './types.ts';
import { finishLandmark, piece } from './pieces.ts';
import { doorUnit } from '../maps/regional/openings.ts';

const IRON_RED = rgb(0x7a3b2e), IRON_GREEN = rgb(0x4f7d5a), GILT = rgb(0xb8933e), FRAME_WHITE = rgb(0xe8e4da);
const BOARD_GREY = rgb(0x7d7466), TIMBER = rgb(0x6a5440), TIMBER_DARK = rgb(0x4a3b2e);
const STEEL_GREY = rgb(0x8a9196), CANVAS = rgb(0xd9d0bc), BELL = rgb(0x5a4a32), IRON = rgb(0x2b2d2e);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const OCT = Math.PI / 8;

/** A door leaf on a face (boarded), flush in a shallow reveal. */
function plankDoor(sink: PartSink, face: Face, u: number, y0: number, w: number, h: number, colour: Rgb, o = -0.12): void {
  sink.quad('structureWood', facePoint(face, u - w / 2, y0, o), facePoint(face, u + w / 2, y0, o), facePoint(face, u + w / 2, y0 + h, o),
    facePoint(face, u - w / 2, y0 + h, o), { colour, decor: true });
}

// ---------------------------------------------------------------------------------------------------------- water tower

/**
 * Four lattice sails on a hub at (0, y, z) in the x-y plane (the sails face +z), turned `turn` radians. Each sail is a
 * named piece (props lane A, E12, landmarks/pieces.ts): one comes off at the first damage, the rest when the mill is
 * breached, each laid flat where it lands.
 */
function sails(sink: PartSink, y: number, z: number, length: number, width: number, turn: number, colour: Rgb, cloth: number): void {
  for (let k = 0; k < 4; k++) {
    piece(sink, { name: `sail-${k}`, kind: 'detach', at: k === 0 ? 'damaged' : 'breached', fall: 'flat', toward: [0, 1], clear: 1.5 }, (s) => sail(s, k, y, z, length, width, turn, colour, cloth));
  }
}
function sail(sink: PartSink, k: number, y: number, z: number, length: number, width: number, turn: number, colour: Rgb, cloth: number): void {
  const opts = { colour, decor: true, exposed: true };
  {
    const a = turn + k * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    const tip: Vec3 = [ca * length, y + sa * length, z];
    sink.member('structureWood', [0, y, z], tip, 0.26, 0.2, [0, 0, 1], opts, 0.1);
    // the sail frame trailing the whip: its outer edge and the bars across
    const px = -sa, py = ca;
    const inner = length * 0.2;
    const a0: Vec3 = [ca * inner + px * width, y + sa * inner + py * width, z + 0.05], a1: Vec3 = [ca * length + px * width, y + sa * length + py * width, z + 0.05];
    sink.member('structureWood', a0, a1, 0.1, 0.08, [0, 0, 1], { ...opts }, 0.04);
    const bars = Math.round((length - inner) / 0.55);
    for (let b = 0; b <= bars; b++) {
      const r = inner + (length - inner) * b / bars;
      sink.member('structureWood', [ca * r, y + sa * r, z + 0.05], [ca * r + px * width, y + sa * r + py * width, z + 0.05], 0.06, 0.05, [0, 0, 1],
        { ...opts, fine: b % 2 === 1 }, 0.025);
    }
    // canvas spread on part of the frame (a mill at work), or bare lattice
    if (cloth > 0) {
      const r0 = inner + 0.2, r1 = inner + (length - inner) * cloth;
      sink.quad('structureWood', [ca * r0 + px * 0.12, y + sa * r0 + py * 0.12, z + 0.03], [ca * r1 + px * 0.12, y + sa * r1 + py * 0.12, z + 0.03],
        [ca * r1 + px * (width - 0.06), y + sa * r1 + py * (width - 0.06), z + 0.03], [ca * r0 + px * (width - 0.06), y + sa * r0 + py * (width - 0.06), z + 0.03],
        { colour: CANVAS, decor: true });
      sink.quad('structureWood', [ca * r0 + px * (width - 0.06), y + sa * r0 + py * (width - 0.06), z + 0.025], [ca * r1 + px * (width - 0.06), y + sa * r1 + py * (width - 0.06), z + 0.025],
        [ca * r1 + px * 0.12, y + sa * r1 + py * 0.12, z + 0.025], [ca * r0 + px * 0.12, y + sa * r0 + py * 0.12, z + 0.025], { colour: shade(CANVAS, 0.8), decor: true });
    }
  }
}

/**
 * The windmill: 'post' — the Kursk governorate's stolbovka, a boarded body on its post and trestle turned to the wind by
 * the tail pole, its ladder to the door; 'smock' — the shatrovka (a Dutch achtkant), a tapering boarded octagon on a
 * brick base under a turning cap; 'tower' — the Low Countries' brick tower mill with its stage and thatched cap.
 */
export const windmill: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const style = String(ctx.params.style), H = Math.max(9, Number(ctx.params.height));
  const base = -0.6 - ctx.groundFall;
  const turn = ctx.variant() * Math.PI / 2;
  const cloth = ctx.variant() < 0.5 ? 0 : 0.35 + ctx.variant() * 0.5;
  if (style === 'post') {
    const bw = 3.8, bd = 4.6, bh = 5.0, lift = Math.max(3.2, H - bh - 1.8);
    // (227, lane B; the anti-raft floor: the mill fell as a heap at its feet, 13 % of its height) the trestle on its stone
    // piers and the post one open frame (pieces.ts 'lattice') under the hinge: it stands through the fall (world/
    // toppleHinge.ts; the piers in it, what the crosstrees stand on); the body with its windshaft comes off the post and goes
    // over, its roof torn off it, the tail pole and the ladder down flat, the sails off it (the 227 films: one frame with the
    // body, cut at the hinge, stood half a body on the trestle; the post run up into the body stood as a bare mast)
    const hubY = lift + bh * 0.8, hubZ = bd / 2 + 0.7;
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 38, eave: 0.25, verge: 0.3, thickness: 0.1, bucket: 'roof', ridge: 'saddle' };
    piece(sink, { name: 'frame', kind: 'lattice', at: 'collapse', fall: 'slump' }, (s) => {
      for (const [x, z] of [[-2.6, 0], [2.6, 0], [0, -2.6], [0, 2.6]] as const) s.span('stone', x - 0.42, base, z - 0.42, x + 0.42, 0.55, z + 0.42);
      s.span('structureWood', -2.8, 0.55, -0.2, 2.8, 0.95, 0.2, { colour: TIMBER_DARK });
      s.span('structureWood', -0.2, 0.55, -2.8, 0.2, 0.95, 2.8, { colour: TIMBER_DARK });
      revolve(s, 'structureWood', 0, 0, [[0.3, 0.55], [0.26, lift]], 8, { colour: TIMBER_DARK });
      for (const [x, z] of [[-2.4, 0], [2.4, 0], [0, -2.4], [0, 2.4]] as const) bar(s, 'structureWood', [x, 0.95, z], [x * 0.07, lift - 0.6, z * 0.07], 0.2, { colour: TIMBER_DARK });
    });
    piece(sink, { name: 'roof', kind: 'detach', at: 'collapse', fall: 'drop' }, (s) => s.placed(0, 0, lift, 0, () => emitRoof(s, roofGeometry(bw, bd, bh, roof), roof)));
    piece(sink, { name: 'body', kind: 'detach', at: 'collapse', fall: 'topple' }, (s) => {
      // the body: boards, the door at the back up the ladder
      s.placed(0, 0, lift, 0, () => {
        // (the maps lane, 2026-10-16; the building-integrity gate: 5.7 m2 of the body seen into from below, its underside
        // open over the post) the body's floor, the joists' boards under the walls, the post's head under it
        s.span('structureWood', -bw / 2, -0.16, -bd / 2, bw / 2, 0, bd / 2, { colour: TIMBER_DARK });
        const f = archedBody(s, 'structureWood', 0, 0, bw, bd, 0, bh, {}, 0, { colour: BOARD_GREY });
        plankDoor(s, f.back, 0, 0.1, 0.9, 1.8, TIMBER_DARK, 0.02);
        for (let k = -3; k <= 3; k++) {
          for (const name of ['left', 'right'] as const) {
            s.box('structureWood', facePoint(f[name], k * bd / 7, bh / 2, 0.03), [0.03, bh / 2, 0.03], { colour: shade(BOARD_GREY, 0.8), decor: true, fine: true },
              new LocalFrame(f[name].u, [0, 1, 0], f[name].out, [0, 0, 0]), { nz: true });
          }
        }
      });
      s.member('structureWood', [0, hubY - 0.1, bd / 2 - 0.5], [0, hubY + 0.05, hubZ], 0.34, 0.34, [1, 0, 0], { colour: TIMBER_DARK, exposed: true }, 0.17);
    });
    // the tail pole to the ground and the ladder up to the door: they come down flat off the body's back (with it, they
    // propped the fallen body in the air)
    piece(sink, { name: 'tail', kind: 'detach', at: 'collapse', fall: 'flat' }, (s) => {
      bar(s, 'structureWood', [0, lift + 0.3, -bd / 2], [0, 0.5, -bd / 2 - 5.2], 0.22, { colour: TIMBER_DARK, decor: true });
      for (const sx of [-0.5, 0.5]) bar(s, 'structureWood', [sx, lift, -bd / 2 - 0.1], [sx, 0.1, -bd / 2 - 3.0], 0.12, { colour: TIMBER_DARK, decor: true });
      for (let k = 1; k < 9; k++) {
        const t = k / 9, y = lift * (1 - t) + 0.1 * t, z = -bd / 2 - 0.1 - 2.9 * t;
        s.span('structureWood', -0.5, y - 0.03, z - 0.08, 0.5, y + 0.03, z + 0.08, { colour: TIMBER, decor: true, fine: true });
      }
    });
    sails(sink, hubY, hubZ, Math.min(9.5, hubY - 0.8), 1.15, turn, TIMBER, cloth);
    return { parts: finishLandmark(sink) };
  }
  const tower = style === 'tower';
  // the base: brick (an octagonal plinth storey for the smock mill, the round tower itself for a tower mill)
  const r0 = tower ? 4.3 : 4.0, capY = H - 2.2;
  // the tower mill's sails (their span with the tower's height) and its stage (stelling) low enough that the lowest
  // sail tip sweeps clear over the stage's railing (1.7 m: the railing and the miller's reach to set the cloth)
  const sailLen = tower ? Math.min(11.5, capY * 0.6) : 0, towerR = (y: number) => r0 - 0.26 * r0 * Math.max(0, y - 0.6) / (capY - 0.6);
  if (tower) {
    // (props census #22, Lane C 2026-10-16: "the brick tower is one smooth 16-gon stone revolve with no courses and no
    // plinth chamfer") the tower in three named pieces of brick (pieces.ts): the shaft to the stage stands, the upper
    // shaft over the stage topples when the mill is breached and the stage itself slumps with it; the plinth with its
    // chamfered water table and the tarred foot, a band of brick every course of the shaft, the door in a brick doorcase
    // with its leaf set back in it, the windows in brick surrounds.
    // (a facet, not a corner, to the front and to each quarter: the door and the windows sit flat on the brick)
    const sy = Math.min(capY * 0.42, capY + 1.3 - sailLen - 1.7), rs = r0 * (1 - 0.26 * sy / capY) + 2.2;
    const F = Math.PI / 16, shaft = (y: number): readonly [number, number] => [r0 - 0.26 * r0 * Math.max(0, y - 0.62) / (capY - 0.62), y];
    // (the shaft's head under the upper shaft: its wall's top and inside, which the toppled top leaves open)
    const head = shaft(sy + 0.3), inner = head[0] - 0.6;
    revolve(sink, 'stone', 0, 0, [[r0 + 0.3, base], [r0 + 0.3, 0.32], [r0 + 0.05, 0.62], shaft(0.62), head, [inner, head[1]], [inner, head[1] - 0.9]], 16, {}, F);
    // the tarred foot of the shaft, a skin over the brick from the water table up
    revolve(sink, 'stone', 0, 0, [[shaft(0.62)[0] + 0.025, 0.62], [shaft(1.5)[0] + 0.025, 1.5], [shaft(1.5)[0], 1.53]], 16,
      { decor: true, tint: [0.36, 0.34, 0.32] }, F);
    const band = (y: number, s: PartSink, out = 0.045, h = 0.12): void => {
      const r = shaft(y)[0] + out;
      revolve(s, 'stone', 0, 0, [[r - out, y - h / 2], [r, y - h / 2 + 0.02], [r, y + h / 2], [r - out, y + h / 2]], 16, { decor: true, tint: [0.92, 0.88, 0.84] }, F);
    };
    for (let y = 2.6; y < sy - 0.6; y += 2.2) band(y, sink);
    band(sy - 0.08, sink, 0.09, 0.22);
    piece(sink, { name: 'tower-top', kind: 'detach', at: 'breached', fall: 'topple' }, (s) => {
      revolve(s, 'stone', 0, 0, [[0, sy + 0.3], shaft(sy + 0.3), shaft(capY), [0, capY]], 16, {}, F);
      band((sy + capY) / 2, s);
      band(capY - 0.18, s, 0.08, 0.26);
      for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        // (each on the tapering wall at its own height, the 16-sided tower's facet a little inside its corner radius)
        const y0 = capY * 0.62, rw = towerR(y0 + 0.6) * Math.cos(F) + 0.02;
        const f: Face = { origin: [Math.sin(a) * rw, 0, Math.cos(a) * rw], u: [Math.cos(a), 0, -Math.sin(a)], out: [Math.sin(a), 0, Math.cos(a)], width: 1 };
        // its brick surround standing out of the wall: the jambs, the arch's soffit over the head, the sill
        for (const side of [-1, 1]) faceBox(s, 'stone', f, side * 0.45, y0 + 0.62, 0.08, 0.2, 1.4, 0.16, { decor: true });
        faceBox(s, 'stone', f, 0, y0 + 1.36, 0.08, 1.1, 0.24, 0.16, { decor: true });
        faceBox(s, 'stone', f, 0, y0 - 0.05, 0.1, 1.0, 0.1, 0.2, { decor: true });
        archWindow(s, f, { u: 0, w: 0.7, y0, spring: y0 + 1.0, form: 'segmental', rise: 0.18 }, 0, FRAME_WHITE, false, { bars: false, coarse: true });
      }
    });
    // the stage (stelling) round the tower at a third of its height, its railing and the struts under it
    piece(sink, { name: 'stage', kind: 'detach', at: 'breached', fall: 'slump' }, (s) => {
      // the deck: its soffit, its edge and its boards (a closed ring round the tower)
      revolve(s, 'structureWood', 0, 0, [[0.5, sy], [rs, sy], [rs, sy + 0.18], [0.5, sy + 0.18]], 16, { colour: TIMBER });
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), rr = r0 * (1 - 0.26 * (sy - 2.2) / capY);
        bar(s, 'structureWood', [ca * rr, sy - 2.2, sa * rr], [ca * (rs - 0.2), sy, sa * (rs - 0.2)], 0.14, { colour: TIMBER_DARK, decor: true });
        const b = (k + 1) / 8 * Math.PI * 2;
        railing(s, [Math.cos(a) * rs, Math.sin(a) * rs], [Math.cos(b) * rs, Math.sin(b) * rs], 0.95, TIMBER_DARK, { pitch: 1.8, base: sy + 0.18 });
      }
    });
    // the door in its brick doorcase: two jambs and the head standing out of the shaft, the leaf set back between them
    const rd = towerR(1.6) * Math.cos(F) + 0.02;
    const df: Face = { origin: [0, 0, rd], u: [1, 0, 0], out: [0, 0, 1], width: 1 };
    for (const side of [-1, 1]) faceBox(sink, 'stone', df, side * 0.72, 1.65, 0.16, 0.3, 2.1, 0.36);
    faceBox(sink, 'stone', df, 0, 2.86, 0.16, 1.74, 0.36, 0.36);
    faceBox(sink, 'stone', df, 0, 0.55, 0.3, 1.5, 0.14, 0.6, { decor: true });
    plankDoor(sink, df, 0, 0.62, 1.14, 2.08, IRON_GREEN, 0.03);
  } else {
    const body = ctx.mapId === 'polders' ? 'straw' : 'structureWood';
    plankDoor(sink, { origin: [0, 0, r0 - 0.1], u: [1, 0, 0], out: [0, 0, 1], width: 1 }, 0, 0.3, 1.0, 1.25, TIMBER_DARK, 0.02);
    // (227, lane B; the anti-raft floor: the mill fell as a heap at its feet, 16 % of its height) the boarded smock over its
    // brick base one frame of posts and boards (pieces.ts 'lattice'): it buckles over its lower storeys (world/toppleHinge.ts)
    // and goes over along the blow
    piece(sink, { name: 'frame', kind: 'lattice', at: 'collapse', fall: 'topple' }, (s) => {
      // (its brick base in it: the smock stands in the fall on what stands)
      revolve(s, 'stone', 0, 0, [[r0 / Math.cos(OCT), base], [r0 / Math.cos(OCT), 1.6], [(r0 - 0.15) / Math.cos(OCT), 1.6]], 8, {}, OCT);
      revolve(s, body, 0, 0, [[(r0 - 0.15) / Math.cos(OCT), 1.6], [2.0 / Math.cos(OCT), capY]], 8, body === 'straw' ? {} : { colour: BOARD_GREY }, OCT);
      for (const a of [Math.PI / 4, Math.PI * 1.25]) {
        const rr = (r0 - 0.15) + (2.0 - (r0 - 0.15)) * 0.45;
        const f: Face = { origin: [Math.sin(a) * (rr + 0.02), 0, Math.cos(a) * (rr + 0.02)], u: [Math.cos(a), 0, -Math.sin(a)], out: [Math.sin(a), 0, Math.cos(a)], width: 1 };
        s.quad('glass', facePoint(f, -0.3, capY * 0.5, 0), facePoint(f, 0.3, capY * 0.5, 0), facePoint(f, 0.3, capY * 0.5 + 0.6, 0), facePoint(f, -0.3, capY * 0.5 + 0.6, 0),
          { decor: true });
      }
    });
  }
  // the cap: a boat-shaped gable turning on the curb, the windshaft out of its breast, the sails, the tail
  const capW = tower ? 4.8 : 4.4, capD = tower ? 6.0 : 5.4;
  const capRoof: RoofSpec = { kind: tower ? 'hip' : 'gable', pitchDeg: tower ? 55 : 48, eave: 0.25, verge: 0.3, thickness: 0.12,
    bucket: tower ? 'straw' : 'roof', ridge: tower ? 'round' : 'saddle' };
  const rg = roofGeometry(capW, capD, capY + 0.2, capRoof);
  // (the cap comes off its curb when the mill is breached: props lane A, E12)
  piece(sink, { name: 'cap', kind: 'detach', at: 'breached', fall: 'drop' }, (s) => {
    s.span('structureWood', -capW / 2 + 0.2, capY - 0.1, -capD / 2 + 0.3, capW / 2 - 0.2, capY + 0.2, capD / 2 - 0.3, { colour: TIMBER_DARK });
    emitRoof(s, rg, capRoof);
    if (!tower && rg.gable) {
      for (const end of [1, -1]) {
        const f: Face = { origin: [0, 0, end * capD / 2], u: [end, 0, 0], out: [0, 0, end], width: capW };
        s.prism('structureWood', rg.gable.map(([u, y]) => facePoint(f, u, y, 0)).reverse() as Vec3[], [-f.out[0], 0, -f.out[2]], 0.2, { colour: BOARD_GREY });
      }
    }
  });
  const hubY = capY + 1.3, hubZ = capD / 2 + 0.8;
  sails(sink, hubY, hubZ, tower ? sailLen : Math.min(10, hubY - 1.2), tower ? 1.45 : 1.2, turn, TIMBER, cloth);
  // the windshaft out of the cap's breast; the tail pole and its struts down from the cap's back, the capstan wheel at its
  // foot (the miller turns the cap). (227, lane B) a smock mill's go over with its frame (one more open frame: its body
  // stands no more than its brick base); a tower mill's stand with its brick
  const stageY = Math.min(capY * 0.42, capY + 1.3 - sailLen - 1.7);
  const footY = tower ? stageY + 0.9 : 0.9, footZ = tower ? -(towerR(stageY) + 1.6) : -(r0 + 3.6);
  const gear = (s: PartSink): void => {
    s.member('structureWood', [0, hubY - 0.15, capD / 2 - 0.8], [0, hubY, hubZ], 0.4, 0.4, [1, 0, 0], { colour: TIMBER_DARK, exposed: true }, 0.2);
    bar(s, 'structureWood', [0, capY + 0.1, -capD / 2 + 0.3], [0, footY, footZ], 0.24, { colour: TIMBER_DARK, decor: true });
    for (const sx of [-1, 1]) bar(s, 'structureWood', [sx * capW * 0.4, capY + 0.05, -capD / 2 + 0.4], [0, footY + 2.2, footZ * 0.8], 0.14, { colour: TIMBER_DARK, decor: true });
    revolve(s, 'structureWood', 0, footZ - 0.2, [[0.9, footY - 0.05], [0.9, footY + 0.05]], 10, { colour: TIMBER, decor: true });
  };
  if (tower) gear(sink);
  else piece(sink, { name: 'tail', kind: 'lattice', at: 'collapse', fall: 'topple' }, gear);
  return { parts: finishLandmark(sink) };
};

// ---------------------------------------------------------------------------------------------------------- bell towers

/**
 * The Podhale belfry (a dzwonnica of the Tatra foothills' timber churches, Łopuszna's and Dębno's): the square tower's
 * battered lower storey clad in upright larch boards, the pent roof of shingles skirting it, the bell chamber (the
 * izbica) over it shingled all round with its tall louvred openings, the bell inside, and the steep tented roof of
 * shingles with its iron cross. `S` the side at the foot.
 */
function podhaleBelfry(sink: PartSink, H: number, S: number, base: number): ReturnType<LandmarkBuilder> {
  const q = Math.PI / 4, k = Math.SQRT2 / 2;
  const h1 = H * 0.46, S1 = S * 0.74, Si = S1 + 0.5, h2 = h1 + Math.max(3.0, H * 0.2);
  const boards = { colour: BOARD_GREY };
  sink.span('stone', -S / 2 - 0.12, base, -S / 2 - 0.12, S / 2 + 0.12, 0.4, S / 2 + 0.12);
  // the battered lower storey, its upright boards and their battens, the door
  revolve(sink, 'structureWood', 0, 0, [[S * k, 0.4], [S1 * k, h1 + 0.12]], 4, boards, q);
  for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
    for (let i = 1; i < 6; i++) {
      const u = -0.5 + i / 6;
      const a: Vec3 = [nx * S / 2 + nz * u * S, 0.45, nz * S / 2 - nx * u * S], b: Vec3 = [nx * S1 / 2 + nz * u * S1, h1 - 0.1, nz * S1 / 2 - nx * u * S1];
      const lean = (S - S1) / 2 / (h1 - 0.4), off = 0.04 / Math.sqrt(1 + lean * lean);
      bar(sink, 'structureWood', [a[0] + nx * off, a[1], a[2] + nz * off], [b[0] + nx * off, b[1], b[2] + nz * off], 0.06,
        { colour: TIMBER_DARK, decor: true, fine: true });
    }
  }
  {
    const lean = (S - S1) / 2 / (h1 - 0.4), zAt = (y: number) => S / 2 - lean * (y - 0.4) + 0.02;
    sink.quad('structureWood', [-0.55, 0.4, zAt(0.4)], [0.55, 0.4, zAt(0.4)], [0.55, 2.4, zAt(2.4)], [-0.55, 2.4, zAt(2.4)], { colour: TIMBER_DARK, decor: true });
  }
  // the shingled pent roof skirting the top of the lower storey
  revolve(sink, 'roof', 0, 0, [[(Si / 2 + 0.8) * Math.SQRT2, h1 - 0.95], [(Si / 2) * Math.SQRT2, h1 + 0.12]], 4, {}, q);
  // the izbica: shingled all round, its tall openings, the bell
  const holes: ArchHole[] = [-0.22, 0.22].map((u) => ({ u: u * Si, w: Si * 0.16, y0: h1 + 0.75, spring: h2 - 0.65, form: 'flat' as const }));
  archedBody(sink, 'roof', 0, 0, Si, Si, h1 + 0.1, h2, { front: holes, back: holes, left: holes, right: holes }, 0.18);
  sink.span('structureWood', -Si / 2 + 0.2, h1 + 0.1, -Si / 2 + 0.2, Si / 2 - 0.2, h1 + 0.3, Si / 2 - 0.2, { colour: TIMBER_DARK });
  const by = h2 - 0.75;
  revolve(sink, 'structureMetal', 0, 0, [[0.55, by - 1.05], [0.5, by - 0.85], [0.32, by - 0.35], [0.24, by - 0.08], [0, by]], 10, { colour: BELL, decor: true });
  sink.span('structureWood', -Si / 2 + 0.2, by, -0.1, Si / 2 - 0.2, by + 0.2, 0.1, { colour: TIMBER_DARK, decor: true });
  // the steep tented roof of shingles and its iron cross
  const top = h2 + Si * 1.2;
  revolve(sink, 'roof', 0, 0, [[(Si / 2 + 0.45) * Math.SQRT2, h2 - 0.15], [(Si / 2 + 0.45) * Math.SQRT2, h2], [0, top]], 4, {}, q);
  cross(sink, 'structureMetal', 0, top - 0.1, 0, 1.4, 'latin', IRON);
  return { parts: sink.finish() };
}

/**
 * The free-standing belfry (a monastery's or a town square's bell tower): a square base with an arched passage or a
 * door, the open bell stage with its bells, an octagon, and a crown — an onion, a tent, a needle or a helm.
 */
export const belfry: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const H = Math.max(14, Number(ctx.params.height)), S = Math.max(4, Number(ctx.params.side)), crown = String(ctx.params.crown);
  const base = -0.6 - ctx.groundFall, wall: RegionalBucket = 'plaster';
  if (String(ctx.params.style) === 'podhale') return podhaleBelfry(sink, Math.max(10, H), S, base);
  sink.span('stone', -S / 2 - 0.15, base, -S / 2 - 0.15, S / 2 + 0.15, 0.5, S / 2 + 0.15);
  const H1 = H * 0.36;
  const door: ArchHole = { u: 0, w: Math.min(2.2, S * 0.4), y0: 0.5, spring: Math.min(3.6, H1 - 1.5), form: 'round' };
  const win = (): ArchHole => ({ u: 0, w: 0.9, y0: H1 - 2.6, spring: H1 - 1.3, form: 'round' });
  const holes = { front: [door], back: [win()], left: [win()], right: [win()] };
  const f = archedBody(sink, wall, 0, 0, S, S, 0.5, H1, holes, 0.42);
  archSurround(sink, 'plaster', f.front, door, 0.28, 0.1);
  sink.quad('structureWood', facePoint(f.front, -door.w / 2, door.y0, -0.4), facePoint(f.front, door.w / 2, door.y0, -0.4),
    facePoint(f.front, door.w / 2, door.spring, -0.4), facePoint(f.front, -door.w / 2, door.spring, -0.4), { colour: TIMBER_DARK, decor: true });
  for (const name of ['back', 'left', 'right'] as const) for (const h of holes[name]) { archWindow(sink, f[name], h, 0.42, FRAME_WHITE, false); archSurround(sink, 'plaster', f[name], h, 0.14, 0.06); }
  moulding(sink, wall, S, S, H1 - 0.3, 0.3, 0.16);
  const S2 = S * 0.86, b0 = H1, b1 = H1 + Math.max(4, H * 0.22), t = 0.55;
  const spring = b1 - Math.min(2.2, S2 * 0.46) / 2 - 0.55;
  for (const [yaw, len] of [[0, S2], [Math.PI, S2], [Math.PI / 2, S2 - 2 * t], [-Math.PI / 2, S2 - 2 * t]] as const) {
    sink.placed(yaw, Math.sin(yaw) * (S2 / 2 - t / 2), 0, Math.cos(yaw) * (S2 / 2 - t / 2), () => archedSlab(sink, wall, -len / 2, len / 2, b0, b1, t,
      [{ u: 0, w: Math.min(2.2, len - 1.2), y0: b0 + 0.9, spring, form: 'round' }], { ends: true, top: true }));
  }
  sink.span(wall, -S2 / 2 + t, b0, -S2 / 2 + t, S2 / 2 - t, b0 + 0.2, S2 / 2 - t);
  revolve(sink, 'structureMetal', 0, 0, [[0.62, spring - 0.8], [0.56, spring - 0.6], [0.36, spring - 0.15], [0.25, spring + 0.2], [0, spring + 0.25]], 10, { colour: BELL, decor: true });
  sink.span('structureWood', -S2 / 2 + t, spring + 0.25, -0.09, S2 / 2 - t, spring + 0.43, 0.09, { colour: TIMBER_DARK, decor: true });
  moulding(sink, wall, S2, S2, b1 - 0.3, 0.3, 0.16);
  const R3 = S2 * 0.4;
  const top3 = drum(sink, wall, 0, b1, 0, R3, Math.max(1.8, H * 0.08), 8, { windows: 4 });
  if (crown === 'tent') {
    tentRoof(sink, 'structureMetal', 0, 0, R3 * 1.18, top3, Math.max(3, H - top3 - 2.4), 8, { colour: IRON_GREEN });
    const tip = H - 2.4;
    const head = dome(sink, 'structureMetal', 0, tip, 0, 0.45, 'onion', 10, { colour: GILT });
    cross(sink, 'structureMetal', 0, head - 0.05, 0, 1.5, 'orthodox', GILT);
  } else if (crown === 'spire' || crown === 'needle') {
    const cap = dome(sink, 'structureMetal', 0, top3, 0, R3, 'helm', 12, { colour: IRON_GREEN });
    revolve(sink, 'structureMetal', 0, 0, [[R3 * 0.22, cap - 0.2], [R3 * 0.04, H - 1.8], [0, H - 1.5]], 8, { colour: GILT });
    cross(sink, 'structureMetal', 0, H - 1.7, 0, 1.4, crown === 'needle' ? 'orthodox' : 'latin', GILT);
  } else {
    const neck = drum(sink, wall, 0, top3, 0, R3 * 0.6, 1.0, 10, {});
    const head = dome(sink, 'structureMetal', 0, neck, 0, R3 * 0.74, crown === 'helm' ? 'helm' : 'onion', 12, { colour: IRON_GREEN });
    cross(sink, 'structureMetal', 0, head - 0.05, 0, 1.6, 'orthodox', GILT);
  }
  return { parts: smoothRender(sink.finish(), LIMEWASH_UV), tints: { plaster: [1, 1, 0.99] } };
};

/**
 * The campanile (Dalmatia's and Istria's free-standing bell towers, Italy's): a slender square stone shaft divided into
 * stages by string courses, its corners stiffened by lesenes; its openings multiply as it rises, as on Rab's great
 * tower — slits at the foot, a monofora on each face of the middle stages, a bifora on each face of the top one —
 * then the open bell stage with paired round arches on a colonnette, a balustrade round the stone pyramid with a
 * pinnacle at each corner, the ball and the cross.
 */
export const campanile: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const H = Math.max(16, Number(ctx.params.height)), S = Math.max(3.6, Number(ctx.params.side));
  const base = -0.6 - ctx.groundFall;
  sink.span('stone', -S / 2 - 0.2, base, -S / 2 - 0.2, S / 2 + 0.2, 0.7, S / 2 + 0.2);
  // its stepped foot (gauntlet wave 158: "rises straight out of bare sandy dirt with no plinth, steps, paving"): a broad
  // step round the plinth and the flight up to the door
  sink.span('stone', -S / 2 - 0.75, base, -S / 2 - 0.75, S / 2 + 0.75, 0.35, S / 2 + 0.75, { decor: true });
  sink.span('stone', -0.9, base, S / 2 + 0.75, 0.9, 0.18, S / 2 + 1.05, { decor: true });
  const shaftTop = H * 0.68, bellTop = H * 0.82, stages = Math.max(3, Math.round(shaftTop / 6));
  const stageY = (k: number) => 0.7 + (shaftTop - 0.7) * k / stages;
  const slit = (y: number): ArchHole => ({ u: 0, w: 0.28, y0: y, spring: y + 1.1, form: 'round' });
  // the shaft stage by stage (archedFace cuts one row of openings a face): the door and a slit a face in the lowest, a
  // monofora a face in the middle ones, a bifora a face in the top one, each sill 1 m over its stage's string course
  type FaceHoles = Record<'front' | 'back' | 'left' | 'right', ArchHole[]>;
  let front: ReturnType<typeof archedBody> | null = null;
  let topStage: ReturnType<typeof archedBody> | null = null;
  for (let k = 0; k < stages; k++) {
    const y0 = stageY(k), y1 = stageY(k + 1);
    let holes: FaceHoles;
    if (k === 0) {
      const sy = Math.min(y1 - 1.6, y0 + (y1 - y0) * 0.55);
      holes = { front: [{ u: 0, w: 1.2, y0: 0.7, spring: 2.6, form: 'round' as const }], back: [slit(sy)], left: [slit(sy - 0.6)], right: [slit(sy + 0.4)] };
    } else {
      const last = k === stages - 1, wy0 = y0 + 1.0, h = Math.min(y1 - 0.9 - wy0, last ? 2.0 : 2.3);
      const w = last ? Math.min(0.55, S * 0.11) : Math.min(0.7, S * 0.14);
      const row = h < 1.2 ? [] : (last ? [-w / 2 - 0.12, w / 2 + 0.12] : [0]).map((u): ArchHole => ({ u, w, y0: wy0, spring: wy0 + h - w / 2, form: 'round' }));
      holes = { front: row, back: row, left: row, right: row };
    }
    const faces = archedBody(sink, 'stone', 0, 0, S, S, y0, y1, holes, 0.36);
    if (k === 0) front = faces;
    if (k === stages - 1) topStage = faces;
    // its age (age.ts): the grime washed down the stone from each string course and sill
    if (ctx.age) for (const name of ['front', 'back', 'left', 'right'] as const) {
      ageWall(sink, ctx.age, { face: faces[name], bucket: 'stone', area: { u0: -S / 2 + 0.3, u1: S / 2 - 0.3, y0: y0 + 0.1, y1: y1 - 0.3 },
        openings: holes[name], ledge: y1 - 0.22, grime: 0.24 });
    }
  }
  const f = front!;
  // (props census #5, lane B 2026-10-15; the judges: "the door leaf is one flat dark quad with no frame or ironwork") the
  // planked pair at the back of the arch's reveal in its frame, the iron straps across it, the boarded tympanum over it
  sink.recess = 0.34;
  try {
    doorUnit(sink, f.front, 0, 0.7, 1.2, 1.9, { leaf: TIMBER_DARK, frame: { bucket: 'structureWood', width: 0.08, out: 0.03, colour: TIMBER_DARK },
      steps: null, leafKind: 'plank', transom: false }, 0.7);
  } finally { sink.recess = 0; }
  for (const y of [1.05, 1.65, 2.3]) {
    sink.box('structureMetal', facePoint(f.front, 0, y, -0.3), [0.5, 0.025, 0.012], { colour: IRON, decor: true, fine: true },
      new LocalFrame(f.front.u, [0, 1, 0], f.front.out, [0, 0, 0]));
  }
  {
    const arc: Vec3[] = [];
    for (let i = 0; i <= 8; i++) { const a = Math.PI * i / 8; arc.push(facePoint(f.front, 0.6 * Math.cos(a), 2.6 + 0.6 * Math.sin(a), -0.33)); }
    sink.polygon('structureWood', arc, { colour: shade(TIMBER_DARK, 0.85), decor: true });
  }
  for (let k = 1; k <= stages; k++) moulding(sink, 'stone', S, S, stageY(k) - 0.2, 0.2, 0.08);
  // the lesenes up the corners
  cornerPilasters(sink, 'stone', 0, 0, S, S, 0.7, shaftTop - 0.2, Math.min(0.55, S * 0.1), 0.07);
  // (props census #5; the judges: "no corbel table under the bell stage") the corbel table under the last string course:
  // a corbel every half metre between the lesenes, a band laid on them
  for (const name of ['front', 'right', 'back', 'left'] as const) {
    const face = topStage![name], span = S - 2 * Math.min(0.55, S * 0.1) - 0.3, n = Math.max(3, Math.round(span / 0.5));
    for (let k = 0; k <= n; k++) faceBox(sink, 'stone', face, -span / 2 + span * k / n, shaftTop - 0.36, 0.06, 0.16, 0.26, 0.12, { decor: true });
    faceBox(sink, 'stone', face, 0, shaftTop - 0.21, 0.07, span + 0.16, 0.06, 0.14, { decor: true });
  }
  // the bell stage: each face a bifora (two round arches on a colonnette)
  const t = 0.5;
  for (const [yaw, len] of [[0, S], [Math.PI, S], [Math.PI / 2, S - 2 * t], [-Math.PI / 2, S - 2 * t]] as const) {
    const w = (len - 1.4) / 2;
    sink.placed(yaw, Math.sin(yaw) * (S / 2 - t / 2), 0, Math.cos(yaw) * (S / 2 - t / 2), () => archedSlab(sink, 'stone', -len / 2, len / 2, shaftTop, bellTop, t,
      [{ u: -w / 2 - 0.2, w, y0: shaftTop + 0.6, spring: bellTop - w / 2 - 0.5, form: 'round' }, { u: w / 2 + 0.2, w, y0: shaftTop + 0.6, spring: bellTop - w / 2 - 0.5, form: 'round' }],
      { ends: true, top: true }));
  }
  sink.span('stone', -S / 2 + t, shaftTop, -S / 2 + t, S / 2 - t, shaftTop + 0.25, S / 2 - t);
  revolve(sink, 'structureMetal', 0, 0, [[0.55, bellTop - 2.6], [0.5, bellTop - 2.45], [0.32, bellTop - 2.05], [0.22, bellTop - 1.75], [0, bellTop - 1.7]], 10,
    { colour: BELL, decor: true });
  // (the buildings stream, 2026-10-12, the integrity check: the bell hung 1.7 m under the cornice on nothing) its
  // headstock: a timber beam across the stage, its ends in the side walls' colonnettes, the bell's crown on it
  sink.span('structureWood', -S / 2 + t - 0.06, bellTop - 1.72, -0.13, S / 2 - t + 0.06, bellTop - 1.46, 0.13, { colour: TIMBER_DARK, decor: true });
  // (props census #5; the judges: "the bell stage has no bell frame") the bell frame under the headstock: two posts on the
  // stage's floor, a sill across their feet and a brace from each foot to the headstock
  {
    const fy = shaftTop + 0.25, hy = bellTop - 1.72, px = 0.85, bc = { colour: TIMBER_DARK, decor: true };
    sink.span('structureWood', -px - 0.45, fy, -0.12, px + 0.45, fy + 0.16, 0.12, bc);
    for (const sx of [-1, 1]) {
      sink.span('structureWood', sx * px - 0.1, fy + 0.16, -0.1, sx * px + 0.1, hy, 0.1, bc);
      bar(sink, 'structureWood', [sx * (px + 0.4), fy + 0.16, 0], [sx * (px - 0.05), hy - 0.55, 0], 0.09, bc);
    }
  }
  moulding(sink, 'stone', S, S, bellTop, 0.3, 0.18);
  // the balustrade round the pyramid's foot: corner piers, a rail, the balusters between (fine), a pinnacle on each pier
  const by = bellTop + 0.3, bh = 0.75, e = S / 2 + 0.1;
  for (const [i, [sx, sz]] of ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).entries()) {
    sink.span('stone', sx * e - 0.22, by, sz * e - 0.22, sx * e + 0.22, by + bh + 0.1, sz * e + 0.22);
    // (each pinnacle comes off when the tower is breached: props lane A, E12, landmarks/pieces.ts)
    piece(sink, { name: `pinnacle-${i}`, kind: 'detach', at: 'breached', fall: 'drop' }, (s) =>
      revolve(s, 'stone', sx * e, sz * e, [[0.24, by + bh + 0.1], [0, by + bh + 1.05]], 4, { decor: true }, Math.PI / 4));
  }
  for (const [x0, z0, x1, z1] of [[-e, -e, e, -e], [e, -e, e, e], [e, e, -e, e], [-e, e, -e, -e]] as const) {
    const ax = x0 === x1, lo = (v0: number, v1: number) => Math.min(v0, v1), hi = (v0: number, v1: number) => Math.max(v0, v1);
    sink.span('stone', ax ? x0 - 0.13 : lo(x0, x1), by + bh - 0.12, ax ? lo(z0, z1) : z0 - 0.13, ax ? x0 + 0.13 : hi(x0, x1), by + bh, ax ? hi(z0, z1) : z0 + 0.13,
      { decor: true });
    const n = Math.max(4, Math.round((2 * e) / 0.42));
    for (let k = 1; k < n; k++) {
      const q = k / n, x = x0 + (x1 - x0) * q, z = z0 + (z1 - z0) * q;
      sink.span('stone', x - 0.07, by, z - 0.07, x + 0.07, by + bh - 0.12, z + 0.07, { decor: true, fine: true });
    }
  }
  // the stone pyramid, a ball and the cross
  // (props census #5; the judges: "the pyramid is a smooth 4-sided revolve with no courses") the pyramid laid in courses,
  // each a hand in from the one under it
  {
    const R = (S / 2 + 0.1) * Math.SQRT2, y0 = bellTop + 0.3, y1 = H - 1.3, n = 7, prof: Array<[number, number]> = [[R, y0]];
    for (let i = 1; i < n; i++) {
      const y = y0 + (y1 - y0) * i / n, r = R * (1 - i / n);
      prof.push([r + 0.05, y], [r, y]);
    }
    prof.push([0, y1]);
    revolve(sink, 'stone', 0, 0, prof, 4, {}, Math.PI / 4);
  }
  // (the ball and the cross come off at the first damage: props lane A, E12)
  piece(sink, { name: 'cross', kind: 'detach', at: 'damaged', fall: 'drop' }, (s) => {
    revolve(s, 'structureMetal', 0, 0, [[0.05, H - 1.35], [0.2, H - 1.25], [0.22, H - 1.1], [0.05, H - 0.95]], 8, { colour: rgb(0x8a7a5a), decor: true });
    cross(s, 'structureMetal', 0, H - 1.0, 0, 1.0, 'latin', rgb(0x3a3a38));
  });
  return { parts: finishLandmark(sink) };
};

/**
 * The fire lookout: a tapering steel lattice tower (four legs, braced panels) carrying a glazed cab under a pyramid
 * roof, the zig-zag stair inside its frame; the forest maps' watchtower.
 */
// (the looks lane, r2 sweep 2026-10-16: the lookout's girts, braces, landings and soffit were plain square bars and slabs,
// 71 % of its surface) the frame's steel as rolled angles and its decks as boards

const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * A rolled steel angle from a to b, its heel on the a-b line: one leg `w` wide in the frame's face (the face whose outward
 * normal is about `n`), the other leg turned into the frame, both `t` thick, welded along the heel. Its ends abut the
 * frame's nodes, so they take no caps (a set piece's piece is kept for its fall within landmarks/damage.ts's
 * PIECE_TRI_CAP: the lookout's frame is one).
 */
function angleBar(sink: PartSink, a: Vec3, b: Vec3, w: number, t: number, n: Vec3, opts: EmitOptions): void {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
  if (len < 1e-3) return;
  const d: Vec3 = [dx / len, dy / len, dz / len];
  const k = n[0] * d[0] + n[1] * d[1] + n[2] * d[2];
  const nn = normalize3([n[0] - d[0] * k, n[1] - d[1] * k, n[2] - d[2] * k]), across = normalize3(cross3(d, nn));
  const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const leg = (wide: Vec3, thick: Vec3) => {
    // a leg spans `wide` from the heel by w and `thick` from it by t
    const centre: Vec3 = [mid[0] + wide[0] * w / 2 + thick[0] * t / 2, mid[1] + wide[1] * w / 2 + thick[1] * t / 2, mid[2] + wide[2] * w / 2 + thick[2] * t / 2];
    // (the frame right-handed, its x the far side of `wide`: the box is symmetric about its centre)
    sink.box('structureMetal', centre, [w / 2, len / 2, t / 2], opts, new LocalFrame([-wide[0], -wide[1], -wide[2]], d, thick, [0, 0, 0]), { py: true, ny: true });
  };
  leg(across, [-nn[0], -nn[1], -nn[2]]);
  leg([-nn[0], -nn[1], -nn[2]], [-across[0], -across[1], -across[2]]);
}

/**
 * Boards across x0..x1 laid side by side along z from z0 to z1, their tops at y: each `width` wide and `thick` deep with
 * its top arrises eased, a finger's gap between them (a lookout's landing, a soffit's boarding).
 */
function boards(sink: PartSink, x0: number, x1: number, z0: number, z1: number, y: number, thick: number, width: number, opts: EmitOptions): void {
  const n = Math.max(1, Math.round((z1 - z0) / (width + 0.012))), pitch = (z1 - z0) / n, w = pitch - 0.012, c = Math.min(0.008, thick * 0.3);
  for (let i = 0; i < n; i++) {
    const zc = z0 + pitch * (i + 0.5);
    const profile: Vec3[] = [[x0, y - thick, zc - w / 2], [x0, y - thick, zc + w / 2], [x0, y - c, zc + w / 2], [x0, y, zc + w / 2 - c],
      [x0, y, zc - w / 2 + c], [x0, y - c, zc - w / 2]];
    extrude(sink, 'structureWood', profile, [1, 0, 0], x1 - x0, opts);
  }
}

export const fireLookout: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const H = Math.max(10, Number(ctx.params.height));
  const base = -0.6 - ctx.groundFall, cabY = H - 3.4, half0 = 2.4 + H * 0.05, half1 = 1.6;
  const at = (y: number) => half0 + (half1 - half0) * (y / cabY);
  const steel = { colour: STEEL_GREY };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sink.span('stone', sx * half0 - 0.45, base, sz * half0 - 0.45, sx * half0 + 0.45, 0.4, sz * half0 + 0.45);
  // (props lane A, E12: an open frame — landmarks/damage.ts reads it as members, not walls; the frame and the cab go over
  // whole when it falls, the cab's roof comes off when it is breached; landmarks/pieces.ts)
  piece(sink, { name: 'frame', kind: 'lattice', at: 'collapse', fall: 'topple' }, (sink) => {
  // (props census #5, lane B 2026-10-15; the judges: "every steel member is a plain square bar ... no angle sections,
  // gusset plates or bolts") each leg an angle, its two flanges in the frame's two faces at the corner
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const a: Vec3 = [sx * half0, 0.4, sz * half0], b: Vec3 = [sx * half1, cabY, sz * half1];
    sink.member('structureMetal', [a[0] - sx * 0.09, a[1], a[2]], [b[0] - sx * 0.09, b[1], b[2]], 0.18, 0.025, [0, 0, sz], { ...steel, exposed: true }, 0.025);
    sink.member('structureMetal', [a[0], a[1], a[2] - sz * 0.09], [b[0], b[1], b[2] - sz * 0.09], 0.18, 0.025, [sx, 0, 0], { ...steel, exposed: true }, 0.025);
  }
  const panels = Math.max(3, Math.round(cabY / 4));
  // a gusset plate on each flange where a panel's girt and braces meet the leg
  for (let k = 1; k <= panels; k++) {
    const y = 0.4 + (cabY - 0.4) * k / panels, hw = at(y);
    // (every other node, on one flange of each leg, the faces taking turns: the lookout's triangle budget; a whole plate,
    // its back seen from inside the frame where it runs past the flange)
    if (k % 2 === 0 && k !== panels) continue;
    const g = { ...steel, decor: true, fine: true, exposed: true };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      if ((k + (sx > 0 ? 1 : 0) + (sz > 0 ? 1 : 0)) % 2) sink.member('structureMetal', [sx * (hw - 0.2), y - 0.16, sz * hw], [sx * (hw - 0.2), y + 0.16, sz * hw], 0.36, 0.015, [0, 0, sz], g, 0);
      else sink.member('structureMetal', [sx * hw, y - 0.16, sz * (hw - 0.2)], [sx * hw, y + 0.16, sz * (hw - 0.2)], 0.36, 0.015, [sx, 0, 0], g, 0);
    }
  }
  for (let k = 0; k < panels; k++) {
    const y0 = 0.4 + (cabY - 0.4) * k / panels, y1 = 0.4 + (cabY - 0.4) * (k + 1) / panels, h0 = at(y0), h1 = at(y1);
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
      // the face's outward normal; a girt's one leg hangs in the face, its other the seat the landing's boards lie on
      const n: Vec3 = [(ax + bx) / 2, 0, (az + bz) / 2];
      angleBar(sink, [bx * h1, y1, bz * h1], [ax * h1, y1, az * h1], 0.1, 0.012, n, { ...steel, decor: true });
      angleBar(sink, [ax * h0, y0, az * h0], [bx * h1, y1, bz * h1], 0.07, 0.01, n, { ...steel, decor: true });
      angleBar(sink, [bx * h0, y0, bz * h0], [ax * h1, y1, az * h1], 0.07, 0.01, n, { ...steel, decor: true, fine: true });
    }
    // a flight of the stair inside the frame (round 3, wave 204: "the lookout stairs need stringers"): two steel
    // stringers, the timber treads between them, a handrail on the open side, and a landing at its head where the next
    // flight turns back — zig-zag, a flight a panel, each in its own lane so the one above clears the head below
    // (every flight runs the same length, the top panel's, so each one starts where the landing below it ends)
    const dir = k % 2 ? -1 : 1, lane = dir * 0.55, run = Math.min(1.1, half1 - 0.55), zs = -dir * run, ze = dir * run;
    // (the first flight's stringers come down to a concrete foot on the ground; every other flight starts on the landing
    // below it)
    const s0 = k === 0 ? 0.04 : y0;
    if (k === 0) sink.span('stone', lane - 0.6, -0.4, zs - 0.45, lane + 0.6, 0.06, zs + 0.3, { decor: true });
    for (const side of [-1, 1]) bar(sink, 'structureMetal', [lane + side * 0.42, s0, zs], [lane + side * 0.42, y1, ze], 0.1, { ...steel, decor: true });
    const steps = Math.max(4, Math.round((y1 - y0) / 0.26));
    for (let n = 1; n < steps; n++) {
      const t = n / steps, y = y0 + (y1 - y0) * t, z = zs + (ze - zs) * t;
      sink.span('structureWood', lane - 0.38, y - 0.04, z - 0.13, lane + 0.38, y, z + 0.13, { colour: TIMBER, decor: true, fine: true });
    }
    const rail = lane + dir * 0.47;
    bar(sink, 'structureMetal', [rail, y0 + 0.9, zs], [rail, y1 + 0.9, ze], 0.05, { ...steel, decor: true, fine: true });
    for (const [y, z] of [[y0, zs], [y1, ze]] as const) bar(sink, 'structureMetal', [rail, y, z], [rail, y + 0.9, z], 0.05, { ...steel, decor: true, fine: true });
    // the landing at its head, across both lanes and out to the panel's ring of bars, which carry it (the ring stands at
    // the frame's half-width there): its sides and its outer edge rest on the ring
    const ring = at(y1), lz0 = dir > 0 ? ze : -ring, lz1 = dir > 0 ? ring : ze;
    // its boards span the frame from girt to girt on the girts' seats, an angle bearer under their inner edge (the top
    // flight's head is the cab's floor)
    if (k + 1 < panels) {
      boards(sink, -ring + 0.02, ring - 0.02, lz0, lz1, y1 + 0.062, 0.05, 0.2, { colour: TIMBER_DARK, decor: true });
      const bz = dir > 0 ? lz0 + 0.06 : lz1 - 0.06;
      angleBar(sink, [dir * ring, y1 + 0.002, bz], [-dir * ring, y1 + 0.002, bz], 0.08, 0.01, [0, 0, -dir], { ...steel, decor: true });
    }
  }
  });
  // the cab: a floor, posts, the glazing, a balcony rail, the pyramid roof
  const cw = half1 * 2 + 0.6;
  piece(sink, { name: 'cab', kind: 'lattice', at: 'collapse', fall: 'topple' }, (sink) => {
  sink.span('structureWood', -cw / 2 - 0.5, cabY, -cw / 2 - 0.5, cw / 2 + 0.5, cabY + 0.2, cw / 2 + 0.5, { colour: TIMBER_DARK });
  const cab = archedBody(sink, 'structureWood', 0, 0, cw, cw, cabY + 0.2, cabY + 1.2, {}, 0, { colour: BOARD_GREY });
  for (const name of ['front', 'right', 'back', 'left'] as const) {
    const face = cab[name];
    sink.quad('glass', facePoint(face, -cw / 2 + 0.15, cabY + 1.2, 0), facePoint(face, cw / 2 - 0.15, cabY + 1.2, 0), facePoint(face, cw / 2 - 0.15, cabY + 2.4, 0),
      facePoint(face, -cw / 2 + 0.15, cabY + 2.4, 0), { decor: true });
    for (const u of [-cw / 2 + 0.06, 0, cw / 2 - 0.06]) sink.box('structureWood', facePoint(face, u, cabY + 1.8, -0.06), [0.06, 0.6, 0.06], { colour: TIMBER_DARK }, new LocalFrame(face.u, [0, 1, 0], face.out, [0, 0, 0]));
    // (props census #5; the judges: "one flat glass quad per face with three posts and no sashes or mullions") the sashes:
    // the sill board under the glass, the head rail and a meeting rail across the lights (the posts their mullions)
    const fr = { colour: FRAME_WHITE, decor: true }, fine = { colour: FRAME_WHITE, decor: true, fine: true } as const;
    faceBox(sink, 'structureWood', face, 0, cabY + 1.2, 0.04, cw - 0.1, 0.07, 0.1, fr);
    faceBox(sink, 'structureWood', face, 0, cabY + 2.36, 0.02, cw - 0.2, 0.06, 0.04, fr);
    faceBox(sink, 'structureWood', face, 0, cabY + 1.82, 0.015, cw - 0.3, 0.04, 0.03, fine);
  }
  // the trapdoor where the stair comes up through the floor: its frame on the boards and its lid stood open on its hinges
  {
    const nPanels = Math.max(3, Math.round(cabY / 4)), dir = (nPanels - 1) % 2 ? -1 : 1, hx = dir * 0.55, hz = dir * Math.min(1.1, half1 - 0.55), fy = cabY + 0.2, hb = { colour: TIMBER_DARK, decor: true };
    sink.span('structureWood', hx - 0.5, fy, hz - 0.5, hx + 0.5, fy + 0.05, hz - 0.42, hb);
    sink.span('structureWood', hx - 0.5, fy, hz + 0.42, hx + 0.5, fy + 0.05, hz + 0.5, hb);
    sink.span('structureWood', hx - 0.5, fy, hz - 0.42, hx - 0.42, fy + 0.05, hz + 0.42, hb);
    sink.span('structureWood', hx + 0.42, fy, hz - 0.42, hx + 0.5, fy + 0.05, hz + 0.42, hb);
    const lean = 1.25, c = Math.cos(lean), sn = Math.sin(lean), e = hz - dir * 0.46;
    sink.box('structureWood', [hx, fy + 0.05 + 0.42 * sn, e + dir * 0.42 * c], [0.42, 0.42, 0.025], { colour: TIMBER, decor: true },
      new LocalFrame([1, 0, 0], [0, sn, dir * c], [0, -dir * c, sn], [0, 0, 0]));
  }
  // (the looks lane, r2 sweep: the catwalk wore a park's wrought-iron railing, a baluster every 13 cm) the catwalk's
  // rail as a lookout's is built: angle posts at the corners and between, an angle top rail and a mid rail
  const rr = cw / 2 + 0.45, ry = cabY + 0.2, rail = { colour: IRON, decor: true };
  for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]] as const) {
    const n: Vec3 = [(a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2], posts = 3;
    for (let k = 0; k < posts; k++) {
      const t = k / posts, x = (a[0] + (b[0] - a[0]) * t) * rr, z = (a[1] + (b[1] - a[1]) * t) * rr;
      angleBar(sink, [x, ry, z], [x, ry + 1.0, z], 0.05, 0.006, n, rail);
    }
    angleBar(sink, [b[0] * rr, ry + 1.0, b[1] * rr], [a[0] * rr, ry + 1.0, a[1] * rr], 0.05, 0.006, n, rail);
    bar(sink, 'structureMetal', [a[0] * rr, ry + 0.52, a[1] * rr], [b[0] * rr, ry + 0.52, b[1] * rr], 0.03, rail);
  }
  sink.span('structureWood', -cw / 2, cabY + 2.4, -cw / 2, cw / 2, cabY + 2.55, cw / 2, { colour: TIMBER_DARK });
  });
  piece(sink, { name: 'cab-roof', kind: 'detach', at: 'breached', fall: 'drop' }, (s) => {
    revolve(s, 'structureMetal', 0, 0, [[(cw / 2 + 0.5) * Math.SQRT2, cabY + 2.55], [0, H]], 4, { colour: IRON_RED }, Math.PI / 4);
    // (props census #5; the judges: "no eaves fascia, rafters or lightning rod") the fascia round the eaves, the rafter
    // feet under them and the rod on the apex, its cable down the hip
    const e = cw / 2 + 0.5, fy = cabY + 2.55, wood = { colour: TIMBER_DARK, decor: true };
    for (const [x0, z0, x1, z1] of [[-e, e - 0.04, e, e], [-e, -e, e, -e + 0.04], [e - 0.04, -e, e, e], [-e, -e, -e + 0.04, e]] as const) {
      s.span('structureWood', x0, fy - 0.18, z0, x1, fy, z1, wood);
    }
    const eaves: Face[] = [{ origin: [0, 0, cw / 2], u: [1, 0, 0], out: [0, 0, 1], width: cw }, { origin: [cw / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: cw },
      { origin: [0, 0, -cw / 2], u: [-1, 0, 0], out: [0, 0, -1], width: cw }, { origin: [-cw / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: cw }];
    for (const face of eaves) {
      for (let k = 0; k < 4; k++) faceBox(s, 'structureWood', face, -cw / 2 + 0.3 + (cw - 0.6) * k / 3, fy - 0.04, 0.25, 0.06, 0.08, 0.5, { ...wood, fine: true });
    }
    s.span('structureMetal', -0.02, H - 0.05, -0.02, 0.02, H + 1.2, 0.02, { colour: IRON, decor: true });
    // the boarded soffit under the eaves (the roof's skin is one-sided: from under the eaves the sky showed through it)
    boards(s, -e, e, -e, e, fy - 0.005, 0.025, 0.3, { colour: TIMBER_DARK, decor: true });
  });
  return { parts: finishLandmark(sink) };
};
