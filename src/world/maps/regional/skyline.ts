// src/world/maps/regional/skyline.ts — the tall-building and big-building kit (facades & skyline lane, 2026-10-05; the
// owner: "skyscrapers/big buildings ... you are capable of making a lot more beautiful buildings then we have").
//
// A grammar any regional kit can put in its `builders` map, each builder a RegionalBuilder fitted to the plan plot it
// replaces (its footprint, its door side to +z):
//   - decoTower: the inter-war tower of Shanghai's Bund (Sassoon House, Broadway Mansions, the Park Hotel): a granite
//     podium of tall openings, a shaft of continuous piers over recessed spandrels, setbacks, a copper pyramid, a
//     stepped crown or a needle;
//   - curtainTower: the post-war glass tower (Sarajevo's UNIS towers, an office tower): a lobby under a canopy, a curtain
//     wall of glass bands over dark spandrels on a mullion grid, a plant storey and its masts;
//   - modernSlab: the slab block (the Holiday Inn's cube, the parliament's slab, an estate block): ribbon windows between
//     concrete bands, blank stair-core ends, loggias on a residential slab;
//   - stalinistTower: the wedding cake (the Seven Sisters, Warsaw's Palace of Culture): a base block, wings, tiers stepping
//     back under cornices and corner pinnacles, an octagonal drum, a spire and its star;
//   - industrialHall: a brick hall under sawtooth north lights, piers and arched windows; gasHolder: a column-guided
//     gasholder, its bell in a lattice frame;
//   - stationHall: a terminus, its stone head building with the great lunette and clock tower before a glass train shed;
//   - cathedral: nave, aisles, transept and apse under steep roofs, buttresses, lancets, a rose window and two west
//     towers with spires.
//
// Every builder has its damage states (`damage`: 0 intact, 1 shelled — shell holes and pocks, burnt windows; 2 burnt
// floors — whole storeys gutted, soot up the face, a bay of facade blown off to the slabs; 3 a collapsed corner — the
// corner bays gone from a floor up, slab ends hanging, rubble at its foot). By default the building's own stream picks.
//
// LOD and cost: a tower is a few structural prisms (its collision: structureCollision.ts derives few shell records) and
// its facade dressing. The coarse dressing is the silhouette and the facade's read at any range — tiers, setbacks,
// crowns, the fronts of piers and spandrels, the glass; the fine dressing (mullions, the sides of piers, ledges, tracery)
// is drawn within the fine-detail distance only and never by a phone (geometry.ts EmitOptions.fine). A shelled or
// gutted floor shows the dark core prism behind its missing glass: no hole is cut through the structure.
import {
  LocalFrame, PartSink, faceBox, facePanel, facePoint, normalize3, rgb, shade,
  type EmitOptions, type Face, type RegionalBucket, type Rgb, type Vec3,
} from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, windowRhythm, type HouseDialect, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, paneBucket, windowUnit, type WindowStyle } from './openings.ts';
import { faceSlab, hash01, pilaster, trimRing, trimRun } from './facade.ts';
import type { RegionalBuildContext, RegionalBuilder } from './types.ts';

const DECOR: EmitOptions = Object.freeze({ decor: true });
const COPPER = rgb(0x5f8f78), BRONZE = rgb(0x4b3a2b), STEEL = rgb(0x3e4448), CHAR = rgb(0x1c1917), GILT = rgb(0xb8933e);
const RED_STAR = rgb(0x9a2a24);

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/** A plan rectangle. */
interface Rect { x0: number; x1: number; z0: number; z1: number }

/** The four faces of a rectangle (front +z, right +x, back -z, left -x), each with its width. */
function rectFaces(r: Rect): Face[] {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
  return [
    { origin: [cx, 0, r.z1], u: [1, 0, 0], out: [0, 0, 1], width: w },
    { origin: [r.x1, 0, cz], u: [0, 0, -1], out: [1, 0, 0], width: d },
    { origin: [cx, 0, r.z0], u: [-1, 0, 0], out: [0, 0, -1], width: w },
    { origin: [r.x0, 0, cz], u: [0, 0, 1], out: [-1, 0, 0], width: d },
  ];
}

const inset = (r: Rect, k: number): Rect => ({ x0: r.x0 + k, x1: r.x1 - k, z0: r.z0 + k, z1: r.z1 - k });

// -------------------------------------------------------------------------------------------------------------------
// Damage
// -------------------------------------------------------------------------------------------------------------------

/** 0 intact, 1 shelled, 2 burnt floors and a blown bay, 3 a collapsed corner. */
type Damage = 0 | 1 | 2 | 3;

/** A building's damage: the option, else drawn from its build stream (identically on every tier: it shapes the collision). */
function damageOf(ctx: RegionalBuildContext, option: Damage | 'auto' | undefined): Damage {
  if (option !== undefined && option !== 'auto') return option;
  const roll = ctx.rng();
  return roll < 0.35 ? 0 : roll < 0.65 ? 1 : roll < 0.87 ? 2 : 3;
}

/** A shell hole in a face: a ragged dark void, the broken masonry round it standing a little proud. */
function shellHole(sink: PartSink, face: Face, u: number, y: number, r: number, o: number, rim: RegionalBucket): void {
  const ring: Vec3[] = [], hole: Vec3[] = [];
  const n = 9;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, j = 0.62 + hash01(u, y, k, 1.7) * 0.5;
    ring.push(facePoint(face, u + Math.cos(a) * r * 1.35 * j, y + Math.sin(a) * r * 1.2 * j, o));
    hole.push(facePoint(face, u + Math.cos(a) * r * j * 0.9, y + Math.sin(a) * r * j * 0.85, o + 0.012));
  }
  // fans from the centre (star-shaped outlines)
  const c = facePoint(face, u, y, o), ch = facePoint(face, u, y, o + 0.012);
  for (let k = 0; k < n; k++) {
    sink.polygon(rim, [c, ring[k], ring[(k + 1) % n]], { ...DECOR, shade: 0.62 });
    sink.polygon('dark', [ch, hole[k], hole[(k + 1) % n]], DECOR);
  }
}

/**
 * Soot climbing a surface over a burnt floor: a strip `w` wide centred on u, dark at its foot and fading upward, `o`
 * out of the face (fine: drawn near the camera only). A weathered bucket darkens by its shade; a painted one (a
 * curtain wall's metal) by its colour.
 */
function soot(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, w: number, y0: number, y1: number, o: number, colour?: Rgb): void {
  const t = (p: Vec3) => Math.min(1, Math.max(0, (p[1] - y0) / Math.max(0.1, y1 - y0)));
  const pts = [facePoint(face, u - w / 2, y0, o), facePoint(face, u + w / 2, y0, o), facePoint(face, u + w * 0.35, y1, o), facePoint(face, u - w * 0.35, y1, o)];
  if (colour) {
    sink.polygon(bucket, pts, { ...DECOR, fine: true, colourAt: (p) => { const k = 0.25 + 0.75 * t(p); return [colour[0] * k, colour[1] * k, colour[2] * k]; } });
  } else sink.polygon(bucket, pts, { ...DECOR, fine: true, shadeAt: (p) => 0.3 + 0.7 * t(p) });
}

// -------------------------------------------------------------------------------------------------------------------
// The tower facade: piers, spandrels and glass on a dark core
// -------------------------------------------------------------------------------------------------------------------

/** How one tier's faces are dressed. */
interface TowerFacade {
  /** the vertical piers between the bays (null: a curtain wall's mullion grid carries the faces) */
  pier: { bucket: RegionalBucket; w: number; out: number; colour?: Rgb; shade?: number } | null;
  /** the spandrel band of each floor (its sill and the slab edge) */
  spandrel: { bucket: RegionalBucket; h: number; out: number; colour?: Rgb; shade?: number };
  /** target bay width (m) */
  bay: number;
  /** share of lit windows at night */
  lit: number;
  /** a glass band per bay (punched) or one band along the floor (ribbon) */
  glazing: 'bays' | 'ribbon';
  /** mullions per bay (fine joinery) and their colour */
  mullions: number;
  mullion: Rgb;
  /**
   * the mullions and transom drawn at any range, not as fine joinery (the map-revival lane, mr1, 2026-10-07: the station's
   * head building, whose big bays read as unmullioned panels past the fine-detail distance). Off for every tower.
   */
  coarseMullions?: boolean;
}

/** What a tier's floors suffered (decided per building, its own stream). */
interface TierDamage {
  /** floors burnt out (their glass gone to the dark, soot up the face) */
  burnt: ReadonlySet<number>;
  /** a blown bay: on face `face`, bays b0..b1 on floors f0..f1, the facade gone to the slabs */
  blown: { face: number; b0: number; b1: number; f0: number; f1: number } | null;
  /** shell holes: face, u (fraction), floor */
  holes: ReadonlyArray<{ face: number; t: number; floor: number; r: number }>;
  /** the collapsed corner: the corner between face `face` and the next (counter-clockwise), from floor `floor` up, `bays` deep */
  corner: { face: number; floor: number; bays: number } | null;
  /** a pane's chance of being gone (shelled windows) */
  gone: number;
}

const NO_DAMAGE: TierDamage = { burnt: new Set(), blown: null, holes: [], corner: null, gone: 0 };

/** Draw a tier's damage from the building's stream. */
function tierDamage(rng: () => number, damage: Damage, floors: number): TierDamage {
  if (damage === 0) return NO_DAMAGE;
  const holes: Array<{ face: number; t: number; floor: number; r: number }> = [];
  const nh = damage === 1 ? 3 + Math.floor(rng() * 4) : 4 + Math.floor(rng() * 5);
  for (let k = 0; k < nh; k++) holes.push({ face: Math.floor(rng() * 4), t: 0.12 + rng() * 0.76, floor: Math.floor(rng() * floors), r: 0.5 + rng() * 0.9 });
  const burnt = new Set<number>();
  if (damage >= 2) {
    const f0 = Math.floor(rng() * Math.max(1, floors - 2)), n = 1 + Math.floor(rng() * 3);
    for (let f = f0; f < Math.min(floors, f0 + n); f++) burnt.add(f);
  }
  const blown = damage >= 2 && floors >= 3 ? (() => {
    const face = Math.floor(rng() * 4), f0 = Math.floor(rng() * (floors - 2)), f1 = Math.min(floors - 1, f0 + 1 + Math.floor(rng() * 3));
    const b0 = Math.floor(rng() * 3), b1 = b0 + 1 + Math.floor(rng() * 2);
    return { face, b0, b1, f0, f1 };
  })() : null;
  const corner = damage === 3 && floors >= 4 ? { face: Math.floor(rng() * 4), floor: Math.floor(floors * (0.3 + rng() * 0.4)), bays: 1 + Math.floor(rng() * 2) } : null;
  return { burnt, blown, holes, corner, gone: damage === 1 ? 0.12 : 0.25 };
}

