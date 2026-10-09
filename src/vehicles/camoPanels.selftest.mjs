import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyCamoPanels, markCamoPanel } from './camoPanels.ts';
import { boxUV, mergeAll } from './factoryGeometry.ts';
import { CAMO_UV_REPEATS_PER_M } from './camoWorldScale.ts';

// 2026-10-07 (tank-accessories round 4; blind-critic wave 214 on the Oplot-M: "the digital camouflage prints as a flat
// sticker across every surface, including the gun barrel wrap and hull boxes, with no tonal break at panel seams").
// Bolted-on pieces take their own window of the camouflage tile and their own paint tone; skins and the armour shell
// keep the one continuous vehicle-scale projection.

const at = (geometry, x, y, z) => { geometry.translate(x, y, z); return geometry; };
const close = (actual, expected, message) => assert.ok(actual.length === expected.length
  && actual.every((value, i) => Math.abs(value - expected[i]) < 1e-5), `${message}: ${actual} vs ${expected}`);
const box = (w, h, d, x = 0, y = 0, z = 0) => at(new THREE.BoxGeometry(w, h, d), x, y, z);
function bake(parts, bucket) {
  const merged = boxUV(mergeAll(parts), CAMO_UV_REPEATS_PER_M);
  const projected = Float32Array.from(merged.getAttribute('uv').array);
  merged.setAttribute('color', new THREE.BufferAttribute(new Float32Array(merged.getAttribute('position').count * 3).fill(1), 3));
  const panels = applyCamoPanels(merged, parts, bucket);
  const ranges = [];
  let offset = 0;
  for (const part of parts) {
    const count = part.index ? part.index.count : part.getAttribute('position').count;
    ranges.push([offset, count]);
    offset += count;
  }
  const uv = merged.getAttribute('uv'), color = merged.getAttribute('color');
  const shift = (i) => {
    const [start] = ranges[i];
    return [uv.getX(start) - projected[start * 2], uv.getY(start) - projected[start * 2 + 1], color.getX(start)];
  };
  const uniform = (i) => {
    const [start, count] = ranges[i];
    const [du, dv, tone] = shift(i);
    for (let v = start; v < start + count; v++) {
      assert.ok(Math.abs(uv.getX(v) - projected[v * 2] - du) < 1e-5 && Math.abs(uv.getY(v) - projected[v * 2 + 1] - dv) < 1e-5,
        `part ${i}: one window across the whole piece`);
      assert.ok(Math.abs(color.getX(v) - tone) < 1e-6, `part ${i}: one paint tone across the whole piece`);
    }
    return [du, dv, tone];
  };
  return { panels, uniform };
}

// --- the bolt-on buckets: a bin with its lid and latch is one panel; a skin and a long rail keep the projection ----
{
  const bin = box(0.38, 0.11, 0.60, 1.27, 1.30, 0.4);
  const lid = box(0.32, 0.026, 0.50, 1.27, 1.362, 0.4);               // overlaps the bin: the same piece
  const latch = box(0.03, 0.04, 0.02, 1.27, 1.33, 0.70);              // overlaps the bin's front face
  const bin2 = box(0.38, 0.11, 0.60, 1.27, 1.30, -0.4);               // its neighbour, 0.2 m away
  const louvre = box(1.56, 0.02, 0.05, 0, 1.44, -2.0);                // a skin: thinner than 6 cm
  const rail = box(0.05, 0.08, 2.9, -1.2, 1.4, 0);                    // longer than any panel
  const { panels, uniform } = bake([bin, lid, latch, bin2, louvre, rail], 'hullDetail');
  assert.equal(panels, 2, 'two bins, two panels');
  const [bu, bv, bt] = uniform(0);
  close(uniform(1), [bu, bv, bt], 'the lid is painted with its bin');
  close(uniform(2), [bu, bv, bt], 'the latch is painted with its bin');
  assert.ok(bu >= 0.17 && bu <= 0.83 && bv >= 0.17 && bv <= 0.83, `a real window shift (${bu}, ${bv})`);
  assert.ok(bt >= 0.93 && bt <= 1.04, `a paint-batch tone (${bt})`);
  const [nu, nv] = uniform(3);
  assert.ok(Math.abs(nu - bu) > 1e-3 || Math.abs(nv - bv) > 1e-3, 'neighbouring bins show different windows');
  close(uniform(4), [0, 0, 1], 'a louvre skin keeps the continuous projection');
  close(uniform(5), [0, 0, 1], 'a 2.9 m rail is structure, not a panel');
}

