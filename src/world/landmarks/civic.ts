// src/world/landmarks/civic.ts — the civic set pieces (the landmarks lane, 2026-10-05): the church (an Orthodox village
// church of the black-earth governorates, or a Western hall church with its spire), the town hall with its clock
// tower, the railway station with its platform canopy, the market hall and the grain elevator. Proportions from the
// buildings themselves: a Kursk-governorate village church of 1800-1900 is a whitewashed brick "ship" — the bell tower,
// the refectory, the cube with its drum and dome, the apse — 25-32 m long, its bell tower 25-30 m to the cross.
import { LocalFrame, PartSink, faceBox, facePoint, rgb, type Face, type RegionalBucket, type Vec3 } from '../maps/regional/geometry.ts';
import { emitRoof, roofGeometry, type RoofSpec } from '../maps/regional/house.ts';
import {
  archSurround, archWindow, archedBody, archedSlab, bar, cornerPilasters, cross, dome, drum, extrude, moulding, portico, revolve, smoothRender, tentRoof,
  type ArchHole, type FaceName,
} from './kit.ts';
import type { LandmarkBuildContext, LandmarkBuilder } from './types.ts';

const GREEN_IRON = rgb(0x4f7d5a), DOME_GREEN = rgb(0x3f7a52), GILT = rgb(0xb8933e), FRAME_WHITE = rgb(0xe8e4da);
const DOOR_OAK = rgb(0x5e4636), BELL = rgb(0x5a4a32), IRON = rgb(0x2b2d2e), SLATE_BLUE = rgb(0x4a5560);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];

/** A share of the windows show a lit curtain at night. */
const lit = (ctx: LandmarkBuildContext, share: number) => ctx.variant() < share;

/** Glaze and dress every opening of a body face. */
function dressOpenings(sink: PartSink, ctx: LandmarkBuildContext, face: Face, holes: readonly ArchHole[], reveal: number,
  surround: { bucket: RegionalBucket; width: number; out: number } | null, litShare: number): void {
  for (const h of holes) {
    archWindow(sink, face, h, reveal, FRAME_WHITE, lit(ctx, litShare));
    if (surround) archSurround(sink, surround.bucket, face, h, surround.width, surround.out);
  }
}

/** A door leaf hung at the back of an arched opening's reveal: boarded oak with two iron straps. */
function doorLeaf(sink: PartSink, face: Face, h: ArchHole, reveal: number): void {
  const o = -reveal + 0.03;
  const line: Vec3[] = [facePoint(face, h.u - h.w / 2, h.y0, o), facePoint(face, h.u + h.w / 2, h.y0, o)];
  const arch: Array<[number, number]> = [];
  const rise = h.form === 'flat' ? 0 : h.form === 'round' ? h.w / 2 : h.w * 0.74;
  for (let i = 0; i <= 8; i++) { const t = i / 8 * Math.PI; arch.push([h.u + Math.cos(t) * h.w / 2, h.spring + Math.sin(t) * rise]); }
  for (const [u, y] of arch) line.push(facePoint(face, u, y, o));
  sink.polygon('structureWood', line, { colour: DOOR_OAK, decor: true });
  for (const t of [0.22, 0.7]) {
    const y = h.y0 + (h.spring - h.y0) * t;
    const a = facePoint(face, h.u - h.w / 2 + 0.05, y, o + 0.02), b = facePoint(face, h.u + h.w / 2 - 0.05, y, o + 0.02);
    sink.member('structureMetal', a, b, 0.07, 0.02, face.out, { colour: IRON, decor: true, fine: true }, 0);
  }
}

/** The cornice of a body: a frieze band and a projecting crown over it. */
function cornice(sink: PartSink, bucket: RegionalBucket, cx: number, cz: number, w: number, d: number, y: number, scale = 1): void {
  sink.placed(0, cx, 0, cz, () => {
    moulding(sink, bucket, w, d, y - 0.34 * scale, 0.2 * scale, 0.06 * scale);
    moulding(sink, bucket, w, d, y - 0.14 * scale, 0.18 * scale, 0.2 * scale);
  });
}

/** A bell: a revolved bronze bell hung under a beam at (x, y, z), `r` its mouth radius. */
function bell(sink: PartSink, x: number, y: number, z: number, r: number): void {
  revolve(sink, 'structureMetal', x, z, [[r, y - r * 1.25], [r * 0.92, y - r * 1.12], [r * 0.62, y - r * 0.7], [r * 0.56, y - r * 0.2], [r * 0.4, y],
    [0.0, y + 0.02]], 10, { colour: BELL, decor: true });
  sink.span('structureMetal', x - 0.03, y, z - 0.03, x + 0.03, y + 0.18, z + 0.03, { colour: IRON, decor: true });
}

/**
 * An open bell stage: four arched walls round a square (each a through-arch slab, the corners solid), the floor and the
 * roof slab, the bells hung on a beam across the openings. side × side at (0, zc), from y0 to y1.
 */
function bellStage(sink: PartSink, bucket: RegionalBucket, zc: number, side: number, y0: number, y1: number, t: number, archW: number,
  parapet: number): void {
  const spring = y1 - archW / 2 - 0.55;
  const hole = (w: number): ArchHole => ({ u: 0, w, y0: y0 + parapet, spring, form: 'round' });
  // front and back walls span the full side; the side walls fit between them
  for (const [yaw, off, len] of [[0, side / 2 - t / 2, side], [Math.PI, side / 2 - t / 2, side], [Math.PI / 2, side / 2 - t / 2, side - 2 * t],
    [-Math.PI / 2, side / 2 - t / 2, side - 2 * t]] as const) {
    const ox = Math.sin(yaw) * off, oz = Math.cos(yaw) * off;
    sink.placed(yaw, ox, 0, zc + oz, () => archedSlab(sink, bucket, -len / 2, len / 2, y0, y1, t, [hole(Math.min(archW, len - 1.2))],
      { ends: true, top: true, bottom: false }));
  }
  // the bells on a beam across the stage
  sink.span('structureWood', -side / 2 + t, spring + 0.25, zc - 0.09, side / 2 - t, spring + 0.43, zc + 0.09, { colour: rgb(0x4a3b2e), decor: true });
  bell(sink, 0, spring + 0.25, zc, Math.min(0.72, side * 0.14));
  bell(sink, -side * 0.24, spring + 0.25, zc, Math.min(0.42, side * 0.08));
  bell(sink, side * 0.24, spring + 0.25, zc, Math.min(0.36, side * 0.07));
}

/** A slender spire over a small dome: the needle (шпиль) of the classicist bell towers, a gilt ball and the cross. */
function needle(sink: PartSink, x: number, y: number, z: number, r: number, h: number): number {
  revolve(sink, 'structureMetal', x, z, [[r, y], [r * 0.18, y + h * 0.8], [0, y + h]], 8, { colour: GILT }, Math.PI / 8);
  const ballY = y + h * 0.74;
  revolve(sink, 'structureMetal', x, z, [[0.05, ballY - 0.22], [0.24, ballY - 0.12], [0.28, ballY], [0.24, ballY + 0.12], [0.05, ballY + 0.22]], 10,
    { colour: GILT, decor: true });
  return y + h;
}

// ---------------------------------------------------------------------------------------------------------- the church

/**
 * The Orthodox village church (the black-earth governorates, 1800-1900): from the west, the bell tower — a tall base
 * with the arched portal, the open bell stage, an octagon with round windows, a small dome carrying a gilt needle (or
 * an onion) and the cross — then the refectory under a low hipped iron roof, the cube (chetverik) with porticos on its
 * north and south faces, its drum ringed with windows and the dome with its lantern (one head, or five), and the
 * semicircular apse to the east. Whitewashed brick on a brick plinth, green-painted iron roofs and domes, gilt crosses.
 */
