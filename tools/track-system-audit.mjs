#!/usr/bin/env node
// Fleet-wide running-gear gate. The static phase verifies the one canonical
// closed course that drives belts, shoes, grousers, sprocket teeth and wheel
// lanes. --battle additionally deploys every requested vehicle onto a real
// battlefield and checks the live, terrain-conformed instance matrices.
// --round settles each vehicle on a deterministic convex cylindrical course
// and captures both sides for mandatory visual review of the complete shoe run.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

await import('../src/vehicles/tankFactory.js');
const { ALL_TANK_IDS } = await import('../src/vehicles/specs.js');

const idArg = process.argv.find((arg) => arg.startsWith('--ids='));
const mapArg = process.argv.find((arg) => arg.startsWith('--maps='));
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const roundShotsArg = process.argv.find((arg) => arg.startsWith('--round-shots='));
const runBattle = process.argv.includes('--battle');
const runRound = process.argv.includes('--round');
const skipStatic = process.argv.includes('--skip-static');
const ids = idArg
  ? idArg.slice(6).split(',').map((id) => id.trim()).filter(Boolean)
  : [...ALL_TANK_IDS];
const maps = (mapArg ? mapArg.slice(7) : 'badlands')
  .split(',').map((id) => id.trim()).filter(Boolean);
const roundShotsDir = roundShotsArg?.slice('--round-shots='.length)
  || 'shots/track-round-audit';

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: {
    port: 7700 + Math.floor(Math.random() * 150),
    strictPort: false,
    hmr: false,
    watch: null,
  },
});
await server.listen();
const port = server.config.server.port;
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});

