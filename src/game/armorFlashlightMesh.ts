// The scoped armour flashlight's mesh: the armour skin (armorSkin.ts) as one closed, evenly lifted shell per frame,
// cut into a few smooth armour panels (armorPanels.ts), one flat colour per panel, the panel borders outlined in the
// one overlay draw.
//
// Before 243 every collision-cell triangle was drawn on its own, each cell blown up about its own centroid: the
// slices overlapped in bands at every seam, the cells' insides (shared slice faces, cupola walls inside the turret)
// showed through, steps left holes, and every triangle took its own sample, so the shell read as a field of
// mismatched shards. 243 drew the union's outer surface, but one sample per skin panel (plate and plane): the cells'
// hull triangles a few degrees apart each took their own colour, and the plates' borders ran along triangle edges,
// so a front read as red and green triangle fans (owner, 2026-10-27). Now:
//   - only the union's outer surface is drawn;
//   - the shell is lifted SKIN_LIFT_M along a normal field that depends on position alone, so panels that meet keep
//     meeting (no seam opens, no band doubles), just proud of skirts, ERA and fittings;
//   - the skin is cut into armour zones with straight borders and grown into flat panels (armorPanels.ts); each panel
//     aims a few samples and takes one colour, blended from them by the area each stands for;
//   - panel borders draw as anti-aliased lines in the fill's own shader (no second draw); a panel's inner facets and
//     clipping cuts are never outlined.
import * as THREE from 'three';
import { indexSkinPanels, onSkinPanel, type SkinPanelIndex, type SkinPoint } from './armorSkin.ts';
import { armorPanelSet } from './armorPanels.ts';

/** How far the shell stands proud of the armour cells (m): over skirts, ERA and fittings, as the old inflation did. */
const SKIN_LIFT_M = 0.06;
const ON_PLANE_M = 0.012;
const KEY_QUANTUM_M = 5e-4;

export interface FlashlightSample {
  /** Frame-local points on the panel the penetration query aims at, and the share of the panel each stands for. */
  readonly points: readonly (readonly number[])[];
  readonly weights: readonly number[];
  /** The vertices this panel paints: `targets[start .. end)`. */
  readonly start: number;
  readonly end: number;
}

export interface FlashlightGeometry {
  readonly geometry: THREE.BufferGeometry;
  readonly color: THREE.Float32BufferAttribute;
  readonly samples: FlashlightSample[];
  readonly targets: Uint32Array;
}

const dot = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const key = (p: readonly number[]): string =>
  `${Math.round(p[0] / KEY_QUANTUM_M)},${Math.round(p[1] / KEY_QUANTUM_M)},${Math.round(p[2] / KEY_QUANTUM_M)}`;


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

type FlashlightCells = Parameters<typeof armorPanelSet>[0];
type FlashlightPlates = Parameters<typeof armorPanelSet>[1];

function buildTemplate(cells: FlashlightCells, plates: FlashlightPlates): FlashlightTemplate | null {
  const set = armorPanelSet(cells, plates);
  if (!set) return null;
  const lift = liftField(indexSkinPanels(set.skin));
  let count = 0;
  for (const facet of set.facets) count += (facet.points.length - 2) * 3;
  if (!count) return null;
  const positions = new Float32Array(count * 3);
  const bary = new Float32Array(count * 3);
  const borders = new Float32Array(count * 3);
  const panelVertices: number[][] = set.panels.map(() => []);
  let vertex = 0;
  set.facets.forEach((facet, index) => {
    const points = facet.points, last = points.length - 1;
    const border = (edge: number): number => set.borders[set.edgeStart[index] + edge];
    for (let i = 1; i < last; i++) {
      // the fan triangle (p0, pi, pi+1); the edge opposite vertex k: k=0 → pi..pi+1 (outline edge i), k=1 → pi+1..p0
      // (outline edge `last` on the last triangle, else a diagonal), k=2 → p0..pi (outline edge 0 on the first)
      const edges = [border(i), i + 1 === last ? border(last) : 0, i === 1 ? border(0) : 0];
      for (const [k, point] of [points[0], points[i], points[i + 1]].entries()) {
        const l = lift(point);
        positions.set([point[0] + l[0], point[1] + l[1], point[2] + l[2]], vertex * 3);
        bary[vertex * 3 + k] = 1;
        borders.set(edges, vertex * 3);
        panelVertices[set.facetPanel[index]].push(vertex);
        vertex++;
      }
    }
  });
  const samples: FlashlightSample[] = [];
  const targets = new Uint32Array(count);
  let cursor = 0;
  set.panels.forEach((panel, panelIndex) => {
    const vertices = panelVertices[panelIndex];
    if (!vertices.length) return;
    samples.push({ points: panel.samples, weights: panel.weights, start: cursor, end: cursor + vertices.length });
    targets.set(vertices, cursor);
    cursor += vertices.length;
  });
  const position = new THREE.Float32BufferAttribute(positions, 3);
  const sphere = new THREE.Sphere();
  new THREE.Box3().setFromBufferAttribute(position).getBoundingSphere(sphere);
  return {
    position, bary: new THREE.Float32BufferAttribute(bary, 3), border: new THREE.Float32BufferAttribute(borders, 3),
    samples, targets, sphere,
  };
}

/**
 * The flashlight shell of one frame's cells for one vehicle, zoned by the frame's authored plates, or null when the
 * cells have no outer surface.
 */
export function buildFlashlightGeometry(
  cells: FlashlightCells,
  plates: FlashlightPlates,
  neutral: THREE.Color,
): FlashlightGeometry | null {
  if (!cells?.length) return null;
  let template = templates.get(cells);
  if (template === undefined) { template = buildTemplate(cells, plates); templates.set(cells, template); }
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