function orthodoxChurch(ctx: LandmarkBuildContext): ReturnType<LandmarkBuilder> {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = Math.max(22, Number(ctx.params.length)), W = Math.max(8, Number(ctx.params.width));
  const towerTop = Math.max(18, Number(ctx.params.tower)), heads = Number(ctx.params.domes) >= 5 ? 5 : 1;
  const crown = String(ctx.params.crown ?? 'needle');
  const wall: RegionalBucket = 'plaster', base = -0.6 - ctx.groundFall, plinthTop = 0.55;
  const surround = { bucket: 'plaster' as RegionalBucket, width: 0.16, out: 0.07 };
  // the plan along z (front +z is the west, the bell tower's portal)
  const T = Math.max(4.6, W * 0.5), zTowerBack = L / 2 - T, Lr = L * 0.26, zCubeFront = zTowerBack - Lr, zCubeBack = zCubeFront - W;
  const Wr = W * 0.78, Ra = W * 0.3;
  // ---- the plinth under the whole ship
  sink.span('stone', -T / 2 - 0.12, base, zTowerBack - 0.12, T / 2 + 0.12, plinthTop, L / 2 + 0.12);
  sink.span('stone', -Wr / 2 - 0.12, base, zCubeFront, Wr / 2 + 0.12, plinthTop, zTowerBack);
  sink.span('stone', -W / 2 - 0.12, base, zCubeBack - 0.12, W / 2 + 0.12, plinthTop, zCubeFront);
  sink.cylinder('stone', [0, base, zCubeBack], 'y', plinthTop - base, Ra + 0.12, 12, {}, Ra + 0.12, true, 0, Math.PI);
  // ---- the cube: two tiers of windows, porticos on the north and south faces
  const Hc = Math.max(8.5, W * 0.95);
  const lower = (u: number): ArchHole => ({ u, w: 1.2, y0: 2.1, spring: 4.6, form: 'round' });
  const upper = (u: number): ArchHole => ({ u, w: 1.0, y0: Hc - 3.4, spring: Hc - 1.9, form: 'round' });
  const side = W * 0.34;
  const cubeHoles: Partial<Record<FaceName, ArchHole[]>> = {
    left: [lower(-side), lower(side), upper(-side), upper(0), upper(side)],
    right: [lower(-side), lower(side), upper(-side), upper(0), upper(side)],
    back: [upper(-side), upper(side)],
    front: [upper(-side), upper(side)],
  };
  const cubeFaces = archedBody(sink, wall, 0, (zCubeFront + zCubeBack) / 2, W, W, plinthTop, Hc, cubeHoles, 0.42);
  for (const name of ['left', 'right', 'back', 'front'] as const) dressOpenings(sink, ctx, cubeFaces[name], cubeHoles[name] ?? [], 0.42, surround, 0.25);
  cornerPilasters(sink, wall, 0, (zCubeFront + zCubeBack) / 2, W, W, plinthTop, Hc - 0.35, 0.55, 0.08);
  cornice(sink, wall, 0, (zCubeFront + zCubeBack) / 2, W, W, Hc, 1.3);
  for (const name of ['left', 'right'] as const) {
    const f = cubeFaces[name];
    portico(sink, f, { width: Math.min(6.6, W * 0.6), depth: 2.3, height: Hc * 0.6, columns: 4, bucket: 'plaster', roofBucket: 'structureMetal',
      roofColour: GREEN_IRON });
    // the portal under the portico
    const door: ArchHole = { u: 0, w: 1.5, y0: plinthTop, spring: 2.9, form: 'round' };
    doorLeaf(sink, f, door, -0.02);
  }
  // the cube's low hipped roof, the drum and the dome with its lantern
  const roofCube: RoofSpec = { kind: 'hip', pitchDeg: 17, eave: 0.45, verge: 0.45, thickness: 0.12, bucket: 'structureMetal', ridge: null };
  const rgCube = roofGeometry(W, W, Hc, roofCube);
  sink.placed(0, 0, 0, (zCubeFront + zCubeBack) / 2, () => emitRoof(sink, rgCube, roofCube, GREEN_IRON));
  const zc = (zCubeFront + zCubeBack) / 2, Rd = W * 0.27;
  const drumBase = rgCube.ridgeY - 0.3;
  const drumTop = drum(sink, wall, 0, drumBase, zc, Rd, Math.max(3, W * 0.34), 16, { windows: 8 });
  const domeTop = dome(sink, 'structureMetal', 0, drumTop, zc, Rd * 1.04, heads === 5 ? 'onion' : 'helm', 16, { colour: DOME_GREEN });
  const lantern = drum(sink, wall, 0, domeTop - 0.1, zc, Rd * 0.2, 1.1, 8, {});
  const headTop = dome(sink, 'structureMetal', 0, lantern, zc, Rd * 0.24, 'onion', 10, { colour: GILT });
  cross(sink, 'structureMetal', 0, headTop - 0.05, zc, 1.9, 'orthodox', GILT);
  if (heads === 5) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * W * 0.3, z = zc + sz * W * 0.3;
      const roofY = rgCube.topAt(x, z - zc) ?? Hc;
      const top = drum(sink, wall, x, roofY - 0.4, z, Rd * 0.36, 1.9, 10, { windows: 4 });
      const t2 = dome(sink, 'structureMetal', x, top, z, Rd * 0.4, 'onion', 10, { colour: DOME_GREEN });
      cross(sink, 'structureMetal', x, t2 - 0.05, z, 1.2, 'orthodox', GILT);
    }
  }
  // ---- the apse: a half drum on the cube's east face under its half dome
  const apseH = Hc * 0.68;
  sink.cylinder(wall, [0, plinthTop, zCubeBack], 'y', apseH - plinthTop, Ra, 14, {}, Ra, false, 0, Math.PI);
  sink.cylinder(wall, [0, apseH, zCubeBack], 'y', 0.3, Ra + 0.12, 14, {}, Ra + 0.18, true, 0, Math.PI);
  for (let k = 0; k < 6; k++) {
    const r0 = Ra + 0.24, a0 = k / 6 * Math.PI / 2, a1 = (k + 1) / 6 * Math.PI / 2;
    sink.cylinder('structureMetal', [0, apseH + 0.3 + Math.sin(a0) * Ra * 0.62, zCubeBack], 'y', (Math.sin(a1) - Math.sin(a0)) * Ra * 0.62,
      r0 * Math.cos(a0), 14, { colour: GREEN_IRON }, r0 * Math.cos(a1), k === 5, 0, Math.PI);
  }
  for (const j of [3, 7, 10]) {
    // narrow windows round the apse, each on the centre of one of its fourteen facets
    const a = (j + 0.5) / 14 * Math.PI, facet = Ra * Math.cos(Math.PI / 28) + 0.012;
    const nx = Math.cos(-a), nz = Math.sin(-a);
    const f: Face = { origin: [nx * facet, 0, zCubeBack + nz * facet], u: [nz, 0, -nx], out: [nx, 0, nz], width: 1 };
    const h: ArchHole = { u: 0, w: 0.9, y0: 2.4, spring: 4.4, form: 'round' };
    archWindow(sink, f, h, 0.0, FRAME_WHITE, lit(ctx, 0.2), { bars: false });
    archSurround(sink, 'plaster', f, h, 0.14, 0.06);
  }
  // ---- the refectory: lower, narrower, three windows a side, a low hipped roof
  const Hr = Math.max(5.2, Hc * 0.6);
  const refHoles: Partial<Record<FaceName, ArchHole[]>> = {};
  for (const name of ['left', 'right'] as const) {
    refHoles[name] = [-Lr * 0.3, 0, Lr * 0.3].map((u) => ({ u, w: 1.1, y0: 1.9, spring: 3.7, form: 'round' as const }));
  }
  const refFaces = archedBody(sink, wall, 0, (zCubeFront + zTowerBack) / 2, Wr, Lr, plinthTop, Hr, refHoles, 0.4);
  for (const name of ['left', 'right'] as const) dressOpenings(sink, ctx, refFaces[name], refHoles[name] ?? [], 0.4, surround, 0.25);
  cornice(sink, wall, 0, (zCubeFront + zTowerBack) / 2, Wr, Lr, Hr, 1);
  const roofRef: RoofSpec = { kind: 'hip', pitchDeg: 20, eave: 0.4, verge: 0.4, thickness: 0.1, bucket: 'structureMetal', ridge: null };
  sink.placed(0, 0, 0, (zCubeFront + zTowerBack) / 2, () => emitRoof(sink, roofGeometry(Wr, Lr, Hr, roofRef), roofRef, GREEN_IRON));
  // ---- the bell tower
  const zt = (zTowerBack + L / 2) / 2, H1 = Math.max(7, towerTop * 0.3);
  const portal: ArchHole = { u: 0, w: 2.0, y0: plinthTop, spring: 3.3, form: 'round' };
  const towerHoles: Partial<Record<FaceName, ArchHole[]>> = {
    front: [portal, { u: 0, w: 0.95, y0: H1 - 2.9, spring: H1 - 1.4, form: 'round' }],
    left: [{ u: 0, w: 0.95, y0: H1 - 2.9, spring: H1 - 1.4, form: 'round' }],
    right: [{ u: 0, w: 0.95, y0: H1 - 2.9, spring: H1 - 1.4, form: 'round' }],
  };
  const towerFaces = archedBody(sink, wall, 0, zt, T, T, plinthTop, H1, towerHoles, 0.45);
  doorLeaf(sink, towerFaces.front, portal, 0.45);
  archSurround(sink, 'plaster', towerFaces.front, portal, 0.32, 0.12);
  for (const name of ['front', 'left', 'right'] as const) {
    const holes = (towerHoles[name] ?? []).filter((h) => h !== portal);
    dressOpenings(sink, ctx, towerFaces[name], holes, 0.45, surround, 0.1);
  }
  cornerPilasters(sink, wall, 0, zt, T, T, plinthTop, H1 - 0.3, 0.45, 0.08);
  cornice(sink, wall, 0, zt, T, T, H1, 1.1);
  // the open bell stage
  const T2 = T * 0.84, bs0 = H1 + 0.02, bs1 = bs0 + Math.max(4.4, towerTop * 0.19);
  bellStage(sink, wall, zt, T2, bs0, bs1, 0.62, Math.min(2.2, T2 * 0.46), 0.95);
  sink.span(wall, -T2 / 2 + 0.6, bs0, zt - T2 / 2 + 0.6, T2 / 2 - 0.6, bs0 + 0.2, zt + T2 / 2 - 0.6);
  cornerPilasters(sink, wall, 0, zt, T2, T2, bs0, bs1 - 0.3, 0.4, 0.07);
  cornice(sink, wall, 0, zt, T2, T2, bs1, 1);
  // the octagon with its round windows, then the crown
  const R3 = T2 * 0.4;
  const octTop = drum(sink, wall, 0, bs1 + 0.02, zt, R3, Math.max(2, towerTop * 0.08), 8, { windows: 4 });
  if (crown === 'onion') {
    const neck = drum(sink, wall, 0, octTop, zt, R3 * 0.62, 1.1, 10, {});
    const top = dome(sink, 'structureMetal', 0, neck, zt, R3 * 0.72, 'onion', 12, { colour: DOME_GREEN });
    cross(sink, 'structureMetal', 0, top - 0.05, zt, 1.8, 'orthodox', GILT);
  } else {
    const cap = dome(sink, 'structureMetal', 0, octTop, zt, R3 * 0.98, 'helm', 12, { colour: DOME_GREEN });
    const tip = needle(sink, 0, cap - 0.2, zt, R3 * 0.22, Math.max(3, towerTop - cap - 1.6));
    cross(sink, 'structureMetal', 0, tip - 0.1, zt, 1.5, 'orthodox', GILT);
  }
  return { parts: smoothRender(sink.finish(), RENDER_SMOOTH), tints: { plaster: [1.0, 1.0, 0.99], plaster2: [1, 1, 1], plaster3: [1, 1, 1] } };
}

