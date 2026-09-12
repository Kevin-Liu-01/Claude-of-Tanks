// Exact, test-only inverse of two qualified tessellation reductions. Keep the
// original complete native fingerprints; never omit running gear from a hash.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KIT } from './tankFactoryCore.ts';
import { leclercWheelSolids } from './profiles/leclercXWheels.ts';
import { trackPatternFor } from './trackPatterns.ts';

function equalGeometry(actual, expected, label) {
  assert.deepEqual(Object.keys(actual.attributes), Object.keys(expected.attributes), label);
  for (const name of Object.keys(expected.attributes)) {
    assert.equal(actual.attributes[name].itemSize, expected.attributes[name].itemSize, label);
    assert.deepEqual(actual.attributes[name].array, expected.attributes[name].array, label);
  }
  assert.deepEqual(actual.index?.array, expected.index?.array, label);
}

function pin(parameters, side, z, segments) {
  const { section, pattern, trackW, pinCapOuter, radialScale, widthScale } = parameters;
  const length = section.pinCapLengthM;
  const x = Math.max(0, (pinCapOuter ?? trackW * .48) - length / 2);
  const y = pattern.pinCentreY ?? -(pattern.padHeight / 2 + pattern.webHeight * .38);
  const indexed = KIT.xform(KIT.xform(new THREE.CylinderGeometry(
    pattern.pinRadius, pattern.pinRadius, length, segments), 0, 0, 0, 0, 0, Math.PI / 2),
  side * x, y, z);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  if (radialScale !== 1) geometry.scale(1, radialScale, 1);
  if (widthScale !== 1) geometry.scale(widthScale, 1, 1);
  return geometry;
}

function slice(geometry, start, count) {
  const result = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    result.setAttribute(name, new THREE.BufferAttribute(attribute.array.slice(
      start * attribute.itemSize, (start + count) * attribute.itemSize),
    attribute.itemSize, attribute.normalized));
  }
  return result;
}

export function historicalLeclercShoe(parameters) {
  const { trackW, pitch, pattern, pinCapOuter, radialScale, widthScale, section, far } = parameters;
  assert.ok(section, 'only explicitly cross-sectioned Leclerc shoes');
  assert.equal(pattern.pinStyle, 'end-caps');
  const current = far
    ? KIT.simplifiedTrackShoeGeometry(trackW, pitch, pattern, radialScale, widthScale, section, pinCapOuter)
    : KIT.trackShoeGeometry(trackW, pitch, pattern, pinCapOuter, radialScale, widthScale, section);
  const pieces = [];
  try {
    assert.equal(current.index, null, 'native shoe stream remains nonindexed');
    // Two untouched 12-triangle connector boxes, four 32-triangle round caps.
    let cursor = current.attributes.position.count - 456;
    assert.ok(cursor > 0, 'pad, guide and surface stock precede the exact pin tail');
    pieces.push(slice(current, 0, cursor));
    for (const side of [-1, 1]) {
      pieces.push(slice(current, cursor, 36)); cursor += 36;
      for (const z of [-section.pinHalfSpacingM, section.pinHalfSpacingM]) {
        const expected = pin(parameters, side, z, 8);
        const actual = slice(current, cursor, 96);
        try { equalGeometry(actual, expected, 'only the exact four eight-sided pin buffers may be inverted'); }
        finally { actual.dispose(); expected.dispose(); }
        pieces.push(pin(parameters, side, z, 12)); cursor += 96;
      }
    }
    assert.equal(cursor, current.attributes.position.count, 'no other vertex is rewritten');
    const restored = mergeGeometries(pieces, false);
    assert.ok(restored, 'historical pin buffers remain compatible');
    return restored;
  } finally { current.dispose(); for (const part of pieces) part.dispose(); }
}

function historicalLowWheels(config) {
  const current = leclercWheelSolids(16), prior = leclercWheelSolids(32);
  const expected = [current.core, ...current.faces.flatMap(face => [face.steel, face.rubber])];
  const replacements = [prior.core, ...prior.faces.flatMap(face => [face.steel, face.rubber])];
  const actual = [config.wheelCoreGeometry.disc, ...config.wheelFaceLayers.map(layer => layer.geometry)];
  let transferred = false;
  try {
    assert.equal(config.wheelCoreGeometry.dark, undefined);
    assert.equal(actual.length, expected.length);
    actual.forEach((geometry, index) => equalGeometry(geometry, expected[index],
      'only the exact 16-sided Leclerc low-LOD wheel recipe may be inverted'));
    actual.forEach(geometry => geometry.dispose());
    transferred = true;
    return { ...config, wheelCoreGeometry: { disc: prior.core },
      wheelFaceLayers: config.wheelFaceLayers.map((layer, index) => ({ ...layer, geometry: replacements[index + 1] })) };
  } finally {
    expected.forEach(geometry => geometry.dispose());
    if (!transferred) replacements.forEach(geometry => geometry.dispose());
  }
}

export function withHistoricalLeclercGear(id, build) {
  assert.ok(id === 'leclerc_x' || id === 'leclerc_classic_x', 'only the two repaired Leclerc recipes');
  const original = KIT.buildRunningGear;
  let calls = 0, shoes = 0;
  KIT.buildRunningGear = (P, config) => {
    assert.equal(P.spec.id, id, 'historical witness cannot affect another tank');
    // Polygon budget 2026-09-12: the recipes author one builder that keeps the
    // native near link and uses the fleet shoe for the far course. Authenticate
    // that exact authored function (near output byte-identical to the native
    // builder) before the historical witness replaces it.
    assert.equal(typeof config.trackShoeBuilder, 'function', 'the authored custom shoe (far-course) builder is present');
    {
      const probe = { trackW: config.trackW, pitch: config.linkPitchM ?? .15, pattern: trackPatternFor({ id }),
        pinCapOuter: config.pinCapOuter ?? null, radialScale: 1, widthScale: 1,
        section: config.trackLinkCrossSection, far: false, high: true };
      const authored = config.trackShoeBuilder(probe);
      assert.ok(authored?.attributes?.position, 'an authored custom shoe must return link geometry');
      const native = KIT.trackShoeGeometry(probe.trackW, probe.pitch, probe.pattern, probe.pinCapOuter, 1, 1, probe.section);
      try {
        assert.deepEqual([...authored.attributes.position.array], [...native.attributes.position.array],
          'authored custom shoe near course is the native measured link');
      } finally { authored.dispose(); native.dispose(); }
    }
    calls++;
    const prior = id === 'leclerc_x' && !P.q ? historicalLowWheels(config) : config;
    return original(P, { ...prior, trackShoeBuilder: parameters => {
      shoes++; return historicalLeclercShoe(parameters);
    } });
  };
  try {
    const tank = build();
    try { assert.equal(calls, 1); assert.equal(shoes, 2); return tank; }
    catch (error) { tank.dispose(); throw error; }
  } finally { KIT.buildRunningGear = original; }
}
