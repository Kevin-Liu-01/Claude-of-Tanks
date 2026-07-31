// src/world/maps/urbanKit.js — town landmark builders for the urban map:
// a church (tall square tower + spire over a steep-roofed nave) and a small
// brick factory (long hall + round chimney stack). Registered into props.js
// BUILDER_BY_NAME (see docs/handoff/content_breadth-r2.md) so map plans can
// place 'church' / 'factory' entries; both give the shelled-town skyline the
// vertical landmarks it was missing.
//
// Builders follow the props.js contract exactly:
//   make<X>(rng, buckets, wallBucket?) -> {w, d, h}   (footprint + height)
// pushing THREE.BufferGeometry parts into buckets.{plaster,stone,roof,wood,dark}.

import * as THREE from 'three';
import { MARKET_BUILDERS } from './mapKits.js';
import { RAIL_BUILDERS } from './railKit.js'; // maps r1: railyard + coastal kits

// --- tiny local twins of the props.js geometry helpers (not exported there) --
function box(w, h, d, uvScale = 0.5) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const su = uvScale, sv = uvScale;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * su, uv.getY(i) * h * sv);
  return g;
}

function gablePrism(w, h, t) {
  // triangular gable slab: width w, rise h, thickness t (matches props.js look)
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.5);
  return g;
}

function pushParts(buckets, parts) {
  for (const key of Object.keys(parts)) {
    for (const g of parts[key]) buckets[key].push(g);
  }
}

/**
 * Stone church: nave with a steep tiled roof + front tower with belfry
 * openings and a tall pyramidal spire. ~21 m to the spire tip — reads on the
 * town skyline from every establishing angle.
 * @param {function():number} rng seeded RNG
 * @param {object} buckets geometry buckets {plaster,stone,roof,wood,dark}
 * @returns {{w:number,d:number,h:number}} footprint + height
 */
export function makeChurch(rng, buckets) {
  const parts = { plaster: [], stone: [], roof: [], wood: [], dark: [] };
  // content_breadth r3: window panes ride the props.js 'glass' bucket when
  // the facade-variety patch is applied (sky-catching panes); falls back to
  // 'dark' cleanly on an unpatched props.js.
  if (buckets.glass) parts.glass = [];
  const pane = parts.glass || parts.dark;
  const w = 9.2, d = 17.5, wallH = 5.6, roofH = 3.4;
  // nave
  parts.stone.push(box(w + 0.4, 1.2, d + 0.4).translate(0, -0.1, 0));
  parts.stone.push(box(w, wallH, d, 0.6).translate(0, wallH / 2, -1.2));
  parts.stone.push(gablePrism(w, roofH, 0.34).translate(0, wallH, d / 2 - 1.4));
  parts.stone.push(gablePrism(w, roofH, 0.34).translate(0, wallH, -d / 2 - 1.0));
  const slope = Math.hypot(w / 2 + 0.4, roofH + 0.1);
  const ang = Math.atan2(roofH + 0.1, w / 2 + 0.4);
  for (const side of [-1, 1]) {
    const slab = box(slope + 0.15, 0.13, d + 0.6, 0.35);
    slab.rotateZ(side * ang);
    slab.translate(-side * (w / 4 + 0.2), wallH + roofH / 2 + 0.06, -1.2);
    parts.roof.push(slab);
  }
  // tall arched nave windows (glass inset strips with stone sills)
  for (let k = 0; k < 4; k++) {
    const zz = -d / 2 + 2.6 + k * 3.4;
    for (const side of [-1, 1]) {
      pane.push(box(0.08, 2.2, 0.8).translate(side * (w / 2 + 0.05), 2.9, zz - 1.2));
      parts.wood.push(box(0.12, 0.12, 0.95).translate(side * (w / 2 + 0.06), 1.75, zz - 1.2));
    }
  }
  // front tower + belfry + spire
  const tw = 4.6, towerH = 12.6;
  const tz = d / 2 + tw / 2 - 2.2;
  parts.stone.push(box(tw, towerH, tw, 0.62).translate(0, towerH / 2, tz));
  for (const side of [-1, 1]) { // belfry sound openings, all four faces
    parts.dark.push(box(0.9, 1.7, 0.10).translate(side * tw * 0.18, towerH - 1.6, tz + tw / 2 + 0.05));
    parts.dark.push(box(0.9, 1.7, 0.10).translate(side * tw * 0.18, towerH - 1.6, tz - tw / 2 - 0.05));
    parts.dark.push(box(0.10, 1.7, 0.9).translate(side * (tw / 2 + 0.05), towerH - 1.6, tz + side * 0 + tw * 0.0));
  }
  // clock blank + portal
  parts.plaster.push(box(1.5, 1.5, 0.12).translate(0, towerH - 4.0, tz + tw / 2 + 0.04));
  parts.wood.push(box(1.7, 2.9, 0.14).translate(0, 1.45, tz + tw / 2 + 0.10));
  parts.dark.push(box(1.4, 2.6, 0.08).translate(0, 1.3, tz + tw / 2 + 0.16));
  // spire: tall octagonal cone + finial ball
  const spire = new THREE.ConeGeometry(tw * 0.62, 7.4, 8, 1);
  const uv = spire.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 3);
  spire.translate(0, towerH + 3.7, tz);
  parts.roof.push(spire);
  const ball = new THREE.SphereGeometry(0.28, 8, 6);
  ball.translate(0, towerH + 7.5, tz);
  parts.dark.push(ball);
  pushParts(buckets, parts);
  return { w: w + 0.4, d: d + tw + 0.6, h: towerH + 7.8 };
}