/** The UV scale of a church's and a monument's lime render over the village print (kit.ts smoothRender). */
const RENDER_SMOOTH = 0.18;

/**
 * The Western hall church (Hesse, Franconia, Brittany, the Low Countries): the nave under a steep roof between stepped
 * buttresses, tall pointed windows with their dressings, the narrower chancel with its three-sided apse, and the west
 * tower — a pointed portal, the clock faces, the louvred belfry openings — under a broach spire (or a baroque helm).
 * The masonry is the map's: sandstone, granite, slate rubble, brick or render.
 */
function westernChurch(ctx: LandmarkBuildContext): ReturnType<LandmarkBuilder> {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = Math.max(22, Number(ctx.params.length)), W = Math.max(8, Number(ctx.params.width));
  const towerTop = Math.max(24, Number(ctx.params.tower)), helm = String(ctx.params.crown ?? 'spire') === 'helm';
  const wall: RegionalBucket = String(ctx.params.walls ?? 'stone') === 'render' ? 'plaster' : 'stone';
  const base = -0.6 - ctx.groundFall;
  const T = Math.max(5.2, W * 0.56), zTowerBack = L / 2 - T, Lc = Math.max(6, L * 0.24), zNaveBack = -L / 2 + Lc;
  const Wc = W * 0.66, Hn = Math.max(7.5, W * 0.78), Hc = Hn - 1.2;
  sink.span('stone', -W / 2 - 0.15, base, zNaveBack, W / 2 + 0.15, 0.4, zTowerBack + 0.1);
  sink.span('stone', -Wc / 2 - 0.15, base, -L / 2 - 0.15, Wc / 2 + 0.15, 0.4, zNaveBack);
  sink.span('stone', -T / 2 - 0.15, base, zTowerBack - 0.1, T / 2 + 0.15, 0.4, L / 2 + 0.15);
  // the nave: tall pointed windows between buttresses
  const Ln = zTowerBack - zNaveBack, bays = Math.max(3, Math.round(Ln / 4.2));
  const naveWin: ArchHole[] = [];
  for (let i = 0; i < bays; i++) naveWin.push({ u: -Ln / 2 + Ln * (i + 0.5) / bays, w: 1.3, y0: 2.4, spring: Hn - 2.6, form: 'pointed' });
  const naveHoles: Partial<Record<FaceName, ArchHole[]>> = { left: naveWin, right: naveWin.map((h) => ({ ...h })) };
  const naveFaces = archedBody(sink, wall, 0, (zNaveBack + zTowerBack) / 2, W, Ln, 0.4, Hn, naveHoles, 0.38);
  for (const name of ['left', 'right'] as const) {
    dressOpenings(sink, ctx, naveFaces[name], naveHoles[name] ?? [], 0.38, { bucket: 'stone', width: 0.14, out: 0.06 }, 0.2);
    // stepped buttresses between the bays
    const f = naveFaces[name];
    for (let i = 0; i <= bays; i++) {
      const u = -Ln / 2 + Ln * i / bays;
      const at = (o: number, y: number) => facePoint(f, u, y, o);
      sink.box('stone', at(0.45, (0.4 + Hn * 0.55) / 2), [0.3, (Hn * 0.55 - 0.4) / 2, 0.45], {}, undefined);
      sink.box('stone', at(0.3, (Hn * 0.55 + Hn - 0.5) / 2), [0.26, (Hn * 0.45 - 0.5) / 2, 0.3], {}, undefined);
    }
  }
  const roofNave: RoofSpec = { kind: 'gable', pitchDeg: 52, eave: 0.45, verge: 0.3, thickness: 0.14, bucket: 'roof', ridge: 'saddle' };
  sink.placed(0, 0, 0, (zNaveBack + zTowerBack) / 2, () => {
    const rg = roofGeometry(W, Ln, Hn, roofNave);
    emitRoof(sink, rg, roofNave);
    if (rg.gable) {
      // the east gable over the chancel roof (the west one stands in the tower)
      const f: Face = { origin: [0, 0, -Ln / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W };
      sink.prism(wall, rg.gable.map(([u, y]) => facePoint(f, u, y, 0)).reverse() as Vec3[], [0, 0, 1], 0.4);
    }
  });
  // the chancel and its three-sided apse
  const chWin: ArchHole[] = [{ u: 0, w: 1.1, y0: 2.4, spring: Hc - 2.2, form: 'pointed' }];
  const chFaces = archedBody(sink, wall, 0, zNaveBack - Lc / 2 + 0.01, Wc, Lc, 0.4, Hc, { left: chWin, right: chWin.map((h) => ({ ...h })) }, 0.36);
  for (const name of ['left', 'right'] as const) dressOpenings(sink, ctx, chFaces[name], chWin, 0.36, { bucket: 'stone', width: 0.12, out: 0.05 }, 0.15);
  revolve(sink, wall, 0, -L / 2, [[Wc / 2 / Math.cos(Math.PI / 8), 0.4], [Wc / 2 / Math.cos(Math.PI / 8), Hc]], 8, {}, Math.PI / 8);
  const roofCh: RoofSpec = { kind: 'hip', pitchDeg: 52, eave: 0.4, verge: 0.4, thickness: 0.12, bucket: 'roof', ridge: 'saddle' };
  sink.placed(0, 0, 0, zNaveBack - Lc / 2 - 0.6, () => emitRoof(sink, roofGeometry(Wc, Lc + 1.2, Hc, roofCh), roofCh));
  // the west tower: portal, the clock stage, the belfry openings, the spire
  const zt = (zTowerBack + L / 2) / 2, Ht = Math.max(Hn + 6, towerTop * 0.56);
  const portal: ArchHole = { u: 0, w: 2.0, y0: 0.4, spring: 2.9, form: 'pointed' };
  const lou = (u: number): ArchHole => ({ u, w: 1.0, y0: Ht - 4.2, spring: Ht - 2.2, form: 'pointed' });
  const towerHoles: Partial<Record<FaceName, ArchHole[]>> = {
    front: [portal, lou(-T * 0.18), lou(T * 0.18)], left: [lou(-T * 0.18), lou(T * 0.18)], right: [lou(-T * 0.18), lou(T * 0.18)],
    back: [lou(-T * 0.18), lou(T * 0.18)],
  };
  const tf = archedBody(sink, wall, 0, zt, T, T, 0.4, Ht, towerHoles, 0.42);
  doorLeaf(sink, tf.front, portal, 0.42);
  archSurround(sink, 'stone', tf.front, portal, 0.3, 0.1);
  for (const name of ['front', 'left', 'right', 'back'] as const) {
    const f = tf[name];
    for (const h of (towerHoles[name] ?? []).filter((x) => x !== portal)) {
      // louvred belfry openings: slats across the dark reveal
      for (let k = 0; k < 6; k++) {
        const y = h.y0 + 0.2 + k * (h.spring - h.y0) / 6;
        sink.member('structureWood', facePoint(f, h.u - h.w / 2, y, -0.2), facePoint(f, h.u + h.w / 2, y, -0.2), 0.12, 0.03, f.out,
          { colour: rgb(0x5a4a3a), decor: true }, 0);
      }
      archSurround(sink, 'stone', f, h, 0.12, 0.05, { sill: true });
    }
    // the clock face under the belfry
    const cy = Ht - 6.2;
    revolveDisc(sink, f, 0, cy, 0.95);
  }
  // corner buttresses on the tower
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    sink.span('stone', sx * T / 2 - (sx > 0 ? 0.4 : 0.5), 0.4, zt + sz * T / 2 - (sz > 0 ? 0.4 : 0.5), sx * T / 2 + (sx > 0 ? 0.5 : 0.4),
      Ht * 0.5, zt + sz * T / 2 + (sz > 0 ? 0.5 : 0.4));
  }
  cornice(sink, wall, 0, zt, T, T, Ht + 0.3, 1);
  const spireBase = Ht + 0.3;
  if (helm) {
    // the baroque helm: a bell-shaped cap, a lantern, a small onion
    const capTop = dome(sink, 'structureMetal', 0, spireBase, zt, T * 0.58, 'onion', 12, { colour: SLATE_BLUE });
    const lantern = drum(sink, wall, 0, capTop - 0.2, zt, T * 0.16, 1.6, 8, { windows: 4 });
    const top = dome(sink, 'structureMetal', 0, lantern, zt, T * 0.18, 'onion', 10, { colour: SLATE_BLUE });
    cross(sink, 'structureMetal', 0, top - 0.05, zt, 1.6, 'latin', GILT);
  } else {
    // the broach spire: an octagonal needle rising from the square, its broaches covering the corners
    const H = Math.max(9, towerTop - spireBase - 1.8);
    revolve(sink, 'roof', 0, zt, [[T * 0.52, spireBase], [T * 0.36, spireBase + 1.6], [0, spireBase + H]], 8, {}, Math.PI / 8);
    tentRoof(sink, 'roof', 0, zt, T * 0.71, spireBase, 2.4, 4, {}, Math.PI / 4);
    cross(sink, 'structureMetal', 0, spireBase + H - 0.1, zt, 1.8, 'latin', GILT);
  }
  return { parts: sink.finish() };
}

