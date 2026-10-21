// src/world/jebelSkin.ts — a jebel's jointed face (the maps lane, 2026-10-14; MA.12, the owner: Redrock "looks really
// bad"). Wadi Rum's sandstone stands in sheer walls split by vertical joints into rounded columns, each column a little
// proud of its neighbours' clefts, the beds faint across them, desert varnish streaming down from the ledges, the
// columns ending in the domes of the cap. The height field draws a dome's wall as one smooth sheet (its shader paints
// flutes on it); a height field cannot hold a column, a cleft or an overhang. This skin is drawn over the wall instead:
// for each ray out of the dome, the wall is where the ground falls steeper than `minGrade`, and between rays the skin
// follows the wall at every height, pushed out by its column's bulge (zero in the joints, so the clefts are the wall
// itself), with the beds' faint grooves and a fine fluting, tapering into the ground at the foot and into the cap at the
// shoulder. The skin is a mesh no hull reaches and no shell stops (the ground under it is the hill): it publishes no
// mass. Earlier, a bedded skin (sceneryRocks.ts buildBedrock: level beds stepping up the wall) read as masonry, "a
// ziggurat" (gauntlet wave 16); here the beds are grooves and the joints carry the form.
import * as THREE from 'three';
import type { SimplexNoise } from '../engine/simplexFast.ts';

interface JebelSkinSpec {
  /** The dome's centre (the search starts at its highest ground within half the radius). */
  x: number;
  z: number;
  /** How far out the rays look (m). */
  radius: number;
  /** The sandstone's colour, sRGB HSL. */
  tone: readonly [number, number, number];
  /** A wall is where the ground falls steeper than this (rise over run; 1.1 is about 48 degrees). */
  minGrade?: number;
  /** The columns' widths along the wall (m). */
  columnM?: readonly [number, number];
  /** How far a column's middle stands proud of its joints (m). */
  bulgeM?: number;
}

interface JebelSkinGround {
  getHeightAt(x: number, z: number): number;
  getHeightAtFast?(x: number, z: number): number;
}

interface JebelSkinBuild {
  geometry: THREE.BufferGeometry | null;
  triangles: number;
  /** The wall's rays that carry skin, of all rays. */
  rays: { walled: number; total: number };
  /** Each ray's wall top and foot as the skin draws them (NaN: no wall on that ray), round the dome counter-clockwise. */
  wall: { top: Float32Array; foot: Float32Array };
}

