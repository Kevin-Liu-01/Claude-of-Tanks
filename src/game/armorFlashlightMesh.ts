// The scoped armour flashlight's mesh (243): the armour skin (armorSkin.ts) as one closed, evenly lifted shell per
// frame, with a sample per panel corner and the panel outlines drawn in the one overlay draw.
//
// Before 243 every collision-cell triangle was drawn on its own, each cell blown up about its own centroid: the
// slices overlapped in bands at every seam, the cells' insides (shared slice faces, cupola walls inside the turret)
// showed through, steps left holes, and every triangle took its own sample, so the shell read as a field of
// mismatched shards. Now:
//   - only the union's outer surface is drawn, one panel per plate and plane;
//   - the shell is lifted SKIN_LIFT_M along a normal field that depends on position alone, so panels that meet keep
//     meeting (no seam opens, no band doubles), just proud of skirts, ERA and fittings;
//   - panels are cut no coarser than SAMPLE_EDGE_M and sampled at their corners, the colour interpolating across a
//     panel and stopping at its outline;
//   - plate and crease outlines draw as anti-aliased lines in the fill's own shader (no second draw).
import * as THREE from 'three';
import {
  armorSkinPanels, indexSkinPanels, onSkinPanel, skinBorderTest, type SkinPanelIndex, type SkinPoint,
} from './armorSkin.ts';

/** How far the shell stands proud of the armour cells (m): over skirts, ERA and fittings, as the old inflation did. */
const SKIN_LIFT_M = 0.06;
/** Longest panel edge between two samples (m): the corner samples interpolate across it. */
const SAMPLE_EDGE_M = 1.25;
/** A corner's sample sits this far into its panel (m), so the ray resolves that panel, not its neighbour. */
const SAMPLE_INSET_M = 0.05;
/**
 * Panels of one plate meeting at less than this angle read as one surface: no outline between them. The cells are
 * slices hulled on 45-degree supports, so their facets meet at 20-45 degrees; outlined, they drew every facet as a seam.
 * Plates and true edges keep their outline.
 */
const SOFT_CREASE_COS = Math.cos(THREE.MathUtils.degToRad(50));
const ON_PLANE_M = 0.012;
const KEY_QUANTUM_M = 5e-4;

export interface FlashlightSample {
  /** Frame-local point on the armour the penetration query aims at. */
  readonly center: readonly number[];
  /** The vertices this sample paints: `targets[start .. end)`. */
  readonly start: number;
  readonly end: number;
}

export interface FlashlightGeometry {
  readonly geometry: THREE.BufferGeometry;
  readonly color: THREE.Float32BufferAttribute;
  readonly samples: FlashlightSample[];
  readonly targets: Uint32Array;
}

interface Triangle { panel: number; points: [SkinPoint, SkinPoint, SkinPoint] }

const sub = (a: readonly number[], b: readonly number[]): SkinPoint => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mid = (a: readonly number[], b: readonly number[]): SkinPoint => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const length = (a: readonly number[]): number => Math.hypot(a[0], a[1], a[2]);
const key = (p: readonly number[]): string =>
  `${Math.round(p[0] / KEY_QUANTUM_M)},${Math.round(p[1] / KEY_QUANTUM_M)},${Math.round(p[2] / KEY_QUANTUM_M)}`;

function subdivide(panel: number, a: SkinPoint, b: SkinPoint, c: SkinPoint, out: Triangle[]): void {
  const ab = length(sub(b, a)), bc = length(sub(c, b)), ca = length(sub(a, c));
  const longest = Math.max(ab, bc, ca);
  if (longest <= SAMPLE_EDGE_M) { out.push({ panel, points: [a, b, c] }); return; }
  if (longest === ab) { const m = mid(a, b); subdivide(panel, a, m, c, out); subdivide(panel, m, b, c, out); }
  else if (longest === bc) { const m = mid(b, c); subdivide(panel, b, m, a, out); subdivide(panel, m, c, a, out); }
  else { const m = mid(c, a); subdivide(panel, c, m, b, out); subdivide(panel, m, a, b, out); }
}