/** A clock face on a wall: a white disc on a dark ring, the hands at ten past ten. */
function revolveDisc(sink: PartSink, face: Face, u: number, y: number, r: number): void {
  const ring: Vec3[] = [], dial: Vec3[] = [];
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    ring.push(facePoint(face, u + Math.cos(a) * r, y + Math.sin(a) * r, 0.03));
    dial.push(facePoint(face, u + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86, 0.045));
  }
  sink.polygon('structureMetal', ring, { colour: IRON, decor: true });
  sink.polygon('structureMetal', dial, { colour: rgb(0xe9e4d6), decor: true });
  sink.member('structureMetal', facePoint(face, u, y, 0.06), facePoint(face, u - r * 0.45, y + r * 0.3, 0.06), 0.07, 0.02, face.out, { colour: IRON, decor: true }, 0);
  sink.member('structureMetal', facePoint(face, u, y, 0.065), facePoint(face, u + r * 0.62, y + r * 0.36, 0.065), 0.05, 0.02, face.out, { colour: IRON, decor: true }, 0);
}

export const church: LandmarkBuilder = (ctx) => (String(ctx.params.tradition) === 'orthodox' ? orthodoxChurch(ctx) : westernChurch(ctx));

// ---------------------------------------------------------------------------------------------------------- the station

const BRICK_RED_IRON = rgb(0x7a3b2e), CAST_IRON = rgb(0x30393a), CANOPY_WOOD = rgb(0x6e5a46), BOARD_WHITE = rgb(0xe9e5d8);

/**
 * The railway station (the Kursk–Kharkov–Azov line's stations of the 1870s-80s; any line's country station): a long
 * brick hall — a two-storey centre block between single-storey wings — with segmental-arched windows under white
 * dressings, corbelled cornices, hipped iron roofs and brick stacks; on the track side (its front, +z) the platform
 * under a timber canopy on cast-iron columns, the station bell by the door and the name board on the centre block.
 */
