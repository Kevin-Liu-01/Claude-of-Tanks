// src/world/maps/rockRooms.ts — rooms cut into a map's tuff pinnacles (the map-revival lane, 2026-10-06, Chimney Valley
// round 2; gauntlet wave 136: "a straight-sided grey drum ... no gate, passage or doorway cut through it", "a featureless
// grey stump").
//
// Cappadocia's castle rocks (Uçhisar, Ortahisar) are the tuff hollowed into a village: doorways and windows cut into the
// faces in tiers, the lowest with a squared-tuff front built against the rock, rows of dovecote holes high up inside a
// whitewashed band, and a passage cut through a rock where a road meets it. The pinnacles are the map's
// inselberg knolls (terrain landforms); this lays their openings on the rock's own face: from the crown outward along a
// bearing to where the ground falls under each tier's height, so every opening sits on the wall it is cut into. Soft
// dressing in the shared buckets (the dark of an opening, the white of a rim, the kit's tuff stone for a built front):
// no collision record, no draw call of its own. It draws from the dressing stream last (dressMapExtras), so the
// stream's earlier dressing is untouched.
import * as THREE from 'three';
import { box } from '../propGeometry.ts';

type Rng = () => number;

/** A pinnacle the rooms are cut into: its centre and radii (the knoll's), its height over the ground round it. */
export interface RockRoomsSite {
  x: number;
  z: number;
  rx: number;
  rz: number;
  height: number;
  /** The talus apron's height at the wall's foot, a share of the height (the knoll's geology: the rooms start above it). */
  apron: number;
  /** A passage cut through the rock's foot: its mouths, each facing a bearing (radians from +x toward +z). */
  gateBearings?: readonly number[];
}

interface RockRoomsBuckets {
  dark: THREE.BufferGeometry[];
  stone: THREE.BufferGeometry[];
  plaster: THREE.BufferGeometry[];
  /** the whitewash of a dovecote band (the Cappadocian kit's lime); the plaster bucket where a map has none */
  plaster2?: THREE.BufferGeometry[];
}

interface RockRoomsGround {
  getHeightAt(x: number, z: number): number;
}

/** The wall at a height: out from the crown along the bearing until the ground falls under it (null if it never does). */
function faceAt(ground: RockRoomsGround, site: RockRoomsSite, bearing: number, y: number): { x: number; z: number; r: number } | null {
  const c = Math.cos(bearing), s = Math.sin(bearing);
  const reach = Math.max(site.rx, site.rz) * 1.4;
  let prev = 0;
  for (let r = 0; r <= reach; r += 0.4) {
    const h = ground.getHeightAt(site.x + c * r, site.z + s * r);
    if (h < y) {
      // back to the wall: between the last point above the height and this one
      const rr = Math.max(0, (prev + r) / 2);
      return { x: site.x + c * rr, z: site.z + s * rr, r: rr };
    }
    prev = r;
  }
  return null;
}

/** A box laid flat against the face at (x, y, z), its front facing the bearing outward, sunk `inset` into the rock. */
function onFace(geometry: THREE.BufferGeometry, x: number, y: number, z: number, bearing: number, inset: number): THREE.BufferGeometry {
  // the box's local +z is its front; turn it to face outward along the bearing
  const c = Math.cos(bearing), s = Math.sin(bearing);
  geometry.rotateY(Math.atan2(c, s));
  geometry.translate(x - c * inset, y, z - s * inset);
  return geometry;
}