/**
 * A tier of a tower: its structural prism (the dark core: the building's body and its collision, the void behind every
 * missing pane) from `y0` up `floors` storeys of `fh`, and its faces dressed by `facade`. With a collapsed corner the
 * prism above the corner's floor is the L left standing. Returns the tier's top height.
 */
function towerTier(sink: PartSink, r: Rect, y0: number, floors: number, fh: number, facade: TowerFacade, dmg: TierDamage,
  rng: () => number, opts: { base?: number; faces?: readonly boolean[] } = {}): number {
  const top = y0 + floors * fh, base = opts.base ?? y0;
  const faces = rectFaces(r);
  const bays = faces.map((f) => Math.max(1, Math.round(f.width / facade.bay)));
  // the core: whole below a collapse, an L above it
  const c = dmg.corner;
  if (c && c.floor < floors) {
    const yc = y0 + c.floor * fh;
    sink.span('dark', r.x0, base, r.z0, r.x1, yc, r.z1);
    const cut = cornerCut(r, c.face, faces, bays, c.bays);
    for (const part of cut.keep) sink.span('dark', part.x0, yc, part.z0, part.x1, top, part.z1);
    // the floor slabs broken off along the void's inner edges: ragged ends standing into it, some hanging, and the
    // rubble come down on the floor it broke at
    const v = cut.void.rect, sx = Math.sign(cut.void.dx), sz = Math.sign(cut.void.dz);
    const ex = sx > 0 ? v.x0 : v.x1, ez = sz > 0 ? v.z0 : v.z1;
    for (let f = c.floor + 1; f <= floors; f++) {
      const y = y0 + f * fh;
      for (let k = 0; k < 4; k++) {
        const h1 = hash01(f, k, ex, 2.1), h2 = hash01(f, k, ez, 3.7);
        // along the x edge (into the void along +sx), then along the z edge
        const zA = v.z0 + (v.z1 - v.z0) * (k + 0.15) / 4, zB = v.z0 + (v.z1 - v.z0) * (k + 0.85) / 4, reach = 0.4 + h1 * 2.2;
        if (h2 < 0.35) sink.member('plaster3', [ex, y - 0.1, (zA + zB) / 2], [ex + sx * reach, y - 0.1 - reach * (0.3 + h2), (zA + zB) / 2], zB - zA, 0.24, [0, 1, 0], { ...DECOR, exposed: true }, 0.12);
        else if (f < floors) sink.span('plaster3', Math.min(ex, ex + sx * reach), y - 0.22, zA, Math.max(ex, ex + sx * reach), y, zB, DECOR);
        const xA = v.x0 + (v.x1 - v.x0) * (k + 0.15) / 4, xB = v.x0 + (v.x1 - v.x0) * (k + 0.85) / 4, reach2 = 0.4 + h2 * 2.2;
        if (h1 < 0.3) sink.member('plaster3', [(xA + xB) / 2, y - 0.1, ez], [(xA + xB) / 2, y - 0.1 - reach2 * (0.3 + h1), ez + sz * reach2], xB - xA, 0.24, [0, 1, 0], { ...DECOR, exposed: true }, 0.12);
        else if (f < floors) sink.span('plaster3', xA, y - 0.22, Math.min(ez, ez + sz * reach2), xB, y, Math.max(ez, ez + sz * reach2), DECOR);
      }
    }
    rubble(sink, v, yc, 1.4 + (top - yc) * 0.04, rng);
  } else sink.span('dark', r.x0, base, r.z0, r.x1, top, r.z1);
  faces.forEach((face, fi) => {
    if (opts.faces && !opts.faces[fi]) return;
    dressFace(sink, face, fi, bays[fi], y0, floors, fh, facade, dmg, c ? { floor: c.floor, from: cornerBays(c, fi, bays[fi]) } : null);
  });
  return top;
}

/** The bays of face `fi` a collapsed corner takes (which end and how many), or null. */
function cornerBays(c: { face: number; bays: number }, fi: number, bays: number): { end: 1 | -1; n: number } | null {
  // the corner between face c.face and the next face: the right end (+u) of c.face and the left end (-u) of the next
  if (fi === c.face) return { end: 1, n: Math.min(bays - 1, c.bays) };
  if (fi === (c.face + 1) % 4) return { end: -1, n: Math.min(bays - 1, c.bays) };
  return null;
}

/** The L of a tier left standing round a collapsed corner, and the void's centre and outward diagonal. */
function cornerCut(r: Rect, face: number, faces: Face[], bays: number[], n: number): { keep: Rect[]; void: { cx: number; cz: number; dx: number; dz: number; rect: Rect } } {
  const fa = faces[face], fb = faces[(face + 1) % 4];
  const da = fa.width / bays[face] * Math.min(bays[face] - 1, n), db = fb.width / bays[(face + 1) % 4] * Math.min(bays[(face + 1) % 4] - 1, n);
  // the corner point: the right end of face a (u = +width/2)
  const px = fa.origin[0] + fa.u[0] * fa.width / 2, pz = fa.origin[2] + fa.u[2] * fa.width / 2;
  const sx = Math.sign(px - (r.x0 + r.x1) / 2) || 1, sz = Math.sign(pz - (r.z0 + r.z1) / 2) || 1;
  // the void spans `da` along face a's run back from the corner and `db` along face b's
  const alongA = Math.abs(fa.u[0]) > 0.5 ? da : db, alongB = Math.abs(fa.u[0]) > 0.5 ? db : da;
  const vx0 = sx > 0 ? r.x1 - alongA : r.x0, vx1 = sx > 0 ? r.x1 : r.x0 + alongA;
  const vz0 = sz > 0 ? r.z1 - alongB : r.z0, vz1 = sz > 0 ? r.z1 : r.z0 + alongB;
  const keep: Rect[] = [
    // the full-depth strip beside the void, and the rest
    sx > 0 ? { x0: r.x0, x1: vx0, z0: r.z0, z1: r.z1 } : { x0: vx1, x1: r.x1, z0: r.z0, z1: r.z1 },
    sz > 0 ? { x0: vx0, x1: vx1, z0: r.z0, z1: vz0 } : { x0: vx0, x1: vx1, z0: vz1, z1: r.z1 },
  ].filter((k) => k.x1 - k.x0 > 0.2 && k.z1 - k.z0 > 0.2);
  return { keep, void: { cx: (vx0 + vx1) / 2, cz: (vz0 + vz1) / 2, dx: sx * 0.7071, dz: sz * 0.7071, rect: { x0: vx0, x1: vx1, z0: vz0, z1: vz1 } } };
}

/**
 * The rubble of a collapsed corner heaped on the broken floor it fell to: blocks and slab pieces inside the void's
 * footprint (structural, standing on the floor below: a tank on that roof stops at it), never past the plot.
 */
function rubble(sink: PartSink, r: Rect, y: number, height: number, rng: () => number): void {
  const n = 7, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  for (let k = 0; k < n; k++) {
    const s = 0.4 + rng() * 0.9, h = Math.max(0.3, height * (0.35 + rng() * 0.65));
    const x = cx + (rng() - 0.5) * (r.x1 - r.x0) * 0.7, z = cz + (rng() - 0.5) * (r.z1 - r.z0) * 0.7;
    sink.span(k % 2 ? 'plaster3' : 'stone', Math.max(r.x0, x - s), y, Math.max(r.z0, z - s * 0.7), Math.min(r.x1, x + s), y + h, Math.min(r.z1, z + s * 0.7));
  }
}

/** Dress one face of a tier: piers, per-floor spandrels and glass, damage. */
function dressFace(sink: PartSink, face: Face, fi: number, bays: number, y0: number, floors: number, fh: number, facade: TowerFacade,
  dmg: TierDamage, corner: { floor: number; from: { end: 1 | -1; n: number } | null } | null): void {
  const W = face.width, bw = W / bays, sp = facade.spandrel, pier = facade.pier;
  const glassO = 0.03;
  const cornerGone = (bay: number, floor: number) => !!corner?.from && floor >= corner.floor
    && (corner.from.end > 0 ? bay >= bays - corner.from.n : bay < corner.from.n);
  const blown = (bay: number, floor: number) => !!dmg.blown && dmg.blown.face === fi && bay >= dmg.blown.b0 && bay <= dmg.blown.b1
    && floor >= dmg.blown.f0 && floor <= dmg.blown.f1;
  const spOpts: EmitOptions = { ...DECOR, ...(sp.colour ? { colour: sp.colour } : {}), ...(sp.shade ? { shade: sp.shade } : {}) };
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * fh, burnt = dmg.burnt.has(f);
    // the spandrel: one band per run of standing bays (a collapsed corner or a blown bay breaks it)
    let run0 = -1;
    const flush = (b: number) => {
      if (run0 < 0) return;
      const u0 = -W / 2 + run0 * bw, u1 = -W / 2 + b * bw;
      sink.box(sp.bucket, facePoint(face, (u0 + u1) / 2, y + sp.h / 2, sp.out / 2), [(u1 - u0) / 2, sp.h / 2, sp.out / 2],
        { ...spOpts, ...(burnt ? { colour: CHAR, shade: 0.4 } : {}) }, faceFrame(face), { nz: true }, { pz: true });
      run0 = -1;
    };
    for (let b = 0; b <= bays; b++) {
      const standing = b < bays && !cornerGone(b, f) && !blown(b, f);
      if (standing && run0 < 0) run0 = b;
      if (!standing) flush(b);
    }
    // the glass: per bay (or one ribbon per run), lit, dark or gone
    for (let b = 0; b < bays; b++) {
      if (cornerGone(b, f)) continue;
      const u = -W / 2 + (b + 0.5) * bw, gw = bw - (pier ? pier.w : 0.06), gy0 = y + sp.h, gy1 = y + fh;
      if (blown(b, f)) {
        // the facade blown off: the slab's broken edge, the void behind
        faceBox(sink, 'plaster3', face, u, y + 0.12, 0.08, bw * 0.9, 0.24, 0.16, { ...DECOR, fineSides: true });
        continue;
      }
      const h = hash01(face.origin[0], face.origin[2], b, f);
      if (burnt || h < dmg.gone) continue; // gone to the dark core
      const lit = h > 1 - facade.lit;
      facePanel(sink, lit ? 'curtain' : 'glass', face, u, (gy0 + gy1) / 2, glassO, gw, gy1 - gy0, { ...DECOR, window: face.out });
      // mullions and the transom (fine joinery)
      if (facade.mullions > 0) {
        for (let m = 1; m <= facade.mullions; m++) {
          const mu = u - gw / 2 + gw * m / (facade.mullions + 1);
          facePanel(sink, 'structureMetal', face, mu, (gy0 + gy1) / 2, glassO + 0.02, 0.05, gy1 - gy0, { ...DECOR, colour: facade.mullion, fine: !facade.coarseMullions });
        }
        facePanel(sink, 'structureMetal', face, u, gy1 - (gy1 - gy0) * 0.25, glassO + 0.02, gw, 0.05, { ...DECOR, colour: facade.mullion, fine: !facade.coarseMullions });
      }
    }
    if (burnt) {
      // soot up the piers and the spandrel over the burnt floor (fine: 8 mm on their fronts, drawn near the camera)
      const y1 = Math.min(y + 2.2 * fh, y0 + floors * fh);
      if (pier) for (let k = 0; k <= bays; k++) soot(sink, pier.bucket, face, -W / 2 + k * bw, pier.w * 0.9, y + sp.h, y1, pier.out + 0.008, pier.colour);
      if (f + 1 < floors) soot(sink, sp.bucket, face, 0, W - 0.4, y + fh, y + fh + sp.h, sp.out + 0.008, sp.colour);
    }
  }
  // the piers, full height over the standing bays (a collapsed corner's piers stop at its floor)
  if (pier) {
    const pOpts: EmitOptions = { ...DECOR, fineSides: true, ...(pier.colour ? { colour: pier.colour } : {}), ...(pier.shade ? { shade: pier.shade } : {}) };
    for (let k = 0; k <= bays; k++) {
      const u = -W / 2 + k * bw;
      const corner0 = k === 0 || k === bays;
      const goneAbove = corner?.from && ((corner.from.end > 0 && k >= bays - corner.from.n) || (corner.from.end < 0 && k <= corner.from.n));
      const yTop = goneAbove ? y0 + corner!.floor * fh : y0 + floors * fh;
      if (yTop - y0 < 0.5) continue;
      const pw = corner0 ? pier.w * 1.2 : pier.w;
      faceBox(sink, pier.bucket, face, corner0 ? u - Math.sign(u) * pw / 2 : u, (y0 + yTop) / 2, pier.out / 2, pw, yTop - y0, pier.out, pOpts);
    }
  }
  // shell holes on this face
  for (const hole of dmg.holes) {
    if (hole.face !== fi || hole.floor >= floors) continue;
    const u = -W / 2 + hole.t * W, y = y0 + hole.floor * fh + fh * 0.55;
    if (corner?.from && hole.floor >= corner.floor) continue;
    shellHole(sink, face, u, y, hole.r, (pier?.out ?? sp.out) + 0.01, sp.bucket);
  }
}

