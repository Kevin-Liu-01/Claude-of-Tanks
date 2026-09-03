// Deterministic close gameplay-scale capture of the first baked battlefield
// wreck. Used by geometry audits to compare the static hulk representation
// independently from live tanks and the wide establishing shots.
//
// Usage: node tools/world-wreck-visual-audit.mjs --out=/tmp/wreck.png
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
const option = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const outputPath = resolve(option('out', '/tmp/cot-wreck-audit.png'));
const width = Number(option('width', '1920'));
const height = Number(option('height', '1080'));
mkdirSync(dirname(outputPath), { recursive: true });

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: {
    host: '127.0.0.1',
    port: 7900 + (process.pid % 80),
    strictPort: true,
    hmr: false,
    watch: null,
  },
});
await server.listen();
const port = server.httpServer.address().port;
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1 });

try {
  await page.goto(`http://127.0.0.1:${port}/`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  const receipt = await page.evaluate(async () => {
    const selectView = (debug, spot, groundY, distance) => {
      let selected = null;
      for (let index = 0; index < 24; index += 1) {
        const azimuth = spot.yaw + Math.PI * 0.72 + index * Math.PI * 2 / 24;
        const cameraX = spot.x + Math.sin(azimuth) * distance;
        const cameraZ = spot.z + Math.cos(azimuth) * distance;
        const cameraGroundY = debug.world.heightField.getHeightAt(cameraX, cameraZ);
        const score = Math.abs(cameraGroundY - groundY);
        if (!selected || score < selected.score) {
          selected = { azimuth, cameraX, cameraZ, cameraGroundY, score };
        }
      }
      return selected;
    };
    const collectTopGeometry = (debug) => {
      const records = [];
      const isVisible = (object) => {
        for (let node = object; node; node = node.parent) {
          if (node.visible === false) return false;
          if (node === debug.world.group) break;
        }
        return true;
      };
      const primitiveCount = (object) => {
        const positionCount = object.geometry.getAttribute('position')?.count || 0;
        let count = object.geometry.index?.count || positionCount;
        if (object.isInstancedMesh) count *= Math.max(0, object.count || 0);
        if (object.isBatchedMesh && object._multiDrawCounts) {
          count = 0;
          for (let index = 0; index < object._multiDrawCount; index += 1) {
            count += Math.abs(object._multiDrawCounts[index] || 0);
          }
        }
        return count;
      };
      const topSubsystem = (object) => {
        let subsystem = object;
        while (subsystem.parent && subsystem.parent !== debug.world.group) subsystem = subsystem.parent;
        return subsystem;
      };
      debug.world.group.traverse((object) => {
        if (!(object.isMesh || object.isPoints || object.isLine) || !object.geometry) return;
        if (!isVisible(object)) return;
        const subsystem = topSubsystem(object);
        const primitives = primitiveCount(object);
        records.push({
          subsystem: subsystem.name || subsystem.type,
          name: object.name || '(unnamed)',
          geometryType: object.geometry.type,
          material: (Array.isArray(object.material) ? object.material : [object.material])
            .map((material) => material?.name || material?.type || '(none)').join('|'),
          instances: object.isInstancedMesh ? object.count : 1,
          triangles: object.isMesh ? Math.floor(primitives / 3) : 0,
          castShadow: !!object.castShadow,
          userData: Object.keys(object.userData || {}).sort(),
        });
      });
      return records.sort((a, b) => b.triangles - a.triangles);
    };
    await window.__SHOTS.set('battlefield');
    const debug = window.__DEBUG;
    const spot = debug.world?.tankWreckSpots?.[0];
    if (!spot) throw new Error('verdant exposes no tank wreck spot');
    const wreck = debug.world.group.getObjectByName('tank-wrecks');
    if (!wreck?.geometry) throw new Error('tank-wrecks geometry missing');
    const Vector3 = debug.camera.position.constructor;
    const groundY = debug.world.heightField.getHeightAt(spot.x, spot.z);
    const target = new Vector3(spot.x, groundY + 1.15, spot.z);
    const distance = Math.max(11, Math.min(15, Math.hypot(spot.hx, spot.hz) * 1.9));
    // Wrecks can sit beside steep roads. Pick the nearest level viewing arc
    // deterministically so the probe never buries the camera in a ridge or
    // frames the hulk behind intervening terrain.
    const view = selectView(debug, spot, groundY, distance);
    const { cameraX, cameraZ, cameraGroundY } = view;
    const camera = new Vector3(
      cameraX,
      Math.max(target.y + Math.max(3.1, spot.h * 0.75), cameraGroundY + 2.4),
      cameraZ,
    );
    debug.rig.setExternalPose(camera, target, 42);
    debug.camera.updateProjectionMatrix();
    debug.camera.updateMatrixWorld(true);
    debug.world.update(0, debug.camera.position, null, null);
    debug.lighting.updateFrustums();
    debug.lighting.update(true);
    const position = wreck.geometry.getAttribute('position');
    const topGeometry = collectTopGeometry(debug);
    return {
      spot,
      mergedWreckTriangles: Math.floor((wreck.geometry.index?.count || position.count) / 3),
      groundY,
      cameraGroundY,
      camera: camera.toArray(),
      target: target.toArray(),
      topGeometry: topGeometry.slice(0, 40),
    };
  });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 1200));
  await page.screenshot({ path: outputPath, type: 'png' });
  console.log(`[world-wreck] ${receipt.spot.specId}, ${receipt.mergedWreckTriangles.toLocaleString()} triangles -> ${outputPath}`);
  console.log(JSON.stringify(receipt));
} finally {
  await browser.close();
  await server.close();
}
