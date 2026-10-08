// src/world/maps/regional/damage.ts — the regional house kits' damage (the facades lane, 2026-10-07; docs/DESTRUCTION.md
// §16, the kit seam src/world/destructionKit.ts).
//
// Owner, 2026-10-07: "destructible buildings and props need to be included in the buildings redesign, they need to look
// just as good as everything else." The core decides when and where (stages, holes, fallen sections, the rubble mound);
// this module builds what a house of a regional kit looks like at each stage, from the plan its kit built it by: the
// house grammar's own storeys, faces, openings, Fachwerk members, masonry layout, floors, roof and chimneys
// (house.ts HousePlan, handed back beside the parts by index.ts buildRegionalParts as RegionalKitPlan).
//
// `describe` turns that plan into the seam's StructureDamageAnatomy (numbers and layout handles, never geometry), in the
// building's frame: the frame the parts are in before props.ts places them. A house built under a placement (a body
// turned along its plot, house.ts / geometry.ts alongPlot) is described through it. A builder that built no house body
// hands back no plan: the core's default kit reads its parts.
import { masonryLayout } from '../../regionalSurfaces.ts';
import {
  bodyMoundHeightAt, registerStructureDamageKit,
  type DamageChimney, type DamageFace, type DamageOpening, type DamageRoof, type DamageStorey, type FaceName as SeamFace,
  type FractureMaterial, type FractureSlot, type FrameMember, type MasonryLayout, type RoofKind as SeamRoofKind, type RoofSlab,
  type StructureDamageAnatomy, type StructureDamageKit, type StructureDescribeInput, type Vec3,
} from '../../destructionKit.ts';
import { BUCKET_UV_DENSITY, facePoint, type Face, type RegionalBucket, type Rgb } from './geometry.ts';
import { storeyFaces, type HousePlan } from './house.ts';
import type { RegionalKitPlan } from './index.ts';
import type { ArchitectureStyle } from './types.ts';
import { WEATHER_ROUTE, wallWeather, type WeatherTints } from './weather.ts';
import { breachHouse, collapseHouse, damagedHouse, domeMound, sectionDownHouse, storeyDownHouse, type FaceSurface, type HouseDamageExtras } from './fracture.ts';
import { debrisPiece } from './debris.ts';
import { readCells, readShaft, readShell, readWallPieces } from './shell.ts';
import { breachRuin, collapseRuin, damagedRuin, ruinPiecesOf, ruinRubble, sectionDownRuin } from './ruin.ts';
import { breachCluster, cellsOf, collapseCluster, damagedCluster, sectionDownCluster } from './cluster.ts';
import { breachContainers, collapseContainers, containersOf, damagedContainers, readContainers, sectionDownContainers } from './container.ts';
import { collapseShaft, shaftOf } from './shaft.ts';
import { breachSheet, collapseSheet, damagedSheet, isSheetBody, isSheetFace, roofDownSheet, sectionDownSheet } from './sheet.ts';

const FACE_ORDER: readonly SeamFace[] = ['front', 'right', 'back', 'left'];
const WHITE: Rgb = [1, 1, 1];
/** the joists and rafters a breach and a stripped roof show (house.ts emitRoofPatch's timbers) */
const JOIST: Rgb = [0.36, 0.27, 0.19];
const RAFTER: Rgb = [0.3, 0.22, 0.15];
/** the room a breach opens: an unlit interior a shade warm */
const ROOM: Rgb = [0.032, 0.028, 0.025];
/** the kits whose walls are earth under their render (mud brick, rammed earth; a khata's wattle and daub) */
const EARTH_KITS: ReadonlySet<string> = new Set(['wadirum', 'ksar', 'siwa', 'navajo', 'kolkhoz']);
/** builders whose body is one open shell (a breach shows the far wall, not a room) */
const OPEN_SHELLS: ReadonlySet<string> = new Set(['barn', 'granary', 'woodshed', 'depot', 'mill', 'warehouse', 'shed', 'boatshed']);

// ---------------------------------------------------------------------------------------------------- the frame

/** The placement a body was built under, as a point and a direction map into the building's frame. */
interface BodyFrame {
  point(p: Vec3): Vec3;
  dir(v: Vec3): Vec3;
  /** a quarter turn (or three): the body's x and z extents swap in the building's frame */
  turned: boolean;
}
function bodyFrame(place: HousePlan['place']): BodyFrame {
  if (!place) return { point: (p) => [p[0], p[1], p[2]], dir: (v) => [v[0], v[1], v[2]], turned: false };
  const c = Math.cos(place.yaw), s = Math.sin(place.yaw);
  return {
    point: (p) => [p[0] * c + p[2] * s + place.x, p[1] + place.y, -p[0] * s + p[2] * c + place.z],
    dir: (v) => [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c],
    turned: Math.abs(s) > 0.7,
  };
}

// ---------------------------------------------------------------------------------------------------- materials

function routed(bucket: RegionalBucket): string {
  return WEATHER_ROUTE[bucket] ?? bucket;
}

/** How a style's stone breaks (its painter kind). */
function stoneMaterial(style: ArchitectureStyle): FractureMaterial {
  const k = style.surfaces.stone.kind;
  if (k === 'brick') return 'brick';
  if (k === 'block') return 'concrete';
  if (k === 'rubble' || k === 'fieldstone' || k === 'greywacke') return 'rubble';
  return 'stone';
}

function tintOf(tints: WeatherTints, bucket: RegionalBucket): Rgb {
  if (bucket === 'stone') return tints.stone;
  if (bucket === 'roof') return tints.roof;
  if (bucket === 'plaster' || bucket === 'plaster2' || bucket === 'plaster3') return tints[bucket];
  return WHITE;
}

/** a khata's daub and an earth wall under its render: clay (kolkhoz.ts CLAY), as the spalled render shows it */
const CLAY: Rgb = [0.76, 0.6, 0.44];

/** A storey wall's layers, outermost first (destructionKit FractureSlot). `spallTint`: what the kit's render shows where it
 *  spalls (HouseSpec.spallTint), the earth core's own paint. */
function wallLayers(style: ArchitectureStyle, wall: RegionalBucket, framed: boolean, tints: WeatherTints, timber: Rgb | null, spallTint?: Rgb): FractureSlot[] {
  if (wall === 'stone') {
    return [{ material: stoneMaterial(style), bucket: 'regionalStone', tint: tints.stone, thicknessM: 0.45, share: 1 }];
  }
  if (wall === 'wood' || wall === 'structureWood' || wall === 'dark') {
    return [{ material: 'plank', bucket: wall, tint: WHITE, thicknessM: 0.12, share: 1 }];
  }
  if (wall === 'straw') return [{ material: 'thatch', bucket: 'straw', tint: WHITE, thicknessM: 0.3, share: 1 }];
  if (wall === 'structureMetal') return [{ material: 'metal', bucket: wall, tint: WHITE, thicknessM: 0.02, share: 1 }];
  const skin = routed(wall), tint = tintOf(tints, wall);
  if (framed) {
    return [
      { material: 'timber', bucket: 'structureWood', tint: timber ?? JOIST, thicknessM: 0.16, share: 0.3 },
      { material: 'infill', bucket: skin, tint, thicknessM: 0.14, share: 0.7 },
    ];
  }
  if (wall === 'plaster2' && style.surfaces.concrete) return [{ material: 'concrete', bucket: skin, tint, thicknessM: 0.25, share: 1 }];
  // render over the region's core: mud brick in the earth kits, the kit's brick, else rubble masonry
  const core: FractureMaterial = EARTH_KITS.has(style.id) ? 'adobe' : style.surfaces.stone.kind === 'brick' ? 'brick' : 'rubble';
  return [
    { material: 'plaster', bucket: skin, tint, thicknessM: 0.03, share: 1 },
    core === 'adobe'
      ? { material: 'adobe', bucket: skin, tint: mul3(tint, spallTint ?? CLAY), thicknessM: 0.4, share: 1 }
      : { material: core, bucket: 'regionalStone', tint: tints.stone, thicknessM: 0.4, share: 1 },
  ];
}

/** A roof covering's material, its bucket and tint. */
function covering(style: ArchitectureStyle, bucket: RegionalBucket, kind: string, tints: WeatherTints, colour?: Rgb): FractureSlot {
  if (bucket === 'straw') return { material: 'thatch', bucket: 'straw', tint: WHITE, thicknessM: 0.35, share: 1 };
  if (bucket === 'structureMetal') return { material: 'metal', bucket, tint: colour ?? WHITE, thicknessM: 0.01, share: 1 };
  if (bucket === 'wood') return { material: 'plank', bucket, tint: WHITE, thicknessM: 0.04, share: 1 };
  if (bucket !== 'roof') {
    // a flat roof of rammed earth over its beams (a stone or render bucket: the Chouf, the ksar, the desert houses)
    return { material: kind === 'flat' ? 'earth' : 'plaster', bucket: routed(bucket), tint: tintOf(tints, bucket), thicknessM: 0.3, share: 1 };
  }
  const r = style.surfaces.roof.kind;
  const material: FractureMaterial = r === 'slate' ? 'slate' : r === 'shingle' ? 'plank' : r === 'sheet' || r === 'asbestos' ? 'metal' : 'tile';
  return { material, bucket: 'regionalRoof', tint: tints.roof, thicknessM: material === 'metal' ? 0.01 : 0.04, share: 1 };
}