const staticRows = [];
const roundRows = [];
const battleRows = [];
let failed = false;
try {
  if (!skipStatic) {
    const page = await browser.newPage();
    page.setDefaultTimeout(180000);
    for (const [index, id] of ids.entries()) {
      await page.goto(
        `http://localhost:${port}/tools/track-system-audit.html?id=${encodeURIComponent(id)}`,
        { waitUntil: 'domcontentloaded' },
      );
      await page.waitForFunction('window.__TRACK_SYSTEM_READY === true', { polling: 40 });
      const result = await page.evaluate('window.__TRACK_SYSTEM_AUDIT');
      staticRows.push(result);
      if (!result.pass) failed = true;
      const shoes = result.units?.reduce((sum, unit) => sum + unit.shoeCountPerSide * 2, 0) || 0;
      console.log(`[track-system ${String(index + 1).padStart(3)}/${ids.length}] ${id.padEnd(20)} `
        + `${result.pass ? 'PASS' : 'FAIL'} ${result.units?.length || 0} course(s), ${shoes} shoes`);
      for (const failure of result.failures || []) console.error(`  - ${failure}`);
      if (result.error) console.error(`  - ${result.error.split('\n')[0]}`);
    }
    await page.close();
  }

  if (runRound) {
    mkdirSync(roundShotsDir, { recursive: true });
    const roundPage = await browser.newPage();
    roundPage.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    roundPage.setDefaultTimeout(180000);
    for (const [index, id] of ids.entries()) {
      for (const view of ['left', 'right']) {
        await roundPage.goto(
          `http://localhost:${port}/tools/track-system-audit.html?id=${encodeURIComponent(id)}`
            + `&round=1&view=${view}`,
          { waitUntil: 'domcontentloaded' },
        );
        await roundPage.waitForFunction(
          'window.__TRACK_SYSTEM_READY === true && window.__TRACK_ROUND_READY === true',
          { polling: 40 },
        );
        const result = await roundPage.evaluate(() => ({
          staticAudit: window.__TRACK_SYSTEM_AUDIT,
          roundAudit: window.__TRACK_ROUND_AUDIT,
        }));
        const screenshot = resolve(roundShotsDir, `${id}-${view}.png`);
        await roundPage.screenshot({ path: screenshot });
        const pass = result.staticAudit?.pass === true && !result.roundAudit?.error;
        roundRows.push({ id, view, screenshot, pass, ...result.roundAudit });
        if (!pass) failed = true;
        console.log(`[track-round  ${String(index + 1).padStart(3)}/${ids.length}] `
          + `${id.padEnd(20)} ${view.padEnd(5)} ${pass ? 'PASS' : 'FAIL'} -> ${screenshot}`);
        if (result.roundAudit?.error) console.error(`  - ${result.roundAudit.error.split('\n')[0]}`);
      }
    }
    await roundPage.close();
  }

  if (runBattle) {
    const battlePage = await browser.newPage();
    battlePage.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    battlePage.setDefaultTimeout(240000);
    let pageError = null;
    battlePage.on('pageerror', (error) => { pageError = String(error?.message || error); });
    await battlePage.goto(`http://localhost:${port}/?nosplash=1`, { waitUntil: 'domcontentloaded' });
    await battlePage.waitForFunction('window.__GAME_READY === true', { polling: 100 });
    await battlePage.evaluate(() => {
      window.__DEBUG.flags.rosterExact = true;
    });

    for (const [index, id] of ids.entries()) {
      const mapId = maps[index % maps.length];
      pageError = null;
      await battlePage.evaluate(({ tankId, battlefield }) => {
        const debug = window.__DEBUG;
        debug.flags.forceRoster = [tankId];
        debug.flags.rosterExact = true;
        debug.startBattle(tankId, battlefield);
      }, { tankId: id, battlefield: mapId });
      await battlePage.waitForFunction(
        (tankId) => window.__DEBUG.game.phase === 'battle'
          && window.__DEBUG.game.player?.specId === tankId
          && window.__DEBUG.game.player?.visual?.root,
        { polling: 50 },
        id,
      );
      await battlePage.evaluate(() => new Promise((resolve) => {
        // Let the suspension and map-support solve settle before sampling the
        // shoe-to-heightfield clearance. Eight presentation frames was
        // scheduler-sensitive on the heaviest hulls: the same course could be
        // measured before or after its final few centimetres of vertical
        // support travel. Require a short stable window, with a bounded
        // fallback so a genuinely moving/unsupported vehicle still gets
        // audited instead of hanging the fleet run.
        let frames = 0;
        let stableFrames = 0;
        let previousY = null;
        const step = () => {
          frames++;
          const y = window.__DEBUG.game.player?.visual?.root?.position?.y;
          if (Number.isFinite(y) && previousY !== null && Math.abs(y - previousY) < 0.0001) {
            stableFrames++;
          } else {
            stableFrames = 0;
          }
          previousY = Number.isFinite(y) ? y : previousY;
          if ((frames >= 30 && stableFrames >= 8) || frames >= 120) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }));
      const result = await battlePage.evaluate(async ({ tankId, battlefield }) => {
        const THREE = await import('/node_modules/three/build/three.module.js');
        const debug = window.__DEBUG;
        const root = debug.game.player.visual.root;
        root.updateMatrixWorld(true);
        const objects = [];
        root.traverse((object) => {
          if (object.userData?.runningGear) objects.push(object);
        });
        const unitIds = [...new Set(objects
          .map((object) => object.userData.runningGearUnitId)
          .filter((value) => Number.isInteger(value)))].sort((a, b) => a - b);
        const failures = [];
        const units = [];
        const heightAt = debug.world?.heightField?.getHeightAt?.bind(debug.world.heightField);
        if (!heightAt) failures.push('battlefield height sampler unavailable');

        for (const unitId of unitIds) {
          const pads = objects.find((object) => object.name === 'gearTrackPads'
            && object.userData.runningGearUnitId === unitId);
          const bands = objects.filter((object) => /^gearTrackBand[LR]$/.test(object.name)
            && object.userData.runningGearUnitId === unitId);
          const tires = objects.filter((object) => /^gearRoadWheel(?:Tires|Discs)$/.test(object.name)
            && object.userData.runningGearUnitId === unitId);
          const unitFailures = [];
          if (!pads) unitFailures.push('missing live shoe course');
          if (bands.length !== 2) unitFailures.push(`live belt count ${bands.length}`);
          if (!tires.length) unitFailures.push('missing live wheel train');
          if (pads) {
            pads.geometry.computeBoundingBox();
            const count = pads.userData.trackShoeCountPerSide;
            const pitch = pads.userData.trackShoePitchM;
            const instance = new THREE.Matrix4();
            const world = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            let collapsed = 0;
            let maxGapRatio = 0;
            const nearGroundBySide = [0, 0];
            let minClearance = Infinity;
            let maxNearClearance = -Infinity;
            for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
              const poses = [];
              for (let i = 0; i < count; i++) {
                pads.getMatrixAt(sideIndex * count + i, instance);
                instance.decompose(position, quaternion, scale);
                if (scale.lengthSq() < 0.1) collapsed++;
                poses.push(position.clone());
                if (!heightAt || scale.lengthSq() < 0.1) continue;
                world.multiplyMatrices(pads.matrixWorld, instance);
                const box = pads.geometry.boundingBox.clone().applyMatrix4(world);
                const center = box.getCenter(new THREE.Vector3());
                const clearance = box.min.y - heightAt(center.x, center.z);
                minClearance = Math.min(minClearance, clearance);
                // Battle support keeps the rendered hull a small distance
                // above the sampled heightfield (and the value varies by a
                // few centimetres while suspension settles on cross-slopes).
                // Treat shoes inside that support envelope as terrain-seated;
                // the independent negative-clearance gate below remains the
                // strict protection against actual terrain penetration.
                if (clearance < 0.16) {
                  nearGroundBySide[sideIndex]++;
                  maxNearClearance = Math.max(maxNearClearance, clearance);
                }
              }
              for (let i = 0; i < poses.length; i++) {
                const gap = poses[i].distanceTo(poses[(i + 1) % poses.length]);
                maxGapRatio = Math.max(maxGapRatio, gap / pitch);
              }
            }
            if (collapsed) unitFailures.push(`${collapsed} live shoes collapsed`);
            if (maxGapRatio > 2.15) unitFailures.push(`terrain course gap ${maxGapRatio.toFixed(2)}× pitch`);
            if (Number.isFinite(minClearance) && minClearance < -0.085) {
              unitFailures.push(`shoe penetrates map terrain ${(-minClearance).toFixed(3)} m`);
            }
            if (heightAt) {
              for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
                if (nearGroundBySide[sideIndex] < 2) {
                  const side = sideIndex ? 'right' : 'left';
                  unitFailures.push(`${side} track has only ${nearGroundBySide[sideIndex]} terrain-seated shoes`);
                }
              }
            }
            units.push({
              unitId, shoeCountPerSide: count,
              maxGapRatio: Number(maxGapRatio.toFixed(3)),
              minTerrainClearanceM: Number.isFinite(minClearance) ? Number(minClearance.toFixed(3)) : null,
              maxNearTerrainClearanceM: Number.isFinite(maxNearClearance)
                ? Number(maxNearClearance.toFixed(3)) : null,
              terrainSeatedShoesBySide: {
                left: nearGroundBySide[0],
                right: nearGroundBySide[1],
              },
              failures: unitFailures,
            });
          } else {
            units.push({ unitId, failures: unitFailures });
          }
          failures.push(...unitFailures.map((failure) => `unit ${unitId}: ${failure}`));
        }
        return {
          id: tankId,
          mapId: battlefield,
          units,
          failures,
          pass: unitIds.length > 0 && failures.length === 0,
        };
      }, { tankId: id, battlefield: mapId });
      if (pageError) {
        result.failures.push(`page error: ${pageError}`);
        result.pass = false;
      }
      battleRows.push(result);
      if (!result.pass) failed = true;
      console.log(`[track-map    ${String(index + 1).padStart(3)}/${ids.length}] ${id.padEnd(20)} `
        + `${mapId.padEnd(10)} ${result.pass ? 'PASS' : 'FAIL'}`);
      for (const failure of result.failures) console.error(`  - ${failure}`);
    }
    await battlePage.close();
  }
} finally {
  await browser.close();
  await server.close();
}

const outputPath = outputArg?.slice('--output='.length) || 'shots/track-system-audit.json';
mkdirSync('shots', { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  ids,
  maps: runBattle ? maps : [],
  static: staticRows,
  round: roundRows,
  battle: battleRows,
  pass: !failed,
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`[track-system] ${report.pass ? 'PASS' : 'FAIL'} — ${staticRows.length} static / `
  + `${roundRows.length} round-course views / ${battleRows.length} battle-map vehicles -> ${outputPath}`);
if (failed) process.exitCode = 2;
