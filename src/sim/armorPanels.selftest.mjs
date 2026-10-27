// The flashlight's armour panels (262): zones with straight borders from the authored plates, one flat panel per zone
// face (slices and their steps merged, slivers absorbed), cracks between slices dropped, outlines on zone borders only,
// samples spread over each panel with weights that sum to one — and the same panels every build.
import assert from 'node:assert/strict';
import { armorPanelSet } from './armorPanels.ts';
import { splitByZones, zonePlates } from './armorZones.ts';

const near = (a, b, tolerance, label) => assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const area = (points) => {
  let x = 0, y = 0, z = 0;
  for (let i = 1; i + 1 < points.length; i++) {
    const c = cross(sub(points[i], points[0]), sub(points[i + 1], points[0]));
    x += c[0]; y += c[1]; z += c[2];
  }
  return Math.hypot(x, y, z) / 2;
};
const plate = (name, verts, kind = 'main') => ({ name, kind, verts, physicalMm: 50, keMm: 50, ceMm: 50 });

// A box cell: each face two triangles; `faceOf(normal, centre)` picks the plate of each triangle, as nearestPlate does.
// `bend` moves the top front right corner forward: the front's two triangles are then not coplanar, and each keeps its
// own plate (a coplanar pair is one plane, which traceTank and the skin give the first triangle's plate).
function box(min, max, faceOf, bend = 0) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const vertices = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1 + bend], [x0, y1, z1]];
  const quads = [[4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6], [0, 4, 7, 3], [7, 6, 2, 3], [0, 1, 5, 4]];
  const faces = [];
  for (const [a, b, c, d] of quads) {
    for (const indices of [[a, b, c], [a, c, d]]) {
      const [p, q, r] = indices.map((i) => vertices[i]);
      const n = cross(sub(q, p), sub(r, p));
      const size = Math.hypot(...n);
      const normal = n.map((value) => value / size);
      const centre = [0, 1, 2].map((k) => (p[k] + q[k] + r[k]) / 3);
      faces.push({ indices, normal, constant: -(normal[0] * p[0] + normal[1] * p[1] + normal[2] * p[2]), plate: faceOf(normal, centre) });
    }
  }
  return { min, max: [x1, y1, z1 + bend], vertices, faces };
}

// The zones of a 4 m long, 2 m wide, 2 m tall hull: the front split into an upper and a lower plate at y = 1, the sides
// into upper and lower at y = 1.2, a roof and a rear.
const upper = plate('upper_glacis', [[-1, 1, 2], [1, 1, 2], [1, 2, 2], [-1, 2, 2]]);
const lower = plate('lower_front', [[-1, 0, 2], [1, 0, 2], [1, 1, 2], [-1, 1, 2]]);
const sideUpper = plate('side_upper_R', [[1, 1.2, 2], [1, 1.2, -2], [1, 2, -2], [1, 2, 2]]);
const sideLower = plate('side_lower_R', [[1, 0, 2], [1, 0, -2], [1, 1.2, -2], [1, 1.2, 2]]);
const sideUpperL = plate('side_upper_L', [[-1, 1.2, -2], [-1, 1.2, 2], [-1, 2, 2], [-1, 2, -2]]);
const sideLowerL = plate('side_lower_L', [[-1, 0, -2], [-1, 0, 2], [-1, 1.2, 2], [-1, 1.2, -2]]);
const roof = plate('roof', [[-1, 2, 2], [1, 2, 2], [1, 2, -2], [-1, 2, -2]]);
const rear = plate('rear', [[1, 0, -2], [-1, 0, -2], [-1, 2, -2], [1, 2, -2]]);
const belly = plate('belly', [[-1, 0, -2], [1, 0, -2], [1, 0, 2], [-1, 0, 2]]);
const plates = [upper, lower, sideUpper, sideLower, sideUpperL, sideLowerL, roof, rear, belly];
// the authority's zigzag: each face triangle takes one plate whole, by its centre — the bent front's two triangles the
// upper and the lower plate (a diagonal border), each slice's side one plate (a border that steps at every seam)
const zigzag = (slice) => (normal, centre) => {
  if (normal[2] > 0.5) return centre[1] > 1 ? upper : lower;
  if (normal[2] < -0.5) return rear;
  if (normal[1] > 0.5) return roof;
  if (normal[1] < -0.5) return belly;
  if (normal[0] > 0) return slice % 2 ? sideUpper : sideLower;
  return slice % 2 ? sideUpperL : sideLowerL;
};