// ---------------------------------------------------------------------------------------------------- masonry

/**
 * A coursed wall's layout on one face of a storey (destructionKit MasonryLayout): the kit's own masonry tile
 * (regionalSurfaces.ts masonryLayout, 512 px over 2 m at the stone bucket's 0.5 uv/m) projected the way geometry.ts
 * maps a wall (world uv by the face's axis, plus the house's uv offset), so a break steps along the joints the wall
 * shows and a broken block keeps its texture. Courses and joints are in face coordinates (u, and y from the floor).
 */
function masonryOn(style: ArchitectureStyle, face: Face, floorY: number, height: number, uvOffset: readonly [number, number]): MasonryLayout {
  const layout = masonryLayout(style.surfaces.stone.kind, !!style.surfaces.stone.dressed);
  const S = layout.size, D = BUCKET_UV_DENSITY.stone, [ou, ov] = uvOffset;
  // the face's world uv axis: x for a ±z face, z for a ±x face (geometry.ts uvOf, world mode)
  const alongX = Math.abs(face.out[2]) > 0.5;
  const axis = alongX ? 0 : 2, sign = face.u[axis];
  const coordOf = (u: number) => face.origin[axis] + face.u[axis] * u;
  // course boundaries: the canvas is flipped on upload (row 0 at v = 1), so a boundary row r is the tile's v = 1 - r / S
  const rowsV = [...new Set(layout.courses.flatMap((c) => [c.y0, c.y1]))].map((r) => 1 - r / S).sort((a, b) => a - b);
  const courses: number[] = [0];
  const courseOf: number[] = [];
  const vLo = floorY * D + ov, vHi = (floorY + height) * D + ov;
  for (let n = Math.floor(vLo) - 1; n <= Math.ceil(vHi); n++) {
    for (const vb of rowsV) {
      const y = (n + vb - ov) / D - floorY;
      if (y > 1e-4 && y < height - 1e-4) courses.push(y);
    }
  }
  courses.sort((a, b) => a - b);
  // a boundary on the tile's seam comes from both tiles: once
  for (let k = courses.length - 1; k > 0; k--) if (courses[k] - courses[k - 1] < 1e-4) courses.splice(k, 1);
  // the layout course each face course lies in (by its middle), for its joints
  for (let k = 0; k < courses.length; k++) {
    const y = (courses[k] + (courses[k + 1] ?? height)) / 2, v = (floorY + y) * D + ov, f = v - Math.floor(v);
    const row = (1 - f) * S;
    courseOf.push(Math.max(0, layout.courses.findIndex((c) => row >= c.y0 && row < c.y1)));
  }
  const half = face.width / 2;
  const jointsCache = new Map<number, readonly number[]>();
  return {
    courses,
    joints(index: number): readonly number[] {
      const hit = jointsCache.get(index);
      if (hit) return hit;
      const c = layout.courses[courseOf[Math.min(courseOf.length - 1, Math.max(0, index))]];
      const edges = [...new Set(c.blocks.flatMap((b) => [b.x0, b.x1]))].map((x) => x / S);
      const out: number[] = [];
      const t0 = coordOf(-half) * D + ou, t1 = coordOf(half) * D + ou;
      for (let n = Math.floor(Math.min(t0, t1)) - 1; n <= Math.ceil(Math.max(t0, t1)); n++) {
        for (const e of edges) {
          const coord = (n + e - ou) / D, u = (coord - face.origin[axis]) / sign;
          if (u > -half + 1e-4 && u < half - 1e-4) out.push(u);
        }
      }
      out.sort((a, b) => a - b);
      const unique = out.filter((u, i) => i === 0 || u - out[i - 1] > 1e-4);
      jointsCache.set(index, unique);
      return unique;
    },
    uv(u: number, y: number, out: [number, number]): void {
      out[0] = coordOf(u) * D + ou;
      out[1] = (floorY + y) * D + ov;
    },
  };
}

// ---------------------------------------------------------------------------------------------------- describe

function seamRoofKind(kind: string): SeamRoofKind {
  return kind === 'halfhip' || kind === 'hip' || kind === 'flat' || kind === 'shed' ? kind : 'gable';
}

