#!/usr/bin/env node
/**
 * Two real player views of ONE live multiplayer v2 match, side by side: public/media/multiplayer-r1/dual-perspective.webp
 * (2400×700; the home page's and the manual's multiplayer figure, and the source of the
 * docs-multiplayer social card in tools/marketing-shots/generate-og-images.mjs), with manifest.json beside it.
 *
 * The v1 tool of the same name drove v1's signaling server and browser host, and filmed each perspective in a match of
 * its own; it left the tree with the v1 stack (docs/MULTIPLAYER-V2.md §13.10). This one seats both players in one v2
 * room, on the stack `npm run test:net:v2:browser` (tools/mp-browser-e2e.mjs) runs:
 *
 *   1. Staging plan (CPU only, before the lock). The map's collision manifest (server/dedicatedWorldCollision.ts, the
 *      authority's own world) is searched for a flat, dry, open lane where two hulls face each other `--separation`
 *      metres apart: no prop, trunk, canopy or bush on the pads, in the lane or round any capture camera, the turrets
 *      in clear line of sight (ray casts against the terrain and the colliders), and a background worth showing in
 *      both directions (buildings and woods in each view's cone).
 *   2. The shared capture lock (tools/capture-lock.mjs, the FIFO tools/screenshot.mjs takes), held only while the
 *      servers, the two rendering pages and their screenshots run.
 *   3. The v2 LAN stack of the browser e2e: the in-process room host (server/rooms/serve.ts — rooms plus the match
 *      authority, `matchTransport: 'service'`) and this checkout's Vite dev server with its own dependency cache.
 *   4. Two pristine headless Chromes (separate browser contexts, --use-gl=angle, 1280×720) as two real players:
 *      player one opens the Garage's Multiplayer → LAN, creates a 1v1 room and picks the battlefield and the M1A2;
 *      player two joins by the room code on the other side with the T-90M; both ready; player one starts. The authority
 *      seats the two hulls on the planned lane (the actor's own `spawn` override, injected where the room host creates
 *      the actor), and the room's match seed is chosen for daylight (src/engine/battleWeatherPolicy.ts).
 *   5. Each page's camera is pinned behind and beside its own hull looking at the opponent (rig.setExternalPose, the
 *      deterministic screenshot hook) and its aim point follows the opponent, so each turret — turned by the
 *      authority from that player's own inputs — points at the other. Once the countdown is over, each page has the
 *      other hull spotted, and both turrets are on target, both views are captured at the same instant, HUD included.
 *   6. The lock is released; the two views are composed in a software-only Chrome (no GPU) and encoded with
 *      cwebp at quality 90; manifest.json records the match, the map, the vehicles, the sides, the room, the viewport,
 *      the bytes and the SHA-256 (receipt: capture-multiplayer-dual-screen.selftest.mjs).
 *
 *   nice -n 10 node tools/marketing-shots/capture-multiplayer-dual-screen.mjs
 *   nice -n 10 node tools/marketing-shots/capture-multiplayer-dual-screen.mjs --out=/tmp/dual --work=/tmp/dual/work
 *   node tools/marketing-shots/capture-multiplayer-dual-screen.mjs --plan-only                 # the staging search alone
 *   node tools/marketing-shots/capture-multiplayer-dual-screen.mjs --recompose --framing=close  # compose saved views again
 *
 * Options: --map=verdant --alpha=m1a2 --bravo=t90m --separation=20 --hull-angle=20 --seed=<uint32>
 *   --framings=duel,classic,close (each captured; the first is composed unless --framing names another)
 *   --out=<dir> (default public/media/multiplayer-r1) --work=<dir> (default .qa-dev/multiplayer-dual-screen)
 *   --cache-dir=<dir> (Vite's dependency cache, default <work>/vite-cache) --lock-timeout-min=60
 * The process lowers its own priority to nice 10 (Chrome, ffmpeg and cwebp inherit it); `nice -n 10` in front of the
 * command does the same.
 */

import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
process.chdir(ROOT);

const TOOL = 'tools/marketing-shots/capture-multiplayer-dual-screen.mjs';
const OUTPUT_NAME = 'dual-perspective.webp';
const OUTPUT = Object.freeze({ width: 2400, height: 700 });
const VIEWPORT = Object.freeze({ width: 1280, height: 720, deviceScaleFactor: 1 });
const WEBP_QUALITY = 90;
// the two players' frames at most this far apart (2026-10-15: one capture landed 2,978 ms after the other)
const SKEW_MAX_MS = 500;
const NICENESS = 10;
/** The game boots without its splash, on the desktop tier (as the browser e2e boots it). */
const BOOT_QUERY = 'nosplash=1&tier=desktop';
/** The v1 tool's match seed; the search for a daylight seed starts here. */
const BASE_SEED = 0xD0A15C4E;
const PLAYER_NAMES = Object.freeze({ alpha: 'Alpha Commander', bravo: 'Bravo Commander' });

/**
 * Capture cameras, relative to the player's own hull and the line to the opponent: `back` metres behind it, `side`
 * metres to the screen-right, `up` metres above its ground; looking at the point `lookT` of the way to the opponent,
 * `lookUp` metres up; `fov` the vertical field of view. `classic` is the retired v1 tool's framing.
 */
const FRAMINGS = Object.freeze({
  duel: Object.freeze({ back: 7.6, side: 3.0, up: 3.9, lookT: 0.62, lookUp: 1.5, fov: 42 }),
  classic: Object.freeze({ back: 8.8, side: 3.1, up: 5.1, lookT: 0.6, lookUp: 1.7, fov: 46 }),
  close: Object.freeze({ back: 6.4, side: 2.6, up: 3.0, lookT: 0.66, lookUp: 1.55, fov: 38 }),
});

// ---- composition layout (2400×700): two 16:9 views under a slim caption row, nothing laid over either HUD
const PANEL = Object.freeze({ width: 1172, height: 659, marginX: 20, gap: 16, top: 38 });