/**
 * Small brick factory: long stone hall, clerestory band, shallow gable roof
 * and a ~15 m round chimney stack — the industrial counterpoint landmark.
 * @param {function():number} rng seeded RNG
 * @param {object} buckets geometry buckets {plaster,stone,roof,wood,dark}
 * @returns {{w:number,d:number,h:number}} footprint + height
 */
export function makeFactory(rng, buckets) {
  const parts = { plaster: [], stone: [], roof: [], wood: [], dark: [] };
  // content_breadth r3: see makeChurch — glass panes when available
  if (buckets.glass) parts.glass = [];
  const pane = parts.glass || parts.dark;
  const w = 11.5, d = 19.0, wallH = 6.2, roofH = 2.0;
  parts.stone.push(box(w + 0.4, 1.2, d + 0.4).translate(0, -0.1, 0));
  parts.stone.push(box(w, wallH, d, 0.55).translate(0, wallH / 2, 0));
  parts.stone.push(gablePrism(w, roofH, 0.32).translate(0, wallH, d / 2 - 0.16));
  parts.stone.push(gablePrism(w, roofH, 0.32).translate(0, wallH, -d / 2 + 0.16));
  const slope = Math.hypot(w / 2 + 0.4, roofH + 0.1);
  const ang = Math.atan2(roofH + 0.1, w / 2 + 0.4);
  for (const side of [-1, 1]) {
    const slab = box(slope + 0.15, 0.14, d + 0.7, 0.35);
    slab.rotateZ(side * ang);
    slab.translate(-side * (w / 4 + 0.2), wallH + roofH / 2 + 0.07, 0);
    parts.roof.push(slab);
  }
  // big industrial window grid on both long walls
  for (let k = 0; k < 5; k++) {
    const zz = -d / 2 + (k + 0.5) * (d / 5);
    for (const side of [-1, 1]) {
      if (rng() < 0.12) continue;
      pane.push(box(0.08, 2.6, 1.35).translate(side * (w / 2 + 0.05), 3.4, zz));
      parts.wood.push(box(0.12, 0.10, 1.5).translate(side * (w / 2 + 0.06), 2.0, zz));
    }
  }
  // loading door + name board
  parts.dark.push(box(3.0, 3.4, 0.10).translate(-w * 0.12, 1.7, d / 2 + 0.08));
  parts.wood.push(box(3.4, 0.7, 0.10).translate(-w * 0.12, 4.1, d / 2 + 0.08));
  // round brick chimney stack with a flared crown
  const cx = w / 2 - 1.6, cz = -d / 2 + 2.4, stackH = 15.0;
  const stack = new THREE.CylinderGeometry(0.62, 0.95, stackH, 10, 1);
  const uv2 = stack.attributes.uv;
  for (let i = 0; i < uv2.count; i++) uv2.setXY(i, uv2.getX(i) * 4, uv2.getY(i) * 8);
  stack.translate(cx, stackH / 2, cz);
  parts.stone.push(stack);
  const crown = new THREE.CylinderGeometry(0.80, 0.66, 0.9, 10, 1);
  crown.translate(cx, stackH + 0.35, cz);
  parts.dark.push(crown);
  pushParts(buckets, parts);
  return { w: w + 0.4, d: d + 0.4, h: stackH + 1 };
}

/** Builders keyed by plan name — spread into props.js BUILDER_BY_NAME.
 * content_breadth r2: the desert bazaar builders (maps/mapKits.js) ride the
 * same registry, so 'market' / 'marketRow' plan entries work map-wide with
 * no props.js change. */
export const URBAN_BUILDERS = {
  church: makeChurch, factory: makeFactory, ...MARKET_BUILDERS,
  ...RAIL_BUILDERS, // maps r1: warehouse/gantry/containerRow/… + coastal kit
};
