// src/world/maps/reedBeds.ts — the reeds of each water's region (Lane C, #16 r2, 2026-10-14).
//
// The census graded site:river-bank-reeds 0: every bank and lake shore, from the Bengal chars to a frozen Alpine tarn,
// grew the same clump of bare tapered culms. The culms stay (their seats, their draws, their contact receipts are the
// kit's: riverReedContact.selftest), and each region dresses them from their own geometry — no draw, no ground query:
//   phragmites  (Amberford, Saltwind): the common reed's drooping purple-brown panicle on each tall culm, two leaf blades
//               raked off every culm;
//   kash        (the Jamuna chars, Delta): kash grass's white silky plume on the tall culms and on some short ones,
//               narrow green blades;
//   nipa        (Ca Mau, Mangrove): a nipa palm's fronds rising from the mud at the clump's tall culms, arching over
//               with their leaflets, the culms left as the sedge round them;
//   frost       (Winter, Alpine, Whiteout): frost-killed stalks keep the snow on their heads and a drift at their feet.
// Vertex-coloured into the baked bucket (no draw). A kit without a baked bucket keeps the bare culms.
import * as THREE from 'three';

type BG = THREE.BufferGeometry;
export type ReedForm = 'phragmites' | 'kash' | 'nipa' | 'frost';

export function reedFormForMap(mapId: string): ReedForm {
  switch (mapId) {
    case 'delta': return 'kash';
    case 'mangrove': return 'nipa';
    case 'winter': case 'alpine': case 'whiteout': return 'frost';
    default: return 'phragmites';
  }
}

const _c = new THREE.Color();
function rgb(hex: number): [number, number, number] { _c.setHex(hex); return [_c.r, _c.g, _c.b]; }
const PANICLE = rgb(0x5f4a45), PANICLE_TIP = rgb(0x8a7563), BLADE_AUTUMN = rgb(0x9a8a5c), BLADE_GREEN = rgb(0x5d7040),
  KASH = rgb(0xe9e6dc), NIPA = rgb(0x4a6532), NIPA_DRY = rgb(0x7d7448), SNOW = rgb(0xf1f3f6);

function hash(i: number, salt: number): number {
  let h = Math.imul((i * 7919 + salt) ^ 0x9e3779b9, 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A small indexed mesh from flat lists (positions, triangles), painted per vertex by `tone(i)`. */
class Sheet {
  readonly p: number[] = [];
  readonly c: number[] = [];
  readonly i: number[] = [];
  /** Vertices of two-sided pieces: lit as if they faced the sky (their two windings' normals would cancel). */
  readonly up = new Set<number>();
  vertex(x: number, y: number, z: number, tone: readonly number[], up = false): number {
    this.p.push(x, y, z); this.c.push(tone[0], tone[1], tone[2]);
    const index = this.p.length / 3 - 1;
    if (up) this.up.add(index);
    return index;
  }
  /** A two-sided triangle (both windings: a blade is seen from both faces). */
  tri2(a: number, b: number, c: number): void { this.i.push(a, b, c, a, c, b); }
  tri(a: number, b: number, c: number): void { this.i.push(a, b, c); }
  build(): BG | null {
    if (!this.i.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((this.p.length / 3) * 2).fill(0), 2));
    g.setIndex(this.i);
    g.computeVertexNormals();
    const n = g.attributes.normal;
    for (const index of this.up) n.setXYZ(index, 0, 1, 0);
    return g;
  }
}

interface Culm { base: THREE.Vector3; tip: THREE.Vector3; height: number; tall: boolean }

/** The culms the kit just laid (their root ring's centre and their tip), from the stems pushed since `from`. */
function culmsSince(straw: readonly BG[], from: number): Culm[] {
  const out: Culm[] = [];
  for (let k = from; k < straw.length; k++) {
    const g = straw[k];
    if (g.name !== 'winter-reed') continue;
    const p = g.attributes.position;
    const base = new THREE.Vector3();
    for (let i = 0; i < 4; i++) base.add(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)));
    base.multiplyScalar(0.25);
    const tip = new THREE.Vector3(p.getX(10), p.getY(10), p.getZ(10));
    const height = tip.y - base.y;
    out.push({ base, tip, height, tall: out.length < 3 });
  }
  return out;
}