/** Lay the rooms of every site: tiers of doorways and windows, the dovecote rows, built fronts at the foot, the gates. */
export function dressRockRooms(sites: readonly RockRoomsSite[], ground: RockRoomsGround, rng: Rng, buckets: RockRoomsBuckets): number {
  let openings = 0;
  const painted = buckets.plaster2 ?? buckets.plaster;
  for (const site of sites) {
    const base = Math.min(...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
      const a = (k / 8) * Math.PI * 2;
      return ground.getHeightAt(site.x + Math.cos(a) * Math.max(site.rx, site.rz) * 1.35, site.z + Math.sin(a) * Math.max(site.rx, site.rz) * 1.35);
    }));
    const H = site.height;
    // the tiers: the lowest a row of doors (some behind a built front), the rest windows, the top the dovecotes
    const foot = Math.min(0.5, site.apron + 0.03);
    const tiers = [foot, foot + (0.72 - foot) * 0.33, foot + (0.72 - foot) * 0.66, 0.72];
    for (let t = 0; t < tiers.length; t++) {
      const y = base + H * tiers[t];
      const count = Math.max(3, Math.round((site.rx + site.rz) * (t === 0 ? 0.28 : 0.24)));
      const phase = rng() * Math.PI * 2;
      for (let i = 0; i < count; i++) {
        const bearing = phase + ((i + (rng() - 0.5) * 0.5) / count) * Math.PI * 2;
        // the gate's side stays clear of the doors beside it
        if (t === 0 && (site.gateBearings ?? []).some((g) => Math.abs(Math.atan2(Math.sin(bearing - g), Math.cos(bearing - g))) < 0.45)) continue;
        const door = t === 0, w = door ? 1.1 + rng() * 0.4 : 0.6 + rng() * 0.5, h = door ? 2.0 + rng() * 0.4 : 0.8 + rng() * 0.6;
        const cy = (door ? y + h / 2 - 0.05 : y + rng() * 1.2);
        const face = faceAt(ground, site, bearing, cy);
        if (!face) continue;
        buckets.dark.push(onFace(box(w, h, 0.5, 0.5), face.x, cy, face.z, bearing, 0.12));
        openings++;
        // a built front: squared tuff against the rock round a door, a window beside it (one door in three)
        if (door && rng() < 0.34) {
          const fw = 4.2 + rng() * 2.2, fh = 3.4 + rng() * 1.2;
          // (the front proud of the rock by 0.6 m; the door and the window just proud of the front)
          const front = onFace(box(fw, fh, 0.7, 0.5), face.x, y + fh / 2 - 0.3, face.z, bearing, -0.25);
          buckets.stone.push(front);
          buckets.dark.push(onFace(box(w, h, 0.4, 0.5), face.x, y + h / 2 - 0.05, face.z, bearing, -0.42));
          const side = (rng() < 0.5 ? -1 : 1) * fw * 0.3;
          const tx = Math.cos(bearing + Math.PI / 2) * side, tz = Math.sin(bearing + Math.PI / 2) * side;
          buckets.dark.push(onFace(box(0.7, 0.8, 0.4, 0.5), face.x + tx, y + 1.9, face.z + tz, bearing, -0.42));
        }
      }
    }
    // the dovecotes: two or three rows of small holes inside a white-painted band, high on the rock's sunward faces
    const doves = 2 + Math.floor(rng() * 2);
    for (let d = 0; d < doves; d++) {
      const bearing = rng() * Math.PI * 2, y = base + H * (0.78 + rng() * 0.08);
      const face = faceAt(ground, site, bearing, y + 0.6);
      if (!face) continue;
      const bandW = 2.4 + rng() * 1.6, bandH = 1.1 + rng() * 0.5;
      painted.push(onFace(box(bandW, bandH, 0.3, 0.5), face.x, y, face.z, bearing, 0.08));
      const holes = Math.max(3, Math.round(bandW / 0.55));
      for (let k = 0; k < holes; k++) {
        const u = (k - (holes - 1) / 2) * (bandW / holes), tx = Math.cos(bearing + Math.PI / 2) * u, tz = Math.sin(bearing + Math.PI / 2) * u;
        for (const dy of [-bandH * 0.22, bandH * 0.22]) {
          buckets.dark.push(onFace(box(0.22, 0.26, 0.34, 0.5), face.x + tx, y + dy, face.z + tz, bearing, 0.02));
          openings++;
        }
      }
    }
    // the gate: a passage cut through the rock's foot where the road meets it — its dark mouth under a cut arch-head,
    // the tuff of the cut paler round it
    for (const bearing of site.gateBearings ?? []) {
      const y = base + H * foot - 0.6;
      const face = faceAt(ground, site, bearing, y + 2.5);
      if (face) {
        const gw = 4.4, gh = 4.8;
        buckets.dark.push(onFace(box(gw, gh, 1.6, 0.5), face.x, y + gh / 2 - 0.2, face.z, bearing, 0.5));
        buckets.dark.push(onFace(box(gw * 0.7, 1.0, 1.6, 0.5), face.x, y + gh - 0.1, face.z, bearing, 0.5));
        buckets.stone.push(onFace(box(gw + 1.4, gh + 1.6, 0.25, 0.5), face.x, y + (gh + 1.6) / 2 - 0.3, face.z, bearing, -0.02));
        openings++;
      }
    }
  }
  return openings;
}