export const stationHall: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = Math.max(20, Number(ctx.params.length)), D = Math.max(8, Number(ctx.params.depth)), canopyL = Math.max(0, Number(ctx.params.canopy));
  const base = -0.6 - ctx.groundFall, plinth = 0.5;
  const wall: RegionalBucket = 'stone', trim: RegionalBucket = 'plaster';
  const Wc = Math.min(14, Math.max(10, L * 0.34)), Dc = D + 1.0, Ww = (L - Wc) / 2;
  const H1 = plinth + 4.6, H2 = H1 + 3.8, Hw = plinth + 4.7;
  const surround = { bucket: trim, width: 0.15, out: 0.05 };
  const seg = (u: number, w: number, y0: number, spring: number): ArchHole => ({ u, w, y0, spring, form: 'segmental', rise: w * 0.22 });
  // the plinth under the whole hall (rendered)
  sink.span(trim, -L / 2 - 0.08, base, -D / 2 - 0.08, L / 2 + 0.08, plinth, D / 2 + 0.08);
  sink.span(trim, -Wc / 2 - 0.08, base, -Dc / 2 - 0.08, Wc / 2 + 0.08, plinth, Dc / 2 + 0.08);
  // ---- the wings
  for (const side of [-1, 1]) {
    const cx = side * (Wc / 2 + Ww / 2);
    const bays = Math.max(2, Math.round(Ww / 3.4));
    const us = Array.from({ length: bays }, (_, i) => -Ww / 2 + Ww * (i + 0.5) / bays);
    const doorAt = side < 0 ? us.length - 1 : 0; // the door in the bay next to the centre block
    const front = us.map((u, i) => (i === doorAt ? seg(u, 1.5, plinth, plinth + 2.7) : seg(u, 1.25, 1.25, 3.4)));
    const back = us.map((u) => seg(-u, 1.25, 1.25, 3.4));
    const holes: Partial<Record<FaceName, ArchHole[]>> = { front, back, [side < 0 ? 'left' : 'right']: [seg(0, 1.25, 1.25, 3.4)] };
    const faces = archedBody(sink, wall, cx, 0, Ww, D, plinth, Hw, holes, 0.3);
    for (const name of ['front', 'back', 'left', 'right'] as const) {
      for (const h of holes[name] ?? []) {
        if (h.y0 <= plinth + 0.01) doorLeaf(sink, faces[name], h, 0.3);
        else archWindow(sink, faces[name], h, 0.3, FRAME_WHITE, lit(ctx, 0.35));
        archSurround(sink, surround.bucket, faces[name], h, surround.width, surround.out);
      }
    }
    // the corbelled cornice: a brick band stepped out under a white frieze
    sink.placed(0, cx, 0, 0, () => {
      moulding(sink, trim, Ww, D, Hw - 0.62, 0.3, 0.04);
      moulding(sink, wall, Ww, D, Hw - 0.3, 0.16, 0.12);
      moulding(sink, wall, Ww, D, Hw - 0.14, 0.14, 0.22);
    });
    const roof: RoofSpec = { kind: 'hip', pitchDeg: 26, eave: 0.55, verge: 0.55, thickness: 0.1, bucket: 'structureMetal', ridge: null };
    const rg = roofGeometry(Ww, D, Hw, roof);
    sink.placed(0, cx, 0, 0, () => emitRoof(sink, rg, roof, BRICK_RED_IRON));
    // a brick stack through the ridge
    const sx = cx + side * Ww * 0.18, top = rg.ridgeTopY + 0.9;
    sink.span(wall, sx - 0.32, Hw, -0.32, sx + 0.32, top, 0.32);
    sink.span(wall, sx - 0.42, top, -0.42, sx + 0.42, top + 0.16, 0.42);
  }
  // ---- the centre block: two storeys, three bays a face, the main doors front and back
  const third = Wc / 3;
  const cHoles: Partial<Record<FaceName, ArchHole[]>> = {
    front: [seg(-third, 1.3, 1.25, 3.4), seg(0, 1.9, plinth, plinth + 2.9), seg(third, 1.3, 1.25, 3.4),
      seg(-third, 1.15, H1 + 0.9, H1 + 2.55), seg(0, 1.15, H1 + 0.9, H1 + 2.55), seg(third, 1.15, H1 + 0.9, H1 + 2.55)],
    back: [seg(-third, 1.3, 1.25, 3.4), seg(0, 1.9, plinth, plinth + 2.9), seg(third, 1.3, 1.25, 3.4),
      seg(-third, 1.15, H1 + 0.9, H1 + 2.55), seg(0, 1.15, H1 + 0.9, H1 + 2.55), seg(third, 1.15, H1 + 0.9, H1 + 2.55)],
    left: [seg(0, 1.15, H1 + 0.9, H1 + 2.55)],
    right: [seg(0, 1.15, H1 + 0.9, H1 + 2.55)],
  };
  const cf = archedBody(sink, wall, 0, 0, Wc, Dc, plinth, H2, cHoles, 0.32);
  for (const name of ['front', 'back', 'left', 'right'] as const) {
    for (const h of cHoles[name] ?? []) {
      if (h.y0 <= plinth + 0.01) doorLeaf(sink, cf[name], h, 0.32);
      else archWindow(sink, cf[name], h, 0.32, FRAME_WHITE, lit(ctx, 0.4));
      archSurround(sink, surround.bucket, cf[name], h, surround.width, surround.out);
    }
  }
  cornerPilasters(sink, trim, 0, 0, Wc, Dc, plinth, H2 - 0.6, 0.5, 0.07);
  // the string course between the storeys and the cornice
  moulding(sink, trim, Wc, Dc, H1 + 0.05, 0.26, 0.08);
  moulding(sink, trim, Wc, Dc, H2 - 0.64, 0.32, 0.04);
  moulding(sink, wall, Wc, Dc, H2 - 0.32, 0.16, 0.14);
  moulding(sink, wall, Wc, Dc, H2 - 0.16, 0.16, 0.26);
  const roofC: RoofSpec = { kind: 'hip', pitchDeg: 27, eave: 0.6, verge: 0.6, thickness: 0.1, bucket: 'structureMetal', ridge: null };
  const rgC = roofGeometry(Wc, Dc, H2, roofC);
  emitRoof(sink, rgC, roofC, BRICK_RED_IRON);
  for (const sx of [-1, 1]) {
    const x = sx * Wc * 0.22, top = rgC.ridgeTopY + 0.8;
    sink.span(wall, x - 0.34, H2, -0.34, x + 0.34, top, 0.34);
    sink.span(wall, x - 0.44, top, -0.44, x + 0.44, top + 0.16, 0.44);
  }
  // the name board between the storeys and the clock over the door (platform face)
  const pf = cf.front;
  sink.box('structureWood', facePoint(pf, 0, H1 + 0.55, 0.05), [Wc * 0.3, 0.3, 0.05], { colour: BOARD_WHITE, decor: true }, frameOf(pf));
  for (let k = 0; k < 10; k++) {
    const u = -Wc * 0.26 + Wc * 0.52 * (k + 0.5) / 10;
    sink.box('structureMetal', facePoint(pf, u, H1 + 0.55, 0.105), [0.1, 0.17, 0.005], { colour: IRON, decor: true, fine: true }, frameOf(pf));
  }
  revolveDisc(sink, pf, 0, H2 - 1.25, 0.5);
  // ---- the platform canopy on cast-iron columns, its roof falling toward the track
  if (canopyL > 0) {
    const z0 = D / 2, depth = 3.7, yIn = Hw - 0.55, yOut = yIn - 0.5, cols = Math.max(2, Math.round(canopyL / 3.8));
    const zc = z0 + depth - 0.35;
    for (let i = 0; i <= cols; i++) {
      const x = -canopyL / 2 + 0.3 + (canopyL - 0.6) * i / cols;
      revolve(sink, 'structureMetal', x, zc, [[0.17, 0], [0.17, 0.3], [0.09, 0.42], [0.085, yOut - 0.5], [0.13, yOut - 0.3], [0.13, yOut - 0.12]], 8,
        { colour: CAST_IRON });
      // the bracket: a diagonal strut from the column to the beam under the roof
      sink.member('structureMetal', [x, yOut - 1.3, zc], [x, yOut - 0.12, zc - 1.1], 0.07, 0.07, [1, 0, 0], { colour: CAST_IRON, decor: true, exposed: true }, 0.035);
    }
    // the beam along the columns and the roof slab
    sink.span('structureWood', -canopyL / 2, yOut - 0.3, zc - 0.11, canopyL / 2, yOut - 0.06, zc + 0.11, { colour: CANOPY_WOOD });
    const n: Vec3 = [0, Math.cos(Math.atan(0.5 / depth)), Math.sin(Math.atan(0.5 / depth))];
    const slab: Vec3[] = [[-canopyL / 2, yIn, z0], [canopyL / 2, yIn, z0], [canopyL / 2, yOut, z0 + depth + 0.25], [-canopyL / 2, yOut, z0 + depth + 0.25]];
    extrude(sink, 'structureMetal', slab, n, 0.08, { colour: BRICK_RED_IRON });
    // the fretwork valance along the outer edge (dressing)
    sink.span('structureWood', -canopyL / 2, yOut - 0.42, z0 + depth + 0.2, canopyL / 2, yOut + 0.02, z0 + depth + 0.25, { colour: CANOPY_WOOD, decor: true });
    for (let x = -canopyL / 2 + 0.15; x < canopyL / 2; x += 0.3) {
      sink.span('structureWood', x - 0.07, yOut - 0.56, z0 + depth + 0.21, x + 0.07, yOut - 0.42, z0 + depth + 0.24, { colour: CANOPY_WOOD, decor: true, fine: true });
    }
    // the station bell on its bracket beside the main door
    sink.member('structureMetal', facePoint(pf, 1.6, 3.6, 0), facePoint(pf, 1.6, 3.6, 0.55), 0.05, 0.05, [1, 0, 0], { colour: IRON, decor: true, exposed: true }, 0.025);
    bell(sink, facePoint(pf, 1.6, 0, 0.55)[0], 3.5, facePoint(pf, 1.6, 0, 0.55)[2], 0.17);
  }
  // ---- the platform: a low brick-edged deck along the track side (no collision: a hull rolls up it like a kerb)
  const PL = Math.max(L, canopyL) / 2 + 2, pz0 = D / 2 - 0.1, pz1 = D / 2 + 5.0;
  sink.span(trim, -PL, -0.4, pz0, PL, 0.3, pz1, { decor: true });
  sink.span('stone', -PL, 0.3, pz1 - 0.35, PL, 0.34, pz1, { decor: true });
  return {
    parts: sink.finish(),
    tints: { plaster: [0.94, 0.93, 0.9], stone: [1.02, 0.98, 0.95] },
    destructibles: [
      { kind: 'bench', x: -Wc / 2 - 2.6, z: D / 2 + 1.2, yawDeg: 0 },
      { kind: 'bench', x: Wc / 2 + 2.6, z: D / 2 + 1.2, yawDeg: 0 },
    ],
  };
};

/** A face's own frame for boxes set on it (u across, y up, out). */
function frameOf(face: Face) {
  return new LocalFrame(face.u, [0, 1, 0], face.out, [0, 0, 0]);
}

// ---------------------------------------------------------------------------------------------------------- town hall