// ---- staging search
const TREE_CANOPY_M = 4.5; // a trunk's collider is ~1 m wide; its crown is not in the manifest
const BUSH_MAX_M = 6;
const PAD_HALF_M = 5.5;
const LANE_HALF_M = 2.5;
const CAMERA_PAD_HALF_M = 2.5;
const MAP_MARGIN_M = 110;
const GRID_STEP_M = 8;
const BEARING_STEP_DEG = 15;
const BACKGROUND_WEIGHTS = Object.freeze({ structure: 10, fieldhut: 4, commandtent: 4, stog: 3, '': 1.5 });

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((entry) => entry.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}
const hasFlag = (name) => process.argv.slice(2).includes(`--${name}`);
function numberArg(name, fallback) {
  const raw = argValue(name, null);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number (${raw})`);
  return value;
}

const startedAt = performance.now();
const log = (line) => process.stderr.write(`[dual-screen ${((performance.now() - startedAt) / 1000).toFixed(1)}s] ${line}\n`);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function lowerPriority() {
  try {
    if (os.getPriority() < NICENESS) os.setPriority(NICENESS);
  } catch { /* keep the caller's priority */ }
  try { return os.getPriority(); } catch { return null; }
}

function readOptions() {
  const work = resolve(argValue('work', '.qa-dev/multiplayer-dual-screen'));
  const framings = String(argValue('framings', 'duel')).split(',').map((name) => name.trim()).filter(Boolean);
  for (const name of framings) if (!FRAMINGS[name]) throw new Error(`unknown framing ${name} (${Object.keys(FRAMINGS).join(', ')})`);
  if (!framings.length) throw new Error('--framings names no framing');
  const seedRaw = argValue('seed', null);
  const seed = seedRaw === null ? null : Number(seedRaw);
  if (seed !== null && (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)) throw new Error('--seed must be a uint32');
  const options = {
    out: resolve(argValue('out', 'public/media/multiplayer-r1')),
    work,
    cacheDir: resolve(argValue('cache-dir', join(work, 'vite-cache'))),
    mapId: argValue('map', 'verdant'),
    alpha: argValue('alpha', 'm1a2'),
    bravo: argValue('bravo', 't90m'),
    separationM: numberArg('separation', 20),
    hullAngleDeg: numberArg('hull-angle', 20),
    framings,
    framing: argValue('framing', null),
    seed,
    lockTimeoutMin: numberArg('lock-timeout-min', 60),
    planOnly: hasFlag('plan-only'),
    recompose: hasFlag('recompose'),
  };
  if (!(options.separationM >= 12 && options.separationM <= 60)) throw new Error('--separation must be 12..60 m');
  if (!(Math.abs(options.hullAngleDeg) <= 45)) throw new Error('--hull-angle must be within ±45°');
  return options;
}

// ------------------------------------------------------------------ seed

/** The room's match seed: `--seed`, else the first seed from the v1 tool's whose battle weather is daylight. */
async function chooseSeed(mapId, requested) {
  const [{ selectBattleWeather }, { BATTLE_WEATHER_BIOMES }] = await Promise.all([
    import('../../src/engine/battleWeatherPolicy.ts'),
    import('../../src/engine/battleAtmosphereRuntime.ts'),
  ]);
  const biome = BATTLE_WEATHER_BIOMES[mapId];
  if (!biome) throw new Error(`no battle weather biome for ${mapId}`);
  if (requested !== null) return { seed: requested >>> 0, timeOfDay: selectBattleWeather(requested >>> 0, biome).timeOfDay, biome };
  for (let step = 0, seed = BASE_SEED; step < 4096; step++, seed = (seed + 1) >>> 0) {
    const weather = selectBattleWeather(seed, biome);
    if (weather.timeOfDay === 'day') return { seed, timeOfDay: weather.timeOfDay, biome };
  }
  throw new Error('no daylight seed found');
}

// ------------------------------------------------------------------ staging plan

/**
 * Search the map for the face-off lane. Cheap tests run on a 1 m occupancy raster of the manifest (obstacle bounds,
 * tree crowns, bushes) read through a summed-area table, plus height samples; the best-scoring survivors are then
 * proven with the authority's own ray casts (terrain and colliders) for the lane and every capture camera.
 */
async function planFaceoff({ mapId, separationM, hullAngleDeg, framingNames }) {
  const searchStarted = performance.now();
  const [{ createDedicatedWorldCollision }, { Vector3 }] = await Promise.all([
    import('../../server/dedicatedWorldCollision.ts'),
    import('three'),
  ]);
  const world = createDedicatedWorldCollision(mapId);
  const loadMs = Math.round(performance.now() - searchStarted);
  try {
    const field = world.heightField;
    const half = field.size / 2;
    const cells = Math.ceil(field.size);
    const heightAt = (x, z) => field.getHeightAt(x, z);
    const wet = (x, z) => field.getWaterMaskAt(x, z) > 0.02;
    const cellOf = (value) => Math.floor(value + half);

    // ---- occupancy raster
    const blocked = new Uint8Array(cells * cells);
    const markRect = (x0, z0, x1, z1) => {
      const ix0 = Math.max(0, cellOf(x0)), ix1 = Math.min(cells - 1, cellOf(x1));
      const iz0 = Math.max(0, cellOf(z0)), iz1 = Math.min(cells - 1, cellOf(z1));
      if (ix0 > ix1) return;
      for (let iz = iz0; iz <= iz1; iz++) blocked.fill(1, iz * cells + ix0, iz * cells + ix1 + 1);
    };
    const markDisk = (cx, cz, radius) => {
      const iz0 = Math.max(0, cellOf(cz - radius)), iz1 = Math.min(cells - 1, cellOf(cz + radius));
      for (let iz = iz0; iz <= iz1; iz++) {
        const dz = iz - half + 0.5 - cz;
        const span = radius * radius - dz * dz;
        if (span < 0) continue;
        const reach = Math.sqrt(span);
        const ix0 = Math.max(0, cellOf(cx - reach)), ix1 = Math.min(cells - 1, cellOf(cx + reach));
        if (ix0 <= ix1) blocked.fill(1, iz * cells + ix0, iz * cells + ix1 + 1);
      }
    };
    const obstacles = world.getObstacles();
    for (const obstacle of obstacles) {
      if (obstacle.crushed) continue;
      if (obstacle.kind === 'tree') {
        markDisk((obstacle.min[0] + obstacle.max[0]) / 2, (obstacle.min[2] + obstacle.max[2]) / 2, TREE_CANOPY_M);
      } else {
        markRect(obstacle.min[0] - 0.75, obstacle.min[2] - 0.75, obstacle.max[0] + 0.75, obstacle.max[2] + 0.75);
      }
    }
    for (const concealer of world.getConcealment()) markDisk(concealer.x, concealer.z, Math.min(concealer.r, BUSH_MAX_M));
    const stride = cells + 1;
    const table = new Int32Array(stride * stride);
    for (let iz = 0; iz < cells; iz++) {
      let row = 0;
      for (let ix = 0; ix < cells; ix++) {
        row += blocked[iz * cells + ix];
        table[(iz + 1) * stride + ix + 1] = table[iz * stride + ix + 1] + row;
      }
    }
    const blockedSquare = (x, z, halfSize) => {
      const ix0 = cellOf(x - halfSize), ix1 = cellOf(x + halfSize), iz0 = cellOf(z - halfSize), iz1 = cellOf(z + halfSize);
      if (ix0 < 0 || iz0 < 0 || ix1 >= cells || iz1 >= cells) return true;
      return table[(iz1 + 1) * stride + ix1 + 1] - table[iz0 * stride + ix1 + 1] - table[(iz1 + 1) * stride + ix0] + table[iz0 * stride + ix0] > 0;
    };
    const blockedSegment = (ax, az, bx, bz, halfSize, step = 1) => {
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
      for (let index = 0; index <= steps; index++) {
        const t = index / steps;
        if (blockedSquare(ax + (bx - ax) * t, az + (bz - az) * t, halfSize)) return true;
      }
      return false;
    };
    const wetSegment = (ax, az, bx, bz) => {
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
      for (let index = 0; index <= steps; index++) {
        const t = index / steps;
        if (wet(ax + (bx - ax) * t, az + (bz - az) * t)) return true;
      }
      return false;
    };
    // The field computes every height (~0.15 ms a sample): the screening reads a 4 m bilinear grid of it, and only the
    // candidates that survive are proven on the exact field.
    const heightStep = 4;
    const heightCells = Math.floor(field.size / heightStep) + 1;
    const heightGrid = new Float32Array(heightCells * heightCells);
    for (let iz = 0; iz < heightCells; iz++) {
      for (let ix = 0; ix < heightCells; ix++) heightGrid[iz * heightCells + ix] = heightAt(ix * heightStep - half, iz * heightStep - half);
    }
    const approxHeight = (x, z) => {
      const gx = Math.min(heightCells - 1.001, Math.max(0, (x + half) / heightStep));
      const gz = Math.min(heightCells - 1.001, Math.max(0, (z + half) / heightStep));
      const ix = Math.floor(gx), iz = Math.floor(gz), tx = gx - ix, tz = gz - iz;
      const row = iz * heightCells + ix;
      const near = heightGrid[row] * (1 - tx) + heightGrid[row + 1] * tx;
      const far = heightGrid[row + heightCells] * (1 - tx) + heightGrid[row + heightCells + 1] * tx;
      return near * (1 - tz) + far * tz;
    };
    const padRelief = (x, z, sample) => {
      const samples = [sample(x, z), sample(x + 3.5, z), sample(x - 3.5, z), sample(x, z + 3.5), sample(x, z - 3.5),
        sample(x + 2.5, z + 2.5), sample(x - 2.5, z - 2.5), sample(x + 2.5, z - 2.5), sample(x - 2.5, z + 2.5)];
      return Math.max(...samples) - Math.min(...samples);
    };
    /** The terrain stays `clearance` metres under the segment between its ends. */
    const groundBelow = (ax, ay, az, bx, by, bz, clearance, sample) => {
      const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5));
      for (let index = 1; index < steps; index++) {
        const t = index / steps;
        if (sample(ax + (bx - ax) * t, az + (bz - az) * t) > ay + (by - ay) * t - clearance) return false;
      }
      return true;
    };
    /** Level pads, a lane the hulls see along, and every camera above the ground with the opponent in view. */
    const groundClear = (candidate, sample) => {
      if (padRelief(candidate.ax, candidate.az, sample) > 0.6 || padRelief(candidate.bx, candidate.bz, sample) > 0.6) return null;
      const ay = sample(candidate.ax, candidate.az), by = sample(candidate.bx, candidate.bz);
      if (Math.abs(ay - by) > 2) return null;
      if (!groundBelow(candidate.ax, ay + 1.6, candidate.az, candidate.bx, by + 1.6, candidate.bz, 0.4, sample)) return null;
      for (const camera of candidate.cameras) {
        const oy = camera.side ? by : ay, ey = camera.side ? ay : by;
        const py = oy + camera.framing.up;
        if (sample(camera.px, camera.pz) > py - 1.4) return null;
        if (!groundBelow(camera.px, py, camera.pz, camera.ex, ey + 1.2, camera.ez, 0.3, sample)) return null;
      }
      return { ay, by };
    };

    // ---- what each view looks at: buildings and woods in its cone, 45..240 m out
    const backgroundCell = 8;
    const grid = Math.ceil(field.size / backgroundCell);
    const weight = new Float32Array(grid * grid);
    const trees = new Uint16Array(grid * grid);
    const buildings = new Uint16Array(grid * grid);
    for (const obstacle of obstacles) {
      const gx = Math.floor(((obstacle.min[0] + obstacle.max[0]) / 2 + half) / backgroundCell);
      const gz = Math.floor(((obstacle.min[2] + obstacle.max[2]) / 2 + half) / backgroundCell);
      if (gx < 0 || gz < 0 || gx >= grid || gz >= grid) continue;
      const kind = obstacle.kind ?? '';
      if (kind === 'tree') { trees[gz * grid + gx]++; continue; }
      weight[gz * grid + gx] += BACKGROUND_WEIGHTS[kind] ?? 0.3;
      if (kind === 'structure' || kind === 'fieldhut' || kind === 'commandtent') buildings[gz * grid + gx]++;
    }
    const visited = new Int32Array(grid * grid);
    let visit = 0;
    const background = (px, pz, dirX, dirZ) => {
      visit++;
      let score = 0;
      let treeCount = 0;
      let buildingCount = 0;
      for (let distance = 45; distance <= 240; distance += 6) {
        for (let degrees = -24; degrees <= 24; degrees += 3) {
          const angle = degrees * Math.PI / 180;
          const vx = dirX * Math.cos(angle) - dirZ * Math.sin(angle);
          const vz = dirX * Math.sin(angle) + dirZ * Math.cos(angle);
          const gx = Math.floor((px + vx * distance + half) / backgroundCell);
          const gz = Math.floor((pz + vz * distance + half) / backgroundCell);
          if (gx < 0 || gz < 0 || gx >= grid || gz >= grid) continue;
          const index = gz * grid + gx;
          if (visited[index] === visit) continue;
          visited[index] = visit;
          score += weight[index];
          treeCount += trees[index];
          buildingCount += buildings[index];
        }
      }
      return { score: Math.round((score + Math.min(treeCount, 40) * 0.6) * 10) / 10, trees: treeCount, buildings: buildingCount };
    };

    // ---- candidates
    const framings = framingNames.map((name) => FRAMINGS[name]);
    const hull = hullAngleDeg * Math.PI / 180;
    const reach = half - MAP_MARGIN_M;
    const passing = [];
    let tested = 0;
    for (let degrees = 0; degrees < 180; degrees += BEARING_STEP_DEG) {
      const bearing = degrees * Math.PI / 180;
      const fx = Math.sin(bearing), fz = Math.cos(bearing); // alpha → bravo
      const rx = -fz, rz = fx; // alpha's screen-right, looking at bravo (forward × up)
      for (let cx = -reach; cx <= reach; cx += GRID_STEP_M) {
        for (let cz = -reach; cz <= reach; cz += GRID_STEP_M) {
          tested++;
          const ax = cx - fx * separationM / 2, az = cz - fz * separationM / 2;
          const bx = cx + fx * separationM / 2, bz = cz + fz * separationM / 2;
          if (blockedSquare(ax, az, PAD_HALF_M) || blockedSquare(bx, bz, PAD_HALF_M)) continue;
          if (blockedSegment(ax, az, bx, bz, LANE_HALF_M, 1.5)) continue;
          const cameras = [];
          for (const side of [0, 1]) {
            const ox = side ? bx : ax, oz = side ? bz : az, ex = side ? ax : bx, ez = side ? az : bz;
            const dx = side ? -fx : fx, dz = side ? -fz : fz, sx = side ? -rx : rx, sz = side ? -rz : rz;
            for (const framing of framings) {
              cameras.push({ side, framing, ox, oz, ex, ez,
                px: ox - dx * framing.back + sx * framing.side, pz: oz - dz * framing.back + sz * framing.side });
            }
          }
          if (cameras.some((camera) => blockedSquare(camera.px, camera.pz, CAMERA_PAD_HALF_M)
            || blockedSegment(camera.px, camera.pz, camera.ox, camera.oz, 1.2) || blockedSegment(camera.px, camera.pz, camera.ex, camera.ez, 1.0))) continue;
          if (wet(ax, az) || wet(bx, bz) || wet(cx, cz) || cameras.some((camera) => wet(camera.px, camera.pz))) continue;
          const candidate = { degrees, cx, cz, ax, az, bx, bz, cameras };
          if (!groundClear(candidate, approxHeight)) continue;
          const first = framings[0];
          candidate.viewAlpha = background(ax - fx * first.back + rx * first.side, az - fz * first.back + rz * first.side, fx, fz);
          candidate.viewBravo = background(bx + fx * first.back - rx * first.side, bz + fz * first.back - rz * first.side, -fx, -fz);
          candidate.score = Math.min(candidate.viewAlpha.score, candidate.viewBravo.score)
            + 0.25 * Math.max(candidate.viewAlpha.score, candidate.viewBravo.score) - 0.01 * Math.hypot(cx, cz);
          passing.push(candidate);
        }
      }
    }
    passing.sort((a, b) => b.score - a.score);

    // ---- proof with the authority's ray casts (terrain + colliders)
    const origin = new Vector3();
    const direction = new Vector3();
    const rayClear = (x0, y0, z0, x1, y1, z1) => {
      origin.set(x0, y0, z0);
      direction.set(x1 - x0, y1 - y0, z1 - z0);
      const distance = direction.length();
      direction.multiplyScalar(1 / distance);
      return !world.raycast(origin, direction, distance - 0.6);
    };
    let chosen = null;
    let rank = 0;
    for (const candidate of passing.slice(0, 400)) {
      rank++;
      // the exact field: level pads, the lane and the cameras over the ground, a dry lane
      const ground = groundClear(candidate, heightAt);
      if (!ground || wetSegment(candidate.ax, candidate.az, candidate.bx, candidate.bz)) continue;
      const { ax, az, bx, bz } = candidate;
      const { ay, by } = ground;
      Object.assign(candidate, ground);
      const bearing = candidate.degrees * Math.PI / 180;
      const fx = Math.sin(bearing), fz = Math.cos(bearing), rx = -fz, rz = fx;
      let clear = rayClear(ax, ay + 2.2, az, bx, by + 2.2, bz) && rayClear(bx, by + 2.2, bz, ax, ay + 2.2, az);
      for (const offset of [-1.4, 1.4]) {
        clear &&= rayClear(ax + rx * offset, ay + 1.2, az + rz * offset, bx + rx * offset, by + 1.2, bz + rz * offset);
      }
      for (const side of [0, 1]) {
        if (!clear) break;
        const ox = side ? bx : ax, oz = side ? bz : az, oy = side ? by : ay;
        const ex = side ? ax : bx, ez = side ? az : bz, ey = side ? ay : by;
        const dx = side ? -fx : fx, dz = side ? -fz : fz, sx = side ? -rx : rx, sz = side ? -rz : rz;
        for (const framing of framings) {
          const px = ox - dx * framing.back + sx * framing.side, pz = oz - dz * framing.back + sz * framing.side;
          const py = oy + framing.up;
          clear &&= rayClear(px, py, pz, ex, ey + 1.4, ez) && rayClear(px, py, pz, ex, ey + 0.6, ez)
            && rayClear(px, py, pz, ox, oy + 2.0, oz);
          if (!clear) break;
        }
      }
      if (clear) { chosen = candidate; break; }
    }
    if (!chosen) throw new Error(`no clear ${separationM} m face-off lane on ${mapId} (${passing.length} of ${tested} candidates passed the raster)`);
    const bearing = chosen.degrees * Math.PI / 180;
    const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
    const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
    return {
      mapId,
      separationM,
      hullAngleDeg,
      bearingDeg: chosen.degrees,
      center: [chosen.cx, chosen.cz],
      // each hull's nose turned `hullAngleDeg` toward its own camera's side of the lane: a three-quarter front for the opponent
      alpha: { x: round(chosen.ax), z: round(chosen.az), y: round(chosen.ay), yaw: round(wrap(bearing - hull), 4) },
      bravo: { x: round(chosen.bx), z: round(chosen.bz), y: round(chosen.by), yaw: round(wrap(bearing + Math.PI - hull), 4) },
      score: round(chosen.score, 1),
      background: { alpha: chosen.viewAlpha, bravo: chosen.viewBravo },
      search: { candidates: tested, passingScreen: passing.length, rayRank: rank, loadMs, searchMs: Math.round(performance.now() - searchStarted) - loadMs },
    };
  } finally {
    world.release?.();
  }
}

// ------------------------------------------------------------------ capture (under the lock)

function freePort() {
  return new Promise((done, fail) => {
    const probe = net.createServer();
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}

/** Close a launched Chrome; under heavy machine load `close()` can stall for minutes, so its own process is killed after a bound. */
async function closeBrowser(browser, timeoutMs = 15_000) {
  if (!browser) return;
  const child = browser.process?.() ?? null;
  const closed = await Promise.race([browser.close().then(() => true, () => false), sleep(timeoutMs).then(() => false)]);
  if (!closed && child && child.exitCode === null && child.signalCode === null) {
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
  }
}

async function until(predicate, label, timeoutMs, everyMs = 100) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms: ${label}`);
    await sleep(everyMs);
  }
}