/** The local frame of a face (x along u, y up, z out) for PartSink.box. */
function faceFrame(face: Face): LocalFrame {
  return new LocalFrame(face.u, [0, 1, 0], face.out, [0, 0, 0]);
}

// -------------------------------------------------------------------------------------------------------------------
// Crowns and tops
// -------------------------------------------------------------------------------------------------------------------

/** A flat roof's parapet and its plant: a parapet ring, a plant storey, a lift motor room. */
function roofTop(sink: PartSink, r: Rect, y: number, bucket: RegionalBucket, rng: () => number, masts: boolean): void {
  sink.span(bucket, r.x0, y - 0.3, r.z0, r.x1, y + 0.15, r.z1);
  const t = 0.25, h = 1.1;
  sink.span(bucket, r.x0, y, r.z1 - t, r.x1, y + h, r.z1, DECOR);
  sink.span(bucket, r.x0, y, r.z0, r.x1, y + h, r.z0 + t, DECOR);
  sink.span(bucket, r.x0, y, r.z0 + t, r.x0 + t, y + h, r.z1 - t, DECOR);
  sink.span(bucket, r.x1 - t, y, r.z0 + t, r.x1, y + h, r.z1 - t, DECOR);
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const px = (r.x0 + r.x1) / 2 + (rng() - 0.5) * w * 0.2, pz = (r.z0 + r.z1) / 2 + (rng() - 0.5) * d * 0.2;
  const pw = Math.min(w * 0.4, 9), pd = Math.min(d * 0.35, 7);
  sink.span(bucket, px - pw / 2, y, pz - pd / 2, px + pw / 2, y + 3.2, pz + pd / 2);
  if (masts) {
    for (const k of [-1, 1]) {
      const mx = px + k * pw * 0.3;
      sink.cylinder('structureMetal', [mx, y + 3.2, pz], 'y', 6 + rng() * 6, 0.08, 6, { ...DECOR, colour: STEEL });
    }
  }
}

/** A four-sided pyramid roof (a copper crown) over a square, with its lantern finial. */
function pyramidCrown(sink: PartSink, cx: number, cz: number, half: number, y: number, rise: number, colour: Rgb): number {
  const a: Vec3 = [cx - half, y, cz + half], b: Vec3 = [cx + half, y, cz + half], c: Vec3 = [cx + half, y, cz - half], d: Vec3 = [cx - half, y, cz - half];
  const apex: Vec3 = [cx, y + rise, cz];
  for (const [p, q] of [[a, b], [b, c], [c, d], [d, a]] as const) sink.polygon('structureMetal', [p, q, apex], { colour });
  sink.polygon('structureMetal', [d, c, b, a], { colour });
  sink.cylinder('structureMetal', [cx, y + rise - 0.2, cz], 'y', 2.4, 0.12, 6, { ...DECOR, colour: GILT }, 0.03);
  return y + rise;
}

/** A needle spire on a drum: octagonal, tapering to a finial (a star when given its colour). */
function spire(sink: PartSink, cx: number, cz: number, y: number, r: number, height: number, colour: Rgb, star: Rgb | null): number {
  sink.cylinder('structureMetal', [cx, y, cz], 'y', height, r, 8, { colour }, r * 0.04);
  const top = y + height;
  if (star) {
    // the star: two crossed five-point plates
    for (const rot of [0, Math.PI / 2]) {
      const pts: Vec3[] = [];
      for (let k = 0; k < 10; k++) {
        const a = Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 0.45 : 1.1;
        pts.push([cx + Math.cos(rot) * Math.cos(a) * rr, top + 0.95 + Math.sin(a) * rr, cz + Math.sin(rot) * Math.cos(a) * rr]);
      }
      const centre: Vec3 = [cx, top + 0.95, cz];
      for (let k = 0; k < 10; k++) {
        sink.polygon('structureMetal', [centre, pts[k], pts[(k + 1) % 10]], { ...DECOR, colour: star });
        sink.polygon('structureMetal', [centre, pts[(k + 1) % 10], pts[k]], { ...DECOR, colour: star });
      }
    }
  }
  return top;
}

/** The piers of a deco tier carried up past its parapet (`y`) as stepped finials, a bay apart, round the tier. */
function pierFinials(sink: PartSink, r: Rect, y: number, bay: number, bucket: RegionalBucket): void {
  for (const face of rectFaces(r)) {
    const n = Math.max(1, Math.round(face.width / bay)), bw = face.width / n;
    for (let k = 0; k <= n; k++) {
      const u = -face.width / 2 + k * bw, corner = k === 0 || k === n;
      const h = corner ? 1.6 : 1.0;
      faceBox(sink, bucket, face, u, y + h / 2, 0.25, corner ? 0.8 : 0.5, h, 0.5, { ...DECOR, fineSides: true });
    }
  }
}

/** Corner pinnacles on a tier's top: small obelisks at the four corners. */
function pinnacles(sink: PartSink, r: Rect, y: number, size: number, bucket: RegionalBucket): void {
  for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]] as const) {
    const sx = x < (r.x0 + r.x1) / 2 ? 1 : -1, sz = z < (r.z0 + r.z1) / 2 ? 1 : -1;
    const px = x + sx * size * 0.6, pz = z + sz * size * 0.6;
    sink.span(bucket, px - size / 2, y, pz - size / 2, px + size / 2, y + size * 1.4, pz + size / 2, DECOR);
    sink.cylinder(bucket, [px, y + size * 1.4, pz], 'y', size * 2.2, size * 0.42, 4, DECOR, 0.02, true, Math.PI / 4);
  }
}

// -------------------------------------------------------------------------------------------------------------------
// The buildings
// -------------------------------------------------------------------------------------------------------------------

/** A plot fitted: the building's footprint inside it, centred on the plot's centre. */
function fit(ctx: RegionalBuildContext, minW: number, minD: number, pad = 0.4): Rect {
  const cx = (ctx.bounds.minX + ctx.bounds.maxX) / 2, cz = (ctx.bounds.minZ + ctx.bounds.maxZ) / 2;
  const w = Math.max(minW, ctx.info.w - 2 * pad), d = Math.max(minD, ctx.info.d - 2 * pad);
  return { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 };
}

/** A granite podium of tall openings under a cornice: the street storeys of a Bund building. */
function podium(sink: PartSink, r: Rect, h: number, bucket: RegionalBucket, rng: () => number, opts: { arcade?: boolean; door?: Rgb } = {}): void {
  sink.span(bucket, r.x0, -0.5, r.z0, r.x1, h, r.z1);
  const faces = rectFaces(r);
  faces.forEach((face, fi) => {
    const n = Math.max(1, Math.round(face.width / 4.2)), bw = face.width / n;
    for (let k = 0; k < n; k++) {
      const u = -face.width / 2 + (k + 0.5) * bw, ow = bw * 0.62, oh = h * 0.72;
      // the opening: a deep reveal read by its dark back and its stone frame standing proud, an arch head on an arcade
      faceBox(sink, 'dark', face, u, 0.5 + oh / 2, 0.015, ow, oh, 0.02, DECOR);
      if (fi === 0 && k === Math.floor(n / 2)) {
        doorUnit(sink, face, u, 0.4, Math.min(2.2, ow * 0.7), Math.min(3.4, oh * 0.8), { leaf: opts.door ?? BRONZE,
          frame: { bucket, width: 0.3, out: 0.12, arch: true }, transom: true, steps: { bucket }, leafKind: 'glazed' }, 0.4);
        continue;
      }
      facePanel(sink, paneBucket(rng, 0.45), face, u, 0.5 + oh * 0.5, 0.03, ow - 0.2, oh - 0.3, { ...DECOR, window: face.out });
      faceBox(sink, bucket, face, u - ow / 2 - 0.12, 0.5 + oh / 2, 0.08, 0.24, oh, 0.16, { ...DECOR, fineSides: true });
      faceBox(sink, bucket, face, u + ow / 2 + 0.12, 0.5 + oh / 2, 0.08, 0.24, oh, 0.16, { ...DECOR, fineSides: true });
      if (opts.arcade) faceSlab(sink, bucket, face, archBand(u, 0.5 + oh, ow + 0.48, 0.42, ow * 0.25), 0, 0.16);
      else faceBox(sink, bucket, face, u, 0.5 + oh + 0.18, 0.08, ow + 0.48, 0.36, 0.16, { ...DECOR, fineSides: true });
    }
    pilaster(sink, bucket, face, -face.width / 2 + 0.35, 0, h, 0.7, 0.18);
    pilaster(sink, bucket, face, face.width / 2 - 0.35, 0, h, 0.7, 0.18);
  });
  trimRing(sink, bucket, r, h - 0.5, [{ h: 0.18, out: 0.1 }, { h: 0.12, out: 0.22 }, { h: 0.2, out: 0.36 }]);
}

