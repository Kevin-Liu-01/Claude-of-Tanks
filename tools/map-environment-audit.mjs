// Deterministic whole-fleet battlefield quality/performance audit.
//
// Usage:
//   node tools/map-environment-audit.mjs
//   node tools/map-environment-audit.mjs --out=/private/tmp/cot-map-audit --shots
//   node tools/map-environment-audit.mjs --maps=verdant,coastal --samples=90
//   node tools/map-environment-audit.mjs --production --root=/path/to/built/tree
//   node tools/map-environment-audit.mjs --baseline=/path/to/report.json
//   node tools/map-environment-audit.mjs --gate --baseline=/path/to/report.json
//   node tools/map-environment-audit.mjs --poses=/path/to/matched/shots --shots
//   node tools/map-environment-audit.mjs --maps=fjord,winter --shots --horizon-quadrants
//   node tools/map-environment-audit.mjs --maps=fjord --shots --horizon-only --horizon-scopes
//   node tools/map-environment-audit.mjs --shots --establishing-only
//   node tools/map-environment-audit.mjs --tier=mobile --width=1024 --height=768 --shots
// --establishing-only captures one canonical wide shot per map, requires --shots,
// and rejects --horizon-only, --horizon-scopes, or --horizon-quadrants.
//
// The report intentionally combines authored intent (config/features), built
// scene complexity, renderer counters, and steady-frame samples. Screenshots
// are optional because the numeric gate is useful in CI while visual review is
// a release gate owned by humans/critic agents.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createServer, preview } from 'vite';
import puppeteer from 'puppeteer';
import { sampleRenderedFrames } from './render-frame-sampler.mjs';
import { settleResidencyTerrain } from './world-residency-acquisition.mjs';
import { PINNED_SCENE, primePinnedSceneStorage, configurePinnedScene, capturePinnedScene } from './pinned-scene-acquisition.mjs';
import {
  ACQUISITION_PROTOCOL, settleMapTextures, applyTimingCamera, captureTimingState,
  requireComparableRun, requireTimingReceipt, requireSameTimingState,
  waitForTimingGarage, warmTimingGarage, captureTimingGarageOwner, captureTimingBackend,
  requireTimingGarageSetup, requireSameTimingGarageSetup, requireSameTimingGarageOwner,
  requireTimingBuildProvenance,
  selectTimingArchiveTarget, captureTimingGarageArchive, waitForTimingGarageArchiveEntry,
  requireSameTimingGarageArchive,
  captureTimingPhaseOwnership, requireTimingPhaseOwnership,
} from './map-environment-acquisition.mjs';
import {
  selectStandView, selectHorizonScopeTarget, resolveEnvironmentShotModes,
  stageHorizonScopeCapture, restoreHorizonArcadeCapture,
} from './environment-shot-camera.mjs';
import { evaluateQuality } from './map-environment-quality.mjs';
import { acquireCaptureLock, refreshCaptureLock, releaseCaptureLock } from './capture-lock.mjs';

const args = process.argv.slice(2);
const valueArg = (name, fallback) => {
  const prefix = `--${name}=`;
  const hit = args.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
};
const flagArg = (name) => args.includes(`--${name}`);
const ROOT = path.resolve(valueArg('root', process.cwd()));
// The repo's Vite warmup plugin resolves its source graph from cwd. A baseline
// in another worktree must never warm the implementation's module graph.
process.chdir(ROOT);
const { MAP_IDS } = await import(pathToFileURL(path.join(ROOT, 'src/world/maps/index.ts')).href);
const { FEATURED_SHOTS } = await import(pathToFileURL(path.join(ROOT, 'src/ui/featuredShots.ts')).href);
const garageArchiveTarget = selectTimingArchiveTarget(FEATURED_SHOTS);

const requested = valueArg('maps', MAP_IDS.join(','))
  .split(',').map((id) => id.trim()).filter(Boolean);
const unknown = requested.filter((id) => !MAP_IDS.includes(id));
if (unknown.length) throw new Error(`Unknown map ids: ${unknown.join(', ')}`);

const outDir = path.resolve(ROOT, valueArg('out', '.qa-map-environment'));
const { captureShots, establishingOnly, horizonOnly, horizonScopes, horizonQuadrants } = resolveEnvironmentShotModes(args);
const enforceGate = flagArg('gate');
const includeInventory = flagArg('inventory');
const syncGpu = flagArg('sync-gpu');
const production = flagArg('production');
const tier = valueArg('tier', 'auto');
if (!['auto', 'desktop', 'mobile'].includes(tier)) throw new Error('tier must be auto, desktop or mobile');
const width = Number.parseInt(valueArg('width', '1440'), 10);
const height = Number.parseInt(valueArg('height', '900'), 10);
const sampleCount = Math.max(30, Number.parseInt(valueArg('samples', '75'), 10));
const repeats = Math.max(1, Number.parseInt(valueArg('repeats', '3'), 10));
const settleMs = Math.max(250, Number.parseInt(valueArg('settle-ms', '1100'), 10));
const baselinePath = valueArg('baseline', '');
const baseline = baselinePath
  ? JSON.parse(fs.readFileSync(path.resolve(ROOT, baselinePath), 'utf8')) : null;
const baselineById = new Map((baseline?.maps || []).map((row) => [row.id, row]));
// Timing baselines need no image capture. Keep matched visual viewpoints
// independently selectable so a clean timing rerun doesn't discard them.
const poseRootArg = valueArg('poses', '');
const poseRoot = poseRootArg ? path.resolve(ROOT, poseRootArg)
  : baselinePath ? path.join(path.dirname(path.resolve(ROOT, baselinePath)), 'shots') : '';