/** The anatomy of a house of a regional kit, from the plan its kit built it by. */
function describeHouse(style: ArchitectureStyle, input: StructureDescribeInput): StructureDamageAnatomy | null {
  const plan = input.kitPlan as RegionalKitPlan | undefined;
  if (!plan || plan.kind !== 'regional-house' || !plan.houses.length) return null;
  // the main body: the largest house the builder built (a farm's wing, a lean-to, a porch go to the default reading)
  const house = plan.houses.reduce((a, b) => (b.spec.w * b.spec.d > a.spec.w * a.spec.d ? b : a));
  const { spec, frame } = house;
  const T = bodyFrame(house.place);
  const tints = plan.tints;
  // the intact walls' own uv and weathering by section, for the builders' seamless redraws (fracture.ts FaceSurface)
  const surfaces = new Map<number, FaceSurface>();
  const relief = style.surfaces.relief?.plasterUv ?? 1, damp = style.weather?.damp ?? 0.8, [ou, ov] = house.uvOffset;
  const surfaceOf = (face: Face, floorY: number, profile: WallProfile | null): FaceSurface => {
    const axis = Math.abs(face.out[2]) > 0.5 ? 0 : 2;
    return {
      colour: profile ? (bucket, y, out) => profile.at(bucket, y, out) : undefined,
      uv(bucket, u, y, out) {
        const plaster = bucket.startsWith('regionalPlaster') || bucket.startsWith('plaster');
        const d = plaster ? BUCKET_UV_DENSITY.plaster : bucket === 'regionalStone' || bucket === 'stone' ? BUCKET_UV_DENSITY.stone : BUCKET_UV_DENSITY.wood;
        const k = plaster ? relief : 1;
        out[0] = ((face.origin[axis] + face.u[axis] * u) * d + ou) * k;
        out[1] = ((floorY + y) * d + ov) * k;
      },
      weather: (bucket, y) => (bucket.startsWith('regional') && bucket !== 'regionalRoof' ? wallWeather(floorY + y, damp) : 1),
    };
  };
  const framedAny = spec.storeys.some((s) => s.framed);
  const storeys: DamageStorey[] = spec.storeys.map((storey, i) => {
    const body = frame.bodies[i];
    const faces = storeyFaces(frame, i);
    const height = body.y1 - body.y0;
    const layers0 = wallLayers(style, storey.wall, !!storey.framed, tints, house.timber, spec.spallTint);
    const damageFaces: DamageFace[] = FACE_ORDER.map((name, f) => {
      const face = faces[name];
      const openings: DamageOpening[] = spec.openings.filter((o) => o.storey === i && o.face === name).map((o) => ({
        kind: o.kind, u: o.u, w: o.w, y0: o.y0, h: o.h, reveal: frame.reveal, ...(o.state ? { state: o.state } : {}),
      }));
      const members: FrameMember[] = house.members.filter((m) => m.storey === i && m.face === name).map((m) => ({
        role: m.role, u0: m.u0, y0: m.y0, u1: m.u1, y1: m.y1, widthM: m.widthM, depthM: m.depthM,
      }));
      surfaces.set(i * 4 + f, surfaceOf(face, body.y0, wallProfile(input.parts, routed(storey.wall), T.point(facePoint(face, 0, body.y0)), T.dir(face.u),
        T.dir(face.out), face.width, height)));
      return {
        name, section: i * 4 + f,
        origin: T.point(facePoint(face, 0, body.y0)), u: T.dir(face.u), out: T.dir(face.out), width: face.width, height,
        bucket: layers0[storey.framed ? 1 : 0].bucket, layers: layers0.map((l) => ({ ...l })), openings, members,
        masonry: storey.wall === 'stone' ? masonryOn(style, face, body.y0, height, house.uvOffset) : null,
      };
    });
    return {
      index: i, y0: body.y0 + (house.place?.y ?? 0), y1: body.y1 + (house.place?.y ?? 0),
      jetty: storey.jetty ?? [0, 0, 0, 0], framed: !!storey.framed, faces: damageFaces,
      floor: i === 0 ? null : {
        thicknessM: 0.22, joistPitchM: 0.62,
        structure: { material: 'timber', bucket: 'structureWood', tint: JOIST, thicknessM: 0.22, share: 1 },
      },
    };
  });
  // the roof over the top body (house.ts lays it out centred on the top body and moves it there)
  const top = frame.bodies[frame.bodies.length - 1];
  const rcx = (top.x0 + top.x1) / 2, rcz = (top.z0 + top.z1) / 2;
  const rg = frame.roof, R = spec.roof;
  const roofCover = covering(style, R.bucket, R.kind, tints, spec.roofColour);
  const slabs: RoofSlab[] = [];
  const at = (x: number, y: number, z: number): Vec3 => T.point([x + rcx, y, z + rcz]);
  const cosP = Math.cos(Math.atan(rg.tanP));
  if (R.kind === 'flat') {
    const e = R.eave, y = frame.eaveY + R.thickness;
    slabs.push({ corners: [at(-rg.s - e, y, rg.halfD + e), at(rg.s + e, y, rg.halfD + e), at(rg.s + e, y, -rg.halfD - e), at(-rg.s - e, y, -rg.halfD - e)], bucket: roofCover.bucket });
  } else if (R.kind === 'shed') {
    const e = R.eave, lo = frame.eaveY - e * rg.tanP + R.thickness / cosP, hi = rg.ridgeTopY + e * rg.tanP, D = rg.halfD + R.verge;
    slabs.push({ corners: [at(rg.s + e, lo, D), at(rg.s + e, lo, -D), at(-rg.s - e, hi, -D), at(-rg.s - e, hi, D)], bucket: roofCover.bucket });
  } else {
    const e = R.eave, D = rg.halfD + R.verge, lo = frame.eaveY - e * rg.tanP + R.thickness / cosP, ridge = rg.ridgeTopY, rh = rg.ridgeHalf;
    for (const side of [1, -1]) {
      slabs.push({ corners: [at(side * (rg.s + e), lo, side * D), at(side * (rg.s + e), lo, -side * D), at(0, ridge, -side * rh), at(0, ridge, side * rh)],
        bucket: roofCover.bucket });
    }
    if (rh < D - 1e-3) {
      // the hip (or half-hip) ends: their eave corners and the ridge's end (a triangle as a quad with its apex twice); a
      // half-hip's end starts where its gable wall stops (house.ts: the gable polygon's top edge), not at the side eaves
      const top = R.kind === 'halfhip' && rg.gable && rg.gable.length === 4 ? rg.gable[2] : null;
      for (const end of [1, -1]) {
        const apex = at(0, ridge, end * rh);
        const corners: [Vec3, Vec3, Vec3, Vec3] = top
          ? [at(-end * top[0], top[1] + R.thickness / cosP, end * rg.halfD), at(end * top[0], top[1] + R.thickness / cosP, end * rg.halfD), apex, apex]
          : [at(-end * (rg.s + e), lo, end * D), at(end * (rg.s + e), lo, end * D), apex, apex];
        slabs.push({ corners, bucket: roofCover.bucket });
      }
    }
  }
  const roof: DamageRoof = {
    kind: seamRoofKind(R.kind), section: storeys.length * 4, pitchDeg: R.pitchDeg, eaveY: frame.eaveY + (house.place?.y ?? 0),
    ridgeY: rg.ridgeTopY + (house.place?.y ?? 0), thicknessM: R.thickness, covering: roofCover,
    structure: R.kind === 'flat'
      ? { material: 'timber', bucket: 'structureWood', tint: JOIST, thicknessM: 0.22, share: 1 }
      : { material: 'timber', bucket: 'structureWood', tint: RAFTER, thicknessM: 0.14, share: 1 },
    battenPitchM: roofCover.material === 'thatch' ? 0.35 : 0.3, rafterPitchM: 0.8, slabs,
  };
  const chimneys: DamageChimney[] = spec.chimneys.map((c) => {
    const roofY = rg.topAt(c.x - rcx, c.z - rcz);
    const y1 = (roofY ?? rg.ridgeTopY) + c.above;
    const y0 = c.inWall ? 0 : Math.max(frame.eaveY - 0.4, (roofY ?? frame.eaveY) - 1.2);
    const p = T.point([c.x, 0, c.z]);
    return { x: p[0], z: p[2], sx: T.turned ? c.sz : c.sx, sz: T.turned ? c.sx : c.sz, y0: y0 + p[1], y1: y1 + p[1], bucket: routed(c.bucket) };
  });
  const plinth = spec.plinth ? {
    h: spec.plinth.h, out: spec.plinth.out,
    slot: { material: spec.plinth.bucket === 'stone' ? stoneMaterial(style) : 'plaster' as FractureMaterial, bucket: routed(spec.plinth.bucket),
      tint: tintOf(tints, spec.plinth.bucket), thicknessM: 0.5, share: 1 },
  } : null;
  // the pile: the walls' layers by volume, the roof's covering and its timbers, the floors' joists
  const pile = new Map<string, FractureSlot>();
  const add = (slot: FractureSlot, volume: number) => {
    const key = `${slot.material}|${slot.bucket}`;
    const had = pile.get(key);
    if (had) had.share += volume; else pile.set(key, { ...slot, share: volume });
  };
  for (const st of storeys) for (const f of st.faces) {
    const open = f.openings.reduce((a, o) => a + o.w * o.h, 0);
    const area = Math.max(0, f.width * f.height - open);
    for (const l of f.layers) add(l, area * l.thicknessM * (l.material === 'timber' ? 0.35 : 1));
    if (st.floor) add(st.floor.structure, f.width * 0.05);
  }
  const roofArea = slabs.reduce((a, s) => a + quadArea(s.corners), 0);
  add(roof.covering, roofArea * Math.max(0.04, roof.covering.thicknessM));
  add(roof.structure, roofArea * 0.03);
  for (const c of chimneys) add({ material: 'brick', bucket: c.bucket, tint: c.bucket === 'regionalStone' ? tints.stone : WHITE, thicknessM: 0.24, share: 0 },
    c.sx * c.sz * (c.y1 - c.y0) * 0.6);
  const total = [...pile.values()].reduce((a, s) => a + s.share, 0) || 1;
  const rubble = [...pile.values()].map((s) => ({ ...s, share: s.share / total })).sort((a, b) => b.share - a.share);
  const ground = storeys[0]?.faces[0]?.layers[0]?.material;
  const w = T.turned ? spec.d : spec.w, d = T.turned ? spec.w : spec.d;
  return {
    structureIdx: input.structureIdx, kit: style.id, seed: input.seed, massClass: input.massClass, placement: input.placement,
    w: w + 2 * Math.max(0, ...spec.storeys.map((s) => Math.max(s.jetty?.[1] ?? 0, s.jetty?.[3] ?? 0))),
    d: d + 2 * Math.max(0, ...spec.storeys.map((s) => Math.max(s.jetty?.[0] ?? 0, s.jetty?.[2] ?? 0))),
    h: Math.max(roof.ridgeY, ...chimneys.map((c) => c.y1)),
    plinth, storeys, roof, chimneys,
    interior: { color: ROOM, open: OPEN_SHELLS.has(plan.builder) },
    rubble,
    // a masonry ground storey leaves its walls to a metre and its corners standing; a framed or render-over-rubble
    // one falls lower; the chimney stacks stand
    remnant: { stubHeightM: ground === 'stone' || ground === 'brick' ? 1.1 : framedAny ? 0.5 : 0.8, corners: ground === 'stone' || ground === 'brick', chimneys: true },
    kitPlan: { regional: plan, damage: { kind: 'house-damage', surfaces } satisfies HouseDamageExtras },
  };
}

// ---------------------------------------------------------------------------------------------------- a shell

/**
 * Builders whose bodies the shell reading leaves to other hands: open frames and stalls (gantries, markets, ramadas,
 * container stacks), a ruin's broken walls, and the tall shafts (stacks, water towers, minarets, towers) whose fall
 * is its own stage (they topple in drums, never settle as a house's heap).
 */
const NOT_SHELLS = /gantry|market|ramada|container|ruin|stack|watertower|minaret|tower|needle|arcology|crane|silo|tent/i;

/**
 * A wall bucket's layers, outermost first, in the building's own buckets (a regional kit's or the base set's), as deep
 * in all as the wall its parts show (shell.ts ShellFace.depth; the presentation clamps a fallen panel through that
 * depth, so a thicker wall box than its layers would stand through its own fall).
 */
