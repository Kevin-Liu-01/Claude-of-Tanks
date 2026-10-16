// src/world/landmarks/civicChurch.ts — the church set piece (moved byte for byte out of civic.ts by the looks lane, r2
// sweep 2026-10-16): the Orthodox village church of the black-earth governorates and the Western hall church.
import { LocalFrame, PartSink, faceBox, facePoint, rgb, type Face, type RegionalBucket, type Vec3 } from '../maps/regional/geometry.ts';
import { emitRoof, roofGeometry, type RoofSpec } from '../maps/regional/house.ts';
import { LIMEWASH_UV, archSurround, archWindow, archedBody, archedFace, prismBody, archedSlab, bar, cornerPilasters, cross, dome, drum, extrude, moulding, portico, revolve, smoothRender, tentRoof, type ArchHole, type FaceName } from './kit.ts';
import { ageWall } from './age.ts';
import type { LandmarkBuildContext, LandmarkBuilder } from './types.ts';
import { DOME_GREEN, FRAME_WHITE, GILT, GREEN_IRON, SLATE_BLUE, bell, cornice, doorLeaf, lit, towerClock, uvOffset } from './civicKit.ts';

/** Glaze and dress every opening of a body face. */
function dressOpenings(sink: PartSink, ctx: LandmarkBuildContext, face: Face, holes: readonly ArchHole[], reveal: number,
  surround: { bucket: RegionalBucket; width: number; out: number } | null, litShare: number): void {
  for (const h of holes) {
    archWindow(sink, face, h, reveal, FRAME_WHITE, lit(ctx, litShare));
    if (surround) archSurround(sink, surround.bucket, face, h, surround.width, surround.out);
  }
}

/**
 * A drum with its windows cut (the looks lane, r2 sweep 2026-10-16: kit.ts drum painted them as dark slots on its ring):
 * an n-sided masonry prism with its corners where the drum's ring stood, round-headed windows through `windows` of its
 * facets with their reveals, glazed at the back in their frames under a dressed surround, the cornice over it. Returns its
 * top, as drum() does.
 */