/**
 * The town hall (a German Rathaus): an open arcade across the ground floor of its front, two storeys of windows over
 * it, a steep roof with dormers and stepped gables at its ends, and a ridge turret — the clock stage, an open lantern
 * and a bell-shaped helm with its spike. `frame` (the Hessian Fachwerk-Rathaus, Alsfeld's): the stone arcade under
 * upper storeys of render in an oak frame — sill and head beams at every storey, posts at the bays and beside the
 * windows, the rails under the sills, the corners' braced figures — framed gables under the roof's verge instead of
 * stepped ones, and the two corner turrets (Erker) with their slate spires over the front.
 */
export const townHall: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const W = Math.max(14, Number(ctx.params.width)), D = Math.max(9, Number(ctx.params.depth));
  const storeys = Math.max(2, Math.min(4, Math.round(Number(ctx.params.storeys)))), towerTop = Math.max(18, Number(ctx.params.tower));
  const base = -0.6 - ctx.groundFall, wall: RegionalBucket = 'stone', render: RegionalBucket = 'plaster', plinth = 0.5;
  const framed = ctx.params.frame === true, OAK = rgb(0x46302a);
  const g = 4.6, up = 3.5, eave = plinth + g + up * (storeys - 1), arcadeD = 2.8;
  sink.span(wall, -W / 2 - 0.1, base, -D / 2 - 0.1, W / 2 + 0.1, plinth, D / 2 + 0.1);
  // the ground floor: the arcade slab across the front, the hall's wall set back behind it, the side and back walls
  const bays = Math.max(3, Math.round(W / 4.2)), bw = W / bays;
  const arches: ArchHole[] = Array.from({ length: bays }, (_, i) => ({ u: -W / 2 + bw * (i + 0.5), w: bw * 0.66, y0: plinth, spring: plinth + g - bw * 0.33 - 0.5, form: 'round' as const }));
  sink.placed(0, 0, 0, D / 2 - 0.4, () => archedSlab(sink, wall, -W / 2, W / 2, plinth, plinth + g, 0.8, arches, { ends: true, top: false }));
  const back = archedBody(sink, render, 0, -arcadeD / 2, W - 1.0, D - arcadeD - 0.6, plinth, plinth + g, {
    front: [{ u: 0, w: 1.6, y0: plinth, spring: plinth + 2.6, form: 'round' }],
  }, 0.3);
  doorLeaf(sink, back.front, { u: 0, w: 1.6, y0: plinth, spring: plinth + 2.6, form: 'round' }, 0.3);
  // the upper storeys over the whole plan, a window to a bay, each storey's string course
  const holes: Partial<Record<FaceName, ArchHole[]>> = { front: [], back: [], left: [], right: [] };
  for (let k = 0; k < storeys - 1; k++) {
    const y0 = plinth + g + up * k + 0.9;
    for (let i = 0; i < bays; i++) {
      const u = -W / 2 + bw * (i + 0.5);
      const rise = framed ? 0.04 : 0.2;
      holes.front!.push({ u, w: 1.15, y0, spring: y0 + 1.75, form: 'segmental', rise });
      holes.back!.push({ u: -u, w: 1.15, y0, spring: y0 + 1.75, form: 'segmental', rise });
    }
    for (const u of [-D * 0.25, D * 0.25]) {
      holes.left!.push({ u, w: 1.1, y0, spring: y0 + 1.75, form: 'segmental', rise: framed ? 0.04 : 0.2 });
      holes.right!.push({ u, w: 1.1, y0, spring: y0 + 1.75, form: 'segmental', rise: framed ? 0.04 : 0.2 });
    }
  }
  const upper = archedBody(sink, render, 0, 0, W, D, plinth + g + ARCH_GAP_M_CIVIC, eave, holes, 0.28);
  for (const name of ['front', 'back', 'left', 'right'] as const) {
    for (const h of holes[name] ?? []) {
      archWindow(sink, upper[name], h, 0.28, FRAME_WHITE, lit(ctx, 0.35));
      if (!framed) archSurround(sink, wall, upper[name], h, 0.16, 0.06);
    }
  }
  if (framed) {
    // the oak frame over the render: per storey the sill beam, the posts at the bays and either side of each window,
    // the rails under the sills between them, and a braced figure at each corner
    for (const name of ['front', 'back', 'left', 'right'] as const) {
      const face = upper[name], fw = face.width, win = holes[name] ?? [];
      for (let k = 0; k < storeys - 1; k++) {
        const y0 = plinth + g + up * k, y1 = y0 + up;
        faceBox(sink, 'structureWood', face, 0, y0 + 0.14, 0.04, fw, 0.28, 0.08, { colour: OAK, decor: true });
        const storeyWin = win.filter((h) => h.y0 > y0 && h.y0 < y1);
        const posts = new Set<number>([-fw / 2 + 0.12, fw / 2 - 0.12]);
        for (const h of storeyWin) { posts.add(h.u - h.w / 2 - 0.12); posts.add(h.u + h.w / 2 + 0.12); }
        const bayLines = name === 'front' || name === 'back' ? bays : 3;
        for (let i = 1; i < bayLines; i++) {
          const u = -fw / 2 + fw * i / bayLines;
          if (!storeyWin.some((h) => Math.abs(h.u - u) < h.w / 2 + 0.25)) posts.add(u);
        }
        for (const u of posts) faceBox(sink, 'structureWood', face, u, (y0 + y1) / 2 + 0.07, 0.035, 0.18, up - 0.14, 0.07, { colour: OAK, decor: true });
        // the rails under the sills, interrupted at the windows
        const sillY = storeyWin.length ? storeyWin[0].y0 - 0.1 : y0 + 0.8;
        const sorted = [...posts].sort((a, b) => a - b);
        for (let i = 0; i + 1 < sorted.length; i++) {
          const a = sorted[i], b = sorted[i + 1];
          if (storeyWin.some((h) => h.u > a && h.u < b)) continue;
          faceBox(sink, 'structureWood', face, (a + b) / 2, sillY, 0.035, b - a, 0.14, 0.07, { colour: OAK, decor: true, fine: true });
          // the braced figure in the end panels
          if (i === 0 || i + 2 === sorted.length) {
            const p0 = facePoint(face, i === 0 ? a + 0.1 : b - 0.1, y0 + 0.3, 0.04), p1 = facePoint(face, i === 0 ? b - 0.1 : a + 0.1, y1 - 0.25, 0.04);
            bar(sink, 'structureWood', p0, p1, 0.12, { colour: OAK, decor: true });
          }
        }
      }
    }
    faceBox(sink, 'structureWood', upper.front, 0, eave - 0.12, 0.04, W, 0.24, 0.08, { colour: OAK, decor: true });
    faceBox(sink, 'structureWood', upper.back, 0, eave - 0.12, 0.04, W, 0.24, 0.08, { colour: OAK, decor: true });
  } else {
    for (let k = 0; k < storeys - 1; k++) moulding(sink, wall, W, D, plinth + g + up * k - 0.05, 0.22, 0.1);
    cornerPilasters(sink, wall, 0, 0, W, D, plinth + g, eave - 0.2, 0.6, 0.07);
    moulding(sink, wall, W, D, eave - 0.3, 0.3, 0.2);
  }
  // the roof: ridge along the front (built in a frame turned a quarter), the gables (stepped, or framed under the verge),
  // the dormers
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 55, eave: 0.4, verge: framed ? 0.45 : 0.05, thickness: 0.14, bucket: 'roof', ridge: 'saddle' };
  const rg = roofGeometry(D, W, eave, roof);
  sink.placed(Math.PI / 2, 0, 0, 0, () => emitRoof(sink, rg, roof));
  const rise = rg.ridgeY - eave, steps = 6;
  if (framed) {
    for (const sx of [-1, 1]) {
      const x = sx * W / 2;
      const A: Vec3 = [x, eave, -D / 2], B: Vec3 = [x, eave, D / 2], C: Vec3 = [x, rg.ridgeY, 0];
      sink.polygon('plaster', sx > 0 ? [A, C, B] : [A, B, C]);
      const o = sx * 0.04;
      // the gable's frame: its foot beam, a collar at half height, the king post and the two raking braces
      bar(sink, 'structureWood', [x + o, eave + 0.1, -D / 2], [x + o, eave + 0.1, D / 2], 0.2, { colour: OAK, decor: true });
      const cy = eave + rise * 0.5, half = (D / 2) * 0.5;
      bar(sink, 'structureWood', [x + o, cy, -half], [x + o, cy, half], 0.16, { colour: OAK, decor: true });
      bar(sink, 'structureWood', [x + o, eave + 0.1, 0], [x + o, rg.ridgeY - 0.2, 0], 0.16, { colour: OAK, decor: true });
      for (const zs of [-1, 1]) bar(sink, 'structureWood', [x + o, eave + 0.2, zs * (D / 2 - 0.3)], [x + o, cy, zs * half * 0.4], 0.12, { colour: OAK, decor: true, fine: true });
    }
    // the corner turrets over the front: corbelled out from the first upper storey, octagonal, under slate spires
    for (const sx of [-1, 1]) {
      const tx = sx * (W / 2 - 0.15), tz = D / 2 - 0.15, y0 = plinth + g + 0.2, yTop = eave + 1.3;
      revolve(sink, 'plaster', tx, tz, [[0.35, y0], [1.15, y0 + 0.9], [1.15, yTop]], 8, {}, Math.PI / 8);
      revolve(sink, 'stone', tx, tz, [[1.2, yTop - 0.05], [1.22, yTop + 0.15]], 8, { decor: true }, Math.PI / 8);
      const spire = yTop + Math.max(3.6, rise * 0.7);
      revolve(sink, 'structureMetal', tx, tz, [[1.3, yTop + 0.1], [0.04, spire]], 8, { colour: SLATE_BLUE }, Math.PI / 8);
      revolve(sink, 'structureMetal', tx, tz, [[0.05, spire - 0.1], [0.015, spire + 0.9]], 4, { colour: GILT, decor: true });
    }
  } else for (const sx of [-1, 1]) {
    for (let k = 0; k < steps; k++) {
      const y0 = eave + rise * k / steps, y1 = eave + rise * (k + 1) / steps + 0.35, half = (D / 2 + 0.1) * (1 - k / steps);
      sink.span(wall, sx * W / 2 - 0.35, y0, -half, sx * W / 2 + 0.05, y1, half);
      sink.span(wall, sx * W / 2 - 0.45, y1, -half - 0.08, sx * W / 2 + 0.12, y1 + 0.1, -half + 0.4);
      sink.span(wall, sx * W / 2 - 0.45, y1, half - 0.4, sx * W / 2 + 0.12, y1 + 0.1, half + 0.08);
    }
  }
  for (const zs of [1, -1]) for (const u of [-W * 0.3, W * 0.3]) {
    const dRoof: RoofSpec = { kind: 'gable', pitchDeg: 48, eave: 0.12, verge: 0.12, thickness: 0.08, bucket: 'roof', ridge: null };
    const zf = zs * (D / 2 - 1.2);
    sink.placed(zs > 0 ? 0 : Math.PI, u, 0, zf, () => {
      sink.span(render, -0.7, eave + 0.4, -0.6, 0.7, eave + 1.7, 0.9);
      sink.quad('glass', [-0.45, eave + 0.6, 0.91], [0.45, eave + 0.6, 0.91], [0.45, eave + 1.5, 0.91], [-0.45, eave + 1.5, 0.91], { decor: true, window: [0, 0, 1] });
      emitRoof(sink, roofGeometry(1.4, 1.5, eave + 1.7, dRoof), dRoof);
    });
  }
  // the ridge turret
  // (its body reaches down to the roof slopes at its sides: no gap shows under it)
  const tb = 3.0, ty0 = rg.ridgeY - (tb / 2) * Math.tan(roof.pitchDeg * Math.PI / 180) - 0.3, ty1 = rg.ridgeTopY + 3.2;
  const tf = archedBody(sink, render, 0, 0, tb, tb, ty0, ty1, {}, 0);
  for (const name of ['front', 'back', 'left', 'right'] as const) revolveDisc(sink, tf[name], 0, ty1 - 1.3, 0.85);
  moulding(sink, wall, tb, tb, ty1 - 0.2, 0.2, 0.12);
  const lanternTop = ty1 + 2.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sink.span('structureWood', sx * (tb / 2 - 0.3) - 0.12, ty1, sz * (tb / 2 - 0.3) - 0.12, sx * (tb / 2 - 0.3) + 0.12, lanternTop, sz * (tb / 2 - 0.3) + 0.12, { colour: rgb(0x3a3430) });
  sink.span('structureWood', -tb / 2 + 0.2, lanternTop, -tb / 2 + 0.2, tb / 2 - 0.2, lanternTop + 0.25, tb / 2 - 0.2, { colour: rgb(0x3a3430) });
  bell(sink, 0, lanternTop - 0.2, 0, 0.42);
  const helm = dome(sink, 'structureMetal', 0, lanternTop + 0.25, 0, tb * 0.52, 'onion', 12, { colour: SLATE_BLUE });
  revolve(sink, 'structureMetal', 0, 0, [[0.12, helm - 0.1], [0.02, Math.max(helm + 1.5, towerTop)], [0, Math.max(helm + 1.6, towerTop + 0.1)]], 6, { colour: GILT, decor: true });
  return { parts: sink.finish(), tints: { plaster: [1.0, 0.94, 0.84] } };
};
const ARCH_GAP_M_CIVIC = 0.002;