function shellLayers(style: ArchitectureStyle, bucket: string, tint: Rgb, coreBucket: string, depth: number | null = null): FractureSlot[] {
  const D = depth !== null && depth >= 0.05 && depth <= 0.9 ? depth : null;
  if (bucket === 'regionalStone' || bucket === 'stone') return [{ material: stoneMaterial(style), bucket, tint, thicknessM: D ?? 0.45, share: 1 }];
  if (bucket === 'structureMetal' || bucket === 'steel') {
    // the cladding, then its girts and the hall's lining behind it (the wall box's own depth)
    const sheet: FractureSlot = { material: 'metal', bucket, tint, thicknessM: 0.02, share: 1 };
    return D !== null && D > 0.06 ? [sheet, { material: 'metal', bucket, tint: [0.27, 0.28, 0.3], thicknessM: D - 0.02, share: 1 }] : [sheet];
  }
  if (bucket === 'wood' || bucket === 'structureWood' || bucket === 'dark') return [{ material: 'plank', bucket, tint, thicknessM: D ?? 0.12, share: 1 }];
  if (bucket === 'straw') return [{ material: 'thatch', bucket, tint, thicknessM: D ?? 0.3, share: 1 }];
  if (bucket === 'baked' || (/plaster2/i.test(bucket) && style.surfaces.concrete)) return [{ material: 'concrete', bucket, tint, thicknessM: D ?? 0.25, share: 1 }];
  // a render over the region's core (mud brick in the earth kits, the kit's brick, else rubble masonry)
  const core: FractureMaterial = EARTH_KITS.has(style.id) ? 'adobe' : style.surfaces.stone.kind === 'brick' ? 'brick' : 'rubble';
  const coreT = Math.max(0.1, (D ?? 0.43) - 0.03);
  return [
    { material: 'plaster', bucket, tint, thicknessM: 0.03, share: 1 },
    core === 'adobe' ? { material: 'adobe', bucket, tint: mul3(tint, CLAY), thicknessM: coreT, share: 1 }
      : { material: core, bucket: coreBucket, tint: coreBucket === bucket ? mul3(tint, [0.8, 0.74, 0.68]) : WHITE, thicknessM: coreT, share: 1 },
  ];
}

/**
 * A coursed wall's layout where no kit tile gives one (a base set's sourced brick or stone print): units of a size the
 * material breaks into at a building's scale (a brick wall comes apart in stepped lumps of a few courses, dressed stone
 * by its blocks, rubble by its stones), laid in half bond from the wall's foot, the texture read through the face's
 * own uv fit (shell.ts) so a broken unit keeps the wall's print where it stood.
 */
function unitMasonry(material: FractureMaterial, height: number, width: number, floorY: number,
  uvAt: (u: number, y: number, out: [number, number]) => void): MasonryLayout | null {
  const unit = material === 'brick' ? [0.3, 0.56] : material === 'stone' ? [0.42, 0.74] : material === 'rubble' ? [0.32, 0.46] : null;
  if (!unit || height < 0.5) return null;
  const [ch, cw] = unit;
  const n = Math.max(1, Math.round(height / ch)), step = height / n;
  const courses = Array.from({ length: n }, (_, k) => k * step);
  const half = width / 2;
  const jointsOf = new Map<number, readonly number[]>();
  return {
    courses,
    joints(index: number): readonly number[] {
      const hit = jointsOf.get(index);
      if (hit) return hit;
      // half bond: every other course shifted half a unit; a unit's length varies a little by its course (seeded by
      // the course index, so the wall is the same wall every time it is read)
      const shift = (index % 2) * cw / 2, k = 0.85 + 0.3 * (((index * 7919) % 13) / 13);
      const out: number[] = [];
      for (let u = -half + shift + cw * k; u < half - 1e-3; u += cw * k) out.push(u);
      jointsOf.set(index, out);
      return out;
    },
    uv(u: number, y: number, out: [number, number]): void { uvAt(u, floorY + y, out); },
  };
}

/** A roof covering in the building's own bucket: the kit's roof kind for its tiles, else by the bucket. */
function shellCovering(style: ArchitectureStyle, bucket: string, tint: Rgb, flat: boolean): FractureSlot {
  if (bucket === 'straw') return { material: 'thatch', bucket, tint, thicknessM: 0.35, share: 1 };
  if (bucket === 'structureMetal' || bucket === 'steel') return { material: 'metal', bucket, tint, thicknessM: 0.01, share: 1 };
  if (bucket === 'wood' || bucket === 'structureWood') return { material: 'plank', bucket, tint, thicknessM: 0.04, share: 1 };
  if (bucket === 'baked' || (/plaster2/i.test(bucket) && style.surfaces.concrete)) return { material: 'concrete', bucket, tint, thicknessM: 0.22, share: 1 };
  // a deck of the walls' render: rammed earth over its beams in the earth kits, a cast slab elsewhere
  if (bucket !== 'roof' && bucket !== 'regionalRoof') {
    return flat ? { material: EARTH_KITS.has(style.id) ? 'earth' : 'concrete', bucket, tint, thicknessM: EARTH_KITS.has(style.id) ? 0.3 : 0.22, share: 1 }
      : { material: 'plaster', bucket, tint, thicknessM: 0.3, share: 1 };
  }
  const r = style.surfaces.roof.kind;
  const material: FractureMaterial = r === 'slate' ? 'slate' : r === 'shingle' ? 'plank' : r === 'sheet' || r === 'asbestos' ? 'metal' : 'tile';
  return { material, bucket, tint, thicknessM: material === 'metal' ? 0.01 : 0.04, share: 1 };
}

/**
 * The anatomy of a body its kit built no house plan for, read off its parts (shell.ts readShell): a works hall, a store,
 * a fire station or a chapel of the base set on a regional map, a regional hall. Its walls in their own buckets, the
 * texture they show fitted from the parts (a redrawn skin meets the wall round it), its colour up the wall sampled
 * (wallProfile), its roof's slopes, glass and doors and chimneys, so the kit's stage builders dress it as they dress a
 * house: the same breaches, wall and roof falls and heaps, in this building's materials. Null where the parts do not
 * close into a shell (the default kit reads those).
 */