// --- deterministic from position: the same piece paints the same way in any build order ---------------------------
{
  const a = () => box(0.4, 0.3, 0.5, -0.6, 0.6, -1.4);
  const b = () => box(0.3, 0.25, 0.4, 0.7, 0.6, -1.5);
  const first = bake([a(), b()], 'turretEquipment');
  const second = bake([b(), a()], 'turretEquipment');
  close(first.uniform(0), second.uniform(1), 'panel paint follows the piece, not the merge order');
  close(first.uniform(1), second.uniform(0), 'panel paint follows the piece, not the merge order');
}

// --- the gun: each sleeve section on its own, a one-piece tube continuous ------------------------------------------
{
  const section = (z, len) => at(new THREE.CylinderGeometry(0.1, 0.1, len, 12).rotateX(Math.PI / 2), 0, 0, z);
  const sleeves = [section(1.07, 0.86), section(1.90, 0.80), section(2.72, 0.84)];
  const clamp = section(1.50, 0.03);
  const { panels, uniform } = bake([...sleeves, clamp], 'gun');
  assert.equal(panels, 3, 'three sleeve sections, three panels');
  const windows = sleeves.map((_, i) => uniform(i).slice(0, 2).map((v) => v.toFixed(3)).join(','));
  assert.equal(new Set(windows).size, 3, 'the pattern breaks at every sleeve joint');
  close(uniform(3), [0, 0, 1], 'a 3 cm clamp band keeps the tube projection');
  const tube = bake([section(2.6, 4.8)], 'gun');
  assert.equal(tube.panels, 0, 'a one-piece 4.8 m tube keeps one continuous projection');
}

// --- the armour shell never splits on its own; a builder marks its separate pieces ---------------------------------
{
  const strips = [0, 1, 2].map((i) => box(2.6, 0.2, 0.3, 0, 1.32, -1 + i * 0.3));
  assert.equal(bake(strips, 'hull').panels, 0, 'lofted hull strips keep one continuous projection');
  const skirt = [0, 1].map((i) => markCamoPanel(box(0.185, 0.72, 0.58, 1.79, 0.94, i * 0.62)));
  const marked = bake([...strips, ...skirt], 'hull');
  assert.equal(marked.panels, 2, 'two marked skirt panels');
  close(marked.uniform(0), [0, 0, 1], 'the shell beside them is untouched');
  const lidKey = [markCamoPanel(box(0.4, 0.2, 0.4, 0, 1.6, 0), 'bin-a'), markCamoPanel(box(0.36, 0.03, 0.36, 0, 1.8, 0.6), 'bin-a')];
  const keyed = bake(lidKey, 'turret');
  assert.equal(keyed.panels, 1, 'parts sharing a key are one panel');
  close(keyed.uniform(0), keyed.uniform(1), 'a shared key shares the window and the tone');
}

// --- bolted armour: cassettes keep the continuous window and take only their own tone ------------------------------
{
  const cassettes = [0, 1, 2].map((i) => box(0.25, 0.10, 0.29, -0.4 + i * 0.3, 1.2, 2.2));
  const { panels, uniform } = bake(cassettes, 'turretExternalArmor');
  assert.equal(panels, 3, 'three cassettes, three bricks');
  const tones = cassettes.map((_, i) => uniform(i));
  for (const [du, dv, tone] of tones) {
    close([du, dv], [0, 0], 'ERA keeps the sprayed-in-place window');
    assert.ok(tone >= 0.87 && tone <= 1.06, `a brick tone (${tone})`);
  }
  assert.ok(new Set(tones.map((t) => t[2].toFixed(4))).size >= 2, 'the bricks do not all share one tone');
}

console.log('camoPanels: bins, lids and latches as one panel, sleeve sections, marked shell pieces and ERA brick tones');
