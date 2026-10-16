// src/world/maps/craterEjecta.ts — what a shell throws out of the ground round its crater, by the ground it struck (props
// lane A, family #19, 2026-10-15; WORKLIST.md #19 ground:crater-clods: "Replace them with the map's ejecta. Turf maps get
// torn sods: a lumpy soil body … with a grass-tufted top on some, in the soil tone. Sand maps get no clods, only a slumped
// rim. Snow maps get dirty snow lumps and soil spatter. Town maps get broken asphalt/sett slabs and kerb pieces. Mars/Moon
// get regolith and angular basalt").
//
// A piece is built in its own frame on y = 0 (the caller seats it part-buried and turns it), its size the old box clod's
// (0.14-0.4 m), its looks from its own seed: no placement stream is read. Vertex colour on the baked material.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash, hexLin, mix, stream, type Rgb } from './craftMesh.ts';

export type EjectaClimate = 'turf' | 'mud' | 'sand' | 'snow' | 'town' | 'regolith' | 'ash';
const CLIMATE: Readonly<Record<string, EjectaClimate>> = Object.freeze({
  verdant: 'turf', steppe: 'turf', autumn: 'turf', coastal: 'turf', frontier: 'turf', reservoir: 'turf', polders: 'mud',
  fjord: 'turf', alpine: 'turf', longleaf: 'turf', orchard: 'turf', railyard: 'turf', airfield: 'turf', cliffbridge: 'turf',
  monsoon: 'mud', delta: 'mud', mangrove: 'mud',
  desert: 'sand', oasis: 'sand', badlands: 'sand', copper_mesa: 'sand', titan_gorge: 'sand', saltwind: 'sand', skybridge: 'sand',
  winter: 'snow', whiteout: 'snow',
  urban: 'town', ruinspires: 'town', blackglass: 'town', foundry: 'town',
  mars: 'regolith', moon: 'regolith',
  caldera: 'ash',
});
/** The soil a turf or mud map's sods are cut from (default a brown loam): the Chouf's terra rossa, the chernozem. */
const SOIL: Readonly<Record<string, Rgb>> = Object.freeze({
  orchard: hexLin(0x7a3e26), steppe: hexLin(0x2e2620), verdant: hexLin(0x3a2e24), longleaf: hexLin(0x8a6a48),
  cliffbridge: hexLin(0x8a6648),
});
const LOAM = hexLin(0x4e3c2c), MUD = hexLin(0x2e261e), GRASS = hexLin(0x4e6630), GRASS_DRY = hexLin(0x7a7a44);
const SNOW = hexLin(0xd8dee6), ASPHALT = hexLin(0x3a3a38), AGGREGATE = hexLin(0x7e7a72), SETT = hexLin(0x8a8680);
const BASALT = hexLin(0x3e3c3a), MARS_ROCK = hexLin(0x8a4a2e), MOON_ROCK = hexLin(0x8e8c88), SCORIA = hexLin(0x2a2220), SCORIA_RED = hexLin(0x5a2a1e);

/** The ejecta a map's craters throw (sand throws none: its rim slumps). */
export function ejectaClimateOf(mapId: string): EjectaClimate {
  return CLIMATE[mapId] ?? 'turf';
}

/** A lumpy body (an icosahedron welded, pushed in and out by its seed), `sx` x `sy` x `sz` half extents, its foot at y 0. */
function lump(detail: number, sx: number, sy: number, sz: number, seed: number, rough: number): THREE.BufferGeometry {
  const raw = new THREE.IcosahedronGeometry(1, detail);
  raw.deleteAttribute('normal'); raw.deleteAttribute('uv');
  const g = mergeVertices(raw);
  raw.dispose();
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const k = 1 - rough / 2 + rough * hash(i, 17, seed);
    p.setXYZ(i, p.getX(i) * sx * k, (p.getY(i) * k + 0.35) * sy, p.getZ(i) * sz * k);
  }
  return g;
}

/** Colour a body per vertex (by its height share and its normal) and finish it as the baked family's flat-shaded parts. */
function finish(g: THREE.BufferGeometry, colour: (y: number, ny: number, i: number) => Rgb, flat: boolean): THREE.BufferGeometry {
  g.computeVertexNormals();
  const out = flat ? g.toNonIndexed() : g;
  if (flat) { g.dispose(); out.computeVertexNormals(); }
  const p = out.getAttribute('position'), n = out.getAttribute('normal');
  let top = 1e-6;
  for (let i = 0; i < p.count; i++) top = Math.max(top, p.getY(i));
  const col = new Float32Array(p.count * 3), uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const c = colour(p.getY(i) / top, n.getY(i), i);
    col.set([c[0], c[1], c[2]], i * 3); uv.set([p.getX(i) * 0.5, p.getZ(i) * 0.5], i * 2);
  }
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out.index ? (() => { const f = out.toNonIndexed(); out.dispose(); return f; })() : out;
}

