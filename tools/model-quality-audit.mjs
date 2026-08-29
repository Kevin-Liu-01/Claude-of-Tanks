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

function inspectGlb(file, cfg) {
  const json = readGlb(file);
  const nodes = json.nodes || [];
  const parents = new Array(nodes.length).fill(-1);
  nodes.forEach((n, i) => (n.children || []).forEach((c) => { parents[c] = i; }));
  const roots = (json.scenes && json.scenes[json.scene || 0]?.nodes) ||
    nodes.map((_, i) => i).filter((i) => parents[i] < 0);
  const world = new Array(nodes.length);
  const walk = (i, parentM) => {
    const m = localMatrix(nodes[i]);
    if (parentM) m.premultiply(parentM);
    world[i] = m;
    for (const c of nodes[i].children || []) walk(c, m);
  };
  for (const i of roots) walk(i, null);

  const descendants = (root) => {
    const out = new Set();
    const add = (i) => { out.add(i); for (const c of nodes[i]?.children || []) add(c); };
    if (root != null) add(root);
    return out;
  };
  const subtreeSpan = (root) => {
    const box = new THREE.Box3();
    const point = new THREE.Vector3();
    for (const i of descendants(root)) {
      const node = nodes[i];
      const mesh = node.mesh == null ? null : json.meshes?.[node.mesh];
      if (!mesh || !world[i]) continue;
      for (const prim of mesh.primitives || []) {
        const ai = prim.attributes?.POSITION;
        const a = ai == null ? null : json.accessors?.[ai];
        if (!a?.min || !a?.max) continue;
        for (const x of [a.min[0], a.max[0]]) for (const y of [a.min[1], a.max[1]]) {
          for (const z of [a.min[2], a.max[2]]) box.expandByPoint(point.set(x, y, z).applyMatrix4(world[i]));
        }
      }
    }
    if (box.isEmpty()) return 0;
    const size = box.getSize(new THREE.Vector3());
    return Math.max(size.x, size.y, size.z);
  };
  const find = (source, within = null, preferLargest = false) => {
    const re = new RegExp(source, 'i');
    const allowed = within == null ? null : descendants(within);
    const hits = [];
    for (let i = 0; i < nodes.length; i++) {
      if ((!allowed || allowed.has(i)) && re.test(nodeName(nodes[i], i))) hits.push(i);
    }
    if (!preferLargest || hits.length < 2) return { index: hits[0] ?? null, count: hits.length };
    hits.sort((a, b) => subtreeSpan(b) - subtreeSpan(a));
    return { index: hits[0], count: hits.length };
  };

  const fixedMount = cfg.fixedMount === true;
  const turretHit = fixedMount ? { index: null, count: 0 } : find(cfg.turretNode || 'turret');
  const turret = turretHit.index;
  let gun = null;
  let gunMatchCount = 0;
  if (turret != null) {
    const gunRe = cfg.gunNode || '(^|[_\\s.-])(gun|barrel|cannon)(?=$|[_\\s.-])';
    let gunHit = find(gunRe, turret, true);
    gun = gunHit.index;
    gunMatchCount = gunHit.count;
    if (gun == null && cfg.gunNode) {
      gunHit = find(gunRe, null, true);
      gun = gunHit.index;
      gunMatchCount = gunHit.count;
    }
  }

  const orient = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
    cfg.pitchOffset || 0, cfg.yawOffset || 0, cfg.rollOffset || 0,
  ));
  const box = new THREE.Box3();
  const corner = new THREE.Vector3();
  const meshBoxes = new Map();
  (json.meshes || []).forEach((mesh, mi) => {
    const mb = new THREE.Box3();
    for (const prim of mesh.primitives || []) {
      const ai = prim.attributes && prim.attributes.POSITION;
      const a = ai == null ? null : json.accessors?.[ai];
      if (!a?.min || !a?.max) continue;
      mb.expandByPoint(new THREE.Vector3().fromArray(a.min));
      mb.expandByPoint(new THREE.Vector3().fromArray(a.max));
    }
    meshBoxes.set(mi, mb);
  });
  nodes.forEach((node, i) => {
    const mb = node.mesh == null ? null : meshBoxes.get(node.mesh);
    if (!mb || mb.isEmpty() || !world[i]) return;
    const m = world[i].clone().premultiply(orient);
    for (const x of [mb.min.x, mb.max.x]) for (const y of [mb.min.y, mb.max.y]) {
      for (const z of [mb.min.z, mb.max.z]) box.expandByPoint(corner.set(x, y, z).applyMatrix4(m));
    }
  });
  const size = box.isEmpty() ? null : box.getSize(new THREE.Vector3());
  return {
    nodeCount: nodes.length,
    meshCount: (json.meshes || []).length,
    names: nodes.map(nodeName),
    turret: turret == null ? null : nodeName(nodes[turret], turret),
    gun: gun == null ? null : nodeName(nodes[gun], gun),
    turretMatchCount: turretHit.count,
    gunMatchCount,
    gunInsideTurret: gun != null && descendants(turret).has(gun),
    size: size ? [size.x, size.y, size.z].map((v) => round(v, 4)) : null,
  };
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

  const turretless = spec.armor?.turretless === true;
  const fixedMount = cfg.fixedMount === true;
  let source = 1;
  let turret = 0;
  let gun = 0;
  let hierarchy = 0;
  let pivot = 0;

  if (turretless) {
    if (fixedMount) {
      turret = 3;
      pivot = 1;
      if (cfg.gunNode && inspection.gun) { gun = 2; hierarchy = 1; }
      else {
        gun = 1.25;
        hierarchy = 0.75;
        issues.push('fixed-mount gun is fused; visual elevation remains virtual');
        hardCaps.push('fused fixed-mount gun caps score at 9.0');
      }
    }
    else {
      issues.push('casemate source is not declared fixedMount');
      hardCaps.push('casemate contract mismatch');
    }
  } else if (fixedMount) {
    issues.push('fixedMount is forbidden on a real turreted vehicle');
    hardCaps.push('turreted vehicle capped at 4.0');
  } else if (!inspection.turret) {
    issues.push('no separable turret node');
    hardCaps.push('missing turret caps score at 5.5');
  } else {
    turret = 3;
    pivot = cfg.autoPivot || cfg.pivot ? 1 : 0.7;
    if (inspection.gun) {
      gun = 2;
      hierarchy = inspection.gunInsideTurret ? 1 : 0.8;
      if (!inspection.gunInsideTurret) issues.push('gun is a turret sibling; loader reparent required');
      if (inspection.gunMatchCount > 1) issues.push(`${inspection.gunMatchCount} gun-name matches; largest barrel selected`);
    } else {
      // A fused tube still yaws correctly with its turret, but visual elevation
      // cannot follow the simulation. It can pass only when every other gate
      // is healthy and remains visible in the report.
      gun = 1.25;
      hierarchy = 0.75;
      issues.push('gun is fused to turret; elevation remains virtual');
      hardCaps.push('fused gun caps score at 9.0');
    }
  }

  let proportions = 0.5;
  if (inspection.size) {
    const [w, h, l] = inspection.size;
    const gotW = w / Math.max(l, 1e-6);
    const gotH = h / Math.max(l, 1e-6);
    const wantW = spec.dims.widthM / spec.dims.overallLengthM;
    const wantH = spec.dims.heightM / spec.dims.overallLengthM;
    const err = (Math.abs(gotW - wantW) / wantW + Math.abs(gotH - wantH) / wantH) / 2;
    proportions = clamp(1 - err / 0.75, 0.5, 1);
    if (err > 0.35) issues.push(`overall proportions differ ${Math.round(err * 100)}% from spec`);
  } else issues.push('no accessor bounds; proportion check unavailable');

  const hygiene = cfg.fixedGun ? 0 : 1;
  if (cfg.fixedGun) issues.push('legacy fixedGun config is ambiguous; use fixedMount');
  let score = source + turret + gun + hierarchy + pivot + proportions + hygiene;
  if (fixedMount && !turretless) score = Math.min(score, 4);
  if (!turretless && !fixedMount && !inspection.turret) score = Math.min(score, 5.5);
  if (!turretless && inspection.turret && !inspection.gun) score = Math.min(score, 9);
  if (turretless && fixedMount && !inspection.gun) score = Math.min(score, 9);
  score = round(score, 2);
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
  const { ALL_TANK_IDS, TANK_SPECS, MODEL_SOURCE } = await server.ssrLoadModule('/src/vehicles/specs.js');
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