/** A segmental arch band over an opening: flat at its springing line, its extrados an arc. */
function archBand(u: number, y: number, w: number, h: number, rise: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [[u - w / 2, y], [u + w / 2, y]];
  for (let k = 0; k <= 8; k++) {
    const a = Math.PI * k / 8;
    pts.push([u + Math.cos(a) * w / 2, y + h + Math.sin(a) * rise]);
  }
  return pts;
}

interface SkylineOptions {
  damage?: Damage | 'auto';
  /** storeys of the shaft (default from the plan height or the plot) */
  floors?: number;
}

/**
 * The art-deco tower of the Bund: a granite podium, a shaft of continuous piers over recessed spandrels in two or three
 * setbacks, the crown a copper pyramid (Sassoon House), a stepped crown with a flagstaff (Broadway Mansions) or a needle.
 */
export function decoTower(opts: SkylineOptions & { crown?: 'pyramid' | 'stepped' | 'needle' } = {}): RegionalBuilder {
  return (ctx) => {
    const sink = new PartSink(uvOffset(ctx));
    const rng = ctx.rng;
    const damage = damageOf(ctx, opts.damage);
    const plot = fit(ctx, 12, 12);
    const crown = opts.crown ?? (['pyramid', 'stepped', 'needle'] as const)[Math.floor(rng() * 3)];
    const stone: RegionalBucket = 'stone';
    const podiumH = 8.5;
    podium(sink, plot, podiumH, stone, rng, { arcade: rng() < 0.5 });
    // the vertical line of the deco shaft: piers standing well out, the spandrels set back between them and darker
    const facade: TowerFacade = {
      pier: { bucket: stone, w: 0.66, out: 0.5 }, spandrel: { bucket: stone, h: 1.1, out: 0.07, shade: 0.62 },
      bay: 2.2, lit: 0.32, glazing: 'bays', mullions: 1, mullion: BRONZE,
    };
    const total = opts.floors ?? Math.max(6, Math.min(22, Math.round((ctx.info.h > 20 ? ctx.info.h : 48) / 3.6)));
    const fh = 3.6;
    // the shaft in tiers: each a setback over the last, the top one carrying the crown
    const tiers = total > 12 ? 3 : 2;
    let r = inset(plot, Math.min(1.2, (plot.x1 - plot.x0) * 0.05));
    let y = podiumH, left = total;
    const first = Math.round(total * 0.55);
    const dmg = tierDamage(rng, damage, first);
    for (let t = 0; t < tiers; t++) {
      const n = t === tiers - 1 ? left : t === 0 ? first : Math.round(total * 0.28);
      const tierDmg = t === 0 ? dmg : { ...dmg, corner: null, blown: null, burnt: new Set<number>(), holes: dmg.holes.filter((h) => h.floor < n) };
      const top = towerTier(sink, r, y, n, fh, facade, tierDmg, rng);
      // the setback: the piers carried up past the parapet as finials, the terrace parapet between them
      sink.span(stone, r.x0, top - 0.3, r.z0, r.x1, top + 0.9, r.z1);
      pierFinials(sink, r, top + 0.9, facade.bay, stone);
      left -= n; y = top;
      if (left <= 0) break;
      const k = Math.min((r.x1 - r.x0) * 0.16, (r.z1 - r.z0) * 0.16, 3.2);
      r = inset(r, k);
    }
    // the crown
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, half = Math.min(r.x1 - r.x0, r.z1 - r.z0) / 2;
    if (damage === 3) {
      // the crown shot away: its stump and the broken frame
      sink.span(stone, cx - half * 0.6, y + 0.9, cz - half * 0.6, cx + half * 0.6, y + 3.1, cz + half * 0.6);
    } else if (crown === 'pyramid') {
      sink.span(stone, cx - half * 0.86, y + 0.9, cz - half * 0.86, cx + half * 0.86, y + 4.1, cz + half * 0.86);
      pyramidCrown(sink, cx, cz, half * 0.92, y + 4.1, half * 1.5, COPPER);
    } else if (crown === 'stepped') {
      // the ziggurat crown: three stepped drums, each ringed by fins, a flagstaff on the last
      let s = half * 0.82, yy = y + 0.9;
      for (let k = 0; k < 3; k++) {
        sink.span(stone, cx - s, yy, cz - s, cx + s, yy + 2.6, cz + s);
        for (const face of rectFaces({ x0: cx - s, x1: cx + s, z0: cz - s, z1: cz + s })) {
          for (let f = -1; f <= 1; f++) faceBox(sink, stone, face, f * s * 0.55, yy + 1.6, 0.18, 0.28, 3.2, 0.36, { ...DECOR, fineSides: true });
        }
        yy += 2.6; s *= 0.7;
      }
      sink.cylinder('structureMetal', [cx, yy, cz], 'y', 9, 0.1, 6, { ...DECOR, colour: STEEL }, 0.05);
    } else {
      sink.span(stone, cx - half * 0.5, y + 0.9, cz - half * 0.5, cx + half * 0.5, y + 5.4, cz + half * 0.5);
      spire(sink, cx, cz, y + 5.4, half * 0.42, half * 3.2, COPPER, null);
    }
    return sink.finish();
  };
}

/**
 * The post-war glass tower: a lobby recessed under a canopy, the curtain wall's glass bands over dark spandrels on a
 * mullion grid, the corner mullions heavier, the plant storey and its masts on the roof.
 */
export function curtainTower(opts: SkylineOptions & { spandrel?: Rgb } = {}): RegionalBuilder {
  return (ctx) => {
    const sink = new PartSink(uvOffset(ctx));
    const rng = ctx.rng;
    const damage = damageOf(ctx, opts.damage);
    const plot = fit(ctx, 10, 10);
    const lobbyH = 5.2;
    // the lobby: glass behind a ring of columns, the tower's floors over it on the canopy slab
    const lobby = inset(plot, 1.4);
    sink.span('dark', lobby.x0, -0.4, lobby.z0, lobby.x1, lobbyH, lobby.z1);
    rectFaces(lobby).forEach((face) => facePanel(sink, 'glass', face, 0, lobbyH / 2, 0.03, face.width - 0.4, lobbyH - 0.6, { ...DECOR, window: face.out }));
    sink.span('plaster3', plot.x0, lobbyH, plot.z0, plot.x1, lobbyH + 0.6, plot.z1);
    for (const face of rectFaces(plot)) {
      const n = Math.max(2, Math.round(face.width / 5));
      for (let k = 0; k <= n; k++) {
        const u = -face.width / 2 + 0.35 + (face.width - 0.7) * k / n;
        const p = facePoint(face, u, 0, -0.35);
        sink.span('plaster3', p[0] - 0.3, -0.3, p[2] - 0.3, p[0] + 0.3, lobbyH, p[2] + 0.3);
      }
    }
    const colour = opts.spandrel ?? ([rgb(0x2e3338), BRONZE, rgb(0x34404a)][Math.floor(rng() * 3)]);
    const facade: TowerFacade = {
      pier: { bucket: 'structureMetal', w: 0.12, out: 0.16, colour: shade(colour, 0.8) },
      spandrel: { bucket: 'structureMetal', h: 1.05, out: 0.08, colour },
      bay: 1.6, lit: 0.36, glazing: 'bays', mullions: 0, mullion: colour,
    };
    const floors = opts.floors ?? Math.max(6, Math.min(26, Math.round((ctx.info.h > 20 ? ctx.info.h : 54) / 3.4)));
    const fh = 3.4;
    const top = towerTier(sink, plot, lobbyH + 0.6, floors, fh, facade, tierDamage(rng, damage, floors), rng, { base: lobbyH });
    // the corner fins running the shaft's height, a shade lighter than its spandrels, and the crown: the plant storeys
    // set back behind a band of louvres
    for (const face of rectFaces(plot)) {
      for (const end of [-1, 1]) faceBox(sink, 'structureMetal', face, end * (face.width / 2 - 0.3), (lobbyH + top) / 2, 0.22, 0.6, top - lobbyH, 0.44,
        { ...DECOR, colour: shade(colour, 1.35), fineSides: true });
    }
    const crown = inset(plot, 1.2);
    sink.span('dark', crown.x0, top, crown.z0, crown.x1, top + 4.2, crown.z1);
    for (const face of rectFaces(crown)) {
      facePanel(sink, 'structureMetal', face, 0, top + 2.1, 0.03, face.width - 0.4, 3.6, { ...DECOR, colour: shade(colour, 1.2) });
      for (let k = 1; k < 8; k++) facePanel(sink, 'structureMetal', face, 0, top + 0.3 + k * 0.45, 0.05, face.width - 0.5, 0.08, { ...DECOR, colour: shade(colour, 0.7), fine: true });
    }
    roofTop(sink, crown, top + 4.2, 'plaster3', rng, true);
    sink.span('plaster3', plot.x0, top - 0.2, plot.z0, plot.x1, top + 0.9, plot.z1);
    return sink.finish();
  };
}

/**
 * The slab block: ribbon windows between concrete bands along its long faces, its stair-core ends blank, a plant room
 * on the roof; a residential slab carries loggias with coloured parapets in a grid.
 */
