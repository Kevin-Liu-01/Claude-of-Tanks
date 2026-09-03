// Repeatable tank-model structure audit.
//
// Scores every selected visual and every retained GLB candidate against the
// real vehicle contract, then compares it with peers from the same era.
// This intentionally measures facts we can prove automatically: source
// presence, turret/gun separation, hierarchy, pivots, orientation and overall
// proportions. It does not pretend to replace a human likeness review.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { createServer } from 'vite';
import { VEHICLE_COMPARISON_SOURCES } from './vehicleComparisonSources.mjs';

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, '.qa-dev', 'reports');
const PASS = 8.5;
const CHECK = process.argv.includes('--check');
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const round = (v, n = 2) => Number(v.toFixed(n));
const median = (xs) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('not a GLB');
  const jsonLen = buf.readUInt32LE(12);
  const jsonType = buf.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a) throw new Error('missing JSON chunk');
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8').replace(/\0+$/, ''));
}

function nodeName(node, index) {
  return THREE.PropertyBinding.sanitizeNodeName(node.name || `node_${index}`);
}

function localMatrix(node) {
  if (node.matrix) return new THREE.Matrix4().fromArray(node.matrix);
  return new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(node.translation || [0, 0, 0]),
    new THREE.Quaternion().fromArray(node.rotation || [0, 0, 0, 1]),
    new THREE.Vector3().fromArray(node.scale || [1, 1, 1]),
  );
}

function parentIndices(nodes) {
  const parents = new Array(nodes.length).fill(-1);
  nodes.forEach((node, index) => {
    for (const child of node.children || []) parents[child] = index;
  });
  return parents;
}

function sceneRoots(json, nodes, parents) {
  return (json.scenes && json.scenes[json.scene || 0]?.nodes) ||
    nodes.map((_, index) => index).filter((index) => parents[index] < 0);
}

function worldMatrices(nodes, roots) {
  const world = new Array(nodes.length);
  const walk = (index, parentMatrix) => {
    const matrix = localMatrix(nodes[index]);
    if (parentMatrix) matrix.premultiply(parentMatrix);
    world[index] = matrix;
    for (const child of nodes[index].children || []) walk(child, matrix);
  };
  for (const root of roots) walk(root, null);
  return world;
}

function descendants(nodes, root) {
  const result = new Set();
  const add = (index) => {
    result.add(index);
    for (const child of nodes[index]?.children || []) add(child);
  };
  if (root != null) add(root);
  return result;
}

function expandAccessorBounds(box, point, accessor, matrix) {
  if (!accessor?.min || !accessor?.max) return;
  for (const x of [accessor.min[0], accessor.max[0]]) {
    for (const y of [accessor.min[1], accessor.max[1]]) {
      for (const z of [accessor.min[2], accessor.max[2]]) {
        box.expandByPoint(point.set(x, y, z).applyMatrix4(matrix));
      }
    }
  }
}

function subtreeSpan(json, nodes, world, root) {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const index of descendants(nodes, root)) {
    const node = nodes[index];
    const mesh = node.mesh == null ? null : json.meshes?.[node.mesh];
    if (!mesh || !world[index]) continue;
    for (const primitive of mesh.primitives || []) {
      const accessorIndex = primitive.attributes?.POSITION;
      const accessor = accessorIndex == null ? null : json.accessors?.[accessorIndex];
      expandAccessorBounds(box, point, accessor, world[index]);
    }
  }
  if (box.isEmpty()) return 0;
  const size = box.getSize(new THREE.Vector3());
  return Math.max(size.x, size.y, size.z);
}

function findNode(json, nodes, world, source, within = null, preferLargest = false) {
  const expression = new RegExp(source, 'i');
  const allowed = within == null ? null : descendants(nodes, within);
  const hits = [];
  for (let index = 0; index < nodes.length; index++) {
    if ((!allowed || allowed.has(index)) && expression.test(nodeName(nodes[index], index))) {
      hits.push(index);
    }
  }
  if (preferLargest && hits.length > 1) {
    hits.sort((left, right) =>
      subtreeSpan(json, nodes, world, right) - subtreeSpan(json, nodes, world, left));
  }
  return { index: hits[0] ?? null, count: hits.length };
}