/**
 * The lift of a point on the skin: the mean normal of every panel the point lies on, scaled so each of those panels
 * moves out by about SKIN_LIFT_M. It depends on the position alone, so every copy of a shared corner or edge point
 * moves identically and panels that meet keep meeting.
 */
function liftField(index: readonly SkinPanelIndex[]): (point: SkinPoint) => SkinPoint {
  const cache = new Map<string, SkinPoint>();
  return (point) => {
    const k = key(point);
    const hit = cache.get(k);
    if (hit) return hit;
    let x = 0, y = 0, z = 0;
    const normals: SkinPoint[] = [];
    for (const entry of index) {
      if (!onSkinPanel(entry, point, ON_PLANE_M)) continue;
      const n = entry.panel.normal;
      if (normals.some((other) => dot(other, n) > 0.9995)) continue;
      normals.push(n);
      x += n[0]; y += n[1]; z += n[2];
    }
    const size = Math.hypot(x, y, z);
    let lift: SkinPoint = [0, 0, 0];
    if (size > 1e-9) {
      const mean: SkinPoint = [x / size, y / size, z / size];
      let least = 1;
      for (const n of normals) least = Math.min(least, dot(mean, n));
      const scale = SKIN_LIFT_M / Math.max(0.55, least);
      lift = [mean[0] * scale, mean[1] * scale, mean[2] * scale];
    }
    cache.set(k, lift);
    return lift;
  };
}

interface FlashlightTemplate {
  readonly position: THREE.Float32BufferAttribute;
  readonly bary: THREE.Float32BufferAttribute;
  readonly border: THREE.Float32BufferAttribute;
  readonly samples: FlashlightSample[];
  readonly targets: Uint32Array;
  readonly sphere: THREE.Sphere;
}

/** One template per cell list (one per spec frame): every vehicle of a spec shares the shell, only its colours are its own. */
const templates = new WeakMap<object, FlashlightTemplate | null>();

function buildTemplate(cells: Parameters<typeof armorSkinPanels>[0]): FlashlightTemplate | null {
  const panels = armorSkinPanels(cells);
  if (!panels.length) return null;
  const index = indexSkinPanels(panels);
  const triangles: Triangle[] = [];
  panels.forEach((panel, panelIndex) => {
    for (const piece of panel.pieces) {
      for (let i = 1; i + 1 < piece.length; i++) subdivide(panelIndex, piece[0], piece[i], piece[i + 1], triangles);
    }
  });
  if (!triangles.length) return null;
  const lift = liftField(index);
  const isBorder = skinBorderTest(index, SOFT_CREASE_COS);
  const count = triangles.length * 3;
  const positions = new Float32Array(count * 3);
  const bary = new Float32Array(count * 3);
  const borders = new Float32Array(count * 3);
  // one sample per panel corner: the corner's copies (one per triangle meeting there) take its colour
  const corners = new Map<string, { point: SkinPoint; toward: SkinPoint; vertices: number[] }>();
  triangles.forEach((triangle, t) => {
    const [a, b, c] = triangle.points;
    const centroid: SkinPoint = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    // the edge opposite vertex k: k=0 → bc, k=1 → ca, k=2 → ab
    const edge = [isBorder(triangle.panel, b, c, centroid), isBorder(triangle.panel, c, a, centroid), isBorder(triangle.panel, a, b, centroid)];
    triangle.points.forEach((point, k) => {
      const vertex = t * 3 + k;
      const l = lift(point);
      positions.set([point[0] + l[0], point[1] + l[1], point[2] + l[2]], vertex * 3);
      bary[vertex * 3 + k] = 1;
      borders.set([edge[0] ? 1 : 0, edge[1] ? 1 : 0, edge[2] ? 1 : 0], vertex * 3);
      const cornerKey = `${triangle.panel}|${key(point)}`;
      let corner = corners.get(cornerKey);
      if (!corner) { corner = { point, toward: [0, 0, 0], vertices: [] }; corners.set(cornerKey, corner); }
      corner.vertices.push(vertex);
      corner.toward[0] += centroid[0]; corner.toward[1] += centroid[1]; corner.toward[2] += centroid[2];
    });
  });
  const samples: FlashlightSample[] = [];
  const targets = new Uint32Array(count);
  let cursor = 0;
  for (const corner of corners.values()) {
    const n = corner.vertices.length;
    const toward: SkinPoint = [corner.toward[0] / n, corner.toward[1] / n, corner.toward[2] / n];
    const inward = sub(toward, corner.point);
    const distance = length(inward);
    const step = distance > 1e-9 ? Math.min(SAMPLE_INSET_M, distance * 0.5) / distance : 0;
    const center = [corner.point[0] + inward[0] * step, corner.point[1] + inward[1] * step, corner.point[2] + inward[2] * step];
    samples.push({ center, start: cursor, end: cursor + n });
    targets.set(corner.vertices, cursor);
    cursor += n;
  }
  const position = new THREE.Float32BufferAttribute(positions, 3);
  const sphere = new THREE.Sphere();
  new THREE.Box3().setFromBufferAttribute(position).getBoundingSphere(sphere);
  return {
    position, bary: new THREE.Float32BufferAttribute(bary, 3), border: new THREE.Float32BufferAttribute(borders, 3),
    samples, targets, sphere,
  };
}