const harnessHash = createHash('sha256');
for (const file of ['map-environment-audit.mjs', 'map-environment-acquisition.mjs',
  'pinned-scene-acquisition.mjs', 'world-residency-acquisition.mjs',
  'render-frame-sampler.mjs', 'map-environment-quality.mjs']) {
  harnessHash.update(file).update(fs.readFileSync(new URL(file, import.meta.url)));
}
const acquisition = {
  protocol: ACQUISITION_PROTOCOL, harnessHash: harnessHash.digest('hex'),
  viewport: { width, height, dpr: 1 },
  sampleCount, repeats, settleMs, syncGpu, tier, captureShots, production, garageArchiveTarget, maps: requested,
};
if (baseline) requireComparableRun(baseline, acquisition);
fs.mkdirSync(outDir, { recursive: true });

let server, browser, page, lockRefresher;
const pageErrors = [];
const readBuildIndexHash = () => production
  ? createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'dist/index.html'))).digest('hex') : null;

const report = {
  schemaVersion: 6,
  generatedAt: new Date().toISOString(),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
  dirtyPaths: execFileSync('git', ['status', '--short'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean),
  viewport: { width, height, dpr: 1 },
  sampleCount, repeats, syncGpu, tier, establishingOnly, horizonOnly, horizonScopes,
  acquisition,
  buildIndexHash: readBuildIndexHash(),
  captureLock: 'cot-shots',
  matchedPoseRoot: poseRoot || null,
  maps: [],
};
requireTimingBuildProvenance(report);

const percentile = (values, fraction) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
};
const round = (value, digits = 3) => Number(Number(value || 0).toFixed(digits));

async function sampleFrames(count) {
  const result = await page.evaluate(sampleRenderedFrames, { count, syncGpu });
  const frames = result.samples.map((sample) => sample.intervalMs);
  const costs = result.samples.map((sample) => sample.renderMs);
  return {
    sampleCount: result.samples.length,
    medianMs: round(percentile(frames, 0.5)),
    p95Ms: round(percentile(frames, 0.95)),
    p99Ms: round(percentile(frames, 0.99)),
    maxMs: round(Math.max(...frames)),
    fpsMedian: round(1000 / Math.max(0.001, percentile(frames, 0.5)), 1),
    renderMedianMs: round(percentile(costs, 0.5)),
    renderP95Ms: round(percentile(costs, 0.95)),
    callsMax: Math.max(...result.samples.map((sample) => sample.calls)),
    trianglesMax: Math.max(...result.samples.map((sample) => sample.triangles)),
  };
}

function combineFrameRuns(runs) {
  const at = (key) => percentile(runs.map((run) => run[key]), 0.5);
  return {
    medianMs: round(at('medianMs')),
    p95Ms: round(at('p95Ms')),
    p99Ms: round(at('p99Ms')),
    maxMs: round(at('maxMs')),
    fpsMedian: round(at('fpsMedian'), 1),
    renderMedianMs: round(at('renderMedianMs')),
    renderP95Ms: round(at('renderP95Ms')),
    callsMax: Math.max(...runs.map((run) => run.callsMax)),
    trianglesMax: Math.max(...runs.map((run) => run.trianglesMax)),
    runs,
  };
}