async function waitFor(page, predicate, label, timeoutMs, args = []) {
  try {
    await page.waitForFunction(predicate, { timeout: timeoutMs, polling: 100 }, ...args);
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      url: location.href,
      phase: window.__DEBUG?.game?.phase ?? null,
      menuVisible: document.querySelector('.cot-play')?.classList.contains('show') ?? false,
      lobbyVisible: document.querySelector('.cot-play .lobby')?.classList.contains('show') ?? false,
      status: document.querySelector('.cot-play .status')?.textContent ?? '',
      loaderOn: document.querySelector('.cot-bl')?.classList.contains('on') ?? false,
      v2: window.__MULTIPLAYER_V2?.stats?.() ?? null,
      entryFailure: window.__NETWORK_ENTRY_FAILURE ?? null,
    })).catch(() => null);
    throw new Error(`${label}: ${error.message}; diagnostics ${JSON.stringify(diagnostics)}`);
  }
}

function observe(page, label, errors) {
  page.on('pageerror', (error) => errors.push({ page: label, kind: 'pageerror', text: String(error?.stack || error?.message || error) }));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push({ page: label, kind: 'console', text: message.text() });
  });
}

async function openPlayer(context, label, specId, errors) {
  const page = await context.newPage();
  observe(page, label, errors);
  await page.setViewport(VIEWPORT);
  await page.evaluateOnNewDocument((spec) => {
    try {
      // an explicit preset: the frame governor never steps a capture down a tier; the Garage opens on the player's hull
      localStorage.setItem('cot.gfxPreset', 'high');
      localStorage.setItem('cot.lastTank.v1', spec);
      // the player's own "Performance meter" setting off: a capture machine's frame rate is not the game's
      const settings = JSON.parse(localStorage.getItem('cot.settings.v1') || '{}');
      localStorage.setItem('cot.settings.v1', JSON.stringify({ ...settings, showPerfMeter: false }));
    } catch { /* storage blocked: the defaults */ }
    for (const [name, value] of [['hardwareConcurrency', 8], ['deviceMemory', 8]]) {
      try { Object.defineProperty(Navigator.prototype, name, { configurable: true, get: () => value }); } catch { /* fixed */ }
    }
  }, specId);
  return page;
}

