// Deterministic same-camera comparison of the authored telephone pole and its
// distance representation. Both frames use one live battlefield/world state;
// only the reviewed pole geometry changes between captures.
//
// Usage: node tools/world-pole-visual-audit.mjs --out=/tmp/pole-audit
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
const option = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const outputDir = resolve(option('out', '/tmp/cot-pole-audit'));
const width = Number(option('width', '1920'));
const height = Number(option('height', '1080'));
mkdirSync(outputDir, { recursive: true });

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
const port = server.httpServer.address().port;
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1 });

try {
  await page.goto(`http://127.0.0.1:${port}/`, {
    waitUntil: 'domcontentloaded', timeout: 120000,
  });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  const receipt = await page.evaluate(async () => {
    await window.__SHOTS.set('battlefield');
    const debug = window.__DEBUG;
    const full = debug.world.group.getObjectByName('baked-pole-full');
    const distance = debug.world.group.getObjectByName('baked-pole-distance');
    if (!full || !distance) throw new Error('telephone-pole LOD meshes missing');
    const poles = debug.world.crushables.filter((record) => record.index != null);
    if (!poles.length) throw new Error('verdant exposes no telephone poles');
    const Vector3 = debug.camera.position.constructor;
    const Matrix4 = full.matrix.constructor;
    const viewDistance = 138;
    const obstacles = debug.world.getObstacles();
    const segmentHits = (ax, az, bx, bz, obstacle) => {
      let t0 = 0.04, t1 = 0.96;
      for (const [origin, delta, min, max] of [
        [ax, bx - ax, obstacle.min[0] - 0.8, obstacle.max[0] + 0.8],
        [az, bz - az, obstacle.min[2] - 0.8, obstacle.max[2] + 0.8],
      ]) {
        if (Math.abs(delta) < 1e-8) {
          if (origin < min || origin > max) return false;
          continue;
        }
        let near = (min - origin) / delta, far = (max - origin) / delta;
        if (near > far) [near, far] = [far, near];
        t0 = Math.max(t0, near);
        t1 = Math.min(t1, far);
        if (t0 > t1) return false;
      }
      return true;
    };
    const evaluateView = (pole, groundY, index) => {
      const azimuth = index * Math.PI * 2 / 24;
      const x = pole.x + Math.sin(azimuth) * viewDistance;
      const z = pole.z + Math.cos(azimuth) * viewDistance;
      const y = debug.world.heightField.getHeightAt(x, z);
      const cameraY = Math.max(y + 6.2, groundY + 8.05);
      let blocked = 0;
      for (let step = 2; step < 20; step += 1) {
        const t = step / 20;
        const sx = x + (pole.x - x) * t;
        const sz = z + (pole.z - z) * t;
        const sightY = cameraY + (groundY + 3.55 - cameraY) * t;
        const terrainY = debug.world.heightField.getHeightAt(sx, sz);
        if (terrainY > sightY - 0.45) blocked += terrainY - sightY + 0.45;
      }
      let obstacleHits = 0;
      for (const obstacle of obstacles) {
        if (segmentHits(x, z, pole.x, pole.z, obstacle)) obstacleHits += 1;
      }
      const score = obstacleHits * 10000 + blocked * 1000
        + Math.abs(y - groundY) + Math.hypot(pole.x, pole.z) * 0.001;
      return { pole, groundY, x, y, z, cameraY, score };
    };
    const selectPoleView = () => {
      let selected = null;
      for (const pole of poles) {
      const groundY = debug.world.heightField.getHeightAt(pole.x, pole.z);
      for (let index = 0; index < 24; index += 1) {
          const candidate = evaluateView(pole, groundY, index);
          if (!selected || candidate.score < selected.score) selected = candidate;
        }
      }
      return selected;
    };
    const selected = selectPoleView();
    const { pole, groundY } = selected;
    const target = new Vector3(pole.x, groundY + 3.55, pole.z);
    const camera = new Vector3(selected.x, selected.cameraY, selected.z);
    debug.rig.setExternalPose(camera, target, 22);
    debug.camera.updateProjectionMatrix();
    debug.camera.updateMatrixWorld(true);
    debug.world.update(0, debug.camera.position, null, null);

    const nearestPoleInstance = () => {
      const matrix = new Matrix4();
      let nearest = null;
      for (const mesh of [full, distance]) {
        for (let index = 0; index < mesh.count; index += 1) {
          mesh.getMatrixAt(index, matrix);
          const elements = matrix.elements;
          const d2 = (elements[12] - pole.x) ** 2 + (elements[14] - pole.z) ** 2;
          if (!nearest || d2 < nearest.d2) nearest = { matrix: matrix.clone(), d2 };
        }
      }
      return nearest;
    };
    const nearest = nearestPoleInstance();
    if (!nearest || nearest.d2 > 0.01) throw new Error('review pole instance matrix missing');

    full.visible = false;
    distance.visible = false;
    // InstancedMesh is not the right temporary primitive; construct an
    // ordinary Mesh through the authored mesh's base class constructor.
    const Mesh = Object.getPrototypeOf(Object.getPrototypeOf(full)).constructor;
    const subject = new Mesh(full.geometry, full.material);
    subject.name = 'telephone-pole-review-subject';
    subject.matrixAutoUpdate = false;
    subject.matrix.copy(nearest.matrix);
    subject.castShadow = true;
    subject.receiveShadow = true;
    full.parent.add(subject);
    // The wide live battle frames already prove scene-level parity. Isolate
    // this one reviewed subject so the exact silhouette/material change is
    // readable instead of being hidden behind a village or tree canopy.
    debug.world.group.traverse((object) => {
      if (object === subject) return;
      if (object.isMesh || object.isPoints || object.isLine) object.visible = false;
    });
    debug.lighting.updateFrustums();
    debug.lighting.update(true);

    const triangleCount = (geometry) => Math.floor(
      (geometry.index?.count || geometry.getAttribute('position').count) / 3);
    window.__POLE_AUDIT = {
      subject,
      full,
      distance,
      sourceGeometry: full.geometry,
      distanceGeometry: distance.geometry,
    };
    return {
      pole: { x: pole.x, y: pole.y, z: pole.z },
      camera: camera.toArray(),
      target: target.toArray(),
      distanceM: camera.distanceTo(target),
      sourceTriangles: triangleCount(full.geometry),
      distanceTriangles: triangleCount(distance.geometry),
    };
  });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 900));
  await page.screenshot({ path: `${outputDir}/source.png`, type: 'png' });

  await page.evaluate(() => {
    const audit = window.__POLE_AUDIT;
    audit.subject.geometry = audit.distanceGeometry;
    window.__DEBUG.lighting.update(true);
  });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 900));
  await page.screenshot({ path: `${outputDir}/distance.png`, type: 'png' });
  console.log(`[world-pole] ${receipt.sourceTriangles.toLocaleString()} -> ${receipt.distanceTriangles.toLocaleString()} triangles`);
  console.log(JSON.stringify(receipt));
} finally {
  await browser.close();
  await server.close();
}