async function stageMap(mapId) {
  const view = mapId === 'verdant' ? 'battlefield' : `battlefield_${mapId}`;
  await page.evaluate((name) => window.__SHOTS.set(name), view);
  const readiness = await page.evaluate(settleMapTextures, { mapId });
  await page.evaluate(() => window.__DEBUG.post.pinDynScale(1));
  const prior = baselineById.get(mapId)?.acquisition;
  if (prior) await page.evaluate(applyTimingCamera, prior.state.camera);
  await new Promise((resolve) => setTimeout(resolve, settleMs));
  await page.evaluate(() => new Promise((resolve) => {
    let left = 5;
    const tick = () => { if (--left <= 0) resolve(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
  const prepared = await page.evaluate(settleResidencyTerrain);
  await page.evaluate(sampleRenderedFrames, { count: 8, syncGpu });
  const terrain = await page.evaluate(settleResidencyTerrain, prepared);
  return { readiness, terrain };
}

async function timingReceipt(mapId, prepared) {
  const receipt = {
    phaseOwnership: await page.evaluate(captureTimingPhaseOwnership),
    garage: await page.evaluate(captureTimingGarageOwner),
    garageArchive: await page.evaluate(captureTimingGarageArchive, garageArchiveTarget),
    scene: await page.evaluate(capturePinnedScene, PINNED_SCENE),
    state: await page.evaluate(captureTimingState),
    readiness: prepared.readiness,
    terrain: await page.evaluate(settleResidencyTerrain, prepared.terrain),
  };
  requireTimingReceipt(receipt, mapId, acquisition.viewport);
  requireSameTimingGarageOwner(report.garageSetup.owner, receipt.garage);
  requireSameTimingGarageArchive(report.garageSetup.archive, receipt.garageArchive);
  return receipt;
}

async function collectMap(mapId, frames) {
  return page.evaluate(({ id, frameStats, includeInventory: withInventory }) => {
    const D = window.__DEBUG;
    const world = D.world;
    const roundValue = (value, digits = 3) => Number(Number(value || 0).toFixed(digits));
    const triangleCount = (geometry) => {
      if (!geometry) return 0;
      const index = geometry.getIndex?.() || geometry.index;
      if (index) return index.count / 3;
      const position = geometry.getAttribute?.('position') || geometry.attributes?.position;
      return position ? position.count / 3 : 0;
    };
    const stats = (root) => {
      const geometries = new Set();
      const materials = new Set();
      const materialUsers = withInventory ? new Map() : null;
      const materialUserDetails = withInventory ? new Map() : null;
      const textures = new Set();
      let nodes = 0;
      let meshNodes = 0;
      let instancedMeshNodes = 0;
      let instances = 0;
      let triangles = 0;
      const materialLineage = (object) => {
        const lineage = [];
        for (let node = object; node && node !== root; node = node.parent) {
          lineage.push(node.name || node.type || 'node');
        }
        return lineage.reverse().join('/');
      };
      const materialBounds = (object) => {
        object.geometry?.computeBoundingBox?.();
        const bounds = object.geometry?.boundingBox;
        return {
          vertices: object.geometry?.attributes?.position?.count || 0,
          bounds: bounds ? [
            Number((bounds.max.x - bounds.min.x).toFixed(2)),
            Number((bounds.max.y - bounds.min.y).toFixed(2)),
            Number((bounds.max.z - bounds.min.z).toFixed(2)),
          ] : [],
        };
      };
      const registerMaterial = (material, object) => {
        if (!material) return;
        materials.add(material);
        if (withInventory) {
          if (!materialUsers.has(material)) materialUsers.set(material, new Set());
          if (!materialUserDetails.has(material)) materialUserDetails.set(material, []);
          materialUsers.get(material).add(materialLineage(object));
          materialUserDetails.get(material).push(materialBounds(object));
        }
        for (const key of Object.keys(material)) {
          const value = material[key];
          if (value?.isTexture) textures.add(value);
        }
      };
      root?.traverse((object) => {
        if (!object.visible) return;
        nodes++;
        if (!object.isMesh && !object.isInstancedMesh) return;
        meshNodes++;
        const count = object.isInstancedMesh ? object.count : 1;
        if (object.isInstancedMesh) instancedMeshNodes++;
        instances += count;
        if (object.geometry) {
          geometries.add(object.geometry);
          triangles += triangleCount(object.geometry) * count;
        }
        const objectMaterials = Array.isArray(object.material)
          ? object.material : [object.material];
        for (const material of objectMaterials) registerMaterial(material, object);
      });
      return {
        nodes, meshNodes, instancedMeshNodes, instances,
        triangles: Math.round(triangles),
        geometries: geometries.size, materials: materials.size, textures: textures.size,
        ...(withInventory ? {
          materialInventory: [...materials].map((material) => ({
            name: material.name || '', type: material.type || '',
            color: material.color?.getHexString?.() || '',
            roughness: material.roughness ?? null,
            textures: Object.keys(material).filter((key) => material[key]?.isTexture).sort(),
            mapSize: material.map
              ? `${material.map.image?.width || material.map.source?.data?.width || 0}x${material.map.image?.height || material.map.source?.data?.height || 0}` : '',
            users: [...(materialUsers.get(material) || [])].sort(),
            userDetails: materialUserDetails.get(material) || [],
          })).sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`)),
          textureInventory: [...textures].map((texture) => ({
            name: texture.name || '',
            width: texture.image?.width || texture.source?.data?.width || 0,
            height: texture.image?.height || texture.source?.data?.height || 0,
            format: texture.format || 0,
          })).sort((a, b) => `${a.width}x${a.height}:${a.name}`.localeCompare(`${b.width}x${b.height}:${b.name}`)),
        } : {}),
      };
    };

    const subtrees = {};
    world.group.children.forEach((child, index) => {
      subtrees[child.name || `child-${index}`] = stats(child);
    });
    const config = world.config;
    const props = config.props || {};
    const vegetation = config.vegetation || {};
    const terrain = config.terrain || {};
    const minimap = world.getMinimapFeatures();
    const structureFamilies = [
      ...(props.plan || []), ...(props.destructibleBuildings || []),
    ];
    const interactionKinds = new Set(world.destructibles.map((record) => record.kind));
    const looseKinds = new Set(world.looseProps.map((record) => record.kind));
    const info = D.renderer.info;
    const waterFeatures = [...(terrain.marshes || []), ...(terrain.lakes || [])];
    const poleStations = world.utilityPolePlacements || [];
    const polePosts = poleStations.flatMap((station) => station.poles || []);
    const fullPoleMesh = world.group.getObjectByName('baked-pole-full');
    const groundedDestructibles = world.destructibles
      .filter((record) => record.groundSupport);
    const groundingReceipts = world.decorationGroundingReceipts || [];
    const utilityPoleQuality = () => ({
      enabled: !!props.telegraph,
      stations: poleStations.length,
      pairedStations: poleStations.filter((station) => station.paired).length,
      singleStations: poleStations.filter((station) => !station.paired).length,
      physicalPosts: polePosts.length,
      sourceTrianglesPerPost: fullPoleMesh ? triangleCount(fullPoleMesh.geometry) : 0,
      maxPairRelief: roundValue(Math.max(0, ...poleStations.map((station) => station.pairRelief))),
      maxAcceptedPairRelief: roundValue(Math.max(0,
        ...poleStations.filter((station) => station.paired)
          .map((station) => station.pairRelief))),
      maxLocalRelief: roundValue(Math.max(0, ...polePosts.map((post) => post.supportSpread))),
      unsupportedPosts: polePosts.filter((post) =>
        Math.abs(post.y - (post.supportMin - 0.035)) > 0.001).length,
      pairedReliefs: poleStations.filter((station) => station.paired)
        .map((station) => roundValue(station.pairRelief)),
      singleReliefs: poleStations.filter((station) => !station.paired)
        .map((station) => roundValue(station.pairRelief)),
    });
    const groundingQuality = () => ({
      destructibleReceipts: groundedDestructibles.length,
      unsupportedDestructibles: groundedDestructibles.filter((record) =>
        record.y > record.groundSupport.min + 0.001).length,
      wideDecorationReceipts: groundingReceipts.length,
      unsupportedWideDecorations: groundingReceipts.filter((record) =>
        record.baseClearance > 0.001).length,
      maxBaseClearance: roundValue(Math.max(0,
        ...groundingReceipts.map((record) => record.baseClearance))),
      kinds: [...new Set(groundingReceipts.map((record) => record.kind))].sort(),
    });
    const waterQuality = () => ({
      features: waterFeatures.length,
      lakes: (terrain.lakes || []).length,
      marshes: (terrain.marshes || []).length,
      liquid: !!(terrain.softLakes || config.splat?.seaLake),
      frozen: !!config.splat?.iceLake,
      softInteraction: !!terrain.softLakes || waterFeatures.some((feature) => feature.depth == null),
    });
    return {
      id,
      name: config.name,
      frames: frameStats,
      sourcedTextureReadiness: world.minimapTextureState ? {
        settled: world.minimapTextureState.settled,
        results: world.minimapTextureState.results || null,
      } : null,
      // The app renders through a compositor. renderer.info at this point is
      // the final post pass, not the world pass; label it honestly and use
      // scene/subtree family counts for stable complexity gates.
      postPass: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        lines: info.render.lines,
        points: info.render.points,
        programs: info.programs?.length || 0,
        memory: { ...info.memory },
      },
      scene: stats(world.group),
      subtrees,
      quality: {
        map: {
          roads: minimap.roads.length,
          landforms: (terrain.landforms || []).length,
          tacticalBeats: minimap.tacticalBeats.length,
          wallRuns: (props.wallRuns || []).length,
        },
        buildings: {
          placed: minimap.buildings.length,
          authoredPlan: (props.plan || []).length,
          familyCount: new Set(structureFamilies).size,
          destructibleFamilies: (props.destructibleBuildings || []).length,
        },
        decorations: {
          obstacles: world.getObstacles().length,
          colliders: world.getColliders().length,
          destructibles: world.destructibles.length,
          destructibleKinds: interactionKinds.size,
          looseProps: world.looseProps.length,
          looseKinds: looseKinds.size,
          loosePlacement: world.group.getObjectByName('props')?.userData.looseClutterPlacement ?? null,
          wrecks: world.tankWreckSpots.length,
          craters: props.craters || 0,
          rubblePiles: props.rubblePiles || 0,
          utilityPoles: utilityPoleQuality(),
          grounding: groundingQuality(),
        },
        foliage: {
          configuredSpecies: new Set(vegetation.species || []).size,
          clusters: minimap.treeClusters.length,
          concealers: world.getConcealment().length,
          grassDensity: vegetation.grassDensity || 0,
          bushCount: vegetation.bushCount || 0,
        },
        water: waterQuality(),
      },
    };
  }, { id: mapId, frameStats: frames, includeInventory });
}

async function captureEvidenceShot(mapId, name, matchSavedPose = true) {
  const dir = path.join(outDir, 'shots', mapId);
  const beforePose = matchSavedPose && poseRoot && path.join(poseRoot, mapId, `${name}.pose.json`);
  if (beforePose && fs.existsSync(beforePose)) {
    const pose = JSON.parse(fs.readFileSync(beforePose, 'utf8'));
    await page.evaluate((saved) => {
      const D = window.__DEBUG;
      D.camera.position.fromArray(saved.position);
      D.camera.quaternion.fromArray(saved.quaternion);
      D.camera.fov = saved.fov;
      D.camera.updateProjectionMatrix();
      D.camera.updateMatrixWorld(true);
      D.world.update(0, D.camera.position);
      D.lighting.updateFrustums();
      D.lighting.update(true);
    }, pose);
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  const pose = await page.evaluate(() => {
    const D = window.__DEBUG;
    const hf = D.world.heightField;
    const p = D.camera.position;
    const terrainY = (hf.getHeightAtFast || hf.getHeightAt)(p.x, p.z);
    return {
      position: p.toArray(), quaternion: D.camera.quaternion.toArray(), fov: D.camera.fov,
      scoped: D.camera.userData.scoped === true, rigMode: D.rig.mode, rigZoom: D.rig.zoom,
      terrainClearance: p.y - terrainY,
      nearGroundWarning: p.y - terrainY < 0.5,
    };
  });
  fs.writeFileSync(path.join(dir, `${name}.pose.json`), `${JSON.stringify(pose, null, 2)}\n`);
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
  return { pose, matchedBaseline: Boolean(beforePose && fs.existsSync(beforePose)) };
}

async function captureMapShots(mapId) {
  const dir = path.join(outDir, 'shots', mapId);
  fs.mkdirSync(dir, { recursive: true });
  await captureEvidenceShot(mapId, 'establishing');
  if (establishingOnly) return;

  if (horizonQuadrants) {
    for (const [x, z] of [[300, 300], [-300, 300], [-300, -300], [300, -300]]) {
      await page.evaluate(({ x, z }) => {
        const D = window.__DEBUG;
        const hf = D.world.heightField;
        const hAt = hf.getHeightAtFast || hf.getHeightAt;
        D.camera.position.set(x, Math.max(50, hAt(x, z) + 12), z);
        D.camera.fov = 60;
        D.camera.lookAt(0, 24, 0);
        D.camera.updateProjectionMatrix();
        D.camera.updateMatrixWorld(true);
        D.world.update(0, D.camera.position);
        D.lighting.updateFrustums();
        D.lighting.update(true);
      }, { x, z });
      await new Promise((resolve) => setTimeout(resolve, 350));
      const name = `horizon-${x > 0 ? 'e' : 'w'}${z > 0 ? 'n' : 's'}`;
      await captureEvidenceShot(mapId, name, false);
      if (horizonScopes) {
        const contract = await page.evaluate(stageHorizonScopeCapture, selectHorizonScopeTarget(mapId));
        // Scope grade approaches its target over several genuine renders.
        await new Promise((resolve) => setTimeout(resolve, 350));
        await captureEvidenceShot(mapId, `${name}-scope`, false);
        fs.writeFileSync(path.join(dir, `${name}-scope.contract.json`), `${JSON.stringify(contract, null, 2)}\n`);
        await page.evaluate(restoreHorizonArcadeCapture, contract.arcade);
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }
  }
  if (horizonOnly) return;

  const poleDetail = await page.evaluate(() => {
    const D = window.__DEBUG;
    const world = D.world;
    const stations = world.utilityPolePlacements || [];
    if (!stations.length) return null;
    const paired = stations.filter((station) => station.paired);
    const singles = stations.filter((station) => !station.paired);
    // Titan's reported defect is a pair spanning a gorge shelf. Review the
    // steepest rejected station there; other maps show a retained flat pair
    // when available so both policy branches have visual evidence.
    const pool = world.mapId === 'titan_gorge' && singles.length
      ? singles : paired.length ? paired : stations;
    const station = [...pool].sort((a, b) => b.pairRelief - a.pairRelief)[0];
    const posts = station.poles || [];
    const target = posts.length > 1 ? {
      x: (posts[0].x + posts[1].x) * 0.5,
      z: (posts[0].z + posts[1].z) * 0.5,
    } : posts[0];
    const hf = world.heightField;
    const hAt = hf.getHeightAtFast || hf.getHeightAt;
    const angle = station.yaw + Math.PI * 0.58;
    const distance = posts.length > 1 ? 30 : 24;
    const x = target.x + Math.sin(angle) * distance;
    const z = target.z + Math.cos(angle) * distance;
    D.camera.position.set(x, Math.max(hAt(x, z) + 5.2, hAt(target.x, target.z) + 6.8), z);
    D.camera.fov = 45;
    D.camera.lookAt(target.x, hAt(target.x, target.z) + 3.5, target.z);
    D.camera.updateProjectionMatrix();
    D.camera.updateMatrixWorld(true);
    world.update(0, D.camera.position);
    D.lighting.updateFrustums();
    D.lighting.update(true);
    return { paired: station.paired, pairRelief: station.pairRelief, posts: posts.length };
  });
  if (poleDetail) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await captureEvidenceShot(mapId, 'utility-poles');
    fs.writeFileSync(path.join(dir, 'utility-poles.json'), `${JSON.stringify(poleDetail, null, 2)}\n`);
  }

  const decorationDetail = await page.evaluate(() => {
    const D = window.__DEBUG;
    const world = D.world;
    const receipts = world.decorationGroundingReceipts || [];
    const priorities = [
      'beached-boat', 'frozen-rowboat', 'tank-wreck',
      'felled-utility-pole', 'fallen-log', 'stump',
    ];
    let subject = null;
    for (const kind of priorities) {
      subject = receipts.find((receipt) => receipt.kind === kind);
      if (subject) break;
    }
    if (!subject) return null;
    const hf = world.heightField;
    const hAt = hf.getHeightAtFast || hf.getHeightAt;
    const seed = [...world.mapId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const angle = (seed % 360) * Math.PI / 180;
    const distance = subject.kind === 'tank-wreck' ? 16 : 12;
    const x = subject.x + Math.sin(angle) * distance;
    const z = subject.z + Math.cos(angle) * distance;
    D.camera.position.set(x, Math.max(hAt(x, z) + 3.4, hAt(subject.x, subject.z) + 4.2), z);
    D.camera.fov = 46;
    D.camera.lookAt(subject.x, hAt(subject.x, subject.z) + 0.8, subject.z);
    D.camera.updateProjectionMatrix();
    D.camera.updateMatrixWorld(true);
    world.update(0, D.camera.position);
    D.lighting.updateFrustums();
    D.lighting.update(true);
    return {
      kind: subject.kind,
      relief: subject.relief,
      baseClearance: subject.baseClearance,
    };
  });
  if (decorationDetail) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await captureEvidenceShot(mapId, 'grounded-decoration');
    fs.writeFileSync(path.join(dir, 'grounded-decoration.json'),
      `${JSON.stringify(decorationDetail, null, 2)}\n`);
  }

  const details = await page.evaluate(() => {
    const D = window.__DEBUG;
    const world = D.world;
    const hf = world.heightField;
    const hAt = hf.getHeightAtFast || hf.getHeightAt;
    const beats = world.config.props?.tacticalBeats || [];
    const waters = [
      ...(world.config.terrain?.lakes || []),
      ...(world.config.terrain?.marshes || []),
    ];
    const setCamera = (target, distance, angle, lift, fov) => {
      const x = target.x + Math.sin(angle) * distance;
      const z = target.z + Math.cos(angle) * distance;
      D.camera.position.set(x, hAt(x, z) + lift, z);
      D.camera.fov = fov;
      D.camera.lookAt(target.x, hAt(target.x, target.z) + 2.4, target.z);
      D.camera.updateProjectionMatrix();
      D.camera.updateMatrixWorld(true);
      world.update(0, D.camera.position);
      D.lighting.updateFrustums();
      D.lighting.update(true);
    };
    if (beats.length) {
      const beat = beats[0];
      const seed = [...world.mapId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
      setCamera(beat, 48, (seed % 360) * Math.PI / 180, 7.5, 48);
    }
    return { hasDetail: beats.length > 0, hasWater: waters.length > 0 };
  });
  if (details.hasDetail) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await captureEvidenceShot(mapId, 'detail');
  }
  const closeups = await page.evaluate(() => {
    const D = window.__DEBUG;
    const world = D.world;
    const hf = world.heightField;
    const hAt = hf.getHeightAtFast || hf.getHeightAt;
    const minimap = world.getMinimapFeatures();
    const setCamera = (target, distance, angle, lift, fov) => {
      const x = target.x + Math.sin(angle) * distance;
      const z = target.z + Math.cos(angle) * distance;
      D.camera.position.set(x, hAt(x, z) + lift, z);
      D.camera.fov = fov;
      D.camera.lookAt(target.x, hAt(target.x, target.z) + 2.3, target.z);
      D.camera.updateProjectionMatrix();
      D.camera.updateMatrixWorld(true);
      world.update(0, D.camera.position);
      D.lighting.updateFrustums();
      D.lighting.update(true);
    };
    const buildings = [...(minimap.buildings || [])]
      .filter((building) => (building.w || 0) <= 36 && (building.d || 0) <= 36)
      .sort((a, b) => ((b.w || 0) * (b.d || 0)) - ((a.w || 0) * (a.d || 0)));
    if (buildings.length) {
      const building = buildings[0];
      // Stand clear of the full footprint. The previous fixed 27 m offset
      // could put this evidence camera inside a large depot or rowhouse and
      // make intact authored walls look missing in the visual gate.
      const footprint = Math.hypot(building.w || 10, building.d || 10);
      setCamera(building, Math.max(27, footprint * 0.9 + 12), Math.PI * 0.72,
        Math.max(4.8, Math.min(8.5, (building.h || 5) * 0.72)), 48);
    }
    return { hasBuilding: buildings.length > 0, hasFoliage: (minimap.treeClusters || []).length > 0 };
  });
  if (closeups.hasBuilding) {
    await new Promise((resolve) => setTimeout(resolve, 320));
    await captureEvidenceShot(mapId, 'building');
  }
  if (closeups.hasFoliage) {
    const standInputs = await page.evaluate(() => {
      const world = window.__DEBUG.world;
      const features = world.getMinimapFeatures();
      return { clusters: features.treeClusters, buildings: features.buildings,
        concealers: world.getConcealment() };
    });
    const standView = selectStandView(standInputs);
    await page.evaluate(({ x, z, target: cluster }) => {
      const D = window.__DEBUG;
      const world = D.world;
      const hf = world.heightField;
      const hAt = hf.getHeightAtFast || hf.getHeightAt;
      D.camera.position.set(x, hAt(x, z) + 4.2, z);
      D.camera.fov = 50;
      D.camera.lookAt(cluster.x, hAt(cluster.x, cluster.z) + 3.6, cluster.z);
      D.camera.updateProjectionMatrix();
      D.camera.updateMatrixWorld(true);
      world.update(0, D.camera.position);
      D.lighting.updateFrustums();
      D.lighting.update(true);
    }, standView);
    await new Promise((resolve) => setTimeout(resolve, 320));
    const capture = await captureEvidenceShot(mapId, 'foliage');
    // Keep the generated selection as a candidate, not a false receipt of
    // camera placement when the matched baseline pose took precedence.
    const receipt = { selection: standView, selectionApplied: !capture.matchedBaseline,
      cameraPose: capture.pose, matchedBaseline: capture.matchedBaseline };
    fs.writeFileSync(path.join(dir, 'foliage-site.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  }
  if (details.hasWater) {
    await page.evaluate(() => {
      const D = window.__DEBUG;
      const hf = D.world.heightField;
      const hAt = hf.getHeightAtFast || hf.getHeightAt;
      const water = D.world.getMinimapFeatures().waterOrSoft;
      const x0 = Math.min(...water.map((disc) => disc.x - disc.r));
      const x1 = Math.max(...water.map((disc) => disc.x + disc.r));
      const z0 = Math.min(...water.map((disc) => disc.z - disc.r));
      const z1 = Math.max(...water.map((disc) => disc.z + disc.r));
      const x = (x0 + x1) * 0.5;
      const z = (z0 + z1) * 0.5;
      const span = Math.max((x1 - x0) / D.camera.aspect, z1 - z0, 100) * 1.14;
      const targetY = hAt(x, z);
      D.camera.position.set(x, targetY + span / (2 * Math.tan(Math.PI / 6)), z);
      D.camera.fov = 60;
      D.camera.up.set(0, 0, 1);
      D.camera.lookAt(x, targetY, z);
      D.camera.up.set(0, 1, 0);
      D.camera.updateProjectionMatrix();
      D.camera.updateMatrixWorld(true);
      D.world.update(0, D.camera.position);
      D.lighting.updateFrustums();
      D.lighting.update(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    await captureEvidenceShot(mapId, 'water-overhead');
    await page.evaluate(() => {
      const D = window.__DEBUG;
      const world = D.world;
      const hf = world.heightField;
      const hAt = hf.getHeightAtFast || hf.getHeightAt;
      const waters = [
        ...(world.config.terrain?.lakes || []),
        ...(world.config.terrain?.marshes || []),
      ].sort((a, b) => (b.r || 0) - (a.r || 0));
      const water = waters[0];
      const distance = Math.max(22, (water.r || 40) * 0.92);
      const x = water.x - distance;
      const z = water.z + distance * 0.28;
      D.camera.position.set(x, hAt(x, z) + 6.2, z);
      D.camera.fov = 50;
      D.camera.lookAt(water.x, hAt(water.x, water.z) + 0.5, water.z);
      D.camera.updateProjectionMatrix();
      D.camera.updateMatrixWorld(true);
      world.update(0, D.camera.position);
      D.lighting.updateFrustums();
      D.lighting.update(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    // Terrain corrections can invalidate an old near-bank camera. Preserve
    // the matched view unchanged, and also retain the current-height view as
    // explicitly unmatched evidence rather than silently moving the baseline.
    await captureEvidenceShot(mapId, 'water-current', false);
    await captureEvidenceShot(mapId, 'water');

    // Exercise the same allocation-free track-contact path used by moving
    // vehicles. This verifies that liquid replaces dry dust with spray and
    // wake marks without adding a water-only renderer family.
    await page.evaluate(() => {
      const D = window.__DEBUG;
      const world = D.world;
      const hf = world.heightField;
      const hAt = hf.getHeightAtFast || hf.getHeightAt;
      const waters = [
        ...(world.config.terrain?.lakes || []),
        ...(world.config.terrain?.marshes || []),
      ].sort((a, b) => (b.r || 0) - (a.r || 0));
      const water = waters[0];
      const x = water.x - Math.max(5, (water.r || 40) * 0.18);
      const z = water.z;
      const y = hAt(x, z) + 0.15;
      D.fx.resetAll();
      D.fx.setFrozen(false);
      for (let i = 0; i < 48; i++) {
        const lane = i % 2 === 0 ? -0.8 : 0.8;
        D.fx.dust({ x: x + lane, y, z: z - 8 + i * 0.34 }, { x: 0, y: 0, z: 1 }, 1);
      }
      D.camera.position.set(x - 12, y + 5.2, z - 15);
      D.camera.fov = 48;
      D.camera.lookAt(x, y + 0.4, z);
      D.camera.updateProjectionMatrix();
      D.camera.updateMatrixWorld(true);
      world.update(0, D.camera.position);
      D.lighting.updateFrustums();
      D.lighting.update(true);
      for (let i = 0; i < 8; i++) D.fx.update(1 / 60, [], D.camera);
      D.fx.setFrozen(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 220));
    await captureEvidenceShot(mapId, 'water-interaction');
  }
}

try {
  await acquireCaptureLock(20 * 60 * 1000);
  process.on('exit', releaseCaptureLock);
  lockRefresher = setInterval(refreshCaptureLock, 60_000);
  lockRefresher.unref();
  const selectedPort = 6100 + Math.floor(Math.random() * 500);
  server = production
    ? await preview({ root: ROOT, logLevel: 'error',
      preview: { host: '127.0.0.1', port: selectedPort, strictPort: false } })
    : await createServer({
      root: ROOT, logLevel: 'error',
      server: { host: '127.0.0.1', port: selectedPort, strictPort: false, hmr: false, watch: null },
      optimizeDeps: {
        entries: ['index.html'],
        include: [
          'three',
          'three/examples/jsm/loaders/GLTFLoader.js',
          'three/examples/jsm/utils/SkeletonUtils.js',
          'three/examples/jsm/utils/BufferGeometryUtils.js',
          'three/examples/jsm/geometries/RoundedBoxGeometry.js',
        ],
      },
    });
  if (!production) await server.listen();
  const address = server.httpServer.address();
  const port = address.port;
  browser = await puppeteer.launch({
    headless: 'new',
    // The natural workshop deadline is 180 s; preserve its own bounded error.
    protocolTimeout: 240000,
    // Native submitted cadence; --sync-gpu remains a separate diagnostic.
    args: [
      '--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage',
      '--disable-frame-rate-limit', '--disable-gpu-vsync', '--disable-renderer-backgrounding',
    ],
  });
  page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(primePinnedSceneStorage, PINNED_SCENE);
  page.setDefaultTimeout(180000);
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('favicon')) pageErrors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${port}/${tier === 'auto' ? '' : `?tier=${tier}`}`, {
    waitUntil: 'domcontentloaded', timeout: 120000,
  });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  await page.evaluate(configurePinnedScene, PINNED_SCENE);
  await page.evaluate(waitForTimingGarage);
  await page.evaluate(() => window.__SHOTS.set('garage'));
  await page.evaluate(() => window.__DEBUG.post.pinDynScale(1));
  // Observe a fresh natural entry into the recurring production pair, within
  // one 120 s deadline. Never advance/freeze it or warm repeatedly until stable.
  const { archiveBefore, archiveWait } = await waitForTimingGarageArchiveEntry(page, garageArchiveTarget);
  const garageOwner = await page.evaluate(captureTimingGarageOwner);
  const phaseBefore = await page.evaluate(captureTimingPhaseOwnership);
  report.garageSetup = { ownerBefore: garageOwner, archiveBefore, archiveWait, phaseBefore };
  requireTimingPhaseOwnership(phaseBefore, 'garage', 'verdant');
  const garageWarm = await page.evaluate(warmTimingGarage, { archive: archiveBefore });
  const warmedGarageOwner = await page.evaluate(captureTimingGarageOwner);
  report.garageSetup = {
    ownerBefore: garageOwner, owner: warmedGarageOwner, warm: garageWarm,
    phaseBefore, phaseOwnership: await page.evaluate(captureTimingPhaseOwnership),
    archiveBefore, archive: await page.evaluate(captureTimingGarageArchive, garageArchiveTarget), archiveWait,
    backend: await page.evaluate(captureTimingBackend), browserVersion: await browser.version(),
  };
  requireTimingGarageSetup(report.garageSetup);
  if (baseline) requireSameTimingGarageSetup(baseline.garageSetup, report.garageSetup);
  report.browser = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    canvasWidth: window.__DEBUG.renderer.domElement.width,
    canvasHeight: window.__DEBUG.renderer.domElement.height,
    maxTextureSize: window.__DEBUG.renderer.capabilities.maxTextureSize,
  }));
  for (const mapId of requested) {
    process.stdout.write(`[map-audit] ${mapId} ... `);
    const prepared = await stageMap(mapId);
    const acquired = await timingReceipt(mapId, prepared);
    const before = baselineById.get(mapId);
    if (before) requireSameTimingState(before.acquisition, acquired);
    const frameRuns = [];
    for (let repeat = 0; repeat < repeats; repeat++) {
      const acquisitionBefore = await timingReceipt(mapId, prepared);
      requireSameTimingState(acquired, acquisitionBefore);
      const samples = await sampleFrames(sampleCount);
      const acquisitionAfter = await timingReceipt(mapId, prepared);
      requireSameTimingState(acquired, acquisitionAfter);
      frameRuns.push({ ...samples, acquisitionBefore, acquisitionAfter });
    }
    const frames = combineFrameRuns(frameRuns);
    const row = await collectMap(mapId, frames);
    row.acquisition = acquired;
    row.gate = evaluateQuality(row);
    if (before) {
      const oldFrames = before.frames;
      const oldScene = before.scene;
      const absoluteBudgetMs = Math.max(0.75, oldFrames.medianMs * 0.08);
      row.baseline = {
        medianDeltaMs: round(frames.medianMs - oldFrames.medianMs),
        p95DeltaMs: round(frames.p95Ms - oldFrames.p95Ms),
        medianBudgetMs: round(absoluteBudgetMs),
        meshNodeDelta: row.scene.meshNodes - oldScene.meshNodes,
        instancedFamilyDelta: row.scene.instancedMeshNodes - oldScene.instancedMeshNodes,
        materialDelta: row.scene.materials - oldScene.materials,
        textureDelta: row.scene.textures - oldScene.textures,
        renderMedianDeltaMs: round(frames.renderMedianMs - oldFrames.renderMedianMs),
        renderP95DeltaMs: round(frames.renderP95Ms - oldFrames.renderP95Ms),
        pass: frames.medianMs <= oldFrames.medianMs + absoluteBudgetMs
          && frames.renderMedianMs <= oldFrames.renderMedianMs + Math.max(0.25, oldFrames.renderMedianMs * 0.05)
          && frames.renderP95Ms <= oldFrames.renderP95Ms + Math.max(0.5, oldFrames.renderP95Ms * 0.05)
          && row.scene.meshNodes <= oldScene.meshNodes + 3
          && row.scene.instancedMeshNodes <= oldScene.instancedMeshNodes + 3
          && row.scene.materials <= oldScene.materials
          && row.scene.textures <= oldScene.textures,
      };
    }
    report.maps.push(row);
    if (captureShots) await captureMapShots(mapId);
    console.log(`${frames.medianMs.toFixed(2)} ms median, ${row.scene.meshNodes} mesh families, ${row.scene.triangles} scene tris`);
  }
  report.summary = {
    mapCount: report.maps.length,
    worstMedianMs: round(Math.max(...report.maps.map((row) => row.frames.medianMs))),
    worstP95Ms: round(Math.max(...report.maps.map((row) => row.frames.p95Ms))),
    maxMeshFamilies: Math.max(...report.maps.map((row) => row.scene.meshNodes)),
    maxSceneTriangles: Math.max(...report.maps.map((row) => row.scene.triangles)),
    baselineFailures: report.maps.filter((row) => row.baseline && !row.baseline.pass).map((row) => row.id),
    uncomparedMaps: report.maps.filter((row) => !row.baseline).map((row) => row.id),
    qualityFailures: report.maps.filter((row) => !row.gate.pass).map((row) => row.id),
  };
  report.pageErrors = pageErrors;
  if (readBuildIndexHash() !== report.buildIndexHash) throw new Error('Production build changed during timing');
  fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[map-audit] wrote ${path.join(outDir, 'report.json')}`);
  if (pageErrors.length) {
    for (const error of pageErrors) console.error(`[map-audit/page] ${error}`);
    process.exitCode = 1;
  }
  if (report.summary.baselineFailures.length) {
    console.error(`[map-audit] performance/complexity gate failed: ${report.summary.baselineFailures.join(', ')}`);
    process.exitCode = 1;
  }
  if (enforceGate && report.summary.qualityFailures.length) {
    console.error(`[map-audit] environment quality gate failed: ${report.summary.qualityFailures.join(', ')}`);
    process.exitCode = 1;
  }
} catch (error) {
  report.acquisitionError = String(error);
  report.pageErrors = pageErrors;
  fs.writeFileSync(path.join(outDir, 'report.incomplete.json'), `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  try {
    if (browser) await browser.close();
  } finally {
    try {
      if (server?.close) await server.close();
      else if (server) await new Promise((resolve, reject) => {
        server.httpServer.close(error => error ? reject(error) : resolve());
      });
    } finally {
      clearInterval(lockRefresher);
      releaseCaptureLock();
    }
  }
}