function glazedDrum(sink: PartSink, bucket: RegionalBucket, x: number, y: number, z: number, r: number, h: number, segments: number,
  windows: number, foot = 0): number {
  const rIn = r * Math.cos(Math.PI / segments), facet = 2 * rIn * Math.tan(Math.PI / segments);
  const every = Math.max(1, Math.round(segments / windows)), ww = Math.min(0.7, facet * 0.56), reveal = Math.min(0.32, r * 0.16);
  const holes: Record<number, ArchHole[]> = {};
  for (let k = 0; k < windows; k++) holes[(k * every) % segments] = [{ u: 0, w: ww, y0: y + h * 0.22, spring: y + h * 0.78 - ww / 2, form: 'round' }];
  // (`foot`: the walls run on down through a sloping roof to stand on the vault under it; the floor closes the prism)
  const faces = prismBody(sink, bucket, x, z, rIn, segments, y - foot, y + h, holes, reveal);
  sink.polygon(bucket, faces.map((f) => facePoint(f, f.width / 2, y - foot)).reverse());
  for (const [i, list] of Object.entries(holes)) for (const hole of list) {
    archWindow(sink, faces[Number(i)], hole, reveal, FRAME_WHITE, false);
    archSurround(sink, bucket, faces[Number(i)], hole, Math.min(0.12, facet * 0.1), 0.05);
  }
  // the cornice on the prism's corners (revolve's ring turned half a facet onto them)
  revolve(sink, bucket, x, z, [[r, y + h], [r * 1.09, y + h], [r * 1.09, y + h + 0.22], [r * 0.98, y + h + 0.22]], segments, {}, Math.PI / segments - Math.PI / 2);
  return y + h + 0.22;
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
  // (the looks lane, r2 sweep: at the spring line the beam's ends stood in the side arches' openings, carried by
  // nothing) the beam over the arches' crowns, its ends in the solid walls, the bells hung from it
  const hang = spring + archW / 2 + 0.12;
  sink.span('structureWood', -side / 2 + t - 0.15, hang, zc - 0.09, side / 2 - t + 0.15, hang + 0.18, zc + 0.09, { colour: rgb(0x4a3b2e), decor: true });
  bell(sink, 0, hang - 0.16, zc, Math.min(0.72, side * 0.14));
  bell(sink, -side * 0.24, hang - 0.16, zc, Math.min(0.42, side * 0.08));
  bell(sink, side * 0.24, hang - 0.16, zc, Math.min(0.36, side * 0.07));
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
  // (the r2 sweep: the portico doors were leaves stood on the wall) the portals cut through the north and south faces
  const cubePortal = (): ArchHole => ({ u: 0, w: 1.5, y0: plinthTop, spring: 2.9, form: 'round' });
  const cubeCut: Partial<Record<FaceName, ArchHole[]>> = { ...cubeHoles, left: [...(cubeHoles.left ?? []), cubePortal()], right: [...(cubeHoles.right ?? []), cubePortal()] };
  const cubeFaces = archedBody(sink, wall, 0, (zCubeFront + zCubeBack) / 2, W, W, plinthTop, Hc, cubeCut, 0.42);
  for (const name of ['left', 'right', 'back', 'front'] as const) dressOpenings(sink, ctx, cubeFaces[name], cubeHoles[name] ?? [], 0.42, surround, 0.25);
  cornerPilasters(sink, wall, 0, (zCubeFront + zCubeBack) / 2, W, W, plinthTop, Hc - 0.35, 0.55, 0.08);
  cornice(sink, wall, 0, (zCubeFront + zCubeBack) / 2, W, W, Hc, 1.3);
  for (const name of ['left', 'right'] as const) {
    const f = cubeFaces[name];
    portico(sink, f, { width: Math.min(6.6, W * 0.6), depth: 2.3, height: Hc * 0.6, columns: 4, bucket: 'plaster', roofBucket: 'structureMetal',
      roofColour: GREEN_IRON });
    // the portal under the portico
    const door = cubePortal();
    doorLeaf(sink, f, door, 0.42);
    archSurround(sink, 'plaster', f, door, 0.2, 0.08);
  }
  // the cube's low hipped roof, the drum and the dome with its lantern
  const roofCube: RoofSpec = { kind: 'hip', pitchDeg: 17, eave: 0.45, verge: 0.45, thickness: 0.12, bucket: 'structureMetal', ridge: null };
  const rgCube = roofGeometry(W, W, Hc, roofCube);
  sink.placed(0, 0, 0, (zCubeFront + zCubeBack) / 2, () => emitRoof(sink, rgCube, roofCube, GREEN_IRON));
  const zc = (zCubeFront + zCubeBack) / 2, Rd = W * 0.27;
  const drumBase = rgCube.ridgeY - 0.3;
  const drumTop = glazedDrum(sink, wall, 0, drumBase, zc, Rd, Math.max(3, W * 0.34), 16, 8, Rd * Math.tan(roofCube.pitchDeg * Math.PI / 180) + 0.1);
  const domeTop = dome(sink, 'structureMetal', 0, drumTop, zc, Rd * 1.04, heads === 5 ? 'onion' : 'helm', 16, { colour: DOME_GREEN });
  const lantern = drum(sink, wall, 0, domeTop - 0.1, zc, Rd * 0.2, 1.1, 8, {});
  const headTop = dome(sink, 'structureMetal', 0, lantern, zc, Rd * 0.24, 'onion', 10, { colour: GILT });
  cross(sink, 'structureMetal', 0, headTop - 0.05, zc, 1.9, 'orthodox', GILT);
  if (heads === 5) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * W * 0.3, z = zc + sz * W * 0.3;
      const roofY = rgCube.topAt(x, z - zc) ?? Hc;
      const top = glazedDrum(sink, wall, x, roofY - 0.4, z, Rd * 0.36, 1.9, 10, 4);
      const t2 = dome(sink, 'structureMetal', x, top, z, Rd * 0.4, 'onion', 10, { colour: DOME_GREEN });
      cross(sink, 'structureMetal', x, t2 - 0.05, z, 1.2, 'orthodox', GILT);
    }
  }
  // ---- the apse: a half drum on the cube's east face under its half dome
  const apseH = Hc * 0.68;
  // (the r2 sweep: the apse's windows were panes on its curved face) seven facets — the half of a 14-gon — with three
  // windows cut through the second, the middle and the sixth, glazed at the back of their reveals
  const apseIn = Ra * Math.cos(Math.PI / 14), apseFacet = 2 * Ra * Math.sin(Math.PI / 14), apseWin = Math.min(0.9, apseFacet - 0.42);
  for (let k = 0; k < 7; k++) {
    const a = (k + 0.5) / 7 * Math.PI, nx = Math.cos(a), nz = -Math.sin(a);
    const f: Face = { origin: [nx * apseIn, 0, zCubeBack + nz * apseIn], u: [nz, 0, -nx], out: [nx, 0, nz], width: apseFacet };
    const holes: ArchHole[] = k % 2 ? [{ u: 0, w: apseWin, y0: 2.4, spring: 4.4, form: 'round' }] : [];
    archedFace(sink, wall, f, { u0: -apseFacet / 2, u1: apseFacet / 2, y0: plinthTop, y1: apseH }, holes, 0.36);
    for (const h of holes) {
      archWindow(sink, f, h, 0.36, FRAME_WHITE, lit(ctx, 0.2), { bars: false });
      archSurround(sink, 'plaster', f, h, 0.14, 0.06);
    }
  }
  sink.cylinder(wall, [0, apseH, zCubeBack], 'y', 0.3, Ra + 0.12, 14, {}, Ra + 0.18, true, 0, Math.PI);
  for (let k = 0; k < 6; k++) {
    const r0 = Ra + 0.24, a0 = k / 6 * Math.PI / 2, a1 = (k + 1) / 6 * Math.PI / 2;
    sink.cylinder('structureMetal', [0, apseH + 0.3 + Math.sin(a0) * Ra * 0.62, zCubeBack], 'y', (Math.sin(a1) - Math.sin(a0)) * Ra * 0.62,
      r0 * Math.cos(a0), 14, { colour: GREEN_IRON }, r0 * Math.cos(a1), k === 5, 0, Math.PI);
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
  const octTop = glazedDrum(sink, wall, 0, bs1 + 0.02, zt, R3, Math.max(2, towerTop * 0.08), 8, 4);
  if (crown === 'onion') {
    const neck = drum(sink, wall, 0, octTop, zt, R3 * 0.62, 1.1, 10, {});
    const top = dome(sink, 'structureMetal', 0, neck, zt, R3 * 0.72, 'onion', 12, { colour: DOME_GREEN });
    cross(sink, 'structureMetal', 0, top - 0.05, zt, 1.8, 'orthodox', GILT);
  } else {
    const cap = dome(sink, 'structureMetal', 0, octTop, zt, R3 * 0.98, 'helm', 12, { colour: DOME_GREEN });
    const tip = needle(sink, 0, cap - 0.2, zt, R3 * 0.22, Math.max(3, towerTop - cap - 1.6));
    cross(sink, 'structureMetal', 0, tip - 0.1, zt, 1.5, 'orthodox', GILT);
  }
  // ---- its age (age.ts; gauntlet wave 154: "pristine … no socle, staining, cracking or peeling"): the render fallen
  // from the brick at the wall foot and under the sills, the grime run down from the cornices and the sills
  const age = ctx.age;
  if (age) for (const name of ['left', 'right'] as const) {
    const porch = { u: 0, w: Math.min(6.6, W * 0.6) + 0.8, y0: plinthTop, spring: Hc * 0.6 + 1.4, form: 'flat' };
    ageWall(sink, age, { face: cubeFaces[name], bucket: wall, area: { u0: -W / 2 + 0.6, u1: W / 2 - 0.6, y0: plinthTop, y1: Hc - 0.6 },
      openings: [...(cubeHoles[name] ?? []), porch], ledge: Hc - 0.5, spall: 'stone', spallCount: 3, grime: 0.3 });
    ageWall(sink, age, { face: refFaces[name], bucket: wall, area: { u0: -Lr / 2 + 0.4, u1: Lr / 2 - 0.4, y0: plinthTop, y1: Hr - 0.5 },
      openings: refHoles[name] ?? [], ledge: Hr - 0.4, spall: 'stone', grime: 0.3 });
  }
  if (age) for (const [u0, u1] of [[-W / 2 + 0.5, -Ra - 0.3], [Ra + 0.3, W / 2 - 0.5]] as const) {
    ageWall(sink, age, { face: cubeFaces.back, bucket: wall, area: { u0, u1, y0: plinthTop, y1: Hc - 0.6 }, openings: cubeHoles.back ?? [],
      ledge: Hc - 0.5, spall: 'stone', spallCount: 1, grime: 0.3 });
  }
  if (age) for (const name of ['front', 'left', 'right'] as const) {
    ageWall(sink, age, { face: towerFaces[name], bucket: wall, area: { u0: -T / 2 + 0.5, u1: T / 2 - 0.5, y0: plinthTop, y1: H1 - 0.5 },
      openings: towerHoles[name] ?? [], ledge: H1 - 0.4, spall: 'stone', grime: 0.3 });
  }
  // (the maps lane, 2026-10-15, Verdant's paired capture: the church's walls blew out to a white blob with a halo under
  // the Kursk sun, 11 % of the frame clipped where main's view clipped 0.3 %) the lime render's tint a weathered white,
  // in line with the village's whitewashed khatas (was [1.0, 1.0, 0.99]: the smoothed render samples the print's
  // brightest texels across the whole wall); (the blind critics on Verdant v2, PASS +0.38 with one loss: at 0.8 the church
  // still blew out under High bloom into a glowing silhouette washing out half the frame) 0.7 over the village lime-wash
  // (kolkhoz.ts whitewash, now eased in over a knee): about 0.45 a wall, lit by the sun without feeding the bloom
  return { parts: smoothRender(sink.finish(), RENDER_SMOOTH), tints: { plaster: [0.7, 0.69, 0.66], plaster2: [1, 1, 1], plaster3: [1, 1, 1] } };
}

/** The UV scale of a church's and a monument's lime render over the village print (kit.ts smoothRender). */
const RENDER_SMOOTH = LIMEWASH_UV;

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
    towerClock(sink, f, 0, cy, 0.95, wall);
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
    const lantern = glazedDrum(sink, wall, 0, capTop - 0.2, zt, T * 0.16, 1.6, 8, 4);
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

export const church: LandmarkBuilder = (ctx) => (String(ctx.params.tradition) === 'orthodox' ? orthodoxChurch(ctx) : westernChurch(ctx));