export function modernSlab(opts: SkylineOptions & { loggias?: boolean; band?: Rgb } = {}): RegionalBuilder {
  return (ctx) => {
    const sink = new PartSink(uvOffset(ctx));
    const rng = ctx.rng;
    const damage = damageOf(ctx, opts.damage);
    const plot = fit(ctx, 12, 8);
    const loggias = opts.loggias ?? rng() < 0.5;
    const floors = opts.floors ?? Math.max(5, Math.min(16, Math.round((ctx.info.h > 15 ? ctx.info.h : 36) / 3.0)));
    const fh = 3.0;
    sink.span('plaster3', plot.x0 - 0.2, -0.5, plot.z0 - 0.2, plot.x1 + 0.2, 0.6, plot.z1 + 0.2);
    const facade: TowerFacade = {
      pier: null, spandrel: { bucket: 'plaster3', h: 1.0, out: 0.14 }, bay: 2.8, lit: 0.4, glazing: 'ribbon', mullions: 1, mullion: rgb(0x8a8e8c),
    };
    const long = plot.x1 - plot.x0 >= plot.z1 - plot.z0;
    const dmg = tierDamage(rng, damage, floors);
    // the stair-core ends blank: only the long faces carry the ribbons
    const faces = long ? [true, false, true, false] : [false, true, false, true];
    const top = towerTier(sink, plot, 0.6, floors, fh, facade, dmg, rng, { faces });
    // the blank ends: the core's concrete over the dark (decor 3 cm proud), a slit of stair windows up the middle
    rectFaces(plot).forEach((face, fi) => {
      if (faces[fi]) return;
      facePanel(sink, 'plaster3', face, 0, (0.6 + top) / 2, 0.03, face.width, top - 0.6, DECOR);
      for (let f = 0; f < floors; f++) facePanel(sink, 'glass', face, 0, 0.6 + f * fh + fh * 0.6, 0.05, 0.9, 1.2, { ...DECOR, window: face.out });
    });
    if (loggias) {
      // loggias down the long faces: a slab and a parapet in front of each bay pair, the parapets painted
      const paints = [rgb(0xb0573a), rgb(0x3f6f8f), rgb(0xd0b050), rgb(0x6a8a5a)];
      rectFaces(plot).forEach((face, fi) => {
        if (!faces[fi]) return;
        const n = Math.max(1, Math.round(face.width / 5.6)), bw = face.width / n;
        for (let k = 0; k < n; k++) {
          if (k % 2 === 1) continue;
          const u = -face.width / 2 + (k + 0.5) * bw, paint = paints[Math.floor(hash01(face.origin[0], face.origin[2], k) * paints.length)];
          for (let f = 1; f < floors; f++) {
            const y = 0.6 + f * fh;
            if (dmg.burnt.has(f) && hash01(k, f) < 0.5) continue;
            faceBox(sink, 'plaster3', face, u, y + 0.1, 0.75, bw * 0.92, 0.2, 1.5, { ...DECOR, fineSides: true });
            faceBox(sink, 'structureMetal', face, u, y + 0.65, 1.47, bw * 0.92, 0.9, 0.06, { ...DECOR, colour: paint });
          }
        }
      });
    }
    roofTop(sink, plot, top, 'plaster3', rng, rng() < 0.4);
    return sink.finish();
  };
}

/**
 * The Stalinist high-rise: a base block, wings stepping down to the sides on a wide plot, the central tower in tiers
 * stepping back under heavy cornices with pinnacles at their corners, an octagonal drum, the spire and its star.
 */
export function stalinistTower(opts: SkylineOptions & { star?: Rgb } = {}): RegionalBuilder {
  return (ctx) => {
    const sink = new PartSink(uvOffset(ctx));
    const rng = ctx.rng;
    const damage = damageOf(ctx, opts.damage);
    const plot = fit(ctx, 16, 14);
    const W = plot.x1 - plot.x0, D = plot.z1 - plot.z0;
    const render: RegionalBucket = 'plaster', stone: RegionalBucket = 'stone';
    const facade: TowerFacade = {
      pier: { bucket: render, w: 0.5, out: 0.3 }, spandrel: { bucket: render, h: 1.05, out: 0.1, shade: 0.9 },
      bay: 2.0, lit: 0.42, glazing: 'bays', mullions: 1, mullion: rgb(0x6a5a46),
    };
    const fh = 3.5;
    const dmg = tierDamage(rng, damage, 8);
    // the base block over the whole plot, a stone plinth storey under it
    const baseFloors = 3;
    sink.span(stone, plot.x0, -0.5, plot.z0, plot.x1, 4.2, plot.z1);
    let y = towerTier(sink, plot, 4.2, baseFloors, fh, facade, dmg, rng);
    trimRing(sink, render, plot, y - 0.4, [{ h: 0.15, out: 0.12 }, { h: 0.12, out: 0.28 }, { h: 0.18, out: 0.46 }]);
    sink.span(render, plot.x0, y - 0.3, plot.z0, plot.x1, y + 0.9, plot.z1);
    // the wings on a wide plot: lower blocks either side of the tower, each with its little tower
    const core = { x0: plot.x0 + W * (W > D * 1.4 ? 0.3 : 0.12), x1: plot.x1 - W * (W > D * 1.4 ? 0.3 : 0.12), z0: plot.z0 + D * 0.12, z1: plot.z1 - D * 0.12 };
    if (W > D * 1.4) {
      for (const side of [-1, 1]) {
        const wing = side < 0 ? { x0: plot.x0 + 0.6, x1: core.x0 - 0.2, z0: plot.z0 + 1.2, z1: plot.z1 - 1.2 } : { x0: core.x1 + 0.2, x1: plot.x1 - 0.6, z0: plot.z0 + 1.2, z1: plot.z1 - 1.2 };
        const wt = towerTier(sink, wing, y + 0.9, 3, fh, facade, NO_DAMAGE, rng);
        trimRing(sink, render, wing, wt - 0.35, [{ h: 0.12, out: 0.1 }, { h: 0.18, out: 0.3 }]);
        sink.span(render, wing.x0, wt - 0.3, wing.z0, wing.x1, wt + 0.4, wing.z1);
        pinnacles(sink, wing, wt + 0.4, 0.7, render);
        const wcx = (wing.x0 + wing.x1) / 2, wcz = (wing.z0 + wing.z1) / 2;
        sink.span(render, wcx - 1.8, wt + 0.4, wcz - 1.8, wcx + 1.8, wt + 4.8, wcz + 1.8);
        spire(sink, wcx, wcz, wt + 4.8, 1.0, 5.5, GILT, null);
      }
    }
    // the tower: tiers stepping back
    let r = core;
    y += 0.9;
    const tierFloors = [6, 4, 3];
    for (let t = 0; t < tierFloors.length; t++) {
      const tierDmg = t === 0 ? { ...dmg, burnt: dmg.burnt } : NO_DAMAGE;
      const top = towerTier(sink, r, y, tierFloors[t], fh, facade, tierDmg, rng);
      trimRing(sink, render, r, top - 0.35, [{ h: 0.12, out: 0.12 }, { h: 0.2, out: 0.34 }]);
      sink.span(render, r.x0, top - 0.3, r.z0, r.x1, top + 0.5, r.z1);
      pinnacles(sink, r, top + 0.5, 0.8 - t * 0.12, render);
      y = top + 0.5;
      const k = Math.min((r.x1 - r.x0) * 0.17, (r.z1 - r.z0) * 0.17, 3);
      r = inset(r, k);
    }
    // the drum and the spire with its star
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, rad = Math.min(r.x1 - r.x0, r.z1 - r.z0) * 0.42;
    sink.cylinder(render, [cx, y, cz], 'y', 5.5, rad, 8, {}, rad * 0.92, true, Math.PI / 8);
    if (damage < 3) spire(sink, cx, cz, y + 5.5, rad * 0.62, rad * 4.5, GILT, opts.star ?? RED_STAR);
    else sink.cylinder('structureMetal', [cx, y + 5.5, cz], 'y', rad * 1.4, rad * 0.62, 8, { colour: GILT }, rad * 0.4);
    return sink.finish();
  };
}

/**
 * A brick industrial hall under sawtooth north lights: brick walls with piers and tall arched windows, a stepped
 * gable parapet at each end, and the roof's teeth across it, their steep faces glazed. A chimney stands at one end
 * when the plot has room.
 */
export function industrialHall(opts: SkylineOptions & { chimney?: boolean } = {}): RegionalBuilder {
  return (ctx) => {
    const sink = new PartSink(uvOffset(ctx));
    const rng = ctx.rng;
    const damage = damageOf(ctx, opts.damage);
    const plot = fit(ctx, 10, 14);
    const W = plot.x1 - plot.x0, D = plot.z1 - plot.z0, H = 8.5;
    const cx = (plot.x0 + plot.x1) / 2, cz = (plot.z0 + plot.z1) / 2;
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: Math.min(4.2, W * 0.35), y0: 0, h: 4.6 }];
    for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, D, { w: 1.7, h: 4.2, sill: 2.4, spacing: 4.0, margin: 2.0 })) openings.push(o);
    for (const o of windowRhythm('back', 0, W, { w: 1.7, h: 4.2, sill: 2.4, spacing: 4.0, margin: 2.0 })) openings.push(o);
    const window: WindowStyle = { frame: rgb(0x40484a), frameWidth: 0.08, frameOut: 0.05, bars: 'six', surround: null, sill: { bucket: 'stone', out: 0.1 }, shutters: null,
      head: { kind: 'segment', bucket: 'stone', h: 0.2, out: 0.06, ext: 0.12, rise: 0.22 } };
    const dialect: HouseDialect = {
      window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, window, rng, 0.1),
      door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: rgb(0x3c4a44), frame: { bucket: 'stone', width: 0.36, out: 0.1, arch: true },
        steps: null, leafKind: 'plank' }, y0 + o.y0),
    };
    let roofY = 0;
    sink.placed(0, cx, 0, cz, () => {
      const frame = buildHouse(sink, {
        w: W, d: D, plinth: { h: 0.5, out: 0.06, bucket: 'stone' }, storeys: [{ h: H, wall: 'stone' }],
        roof: { kind: 'flat', pitchDeg: 0, eave: 0.05, verge: 0.05, thickness: 0.3, bucket: 'stone', parapet: 0.6 }, openings, chimneys: [],
        gutters: null, verge: null, reveal: 0.35,
      }, dialect);
      roofY = frame.eaveY + 0.3;
      for (const name of ['left', 'right', 'back'] as const) {
        const face = frame.faces[name], half = face.width / 2;
        const us = openings.filter((o) => o.face === name).map((o) => o.u).sort((a, b) => a - b);
        const at = [-half + 0.3, half - 0.3];
        for (let k = 0; k + 1 < us.length; k++) at.push((us[k] + us[k + 1]) / 2);
        for (const u of at) pilaster(sink, 'stone', face, u, 0.5, frame.eaveY + 0.6, 0.56, 0.12);
      }
      // the sawtooth: teeth across the hall, steep glazed faces to the north (-z), sloped roofs falling south
      const teeth = Math.max(2, Math.round(D / 6)), tl = D / teeth, tH = 2.6;
      for (let k = 0; k < teeth; k++) {
        const z0 = -D / 2 + k * tl, z1 = z0 + tl;
        const broken = damage >= 2 && hash01(k, W, 9.1) < 0.35 * (damage - 1);
        // the tooth: its sloped roof from the crest at z0 down to z1, the glazed face standing at z0
        const pts: Vec3[] = [[-W / 2 + 0.2, roofY, z1], [W / 2 - 0.2, roofY, z1], [W / 2 - 0.2, roofY + tH, z0 + 0.15], [-W / 2 + 0.2, roofY + tH, z0 + 0.15]];
        if (!broken) sink.prism('roof', pts, normalize3([0, tl, tH]), 0.12, {});
        else sink.member('structureMetal', [-W / 2 + 0.3, roofY + tH - 0.2, z0 + 0.2], [W / 2 - 0.3, roofY + 0.4, z1 - 0.3], 0.18, 0.2, [0, 0, 1], { ...DECOR, colour: STEEL, exposed: true });
        // the tooth's gable ends, brick triangles under the slope
        for (const side of [-1, 1]) {
          const x = side * (W / 2 - 0.2);
          const tri: Vec3[] = [[x, roofY, z1], [x, roofY, z0 + 0.15], [x, roofY + tH, z0 + 0.15]];
          sink.polygon('stone', side > 0 ? tri : [...tri].reverse(), {});
          // (a wrecked tooth shows the gable's inner face through its fallen roof: a skin 2 cm inside it)
          if (broken) {
            const inner = tri.map(([px, py, pz]): Vec3 => [px - side * 0.02, py, pz]);
            sink.polygon('stone', side > 0 ? [...inner].reverse() : inner, DECOR);
          }
        }
        const glass: Face = { origin: [0, 0, z0 + 0.15], u: [-1, 0, 0], out: [0, 0, -1], width: W - 0.4 };
        sink.span('stone', -W / 2 + 0.2, roofY, z0, W / 2 - 0.2, roofY + 0.4, z0 + 0.3);
        if (!broken) facePanel(sink, 'glass', glass, 0, roofY + 0.4 + (tH - 0.4) / 2, 0.02, W - 0.6, tH - 0.45, { ...DECOR, window: [0, 0, -1] });
        for (let m = 1; m < Math.round(W / 1.2); m++) {
          facePanel(sink, 'structureMetal', glass, -W / 2 + 0.3 + (W - 0.6) * m / Math.round(W / 1.2), roofY + 0.4 + (tH - 0.4) / 2, 0.04, 0.06, tH - 0.45,
            { ...DECOR, colour: STEEL, fine: true });
        }
      }
    });
    // the boiler-house chimney at the hall's back corner, inside the plot
    if (opts.chimney ?? rng() < 0.6) chimney(sink, plot.x1 - 1.6, plot.z0 + 1.6, 26 + rng() * 10);
    return sink.finish();
  };
}