/** A broken slab of the surfacing: an irregular pentagon `t` thick, its top `top`, its broken sides `side`. */
function slab(r: number, t: number, top: Rgb, side: Rgb, seed: number): THREE.BufferGeometry {
  const s = stream(seed), N = 5;
  const ring = Array.from({ length: N }, (_, k) => {
    const a = (k + (s() - 0.5) * 0.7) / N * Math.PI * 2, d = r * (0.6 + s() * 0.45);
    return [Math.cos(a) * d, Math.sin(a) * d] as const;
  });
  const pos: number[] = [], col: number[] = [];
  const put = (x: number, y: number, z: number, c: Rgb) => { pos.push(x, y, z); col.push(c[0], c[1], c[2]); };
  const tilt = (x: number, z: number) => x * 0.08 + z * 0.05;
  for (let k = 1; k + 1 < N; k++) {
    for (const j of [0, k + 1, k]) put(ring[j][0], t + tilt(ring[j][0], ring[j][1]), ring[j][1], top);
  }
  for (let k = 0; k < N; k++) {
    const [ax, az] = ring[k], [bx, bz] = ring[(k + 1) % N];
    put(ax, 0, az, side); put(ax, t + tilt(ax, az), az, side); put(bx, t + tilt(bx, bz), bz, side);
    put(ax, 0, az, side); put(bx, t + tilt(bx, bz), bz, side); put(bx, 0, bz, side);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(pos.filter((_, i) => i % 3 !== 1).map((v) => v * 0.5), 2));
  g.computeVertexNormals();
  return g;
}

/**
 * One piece of a crater's ejecta, `size` across (the old clod's 0.14-0.4 m), in its own frame on y 0, from its `seed`;
 * null on sand (no clods: its rim slumps). Turf: a torn sod, soil under a grass mat, some turned over to its roots;
 * mud: a wet clod; snow: a dirty snow lump spattered with soil; town: a broken slab of the asphalt or a dislodged sett;
 * regolith: an angular clast of the basalt; ash: a lump of black scoria.
 */
export function ejectaPiece(climate: EjectaClimate, mapId: string, size: number, seed: number): THREE.BufferGeometry | null {
  const h = (k: number) => hash(k, 5, seed);
  switch (climate) {
    case 'sand': return null;
    case 'turf': case 'mud': {
      const soil = climate === 'mud' ? mix(MUD, SOIL[mapId] ?? LOAM, 0.3) : SOIL[mapId] ?? LOAM;
      const turned = h(1) < 0.3, grass = mix(GRASS, GRASS_DRY, h(2) * (mapId === 'steppe' || mapId === 'cliffbridge' ? 1 : 0.4));
      const g = lump(1, size * 0.62, size * 0.36, size * 0.5, seed, 0.42);
      return finish(g, (y, ny, i) => {
        const n = hash(i, 9, seed);
        // a sod's grass on its top (its underside up when it landed turned over: the roots' dark soil then)
        if (climate === 'turf' && !turned && ny > 0.45 && y > 0.55) return mix(grass, soil, n * 0.3);
        return mix(soil, mix(soil, [0, 0, 0], 0.35), n * 0.5 + (1 - y) * 0.2);
      }, false);
    }
    case 'snow': {
      const g = lump(1, size * 0.6, size * 0.34, size * 0.5, seed, 0.35);
      return finish(g, (y, _ny, i) => (hash(i, 11, seed) < 0.36 ? mix(LOAM, SNOW, 0.12) : mix(SNOW, LOAM, (1 - y) * 0.2)), false);
    }
    case 'town': {
      if (h(3) < 0.55) return slab(size * 0.7, 0.05 + size * 0.12, ASPHALT, AGGREGATE, seed);
      // a sett torn out of the carriageway: a granite block, chipped
      const g = lump(0, size * 0.32, size * 0.3, size * 0.32, seed, 0.18);
      return finish(g, (_y, _ny, i) => mix(SETT, AGGREGATE, hash(i, 13, seed) * 0.4), true);
    }
    case 'regolith': {
      const g = lump(0, size * 0.62, size * 0.38, size * 0.45, seed, 0.6);
      const rock = mapId === 'mars' ? MARS_ROCK : MOON_ROCK;
      return finish(g, (_y, _ny, i) => mix(rock, BASALT, hash(i, 15, seed) * 0.55), true);
    }
    case 'ash': {
      const g = lump(1, size * 0.55, size * 0.4, size * 0.5, seed, 0.75);
      return finish(g, (_y, _ny, i) => mix(SCORIA, SCORIA_RED, hash(i, 19, seed) * 0.6), true);
    }
  }
}