/** A drooping spindle (a panicle or a plume) hung from the culm's tip, `len` long, leaning off along (lx, lz). */
function spindle(s: Sheet, tip: THREE.Vector3, lx: number, lz: number, len: number, fat: number, droop: number, tone: readonly number[], toneTip: readonly number[]): void {
  const n = Math.hypot(lx, lz) || 1, ux = lx / n, uz = lz / n;
  const rings = 4, sides = 4;
  const centre = (t: number) => new THREE.Vector3(tip.x + ux * len * 0.35 * t, tip.y + len * (0.15 * t) - droop * len * t * t, tip.z + uz * len * 0.35 * t);
  const first = s.p.length / 3;
  for (let r = 0; r <= rings; r++) {
    const t = r / rings, c = centre(t), rad = fat * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05));
    const tone2 = r === rings ? toneTip : tone;
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      s.vertex(c.x + Math.cos(a) * rad * -uz + 0, c.y + Math.sin(a) * rad, c.z + Math.cos(a) * rad * ux, tone2);
    }
  }
  for (let r = 0; r < rings; r++) for (let k = 0; k < sides; k++) {
    const a = first + r * sides + k, b = first + r * sides + ((k + 1) % sides), c = a + sides, d = b + sides;
    s.tri(a, c, b); s.tri(b, c, d);
  }
}

/** A leaf blade off a culm at height share `at`, raked out along (dx, dz) and arching down. */
function blade(s: Sheet, c: Culm, at: number, dx: number, dz: number, len: number, wide: number, tone: readonly number[]): void {
  const o = c.base.clone().lerp(c.tip, at);
  const n = Math.hypot(dx, dz) || 1, ux = dx / n, uz = dz / n;
  // three stations along the blade, the width across it (horizontal, square to its run), tapering to a point
  const st = [0, 0.5, 1].map((t) => new THREE.Vector3(o.x + ux * len * t, o.y + len * (0.55 * t - 0.6 * t * t), o.z + uz * len * t));
  const w = [wide, wide * 0.7, 0];
  const v = st.map((p, k) => [s.vertex(p.x - uz * w[k], p.y, p.z + ux * w[k], tone, true), s.vertex(p.x + uz * w[k], p.y, p.z - ux * w[k], tone, true)]);
  s.tri2(v[0][0], v[1][0], v[0][1]); s.tri2(v[0][1], v[1][0], v[1][1]);
  s.tri2(v[1][0], v[2][0], v[1][1]);
}

/** A nipa frond rising from (x, y, z) toward azimuth `az`: the rachis arching up and over, leaflets either side. */
function frond(s: Sheet, base: THREE.Vector3, az: number, len: number, salt: number): void {
  const ux = Math.cos(az), uz = Math.sin(az);
  const stations = 7;
  const at = (t: number) => new THREE.Vector3(base.x + ux * len * 0.75 * t, base.y + len * (0.95 * t - 0.62 * t * t), base.z + uz * len * 0.75 * t);
  const ribL: number[] = [], ribR: number[] = [];
  for (let k = 0; k <= stations; k++) {
    const t = k / stations, p = at(t);
    // the leaflets: a swept pair at each station (longest mid-frond), drooping, dry at the tips of the old fronds
    const leaf = len * 0.28 * Math.sin(Math.PI * Math.min(1, 0.15 + t)) * (k === 0 ? 0 : 1);
    const tone = hash(k, salt) > 0.82 ? NIPA_DRY : NIPA;
    const sx = -uz, sz = ux;
    ribL.push(s.vertex(p.x + sx * leaf + ux * leaf * 0.35, p.y - leaf * 0.45, p.z + sz * leaf + uz * leaf * 0.35, tone, true));
    ribR.push(s.vertex(p.x - sx * leaf + ux * leaf * 0.35, p.y - leaf * 0.45, p.z - sz * leaf + uz * leaf * 0.35, tone, true));
    const mid = s.vertex(p.x, p.y + 0.02, p.z, NIPA, true);
    if (k > 0) {
      const prevMid = mid - 3; // (the previous station's mid vertex: three vertices per station)
      s.tri2(prevMid, mid, ribL[k]); s.tri2(prevMid, ribL[k - 1], ribL[k]);
      s.tri2(prevMid, ribR[k], mid); s.tri2(prevMid, ribR[k - 1], ribR[k]);
    }
  }
}