/** A column-guided gasholder: the bell in its tank, the lattice guide frame round it, girder rings, a stair. */
export function gasHolder(opts: SkylineOptions = {}): RegionalBuilder {
  return (ctx) => {
    const sink = new PartSink(uvOffset(ctx));
    const rng = ctx.rng;
    const damage = damageOf(ctx, opts.damage);
    const plot = fit(ctx, 14, 14, 0.6);
    const cx = (plot.x0 + plot.x1) / 2, cz = (plot.z0 + plot.z1) / 2;
    const R = Math.min(plot.x1 - plot.x0, plot.z1 - plot.z0) / 2 - 1.2;
    const lift = damage >= 2 ? 0.25 : 0.4 + rng() * 0.5, H = R * 1.6;
    const green = [rgb(0x5a6e5e), rgb(0x6a7270), rgb(0x56606a)][Math.floor(rng() * 3)];
    // the tank (brick) and the bell over it, risen with the gas it holds
    sink.cylinder('stone', [cx, -0.4, cz], 'y', 3.4, R + 0.6, 24, {}, R + 0.6);
    const bellTop = 3 + H * lift;
    sink.cylinder('structureMetal', [cx, 3.0, cz], 'y', bellTop - 3.0, R, 24, { colour: green }, R);
    sink.cylinder('structureMetal', [cx, bellTop, cz], 'y', R * 0.12, R, 24, { colour: shade(green, 1.1) }, R * 0.2);
    // the guide frame: columns round the tank, girder rings, the diagonal bracing between (fine)
    const cols = Math.max(8, Math.round(R * 2 * Math.PI / 5.5)), frameR = R + 1.0, top = 3 + H;
    for (let k = 0; k < cols; k++) {
      const a = k / cols * Math.PI * 2, x = cx + Math.cos(a) * frameR, z = cz + Math.sin(a) * frameR;
      const fallen = damage >= 2 && hash01(k, R, 2.2) < 0.18;
      if (fallen) {
        sink.member('structureMetal', [x, 3.0, z], [x + Math.cos(a) * 5, 0.6, z + Math.sin(a) * 5], 0.6, 0.6, [0, 1, 0], { ...DECOR, colour: STEEL, exposed: true });
        continue;
      }
      sink.span('structureMetal', x - 0.32, 3.0, z - 0.32, x + 0.32, top, z + 0.32, { colour: STEEL });
      const b = (k + 1) / cols * Math.PI * 2, nx = cx + Math.cos(b) * frameR, nz = cz + Math.sin(b) * frameR;
      for (let lv = 0; lv < 4; lv++) {
        const y0 = 3 + H * lv / 4, y1 = 3 + H * (lv + 1) / 4;
        sink.member('structureMetal', [x, y0 + 0.3, z], [nx, y1 - 0.3, nz], 0.12, 0.12, [Math.cos(a), 0, Math.sin(a)], { ...DECOR, colour: STEEL, exposed: true, fine: true });
      }
    }
    for (let lv = 1; lv <= 4; lv++) {
      const y = 3 + H * lv / 4;
      for (let k = 0; k < cols; k++) {
        const a = k / cols * Math.PI * 2, b = (k + 1) / cols * Math.PI * 2;
        sink.member('structureMetal', [cx + Math.cos(a) * frameR, y, cz + Math.sin(a) * frameR], [cx + Math.cos(b) * frameR, y, cz + Math.sin(b) * frameR],
          0.5, 0.4, [Math.cos((a + b) / 2), 0, Math.sin((a + b) / 2)], { ...DECOR, colour: STEEL, exposed: true });
      }
    }
    return sink.finish();
  };
}

/**
 * A terminus: the stone head building with its central pavilion, the great lunette window over the entrance arch and
 * the clock tower, and behind it the train shed between brick side walls: one span or two, each a blunt two-centred
 * pointed arch of iron ribs under glass and sheeting, a smoke-vent lantern along its crown, the glazed end screen's
 * mullions radiating from its springing (the map-revival lane, mr1, 2026-10-07: wave 209 read the low smooth barrel by
 * the clock tower as a Nissen hut). `nameBoard`: the station's name board over the entrance arch.
 */