function describeShell(style: ArchitectureStyle, input: StructureDescribeInput): StructureDamageAnatomy | null {
  if (NOT_SHELLS.test(input.builder)) return null;
  const r = readShell(input.parts);
  if (!r) return null;
  const W = r.x1 - r.x0, D = r.z1 - r.z0, wallH = r.eave - r.base;
  // a shaft (taller than twice its footprint) falls as a shaft, not as a house
  if (wallH > 2.2 * Math.max(W, D)) return null;
  // a light structure baked into one coloured mesh (a Quonset's arch, a greenhouse's glass, a shack's boards: the base
  // set's DESTRUCTIBLE_BUILDING_TYPES) says nothing of its material by its bucket: its own kit reads it
  if (r.faces.some((f) => f.bucket === 'baked')) return null;
  const open = OPEN_SHELLS.has(input.builder) || /hall|works|factory|warehouse|depot|shed|garage|hangar|mill|station|barn|store/i.test(input.builder);
  // the bands the sim cuts the walls into (sim/structureSections.ts: 3.2 m, at most six), so a fallen section shows the
  // band that fell; an open hall's bands have no floors between them
  // (a wall built as one part from foot to eave falls whole: the presentation clamps a fallen panel by its parts, so a
  // band of such a wall could never come away from the rest; its body is one band)
  const count = r.faces.every((f) => f.whole) ? 1 : Math.max(1, Math.min(6, Math.round(wallH / 3.2)));
  const storeyH = wallH / count;
  const has = (b: string): boolean => !!input.parts[b]?.length;
  const coreBucket = has('regionalStone') ? 'regionalStone' : has('stone') ? 'stone' : '';
  const surfaces = new Map<number, FaceSurface>();
  const damp = style.weather?.damp ?? 0.8, relief = style.surfaces.relief?.plasterUv ?? 1;
  const storeys: DamageStorey[] = [];
  for (let i = 0; i < count; i++) {
    const y0 = r.base + i * storeyH, y1 = y0 + storeyH;
    const faces: DamageFace[] = r.faces.map((sf, f) => {
      const layers = shellLayers(style, sf.bucket, sf.tint, coreBucket || sf.bucket, sf.depth);
      const origin: Vec3 = [sf.origin[0], y0, sf.origin[2]];
      const fit = sf.uv;
      const regional = sf.bucket.startsWith('regional');
      surfaces.set(i * 4 + f, {
        colour: (() => {
          const profile = wallProfile(input.parts, sf.bucket, origin, sf.u, sf.out, sf.width, storeyH);
          return profile ? (bucket: string, y: number, out: [number, number, number]) => profile.at(bucket, y, out) : undefined;
        })(),
        uv(bucket, u, y, out) {
          if (fit && bucket === fit.bucket) { out[0] = fit.au * u + fit.bu; out[1] = fit.av * (y0 + y) + fit.bv; return; }
          const plaster = bucket.startsWith('regionalPlaster') || bucket.startsWith('plaster');
          const dn = plaster ? BUCKET_UV_DENSITY.plaster : bucket === 'regionalStone' || bucket === 'stone' ? BUCKET_UV_DENSITY.stone : BUCKET_UV_DENSITY.wood;
          const k = plaster ? relief : 1;
          const axis = Math.abs(sf.out[2]) > 0.5 ? 0 : 2;
          out[0] = (origin[axis] + sf.u[axis] * u) * dn * k;
          out[1] = (y0 + y) * dn * k;
        },
        weather: (bucket, y) => (regional && bucket.startsWith('regional') && bucket !== 'regionalRoof' ? wallWeather(y0 + y, damp) : 1),
      });
      // a coursed regional wall's joints, when its texture lies as the kit lays it (world uv at the stone density along
      // the face's axis): the offset is the fit's, less the face centre's own coordinate
      const axis = Math.abs(sf.out[2]) > 0.5 ? 0 : 2, dStone = BUCKET_UV_DENSITY.stone;
      const masonry = sf.bucket === 'regionalStone' && fit && Math.abs(fit.au - sf.u[axis] * dStone) < 0.01 && Math.abs(fit.av - dStone) < 0.01
        ? masonryOn(style, { origin: [sf.origin[0], 0, sf.origin[2]], u: sf.u, out: sf.out, width: sf.width }, y0, storeyH,
          [fit.bu - sf.origin[axis] * dStone, fit.bv])
        // a base set's print (no kit tile): units the wall's material breaks into, through the wall's own uv
        : unitMasonry(layers[0].material, storeyH, sf.width, y0, (uu, yy, o) => {
          if (fit) { o[0] = fit.au * uu + fit.bu; o[1] = fit.av * yy + fit.bv; return; }
          o[0] = (sf.origin[axis] + sf.u[axis] * uu) * dStone; o[1] = yy * dStone;
        });
      return {
        name: sf.name, section: i * 4 + f, origin, u: sf.u, out: sf.out, width: sf.width, height: storeyH,
        bucket: layers[0].bucket, layers: layers.map((l) => ({ ...l })), members: [], masonry,
        openings: sf.openings.filter((o) => o.y0 + o.h > i * storeyH + 0.2 && o.y0 < (i + 1) * storeyH - 0.2).map((o) => {
          const lo = Math.max(o.y0, i * storeyH) - i * storeyH, hi = Math.min(o.y0 + o.h, (i + 1) * storeyH) - i * storeyH;
          return { kind: o.kind, u: o.u, w: o.w, y0: lo, h: Math.max(0.3, hi - lo), reveal: Math.min(0.3, layers.reduce((a, l) => a + l.thicknessM, 0)) };
        }),
      };
    });
    const concrete = faces[0].layers.some((l) => l.material === 'concrete');
    storeys.push({
      index: i, y0, y1, jetty: [0, 0, 0, 0], framed: false, faces,
      floor: i === 0 || open ? null : concrete
        ? { thicknessM: 0.25, joistPitchM: 0, structure: { material: 'concrete', bucket: faces[0].bucket, tint: faces[0].layers[0].tint, thicknessM: 0.25, share: 1 } }
        : { thicknessM: 0.22, joistPitchM: 0.62, structure: { material: 'timber', bucket: has('structureWood') ? 'structureWood' : 'wood', tint: JOIST, thicknessM: 0.22, share: 1 } },
    });
  }
  let roof: DamageRoof | null = null;
  if (r.roof) {
    const cover = shellCovering(style, r.roof.bucket, r.roof.tint, r.roof.kind === 'flat');
    const timberBucket = has('structureWood') ? 'structureWood' : 'wood';
    roof = {
      kind: r.roof.kind === 'hip' ? 'hip' : r.roof.kind === 'shed' ? 'shed' : r.roof.kind === 'flat' ? 'flat' : 'gable',
      section: count * 4, pitchDeg: r.roof.pitchDeg, eaveY: r.roof.eaveY, ridgeY: r.roof.ridgeY, thicknessM: r.roof.thicknessM,
      covering: cover,
      structure: r.roof.kind === 'flat' && cover.material !== 'metal'
        ? { material: 'concrete', bucket: storeys[0].faces[0].bucket, tint: storeys[0].faces[0].layers[0].tint, thicknessM: 0.22, share: 1 }
        : cover.material === 'metal'
          ? { material: 'metal', bucket: has('structureMetal') ? 'structureMetal' : cover.bucket, tint: [0.42, 0.42, 0.44], thicknessM: 0.12, share: 1 }
          : { material: 'timber', bucket: timberBucket, tint: RAFTER, thicknessM: 0.14, share: 1 },
      battenPitchM: cover.material === 'thatch' ? 0.35 : 0.3, rafterPitchM: cover.material === 'metal' ? 1.2 : 0.8,
      slabs: r.roof.slabs.map((corners) => ({ corners, bucket: cover.bucket })),
    };
  }
  const chimneys: DamageChimney[] = r.chimneys.map((c) => ({ ...c }));
  const plinth = r.plinth ? { h: r.plinth.h, out: r.plinth.out,
    slot: { ...shellLayers(style, r.plinth.bucket, r.plinth.tint, coreBucket || r.plinth.bucket).at(-1)!, thicknessM: 0.5, share: 1 } } : null;
  // the pile, as a house's: the walls' layers by volume, the roof's covering and its frame, the floors
  const pile = new Map<string, FractureSlot>();
  const add = (slot: FractureSlot, volume: number) => {
    const key = `${slot.material}|${slot.bucket}`;
    const had = pile.get(key);
    if (had) had.share += volume; else pile.set(key, { ...slot, share: volume });
  };
  for (const st of storeys) for (const f of st.faces) {
    const area = Math.max(0, f.width * f.height - f.openings.reduce((a, o) => a + o.w * o.h, 0));
    for (const l of f.layers) add(l, area * l.thicknessM);
    if (st.floor) add(st.floor.structure, f.width * 0.05);
  }
  if (roof) {
    const roofArea = roof.slabs.reduce((a, s) => a + quadArea(s.corners), 0);
    add(roof.covering, roofArea * Math.max(0.04, roof.covering.thicknessM));
    add(roof.structure, roofArea * 0.03);
  }
  for (const c of chimneys) add({ material: 'brick', bucket: c.bucket, tint: WHITE, thicknessM: 0.24, share: 0 }, c.sx * c.sz * (c.y1 - c.y0) * 0.6);
  const total = [...pile.values()].reduce((a, s) => a + s.share, 0) || 1;
  const rubble = [...pile.values()].map((s) => ({ ...s, share: s.share / total })).sort((a, b) => b.share - a.share);
  const ground = storeys[0].faces[0].layers.at(-1)!.material;
  const masonryGround = ground === 'stone' || ground === 'brick' || ground === 'concrete';
  return {
    structureIdx: input.structureIdx, kit: style.id, seed: input.seed, massClass: input.massClass, placement: input.placement,
    w: W, d: D, h: Math.max(roof?.ridgeY ?? r.eave, ...chimneys.map((c) => c.y1)),
    plinth, storeys, roof, chimneys,
    interior: { color: ROOM, open },
    rubble,
    remnant: { stubHeightM: masonryGround ? 1.1 : 0.8, corners: masonryGround, chimneys: true },
    kitPlan: { damage: { kind: 'house-damage', surfaces } satisfies HouseDamageExtras },
  };
}

/** Builders a cluster reading takes (a compound's cells): the courtyard compounds, caravanserais and souks. */
const CLUSTERS = /compound|caravanserai|souk|kasbah|ksar|medina|cluster/i;

/**
 * The anatomy of a compound of cells (cluster.ts), read off its merged parts (shell.ts readCells): the sim's box round
 * every cell, its bands by the tallest cell, its faces on that box in the cells' own layers (render over the kit's earth
 * core), and the cells themselves for the builders to find the one a blow reaches.
 */