const _c = new THREE.Color();
const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const smooth = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function buildJebelSkin(spec: JebelSkinSpec, ground: JebelSkinGround, noise: SimplexNoise, rng: () => number,
  { mobile = false }: { mobile?: boolean } = {}): JebelSkinBuild {
  const minGrade = spec.minGrade ?? 1.1;
  const [colMin, colMax] = spec.columnM ?? [3.5, 8];
  const bulgeM = spec.bulgeM ?? 0.75;
  const step = 0.75, steps = Math.max(8, Math.ceil(spec.radius / step));
  const groundAt = ground.getHeightAtFast ? (x: number, z: number) => ground.getHeightAtFast!(x, z) : (x: number, z: number) => ground.getHeightAt(x, z);
  const rays = clamp(Math.round((Math.PI * 2 * spec.radius * 0.6) / (mobile ? 1.6 : 0.8)), 96, mobile ? 240 : 520);
  const stride = steps + 1, H = new Float32Array(rays * stride);
  for (let j = 0; j < rays; j++) {
    const a = (j / rays) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    for (let k = 0; k <= steps; k++) H[j * stride + k] = groundAt(spec.x + c * k * step, spec.z + s * k * step);
  }
  // per ray: the wall's top and foot (the outermost run of ground steeper than minGrade beyond the crest)
  const top = new Float32Array(rays).fill(NaN), foot = new Float32Array(rays).fill(NaN);
  const crest = new Int32Array(rays);
  for (let j = 0; j < rays; j++) {
    const row = j * stride;
    let best = 0;
    for (let k = 1; k <= steps * 0.5; k++) if (H[row + k] > H[row + best]) best = k;
    crest[j] = best;
    const grade = (k: number) => (H[row + k - 1] - H[row + k + 1]) / (2 * step);
    let kTop = -1, kFoot = -1;
    for (let k = best + 1; k < steps; k++) {
      if (grade(k) > minGrade) { if (kTop < 0) kTop = k; kFoot = k; }
      else if (kTop >= 0 && grade(k) < minGrade * 0.55 && k - kFoot > 2) break;
    }
    if (kTop < 0 || H[row + kTop] - H[row + kFoot] < 3) continue;
    top[j] = H[row + Math.max(best, kTop - 1)];
    foot[j] = H[row + Math.min(steps, kFoot + 1)];
  }
  // the clefts: a ray down a joint the height field cuts (the inselberg's V-cut flutes) falls gentler than the wall
  // either side of it; a gap of up to a dozen rays between walled rays takes their top and foot, so the skin runs on
  // across the cleft (its columns and joints are the skin's own)
  for (let j = 0; j < rays; j++) {
    if (Number.isFinite(top[j])) continue;
    let a = -1, b = -1;
    for (let d = 1; d <= 12 && a < 0; d++) if (Number.isFinite(top[(j - d + rays) % rays])) a = (j - d + rays) % rays;
    for (let d = 1; d <= 12 && b < 0; d++) if (Number.isFinite(top[(j + d) % rays])) b = (j + d) % rays;
    if (a < 0 || b < 0) continue;
    const da = (j - a + rays) % rays, db = (b - j + rays) % rays;
    if (da + db > 13) continue;
    const t = da / (da + db);
    const tp = top[a] + (top[b] - top[a]) * t, ft = foot[a] + (foot[b] - foot[a]) * t;
    if (!(H[j * stride + crest[j]] > tp)) continue;
    // (only where the ground falls the wall's height within a cleft's run, never over a sand ramp)
    const row = j * stride;
    let kt = -1, kf = -1;
    for (let k = crest[j] + 1; k <= steps; k++) { if (kt < 0 && H[row + k] <= tp) kt = k; if (H[row + k] <= ft) { kf = k; break; } }
    if (kt < 0 || kf < 0 || (kf - kt) * step > (tp - ft) / 0.6) continue;
    top[j] = tp; foot[j] = ft;
  }
  // (the blind critics, 2026-10-15, second pass: "from 45 m up the near dome's face splits into thin vertical sliver fins",
  // "a dark blotchy eye") each ray's wall top is where its own ground stops falling steeply, so neighbouring rays ended
  // metres apart and the skin's columns stood as a staircase of fins along the shoulder, the slots between their ends
  // open into the shade behind. The wall is regularised round the dome: a run of walled rays too short to carry a column
  // is dropped (it stood as a lone fin, capped both sides); along each run the top takes the least top within W_SM rays,
  // then the mean of those (so it never rises past a ray's own wall top), and the foot the mean of its neighbours' (within
  // 2 m of its own).
  {
    const MIN_RUN = 10, W_SM = 7;
    const isWalled = (j: number): boolean => Number.isFinite(top[j]);
    let start = -1;
    for (let j = 0; j < rays; j++) if (!isWalled(j) && isWalled((j + 1) % rays)) { start = (j + 1) % rays; break; }
    // the runs, each a list of consecutive walled rays (the whole ring when no ray is bare)
    const runs: number[][] = [];
    if (start < 0) { if (isWalled(0)) runs.push(Array.from({ length: rays }, (_, j) => j)); }
    else {
      let cur: number[] = [];
      for (let d = 0; d < rays; d++) {
        const j = (start + d) % rays;
        if (isWalled(j)) cur.push(j); else if (cur.length) { runs.push(cur); cur = []; }
      }
      if (cur.length) runs.push(cur);
    }
    const ring = start < 0;
    for (const run of runs) {
      if (run.length < MIN_RUN) { for (const j of run) { top[j] = NaN; foot[j] = NaN; } continue; }
      const n = run.length, at = (i: number): number => (ring ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i)));
      const lowTop = run.map((_, i) => { let m = Infinity; for (let d = -W_SM; d <= W_SM; d++) m = Math.min(m, top[run[at(i + d)]]); return m; });
      const t2 = run.map((_, i) => { let a = 0; for (let d = -W_SM; d <= W_SM; d++) a += lowTop[at(i + d)]; return a / (2 * W_SM + 1); });
      const f2 = run.map((_, i) => { let a = 0; for (let d = -W_SM; d <= W_SM; d++) a += foot[run[at(i + d)]]; return a / (2 * W_SM + 1); });
      // (a wall kept at least 3 m high: a ray the smoothing would leave shorter takes its foot lower, into the talus, so the
      // run stays whole and opens no new slot)
      run.forEach((j, i) => {
        const tp = Math.min(t2[i], top[j]);
        top[j] = tp; foot[j] = Math.min(Math.max(f2[i], foot[j] - 2), tp - 3);
      });
    }
  }
  // (MAPS 227, the same critics' fins) the smoothing above held a foot within 3 m of its top and spread the neighbours'
  // feet, among them the rays whose wall the search had found on a boss of the cap (their feet 27 m up), and the search
  // itself stopped at the first ledge of the dome's bedding tiers: on 86 of the west lane dome's 273 rays the skin ended
  // more than 3 m over the ground where the wall levels out (up to 12 m), a band of columns hung from the shoulder over
  // the bare wall, its lip zig-zagging ray to ray. Each ray's foot now comes down its own wall, over its ledges, to the
  // last steep step before the ground levels out for good (the talus, the apron or a sand ramp) or rises again (the lobe
  // past a saddle), where the skin runs on into the ground; a foot only ever comes down there. And it never stands under
  // the lowest ground between the wall's top and that step: a ray whose wall falls into a saddle had its foot set under
  // the saddle's floor by its neighbours, and its ground falling through that height only past the lobe threw the
  // skin's foot 48 m out, a sliver across the saddle (178 vertices stood 8-30 m past their ray's wall, edges to 27 m).
  for (let j = 0; j < rays; j++) {
    if (!Number.isFinite(top[j])) continue;
    const row = j * stride, steep = minGrade * 0.8;
    let k = crest[j] + 1;
    while (k < steps && H[row + k] > top[j]) k++;
    let low = Infinity, kLast = -1;
    for (k = Math.max(k, 1); k < steps; k++) {
      if (H[row + k] > low + 2) break;
      low = Math.min(low, H[row + k]);
      if ((H[row + k - 1] - H[row + k + 1]) / (2 * step) > steep) kLast = k;
    }
    if (kLast >= 0) {
      const ground = H[row + Math.min(steps, kLast + 1)];
      if (ground < foot[j]) foot[j] = Math.max(ground, top[j] - 60);
    }
    if (low < Infinity) foot[j] = Math.min(Math.max(foot[j], low + 0.05), top[j] - 3);
  }
  // the narrow slots left (a gully a few rays wide the cleft rule turned down: its ground falls as a ramp) bridged: the
  // skin runs across on the radii of the walls either side, so no capped slot opens into the shade behind (the critics'
  // "dark eye"); `across[j]` holds the two walled rays and the share between them
  const across: Array<[number, number, number] | null> = new Array(rays).fill(null);
  for (let j = 0; j < rays; j++) {
    if (Number.isFinite(top[j])) continue;
    let a = -1, b = -1;
    for (let d = 1; d <= 4 && a < 0; d++) if (Number.isFinite(top[(j - d + rays) % rays]) && !across[(j - d + rays) % rays]) a = (j - d + rays) % rays;
    for (let d = 1; d <= 4 && b < 0; d++) if (Number.isFinite(top[(j + d) % rays])) b = (j + d) % rays;
    if (a < 0 || b < 0) continue;
    const da = (j - a + rays) % rays, db = (b - j + rays) % rays;
    if (da + db > 5) continue;
    const t = da / (da + db);
    across[j] = [a, b, t];
  }
  for (let j = 0; j < rays; j++) {
    const x = across[j];
    if (!x) continue;
    top[j] = Math.min(top[x[0]], top[x[1]]); foot[j] = Math.max(foot[x[0]], foot[x[1]]);
  }
  /** The radius on ray j where its ground falls through y between its crest and its foot (NaN: none). */
  const edge = (j: number, y: number): number => {
    const row = j * stride;
    for (let k = crest[j] + 1; k <= steps; k++) {
      if (H[row + k] <= y) { const h0 = H[row + k - 1], h1 = H[row + k]; return (k - 1 + (h0 - y) / Math.max(1e-6, h0 - h1)) * step; }
    }
    return NaN;
  };
  // the joints: along the wall's middle radius, a column every colMin..colMax metres, each with its own depth and tone
  let walled = 0, rRef = 0;
  for (let j = 0; j < rays; j++) if (Number.isFinite(top[j])) { walled++; rRef += edge(j, (top[j] + foot[j]) / 2) || 0; }
  if (walled < 6) return { geometry: null, triangles: 0, rays: { walled, total: rays }, wall: { top, foot } };
  rRef /= walled;
  const circ = Math.PI * 2 * Math.max(4, rRef);
  const joints: number[] = [0];
  while (joints[joints.length - 1] < circ - colMin) joints.push(joints[joints.length - 1] + colMin + rng() * (colMax - colMin));
  joints[joints.length - 1] = circ;
  const colDepth = joints.map(() => 0.55 + rng() * 0.65), colTone = joints.map(() => 0.93 + rng() * 0.14);
  const colStreak = joints.map(() => rng());
  const column = (j: number): { c: number; f: number } => {
    const s = (j / rays) * circ;
    let c = 0;
    while (c < joints.length - 2 && joints[c + 1] <= s) c++;
    return { c, f: (s - joints[c]) / Math.max(1e-6, joints[c + 1] - joints[c]) };
  };
  // the beds: faint grooves at their own spacing up the wall
  let yLo = Infinity, yHi = -Infinity;
  for (let j = 0; j < rays; j++) if (Number.isFinite(top[j])) { yLo = Math.min(yLo, foot[j]); yHi = Math.max(yHi, top[j]); }
  const beds: number[] = [];
  for (let y = yLo + 1 + rng() * 2; y < yHi; y += 1.8 + rng() * 3.2) beds.push(y);
  const bedGroove = (y: number): number => { let g = 0; for (const b of beds) g = Math.max(g, 1 - Math.abs(y - b) / 0.35); return Math.max(0, g); };
  const dy = mobile ? 1.6 : 0.85;
  const [bh, bs, bl] = spec.tone;
  const pos: number[] = [], col: number[] = [], gr: number[] = [];
  // The skin stands STAND_OFF proud of the wall everywhere (a terrain mesh's facets on a 60-degree wall stray half a metre
  // and more from the true ground, so a joint drawn on the wall itself flickered through it), the columns' middles further;
  // below the wall's foot it runs down into the talus, and over the top it rounds in over the shoulder: the dome's cap.
  const STAND_OFF = 0.7, SINK = 1.2, SHOULDER = 1.0;
  // (MAPS 227, the blind critics on Redrock v2, pair 4: "from 45 m up the near dome's face splits into thin vertical sliver
  // fins", still there after the tops were regularised) the skin took each ray's wall where its own ground fell, so it ran
  // down into every V-cut the height field draws for the domes the shader alone paints (the inselberg's fifteen jointed
  // flutes and eight gullies): some fifteen slots a few rays wide and up to 6 m deep round the west lane dome, the faces
  // between them standing as fins with their shade in the slot. The skin carries its own joints, so it closes over those
  // cuts: at each height the wall's radius round the dome is closed across a few rays (for each ray, the least over the
  // window of the most within W_CL rays, counting only the walls within FILL_MAX of its own — a farther one is another
  // rock, the lobe's far side past a saddle), which fills a slot narrower than the window and keeps every broader turn of
  // the wall; in a filled slot the skin keeps a joint's recess (at most JOINT m), and over the shoulder it tucks in as far
  // again as the slot cut back, so its edge still meets the cap behind the slot. The fill is tabled every DYT m up the
  // wall and added to the ray's own wall (edge), so a level where a ray's ground jumps never smears into its neighbours.
  const W_CL = 4, JOINT = 0.8, FILL_MAX = 7, DYT = 0.25;
  const yT0 = yLo - SINK - 1, nT = Math.max(2, Math.ceil((yHi + SHOULDER + 1 - yT0) / DYT) + 1);
  const wallFill = new Float32Array(rays * nT);
  {
    const raw = new Float32Array(rays * nT);
    for (let j = 0; j < rays; j++) for (let i = 0; i < nT; i++) raw[j * nT + i] = edge(j, yT0 + i * DYT);
    for (let i = 0; i < nT; i++) {
      for (let j = 0; j < rays; j++) {
        const own = raw[j * nT + i];
        if (!Number.isFinite(own)) continue;
        let closed = Infinity;
        for (let d = -W_CL; d <= W_CL; d++) {
          let m = -Infinity;
          for (let e = -W_CL; e <= W_CL; e++) {
            const v = raw[((j + d + e + 2 * rays) % rays) * nT + i];
            if (v > m && v <= own + FILL_MAX) m = v;
          }
          if (m > -Infinity && m < closed) closed = m;
        }
        if (closed > own && closed < Infinity) wallFill[j * nT + i] = closed - own - Math.min(JOINT, closed - own);
      }
    }
  }
  /** How far the skin's wall stands out over ray j's own at height y (a filled slot), between the table's levels. */
  const fillAt = (j: number, y: number): number => {
    const t = clamp((y - yT0) / DYT, 0, nT - 1.001), i = Math.floor(t), f = t - i;
    return wallFill[j * nT + i] * (1 - f) + wallFill[j * nT + i + 1] * f;
  };
  const vertex = (j: number, y: number, inset = false): [number, number, number, number, number, number, number] | null => {
    if (!Number.isFinite(top[j])) return null;
    const yy = clamp(y, foot[j] - SINK, top[j] + SHOULDER);
    const yr = clamp(yy, foot[j], top[j]);
    const bridge = across[j];
    let r = bridge ? (edge(bridge[0], yr) + fillAt(bridge[0], yr)) * (1 - bridge[2]) + (edge(bridge[1], yr) + fillAt(bridge[1], yr)) * bridge[2]
      : edge(j, yr) + fillAt(j, yr);
    if (!Number.isFinite(r)) return null;
    const over = Math.max(0, yy - top[j]) / SHOULDER;
    if (yy < foot[j]) r += (foot[j] - yy) * 0.8;
    // (a filled slot: the shoulder tucks back as far as the slot cut in at the wall's top)
    else if (over > 0) r -= over * (2.2 + (bridge ? 0 : fillAt(j, top[j])));
    const a = (j / rays) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const { c, f } = column(j);
    const round = Math.pow(Math.sin(Math.PI * f), 0.55);
    const flute = noise.noise(j * 0.9 + c * 13.1, yy * 0.12) * 0.12;
    const shoulder = 1 - over * over;
    // (the blind critics, 2026-10-15: "from 45 m the dome splinters into shards") over the shoulder the skin tucks in
    // under the dome's cap (its edge 0.35 m inside the ground), so no edge of it stands against the sky; an end cap's
    // inner edge (inset) stands 0.35 m inside the wall
    const off = inset ? -0.35 : (STAND_OFF + bulgeM * colDepth[c] * round - 0.16 * bedGroove(yy) + flute) * shoulder - 0.35 * over;
    const x = spec.x + ca * (r + off), z = spec.z + sa * (r + off);
    // tone: the column's own, darker in the joints and the beds, desert varnish streaming down a third of the columns
    // from their tops, paler on the shoulders, darker at the contact with the sand
    let l = bl * colTone[c] * (0.78 + 0.22 * round) * (1 - 0.12 * bedGroove(yy));
    const streak = colStreak[c] < 0.35 ? smooth(0.2, 0.75, Math.sin(Math.PI * f * 3 + c) * 0.5 + 0.5) * smooth(foot[j], top[j], yy) : 0;
    l *= 1 - 0.32 * streak;
    l *= 1 + 0.12 * smooth(top[j] - 3, top[j] + SHOULDER, yy);
    l *= 0.8 + 0.2 * smooth(foot[j] - SINK, foot[j] + 1.5, yy);
    l *= 1 + noise.noise3d(x * 0.4, yy * 0.4, z * 0.4) * 0.05;
    _c.setHSL(((bh + (streak > 0 ? -0.006 : 0)) % 1 + 1) % 1, clamp(bs * (1 - 0.25 * streak), 0, 1), clamp(l, 0, 1), THREE.SRGBColorSpace);
    return [x, yy, z, _c.r, _c.g, _c.b, foot[j]];
  };
  // (the blind critics, 2026-10-15: "stretched vertical UV streaks", "low-poly flat facets", "a hard black slot") every
  // vertex carries the skin's own smooth normal (the surface's tangents up the wall and round the dome, by differences),
  // the texture wraps the wall as a cylinder (u the arc round the dome, v the height, one scale), and where the skin ends
  // between rays a cap returns it into the wall, so no slot of shade opens behind its edge.
  const nrm: number[] = [], tex: number[] = [];
  const UVM = 0.33, arcOf = (j: number): number => (j / rays) * circ * UVM;
  const _n = new THREE.Vector3(), _ty = new THREE.Vector3(), _tj = new THREE.Vector3();
  const normalAt = (j: number, y: number, p: readonly number[]): THREE.Vector3 => {
    const e = 0.45, up = vertex(j, y + e) ?? p, dn = vertex(j, y - e) ?? p;
    const right = vertex((j + 1) % rays, y) ?? p, left = vertex((j - 1 + rays) % rays, y) ?? p;
    _ty.set(up[0] - dn[0], up[1] - dn[1], up[2] - dn[2]);
    if (_ty.lengthSq() < 1e-6) _ty.set(0, 1, 0);
    _tj.set(right[0] - left[0], right[1] - left[1], right[2] - left[2]);
    _n.crossVectors(_ty, _tj);
    const rx = p[0] - spec.x, rz = p[2] - spec.z, rl = Math.hypot(rx, rz) || 1;
    if (_n.lengthSq() < 1e-8) _n.set(rx / rl, 0, rz / rl);
    _n.normalize();
    // a normal that would turn in (a fold of the noise) falls back toward the radial direction
    const radial = (_n.x * rx + _n.z * rz) / rl;
    if (radial < 0.05) { _n.x += (rx / rl) * (0.05 - radial + 0.1); _n.z += (rz / rl) * (0.05 - radial + 0.1); _n.normalize(); }
    return _n;
  };
  const emit = (v: readonly number[], n: THREE.Vector3, u: number): void => {
    pos.push(v[0], v[1], v[2]); col.push(v[3], v[4], v[5]); gr.push(v[6]); nrm.push(n.x, n.y, n.z); tex.push(u, v[1] * UVM);
  };
  const drawn = new Uint8Array(rays), span = new Float32Array(rays * 2);
  for (let j = 0; j < rays; j++) {
    const j1 = (j + 1) % rays;
    if (!Number.isFinite(top[j]) || !Number.isFinite(top[j1])) continue;
    const lo = Math.max(foot[j], foot[j1]) - SINK, hi = Math.min(top[j], top[j1]) + SHOULDER;
    if (hi - lo < 1 + SINK + SHOULDER) continue;
    drawn[j] = 1; span[j * 2] = lo; span[j * 2 + 1] = hi;
    const n = Math.max(1, Math.ceil((hi - lo) / dy));
    const uA = arcOf(j), uB = arcOf(j + 1);
    for (let i = 0; i < n; i++) {
      const y0 = lo + ((hi - lo) * i) / n, y1 = lo + ((hi - lo) * (i + 1)) / n;
      const a = vertex(j, y0), b = vertex(j1, y0), c = vertex(j1, y1), d = vertex(j, y1);
      if (!a || !b || !c || !d) continue;
      const na = normalAt(j, y0, a).clone(), nb = normalAt(j1, y0, b).clone(), nc = normalAt(j1, y1, c).clone(), nd = normalAt(j, y1, d).clone();
      // outward-facing winding: the rays run counter-clockwise seen from above, the levels upward
      emit(a, na, uA); emit(c, nc, uB); emit(b, nb, uB);
      emit(a, na, uA); emit(d, nd, uA); emit(c, nc, uB);
    }
  }
  // the end caps: at a ray where the skin stops, a band from its outer face back into the wall, seen from either side
  for (let j = 0; j < rays; j++) {
    if (!drawn[j]) continue;
    for (const [ray, endOf, dir] of [[(j + 1) % rays, !drawn[(j + 1) % rays], 1], [j, !drawn[(j - 1 + rays) % rays], -1]] as const) {
      if (!endOf) continue;
      const lo = span[j * 2], hi = span[j * 2 + 1], n = Math.max(1, Math.ceil((hi - lo) / dy));
      const ang = (ray / rays) * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
      const u = arcOf(dir > 0 ? j + 1 : j);
      for (let i = 0; i < n; i++) {
        const y0 = lo + ((hi - lo) * i) / n, y1 = lo + ((hi - lo) * (i + 1)) / n;
        const o0 = vertex(ray, y0), o1 = vertex(ray, y1), i0 = vertex(ray, y0, true), i1 = vertex(ray, y1, true);
        if (!o0 || !o1 || !i0 || !i1) continue;
        for (const side of [1, -1]) {
          // the band's normal: round the dome toward the open side, leaned out (every normal keeps an outward part)
          _n.set(-sa * side * 0.8 + ca * 0.6, 0, ca * side * 0.8 + sa * 0.6).normalize();
          const cap = _n.clone();
          if (side * dir > 0) { emit(o0, cap, u); emit(i1, cap, u + 0.2); emit(i0, cap, u + 0.2); emit(o0, cap, u); emit(o1, cap, u); emit(i1, cap, u + 0.2); }
          else { emit(o0, cap, u); emit(i0, cap, u + 0.2); emit(i1, cap, u + 0.2); emit(o0, cap, u); emit(i1, cap, u + 0.2); emit(o1, cap, u); }
        }
      }
    }
  }
  if (!pos.length) return { geometry: null, triangles: 0, rays: { walled, total: rays }, wall: { top, foot } };
  const geometry = new THREE.BufferGeometry();
  const P = new Float32Array(pos);
  geometry.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  geometry.setAttribute('aRockGround', new THREE.BufferAttribute(new Float32Array(gr), 1));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(tex), 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, triangles: P.length / 9, rays: { walled, total: rays }, wall: { top, foot } };
}