/** The flashlight shell of one frame's cells for one vehicle, or null when they have no outer surface. */
export function buildFlashlightGeometry(
  cells: Parameters<typeof armorSkinPanels>[0],
  neutral: THREE.Color,
): FlashlightGeometry | null {
  if (!cells?.length) return null;
  let template = templates.get(cells);
  if (template === undefined) { template = buildTemplate(cells); templates.set(cells, template); }
  if (!template) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', template.position);
  const colors = new Float32Array(template.position.count * 3);
  for (let vertex = 0; vertex < template.position.count; vertex++) colors.set([neutral.r, neutral.g, neutral.b], vertex * 3);
  const color = new THREE.Float32BufferAttribute(colors, 3);
  color.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('color', color);
  geometry.setAttribute('aSkinBary', template.bary);
  geometry.setAttribute('aSkinBorder', template.border);
  geometry.boundingSphere = template.sphere.clone();
  return { geometry, color, samples: template.samples, targets: template.targets };
}

/**
 * The flashlight's one material: the vertex-coloured translucent fill, and its outlines where a triangle edge is a
 * panel border (screen-space width from the barycentric derivatives, so a line stays about 1.5 px at any range).
 */
export function createFlashlightMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.4,
    depthTest: true,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  material.name = 'cot:scoped-armor-flashlight';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aSkinBary;\nattribute vec3 aSkinBorder;\nvarying vec3 vSkinBary;\nvarying vec3 vSkinBorder;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkinBary = aSkinBary;\nvSkinBorder = aSkinBorder;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkinBary;\nvarying vec3 vSkinBorder;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 skinPixels = vSkinBary / max(fwidth(vSkinBary), vec3(1e-5));
      vec3 skinLine = (1.0 - smoothstep(vec3(0.6), vec3(1.7), skinPixels)) * step(vec3(0.5), vSkinBorder);
      float skinEdge = max(skinLine.x, max(skinLine.y, skinLine.z));
      diffuseColor.rgb = mix(diffuseColor.rgb, min(diffuseColor.rgb * 1.35 + 0.12, vec3(1.0)), skinEdge);
      diffuseColor.a = mix(diffuseColor.a, 0.9, skinEdge);`);
  };
  material.customProgramCacheKey = () => 'cot:scoped-armor-flashlight:skin-v1';
  return material;
}
