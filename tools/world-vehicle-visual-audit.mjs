// Deterministic gameplay-scale capture of one live instanced civilian vehicle.
// Usage:
//   node tools/world-vehicle-visual-audit.mjs --map=urban --out=/tmp/urban-car.png
//   node tools/world-vehicle-visual-audit.mjs --map=desert --kind=pickup --out=/tmp/pickup.png

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
const option = (name, fallback = '') => {
  const inline = args.find((argument) => argument.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const mapId = option('map', 'urban');
const requestedKind = option('kind', 'auto');
const outputPath = resolve(option('out', `/tmp/cot-${mapId}-vehicle-audit.png`));
const width = Number(option('width', '1600'));
const height = Number(option('height', '1000'));
mkdirSync(dirname(outputPath), { recursive: true });

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: {
    host: '127.0.0.1',
    port: 7980 + (process.pid % 80),
    strictPort: true,
    hmr: false,
    watch: null,
  },
});
await server.listen();
const address = server.httpServer.address();
const port = typeof address === 'object' && address ? address.port : server.config.server.port;
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1 });
const browserErrors = [];
page.on('pageerror', (error) => browserErrors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('favicon')) browserErrors.push(message.text());
});

try {
  await page.goto(`http://127.0.0.1:${port}/?debug=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForFunction('window.__GAME_READY === true && window.__DEBUG', { timeout: 120000 });
  const receipt = await page.evaluate(async ({ selectedMap, preferredKind }) => {
    const viewMapId = selectedMap === 'titan_gorge' ? 'titan_gorge' : selectedMap;
    const view = selectedMap === 'verdant' ? 'battlefield' : `battlefield_${viewMapId}`;
    await window.__SHOTS.set(view);
    const debug = window.__DEBUG;
    const vehicleKinds = new Set([
      'truck', 'jeep', 'sedan', 'wagon', 'pickup', 'van', 'truckbox', 'truckflatbed',
    ]);
    const pools = [];
    debug.world.group.traverse((object) => {
      if (!object.isInstancedMesh || object.count <= 0 || !object.name.startsWith('destructible-')) return;
      const kind = object.name.slice('destructible-'.length).replace(/-broken$/, '');
      if (!vehicleKinds.has(kind) || object.name.endsWith('-broken')) return;
      pools.push({ kind, object });
    });
    pools.sort((left, right) => left.kind.localeCompare(right.kind));
    const selected = preferredKind === 'auto'
      ? pools[0]
      : pools.find((entry) => entry.kind === preferredKind);
    if (!selected) throw new Error(
      `No ${preferredKind} vehicle pool on ${selectedMap}; available: ${pools.map((entry) => entry.kind).join(', ')}`,
    );

    const Matrix4 = debug.camera.matrixWorld.constructor;
    const Vector3 = debug.camera.position.constructor;
    const matrix = new Matrix4();
    selected.object.getMatrixAt(0, matrix);
    matrix.premultiply(selected.object.matrixWorld);
    const center = new Vector3().setFromMatrixPosition(matrix);
    const target = center.clone();
    target.y += 0.92;
    const groundY = debug.world.heightField.getHeightAt(center.x, center.z);
    let best = null;
    for (let index = 0; index < 24; index++) {
      const azimuth = Math.PI * 0.72 + index * Math.PI * 2 / 24;
      const distance = selected.kind.startsWith('truck') ? 10.5 : 8.2;
      const cameraX = center.x + Math.sin(azimuth) * distance;
      const cameraZ = center.z + Math.cos(azimuth) * distance;
      const cameraGround = debug.world.heightField.getHeightAt(cameraX, cameraZ);
      const roadDistance = Math.abs(debug.world.heightField._roadDist(cameraX, cameraZ));
      const score = Math.abs(cameraGround - groundY) + roadDistance * 0.15;
      if (!best || score < best.score) best = { cameraX, cameraZ, cameraGround, score };
    }
    const camera = new Vector3(
      best.cameraX,
      Math.max(target.y + 2.3, best.cameraGround + 1.9),
      best.cameraZ,
    );
    debug.rig.setExternalPose(camera, target, 38);
    debug.camera.updateProjectionMatrix();
    debug.camera.updateMatrixWorld(true);
    debug.world.update(0, debug.camera.position, null, null);
    debug.lighting.updateFrustums();
    debug.lighting.update(true);
    const geometry = selected.object.geometry;
    const material = selected.object.material;
    const position = geometry.getAttribute('position');
    return {
      mapId: selectedMap,
      kind: selected.kind,
      availableKinds: pools.map((entry) => ({ kind: entry.kind, instances: entry.object.count })),
      instances: selected.object.count,
      trianglesPerInstance: Math.floor((geometry.index?.count || position.count) / 3),
      attributes: Object.keys(geometry.attributes).sort(),
      textureSize: material.map?.image ? [material.map.image.width, material.map.image.height] : null,
      textureSlots: ['map', 'normalMap', 'roughnessMap'].filter((slot) => material[slot]?.isTexture),
      renderer: {
        calls: debug.renderer.info.render.calls,
        triangles: debug.renderer.info.render.triangles,
        geometries: debug.renderer.info.memory.geometries,
        textures: debug.renderer.info.memory.textures,
      },
      camera: camera.toArray(),
      target: target.toArray(),
    };
  }, { selectedMap: mapId, preferredKind: requestedKind });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 1400));
  await page.screenshot({ path: outputPath, type: 'png' });
  if (browserErrors.length) throw new Error(`browser errors: ${browserErrors.join(' | ')}`);
  console.log(`[world-vehicle] ${receipt.mapId}/${receipt.kind} -> ${outputPath}`);
  console.log(JSON.stringify(receipt));
} finally {
  await browser.close();
  await server.close();
}