function describeCluster(style: ArchitectureStyle, input: StructureDescribeInput): StructureDamageAnatomy | null {
  if (!CLUSTERS.test(input.builder)) return null;
  const cells = readCells(input.parts);
  if (!cells) return null;
  const x0 = Math.min(...cells.map((c) => c.x0)), x1 = Math.max(...cells.map((c) => c.x1));
  const z0 = Math.min(...cells.map((c) => c.z0)), z1 = Math.max(...cells.map((c) => c.z1));
  const base = Math.min(...cells.map((c) => c.y0)), top = Math.max(...cells.map((c) => c.y1));
  // the main bucket: the one most cells are in
  const tally = new Map<string, number>();
  for (const c of cells) tally.set(c.bucket, (tally.get(c.bucket) ?? 0) + (c.x1 - c.x0) * (c.z1 - c.z0));
  let bucket = cells[0].bucket, most = 0;
  for (const [b, a] of tally) if (a > most) { most = a; bucket = b; }
  const tint = cells.find((c) => c.bucket === bucket)?.tint ?? [1, 1, 1];
  const has = (b: string): boolean => !!input.parts[b]?.length;
  const coreBucket = has('regionalStone') ? 'regionalStone' : has('stone') ? 'stone' : '';
  const layers = shellLayers(style, bucket, tint, coreBucket || bucket, null);
  const count = Math.max(1, Math.min(6, Math.round((top - base) / 3.2)));
  const step = (top - base) / count;
  const SIDE: ReadonlyArray<{ name: SeamFace; u: Vec3; out: Vec3 }> = [
    { name: 'front', u: [1, 0, 0], out: [0, 0, 1] }, { name: 'right', u: [0, 0, -1], out: [1, 0, 0] },
    { name: 'back', u: [-1, 0, 0], out: [0, 0, -1] }, { name: 'left', u: [0, 0, 1], out: [-1, 0, 0] },
  ];
  const storeys: DamageStorey[] = Array.from({ length: count }, (_, i) => {
    const y0 = base + i * step;
    const faces: DamageFace[] = SIDE.map((side, f) => ({
      name: side.name, section: i * 4 + f, u: side.u, out: side.out,
      origin: side.name === 'front' ? [(x0 + x1) / 2, y0, z1] : side.name === 'right' ? [x1, y0, (z0 + z1) / 2]
        : side.name === 'back' ? [(x0 + x1) / 2, y0, z0] : [x0, y0, (z0 + z1) / 2],
      width: Math.abs(side.out[2]) > 0.5 ? x1 - x0 : z1 - z0, height: step,
      bucket, layers: layers.map((l) => ({ ...l })), openings: [], members: [], masonry: null,
    }));
    return { index: i, y0, y1: y0 + step, jetty: [0, 0, 0, 0], framed: false, faces, floor: null };
  });
  // the pile: the cells' walls by their area (render and earth core), the roofs' beams
  const pile = new Map<string, FractureSlot>();
  const add = (slot: FractureSlot, volume: number) => {
    const key = `${slot.material}|${slot.bucket}`;
    const had = pile.get(key);
    if (had) had.share += volume; else pile.set(key, { ...slot, share: volume });
  };
  for (const c of cells) {
    const area = 2 * ((c.x1 - c.x0) + (c.z1 - c.z0)) * (c.y1 - c.y0);
    for (const l of shellLayers(style, c.bucket, c.tint, coreBucket || c.bucket, null)) add(l, area * l.thicknessM);
  }
  if (has('structureWood')) add({ material: 'timber', bucket: 'structureWood', tint: JOIST, thicknessM: 0.2, share: 0 }, cells.length * 0.4);
  const total = [...pile.values()].reduce((a, sl) => a + sl.share, 0) || 1;
  const rubble = [...pile.values()].map((sl) => ({ ...sl, share: sl.share / total })).sort((a, b) => b.share - a.share);
  return {
    structureIdx: input.structureIdx, kit: style.id, seed: input.seed, massClass: input.massClass, placement: input.placement,
    w: x1 - x0, d: z1 - z0, h: top, plinth: null, storeys, roof: null, chimneys: [],
    interior: { color: ROOM, open: false }, rubble,
    remnant: { stubHeightM: 0.9, corners: true, chimneys: false },
    kitPlan: { damage: { kind: 'house-damage', surfaces: new Map(), cells: cells.map(({ tint: _t, ...c }) => c) } },
  };
}

/** Builders a container reading takes (a row of shipping containers, a yard's stack). */
const CONTAINERS = /container/i;

/**
 * The anatomy of a row of shipping containers (container.ts), read off its parts: the sim's box round every box, its
 * bands by the stack's height (one or two containers high), its faces on that box in the containers' steel sheet (the
 * mean livery), and the boxes themselves for the builders to find the one a blow reaches.
 */