export function stationHall(opts: SkylineOptions & { nameBoard?: boolean } = {}): RegionalBuilder {
  return (ctx) => {
    const sink = new PartSink(uvOffset(ctx));
    const rng = ctx.rng;
    const damage = damageOf(ctx, opts.damage);
    const plot = fit(ctx, 20, 26);
    const W = plot.x1 - plot.x0, D = plot.z1 - plot.z0;
    const headD = Math.min(12, D * 0.32), shedD = D - headD;
    const stone: RegionalBucket = 'stone';
    // the head building along the front (+z), two storeys and a central pavilion
    const head = { x0: plot.x0, x1: plot.x1, z0: plot.z1 - headD, z1: plot.z1 - 0.9 };
    const hfacade: TowerFacade = { pier: { bucket: stone, w: 0.7, out: 0.3 }, spandrel: { bucket: stone, h: 1.2, out: 0.12, shade: 0.86 }, bay: 3.4, lit: 0.4,
      glazing: 'bays', mullions: 2, mullion: rgb(0x4a4a44), coarseMullions: true };
    const hdmg = tierDamage(rng, damage, 2);
    const hTop = towerTier(sink, head, 0, 2, 5.2, hfacade, hdmg, rng, { base: -0.5 });
    trimRing(sink, stone, head, hTop - 0.4, [{ h: 0.15, out: 0.14 }, { h: 0.25, out: 0.4 }]);
    sink.span(stone, head.x0, hTop - 0.3, head.z0, head.x1, hTop + 1.2, head.z1);
    // the pavilion: taller, its arch and lunette to the forecourt
    const pw = Math.min(W * 0.36, 16), pav = { x0: -pw / 2 + (plot.x0 + plot.x1) / 2, x1: pw / 2 + (plot.x0 + plot.x1) / 2, z0: head.z0 - 0.5, z1: plot.z1 };
    sink.span(stone, pav.x0, -0.5, pav.z0, pav.x1, hTop + 6, pav.z1);
    const front: Face = { origin: [(pav.x0 + pav.x1) / 2, 0, pav.z1], u: [1, 0, 0], out: [0, 0, 1], width: pw };
    const archW = pw * 0.56, archH = hTop + 1.5;
    const lunette: Array<[number, number]> = [[-archW / 2, 0.2], [archW / 2, 0.2]];
    for (let k = 0; k <= 12; k++) { const a = Math.PI * k / 12; lunette.push([Math.cos(a) * archW / 2, archH - archW / 2 + Math.sin(a) * archW / 2]); }
    faceSlab(sink, 'dark', front, lunette, 0, 0.02);
    const glassPts = lunette.map(([u, y]): [number, number] => [u * 0.92, y < 1 ? 4.0 : y - 0.25]);
    if (damage < 2) faceSlab(sink, 'glass', front, glassPts, 0.02, 0.01, { window: [0, 0, 1] });
    for (let k = 1; k < 8; k++) {
      const a = Math.PI * k / 8;
      sink.member('structureMetal', facePoint(front, 0, archH - archW / 2, 0.05), facePoint(front, Math.cos(a) * archW * 0.46, archH - archW / 2 + Math.sin(a) * archW * 0.46, 0.05),
        0.08, 0.06, [0, 0, 1], { ...DECOR, colour: STEEL });
    }
    trimRun(sink, stone, front, -pw / 2, pw / 2, hTop + 5.4, [{ h: 0.2, out: 0.2 }, { h: 0.3, out: 0.45 }], { ret: 0.5 });
    // the name board over the arch: a dark enamelled board, its lettering's pale band, scorched on a burnt station
    if (opts.nameBoard) {
      const boardY = archH + 0.55, boardW = Math.min(pw * 0.8, archW + 2.4);
      faceBox(sink, 'structureMetal', front, 0, boardY, 0.05, boardW, 0.9, 0.08, { ...DECOR, colour: rgb(0x1f2a33) });
      faceBox(sink, 'structureMetal', front, 0, boardY, 0.095, boardW - 0.5, 0.36, 0.01,
        { ...DECOR, colour: damage >= 2 ? rgb(0x8f8a7c) : rgb(0xd8d2c0) });
    }
    // the clock tower on the pavilion's corner
    const tx = pav.x1 - 2.2, tz = pav.z1 - 2.2, tTop = hTop + 6 + 9;
    sink.span(stone, tx - 1.8, hTop + 6, tz - 1.8, tx + 1.8, tTop, tz + 1.8);
    for (const face of rectFaces({ x0: tx - 1.8, x1: tx + 1.8, z0: tz - 1.8, z1: tz + 1.8 })) {
      faceSlab(sink, 'structureMetal', face, circle(0, tTop - 2.4, 1.1, 16), 0, 0.04, { colour: rgb(0xe0dccf) });
      faceBox(sink, 'dark', face, 0, tTop - 2.4, 0.06, 0.07, 0.8, 0.02, DECOR);
    }
    pyramidCrown(sink, tx, tz, 2.0, tTop, 3.6, COPPER);
    // the train shed: brick side walls, then one span or two (past 26 m), each a blunt two-centred pointed arch of iron
    // ribs (each arc's centre past the axis on the far side and below the springing line: the rise 0.7 of the half span,
    // the arcs meeting at the crown in a low point), glass over its middle bands and sheeting over the haunches, a
    // smoke-vent lantern along the crown, the end screen glazed with its mullions radiating from the springing. All
    // dressing but the walls.
    const shed = { x0: plot.x0 + 0.5, x1: plot.x1 - 0.5, z0: plot.z0, z1: head.z0 };
    const wallH = 7.5, width = shed.x1 - shed.x0;
    for (const x of [shed.x0, shed.x1 - 0.8]) sink.span(stone, x, -0.4, shed.z0, x + 0.8, wallH, shed.z1);
    const spans = width > 26 ? 2 : 1, half = width / spans / 2;
    const ribs = Math.max(4, Math.round(shedD / 4.5));
    const ribZ = (k: number) => shed.z0 + 0.3 + (shedD - 0.6) * k / ribs;
    // (the left arc's centre at (cx + ac, wallH - ae); it runs from its springing up to the axis, still rising there)
    const SEG = 12, ac = 0.3 * half, ae = 0.8 * half, R = Math.hypot(half + ac, ae);
    const springA = Math.atan2(ae, -(half + ac)), crownA = Math.atan2(Math.sqrt(R * R - ac * ac), -ac);
    const rise = Math.sqrt(R * R - ac * ac) - ae;
    /** The arch's points, springing to springing: the left arc up to the crown, the right its mirror. */
    const arch = (cx: number): Array<[number, number]> => {
      const left: Array<[number, number]> = [];
      for (let k = 0; k <= SEG / 2; k++) {
        const a = springA + (crownA - springA) * k / (SEG / 2);
        left.push([cx + ac + Math.cos(a) * R, wallH - ae + Math.sin(a) * R]);
      }
      return [...left, ...left.slice(0, -1).reverse().map(([x, y]): [number, number] => [2 * cx - x, y])];
    };
    for (let sp = 0; sp < spans; sp++) {
      const cx = shed.x0 + half * (2 * sp + 1), pts = arch(cx), crownY = wallH + rise;
      for (let k = 0; k <= ribs; k++) {
        const z = ribZ(k);
        if (damage >= 2 && hash01(k, width, 4.4 + sp) < 0.3) continue;
        for (let s = 0; s < SEG; s++) {
          sink.member('structureMetal', [pts[s][0], pts[s][1], z], [pts[s + 1][0], pts[s + 1][1], z], 0.25, 0.35, [0, 0, 1], { ...DECOR, colour: STEEL, exposed: true });
        }
        // the spine's iron column where two spans meet
        if (sp === 1) sink.member('structureMetal', [shed.x0 + 2 * half, 0, z], [shed.x0 + 2 * half, wallH, z], 0.32, 0.32, [0, 0, 1], { ...DECOR, colour: STEEL, exposed: true });
      }
      // the glazing over the middle bands, the sheeting over the haunches, gone over the blown bays (both faces)
      for (let s = 0; s < SEG; s++) {
        const [p0x, p0y] = pts[s], [p1x, p1y] = pts[s + 1];
        const glazed = s >= 3 && s <= 8;
        const nx = -(p1y - p0y), ny = p1x - p0x, nl = Math.hypot(nx, ny) || 1;
        const ox = (nx / nl) * 0.04, oy = (ny / nl) * 0.04;
        for (let k = 0; k < ribs; k++) {
          if (damage >= 1 && hash01(s + sp * SEG, k, 7.7) < 0.12 * damage) continue;
          const za = ribZ(k), zb = ribZ(k + 1);
          const quad: Vec3[] = [[p0x, p0y + 0.1, za], [p0x, p0y + 0.1, zb], [p1x, p1y + 0.1, zb], [p1x, p1y + 0.1, za]];
          // (the corners run over the arch from its left springing: so they wind outward)
          sink.polygon(glazed ? 'glass' : 'roof', quad, { ...DECOR, ...(glazed ? { window: [0, 1, 0] as Vec3 } : {}) });
          // its underside, seen from the platforms: a skin 4 cm in from it, wound the other way
          sink.polygon(glazed ? 'glass' : 'roof', [...quad].reverse().map(([px, py, pz]): Vec3 => [px - ox, py - oy, pz]), DECOR);
        }
      }
      // the smoke-vent lantern along the crown: its dark louvred sides on short posts, its sheeted cap
      const lz0 = shed.z0 + 0.6, lz1 = shed.z1 - 0.6;
      sink.span('dark', cx - 0.7, crownY + 0.35, lz0, cx + 0.7, crownY + 0.95, lz1, DECOR);
      sink.span('roof', cx - 1.0, crownY + 0.95, lz0 - 0.2, cx + 1.0, crownY + 1.1, lz1 + 0.2, DECOR);
      for (let k = 0; k <= ribs; k++) {
        for (const side of [-1, 1]) sink.member('structureMetal', [cx + side * 0.6, crownY - 0.05, ribZ(k)], [cx + side * 0.6, crownY + 0.4, ribZ(k)], 0.1, 0.1, [0, 0, 1], { ...DECOR, colour: STEEL, exposed: true });
      }
      // the end screen at the open end: glazed (both faces) under the arch, its mullions radiating from the springing
      const sz = shed.z0 + 0.02;
      const screen: Vec3[] = pts.map(([x, y]): Vec3 => [x, y, sz]);
      if (damage < 2 || hash01(sp, width, 9.1) < 0.5) {
        sink.polygon('glass', screen, DECOR);
        sink.polygon('glass', [...screen].reverse().map(([x, y, z]): Vec3 => [x, y, z + 0.03]), DECOR);
      } else sink.polygon('dark', screen.map(([x, y, z]): Vec3 => [x, y, z + 0.02]), DECOR);
      for (let k = 1; k < SEG; k += 2) {
        sink.member('structureMetal', [cx, wallH, sz - 0.03], [pts[k][0], pts[k][1], sz - 0.03], 0.08, 0.06, [0, 0, -1], { ...DECOR, colour: STEEL, exposed: true });
      }
      sink.member('structureMetal', [pts[0][0], wallH, sz - 0.03], [pts[SEG][0], wallH, sz - 0.03], 0.3, 0.1, [0, 0, -1], { ...DECOR, colour: STEEL, exposed: true });
    }
    return sink.finish();
  };
}

/** A works chimney: a square plinth under a cornice, a tapering octagonal brick shaft, a sooted corbelled crown. */
function chimney(sink: PartSink, x: number, z: number, total: number): void {
  const base = 2.6, plinthH = 4.2;
  sink.span('stone', x - base / 2, -0.4, z - base / 2, x + base / 2, plinthH, z + base / 2);
  sink.band('stone', x - base / 2 - 0.12, plinthH, z - base / 2 - 0.12, x + base / 2 + 0.12, plinthH + 0.3, z + base / 2 + 0.12, DECOR);
  const r0 = base * 0.42, r1 = base * 0.26, shaft = total - plinthH - 1.4;
  sink.cylinder('stone', [x, plinthH + 0.3, z], 'y', shaft, r0, 8, {}, r1, true, Math.PI / 8);
  const crownY = plinthH + 0.3 + shaft;
  sink.cylinder('stone', [x, crownY, z], 'y', 0.5, r1 * 1.18, 8, { shade: 0.62 }, r1 * 1.25, true, Math.PI / 8);
  sink.cylinder('stone', [x, crownY + 0.5, z], 'y', 0.6, r1 * 1.1, 8, { shade: 0.45 }, r1 * 1.08, true, Math.PI / 8);
}

/** A circle's outline ((u, y) pairs, counter-clockwise). */
function circle(u: number, y: number, r: number, n: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; out.push([u + Math.cos(a) * r, y + Math.sin(a) * r]); }
  return out;
}

/**
 * A cathedral: the nave and its aisles under steep roofs, the transept, the apse, buttresses down the aisles, lancets
 * in the clerestory, a rose window between the two west towers, their spires; a crossing spire. Shelled: the nave roof
 * burnt to its rafters, a spire shot away.
 */