// zonePlates: main plates only, outlines wound so their edge planes face out
{
  const zones = zonePlates([...plates, plate('skirt', [[1.1, 0, 2], [1.1, 0, -2], [1.1, 1, -2], [1.1, 1, 2]], 'spaced')]);
  assert.equal(zones.length, plates.length, 'spaced plates are not zones');
  const front = zones.find((zone) => zone.plate === upper);
  near(front.normal[2], 1, 1e-9, 'the upper glacis faces forward');
  for (const edge of front.edges) assert.ok(edge.normal[0] * 0 + edge.normal[1] * 1.5 + edge.normal[2] * 2 + edge.offset < 0, 'the outline centre is inside every edge plane');
}

// splitByZones: a front quad over both plates is cut once, along the plates' shared edge (y = 1), and nowhere else
{
  const zones = zonePlates(plates);
  const quad = [[-1, 0, 2], [1, 0, 2], [1, 2, 2], [-1, 2, 2]];
  const parts = splitByZones(zones, quad, [0, 0, 1]);
  assert.equal(parts.length, 2, `one cut: ${parts.length} parts`);
  near(parts.reduce((sum, part) => sum + area(part.points), 0), 4, 1e-9, 'the parts cover the quad');
  for (const part of parts) {
    const plateOf = zones[part.zone].plate;
    const ys = part.points.map((point) => point[1]);
    if (plateOf === upper) { near(Math.min(...ys), 1, 1e-9, 'the upper part starts at the shared edge'); near(Math.max(...ys), 2, 1e-9, 'upper top'); }
    else { assert.equal(plateOf, lower, 'the other part is the lower plate'); near(Math.max(...ys), 1, 1e-9, 'the lower part ends at the shared edge'); }
  }
  // restricted to its own zone, a piece is never cut
  const own = splitByZones(zones, quad, [0, 0, 1], new Set([zones.findIndex((zone) => zone.plate === upper)]));
  assert.equal(own.length, 1, 'a piece allowed one zone stays whole');
}