function describeContainers(style: ArchitectureStyle, input: StructureDescribeInput): StructureDamageAnatomy | null {
  if (!CONTAINERS.test(input.builder)) return null;
  const boxes = readContainers(input.parts);
  if (!boxes) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, base = Infinity, top = -Infinity;
  for (const b of boxes) {
    const w: Vec3 = [-b.a[2], 0, b.a[0]];
    for (const i of [-1, 1]) for (const j of [-1, 1]) {
      const x = b.c[0] + b.a[0] * i * b.hl + w[0] * j * b.hw, z = b.c[2] + b.a[2] * i * b.hl + w[2] * j * b.hw;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    base = Math.min(base, b.c[1] - b.hh); top = Math.max(top, b.c[1] + b.hh);
  }
  const mean = (k: number): number => boxes.reduce((a, b) => a + b.tint[k], 0) / boxes.length;
  const tint: Rgb = [mean(0), mean(1), mean(2)];
  const sheet: FractureSlot = { material: 'metal', bucket: 'structureMetal', tint, thicknessM: 0.03, share: 1 };
  const count = Math.max(1, Math.min(3, Math.round((top - base) / 2.6)));
  const step = (top - base) / count;
  const SIDE: ReadonlyArray<{ name: SeamFace; u: Vec3; out: Vec3 }> = [
    { name: 'front', u: [1, 0, 0], out: [0, 0, 1] }, { name: 'right', u: [0, 0, -1], out: [1, 0, 0] },
    { name: 'back', u: [-1, 0, 0], out: [0, 0, -1] }, { name: 'left', u: [0, 0, 1], out: [-1, 0, 0] },
  ];
  const storeys: DamageStorey[] = Array.from({ length: count }, (_, i) => {
    const y0 = base + i * step;
    const faces: DamageFace[] = SIDE.map((side, f) => ({
      name: side.name, section: i * 4 + f, u: side.u, out: side.out,
      origin: side.name === 'front' ? [(x0 + x1) / 2, y0, z1] : side.name === 'right' ? [x1, y0, (z0 + z1) / 2]
        : side.name === 'back' ? [(x0 + x1) / 2, y0, z0] : [x0, y0, (z0 + z1) / 2],
      width: Math.abs(side.out[2]) > 0.5 ? x1 - x0 : z1 - z0, height: step,
      bucket: 'structureMetal', layers: [{ ...sheet }], openings: [], members: [], masonry: null,
    }));
    return { index: i, y0, y1: y0 + step, jetty: [0, 0, 0, 0], framed: false, faces, floor: null };
  });
  return {
    structureIdx: input.structureIdx, kit: style.id, seed: input.seed, massClass: input.massClass, placement: input.placement,
    w: x1 - x0, d: z1 - z0, h: top, plinth: null, storeys, roof: null, chimneys: [],
    interior: { color: ROOM, open: false },
    rubble: [{ ...sheet, share: 0.85 }, { material: 'metal', bucket: 'structureMetal', tint: [0.26, 0.26, 0.27], thicknessM: 0.1, share: 0.15 }],
    remnant: { stubHeightM: 0, corners: false, chimneys: false },
    kitPlan: { damage: { kind: 'house-damage', surfaces: new Map(), containers: boxes } },
  };
}

/** Builders a ruin reading takes (what is left of a house: its walls to ragged tops). */
const RUINS = /ruin/i;

/**
 * The anatomy of a ruin (ruin.ts), read off its parts (shell.ts readWallPieces): the sim's box round the wall pieces left,
 * its bands by the tallest piece, its faces on that box in the pieces' masonry (shellLayers at their mean thickness), the
 * pile of that masonry by the pieces' wall area with its charred timbers, and the pieces for the builders to find the one
 * a blow reaches.
 */
function describeRuin(style: ArchitectureStyle, input: StructureDescribeInput): StructureDamageAnatomy | null {
  if (!RUINS.test(input.builder)) return null;
  const pieces = readWallPieces(input.parts);
  if (!pieces) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, base = Infinity, top = -Infinity;
  for (const p of pieces) {
    for (const i of [-1, 1]) for (const j of [-1, 1]) {
      const x = p.c[0] + p.along[0] * i * p.hl + p.out[0] * j * p.ht, z = p.c[2] + p.along[2] * i * p.hl + p.out[2] * j * p.ht;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    base = Math.min(base, p.c[1]); top = Math.max(top, p.c[1] + Math.max(...p.top));
  }
  const tally = new Map<string, number>();
  for (const p of pieces) tally.set(p.bucket, (tally.get(p.bucket) ?? 0) + p.hl);
  let bucket = pieces[0].bucket, most = 0;
  for (const [b, a] of tally) if (a > most) { most = a; bucket = b; }
  const tint = pieces.find((p) => p.bucket === bucket)?.tint ?? [1, 1, 1];
  const has = (b: string): boolean => !!input.parts[b]?.length;
  const coreBucket = has('regionalStone') ? 'regionalStone' : has('stone') ? 'stone' : bucket;
  const depth = (2 * pieces.reduce((a, p) => a + p.ht, 0)) / pieces.length;
  const layers = shellLayers(style, bucket, tint, coreBucket, depth);
  const count = Math.max(1, Math.min(6, Math.round((top - base) / 3.2)));
  const step = (top - base) / count;
  const SIDE: ReadonlyArray<{ name: SeamFace; u: Vec3; out: Vec3 }> = [
    { name: 'front', u: [1, 0, 0], out: [0, 0, 1] }, { name: 'right', u: [0, 0, -1], out: [1, 0, 0] },
    { name: 'back', u: [-1, 0, 0], out: [0, 0, -1] }, { name: 'left', u: [0, 0, 1], out: [-1, 0, 0] },
  ];
  const storeys: DamageStorey[] = Array.from({ length: count }, (_, i) => {
    const y0 = base + i * step;
    const faces: DamageFace[] = SIDE.map((side, f) => ({
      name: side.name, section: i * 4 + f, u: side.u, out: side.out,
      origin: side.name === 'front' ? [(x0 + x1) / 2, y0, z1] : side.name === 'right' ? [x1, y0, (z0 + z1) / 2]
        : side.name === 'back' ? [(x0 + x1) / 2, y0, z0] : [x0, y0, (z0 + z1) / 2],
      width: Math.abs(side.out[2]) > 0.5 ? x1 - x0 : z1 - z0, height: step,
      bucket, layers: layers.map((l) => ({ ...l })), openings: [], members: [], masonry: null,
    }));
    return { index: i, y0, y1: y0 + step, jetty: [0, 0, 0, 0], framed: false, faces, floor: null };
  });
  // the pile: the pieces' masonry by their wall area, its burnt timbers a share beside it where the ruin keeps any
  const masonry = ruinRubble(pieces, layers[0].material);
  const timber = has('structureWood') || has('wood');
  const rubble = timber
    ? [...masonry.map((sl) => ({ ...sl, share: sl.share * 0.92 })), { material: 'timber' as const, bucket: 'structureWood', tint: [0.11, 0.09, 0.08] as Rgb, thicknessM: 0.2, share: 0.08 }]
    : masonry;
  return {
    structureIdx: input.structureIdx, kit: style.id, seed: input.seed, massClass: input.massClass, placement: input.placement,
    w: x1 - x0, d: z1 - z0, h: top, plinth: null, storeys, roof: null, chimneys: [],
    interior: { color: ROOM, open: true }, rubble,
    remnant: { stubHeightM: 0.7, corners: false, chimneys: false },
    kitPlan: { damage: { kind: 'house-damage', surfaces: new Map(), ruin: pieces.map(({ tint: _t, ...p }) => p) } },
  };
}

/** Builders a shaft reading leaves to others (open frames and stalls, ruins, the city's own towers with their skyline
 *  damage, cranes and tents). */
const NOT_SHAFTS = /gantry|market|ramada|container|ruin|crane|tent|arcology|needle|megatower|terrace|broadcast/i;

/**
 * The anatomy of a tall narrow body (a stack, a water tower, a minaret, a tower), read off its parts (shell.ts
 * readShaft): the sim's bands up its walls, each band's faces on the section the walls stand on there (a tapering stack
 * narrows band by band), in their own layers, texture and colour; no roof, no floors (a breach looks into its dark
 * flue or stair); its crown (a tank, a lantern) for its fall. Its stages are a house's but the collapse: it topples
 * (shaft.ts).
 */
function describeShaft(style: ArchitectureStyle, input: StructureDescribeInput): StructureDamageAnatomy | null {
  if (NOT_SHAFTS.test(input.builder)) return null;
  const r = readShaft(input.parts);
  if (!r) return null;
  const has = (b: string): boolean => !!input.parts[b]?.length;
  const coreBucket = has('regionalStone') ? 'regionalStone' : has('stone') ? 'stone' : '';
  const surfaces = new Map<number, FaceSurface>();
  const damp = style.weather?.damp ?? 0.8, relief = style.surfaces.relief?.plasterUv ?? 1;
  const SIDE: ReadonlyArray<{ name: SeamFace; u: Vec3; out: Vec3 }> = [
    { name: 'front', u: [1, 0, 0], out: [0, 0, 1] }, { name: 'right', u: [0, 0, -1], out: [1, 0, 0] },
    { name: 'back', u: [-1, 0, 0], out: [0, 0, -1] }, { name: 'left', u: [0, 0, 1], out: [-1, 0, 0] },
  ];
  const storeys: DamageStorey[] = r.bands.map((b, i) => {
    const height = b.y1 - b.y0;
    const faces: DamageFace[] = SIDE.map((side, f) => {
      const origin: Vec3 = side.name === 'front' ? [(b.x0 + b.x1) / 2, b.y0, b.z1] : side.name === 'right' ? [b.x1, b.y0, (b.z0 + b.z1) / 2]
        : side.name === 'back' ? [(b.x0 + b.x1) / 2, b.y0, b.z0] : [b.x0, b.y0, (b.z0 + b.z1) / 2];
      const width = Math.abs(side.out[2]) > 0.5 ? b.x1 - b.x0 : b.z1 - b.z0;
      const layers = shellLayers(style, b.bucket, b.tint, coreBucket || b.bucket, null);
      const fit = b.uv[f], axis = Math.abs(side.out[2]) > 0.5 ? 0 : 2, dStone = BUCKET_UV_DENSITY.stone;
      const regional = b.bucket.startsWith('regional');
      surfaces.set(i * 4 + f, {
        colour: (() => {
          const profile = wallProfile(input.parts, b.bucket, origin, side.u, side.out, width, height);
          return profile ? (bucket: string, y: number, out: [number, number, number]) => profile.at(bucket, y, out) : undefined;
        })(),
        uv(bucket, u, y, out) {
          if (fit && bucket === fit.bucket) { out[0] = fit.au * u + fit.bu; out[1] = fit.av * (b.y0 + y) + fit.bv; return; }
          const plaster = bucket.startsWith('regionalPlaster') || bucket.startsWith('plaster');
          const dn = plaster ? BUCKET_UV_DENSITY.plaster : bucket === 'regionalStone' || bucket === 'stone' ? BUCKET_UV_DENSITY.stone : BUCKET_UV_DENSITY.wood;
          const k = plaster ? relief : 1;
          out[0] = (origin[axis] + side.u[axis] * u) * dn * k;
          out[1] = (b.y0 + y) * dn * k;
        },
        weather: (bucket, y) => (regional && bucket.startsWith('regional') && bucket !== 'regionalRoof' ? wallWeather(b.y0 + y, damp) : 1),
      });
      const masonry = b.bucket === 'regionalStone' && fit && Math.abs(fit.au - side.u[axis] * dStone) < 0.01 && Math.abs(fit.av - dStone) < 0.01
        ? masonryOn(style, { origin: [origin[0], 0, origin[2]], u: side.u, out: side.out, width }, b.y0, height, [fit.bu - origin[axis] * dStone, fit.bv])
        : unitMasonry(layers[0].material, height, width, b.y0, (uu, yy, o) => {
          if (fit) { o[0] = fit.au * uu + fit.bu; o[1] = fit.av * yy + fit.bv; return; }
          o[0] = (origin[axis] + side.u[axis] * uu) * dStone; o[1] = yy * dStone;
        });
      return { name: side.name, section: i * 4 + f, origin, u: side.u, out: side.out, width, height, bucket: layers[0].bucket,
        layers: layers.map((l) => ({ ...l })), openings: [], members: [], masonry };
    });
    return { index: i, y0: b.y0, y1: b.y1, jetty: [0, 0, 0, 0], framed: false, faces, floor: null };
  });
  const pile = new Map<string, FractureSlot>();
  const add = (slot: FractureSlot, volume: number) => {
    const key = `${slot.material}|${slot.bucket}`;
    const had = pile.get(key);
    if (had) had.share += volume; else pile.set(key, { ...slot, share: volume });
  };
  for (const st of storeys) for (const f of st.faces) for (const l of f.layers) add(l, f.width * f.height * l.thicknessM);
  if (r.crown) add({ material: 'metal', bucket: r.crown.bucket, tint: r.crown.tint, thicknessM: 0.02, share: 0 },
    (r.crown.x1 - r.crown.x0) * (r.crown.z1 - r.crown.z0) * 0.05);
  const total = [...pile.values()].reduce((a, sl) => a + sl.share, 0) || 1;
  const rubble = [...pile.values()].map((sl) => ({ ...sl, share: sl.share / total })).sort((a, b) => b.share - a.share);
  const b0 = r.bands[0];
  return {
    structureIdx: input.structureIdx, kit: style.id, seed: input.seed, massClass: input.massClass, placement: input.placement,
    w: b0.x1 - b0.x0, d: b0.z1 - b0.z0, h: r.top, plinth: null, storeys, roof: null, chimneys: [],
    interior: { color: ROOM, open: true }, rubble,
    remnant: { stubHeightM: 1.2, corners: true, chimneys: false },
    kitPlan: { damage: { kind: 'house-damage', surfaces, shaft: { crown: r.crown } } },
  };
}

/**
 * A face's intact wall colour up its height (the weathering pass's tint, damp, rain shadow and foot grime, which vary
 * up a wall far more than along it): sampled from the built parts at nine heights, a few places along the face, so a
 * breach's redrawn skin meets the wall round it without a seam of colour. Numbers only (DESTRUCTION.md §16.6).
 */
interface WallProfile { at(bucket: string, y: number, out: [number, number, number]): boolean }
function wallProfile(parts: StructureDescribeInput['parts'], bucket: string, origin: Vec3, u: Vec3, out: Vec3, width: number, height: number): WallProfile | null {
  const list = parts[bucket];
  if (!list?.length) return null;
  // the wall's own triangles: facing out of this face and lying on its plane
  const tris: number[] = [];
  for (const g of list) {
    const P = g.getAttribute('position'), N = g.getAttribute('normal'), C = g.getAttribute('color');
    if (!P || !N || !C) continue;
    for (let i = 0; i + 2 < P.count; i += 3) {
      if (N.getX(i) * out[0] + N.getY(i) * out[1] + N.getZ(i) * out[2] < 0.97) continue;
      const dx = P.getX(i) - origin[0], dz = P.getZ(i) - origin[2];
      if (Math.abs(dx * out[0] + dz * out[2]) > 0.02) continue;
      for (let k = 0; k < 3; k++) {
        const j = i + k, px = P.getX(j) - origin[0], pz = P.getZ(j) - origin[2];
        tris.push(px * u[0] + pz * u[2], P.getY(j) - origin[1], C.getX(j), C.getY(j), C.getZ(j));
      }
    }
  }
  if (!tris.length) return null;
  const rows = 9, samples = new Float32Array(rows * 3).fill(NaN);
  for (let r = 0; r < rows; r++) {
    const y = Math.min(height - 0.02, Math.max(0.02, height * r / (rows - 1)));
    for (const fu of [0, -0.25, 0.25, -0.42, 0.42]) {
      const pu = width * fu;
      let found = false;
      for (let t = 0; t + 14 < tris.length && !found; t += 15) {
        const ax = tris[t], ay = tris[t + 1], bx = tris[t + 5], by = tris[t + 6], cx = tris[t + 10], cy = tris[t + 11];
        const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(det) < 1e-9) continue;
        const l1 = ((by - cy) * (pu - cx) + (cx - bx) * (y - cy)) / det, l2 = ((cy - ay) * (pu - cx) + (ax - cx) * (y - cy)) / det, l3 = 1 - l1 - l2;
        if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
        for (let c = 0; c < 3; c++) samples[r * 3 + c] = l1 * tris[t + 2 + c] + l2 * tris[t + 7 + c] + l3 * tris[t + 12 + c];
        found = true;
      }
      if (found) break;
    }
  }
  // fill rows no sample landed on from their neighbours
  for (let pass = 0; pass < rows; pass++) for (let r = 0; r < rows; r++) {
    if (!Number.isNaN(samples[r * 3])) continue;
    const from = !Number.isNaN(samples[(r - 1) * 3]) && r > 0 ? r - 1 : r + 1 < rows && !Number.isNaN(samples[(r + 1) * 3]) ? r + 1 : -1;
    if (from >= 0) for (let c = 0; c < 3; c++) samples[r * 3 + c] = samples[from * 3 + c];
  }
  if (Number.isNaN(samples[0])) return null;
  return {
    at(b, y, o) {
      if (b !== bucket) return false;
      const f = Math.min(rows - 1, Math.max(0, y / height * (rows - 1))), r0 = Math.floor(f), r1 = Math.min(rows - 1, r0 + 1), t = f - r0;
      for (let c = 0; c < 3; c++) o[c] = samples[r0 * 3 + c] * (1 - t) + samples[r1 * 3 + c] * t;
      return true;
    },
  };
}

function mul3(a: Rgb, b: Rgb): Rgb {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}

function quadArea(c: readonly [Vec3, Vec3, Vec3, Vec3]): number {
  const tri = (a: Vec3, b: Vec3, d: Vec3) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  };
  return tri(c[0], c[1], c[2]) + tri(c[0], c[2], c[3]);
}