function meshBounds(json) {
  const result = new Map();
  (json.meshes || []).forEach((mesh, meshIndex) => {
    const bounds = new THREE.Box3();
    const point = new THREE.Vector3();
    for (const primitive of mesh.primitives || []) {
      const accessorIndex = primitive.attributes?.POSITION;
      const accessor = accessorIndex == null ? null : json.accessors?.[accessorIndex];
      expandAccessorBounds(bounds, point, accessor, new THREE.Matrix4());
    }
    result.set(meshIndex, bounds);
  });
  return result;
}

function orientedSceneSize(json, nodes, world, orientation) {
  const box = new THREE.Box3();
  const corner = new THREE.Vector3();
  const boundsByMesh = meshBounds(json);
  nodes.forEach((node, index) => {
    const bounds = node.mesh == null ? null : boundsByMesh.get(node.mesh);
    if (!bounds || bounds.isEmpty() || !world[index]) return;
    const matrix = world[index].clone().premultiply(orientation);
    expandAccessorBounds(box, corner, {
      min: bounds.min.toArray(),
      max: bounds.max.toArray(),
    }, matrix);
  });
  return box.isEmpty() ? null : box.getSize(new THREE.Vector3());
}

function inspectGlb(file, cfg) {
  const json = readGlb(file);
  const nodes = json.nodes || [];
  const parents = parentIndices(nodes);
  const world = worldMatrices(nodes, sceneRoots(json, nodes, parents));

  const fixedMount = cfg.fixedMount === true;
  const turretHit = fixedMount ? { index: null, count: 0 }
    : findNode(json, nodes, world, cfg.turretNode || 'turret');
  const turret = turretHit.index;
  let gun = null;
  let gunMatchCount = 0;
  if (turret != null) {
    const gunRe = cfg.gunNode || '(^|[_\\s.-])(gun|barrel|cannon)(?=$|[_\\s.-])';
    let gunHit = findNode(json, nodes, world, gunRe, turret, true);
    gun = gunHit.index;
    gunMatchCount = gunHit.count;
    if (gun == null && cfg.gunNode) {
      gunHit = findNode(json, nodes, world, gunRe, null, true);
      gun = gunHit.index;
      gunMatchCount = gunHit.count;
    }
  }

  const orient = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
    cfg.pitchOffset || 0, cfg.yawOffset || 0, cfg.rollOffset || 0,
  ));
  const size = orientedSceneSize(json, nodes, world, orient);
  return {
    nodeCount: nodes.length,
    meshCount: (json.meshes || []).length,
    names: nodes.map(nodeName),
    turret: turret == null ? null : nodeName(nodes[turret], turret),
    gun: gun == null ? null : nodeName(nodes[gun], gun),
    turretMatchCount: turretHit.count,
    gunMatchCount,
    gunInsideTurret: gun != null && descendants(nodes, turret).has(gun),
    size: size ? [size.x, size.y, size.z].map((v) => round(v, 4)) : null,
  };
}

function scoreArticulation(spec, cfg, inspection, issues, hardCaps) {
  const turretless = spec.armor?.turretless === true;
  const fixedMount = cfg.fixedMount === true;
  const score = { turret: 0, gun: 0, hierarchy: 0, pivot: 0 };
  if (turretless && fixedMount) {
    score.turret = 3;
    score.pivot = 1;
    if (cfg.gunNode && inspection.gun) {
      score.gun = 2;
      score.hierarchy = 1;
    } else {
      score.gun = 1.25;
      score.hierarchy = 0.75;
      issues.push('fixed-mount gun is fused; visual elevation remains virtual');
      hardCaps.push('fused fixed-mount gun caps score at 9.0');
    }
    return { ...score, turretless, fixedMount };
  }
  if (turretless) {
    issues.push('casemate source is not declared fixedMount');
    hardCaps.push('casemate contract mismatch');
    return { ...score, turretless, fixedMount };
  }
  if (fixedMount) {
    issues.push('fixedMount is forbidden on a real turreted vehicle');
    hardCaps.push('turreted vehicle capped at 4.0');
    return { ...score, turretless, fixedMount };
  }
  if (!inspection.turret) {
    issues.push('no separable turret node');
    hardCaps.push('missing turret caps score at 5.5');
    return { ...score, turretless, fixedMount };
  }
  score.turret = 3;
  score.pivot = cfg.autoPivot || cfg.pivot ? 1 : 0.7;
  if (!inspection.gun) {
    score.gun = 1.25;
    score.hierarchy = 0.75;
    issues.push('gun is fused to turret; elevation remains virtual');
    hardCaps.push('fused gun caps score at 9.0');
    return { ...score, turretless, fixedMount };
  }
  score.gun = 2;
  score.hierarchy = inspection.gunInsideTurret ? 1 : 0.8;
  if (!inspection.gunInsideTurret) issues.push('gun is a turret sibling; loader reparent required');
  if (inspection.gunMatchCount > 1) {
    issues.push(`${inspection.gunMatchCount} gun-name matches; largest barrel selected`);
  }
  return { ...score, turretless, fixedMount };
}

