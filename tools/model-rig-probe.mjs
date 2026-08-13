// Live articulation gate for the complete garage roster. The static audit
// proves source structure; this probe proves that the selected visual is
// actually seated in the runtime hull/turret/gun/recoil hierarchy.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const failures = [];
let checks = 0;
const check = (name, ok, detail = '') => {
  checks++;
  if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console[ok ? 'log' : 'error'](`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  // Chromium blocks the IRC-family 6665-6669 ports. Keep the randomized QA
  // server range above that forbidden band so a valid rig never fails at
  // navigation before the probe begins.
  server: { port: 6800 + Math.floor(Math.random() * 250), strictPort: false, hmr: false, watch: null },
});
await server.listen();
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
page.setDefaultTimeout(18000);
const browserErrors = [];
page.on('pageerror', (e) => browserErrors.push(String(e)));
page.on('console', (m) => {
  const msg = m.text();
  if (m.type() === 'error' && !msg.includes('favicon')) browserErrors.push(msg);
  if (msg.includes('glb swap failed')) browserErrors.push(msg);
});

try {
  await page.goto(`http://localhost:${server.config.server.port}/?nosplash`, {
    waitUntil: 'domcontentloaded', timeout: 90000,
  });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
  const manifest = await page.evaluate(async () => {
    const { ALL_TANK_IDS, TANK_SPECS, MODEL_SOURCE } = await import('/src/vehicles/specs.js');
    return ALL_TANK_IDS.map((id) => ({
      id,
      turretless: TANK_SPECS[id].armor?.turretless === true,
      source: MODEL_SOURCE[id]?.source || 'procedural',
      cfg: MODEL_SOURCE[id]?.glb || null,
    }));
  });
  const requested = process.argv.slice(2);
  const rows = requested.length ? manifest.filter((r) => requested.includes(r.id)) : manifest;
  check('complete manifest loaded', rows.length === (requested.length || manifest.length), `${rows.length} vehicles`);

  for (const row of rows) {
    const errorStart = browserErrors.length;
    await page.evaluate((id) => window.__DEBUG.selectGarageTank(id), row.id);
    await page.waitForFunction((id) => {
      const v = window.__DEBUG.pedestalVisual;
      return !!v && v.specId === id && v.root.visible;
    }, {}, row.id);
    if (row.source === 'glb') {
      await page.waitForFunction((id) => {
        const v = window.__DEBUG.pedestalVisual;
        if (!v || v.specId !== id) return false;
        let swapped = false;
        v.root.traverse((o) => { if (o.userData?.__glbSwapped) swapped = true; });
        return swapped;
      }, { polling: 60, timeout: 18000 }, row.id);
    } else await sleep(30);

    const result = await page.evaluate(({ source, cfg, turretless }) => {
      const visual = window.__DEBUG.pedestalVisual;
      const root = visual.root;
      const hull = root.getObjectByName('rig_hull');
      const turret = root.getObjectByName('rig_turret');
      const gun = root.getObjectByName('rig_gun');
      const recoil = root.getObjectByName('rig_recoil');
      const muzzle = root.getObjectByName('rig_muzzle');
      let swapped = false;
      root.traverse((o) => { if (o.userData?.__glbSwapped) swapped = true; });
      if (!hull || !turret || !gun || !recoil || !muzzle) return { rig: false, swapped };

      const isBelow = (node, ancestor) => {
        for (let p = node; p; p = p.parent) if (p === ancestor) return true;
        return false;
      };
      const findRegex = (sourceText, preferredAncestor = null) => {
        if (!sourceText) return null;
        const re = new RegExp(sourceText, 'i');
        const hits = [];
        root.traverse((o) => { if (re.test(o.name || '')) hits.push(o); });
        return (preferredAncestor && hits.find((o) => isBelow(o, preferredAncestor))) || hits[0] || null;
      };
      const sourceTurret = source === 'glb' && !cfg.fixedMount
        ? findRegex(cfg.turretNode || 'turret') : null;
      const sourceGun = source === 'glb' && cfg.gunNode ? findRegex(cfg.gunNode, recoil) : null;

      const ty = turret.rotation.y;
      const gx = gun.rotation.x;
      turret.rotation.y = 0;
      gun.rotation.x = 0;
      root.updateMatrixWorld(true);
      const Vec = window.__DEBUG.camera.position.constructor;
      const d0 = visual.gunDirWorld(new Vec()).clone();
      turret.rotation.y = 0.35;
      gun.rotation.x = -0.12;
      root.updateMatrixWorld(true);
      const d1 = visual.gunDirWorld(new Vec()).clone();
      turret.rotation.y = ty;
      gun.rotation.x = gx;
      root.updateMatrixWorld(true);

      let proceduralTurretMesh = false;
      let proceduralGunMesh = false;
      turret.traverse((o) => {
        if ((o.isMesh || o.isInstancedMesh) && o.visible && !/^shadowProxy_|^procShadow_/.test(o.name || '')) {
          proceduralTurretMesh = true;
        }
      });
      recoil.traverse((o) => {
        if ((o.isMesh || o.isInstancedMesh) && o.visible && !/^shadowProxy_|^procShadow_/.test(o.name || '')) {
          proceduralGunMesh = true;
        }
      });
      return {
        rig: true,
        swapped,
        directionChanged: d0.angleTo(d1) > 0.30,
        yawApplied: Math.abs(Math.atan2(
          Math.sin(Math.atan2(d1.x, d1.z) - Math.atan2(d0.x, d0.z)),
          Math.cos(Math.atan2(d1.x, d1.z) - Math.atan2(d0.x, d0.z)),
        )) > 0.30,
        pitchApplied: d1.y > 0.05,
        directions: [d0.toArray().map((v) => Number(v.toFixed(3))), d1.toArray().map((v) => Number(v.toFixed(3)))],
        sourceTurretSeated: !sourceTurret || isBelow(sourceTurret, turret),
        sourceGunSeated: !sourceGun || isBelow(sourceGun, recoil),
        sourceTurretName: sourceTurret?.name || null,
        sourceGunName: sourceGun?.name || null,
        proceduralTurretMesh,
        proceduralGunMesh,
        fixedContract: !cfg?.fixedMount || turretless,
      };
    }, row);

    check(`${row.id}: rig present`, result.rig === true);
    check(`${row.id}: selected source`, result.swapped === (row.source === 'glb'), `${row.source}`);
    check(`${row.id}: aim articulation`, result.directionChanged && result.yawApplied && result.pitchApplied,
      result.directions ? `${result.directions[0].join(',')} -> ${result.directions[1].join(',')}` : 'missing rig');
    check(`${row.id}: turret hierarchy`, result.sourceTurretSeated !== false, result.sourceTurretName || 'procedural/fixed');
    check(`${row.id}: cannon hierarchy`, result.sourceGunSeated !== false, result.sourceGunName || 'procedural/fused');
    if (row.source === 'procedural') {
      check(`${row.id}: procedural turret visible`, row.turretless || result.proceduralTurretMesh === true,
        row.turretless ? 'not applicable: fixed-mount hull' : 'rotating turret');
      check(`${row.id}: procedural cannon visible`, row.turretless || result.proceduralGunMesh === true,
        row.turretless ? 'not applicable: fixed hull gun' : 'recoil-mounted gun');
    }
    check(`${row.id}: fixed-mount contract`, result.fixedContract !== false);
    check(`${row.id}: no load errors`, browserErrors.length === errorStart,
      browserErrors.slice(errorStart).join(' | '));
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(`\nmodel-rig-probe: ${failures.length}/${checks} failed`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`\nmodel-rig-probe: all ${checks} checks passed`);