async function bootGarage(page, origin, label) {
  await page.goto(`${origin}/?${BOOT_QUERY}`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await waitFor(page, () => window.__GAME_READY === true && window.__DEBUG?.game?.phase === 'garage', `${label} garage ready`, 480_000);
}

async function openLanMenu(page, label) {
  await page.waitForSelector('.cot-multiplayer-entry', { visible: true, timeout: 60_000 });
  await page.click('.cot-multiplayer-entry');
  await page.waitForSelector('.cot-play.show .modes [data-mode="lan"]', { timeout: 30_000 });
  await page.click('.cot-play .modes [data-mode="lan"]');
  await waitFor(page, () => document.querySelector('.cot-play .modes [data-mode="lan"]')?.classList.contains('on'), `${label} LAN mode`, 10_000);
}

/** A lobby control (the play menu's custom select): set its value and announce the change as a pick would. */
function pickMenuValue(page, control, value) {
  return page.evaluate((selector, next) => {
    const select = document.querySelector(selector);
    if (!select) throw new Error(`missing ${selector}`);
    select.value = next;
    if (select.value !== next) throw new Error(`${selector} has no option ${next}`);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, `.cot-play [data-control="${control}"]`, value);
}

/** Each page: the camera behind and beside its own hull, looking at the opponent, the aim point on the opponent. */
function installCamera(page, opponentId, framing) {
  return page.evaluate((id, initial) => {
    const state = window.__COT_DUAL ??= {};
    state.opponentId = id;
    state.framing = initial;
    if (state.raf) cancelAnimationFrame(state.raf);
    const loop = () => {
      state.raf = requestAnimationFrame(loop);
      const debug = window.__DEBUG;
      const player = debug?.game?.player;
      const target = debug?.game?.tankById?.get(state.opponentId);
      const framing = state.framing;
      if (!player?.state?.pos || !target?.state?.pos || !framing || !debug.rig) return;
      const own = player.state.pos;
      const enemy = target.state.pos;
      state.forward ??= own.clone();
      state.camera ??= own.clone();
      state.look ??= own.clone();
      const forward = state.forward.copy(enemy).sub(own).setY(0).normalize();
      // screen-right of a camera looking along `forward` (forward × up)
      const rightX = -forward.z, rightZ = forward.x;
      const camera = state.camera.copy(own).addScaledVector(forward, -framing.back);
      camera.x += rightX * framing.side;
      camera.z += rightZ * framing.side;
      camera.y = own.y + framing.up;
      const look = state.look.copy(own).lerp(enemy, framing.lookT);
      look.y += framing.lookUp;
      if (player.input?.aimPoint) {
        player.input.aimPoint.copy(enemy);
        player.input.aimPoint.y += (target.spec?.dims?.heightM ?? 2.4) * 0.52;
      }
      debug.rig.setExternalPose(camera, look, framing.fov);
    };
    state.raf = requestAnimationFrame(loop);
  }, opponentId, framing);
}

function readView(page) {
  return page.evaluate(() => {
    const debug = window.__DEBUG;
    const game = debug?.game;
    const state = window.__COT_DUAL ?? {};
    const player = game?.player;
    const target = game?.tankById?.get(state.opponentId);
    const camera = debug?.camera;
    let opponentNdc = null;
    if (target?.state?.pos && camera) {
      const point = target.state.pos.clone();
      point.y += 1.2;
      point.project(camera);
      opponentNdc = [point.x, point.y, point.z].map((value) => Math.round(value * 1000) / 1000);
    }
    const canvas = debug?.renderer?.domElement;
    const v2 = window.__MULTIPLAYER_V2?.stats?.() ?? null;
    let timeOfDay = null;
    try { timeOfDay = debug?.getBattleAtmosphere?.()?.current?.weather?.timeOfDay ?? null; } catch { /* diagnostic only */ }
    const round = (value) => Math.round(value * 100) / 100;
    return {
      phase: game?.phase ?? null,
      preBattleS: game?.preBattleS ?? null,
      result: game?.result ?? null,
      mapId: game?.mapId ?? null,
      own: player ? {
        id: player.id, specId: player.specId, vehicle: player.spec?.name ?? null, camo: player.camo ?? null,
        pos: player.state.pos.toArray().map(round), yaw: round(player.state.yaw), turretYaw: round(player.state.turretYaw ?? 0),
      } : null,
      opponent: target ? {
        id: target.id, specId: target.specId, vehicle: target.spec?.name ?? null, camo: target.camo ?? null,
        visible: !!target.networkVisible, pos: target.state.pos.toArray().map(round),
      } : null,
      distanceM: player && target ? round(player.state.pos.distanceTo(target.state.pos)) : null,
      opponentNdc,
      camera: camera ? { pos: camera.position.toArray().map(round), fov: camera.fov } : null,
      canvas: canvas ? [canvas.width, canvas.height] : null,
      renderScale: canvas?.dataset?.renderScale ?? null,
      dynScale: canvas?.dataset?.dynScale ?? null,
      roster: game?.tankById?.size ?? null,
      timeOfDay,
      networkStrip: document.querySelector('.cot-mp-strip')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      matchId: v2?.round?.matchId ?? null,
      room: v2?.room ?? null,
      networkHealth: v2?.network?.health ?? null,
    };
  });
}

/** Turret bearing error (radians) of each staged hull against the other, read on the authority. */
function turretErrors(actor, alphaId, bravoId) {
  const entities = actor?.authority?.entities ?? [];
  const alpha = entities.find((entity) => entity.id === alphaId);
  const bravo = entities.find((entity) => entity.id === bravoId);
  if (!alpha || !bravo) return null;
  const error = (entity, target) => {
    const desired = Math.atan2(target.state.pos.x - entity.state.pos.x, target.state.pos.z - entity.state.pos.z);
    const actual = entity.state.yaw + entity.state.turretYaw;
    return Math.abs(Math.atan2(Math.sin(actual - desired), Math.cos(actual - desired)));
  };
  return { alpha: error(alpha, bravo), bravo: error(bravo, alpha) };
}

function authorityPose(actor, playerId) {
  const entity = actor?.authority?.entities?.find((candidate) => candidate.id === playerId);
  if (!entity) return null;
  const round = (value) => Math.round(value * 100) / 100;
  return {
    pos: [entity.state.pos.x, entity.state.pos.y, entity.state.pos.z].map(round),
    yaw: round(entity.state.yaw), turretYaw: round(entity.state.turretYaw), specId: entity.specId, team: entity.team,
  };
}

async function capture({ options, plan, seedInfo }) {
  const { acquireCaptureLock, refreshCaptureLock, releaseCaptureLock } = await import('../capture-lock.mjs');
  log(`waiting for the capture lock (up to ${options.lockTimeoutMin} min; other lanes queue on it too)`);
  const waitStarted = Date.now();
  await acquireCaptureLock(options.lockTimeoutMin * 60_000);
  const lock = { waitedMs: Date.now() - waitStarted, heldMs: null };
  const heldFrom = Date.now();
  process.on('exit', releaseCaptureLock);
  const refresher = setInterval(() => refreshCaptureLock(), 60_000);
  refresher.unref();
  let released = false;
  const releaseLock = () => {
    if (released) return;
    released = true;
    clearInterval(refresher);
    releaseCaptureLock();
    lock.heldMs = Date.now() - heldFrom;
    log(`capture lock released after ${(lock.heldMs / 1000).toFixed(1)} s`);
  };
  log(`capture lock taken after ${(lock.waitedMs / 1000).toFixed(1)} s`);

  const errors = [];
  let rooms = null;
  let vite = null;
  let browser = null;
  try {
    // ---- the v2 LAN room host (rooms + the in-process match authority), seeded for daylight, staging the two hulls
    const { createRoomsServer } = await import('../../server/rooms/serve.ts');
    const seedFraction = (seedInfo.seed + 0.5) / 0xffffffff; // the room draws its match seed (then the match id) from this
    rooms = await createRoomsServer({
      host: '127.0.0.1', port: 0, seatSecret: randomBytes(24).toString('hex'), world: 'dedicated', random: () => seedFraction,
    });
    const staged = { actor: null, start: null };
    const createActor = rooms.matchService.createActor;
    rooms.matchService.createActor = (actorOptions) => {
      if (actorOptions.mapId !== plan.mapId) throw new Error(`the room started ${actorOptions.mapId}, the lane was planned on ${plan.mapId}`);
      const seats = actorOptions.seats.map((seat) => {
        const pose = seat.team === 'alpha' ? plan.alpha : seat.team === 'bravo' ? plan.bravo : null;
        return pose ? { ...seat, spawn: { x: pose.x, z: pose.z, yaw: pose.yaw } } : seat;
      });
      staged.start = {
        roomId: actorOptions.roomId, mapId: actorOptions.mapId, mode: actorOptions.mode ?? 'standard', seed: actorOptions.seed,
        seats: seats.map((seat) => ({ playerId: seat.playerId, name: seat.name, team: seat.team, specId: seat.specId, spawn: seat.spawn ?? null })),
        bots: (actorOptions.bots ?? []).length,
      };
      staged.actor = createActor({ ...actorOptions, seats });
      return staged.actor;
    };
    process.env.VITE_ROOMS_URL = rooms.url;
    log(`rooms server ${rooms.url} (match transport: service, world: dedicated)`);

    const { createServer } = await import('vite');
    const port = await freePort();
    vite = await createServer({
      root: ROOT, cacheDir: options.cacheDir, logLevel: 'error', clearScreen: false,
      // no watcher: shots/ and node_modules may be links into busy worktrees, and a reload would destroy the pages' state
      server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } },
    });
    await vite.listen();
    const origin = `http://127.0.0.1:${port}`;
    log(`vite ${origin} (cache ${options.cacheDir})`);

    const puppeteer = (await import('puppeteer')).default;
    browser = await puppeteer.launch({
      headless: true,
      protocolTimeout: 360_000,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--use-gl=angle', '--enable-webgl',
        '--force-color-profile=srgb', `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    });
    // two first-time machines: separate contexts share no storage, cookies, cache or player identity
    const [contextA, contextB] = await Promise.all([browser.createBrowserContext(), browser.createBrowserContext()]);
    const [pageA, pageB] = await Promise.all([
      openPlayer(contextA, 'A', options.alpha, errors),
      openPlayer(contextB, 'B', options.bravo, errors),
    ]);
    log('booting both players to the Garage');
    await Promise.all([bootGarage(pageA, origin, 'A'), bootGarage(pageB, origin, 'B')]);
    log('both Garages ready');

    // ---- player one: Multiplayer → LAN → a 1v1 room, the battlefield and the vehicle
    await openLanMenu(pageA, 'A');
    await pageA.evaluate((name) => {
      const field = document.querySelector('.cot-play [data-field="name"]');
      if (field) field.value = name;
      const size = document.querySelector('.cot-play [data-field="create-size"]');
      if (size) size.value = '1';
    }, PLAYER_NAMES.alpha);
    await pageA.click('.cot-play [data-action="create"]');
    await waitFor(pageA, () => document.querySelector('.cot-play .lobby')?.classList.contains('show') && /[?&]room=[A-Z0-9]{6}/.test(location.search),
      'A room created', 60_000);
    const invite = new URL(await pageA.evaluate(() => location.href));
    const roomCode = invite.searchParams.get('room');
    const roomOf = () => rooms.roomService.rooms.get(roomCode)?.snapshot ?? null;
    if (invite.searchParams.get('v') !== '2') throw new Error(`the invite link is not stamped v=2: ${invite.href}`);
    await until(() => roomOf(), 'the room on the server', 10_000);
    const alphaId = roomOf().adminId;
    log(`room ${roomCode} created by ${alphaId} (teamSize ${roomOf().settings.teamSize})`);
    if (roomOf().settings.mapId !== plan.mapId) await pickMenuValue(pageA, 'map', plan.mapId);
    await until(() => roomOf()?.settings.mapId === plan.mapId, `the room's battlefield ${plan.mapId}`, 15_000);
    const playerOf = (id) => roomOf()?.players.find((player) => player.id === id) ?? null;
    if (playerOf(alphaId)?.specId !== options.alpha) await pickMenuValue(pageA, 'vehicle', options.alpha);
    await until(() => playerOf(alphaId)?.specId === options.alpha, `player one's ${options.alpha}`, 15_000);
    if (playerOf(alphaId)?.team !== 'alpha') await pickMenuValue(pageA, 'team', 'alpha');
    await until(() => playerOf(alphaId)?.team === 'alpha', 'player one on alpha', 15_000);

    // ---- player two: Multiplayer → LAN → join by the room code, the other side, the vehicle
    await openLanMenu(pageB, 'B');
    await pageB.evaluate((name, code) => {
      const field = document.querySelector('.cot-play [data-field="name"]');
      if (field) field.value = name;
      const input = document.querySelector('.cot-play [data-field="code"]');
      input.value = code;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, PLAYER_NAMES.bravo, roomCode);
    await waitFor(pageB, () => { const button = document.querySelector('.cot-play [data-action="join"]'); return !!button && !button.disabled; },
      'B join enabled', 10_000);
    await pageB.click('.cot-play [data-action="join"]');
    await waitFor(pageB, () => document.querySelector('.cot-play .lobby.show .players')?.children.length === 2
      || document.querySelector('.cot-play .status')?.classList.contains('err'), 'B joined the lobby', 60_000);
    const joinError = await pageB.evaluate(() => (document.querySelector('.cot-play .status')?.classList.contains('err')
      ? document.querySelector('.cot-play .status').textContent : ''));
    if (joinError) throw new Error(`player two could not join room ${roomCode}: ${joinError}`);
    await until(() => roomOf()?.players.length === 2, 'two seats in the room', 15_000);
    const bravoId = roomOf().players.find((player) => player.id !== alphaId).id;
    if (playerOf(bravoId)?.team !== 'bravo') await pickMenuValue(pageB, 'team', 'bravo');
    await until(() => playerOf(bravoId)?.team === 'bravo', 'player two on bravo', 15_000);
    if (playerOf(bravoId)?.specId !== options.bravo) await pickMenuValue(pageB, 'vehicle', options.bravo);
    await until(() => playerOf(bravoId)?.specId === options.bravo, `player two's ${options.bravo}`, 15_000);
    await waitFor(pageA, () => document.querySelector('.cot-play .lobby.show .players')?.children.length === 2, 'A sees player two', 30_000);
    const lobby = roomOf();
    log(`lobby: ${lobby.players.map((player) => `${player.name} ${player.team} ${player.specId} ${player.camo}`).join(' | ')}; map ${lobby.settings.mapId}, ${lobby.settings.gameMode}, teamSize ${lobby.settings.teamSize}`);

    // ---- both ready, player one starts
    await pageB.click('.cot-play [data-action="ready"]');
    await pageA.click('.cot-play [data-action="ready"]');
    await until(() => roomOf()?.players.every((player) => player.ready), 'both players ready', 20_000);
    await waitFor(pageA, () => !document.querySelector('.cot-play [data-action="start"]')?.disabled, 'A start enabled', 30_000);
    await pageA.click('.cot-play [data-action="start"]');
    await until(() => staged.actor, 'the match authority', 60_000);
    log(`match ${roomOf()?.match?.id ?? '?'} seed ${staged.start.seed} on ${staged.start.mapId}: ${staged.start.seats.map((seat) => `${seat.team} ${seat.specId} @ ${seat.spawn ? `${seat.spawn.x},${seat.spawn.z}` : 'deployment'}`).join(' vs ')}, ${staged.start.bots} bots`);
    if (staged.start.seed !== seedInfo.seed) throw new Error(`the room drew seed ${staged.start.seed}, not ${seedInfo.seed}`);

    const inBattle = () => window.__MULTIPLAYER_V2?.stats?.().inMatch === true && window.__DEBUG?.game?.phase === 'battle'
      && getComputedStyle(document.querySelector('.cot-bl')).display === 'none'
      && !document.querySelector('.cot-play')?.classList.contains('show');
    await Promise.all([waitFor(pageA, inBattle, 'A battle revealed', 480_000), waitFor(pageB, inBattle, 'B battle revealed', 480_000)]);
    log('both battles revealed');

    // ---- the moment: each camera on its own hull's shoulder, both turrets on the other, the countdown over
    const firstFraming = FRAMINGS[options.framings[0]];
    await Promise.all([installCamera(pageA, bravoId, firstFraming), installCamera(pageB, alphaId, firstFraming)]);
    const facing = () => window.__DEBUG?.game?.phase === 'battle' && window.__DEBUG.game.preBattleS <= 0 && !window.__DEBUG.game.result
      && !!window.__DEBUG.game.tankById?.get(window.__COT_DUAL?.opponentId)?.networkVisible;
    await Promise.all([waitFor(pageA, facing, 'A sees player two', 60_000), waitFor(pageB, facing, 'B sees player one', 60_000)]);
    await until(() => { const turrets = turretErrors(staged.actor, alphaId, bravoId); return turrets && turrets.alpha < 0.035 && turrets.bravo < 0.035; },
      'both turrets on target (authority)', 45_000);
    await Promise.all([pageA, pageB].map((page) => page.evaluate(() => window.__DEBUG?.post?.pinDynScale?.(1))));
    await sleep(1500);

    // A degraded link paints a banner across both views ("Unstable connection · slow updates", src/ui/multiplayerStatus.ts):
    // shoot only while both links are healthy, waiting out a loaded machine's late snapshots
    const linkHealthy = () => { const banner = document.querySelector('.cot-mp-banner'); return !banner || banner.hidden || getComputedStyle(banner).display === 'none'; };
    const healthyLinks = () => Promise.all([waitFor(pageA, linkHealthy, 'A link healthy', 180_000), waitFor(pageB, linkHealthy, 'B link healthy', 180_000)]);
    const shots = [];
    for (const name of options.framings) {
      await Promise.all([pageA, pageB].map((page) => page.evaluate((framing) => { window.__COT_DUAL.framing = framing; }, FRAMINGS[name])));
      await sleep(1600); // several frames on the new pose: temporal AA settles after the cut
      // (2026-10-15: the two screenshots, asked for together, came back 2,978 ms apart and the HUD clocks read 14:29 and
      // 14:25; the browser serves the two PNG encodes one after the other. Fast PNG encoding, and a framing whose two
      // frames land more than SKEW_MAX_MS apart is taken again, up to four times)
      let viewA, viewB, serverTick, shotA, shotB;
      for (let attempt = 1; attempt <= 4; attempt++) {
        await healthyLinks();
        [viewA, viewB] = await Promise.all([readView(pageA), readView(pageB)]);
        serverTick = staged.actor.tick;
        [shotA, shotB] = await Promise.all([pageA, pageB].map((page) => page.screenshot({ type: 'png', optimizeForSpeed: true })
          .then((bytes) => ({ bytes, at: Date.now() }))));
        if (Math.abs(shotA.at - shotB.at) <= SKEW_MAX_MS) break;
        log(`${name}: the two frames ${Math.abs(shotA.at - shotB.at)} ms apart (attempt ${attempt} of 4)${attempt < 4 ? '; again' : '; kept'}`);
      }
      const files = { alpha: join(options.work, `alpha-${name}.png`), bravo: join(options.work, `bravo-${name}.png`) };
      writeFileSync(files.alpha, shotA.bytes);
      writeFileSync(files.bravo, shotB.bytes);
      const turrets = turretErrors(staged.actor, alphaId, bravoId);
      shots.push({
        framing: name, files, serverTick, skewMs: Math.abs(shotA.at - shotB.at),
        turretErrorDeg: turrets ? { alpha: +(turrets.alpha * 180 / Math.PI).toFixed(2), bravo: +(turrets.bravo * 180 / Math.PI).toFixed(2) } : null,
        views: { alpha: viewA, bravo: viewB },
      });
      log(`captured ${name}: tick ${serverTick}, skew ${Math.abs(shotA.at - shotB.at)} ms, distance ${viewA.distanceM} m, opponent at ${JSON.stringify(viewA.opponentNdc)} / ${JSON.stringify(viewB.opponentNdc)}`);
    }

    const room = roomOf();
    return {
      roomCode,
      inviteVersion: invite.searchParams.get('v'),
      room: room ? { mode: room.mode, phase: room.phase, settings: room.settings, match: room.match, host: room.host,
        players: room.players.map((player) => ({ id: player.id, name: player.name, team: player.team, seat: player.seat, specId: player.specId, camo: player.camo })) } : null,
      start: staged.start,
      authority: { alpha: authorityPose(staged.actor, alphaId), bravo: authorityPose(staged.actor, bravoId), tick: staged.actor.tick },
      alphaId,
      bravoId,
      shots,
      errors,
      lock,
    };
  } finally {
    const teardown = async () => {
      await closeBrowser(browser);
      try { await vite?.close(); } catch { /* already gone */ }
      try { await rooms?.close(); } catch { /* already gone */ }
    };
    await Promise.race([teardown(), sleep(30_000)]);
    releaseLock();
  }
}

// ------------------------------------------------------------------ composition (after the lock: no GPU)

function executable(name, fallbacks = []) {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (directory && existsSync(join(directory, name))) return join(directory, name);
  }
  return fallbacks.find((path) => existsSync(path)) ?? null;
}

function run(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${binary} ${args.join(' ')}\n${result.stderr || result.error || ''}`);
  return result;
}

/** WebP canvas size from its RIFF header (VP8X, lossy VP8 or lossless VP8L). */
function webpSize(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') throw new Error('not a WebP file');
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  if (chunk === 'VP8 ') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  throw new Error(`unknown WebP chunk ${chunk}`);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function compositionHtml({ panels, fonts }) {
  const faces = fonts.map(({ weight, data }) => `@font-face{font-family:'Caption';src:url(data:font/woff2;base64,${data}) format('woff2');font-weight:${weight};font-display:block}`).join('');
  const panel = ({ side, slot, name, vehicle, image }) => `<section class="panel ${side}">
    <div class="head"><span class="side">${side === 'alpha' ? 'Alpha' : 'Bravo'}</span><span class="who"><i>${slot}</i>${escapeHtml(name)}</span>
      <span class="live">Live</span><span class="vehicle">${escapeHtml(vehicle)}</span></div>
    <div class="accent"></div><img src="data:image/png;base64,${image}" width="${PANEL.width}" height="${PANEL.height}" alt=""><div class="frame"></div></section>`;
  const right = PANEL.marginX + PANEL.width + PANEL.gap;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${faces}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${OUTPUT.width}px;height:${OUTPUT.height}px;overflow:hidden;background:#05080c}
body{position:relative;color:#e8edf2;font-family:'Caption','Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased}
.panel{position:absolute;top:0;width:${PANEL.width}px;height:${OUTPUT.height}px}
.panel.alpha{left:${PANEL.marginX}px}.panel.bravo{left:${right}px}
.head{position:absolute;left:0;right:0;top:7px;height:24px;display:flex;align-items:center;gap:14px;font-size:14px;line-height:1;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap}
.alpha .head{padding-right:44px}.bravo .head{padding-left:44px}
.side{display:inline-flex;align-items:center;height:22px;padding:1px 10px 0;font-weight:700;font-size:11px;letter-spacing:.22em;color:#05080c}
.alpha .side{background:#f0a030}.bravo .side{background:#77b8d8}
.who{font-weight:700;color:#f3f6f9}.who i{font-style:normal;font-weight:500;color:#8e9ba7;margin-right:10px}
.live{display:inline-flex;align-items:center;gap:7px;font-weight:700;font-size:11px;letter-spacing:.2em;color:#74d68f}
.live::before{content:'';width:7px;height:7px;border-radius:50%;background:#74d68f;box-shadow:0 0 8px rgba(116,214,143,.7)}
.vehicle{margin-left:auto;font-weight:500;color:#b9c4ce}
.accent{position:absolute;left:0;right:0;top:${PANEL.top - 2}px;height:2px}
.alpha .accent{background:#f0a030}.bravo .accent{background:#77b8d8}
img{position:absolute;left:0;top:${PANEL.top}px;display:block}
.frame{position:absolute;left:0;top:${PANEL.top}px;width:${PANEL.width}px;height:${PANEL.height}px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}
.vs{position:absolute;left:${OUTPUT.width / 2}px;top:19px;width:46px;height:26px;margin:-13px 0 0 -23px;display:grid;place-items:center;background:#0a0f15;border:1px solid #f0a030;font-weight:700;font-size:12px;letter-spacing:.14em;color:#f6bd61}
</style></head><body>${panels.map(panel).join('')}<div class="vs">VS</div></body></html>`;
}

async function compose({ options, record, framing }) {
  const shot = record.shots.find((entry) => entry.framing === framing);
  if (!shot) throw new Error(`no ${framing} capture in ${join(options.work, 'capture.json')} (captured: ${record.shots.map((entry) => entry.framing).join(', ')})`);
  const ffmpeg = executable('ffmpeg', ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']);
  const cwebp = executable('cwebp', ['/opt/homebrew/bin/cwebp', '/usr/local/bin/cwebp']);
  const panelImage = (file, side) => {
    if (!ffmpeg) return readFileSync(file).toString('base64'); // the browser scales instead
    const scaled = join(options.work, `${side}-${framing}-panel.png`);
    run(ffmpeg, ['-loglevel', 'error', '-y', '-i', file, '-vf', `scale=${PANEL.width}:${PANEL.height}:flags=lanczos+accurate_rnd+full_chroma_int`,
      '-frames:v', '1', scaled]);
    return readFileSync(scaled).toString('base64');
  };
  const fontDir = join(ROOT, 'public/fonts/abc-monument-grotesk');
  const fonts = [['ABCMonumentGrotesk-Medium.woff2', 500], ['ABCMonumentGrotesk-Bold.woff2', 700]]
    .filter(([file]) => existsSync(join(fontDir, file)))
    .map(([file, weight]) => ({ weight, data: readFileSync(join(fontDir, file)).toString('base64') }));
  const players = record.players;
  const html = compositionHtml({
    fonts,
    panels: ['alpha', 'bravo'].map((side, index) => ({
      side, slot: index === 0 ? 'Player one' : 'Player two', name: players[side].name, vehicle: players[side].vehicle,
      image: panelImage(shot.files[side], side),
    })),
  });
  const puppeteer = (await import('puppeteer')).default;
  // software only: the composition never touches the GPU the capture lock guards
  const browser = await puppeteer.launch({
    headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
  });
  let composed;
  let fallbackWebp = null;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: OUTPUT.width, height: OUTPUT.height, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    composed = await page.screenshot({ type: 'png' });
    if (!cwebp) fallbackWebp = await page.screenshot({ type: 'webp', quality: WEBP_QUALITY });
  } finally {
    await closeBrowser(browser, 10_000);
  }
  const composedFile = join(options.work, `composed-${framing}.png`);
  writeFileSync(composedFile, composed);
  mkdirSync(options.out, { recursive: true });
  const target = join(options.out, OUTPUT_NAME);
  const temporary = `${target}.tmp-${process.pid}`;
  let encoder;
  if (cwebp) {
    const args = ['-quiet', '-q', String(WEBP_QUALITY), '-m', '6', '-sharp_yuv', '-mt', '-metadata', 'none'];
    run(cwebp, [...args, composedFile, '-o', temporary]);
    encoder = { name: 'cwebp', version: spawnSync(cwebp, ['-version'], { encoding: 'utf8' }).stdout.trim().split('\n')[0], quality: WEBP_QUALITY, args };
  } else {
    writeFileSync(temporary, fallbackWebp);
    encoder = { name: 'chrome', quality: WEBP_QUALITY, args: [] };
  }
  renameSync(temporary, target);
  const bytes = readFileSync(target);
  const size = webpSize(bytes);
  if (size.width !== OUTPUT.width || size.height !== OUTPUT.height) throw new Error(`encoded ${size.width}×${size.height}, expected ${OUTPUT.width}×${OUTPUT.height}`);
  return { target, bytes, size, encoder, composedFile, shot };
}

function writeManifest({ options, record, composed }) {
  const { shot, bytes } = composed;
  const view = (side) => {
    const entry = shot.views[side];
    return {
      distanceM: entry.distanceM, opponentVisible: entry.opponent?.visible ?? false, opponentNdc: entry.opponentNdc,
      camera: entry.camera, canvas: entry.canvas, renderScale: entry.renderScale, dynScale: entry.dynScale,
      networkStrip: entry.networkStrip, timeOfDay: entry.timeOfDay,
    };
  };
  const player = (side, slot) => ({
    slot,
    side,
    name: record.players[side].name,
    playerId: record.players[side].id,
    vehicle: { specId: record.players[side].specId, name: record.players[side].vehicle },
    camo: record.players[side].camo,
    turretErrorDeg: shot.turretErrorDeg?.[side] ?? null,
    view: view(side),
  });
  const manifest = {
    schemaVersion: 1,
    tool: TOOL,
    file: OUTPUT_NAME,
    width: composed.size.width,
    height: composed.size.height,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    encoder: composed.encoder,
    createdAt: new Date().toISOString(),
    capturedAt: record.capturedAt,
    subject: 'Two real rendered player views of one live multiplayer v2 match, captured at the same instant, each from its own player camera with its own HUD',
    multiplayer: {
      version: 2,
      sameMatch: true,
      oppositeSides: true,
      roomMode: record.room?.mode ?? 'lan',
      roomService: 'server/rooms/serve.ts (in-process LAN room host)',
      matchTransport: 'service',
      gameMode: record.room?.settings?.gameMode ?? record.start?.mode ?? null,
      teamSize: record.room?.settings?.teamSize ?? null,
      bots: record.start?.bots ?? null,
      matchId: shot.views.alpha.matchId,
      seed: record.start?.seed ?? null,
      timeOfDay: record.timeOfDay,
    },
    map: { id: record.map.id, name: record.map.name },
    viewport: VIEWPORT,
    framing: { name: shot.framing, ...FRAMINGS[shot.framing] },
    staging: {
      separationM: record.plan.separationM, hullAngleDeg: record.plan.hullAngleDeg, bearingDeg: record.plan.bearingDeg,
      center: record.plan.center, alpha: record.plan.alpha, bravo: record.plan.bravo,
    },
    players: [player('alpha', 'player-one'), player('bravo', 'player-two')],
    capture: {
      serverTick: shot.serverTick,
      skewMs: shot.skewMs,
      framingsCaptured: record.shots.map((entry) => entry.framing),
      niceness: record.niceness,
      lockWaitMs: record.lock?.waitedMs ?? null,
      lockHeldMs: record.lock?.heldMs ?? null,
      browserErrors: (record.errors ?? []).length,
    },
  };
  const file = join(options.out, 'manifest.json');
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  return { file, manifest };
}

/** What makes a capture unpublishable: either view out of the live battle, blind to the other player, or framing it off
 * screen; the two pages in different matches; an uncaught page error. */
function captureProblems(record) {
  const problems = [];
  for (const shot of record.shots) {
    for (const side of ['alpha', 'bravo']) {
      const view = shot.views[side];
      if (view.phase !== 'battle' || view.result) problems.push(`${shot.framing}: ${side} left the live battle (${view.phase}, ${view.result})`);
      if (!view.opponent?.visible) problems.push(`${shot.framing}: ${side} does not see the other player`);
      const ndc = view.opponentNdc;
      if (!ndc || Math.abs(ndc[0]) > 0.9 || Math.abs(ndc[1]) > 0.9 || ndc[2] > 1) problems.push(`${shot.framing}: ${side}'s opponent is off screen (${JSON.stringify(ndc)})`);
    }
    if (!shot.views.alpha.matchId || shot.views.alpha.matchId !== shot.views.bravo.matchId) {
      problems.push(`${shot.framing}: the pages report matches ${shot.views.alpha.matchId} / ${shot.views.bravo.matchId}`);
    }
  }
  for (const entry of record.errors.filter((error) => error.kind === 'pageerror')) problems.push(`page error on ${entry.page}: ${entry.text.slice(0, 240)}`);
  return problems;
}

// ------------------------------------------------------------------ main

async function main() {
  const options = readOptions();
  const niceness = lowerPriority();
  mkdirSync(options.work, { recursive: true });
  const recordFile = join(options.work, 'capture.json');
  let record;
  if (options.recompose) {
    if (!existsSync(recordFile)) throw new Error(`--recompose needs ${recordFile} from an earlier capture`);
    record = JSON.parse(readFileSync(recordFile, 'utf8'));
    log(`recomposing the ${record.shots.length} saved capture(s) of match ${record.shots[0]?.views?.alpha?.matchId ?? '?'}`);
  } else {
    const { isMapId, getMapName } = await import('../../src/world/maps/mapIds.ts');
    if (!isMapId(options.mapId)) throw new Error(`unknown battlefield ${options.mapId}`);
    const seedInfo = await chooseSeed(options.mapId, options.seed);
    log(`seed ${seedInfo.seed} (${seedInfo.timeOfDay} on a ${seedInfo.biome} map); planning the ${options.separationM} m lane on ${options.mapId} (CPU only, no lock yet)`);
    const plan = await planFaceoff({ mapId: options.mapId, separationM: options.separationM, hullAngleDeg: options.hullAngleDeg, framingNames: Object.keys(FRAMINGS) });
    log(`lane: bearing ${plan.bearingDeg}°, centre ${plan.center.join(', ')}, alpha ${plan.alpha.x},${plan.alpha.z} → bravo ${plan.bravo.x},${plan.bravo.z}; background alpha ${JSON.stringify(plan.background.alpha)}, bravo ${JSON.stringify(plan.background.bravo)}; search ${JSON.stringify(plan.search)}`);
    if (options.planOnly) {
      console.log(JSON.stringify({ seed: seedInfo, plan }, null, 2));
      return;
    }
    const captured = await capture({ options, plan, seedInfo });
    const playerOf = (side) => {
      const view = captured.shots[0].views[side];
      const seat = captured.room?.players.find((entry) => entry.team === side);
      return { id: view.own?.id ?? seat?.id, name: seat?.name ?? PLAYER_NAMES[side], specId: view.own?.specId ?? seat?.specId,
        vehicle: view.own?.vehicle ?? seat?.specId, camo: view.own?.camo ?? seat?.camo };
    };
    record = {
      tool: TOOL, capturedAt: new Date().toISOString(), niceness, seed: seedInfo, timeOfDay: captured.shots[0].views.alpha.timeOfDay ?? seedInfo.timeOfDay,
      map: { id: options.mapId, name: getMapName(options.mapId) }, plan, ...captured,
      players: { alpha: playerOf('alpha'), bravo: playerOf('bravo') },
    };
    writeFileSync(recordFile, `${JSON.stringify(record, null, 2)}\n`);
    if (captured.errors.length) {
      log(`${captured.errors.length} browser error(s) during the capture (recorded in ${recordFile}):`);
      for (const entry of captured.errors.slice(0, 8)) log(`  ${entry.page} ${entry.kind}: ${entry.text.slice(0, 300)}`);
    }
    const problems = captureProblems(record);
    if (problems.length) {
      throw new Error(`the capture is not publishable (views and record kept in ${options.work}; after a look, --recompose composes them anyway):\n  ${problems.join('\n  ')}`);
    }
  }
  const framing = options.framing ?? record.shots[0].framing;
  const composed = await compose({ options, record, framing });
  const { file, manifest } = writeManifest({ options, record, composed });
  log(`wrote ${composed.target} (${manifest.width}×${manifest.height}, ${manifest.bytes} bytes, sha256 ${manifest.sha256.slice(0, 16)}…) and ${file}`);
  console.log(JSON.stringify({
    ok: true, output: composed.target, manifest: file, composed: composed.composedFile, framing,
    map: manifest.map, players: manifest.players.map((entry) => ({ side: entry.side, name: entry.name, vehicle: entry.vehicle, distanceM: entry.view.distanceM })),
    matchId: manifest.multiplayer.matchId, skewMs: manifest.capture.skewMs, lockHeldMs: manifest.capture.lockHeldMs,
  }, null, 2));
}

// an interrupted run still leaves the capture lock through the exit handler
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => process.exit(signal === 'SIGINT' ? 130 : 143));

try {
  await main();
} catch (error) {
  log(`FAILED: ${error?.stack || error}`);
  process.exitCode = 1;
}