// ---------------------------------------------------------------------------------------------------------- market hall

/**
 * The market hall (a Renaissance town's Markthalle, a Tuscan loggia del mercato): an arcade round the ground floor,
 * open bay by bay, the upper hall with its windows over it, and a hipped roof with a lantern.
 */
export const marketHall: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = Math.max(14, Number(ctx.params.length)), W = Math.max(8, Number(ctx.params.width)), bays = Math.max(3, Math.round(Number(ctx.params.bays)));
  const base = -0.6 - ctx.groundFall, wall: RegionalBucket = 'stone', t = 0.8, g = 5.2, plinth = 0.4;
  sink.span(wall, -W / 2 - 0.1, base, -L / 2 - 0.1, W / 2 + 0.1, plinth, L / 2 + 0.1);
  const arcade = (len: number, n: number): ArchHole[] => Array.from({ length: n }, (_, i) => ({ u: -len / 2 + len * (i + 0.5) / n, w: len / n * 0.68, y0: plinth,
    spring: plinth + g - len / n * 0.34 - 0.6, form: 'round' as const }));
  const crossBays = Math.max(2, Math.round(bays * W / L));
  for (const [yaw, off, len, n] of [[0, L / 2 - t / 2, W, crossBays], [Math.PI, L / 2 - t / 2, W, crossBays], [Math.PI / 2, W / 2 - t / 2, L - 2 * t, bays],
    [-Math.PI / 2, W / 2 - t / 2, L - 2 * t, bays]] as const) {
    sink.placed(yaw, Math.sin(yaw) * off, 0, Math.cos(yaw) * off, () => archedSlab(sink, wall, -len / 2, len / 2, plinth, plinth + g, t, arcade(len, n), { ends: true, top: true }));
  }
  // the upper hall, its windows, the cornice, the hipped roof and lantern
  const up = 4.0, holes: Partial<Record<FaceName, ArchHole[]>> = {};
  holes.left = arcade(L, bays).map((h) => ({ u: h.u, w: 1.1, y0: plinth + g + 0.9, spring: plinth + g + 2.6, form: 'round' as const }));
  holes.right = holes.left.map((h) => ({ ...h }));
  holes.front = arcade(W, crossBays).map((h) => ({ u: h.u, w: 1.1, y0: plinth + g + 0.9, spring: plinth + g + 2.6, form: 'round' as const }));
  holes.back = holes.front.map((h) => ({ ...h }));
  const f = archedBody(sink, 'plaster', 0, 0, W, L, plinth + g + 0.002, plinth + g + up, holes, 0.3);
  for (const name of ['front', 'back', 'left', 'right'] as const) for (const h of holes[name] ?? []) {
    archWindow(sink, f[name], h, 0.3, FRAME_WHITE, lit(ctx, 0.2));
    archSurround(sink, wall, f[name], h, 0.14, 0.05);
  }
  moulding(sink, wall, W, L, plinth + g - 0.05, 0.25, 0.12);
  moulding(sink, wall, W, L, plinth + g + up - 0.3, 0.3, 0.22);
  const roof: RoofSpec = { kind: 'hip', pitchDeg: 32, eave: 0.7, verge: 0.7, thickness: 0.14, bucket: 'roof', ridge: 'saddle' };
  const rg = roofGeometry(W, L, plinth + g + up, roof);
  emitRoof(sink, rg, roof);
  const lt = drum(sink, 'plaster', 0, rg.ridgeY - 0.3, 0, 0.9, 1.4, 8, { windows: 4 });
  tentRoof(sink, 'roof', 0, 0, 1.25, lt, 1.4, 8);
  return { parts: sink.finish(), tints: { plaster: [1.0, 0.93, 0.8] } };
};

// ---------------------------------------------------------------------------------------------------------- grain elevator