export function cathedral(opts: SkylineOptions & { roof?: 'slate' | 'copper' } = {}): RegionalBuilder {
  return (ctx) => {
    const sink = new PartSink(uvOffset(ctx));
    const rng = ctx.rng;
    const damage = damageOf(ctx, opts.damage);
    const plot = fit(ctx, 14, 30);
    const W = plot.x1 - plot.x0, cx = (plot.x0 + plot.x1) / 2;
    const stone: RegionalBucket = 'stone';
    const naveW = Math.min(11, W * 0.42), aisleW = Math.min(5, (W - naveW) / 2 - 0.2);
    const towerS = Math.min(8, W * 0.3), naveZ0 = plot.z0 + naveW * 0.55, naveZ1 = plot.z1 - towerS;
    const naveH = Math.min(24, 10 + naveW), aisleH = naveH * 0.45;
    const copper = opts.roof === 'copper' || (opts.roof === undefined && rng() < 0.35);
    const roofSpec = (): RoofSpec => ({ kind: 'gable', pitchDeg: 54, eave: 0.4, verge: 0.3, thickness: 0.2, bucket: copper ? 'structureMetal' : 'roof', ridge: null });
    const roofColour = copper ? COPPER : undefined;
    const nave = { x0: cx - naveW / 2, x1: cx + naveW / 2, z0: naveZ0, z1: naveZ1 };
    // the nave walls and the aisles
    sink.span(stone, nave.x0, -0.5, nave.z0, nave.x1, naveH, nave.z1);
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? nave.x0 - aisleW : nave.x1, x1 = side < 0 ? nave.x0 : nave.x1 + aisleW;
      sink.span(stone, x0, -0.5, nave.z0, x1, aisleH, nave.z1);
      // the aisle's lean-to roof
      const lean: RoofSpec = { kind: 'shed', pitchDeg: 28, eave: 0.3, verge: 0.2, thickness: 0.16, bucket: copper ? 'structureMetal' : 'roof' };
      const rg = roofGeometry(aisleW, nave.z1 - nave.z0, aisleH, lean);
      sink.placed(side < 0 ? 0 : Math.PI, (x0 + x1) / 2, 0, (nave.z0 + nave.z1) / 2, () => emitRoof(sink, rg, lean, roofColour));
      // buttresses between the bays and the lancets in the aisle walls and the clerestory
      const face: Face = { origin: [side < 0 ? x0 : x1, 0, (nave.z0 + nave.z1) / 2], u: [0, 0, side < 0 ? 1 : -1], out: [side, 0, 0], width: nave.z1 - nave.z0 };
      const clere: Face = { origin: [side < 0 ? nave.x0 : nave.x1, 0, (nave.z0 + nave.z1) / 2], u: [0, 0, side < 0 ? 1 : -1], out: [side, 0, 0], width: nave.z1 - nave.z0 };
      const bays = Math.max(3, Math.round((nave.z1 - nave.z0) / 4.4)), bw = (nave.z1 - nave.z0) / bays;
      for (let k = 0; k <= bays; k++) {
        const u = -face.width / 2 + k * bw;
        faceBox(sink, stone, face, u, aisleH * 0.45, 0.5, 0.7, aisleH * 0.9, 1.0, { ...DECOR, fineSides: true });
        // the flying buttress over the aisle roof to the clerestory
        sink.member(stone, facePoint(face, u, aisleH * 0.9, 0.6), facePoint(clere, u, naveH * 0.78, 0.1), 0.45, 0.6, face.u, { ...DECOR, exposed: true });
      }
      for (let k = 0; k < bays; k++) {
        const u = -face.width / 2 + (k + 0.5) * bw;
        lancet(sink, face, u, 1.6, Math.min(1.4, bw * 0.4), aisleH * 0.62, rng);
        lancet(sink, clere, u, aisleH + 1.4, Math.min(1.6, bw * 0.42), naveH - aisleH - 3.4, rng);
      }
    }
    // the nave roof (burnt to its rafters on a gutted cathedral) and the transept and apse
    const navePlace = () => {
      if (damage >= 2) {
        const rafters = Math.round((nave.z1 - nave.z0) / 1.2);
        const rg = roofGeometry(naveW, nave.z1 - nave.z0, naveH, roofSpec());
        for (let k = 0; k <= rafters; k++) {
          if (hash01(k, naveW, 3.1) < 0.3) continue;
          const z = -(nave.z1 - nave.z0) / 2 + (nave.z1 - nave.z0) * k / rafters;
          for (const side of [-1, 1]) sink.member('structureWood', [side * naveW / 2, naveH, z], [0, rg.ridgeY, z], 0.25, 0.25, [0, 0, 1], { ...DECOR, colour: CHAR, exposed: true });
        }
      } else emitRoof(sink, roofGeometry(naveW, nave.z1 - nave.z0, naveH, roofSpec()), roofSpec(), roofColour);
    };
    sink.placed(0, cx, 0, (nave.z0 + nave.z1) / 2, navePlace);
    const transZ = nave.z0 + (nave.z1 - nave.z0) * 0.22, transW = Math.min(W - 0.4, naveW + 2 * aisleW + 6), transD = naveW;
    sink.span(stone, cx - transW / 2, -0.5, transZ - transD / 2, cx + transW / 2, naveH, transZ + transD / 2);
    sink.placed(Math.PI / 2, cx, 0, transZ, () => emitRoof(sink, roofGeometry(transD, transW, naveH, roofSpec()), roofSpec(), roofColour));
    for (const side of [-1, 1]) {
      const tf: Face = { origin: [cx + side * transW / 2, 0, transZ], u: [0, 0, -side], out: [side, 0, 0], width: transD };
      const rose = circle(0, naveH * 0.62, Math.min(2.8, transD * 0.26), 16);
      faceSlab(sink, stone, tf, circle(0, naveH * 0.62, Math.min(2.8, transD * 0.26) + 0.35, 16), 0, 0.2);
      faceSlab(sink, 'glass', tf, rose, 0.2, 0.01, { window: tf.out });
    }
    // the apse: a half drum at the east end under a half cone
    const apseR = naveW / 2;
    sink.cylinder(stone, [cx, -0.5, nave.z0], 'y', naveH + 0.5, apseR, 10, {}, apseR, true, 0, Math.PI);
    sink.cylinder(copper ? 'structureMetal' : 'roof', [cx, naveH, nave.z0], 'y', apseR * 1.1, apseR + 0.3, 10, roofColour ? { colour: roofColour } : {}, 0.05, true, 0, Math.PI);
    // the west front: two towers either side of the nave's gable, the rose window between, the portal
    const wz0 = naveZ1, wz1 = plot.z1, towerH = naveH + 14;
    for (const side of [-1, 1]) {
      const tx = side < 0 ? Math.max(plot.x0 + towerS / 2, nave.x0 - towerS / 2 + 1) : Math.min(plot.x1 - towerS / 2, nave.x1 + towerS / 2 - 1);
      const t = { x0: tx - towerS / 2, x1: tx + towerS / 2, z0: wz0, z1: wz1 };
      sink.span(stone, t.x0, -0.5, t.z0, t.x1, towerH, t.z1);
      trimRing(sink, stone, t, naveH, [{ h: 0.2, out: 0.15 }, { h: 0.2, out: 0.3 }]);
      for (const face of rectFaces(t)) {
        lancet(sink, face, 0, towerH - 9, towerS * 0.24, 6.5, rng);
        lancet(sink, face, 0, naveH * 0.5, towerS * 0.2, 5, rng);
      }
      const shot = damage >= 1 && side > 0 && damage >= 2;
      if (!shot) {
        sink.cylinder(copper ? 'structureMetal' : 'roof', [tx, towerH, (t.z0 + t.z1) / 2], 'y', towerS * 2.4, towerS * 0.56, 8,
          roofColour ? { colour: roofColour } : {}, 0.05, true, Math.PI / 8);
      } else {
        sink.cylinder(copper ? 'structureMetal' : 'roof', [tx, towerH, (t.z0 + t.z1) / 2], 'y', towerS * 0.6, towerS * 0.56, 8,
          roofColour ? { colour: roofColour } : {}, towerS * 0.4, true, Math.PI / 8);
      }
      pinnacles(sink, t, towerH, 0.6, stone);
    }
    const west: Face = { origin: [cx, 0, wz1 - 0.6], u: [1, 0, 0], out: [0, 0, 1], width: naveW };
    sink.span(stone, nave.x0, -0.5, nave.z1 - 0.1, nave.x1, naveH, wz1 - 0.6);
    faceSlab(sink, stone, west, circle(0, naveH * 0.66, Math.min(3.4, naveW * 0.3) + 0.4, 18), 0, 0.25);
    if (damage < 2) faceSlab(sink, 'glass', west, circle(0, naveH * 0.66, Math.min(3.4, naveW * 0.3), 18), 0.25, 0.01, { window: [0, 0, 1] });
    else faceSlab(sink, 'dark', west, circle(0, naveH * 0.66, Math.min(3.4, naveW * 0.3), 18), 0.25, 0.01);
    for (let k = 0; k < 8; k++) {
      const a = Math.PI * 2 * k / 8, rr = Math.min(3.4, naveW * 0.3);
      sink.member(stone, facePoint(west, 0, naveH * 0.66, 0.28), facePoint(west, Math.cos(a) * rr, naveH * 0.66 + Math.sin(a) * rr, 0.28), 0.14, 0.1, [0, 0, 1],
        { ...DECOR, fine: true });
    }
    const portal: Array<[number, number]> = [[-2.2, 0], [2.2, 0]];
    for (let k = 0; k <= 10; k++) { const a = Math.PI * k / 10; portal.push([Math.cos(a) * 2.2, 5.5 + Math.sin(a) * 2.6]); }
    faceSlab(sink, stone, west, portal.map(([u, y]): [number, number] => [u * 1.35, y * 1.12]), 0, 0.4);
    faceSlab(sink, 'dark', west, portal, 0.4, 0.01);
    // the crossing spire over the transept
    if (damage < 3) spire(sink, cx, transZ, naveH + rg0(naveW), naveW * 0.22, naveH * 0.9, copper ? COPPER : rgb(0x3f4448), null);
    return sink.finish();
  };
}

/** A gable roof's rise over a span at the cathedral's pitch (54°). */
function rg0(span: number): number {
  return span / 2 * Math.tan(54 * Math.PI / 180);
}

/** A lancet: a tall pointed window (its glass on a dark reveal), a hood moulding over it, tracery bars (fine). */
function lancet(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, rng: () => number): void {
  const pts: Array<[number, number]> = [[u - w / 2, y], [u + w / 2, y], [u + w / 2, y + h - w * 0.75]];
  for (let k = 1; k < 6; k++) { const t = k / 6; pts.push([u + w / 2 * Math.cos(t * Math.PI / 2) , y + h - w * 0.75 + w * 0.75 * Math.sin(t * Math.PI / 2)]); }
  pts.push([u, y + h]);
  for (let k = 5; k >= 1; k--) { const t = k / 6; pts.push([u - w / 2 * Math.cos(t * Math.PI / 2), y + h - w * 0.75 + w * 0.75 * Math.sin(t * Math.PI / 2)]); }
  pts.push([u - w / 2, y + h - w * 0.75]);
  faceSlab(sink, 'dark', face, pts, 0, 0.01);
  faceSlab(sink, paneBucket(rng, 0.25), face, pts.map(([pu, py]): [number, number] => [u + (pu - u) * 0.86, py < y + 0.1 ? y + 0.12 : py - 0.08]), 0.01, 0.01, { window: face.out });
  facePanel(sink, 'structureMetal', face, u, y + h / 2, 0.03, 0.05, h * 0.9, { ...DECOR, colour: rgb(0x3a3a36), fine: true });
}

/**
 * The skyline kit bound to the generic city structures a plan places (structureKit.ts: the megatower, the arcology, the
 * needle tower, the terrace tower, the parking deck, the civic hall): a city kit spreads it into its builders map,
 * `builders: { ...SKYLINE_CITY, ...its own }`, and each of those plan entries is rebuilt in place — its plot, its door
 * side and every placement on the map kept, its collision derived from the new structure (regenerate the map's shard).
 * A kit binds other options the same way (`megatower: decoTower({ crown: 'pyramid' })`).
 */
export const SKYLINE_CITY: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  megatower: decoTower(),
  arcology: curtainTower(),
  needletower: stalinistTower(),
  terracetower: modernSlab({ loggias: true }),
  parkingdeck: modernSlab({ loggias: false }),
  civichall: stationHall(),
});

/** Every skyline builder by the name a kit's builders map can give it (a kit binds its own options). */
export const SKYLINE_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  decotower: decoTower(),
  curtaintower: curtainTower(),
  slab: modernSlab(),
  stalinist: stalinistTower(),
  hall: industrialHall(),
  gasholder: gasHolder(),
  station: stationHall(),
  cathedral: cathedral(),
});