/** A frost-killed culm's snow: a cap on its tip (an octahedron flattened over it) and, once a clump, a drift at its
 *  feet round the culms' roots. */
function snowCap(s: Sheet, tip: THREE.Vector3, r: number): void {
  const t = s.vertex(tip.x, tip.y + r * 0.9, tip.z, SNOW), b = s.vertex(tip.x, tip.y - r * 0.4, tip.z, SNOW);
  const ring = [0, 1, 2, 3].map((k) => s.vertex(tip.x + Math.cos(k * Math.PI / 2) * r, tip.y + r * 0.15, tip.z + Math.sin(k * Math.PI / 2) * r, SNOW));
  for (let k = 0; k < 4; k++) { s.tri(t, ring[(k + 1) % 4], ring[k]); s.tri(b, ring[k], ring[(k + 1) % 4]); }
}
function snowDrift(s: Sheet, culms: readonly Culm[]): void {
  let x = 0, y = Infinity, z = 0;
  for (const c of culms) { x += c.base.x / culms.length; z += c.base.z / culms.length; y = Math.min(y, c.base.y); }
  const sides = 8, R = 0.75, top = s.vertex(x, y + 0.2, z, SNOW), ring: number[] = [];
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2, rr = R * (0.8 + 0.4 * hash(k, Math.round(x * 10)));
    ring.push(s.vertex(x + Math.cos(a) * rr, y + 0.02, z + Math.sin(a) * rr, SNOW));
  }
  for (let k = 0; k < sides; k++) s.tri(top, ring[(k + 1) % sides], ring[k]);
}

/**
 * Dress the culms the kit pushed into `straw` since `from` (one clump) in the region's form; the pieces go into `baked`
 * as one geometry. No draws, no ground queries: everything is read off the culms.
 */
export function dressReedClump(form: ReedForm, straw: readonly BG[], from: number, baked: BG[] | undefined): void {
  if (!baked) return;
  const culms = culmsSince(straw, from);
  if (!culms.length) return;
  const salt = Math.round(culms[0].base.x * 31 + culms[0].base.z * 17);
  const s = new Sheet();
  culms.forEach((c, k) => {
    const lean = Math.atan2(c.tip.z - c.base.z, c.tip.x - c.base.x) + (hash(k, salt) - 0.5);
    const lx = Math.cos(lean), lz = Math.sin(lean);
    if (form === 'phragmites') {
      if (c.tall) spindle(s, c.tip, lx, lz, 0.32, 0.05, 0.55, PANICLE, PANICLE_TIP);
      for (const side of [0, 1]) {
        const a = lean + (side ? 2.1 : -2.3) + hash(k + 11 * side, salt);
        blade(s, c, 0.35 + 0.3 * hash(k + 5 + side, salt), Math.cos(a), Math.sin(a), c.height * 0.38, 0.012, BLADE_AUTUMN);
      }
    } else if (form === 'kash') {
      if (c.tall || hash(k, salt + 3) < 0.35) spindle(s, c.tip, lx, lz, 0.42, 0.07, 0.35, KASH, KASH);
      const a = lean + 2.4 + hash(k + 21, salt);
      blade(s, c, 0.3, Math.cos(a), Math.sin(a), c.height * 0.45, 0.008, BLADE_GREEN);
    } else if (form === 'nipa') {
      if (c.tall) frond(s, c.base, lean + (k - 1) * 2.1, 2.4 + c.height * 1.1, salt + k);
    } else {
      if (c.tall) snowCap(s, c.tip, 0.035);
    }
  });
  if (form === 'frost') snowDrift(s, culms);
  const g = s.build();
  if (!g) return;
  g.name = `reed-dressing-${form}`;
  g.userData.reeds = form;
  baked.push(g);
}