/**
 * The grain elevator (the Soviet 1930s and the prairie's concrete elevators): a battery of cylindrical silos in rows,
 * the conveyor gallery along their tops, the tall head house at one end with its windows, its gabled top and the
 * loading spout over the track.
 */
export const grainElevator: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const rows = Math.max(1, Math.min(3, Math.round(Number(ctx.params.rows)))), cols = Math.max(2, Math.round(Number(ctx.params.cols)));
  const r = Math.max(2, Number(ctx.params.radius)), H = Math.max(14, Number(ctx.params.height)), head = Math.max(H + 6, Number(ctx.params.head));
  const base = -0.6 - ctx.groundFall, concrete: RegionalBucket = 'plaster3';
  // the whole run — silos, head house (7 m) and the spout (4.8 m) — centred on the piece
  const x0 = -(cols * 2 * r + 7.0 + 4.8) / 2;
  sink.span(concrete, x0 - 0.2, base, -rows * r - 0.2, x0 + cols * 2 * r + 0.2, 1.2, rows * r + 0.2);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = x0 + r + i * 2 * r, z = -rows * r + r + j * 2 * r;
    revolve(sink, concrete, x, z, [[r, 1.2], [r, H], [r * 0.96, H + 0.12], [r * 0.3, H + 0.55], [0.001, H + 0.6]], 16);
    // the slip-form rings (the pours' joints) as faint bands
    for (let y = 3; y < H - 1; y += 3) revolve(sink, concrete, x, z, [[r + 0.02, y], [r + 0.02, y + 0.12]], 16, { decor: true, shade: 0.86 });
  }
  // the gallery along the tops
  const gx1 = x0 + cols * 2 * r;
  sink.span(concrete, x0 + r * 0.4, H + 0.35, -1.6, gx1, H + 2.9, 1.6);
  sink.span('roof', x0 + r * 0.4 - 0.2, H + 2.9, -1.8, gx1, H + 3.05, 1.8);
  for (let x = x0 + r; x < gx1 - 1; x += 2.2) {
    for (const zs of [1, -1]) sink.quad('glass', [x, H + 1.4, zs * 1.61], [x + (zs > 0 ? 1 : -1) * 0.0, H + 1.4, zs * 1.61], [x, H + 2.2, zs * 1.61], [x, H + 2.2, zs * 1.61], { decor: true });
  }
  // the head house
  const hx0 = gx1 - 0.2, hw = 7.0, hd = Math.max(8, rows * 2 * r + 1);
  const holes: Partial<Record<FaceName, ArchHole[]>> = { front: [], back: [], right: [] };
  for (let y = 4; y < head - 4; y += 4.4) {
    holes.front!.push({ u: 0, w: 1.0, y0: y, spring: y + 1.6, form: 'flat' });
    holes.back!.push({ u: 0, w: 1.0, y0: y, spring: y + 1.6, form: 'flat' });
    holes.right!.push({ u: 0, w: 1.0, y0: y, spring: y + 1.6, form: 'flat' });
  }
  const hf = archedBody(sink, concrete, hx0 + hw / 2, 0, hw, hd, base, head, holes, 0.25);
  for (const name of ['front', 'back', 'right'] as const) for (const h of holes[name] ?? []) archWindow(sink, hf[name], h, 0.25, rgb(0x4a5a58), false, { bars: true });
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 30, eave: 0.3, verge: 0.3, thickness: 0.12, bucket: 'roof', ridge: null };
  sink.placed(0, hx0 + hw / 2, 0, 0, () => emitRoof(sink, roofGeometry(hw, hd, head, roof), roof));
  // the loading spout leaning out over the track side
  bar(sink, 'structureMetal', [hx0 + hw, head * 0.55, 0], [hx0 + hw + 4.5, head * 0.32, 0], 0.35, { colour: rgb(0x5d6062), decor: true });
  return { parts: sink.finish(), tints: { plaster3: [0.84, 0.83, 0.8] } };
};

// ---------------------------------------------------------------------------------------------------------- granary

/**
 * The collective farm's grain store (zernosklad): a long single-storey store of brick (or of boards on a brick plinth)
 * under a low gable roof, its double doors along the front with a ramp to each, a hoist gable at the middle with its
 * beam, and the small vents high under the eaves.
 */
export const granary: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = Math.max(14, Number(ctx.params.length)), W = Math.max(7, Number(ctx.params.width)), timber = String(ctx.params.walls) === 'timber';
  const base = -0.6 - ctx.groundFall, plinth = 0.9, H = plinth + 3.8;
  const wall: RegionalBucket = timber ? 'structureWood' : 'stone', wallOpts = timber ? { colour: rgb(0x6f5f4c) } : {};
  sink.span('stone', -L / 2 - 0.1, base, -W / 2 - 0.1, L / 2 + 0.1, plinth, W / 2 + 0.1);
  const doors = Math.max(2, Math.round(L / 9)), du = (i: number) => -L / 2 + L * (i + 0.5) / doors;
  const front: ArchHole[] = Array.from({ length: doors }, (_, i) => ({ u: du(i), w: 2.6, y0: plinth, spring: plinth + 2.8, form: 'flat' as const }));
  const vents = (len: number) => Array.from({ length: Math.round(len / 3.2) }, (_, i) => ({ u: -len / 2 + 1.6 + i * 3.2, w: 0.6, y0: H - 1.0, spring: H - 0.6, form: 'flat' as const }));
  const holes: Partial<Record<FaceName, ArchHole[]>> = { front: [...front, ...vents(L).filter((v) => front.every((d) => Math.abs(d.u - v.u) > 2))], back: vents(L) };
  const f = archedBody(sink, wall, 0, 0, L, W, plinth, H, holes, 0.3, wallOpts);
  for (const d of front) {
    gateLeaves(sink, f.front, d);
    // the ramp up to the door sill: its side profile run across the door's width
    extrude(sink, 'stone', [[d.u - 1.6, base, W / 2], [d.u - 1.6, base, W / 2 + 2.4], [d.u - 1.6, -0.1, W / 2 + 2.4], [d.u - 1.6, plinth, W / 2]],
      [1, 0, 0], 3.2);
  }
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 24, eave: 0.6, verge: 0.4, thickness: 0.1, bucket: 'roof', ridge: 'saddle' };
  sink.placed(Math.PI / 2, 0, 0, 0, () => emitRoof(sink, roofGeometry(W, L, H, roof), roof));
  if (!timber) moulding(sink, 'stone', L, W, H - 0.25, 0.25, 0.1);
  // the hoist gable over the middle door: a small cross gable, its loft door and the beam out of its peak
  const hg: RoofSpec = { kind: 'gable', pitchDeg: 40, eave: 0.2, verge: 0.3, thickness: 0.1, bucket: 'roof', ridge: null };
  sink.placed(0, 0, 0, W / 2 - 1.2, () => {
    sink.span(wall, -1.6, H - 0.2, -1.0, 1.6, H + 1.6, 1.6, wallOpts);
    sink.quad('structureWood', [-0.6, H + 0.1, 1.61], [0.6, H + 0.1, 1.61], [0.6, H + 1.4, 1.61], [-0.6, H + 1.4, 1.61], { colour: rgb(0x4a3b2e), decor: true });
    emitRoof(sink, roofGeometry(3.2, 2.6, H + 1.6, hg), hg);
    bar(sink, 'structureWood', [0, H + 2.4, 1.0], [0, H + 2.4, 2.6], 0.2, { colour: rgb(0x4a3b2e), decor: true });
  });
  return { parts: sink.finish() };
};

/** A double plank door hung in a flat-headed opening. */
function gateLeaves(sink: PartSink, face: Face, h: ArchHole): void {
  for (const side of [-1, 1]) {
    const u0 = h.u + side * 0.02, u1 = h.u + side * h.w / 2;
    sink.quad('structureWood', facePoint(face, Math.min(u0, u1), h.y0, -0.27), facePoint(face, Math.max(u0, u1), h.y0, -0.27),
      facePoint(face, Math.max(u0, u1), h.spring, -0.27), facePoint(face, Math.min(u0, u1), h.spring, -0.27), { colour: rgb(0x5e4a38), decor: true });
    sink.member('structureWood', facePoint(face, Math.min(u0, u1), h.y0 + 0.2, -0.25), facePoint(face, Math.max(u0, u1), h.spring - 0.2, -0.25), 0.12, 0.03,
      face.out, { colour: rgb(0x4e3c2e), decor: true, fine: true }, 0);
  }
}