// The hull as four 1 m slices whose faces zigzag between plates: each zone face is one panel with a straight border.
const slices = [-2, -1, 0, 1].map((z, slice) => box([-1, 0, z], [1, 2, z + 1], zigzag(slice), slice === 3 ? 0.02 : 0));
{
  const set = armorPanelSet(slices, plates);
  assert.ok(set, 'the slices have panels');
  const byPlate = new Map();
  for (const panel of set.panels) byPlate.set(panel.plate, [...(byPlate.get(panel.plate) || []), panel]);
  for (const zone of plates) assert.equal(byPlate.get(zone)?.length, 1, `${zone.name} is one panel (${byPlate.get(zone)?.length ?? 0})`);
  near(byPlate.get(upper)[0].area, 2, 0.01, 'the upper glacis panel is its plate: 2 x 1 m');
  near(byPlate.get(lower)[0].area, 2, 0.01, 'the lower plate: 2 x 1 m');
  near(byPlate.get(sideUpper)[0].area, 4 * 0.8, 0.02, 'the upper side over every slice: 4 x 0.8 m');
  near(byPlate.get(sideLower)[0].area, 4 * 1.2, 0.02, 'the lower side: 4 x 1.2 m');
  // the side's border is the plates' shared edge, y = 1.2, straight along every slice
  set.facets.forEach((facet, index) => {
    if (facet.normal[0] < 0.5) return;
    const plateOf = set.panels[set.facetPanel[index]].plate;
    for (const point of facet.points) assert.ok(plateOf === sideUpper ? point[1] >= 1.2 - 1e-9 : point[1] <= 1.2 + 1e-9, 'the side border is straight');
  });
  // the upper/lower border on the front is the line y = 1 (no zigzag): every front facet lies wholly above or below it
  set.facets.forEach((facet, index) => {
    if (facet.normal[2] < 0.5) return;
    const plateOf = set.panels[set.facetPanel[index]].plate;
    for (const point of facet.points) assert.ok(plateOf === upper ? point[1] >= 1 - 1e-9 : point[1] <= 1 + 1e-9, 'the front border is straight');
  });
  // outlines: the zone borders (front upper/lower, the box edges between zones), never the slices' seams on a side
  set.facets.forEach((facet, index) => {
    if (facet.normal[0] < 0.5) return;
    facet.points.forEach((a, k) => {
      const b = facet.points[(k + 1) % facet.points.length];
      const seam = Math.abs(a[2] - b[2]) < 1e-9 && a[2] > -1.99 && a[2] < 1.99;
      if (seam) assert.equal(set.borders[set.edgeStart[index] + k], 0, `no line on the slice seam at z = ${a[2]}`);
    });
  });
  for (const panel of set.panels) {
    near(panel.weights.reduce((sum, weight) => sum + weight, 0), 1, 1e-9, `${panel.plate.name} sample weights sum to one`);
    assert.ok(panel.samples.length >= 1 && panel.samples.length <= 4, 'one to four samples a panel');
  }
  assert.ok(byPlate.get(sideLower)[0].samples.length > 1, 'a large panel is sampled at several points');
  // deterministic: a fresh build of the same cells (a copy of the list) gives the same panels, facets and samples
  const again = armorPanelSet(slices.slice(), plates);
  assert.deepEqual(again.panels.map((panel) => [panel.plate.name, panel.area, panel.samples, panel.weights]),
    set.panels.map((panel) => [panel.plate.name, panel.area, panel.samples, panel.weights]), 'the panels are the same every build');
  assert.deepEqual([...again.borders], [...set.borders], 'the outlines are the same every build');
}

// A crack: two slices 1 cm apart. Their facing caps are the inside of the armour, not skin: dropped.
{
  const cracked = [box([-1, 0, -2], [1, 2, -0.005], zigzag(0)), box([-1, 0, 0.005], [1, 2, 2], zigzag(0))];
  const set = armorPanelSet(cracked, plates);
  const inside = set.facets.filter((facet) => Math.abs(facet.normal[2]) > 0.99 && Math.abs(facet.centroid[2]) < 0.01);
  assert.equal(inside.length, 0, 'the caps either side of the crack are gone');
  near(set.panels.filter((panel) => panel.plate === sideLower)[0].area, 2 * 3.99, 1e-6, 'the side is one panel across the crack, less the crack');
}

// A step: a narrower slice in front (a 0.2 m shelf exposed on top). The shelf is a roof panel of its own zone and the
// front stays two panels; a fan of slivers round it (none here) would join its neighbours.
{
  const stepped = [box([-1, 0, -2], [1, 2, 0], zigzag(0)), box([-1, 0, 0], [1, 1.8, 2], zigzag(0))];
  const set = armorPanelSet(stepped, plates);
  const roofs = set.panels.filter((panel) => panel.plate === roof);
  near(roofs.reduce((sum, panel) => sum + panel.area, 0), 2 * 2 + 2 * 2, 1e-6, 'both roofs drawn');
  assert.ok(set.panels.every((panel) => panel.area > 0.06 || panel.facets.length > 0), 'no empty panel');
}

console.log('armorPanels.selftest: straight zone borders, one panel per zone face, seams and cracks unlined, weighted samples, deterministic');