function scoreProportions(spec, inspection, issues) {
  if (!inspection.size) {
    issues.push('no accessor bounds; proportion check unavailable');
    return 0.5;
  }
  const [width, height, length] = inspection.size;
  const gotWidth = width / Math.max(length, 1e-6);
  const gotHeight = height / Math.max(length, 1e-6);
  const wantedWidth = spec.dims.widthM / spec.dims.overallLengthM;
  const wantedHeight = spec.dims.heightM / spec.dims.overallLengthM;
  const error = (Math.abs(gotWidth - wantedWidth) / wantedWidth +
    Math.abs(gotHeight - wantedHeight) / wantedHeight) / 2;
  if (error > 0.35) issues.push(`overall proportions differ ${Math.round(error * 100)}% from spec`);
  return clamp(1 - error / 0.75, 0.5, 1);
}

function capArticulationScore(score, articulation, inspection) {
  if (articulation.fixedMount && !articulation.turretless) return Math.min(score, 4);
  if (!articulation.turretless && !articulation.fixedMount && !inspection.turret) {
    return Math.min(score, 5.5);
  }
  if (!articulation.turretless && inspection.turret && !inspection.gun) {
    return Math.min(score, 9);
  }
  if (articulation.turretless && articulation.fixedMount && !inspection.gun) {
    return Math.min(score, 9);
  }
  return score;
}