// ---------------------------------------------------------------------------------------------------- the kits

/**
 * Register the house kits' damage under every regional style id (destructionKit structureDamageKitChain resolves a
 * structure through its map's style): `describe` from the plan; the stage builders follow (breach, damaged, collapse).
 */
export function registerHouseDamageKits(styles: readonly ArchitectureStyle[]): void {
  for (const style of styles) {
    const kit: StructureDamageKit = {
      id: style.id,
      // a house from its plan; a body without one read off its parts (a hall, a works, the base set's buildings)
      describe: (input) => describeHouse(style, input) ?? describeShell(style, input) ?? describeShaft(style, input) ?? describeCluster(style, input)
        ?? describeContainers(style, input) ?? describeRuin(style, input),
      // a sheet-clad face tears and its frame shows (sheet.ts); every other wall breaks as a house's
      breach: (anatomy, hole, out) => (ruinPiecesOf(anatomy) ? breachRuin(anatomy, hole, out) : containersOf(anatomy) ? breachContainers(anatomy, hole, out) : cellsOf(anatomy) ? breachCluster(anatomy, hole, out) : isSheetFace(anatomy.storeys[hole.storey]?.faces.find((f) => f.section === hole.section))
        ? breachSheet(anatomy, hole, out) : breachHouse(anatomy, hole, out)),
      damaged: (anatomy, seed, out) => (ruinPiecesOf(anatomy) ? damagedRuin(anatomy, seed, out) : containersOf(anatomy) ? damagedContainers(anatomy, seed, out) : cellsOf(anatomy) ? damagedCluster(anatomy, seed, out)
        : isSheetBody(anatomy) ? damagedSheet(anatomy, seed, out)
        : damagedHouse(anatomy, seed, out)),
      piece: (_bucket, shape, variant, rng) => debrisPiece(shape, variant, rng),
      // the pile on the sim's own heap (the world fills `anatomy.mound` from the structure table); a dome over the house
      // where none is given (an offline preview, a receipt)
      collapse: (anatomy, seed, out) => {
        const mound = anatomy.mound ? (x: number, z: number) => bodyMoundHeightAt(anatomy, x, z) : domeMound(anatomy);
        return ruinPiecesOf(anatomy) ? collapseRuin(anatomy, seed, out, mound) : containersOf(anatomy) ? collapseContainers(anatomy, seed, out, mound) : cellsOf(anatomy) ? collapseCluster(anatomy, seed, out, mound)
          : shaftOf(anatomy) ? collapseShaft(anatomy, seed, out, mound)
          : isSheetBody(anatomy) ? collapseSheet(anatomy, seed, out, mound)
          : collapseHouse(anatomy, seed, out, mound);
      },
      sectionDown: (anatomy, section, seed, out) => {
        if (ruinPiecesOf(anatomy)) return sectionDownRuin(anatomy, section, seed, out);
        if (containersOf(anatomy)) return sectionDownContainers(anatomy, section, seed, out);
        if (cellsOf(anatomy)) return sectionDownCluster(anatomy, section, seed, out);
        if (anatomy.roof && section === anatomy.roof.section) {
          return anatomy.roof.covering.material === 'metal' && isSheetBody(anatomy) ? roofDownSheet(anatomy, seed, out) : sectionDownHouse(anatomy, section, seed, out);
        }
        const face = anatomy.storeys[Math.floor(section / 4)]?.faces.find((f) => f.section === section);
        return isSheetFace(face) ? sectionDownSheet(anatomy, section, seed, out) : sectionDownHouse(anatomy, section, seed, out);
      },
      // (a compound's cells have no floor the sim's band could drop onto: its section falls carry it)
      // (a container stack has no floor either: an upper box falls with the collapse)
      storeyDown: (anatomy, storey, seed, out) => (cellsOf(anatomy) || containersOf(anatomy) || ruinPiecesOf(anatomy) ? { cuts: [], hides: [] }
        : storeyDownHouse(anatomy, storey, seed, out)),
    };
    registerStructureDamageKit(kit);
  }
}

