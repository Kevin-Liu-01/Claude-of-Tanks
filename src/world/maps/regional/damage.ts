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
  registerStructureDamageKit,
  type DamageChimney, type DamageFace, type DamageOpening, type DamageRoof, type DamageStorey, type FaceName as SeamFace,
  type FractureMaterial, type FractureSlot, type FrameMember, type MasonryLayout, type RoofKind as SeamRoofKind, type RoofSlab,
  type StructureDamageAnatomy, type StructureDamageKit, type StructureDescribeInput, type Vec3,
} from '../../destructionKit.ts';
import { BUCKET_UV_DENSITY, facePoint, type Face, type RegionalBucket, type Rgb } from './geometry.ts';
import { storeyFaces, type HousePlan } from './house.ts';
import type { RegionalKitPlan } from './index.ts';
import type { ArchitectureStyle } from './types.ts';
import { WEATHER_ROUTE, wallWeather, type WeatherTints } from './weather.ts';
import { breachHouse, damagedHouse, type FaceSurface, type HouseDamageExtras } from './fracture.ts';

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
      // the hip (or half-hip) ends: their eave corners and the ridge's end (a triangle as a quad with its apex twice)
      for (const end of [1, -1]) {
        const apex = at(0, ridge, end * rh);
        slabs.push({ corners: [at(-end * (rg.s + e), lo, end * D), at(end * (rg.s + e), lo, end * D), apex, apex], bucket: roofCover.bucket });
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
      describe: (input) => describeHouse(style, input),
      breach: (anatomy, hole, out) => breachHouse(anatomy, hole, out),
      damaged: (anatomy, seed, out) => damagedHouse(anatomy, seed, out),
    };
    registerStructureDamageKit(kit);
  }
}