function scoreGlb(id, spec, cfg, role) {
  const file = path.join(ROOT, 'public', cfg.path.replace(/^\//, '').replace(/^models\//, 'models/'));
  const issues = [];
  const hardCaps = [];
  if (!fs.existsSync(file)) {
    return { id, role, kind: 'glb', path: cfg.path, score: 0, pass: false,
      issues: ['source file missing'], hardCaps: ['missing source'], inspection: null };
  }

  let inspection;
  try { inspection = inspectGlb(file, cfg); }
  catch (error) {
    return { id, role, kind: 'glb', path: cfg.path, score: 0, pass: false,
      issues: [`GLB parse failed: ${error.message}`], hardCaps: ['invalid source'], inspection: null };
  }

  let source = 1;
  const articulation = scoreArticulation(spec, cfg, inspection, issues, hardCaps);
  const { turret, gun, hierarchy, pivot, turretless } = articulation;
  const proportions = scoreProportions(spec, inspection, issues);

  const hygiene = cfg.fixedGun ? 0 : 1;
  if (cfg.fixedGun) issues.push('legacy fixedGun config is ambiguous; use fixedMount');
  const rawScore = source + turret + gun + hierarchy + pivot + proportions + hygiene;
  const score = round(capArticulationScore(rawScore, articulation, inspection), 2);
  return { id, role, kind: 'glb', path: cfg.path, score, pass: score >= PASS,
    turretless, issues, hardCaps, inspection,
    components: { source, turret, gun, hierarchy, pivot, proportions: round(proportions), hygiene } };
}

function scoreProcedural(id, spec, hasComparisonSource) {
  const family = spec.visualBase || (spec.variantOf && spec.variantOf !== id);
  const generic = !family && hasComparisonSource;
  const score = generic ? 8.5 : family ? 9 : 9.5;
  const issues = [];
  if (generic) issues.push('uses dimension-correct generic articulated fallback');
  else if (family) issues.push(`uses articulated family visual: ${spec.visualBase || spec.variantOf}`);
  return { id, role: 'selected', kind: 'procedural', path: null, score, pass: true,
    turretless: spec.armor?.turretless === true, issues, hardCaps: [], inspection: null };
}

const server = await createServer({
  root: ROOT, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
});

let report;
try {
  await server.ssrLoadModule('/src/vehicles/tankFactory.ts');
  const { ALL_TANK_IDS, TANK_SPECS, MODEL_SOURCE } = await server.ssrLoadModule('/src/vehicles/specs.ts');
  const rows = [];
  for (const id of ALL_TANK_IDS) {
    const spec = TANK_SPECS[id];
    const src = MODEL_SOURCE[id] || { source: 'procedural' };
    const comparisonSource = VEHICLE_COMPARISON_SOURCES[id];
    const selected = src.source === 'glb'
      ? scoreGlb(id, spec, src.glb, 'selected')
      : scoreProcedural(id, spec, !!comparisonSource);
    selected.era = spec.era;
    selected.name = spec.name;
    rows.push(selected);
    if (comparisonSource) {
      const candidate = scoreGlb(id, spec, comparisonSource, 'candidate');
      Object.assign(candidate, { era: spec.era, name: spec.name });
      rows.push(candidate);
    }
  }

  const selected = rows.filter((r) => r.role === 'selected');
  const peerMedians = new Map();
  for (const r of selected) {
    if (!peerMedians.has(r.era)) {
      peerMedians.set(r.era, median(selected.filter((x) => x.era === r.era).map((x) => x.score)));
    }
  }
  for (const r of rows) {
    const pm = peerMedians.get(r.era) || 0;
    r.peerMedian = round(pm);
    r.peerDelta = round(r.score - pm);
  }

  const failedSelected = selected.filter((r) => !r.pass);
  const candidates = rows.filter((r) => r.role === 'candidate');
  report = {
    generatedAt: new Date().toISOString(),
    passThreshold: PASS,
    rubric: {
      source: 1, turret: 3, gun: 2, hierarchy: 1, pivot: 1, proportions: 1, configHygiene: 1,
      hardCaps: ['missing turret: 5.5', 'fixed mount on turreted vehicle: 4.0', 'fused gun: 9.0'],
    },
    summary: {
      vehicles: selected.length,
      selectedPassed: selected.length - failedSelected.length,
      selectedFailed: failedSelected.length,
      retainedCandidates: candidates.length,
      candidatesRejected: candidates.filter((r) => !r.pass).length,
      selectedMedian: round(median(selected.map((r) => r.score))),
    },
    rows,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'model-quality.json'), `${JSON.stringify(report, null, 2)}\n`);
  const md = [
    '# Tank model quality audit', '',
    `Pass bar: **${PASS}/10**. Selected: **${report.summary.selectedPassed}/${report.summary.vehicles} pass**. ` +
      `Retained rejected candidates: **${report.summary.candidatesRejected}/${report.summary.retainedCandidates}**.`, '',
    '| Vehicle | Role | Visual | Score | Peer Δ | Turret | Gun | Decision |',
    '|---|---:|---|---:|---:|---|---|---|',
    ...rows.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id)).map((r) =>
      `| ${r.name} (${r.id}) | ${r.role} | ${r.kind} | ${r.score.toFixed(2)} | ${r.peerDelta >= 0 ? '+' : ''}${r.peerDelta.toFixed(2)} | ${r.inspection?.turret || (r.turretless ? 'fixed mount' : 'procedural')} | ${r.inspection?.gun || (r.kind === 'procedural' ? 'procedural' : r.turretless ? 'hull gun' : 'fused/missing')} | ${r.pass ? 'PASS' : 'REJECT'} |`),
    '', '## Scoring notes', '',
    '- Automated scores cover structure, articulation, pivots, orientation/proportions, and config hygiene.',
    '- A fused gun may pass, but is capped at 9.0 and called out because visual elevation remains virtual (including casemate tubes).',
    '- A turreted vehicle without a separable turret is rejected. It cannot be activated merely by calling the asset `fixed`.',
    '- Peer Δ compares the selected score with the median of the same era.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(REPORT_DIR, 'model-quality.md'), md);
} finally {
  await server.close();
}

console.log(`model-quality: ${report.summary.selectedPassed}/${report.summary.vehicles} selected pass; ` +
  `${report.summary.candidatesRejected}/${report.summary.retainedCandidates} candidates rejected; ` +
  `median ${report.summary.selectedMedian.toFixed(2)}`);
if (CHECK && report.summary.selectedFailed) process.exitCode = 1;
