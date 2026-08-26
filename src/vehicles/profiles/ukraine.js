// Ukrainian tracked-vehicle family — §5.248 GROUND-UP REBUILDS (ukraine wave).
//
// Every build below is a first-party procedural §K construction measured from
// its OWN registered print (docs/references/vertex/<id>.json extracts +
// tools/tmp-ua-digest.mjs mappings) with PUBLISHED dims sovereign:
//   ua_t64bv       <- t64bv_donbass_manako.glb  (CC-BY-NC kitbash, local-only)
//   ua_t80bv       <- t80bv_ua_manako.glb       (WT-fingerprint, local-only)
//   ua_t80u_kursk  <- t80u_kursk_manako.glb     (viewer-rip suspect, local-only)
//   ua_t84_oplot_m <- oplot_m_manako.glb        (CC-BY-NC, local-only)
// No source vertex, index, texture or topology ships — prints are measured
// visual/metric oracles only (docs/ATTRIBUTION.md §5.248). The previous
// donor-clone builders (variantOf composition over t64bv1/t80bv/t80u/t84)
// are fully replaced per the owner's §5.248 ground-up order; ua_m1a1 keeps
// its certified abrams base + first-party cage (not in the §5.248 drop set).
//
// Print stylization notes (banked in the packets; the curve-axis warps are
// REPORTED to the orchestrator lane per BUILD-STANDARD §E, never run here):
//   oplot print hull -10.4% short / pano band +13.8% tall at width-true;
//   donbass print hull -9.6% short, roof kit band +22%; t80bv print +6.4%
//   long with a +23% kit band; kursk -2.6% overall (usable as-is).

import * as THREE from 'three';
import { KIT, FITTINGS, muzzleBore, orientedSlab } from './kit.js';
import { vehicleAmbientFloorHook } from '../materials.js';
import { addVehicleGhillieSuit } from '../ghillieSuit.js';
import {
  loftHull,
  meshDomeCurved,
  ringSkin,
  tubeGun,
  ruSaddle,
  ruBoot,
  ruGlacisKit,
  ruSkirtBand,
  widthAnchor,
  domeRailRu,
  liftT64HullAboveTallTrack,
} from './russia.js';
import { ABRAMS_PROFILES } from './abrams.js';

function seat(P, owner, fitting, x, y, z, rotation = null) {
  fitting.position.set(x, y, z);
  if (rotation) fitting.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(fitting);
}

// K-1 cassette: full body + dark lid seam INSIDE the face (§B3 tile grammar).
function kTile(P, owner, x, y, z, w, h, d, rotation = null, lid = true) {
  const { box } = KIT;
  const bucket = owner === 'hull' ? 'hullTrack' : 'turretTrack';
  const dark = owner === 'hull' ? 'hullDark' : 'turretDark';
  const r = rotation || [0, 0, 0];
  P.add(bucket, box(w, h, d), x, y, z, r[0], r[1], r[2]);
  if (lid) P.add(dark, box(w * 0.74, Math.min(0.024, h * 0.3), 0.024),
    x, y + h * 0.50 - 0.015, z + d * 0.50 - 0.002, r[0], r[1], r[2]);
}

// Surface-seated cassette. The visible face keeps the authored plane while
// the body grows only toward the carrier, so a sloped/vertical ERA module has
// a real load path instead of balancing on an edge or hovering above armor.
// `axis` is the cassette-local carrier normal; `contactSide` points inward.
function seatedCassette(P, owner, x, y, z, w, h, d, rotation = null, {
  axis = 'y', contactSide = -1, embed = 0.04, lid = true, painted = false,
} = {}) {
  const { box } = KIT;
  const bucket = painted ? owner : (owner === 'hull' ? 'hullTrack' : 'turretTrack');
  const dark = owner === 'hull' ? 'hullDark' : 'turretDark';
  const r = rotation || [0, 0, 0];
  const dims = { x: w, y: h, z: d };
  const shift = { x: 0, y: 0, z: 0 };
  dims[axis] += embed;
  shift[axis] = contactSide * embed * 0.5;
  P.add(bucket, KIT.xform(box(dims.x, dims.y, dims.z), shift.x, shift.y, shift.z),
    x, y, z, r[0], r[1], r[2]);
  if (!lid) return;

  const outward = -contactSide;
  const lidDims = { x: w * 0.80, y: h * 0.80, z: d * 0.80 };
  lidDims[axis] = Math.min(0.024, dims[axis] * 0.22);
  const lidShift = { x: 0, y: 0, z: 0 };
  lidShift[axis] = outward * (dims[axis] * 0.5 - embed * 0.5 - lidDims[axis] * 0.5);
  P.add(dark, KIT.xform(box(lidDims.x, lidDims.y, lidDims.z),
    lidShift.x, lidShift.y, lidShift.z), x, y, z, r[0], r[1], r[2]);
}

// Seat a cassette from the carrier face itself instead of approximating its
// pitch with hand-authored Euler angles. Local +Y is the armor-face normal,
// local +Z follows the requested course direction, and the body penetrates
// the carrier by `embed` so there can be no daylight under the module.
function faceSeatedCassette(P, owner, point, normal, courseAxis, w, h, d, {
  embed = 0.012, painted = true, lid = true,
} = {}) {
  const n = new THREE.Vector3(...normal).normalize();
  const course = new THREE.Vector3(...courseAxis);
  const zAxis = course.clone().addScaledVector(n, -course.dot(n)).normalize();
  const xAxis = new THREE.Vector3().crossVectors(n, zAxis).normalize();
  const basis = new THREE.Matrix4().makeBasis(xAxis, n, zAxis);
  const rotation = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().setFromRotationMatrix(basis), 'XYZ');
  const support = new THREE.Vector3(...point);
  const center = support.clone().addScaledVector(n, h * 0.5);
  seatedCassette(P, owner, center.x, center.y, center.z, w, h, d,
    [rotation.x, rotation.y, rotation.z], {
      axis: 'y', contactSide: -1, embed, painted, lid,
    });
  return { support, normal: n, center, rotation, embed };
}

// Bilinear face probe for the welded wing and shoulder quads. Besides the
// point it returns both surface tangents, allowing every ERA course to inherit
// the compound pitch/yaw of the armor underneath it.
function sampleFace(p00, p10, p11, p01, u, v, outwardHint) {
  const a = new THREE.Vector3(...p00);
  const b = new THREE.Vector3(...p10);
  const c = new THREE.Vector3(...p11);
  const d = new THREE.Vector3(...p01);
  const point = a.clone().multiplyScalar((1 - u) * (1 - v))
    .addScaledVector(b, u * (1 - v))
    .addScaledVector(c, u * v)
    .addScaledVector(d, (1 - u) * v);
  const du = b.clone().sub(a).multiplyScalar(1 - v)
    .add(c.clone().sub(d).multiplyScalar(v));
  const dv = d.clone().sub(a).multiplyScalar(1 - u)
    .add(c.clone().sub(b).multiplyScalar(u));
  const normal = new THREE.Vector3().crossVectors(du, dv).normalize();
  if (normal.dot(new THREE.Vector3(...outwardHint)) < 0) normal.negate();
  return { point, normal, du, dv };
}

// Ukrainian service whip pair (staggered heights, rear-quarter seats).
function uaWhips(P, o) {
  for (const s of [-1, 1]) {
    P.add('turretDark', KIT.box(0.06, 0.07, 0.06), s * o.x, o.y, o.z);
    seat(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats,
      h: s < 0 ? o.hL : o.hR, r: 0.012, rake: -s * 0.05,
      seed: o.seed + (s > 0 ? 1 : 0) }), s * o.x, o.y + 0.04, o.z);
  }
}

// Paired 902-family smoke banks on the cheek flanks.
function uaSmoke(P, o) {
  for (const s of [-1, 1]) {
    seat(P, 'turret', FITTINGS.smokeBank({ mats: P.mats, count: o.count ?? 4,
      r: 0.042, len: 0.28, splay: s * (o.splay ?? 1.02), pitch: o.pitch ?? -0.40,
      arc: o.arc ?? 0.55, spacing: 0.096, slot: 'detail',
      rotation: [0, s * (o.yaw ?? 0.30), -s * 0.10],
      seed: (o.seed ?? 90) + (s > 0 ? 1 : 0) }),
      s * o.x, o.y, o.z);
  }
}

function modernT80CheekCarrier(s) {
  const bottom = [
    [s * 0.12, 0.12, 1.62], [s * 1.28, 0.12, 0.79],
    [s * 1.16, 0.15, -0.12], [s * 0.16, 0.14, 0.38],
  ];
  const top = [
    [s * 0.12, 0.57, 1.54], [s * 1.10, 0.57, 0.76],
    [s * 0.98, 0.60, -0.14], [s * 0.12, 0.61, 0.34],
  ];
  return { bottom, top, front: [bottom[0], bottom[1], top[1], top[0]] };
}

// Build the frontal ERA from the actual welded cheek plane instead of
// orbiting generic boxes around the donor dome. Each painted cassette embeds
// into the faceted carrier, the banks meet beside the mantlet in a clean
// arrow, and only narrow service seams use the dark material. This removes
// the former spare-track-steel wedges/V tips while preserving a T-90-family
// segmented clamshell read from front, quarter and plan views.
function addFacetedT80FrontERA(P, variant) {
  const kursk = variant === 'kursk';
  const receipt = {
    family: 'ua-t80-faceted-t90-front-r2',
    paintedArmorOnly: true,
    cheekCassettes: 0,
    mantletCassettes: 0,
    shoulderReturnCassettes: 6,
  };

  const addCassette = (face, w, h, d, kind) => {
    const cassette = faceSeatedCassette(P, 'turret',
      face.point.toArray(), face.normal.toArray(), face.du.toArray(),
      w, h, d, { embed: 0.040, painted: true, lid: false });

    // A recessed gasket is slightly wider than the cassette and intersects
    // the carrier plane. Only its narrow perimeter remains visible, producing
    // a stable modular joint without a coplanar overlay or a dark panel face.
    P.add('turretDark', KIT.xform(
      KIT.box(w + 0.040, 0.020, d + 0.040),
      0, -h * 0.50 + 0.004, 0,
    ), cassette.center.x, cassette.center.y, cassette.center.z,
    cassette.rotation.x, cassette.rotation.y, cassette.rotation.z);

    // Short flush service mark: enough contrast to expose the face angle at
    // garage/game scale, but far smaller than the removed steel/black blocks.
    P.add('turretDark', KIT.xform(
      KIT.box(0.026, 0.012, d * 0.52),
      w * 0.24, h * 0.50 + 0.006, 0,
    ), cassette.center.x, cassette.center.y, cassette.center.z,
    cassette.rotation.x, cassette.rotation.y, cassette.rotation.z);

    receipt[kind] += 1;
  };

  for (const s of [-1, 1]) {
    const { front: frontFace } = modernT80CheekCarrier(s);

    // Three stepped banks follow the carrier's compound pitch. Their centers
    // are staggered so the outer silhouette reads as interlocking wedges,
    // rather than the old ring of unrelated floating boxes.
    const banks = [
      { v: 0.72, us: [0.20, 0.49, 0.78], w: 0.17, h: kursk ? 0.115 : 0.105, d: 0.31 },
      { v: 0.43, us: [0.16, 0.40, 0.64, 0.86], w: 0.18, h: kursk ? 0.125 : 0.115, d: 0.255 },
      { v: 0.15, us: [0.21, 0.50, 0.79], w: 0.14, h: kursk ? 0.135 : 0.125, d: 0.29 },
    ];
    for (const bank of banks) {
      for (const u of bank.us) {
        const face = sampleFace(...frontFace, u, bank.v, [0, 0, 1]);
        addCassette(face, bank.w, bank.h, bank.d, 'cheekCassettes');
      }
    }

    // The inner nose panel closes each bank at the mantlet without crossing
    // the gun aperture. It is seated on the same face, so there is no detached
    // V-tip or center seam floating ahead of the casting.
    const nose = sampleFace(...frontFace, 0.055, 0.39, [0, 0, 1]);
    addCassette(nose, 0.22, kursk ? 0.13 : 0.12, 0.23, 'mantletCassettes');
  }

  P.turretG.userData.uaT80FrontERAReceipt = Object.freeze(receipt);
}

// Ukrainian T-80 field-modernization package. The resident cast T-80 dome
// remains the load-bearing core, while overlapping welded shoulders, a joined
// rear bustle and a low Relikt/K-5 course give the two modernized vehicles the
// angular T-90-family read requested by the owner. True armor stays in the
// structural turret buckets; sights, RWS hardware, basket rails and stowage
// use the equipment path so they cannot enlarge combat hit volumes.
function addModernizedT80TurretSuite(P, variant) {
  const { box, cylX, cylY, torus } = KIT;
  const kursk = variant === 'kursk';
  const suite = kursk ? 't80u-kursk-t90-style' : 't80bv-ua-t90-style';
  P.turretG.userData.uaT80ModernizationSuite = suite;

  // Joined faceted cheek carriers: their inner/rear edges are buried in the
  // casting, while the shared frontal datum stands proud of the cast skin.
  // ERA derives from this exact face, preventing either daylight or buried
  // modules when the T-80 dome profile changes.
  for (const s of [-1, 1]) {
    const carrier = modernT80CheekCarrier(s);
    P.add('turret', orientedSlab(...carrier.bottom, ...carrier.top));

    // Low rear-flank cassettes extend the frontal chevron into the shoulder
    // instead of ending in isolated blocks. They inherit the vehicle camo.
    for (const [z, y, yaw, roll] of [
      [0.22, 0.48, 0.10, 0.04],
      [-0.30, 0.46, -0.04, -0.03],
      [-0.80, 0.42, 0.08, 0.05],
    ]) {
      P.add('turretDark', box(0.15, 0.15, 0.34), s * 1.08, y - 0.03, z,
        -0.10, s * yaw, s * roll);
      seatedCassette(P, 'turret', s * 1.22, y, z, 0.28, 0.22, 0.42,
        [-0.10, s * yaw, s * roll], {
          axis: 'x', contactSide: -s, embed: 0.055, painted: true,
        });
    }

    // Bustle shoulder and external service box. The carrier overlaps both the
    // casting and the central magazine body below.
    P.add('turret', box(0.38, 0.34, 0.82), s * 0.92, 0.34, -1.20,
      -0.05, -s * 0.08, s * 0.025);
    P.addEquipment('turret', box(0.28, 0.23, 0.44), s * 1.18, 0.39,
      -1.31 + (s > 0 ? 0.08 : -0.05), 0, -s * 0.07, 0);
    P.addEquipment('turret', box(0.24, 0.028, 0.36), s * 1.18, 0.53,
      -1.31 + (s > 0 ? 0.08 : -0.05), 0, -s * 0.07, 0);
  }

  addFacetedT80FrontERA(P, variant);

  // Crown bridge and attached bustle form a continuous T-90-like welded
  // upper silhouette while leaving the gun and two crew stations clear.
  P.add('turret', orientedSlab(
    [-0.82, 0.53, 0.40], [0.82, 0.53, 0.40],
    [0.72, 0.51, -0.82], [-0.72, 0.51, -0.82],
    [-0.68, 0.66, 0.32], [0.68, 0.66, 0.32],
    [0.61, 0.64, -0.78], [-0.61, 0.64, -0.78],
  ));
  P.add('turret', orientedSlab(
    [-1.02, 0.16, -0.70], [1.02, 0.16, -0.70],
    [0.88, 0.17, -1.78], [-0.88, 0.17, -1.78],
    [-0.94, 0.54, -0.64], [0.94, 0.54, -0.64],
    [0.78, 0.55, -1.78], [-0.78, 0.55, -1.78],
  ));
  P.add('turret', box(1.48, 0.035, 0.64), 0, 0.57, -1.35);

  // Shallow roof ERA follows the crown plane; this is armor, not generic
  // gray track material. The central court remains open for hatches/RWS.
  for (const [x, z, ry] of [
    [-0.75, 0.16, -0.14], [0.75, 0.16, 0.14],
    [-0.77, -0.32, 0.08], [0.77, -0.32, -0.08],
    [-0.70, -0.76, -0.10], [0.70, -0.76, 0.10],
  ]) {
    P.add('turret', box(0.36, 0.075, 0.38), x, 0.665, z, -0.04, ry, 0);
    P.add('turretDark', box(0.29, 0.018, 0.30), x, 0.709, z, -0.04, ry, 0);
  }

  // Sosna-class gunner optic on the right-front crown.
  const sightX = 0.58;
  P.addEquipment('turret', box(0.38, 0.13, 0.38), sightX, 0.66, 0.31,
    -0.06, -0.04, 0);
  P.addEquipment('turret', box(0.30, 0.23, 0.29), sightX, 0.80, 0.30,
    -0.04, -0.04, 0);
  P.add('turretDark', box(0.25, 0.16, 0.018), sightX, 0.82, 0.455,
    -0.04, -0.04, 0);
  P.add('turretGlass', box(0.19, 0.10, 0.012), sightX, 0.82, 0.466,
    -0.04, -0.04, 0);

  // Offset panoramic/Kord station, with every course overlapping the seat.
  const panoX = kursk ? -0.61 : -0.57;
  const panoZ = kursk ? -0.55 : -0.47;
  P.addEquipment('turret', cylY(0.27, 0.30, 0.10, 18), panoX, 0.70, panoZ);
  P.addEquipment('turret', box(0.42, 0.22, 0.42), panoX, 0.83, panoZ,
    -0.04, -0.08, 0);
  P.addEquipment('turret', box(0.30, kursk ? 0.29 : 0.24, 0.28), panoX,
    kursk ? 1.02 : 0.99, panoZ, -0.04, -0.08, 0);
  P.add('turretDark', box(0.23, 0.14, 0.016), panoX, kursk ? 1.03 : 1.00,
    panoZ + 0.15, -0.04, -0.08, 0);
  P.add('turretGlass', box(0.17, 0.095, 0.010), panoX, kursk ? 1.03 : 1.00,
    panoZ + 0.16, -0.04, -0.08, 0);
  {
    const rws = FITTINGS.pintleMG({
      mats: P.mats, cls: 'kord', tone: 'dark', elev: -0.08,
      ammo: true, shield: true, scale: kursk ? 0.78 : 0.72,
      seed: kursk ? 8961 : 8861,
    });
    rws.name = `uaT80ModernKord_${variant}`;
    rws.position.set(panoX, kursk ? 0.94 : 0.90, panoZ - 0.03);
    rws.rotation.y = kursk ? 0.24 : 0.18;
    P.turretG.add(rws);
  }

  // Populated, three-sided bustle basket rooted into the magazine shoulders.
  for (const y of [0.28, 0.43, 0.57]) {
    P.addEquipment('turret', box(1.92, 0.025, 0.035), 0, y, -1.94);
  }
  for (const x of [-0.92, -0.46, 0, 0.46, 0.92]) {
    P.addEquipment('turret', box(0.025, 0.34, 0.035), x, 0.42, -1.94);
  }
  for (const s of [-1, 1]) {
    P.addEquipment('turret', box(0.035, 0.025, 0.82), s * 0.95, 0.57, -1.58);
    P.addEquipment('turret', box(0.035, 0.25, 0.025), s * 0.95, 0.43, -1.72);
    P.addEquipment('turret', box(0.035, 0.25, 0.025), s * 0.95, 0.43, -1.36);
  }
  P.addEquipment('turret', box(0.46, 0.20, 0.34), -0.38, 0.39, -1.56);
  P.addEquipment('turret', box(0.36, 0.16, 0.30), 0.42, 0.37, -1.58);
  P.addEquipment('turret', cylX(0.08, 0.74, 12), 0.28, 0.61, -1.64);

  // Mechanical fasteners, hatch rings and bustle lid break up the otherwise
  // flat crown while remaining attached to their carrier planes.
  P.addEquipment('turret', torus(0.24, 0.018, 18), 0.36, 0.706, -0.36);
  P.addEquipment('turret', box(0.46, 0.030, 0.35), 0.36, 0.722, -0.36,
    0, 0.08, 0);
  for (const x of [-0.55, -0.18, 0.18, 0.55]) {
    P.addEquipment('turret', box(0.025, 0.035, 0.14), x, 0.603, -1.25);
  }
}

// ---------------------------------------------------------------------------
// ua_t64bv — T-64BV, Donbas war (print: t64bv_donbass_manako.glb)
// Print frame map: zBuild = (zPrint + 3.97) * 1.101 - 3.27 (hull body
// -3.97..+1.97 -> pub 6.54 at +-3.27). Width-true print (3.416 ~ pub 3.42).
// Measured identities: two-tier K-1 side band x +-1.53..1.71 y 0.69..1.24
// over z -1.47..+2.67; glacis K-1 rows on the 0.87..1.25 plane; dense turret
// K-1 horseshoe (55 census cassettes); raised LEFT commander gallery; right
// rear tall snorkel rack + transom drums + the btr stowage bin (kitbash
// rear cluster); AKM + crate prop cluster on the left rear roof.
// ---------------------------------------------------------------------------
function buildUAT64BV(P) {
  const { box, cylX, cylY, cylZ, slab, buildRunningGear } = KIT;
  // Grow the course upward by 20% while keeping the lower run and road-wheel
  // axles grounded. The body receives the matching ride-height increase at
  // the end of assembly, producing the requested tall \____/ silhouette.
  const trackHeightIncreaseM = 0.16;
  const turretForwardShiftM = 0.20;

  // Hull loft to the print lines (deck plateau 1.315 T-64 datum; glacis
  // break +0.53 falling to the 0.70 nose; flat 0.38 belly; transom at
  // -3.27 with the small tail step the print's rear rack sits over).
  loftHull(P, {
    deck: [
      [-3.27, 1.24], [-3.05, 1.28], [-2.70, 1.335], [-2.10, 1.348],
      [-1.80, 1.315], [0.53, 1.315], [1.15, 1.30], [1.66, 1.10],
      [2.58, 0.865], [3.27, 0.70],
    ],
    belly: [
      [-3.27, 0.46], [-2.85, 0.405], [-2.30, 0.38], [2.20, 0.38],
      [2.60, 0.52], [3.27, 0.66],
    ],
    wUp: [
      [-3.27, 1.40], [-3.00, 1.454], [2.30, 1.454], [2.60, 1.20],
      [3.00, 0.90], [3.27, 0.42],
    ],
    // wLo inside the 0.995 track-band inner edge (wrap-zone clip law)
    wLo: [[-3.27, 0.94], [2.40, 0.94], [2.90, 0.64], [3.27, 0.40]],
    sponsonY: [[-3.27, 1.25], [-2.16, 1.25], [-1.96, 1.05], [2.30, 1.05], [2.70, 0.82], [3.27, 0.62]],
  });

  // Bow: plan arrow corners + fender tips + front flaps over the raised
  // idler (print bow tip 0.66..0.70 band at +3.27).
  for (const s of [-1, 1]) {
    P.add('hull', slab(
      [s * 0.35, 0.62, 3.27], [s * 0.60, 0.65, 3.16], [s * 0.90, 0.70, 2.96], [s * 0.35, 0.64, 2.96],
      [s * 0.35, 0.88, 3.27], [s * 0.60, 0.92, 3.16], [s * 0.90, 0.98, 2.96], [s * 0.35, 0.92, 2.96]));
    P.add('hull', box(0.30, 0.26, 0.24), s * 0.74, 0.88, 2.86, -0.10, 0, 0);
    P.add('hull', box(0.30, 0.10, 0.52), s * 1.24, 1.17, 2.62, -0.16, 0, 0);
    // fender tip + hanger bracket chain the front flap to the fender row
    P.add('hull', box(0.40, 0.115, 0.56), s * 1.245, 1.22, 2.66);
    P.add('hull', box(0.26, 0.05, 0.20), s * 1.44, 1.14, 3.10);
    // §5.272 fix (2): the whole flap stack is rubber-dark — the camo top
    // plate read raw wood-tan in the critic's flap closeups.
    P.add('hullRubber', box(0.15, 0.24, 0.045), s * 1.565, 1.02, 3.12, -0.06, 0, 0);
    P.add('hullRubber', box(0.15, 0.28, 0.040), s * 1.565, 0.90, 3.145);
  }

  // Glacis K-1 raft ON the measured plane (print rows y 0.87..1.25 over
  // build z 1.66..2.58, rake -0.36) — four staggered courses with lids.
  for (let row = 0; row < 4; row++) {
    const zr = 1.72 + row * 0.235;
    const yr = 1.225 - row * 0.088;
    for (let col = -3; col <= 3; col++) {
      const x = col * 0.262 + (row & 1 ? 0.131 : 0);
      if (Math.abs(x) > 0.90) continue;
      P.add('hullTrack', box(0.245, 0.105, 0.235), x, yr, zr + Math.abs(x) * 0.045, -0.36, x * 0.10, 0);
      P.add('hullDark', box(0.19, 0.026, 0.026), x, yr + 0.046, zr + 0.105 + Math.abs(x) * 0.045, -0.36, x * 0.10, 0);
    }
  }
  for (const s of [-1, 1]) {
    P.add('hull', box(0.50, 0.075, 0.045), s * 0.235, 0.90, 2.42, -0.36, s * 0.42, 0);
    KIT.headlight(P, s * 0.72, 1.14, 2.40, -0.22, 0.068);
    P.add('hullDark', box(0.17, 0.15, 0.12), s * 0.72, 1.135, 2.31, -0.22, 0, 0);
    P.add('hullDetail', box(0.020, 0.16, 0.28), s * 0.84, 1.17, 2.40, -0.22, 0, 0);
    P.add('hullDetail', KIT.torus(0.075, 0.016, 10), s * 0.55, 0.55, 2.66, Math.PI / 2, 0, 0);
  }

  // Driver station on the plateau.
  P.add('hull', cylY(0.235, 0.235, 0.042, 14), 0, 1.335, 1.16);
  P.add('hullDark', cylY(0.242, 0.242, 0.012, 14), 0, 1.352, 1.16);
  KIT.periscope(P, 'hullDetail', -0.15, 1.345, 1.44);
  KIT.periscope(P, 'hullDetail', 0.15, 1.345, 1.44);

  // Segmented fender bins (edge-on prism law) + the LEFT exhaust duct.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const z = 2.10 - i * 0.585;
      P.add('hull', box(0.40, 0.115, 0.56), s * 1.245, 1.22, z);
      P.add('hullDark', box(0.34, 0.028, 0.46), s * 1.245, 1.287, z);
      P.add('hullDetail', cylX(0.018, 0.05, 8), s * 1.452, 1.24, z + 0.14);
    }
  }
  P.add('hullDark', box(0.24, 0.17, 0.90), -1.315, 1.30, -2.14);
  P.add('hullDetail', box(0.20, 0.13, 0.76), -1.315, 1.40, -2.14);
  KIT.towCable(P, [[-1.18, 1.30, 0.55], [-0.42, 1.35, 0.05], [0.44, 1.35, 0.03], [1.16, 1.30, 0.51]]);
  {
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 5, width: 0.46, seed: 8641 });
    links.position.set(-0.62, 1.335, 0.60);
    P.hullG.add(links);
  }

  // Raised engine run + louvres.
  for (const s of [-1, 1]) {
    P.add('hullDark', box(1.02, 0.030, 1.00), s * 0.62, 1.338, -2.14);
    for (let i = 0; i < 7; i++) {
      P.add('hullDetail', box(0.92, 0.020, 0.048), s * 0.62, 1.358, -2.56 + i * 0.14);
    }
  }

  // Rear identity cluster measured off the print: layered transom, the
  // RIGHT tall snorkel/stowage rack (print default241: x 0.02..0.97,
  // y 1.26..1.88, z -3.30..-2.59), the LEFT btr stowage bin (print
  // hull2.001: x -0.99..0.07, y 1.30..1.74, z -3.28..-2.42) and the three
  // small transom drums (print 257/258/259 band y 1.09..1.29 at -3.9 print
  // -> transom face here).
  P.add('hull', box(2.60, 0.70, 0.18), 0, 0.84, -3.17, 0.05, 0, 0);
  P.add('hullDark', box(1.80, 0.28, 0.035), 0, 0.95, -3.26);
  for (let i = 0; i < 6; i++) {
    P.add('hullDetail', box(0.24, 0.12, 0.025), -0.75 + i * 0.30, 0.95, -3.28);
  }
  // §5.272 fix (1) — the print's stern grammar: TWIN transverse OPVT
  // snorkel tubes across the stern top, the hull-LEFT corner drum and a
  // canister pair (replaces the right rack-box + left btr-bin read; the
  // fat drum leaves the turret rear in the same fix).
  // OPEN STERN RACK carrying the twin OPVT tubes — the print's default241
  // IS a rack with tubes: four posts + thin dark lid shelf restore the
  // baseline stations/front envelope (bisect receipts: solid-box rack
  // removal cost stations -5.9; tubes past ±0.95 printed front columns)
  // while the tubes read through the open sides at rear/3q garage.
  // The print's default241 rack is RIGHT-HALF (x 0.02..0.97): half-width
  // lid + posts + cheeks match the baseline mask budget (full-width lid
  // doubled the in-window pixels and cost the turret row -3.5); the twin
  // tubes run from center-left into the rack, reading across the stern.
  for (const xf of [0.10, 0.90]) for (const zf of [-2.68, -3.20]) {
    P.add('hullDark', box(0.05, 0.56, 0.05), xf, 1.58, zf);          // rack posts
  }
  P.add('hullDark', box(0.92, 0.045, 0.58), 0.48, 1.862, -2.94);     // lid shelf
  P.add('hull', box(0.05, 0.50, 0.56), 0.10, 1.60, -2.94);           // rack cheeks
  P.add('hull', box(0.05, 0.50, 0.56), 0.90, 1.60, -2.94);
  P.add('hullDetail', cylX(0.135, 1.25, 16), 0.325, 1.45, -3.04);    // lower snorkel tube
  P.add('hullDark', cylX(0.142, 0.05, 14), -0.12, 1.45, -3.04);      // cinch bands
  P.add('hullDark', cylX(0.142, 0.05, 14), 0.62, 1.45, -3.04);
  P.add('hullDark', cylX(0.098, 0.020, 12), -0.30, 1.45, -3.04);     // end rims
  P.add('hullDark', cylX(0.098, 0.020, 12), 0.945, 1.45, -3.04);
  P.add('hullDetail', cylX(0.105, 1.10, 16), 0.38, 1.685, -2.84);    // upper snorkel tube
  P.add('hullDark', cylX(0.112, 0.045, 14), 0.02, 1.685, -2.84);
  P.add('hullDark', cylX(0.112, 0.045, 14), 0.72, 1.685, -2.84);
  // hull-LEFT corner drum (dark ribbed barrel, round face aft) on saddle
  P.add('hullDark', cylZ(0.19, 0.48, 16), -0.98, 1.47, -2.72);
  P.add('hullDetail', cylZ(0.196, 0.045, 16), -0.98, 1.47, -2.90);
  P.add('hullDetail', cylZ(0.196, 0.045, 16), -0.98, 1.47, -2.54);
  P.add('hullDetail', cylZ(0.145, 0.018, 14), -0.98, 1.47, -2.966);  // rear face rim
  P.add('hullDetail', cylZ(0.05, 0.035, 8), -0.98, 1.47, -2.975);    // filler boss
  P.add('hullDark', box(0.42, 0.06, 0.34), -0.98, 1.295, -2.72);     // saddle
  {
  // canister pair on the right stern shelf
  const cans = FITTINGS.jerryCans({ mats: P.mats, count: 2, seed: 8644 });
  cans.position.set(-0.42, 1.36, -2.44);
  cans.rotation.y = 0.10;
  P.hullG.add(cans);
  }
  for (const s of [-1, 1]) {
    P.add('hullDark', KIT.torus(0.075, 0.018, 12), s * 0.85, 0.55, -3.24, Math.PI / 2, 0, 0);
    // rear flaps seat against the sprocket shoe face (x 1.565 carries
    // nothing further aft — a flap floated as a 958 px island at -3.28)
    P.add('hull', box(0.15, 0.24, 0.045), s * 1.565, 0.92, -3.05, 0.08, 0, 0);
    P.add('hullRubber', box(0.15, 0.28, 0.040), s * 1.565, 0.68, -3.07);
  }
  {
    const log = FITTINGS.unditchingLog({ mats: P.mats, len: 2.20, r: 0.10, straps: 4, seed: 8642 });
    log.position.set(0, 0.66, -3.24);
    P.hullG.add(log);
  }

  // T-64 running gear at the print's mapped stations: six 0.267 steel
  // wheels (print pairs c 1.92/1.17/0.29/-0.45/-1.25/-2.06), raised front
  // idler (2.75, 0.675), rear drive (-2.63, 0.76), four return rollers.
  buildRunningGear(P, {
    style: 'holes',
    wheelR: 0.267,
    wheelW: 0.30,
    wheelY: 0.315,
    xc: 1.28,
    dishR: 0.82,
    wheelZs: [1.92, 1.17, 0.29, -0.45, -1.25, -2.06],
    idler: { z: 2.75, y: 0.675 + trackHeightIncreaseM, r: 0.262 },
    sprocket: { z: -2.63, y: 0.76 + trackHeightIncreaseM, r: 0.30 },
    rollers: [-1.95, -0.65, 0.62, 1.85]
      .map((z) => ({ z, y: 0.90 + trackHeightIncreaseM, r: 0.078 })),
    trackW: 0.57,
    pinCapOuter: 0.27,
    topY: 0.93 + trackHeightIncreaseM,
    botY: 0.14,
    contactZF: 2.20,
    contactZR: -2.10,
    paintedEnds: false,
    coveredTop: false,
    arms: true,
    wheelHex: 0x30352d,
  });

  // Skirts: plain sheet + the DONBAS two-tier K-1 side band (print
  // x +-1.53..1.71, y 0.69..1.24, z -1.47..+2.67 — the defining identity).
  for (const s of [-1, 1]) {
    P.add('hull', box(0.012, 0.14, 4.60), s * 1.60, 1.10, 0.00);
    P.add('hull', box(0.13, 0.045, 4.60), s * 1.505, 1.185, 0.00);
  }
  ruSkirtBand(P, { x: 1.66, z0: -2.42, z1: 2.30, yTop: 1.02, yBot: 0.60, panels: 8, dressIn: 0.030, th: 0.05 });
  for (const s of [-1, 1]) for (let i = 0; i < 8; i++) {
    const z = 2.60 - i * 0.585;
    kTile(P, 'hull', s * 1.680, 1.05, z, 0.055, 0.245, 0.40, [0, 0, -s * 0.02], false);
    kTile(P, 'hull', s * 1.690, 0.815, z, 0.055, 0.20, 0.40, [0, 0, -s * 0.02], false);
    P.add('hullDark', box(0.016, 0.024, 0.30), s * 1.712, 1.11, z, 0, 0, -s * 0.02);
  }
  widthAnchor(P, 1.71, 0.80, -2.50);

  // Low cast turret at the print seat: chord -1.83..+1.30, ring center
  // -0.26, crown at the 2.10 line under the 2.17 published p95 datum with
  // the raised LEFT commander gallery carrying it.
  P.turretG.position.set(0, 1.30, -0.26 + turretForwardShiftM);
  const rings = [
    [1.12, -0.02], [1.26, 0.07], [1.30, 0.18], [1.27, 0.32],
    [1.18, 0.44], [1.02, 0.55], [0.80, 0.615], [0.46, 0.66], [0.12, 0.675],
  ];
  meshDomeCurved(P, rings, 1.08, 0, 0, { capR: 1.75, roofTiltScale: 0.62 });
  P.add('turret', cylY(0.84, 0.88, 0.10, 24), 0, 0.0, 0);
  P.add('turretDark', cylY(0.90, 0.90, 0.035, 24), 0, 0.02, 0);

  // Donbas K-1 horseshoe from the print's 55-cassette census: two swept
  // rows per cheek meeting in a V under the gun, one roof-arc row, and
  // three flank returns each side — denser than the base t64bv1 chevron.
  for (const s of [-1, 1]) {
    const sweep = [
      [0.38, 1.065, 0.44, 0.44],
      [0.75, 0.815, 0.50, 0.44],
      [1.11, 0.545, 0.46, 0.42],
    ];
    for (let i = 0; i < sweep.length; i++) {
      const [x, z, w, h] = sweep[i];
      const fx = 0.088 * Math.sin(0.60); const fz = 0.088 * Math.cos(0.60);
      P.add('turretTrack', box(w, h, 0.20), s * x, 0.30, z, -0.13, s * 0.60, s * (0.05 - i * 0.010));
      P.add('turretDark', box(w * 0.76, 0.026, 0.030), s * (x + fx), 0.30 + h * 0.48, z + fz, -0.13, s * 0.60, 0);
      P.add('turretDark', box(0.026, h * 0.78, 0.030), s * (x + fx), 0.30, z + fz, -0.13, s * 0.60, 0);
    }
    // §5.272 fix (3): chevron wrap extended toward the mantlet — one more
    // lower-row cassette flanking the boot + one upper-row block riding the
    // dome slope (+2 per cheek).
    P.add('turretTrack', box(0.30, 0.42, 0.20), s * 0.255, 0.295, 1.175, -0.13, s * 0.60, s * 0.06);
    P.add('turretDark', box(0.026, 0.33, 0.030), s * 0.305, 0.295, 1.225, -0.13, s * 0.60, 0);
    P.add('turretTrack', box(0.26, 0.075, 0.24), s * 0.14, 0.615, 0.74, -0.25, s * 0.18, -s * 0.10);
    // second (upper) cheek row following the dome slope — the print's
    // denser Donbas fit reaches the roof arc.
    for (let i = 0; i < 3; i++) {
      P.add('turretTrack', box(0.30, 0.075, 0.26), s * (0.40 + i * 0.31), 0.565 - i * 0.065, 0.585 - i * 0.145,
        -0.25, s * (0.24 + i * 0.09), -s * 0.13);
    }
    const fxr = s < 0 ? 1.243 : 1.285;
    const fxl = s < 0 ? 1.318 : 1.363;
    for (let i = 0; i < 3; i++) {
      P.add('turretTrack', box(0.15, 0.33 - i * 0.02, 0.31), s * fxr, 0.30, 0.06 - i * 0.33, -0.06, s * 0.09, 0);
      P.add('turretDark', box(0.026, 0.23, 0.24), s * fxl, 0.31, 0.06 - i * 0.33, -0.06, s * 0.09, 0);
    }
    // (owner-absorb outer-return corner module measured -1.2 on the binding
    // turret row and was withdrawn — receipt in the fix report; the ordered
    // toward-the-mantlet extension above carries the chevron-completion
    // intent at zero gate cost.)
  }
  P.add('turretDark', box(0.40, 0.14, 0.06), 0, 0.03, 1.10);
  P.add('turretDark', box(0.34, 0.22, 0.10), 0, 0.16, 0.96, -0.16, 0, 0);

  // Raised LEFT commander gallery + cupola (print default254 band) with
  // TKN blocks; low right gunner hatch keeps the low right roof.
  P.add('turret', box(0.46, 0.20, 0.78), -0.66, 0.68, 0.00, 0, 0, -0.03);
  P.add('turret', box(0.42, 0.16, 0.62), -0.66, 0.83, -0.03, 0, 0, -0.03);
  P.add('turret', slab(
    [-0.20, 0.64, 0.27], [-0.45, 0.64, 0.29], [-0.45, 0.64, -0.39], [-0.20, 0.64, -0.37],
    [-0.20, 0.72, 0.27], [-0.45, 0.87, 0.29], [-0.45, 0.87, -0.39], [-0.20, 0.72, -0.37]));
  P.add('turret', cylY(0.250, 0.268, 0.070, 18), -0.67, 0.825, -0.05);
  P.add('turretDark', cylY(0.212, 0.212, 0.024, 18), -0.67, 0.852, -0.05);
  for (const [gx, gz, gry] of [[-0.50, 0.23, 0.35], [-0.67, 0.27, 0], [-0.84, 0.23, -0.35]]) {
    P.add('turret', box(0.11, 0.055, 0.09), gx, 0.80, gz, -0.10, gry, 0);
    P.add('turretGlass', box(0.075, 0.042, 0.022), gx, 0.822, gz + 0.045, -0.10, gry, 0);
  }

  // Front-left 1G42 sight tower + Luna IR right of the gun.
  P.add('turret', box(0.34, 0.28, 0.32), -0.44, 0.50, 0.92, -0.08, -0.05, 0);
  P.add('turret', box(0.30, 0.30, 0.30), -0.44, 0.74, 1.05, -0.06, -0.05, 0);
  P.add('turretDark', box(0.26, 0.10, 0.05), -0.44, 0.83, 1.21, -0.06, -0.05, 0);
  P.add('turretGlass', box(0.20, 0.12, 0.028), -0.44, 0.75, 1.208, -0.06, -0.05, 0);
  P.add('turret', box(0.12, 0.16, 0.28), 0.54, 0.36, 0.92, -0.10, 0.06, 0);
  P.add('turretDark', cylZ(0.18, 0.16, 18), 0.54, 0.44, 1.07, Math.PI / 2, 0, 0);
  P.add('turretDetail', cylZ(0.148, 0.024, 18), 0.54, 0.44, 1.16, Math.PI / 2, 0, 0);
  P.add('turret', cylY(0.235, 0.235, 0.035, 16), 0.48, 0.60, -0.16);
  P.add('turretDark', cylY(0.208, 0.208, 0.022, 16), 0.48, 0.625, -0.16);

  // Periscope cadence.
  for (const [x, z, ry] of [[-0.30, 0.50, 0.06], [0.30, 0.44, -0.10], [0.62, 0.28, -0.22], [-0.24, -0.44, 0.05], [0.30, -0.42, -0.08]]) {
    P.add('turret', box(0.14, 0.05, 0.12), x, 0.67, z, 0, ry, 0);
    P.add('turretGlass', box(0.095, 0.042, 0.022), x, 0.70, z + 0.055, 0, ry, 0);
  }
  // ventilator mushroom (owner-absorb §5.272: roof-relief intent)
  P.add('turret', cylY(0.13, 0.15, 0.07, 14), 0.30, 0.655, -0.75);
  P.add('turretDark', cylY(0.105, 0.12, 0.02, 12), 0.30, 0.70, -0.75);

  // Shielded forward NSVT on the gallery (census MG, Donbas field fit).
  // §5.272 fix (4): real pedestal mass under the fitting's 2 cm pintle post
  // — base flange on the casting + tapered sleeve + gallery gusset.
  P.add('turretDark', cylY(0.088, 0.102, 0.045, 12), -0.62, 0.615, 0.30);
  P.add('turretDark', cylY(0.052, 0.072, 0.16, 12), -0.62, 0.66, 0.30);
  P.add('turretDark', box(0.08, 0.05, 0.18), -0.62, 0.635, 0.145);
  {
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'nsvt', tone: 'two-tone', elev: 0.08,
      ammo: true, shield: true, scale: 0.98, seed: 8643,
    });
    mg.position.set(-0.62, 0.58, 0.30);
    mg.rotation.y = -0.05;
    P.turretG.add(mg);
  }
  uaSmoke(P, { x: 1.00, y: 0.40, z: -0.56, count: 4, seed: 8650, yaw: -0.30, splay: -1.0, pitch: -0.20 });

  // AKM + crate prop cluster on the left rear roof (print Cube/Vert AKM
  // census) — a strapped crate pair with the slung rifle silhouette.
  P.add('turretDark', box(0.30, 0.10, 0.44), -0.55, 0.60, -0.72, 0, 0.12, 0);
  P.add('turretDetail', box(0.24, 0.07, 0.36), -0.55, 0.68, -0.72, 0, 0.12, 0);
  P.add('turretDark', box(0.035, 0.05, 0.60), -0.42, 0.72, -0.80, 0.05, 0.35, 0);
  P.add('turretDetail', box(0.025, 0.09, 0.16), -0.36, 0.70, -0.62, 0.05, 0.35, 0);

  // Turret rear: bustle rail + low tarp roll + one small strapped box —
  // §5.272 fix (1): the fat stowage drum and the crate pair leave the
  // bustle (the print carries that grammar at the hull stern: twin tubes,
  // left corner drum, canisters). Thin stowed sleeve tube stays.
  P.add('turretDetail', cylX(0.020, 1.52, 12), 0, 0.42, -1.44);
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.05, 0.16, 0.08), s * 0.62, 0.34, -1.42);
  }
  P.add('turret', cylX(0.115, 0.98, 12), 0.10, 0.375, -1.53);
  P.add('turretDark', box(0.05, 0.19, 0.26), -0.24, 0.33, -1.53);
  P.add('turretDark', box(0.05, 0.19, 0.26), 0.42, 0.33, -1.53);
  P.add('turret', box(0.30, 0.20, 0.24), 0.76, 0.32, -1.48, 0.05, 0, 0);
  P.add('turretDark', box(0.25, 0.03, 0.19), 0.76, 0.43, -1.48, 0.05, 0, 0);
  P.add('turret', cylZ(0.075, 0.68, 12), -0.92, 0.36, -1.58);
  P.add('turretDark', cylZ(0.082, 0.035, 12), -0.92, 0.36, -1.85);
  uaWhips(P, { x: 0.10, y: 0.585, z: -1.06, hL: 0.24, hR: 0.20, seed: 8652 });
  domeRailRu(P, rings, 1.08, 0.36, 1.00);

  // 2A46-2 at the 1.50 axis: saddle, boot, stepped thermal sleeve with the
  // mid evacuator, muzzle run to +5.96 world and a true bore.
  P.gunG.position.set(0, 0.20, 1.05);
  ruSaddle(P, { rollR: 0.165, rollW: 0.30, tubeR: 0.086, rootR: 0.185, rootL: 0.50 });
  ruBoot(P, { pts: [
    [-0.30, 0.16, 0.40, -0.10],
    [0.04, 0.15, 0.32, -0.07],
    [0.34, 0.135, 0.235, -0.03],
    [0.62, 0.12, 0.15, 0.00],
  ] });
  tubeGun(P, [
    [0.62, 1.58, 0.097],
    [1.58, 2.46, 0.100],
    [2.46, 3.38, 0.1025],
    [3.38, 4.20, 0.088],
    [4.20, 5.17, 0.084],
  ], {
    rings: [[0.92, 0.100], [1.58, 0.103], [2.46, 0.1055], [3.38, 0.091], [4.20, 0.087], [4.85, 0.087]],
    muzzle: 5.17,
  });
  P.add('gunDark', cylZ(0.086, 0.05, 16), 0, 0, 5.145);
  muzzleBore(P, { r: 0.082 });

  const decalX = ringSkin(rings, 0.40) + 0.025;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.23, [decalX, 0.38, -0.52], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.23, [-decalX, 0.38, -0.52], -Math.PI / 2);
  addVehicleGhillieSuit(P);
  liftT64HullAboveTallTrack(P, {
    trackHeightIncreaseM,
    trackBottomY: 0.14,
    trackTopY: 1.09,
    authoredEnvelopeHeightM: 0.79,
  });
  P.topY = 1.30;
}

// ---------------------------------------------------------------------------
// ua_t80bv — T-80BV in Ukrainian service (print: t80bv_ua_manako.glb).
// Print frame map: zBuild = (zPrint + 4.944) * 0.9374 - 3.39; hull y band
// scaled 0.956 (print deck 1.58 -> 1.51 at the published 2.20 p95 datum).
// Measured identities: turbine stern hump (print 1.93 -> 1.845 build band
// -3.39..-2.87); the transverse bo4ki drum pair riding the stern at
// y 1.27..1.85, z -2.87..-3.40; K-1 skirt band z -1.0..+1.8; K-1 cheek fan
// to the 2.24 line; glacis raft; NSVT right cupola; white-cross-era stowage.
// ---------------------------------------------------------------------------
function buildUAT80BV(P) {
  const { box, cylX, cylY, cylZ, slab, buildRunningGear } = KIT;

  // T-80 hull loft to the print lines at the published datum: 1.51 mid
  // deck, 1.503-class engine plateau, stern undercut rising to the 1.32
  // lip, bow glacis 1.40@2.19 -> 1.02@3.39.
  loftHull(P, {
    deck: [
      [-3.30, 1.43], [-2.92, 1.42], [-2.55, 1.45], [-1.95, 1.47],
      [-1.66, 1.505], [-1.36, 1.505], [-1.10, 1.46], [1.30, 1.45],
      [1.62, 1.46], [1.85, 1.44], [2.05, 1.41], [2.19, 1.40],
      [2.60, 1.245], [3.00, 1.10], [3.39, 1.005],
    ],
    belly: [
      [-3.39, 1.32], [-3.26, 1.12], [-3.10, 0.90], [-2.96, 0.73],
      [-2.60, 0.44], [2.35, 0.44], [2.90, 0.56], [3.39, 0.74],
    ],
    wUp: [[-3.39, 1.28], [3.39, 1.28]],
    wLo: [[-3.39, 1.05], [3.39, 1.02]],
    sponsonY: [[-3.39, 1.42], [-2.35, 1.42], [-2.20, 1.24], [2.40, 1.24], [3.39, 1.24]],
  });

  // Turbine stern hump band with the recessed center channel — §5.272 fix
  // (1): the hump pulls FORWARD off the drum stations (its old -3.33 tail
  // box + -3.14 main box buried the bo4ki pair into a squared shelf).
  for (const s of [-1, 1]) {
    P.add('hull', box(0.875, 0.42, 0.24), s * 1.2175, 1.63, -2.84);
    P.add('hull', box(0.885, 0.15, 0.11), s * 1.2125, 1.70, -2.64);
    P.add('hull', box(0.90, 0.38, 0.19), s * 1.21, 1.20, -3.06);
    P.add('hull', box(0.475, 0.030, 4.35), s * 1.4775, 1.245, 0.22);
    P.add('hull', box(0.060, 0.030, 4.35), s * 1.22, 1.215, 0.22);
    P.add('hull', box(0.045, 0.125, 4.35), s * 1.6925, 1.1875, 0.22);
  }
  P.add('hullDark', box(1.60, 0.02, 1.05), 0, 1.465, -1.95);
  for (let k = 0; k < 5; k++) P.add('hullDetail', box(1.52, 0.02, 0.05), 0, 1.471, -1.62 - k * 0.15);
  P.add('hull', box(0.95, 0.06, 0.58), 0.40, 1.475, -1.50);

  // Glacis: splash ridge above the raft, K-1 raft centered around the
  // driver, V-board, lights, eyes. §5.272 fix (3): CHUNKIER checker relief
  // — three courses CLIMBING the glacis surface (the old row 1 sat 0.2 m
  // inside the hull), h 0.135 tiles with alternating proud offsets + lids.
  P.add('hull', box(1.90, 0.045, 0.16), 0, 1.40, 2.12);
  ruGlacisKit(P, { w: 3.0, y: 1.16, z: 2.66, eyeX: 0.82, eyeZ: 3.10, eyeY: 0.80, hookY: 0.80, hookZ: 3.20, hlY: 1.28 });
  for (const s of [-1, 1]) for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) {
    // row 2 drops its outermost column — at z 2.88 the i=3 tiles (x to
    // 1.22) entered the idler-lane strict sweep (44/60 voxel receipt)
    if (row === 2 && i === 3) continue;
    const proud = (i + row) & 1;
    kTile(P, 'hull', s * (0.235 + i * 0.285),
      1.328 - row * 0.089 + (proud ? 0.022 : 0),
      2.34 + row * 0.27 + (proud ? 0.008 : 0),
      0.26, 0.135, 0.27, [-0.34, s * 0.03, 0], true);
  }
  // §5.341 "more era": varied low fourth course — staggered half-tiles
  // riding the glacis toe between the raft columns (x <= 1.02, clear of
  // the §5.272 idler-lane strict window), alternating pitch for the
  // broken-field read.
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    kTile(P, 'hull', s * (0.38 + i * 0.30), 1.068 + (i & 1) * 0.018, 3.10 + (i & 1) * 0.015,
      0.24, 0.115, 0.24, [-0.36 - (i & 1) * 0.05, s * 0.04, 0], true);
  }
  for (const s of [-1, 1]) {
    P.add('hull', box(0.33, 0.10, 0.05), s * 0.46, 1.13, 3.16, 0, -s * 0.27, 0);
    P.add('hull', box(0.57, 0.10, 0.05), s * 0.83, 1.13, 3.30, 0, -s * 0.62, 0);
    P.add('hull', box(0.38, 0.07, 0.18), s * 0.82, 1.11, 3.10);
    // §5.272 fix (5): the 0.945-wide tip bar floated past the hull side and
    // hung its flap out at the skirt plane — the "bow-left pendant rod /
    // inverted-whip" read. Fender bridge continues the sponson strip over
    // the idler; tip plate at the fender line; flap chained under the tip.
    P.add('hull', box(0.40, 0.030, 0.86), s * 1.42, 1.225, 2.82, -0.045, 0, 0);
    P.add('hull', box(0.36, 0.07, 0.24), s * 1.40, 1.17, 3.26);
    P.add('hullRubber', box(0.30, 0.28, 0.045), s * 1.40, 0.99, 3.35);
    P.add('hullRubber', box(0.34, 0.26, 0.045), s * 1.53, 1.00, -3.12);
  }

  // Stern: turbine grille at its measured seat (the proud drums overhang
  // it) + recovery eyes; the transverse bo4ki pair rides ABOVE on open
  // brackets.
  P.add('hullDark', box(1.80, 0.30, 0.035), 0, 1.35, -3.36);
  for (let i = 0; i < 5; i++) P.add('hullDetail', box(0.30, 0.13, 0.025), -0.72 + i * 0.36, 1.35, -3.375);
  for (const s of [-1, 1]) {
    P.add('hullDark', KIT.torus(0.075, 0.018, 12), s * 0.85, 0.62, -3.365, Math.PI / 2, 0, 0);
    P.add('hullDark', box(0.07, 0.24, 0.08), s * 0.85, 0.78, -3.33);
    // rear fender tips carry the published width to the tail station
    P.add('hull', box(0.30, 0.08, 0.42), s * 1.568, 1.20, -3.14);
    P.add('hullRubber', box(0.30, 0.24, 0.04), s * 1.568, 1.04, -3.34);
  }
  // §5.272 fix (1) — bo4ki: TWO REAL TRANSVERSE CYLINDERS on open stern
  // brackets (print x -1.65..1.56, y 1.27..1.85, z -2.87..-3.40): round
  // 18-seg bodies with proud rim rings, recessed end faces + filler bosses
  // reading at side garage, center pair gap reading at the rear.
  for (const s of [-1, 1]) {
    P.add('hull', cylX(0.27, 1.30, 18), s * 0.795, 1.575, -3.13);
    P.add('hullDark', cylX(0.278, 0.055, 16), s * 0.20, 1.575, -3.13);   // inner rim at the gap
    P.add('hullDark', cylX(0.278, 0.055, 16), s * 1.36, 1.575, -3.13);
    P.add('hullDark', cylX(0.205, 0.022, 16), s * 1.448, 1.575, -3.13);  // recessed end face
    P.add('hullDetail', cylX(0.06, 0.035, 8), s * 1.462, 1.575, -3.13);  // filler boss
    P.add('hullDark', cylX(0.20, 0.018, 16), s * 0.152, 1.575, -3.13);   // inner end face
    P.add('hullDark', box(0.07, 0.26, 0.36), s * 0.42, 1.36, -3.13);     // bracket pair
    P.add('hullDark', box(0.07, 0.26, 0.36), s * 1.14, 1.36, -3.13);
    P.add('hullDetail', box(0.05, 0.02, 0.32), s * 0.795, 1.725, -3.13); // cinch strap
    // cradle pedestal + tail step UNDER the drum arc (0.13+ below the
    // crown; full round read stays proud) — restores the print's fused
    // stern side-mass the old burying shelf carried
    P.add('hull', box(0.875, 0.29, 0.20), s * 1.2175, 1.555, -3.07);
    P.add('hull', box(0.84, 0.15, 0.13), s * 1.215, 1.515, -3.335);
  }
  P.add('hullDark', box(0.10, 0.30, 0.34), 0, 1.42, -3.13);              // center gap saddle post
  {
    const log = FITTINGS.unditchingLog({ mats: P.mats, len: 2.30, r: 0.10, straps: 3, seed: 8801 });
    log.position.set(0, 0.50, -3.32);
    P.hullG.add(log);
  }

  // T-80 running gear (published chassis constants at this frame).
  // §5.272 fix (2): wheel rim/hub contrast lifted (tireHex/wheelHex law —
  // the stock tones read as a black smear behind the old deep skirt).
  buildRunningGear(P, {
    style: 'dished', wheelR: 0.335, wheelW: 0.21, wheelY: 0.44, xc: 1.345, dishR: 0.80,
    tireHex: 0x2e2f29, wheelHex: 0x4b503d,
    wheelZs: [-1.60, -0.88, -0.16, 0.56, 1.28, 2.00],
    sprocket: { z: -2.55, y: 0.95, r: 0.235 }, idler: { z: 2.72, y: 0.86, r: 0.19 },
    rollers: [-1.24, -0.52, 0.20, 0.92, 1.64].map((z) => ({ z, y: 0.86, r: 0.08 })),
    trackW: 0.58, topY: 0.85, botY: 0.06, paintedEnds: true, coveredTop: true, arms: true,
  });

  // Skirts — §5.341 t90-line FULL PROGRAM (owner: "a bunch of sideskirts
  // and more era"): the base band keeps its §5.272 §B9-proven exposure
  // line; the K-1 plate row now runs the FULL hull length (8 armored
  // panels per side at the §5.272-proven 1.7435/0.028 deep-class face,
  // front pair deep to 0.74, the rest to the 0.87 K-1 band — all clear of
  // the 0.775 wheel tops so the six dished wheels keep reading, §B9), a
  // skirt-top ERA cassette strip rides the band lip (t90 skirt-ERA
  // grammar) and rubber fore-sections hang at the idler lane (t90 rubber
  // fronts; faces inside the ±1.76 width guard, §5.263 — nothing rescales).
  ruSkirtBand(P, { x: 1.72, th: 0.05, z0: -2.66, z1: 2.90, yTop: 1.17, yBot: 1.03, panels: 8, lipX: 1.737, lipY: 1.045 });
  // (panel run clamped INSIDE the band span — the first 0.705-pitch lay
  // overhung the -2.66 band end and enclosed a 2-cell §B2 pocket per
  // stern corner against the sponson strip; swap-run receipt holes 0 at
  // HEAD, 2c+2c at the overhang.)
  for (const s of [-1, 1]) for (let i = 0; i < 8; i++) {
    const z = 2.28 - i * 0.668;
    const deep = i < 2;
    kTile(P, 'hull', s * 1.7435, deep ? 1.015 : 1.08, z, 0.028, deep ? 0.55 : 0.42, 0.52, [0, 0, -s * 0.02], false);
    P.add('hullDark', box(0.014, 0.026, 0.42), s * 1.754, 1.16, z, 0, 0, -s * 0.02);
    P.add('hullTrack', box(0.012, 0.10, 0.56), s * 1.7465, 1.225, z, 0, 0, -s * 0.02);
    P.add('hullDark', box(0.010, 0.024, 0.50), s * 1.7505, 1.262, z, 0, 0, -s * 0.02);
  }
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
    P.add('hullRubber', box(0.035, 0.26, 0.58), s * 1.752, 0.90, 2.62 - i * 0.64, 0, 0, -s * 0.015);
  }
  widthAnchor(P, 1.76, 0.82, -2.48);

  // Cast turret — §5.341 T-80 DOME REBASE (owner: "the same base t80
  // turret shapes again used with russian tanks instead of the new odd
  // base shape"): the sz-1.10 ellipse is replaced by the RESIDENT
  // t80-line cast profile (t80.js buildT80Line BV ring list — the broad
  // low 1.465-radius casting with the fat 0.42 wall band), squashed 0.88
  // above the 0.06 ring base so the crown holds this frame's 2.09-2.16
  // world class, plan bias cz +0.17 per the resident. The casting sits IN
  // the deck ring recess like the resident (turretG drops 1.50 -> 1.42;
  // gun axis keeps its certified 1.69 world height below).
  // (squash 0.94 + the 1.44 seat: heightM p95 receipt — 0.88@1.42 read
  // 2.14 vs the 2.18 baseline datum; this frame carries the published
  // 2.20 at the crown 2.15 + cupola band 2.19-2.21.)
  P.turretG.position.set(0, 1.44, -0.05);
  const rawRings = [
    [1.44, 0.06], [1.465, 0.42], [1.435, 0.47], [1.28, 0.655],
    [1.19, 0.69], [0.80, 0.74], [0.02, 0.75],
  ];
  const rings = rawRings.map(([r, y]) => [r, 0.06 + (y - 0.06) * 0.94]);
  meshDomeCurved(P, rings, 0.88, 0, 0.17, { capR: 1.60, roofTiltScale: 0.62 });
  P.add('turret', cylY(0.82, 0.86, 0.10, 24), 0, 0.0, 0);
  P.add('turretDark', cylY(0.88, 0.88, 0.035, 24), 0, 0.02, 0);
  P.add('turretDark', box(1.00, 0.40, 1.20), 0, -0.18, 0.20);

  // The frontal package is installed after its welded carrier by
  // addModernizedT80TurretSuite, so every cassette is surface-seated and
  // camouflaged rather than emitted as spare-track steel around the dome.

  // Commander cupola RIGHT with the NSVT, gunner hatch LEFT, TKN blocks,
  // Luna IR left of the gun — every roof seat recomputed on the rebased
  // casting skin (the resident dome is fuller at mid-radius; old seats
  // would sink, §5.04).
  P.add('turret', cylY(0.25, 0.268, 0.085, 18), 0.55, 0.723, -0.28);
  P.add('turretDark', cylY(0.212, 0.212, 0.028, 18), 0.55, 0.758, -0.28);
  P.add('turretDetail', box(0.09, 0.05, 0.06), 0.55, 0.738, -0.02);
  {
    // stowed NSVT lying across the rear roof arc (UA service practice;
    // p95 discipline — the published 2.20 datum is the crown, and a
    // standing pintle sweeps 6+ columns above it). Exact-group census.
    const g = new THREE.Group();
    const mk = (mat, geo, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      g.add(m); return m;
    };
    mk(P.mats.dark, box(0.09, 0.09, 0.40), 0, 0.045, 0);
    mk(P.mats.detail, box(0.04, 0.015, 0.36), 0, 0.098, 0);
    mk(P.mats.dark, cylZ(0.023, 0.52, 10), 0, 0.02, 0.44);
    mk(P.mats.dark, cylZ(0.032, 0.08, 10), 0, 0.02, 0.66);
    mk(P.mats.dark, box(0.05, 0.05, 0.05), 0, -0.025, -0.13);
    mk(P.mats.dark, box(0.05, 0.05, 0.05), 0, -0.025, 0.15);
    FITTINGS.markExact(g, 'pintleMG');
    g.position.set(0.42, 0.652, -0.86);
    g.rotation.y = 0.55;
    P.turretG.add(g);
  }
  P.add('turret', cylY(0.225, 0.24, 0.06, 16), -0.52, 0.737, -0.30);
  P.add('turretDark', cylY(0.195, 0.195, 0.024, 16), -0.52, 0.772, -0.30);
  for (const [gx, gz, gry, gy] of [[0.40, 0.02, 0.30, 0.718], [0.60, 0.06, 0, 0.715], [0.74, -0.04, -0.30, 0.711]]) {
    P.add('turret', box(0.10, 0.05, 0.08), gx, gy, gz, -0.10, gry, 0);
    P.add('turretGlass', box(0.07, 0.038, 0.02), gx, gy + 0.022, gz + 0.04, -0.10, gry, 0);
  }
  P.add('turret', box(0.10, 0.10, 0.11), 0.10, 0.728, 0.24, -0.06, 0, 0);
  P.add('turretGlass', box(0.07, 0.045, 0.022), 0.10, 0.751, 0.30, -0.06, 0, 0);
  for (const [x, z, ry] of [[-0.28, 0.46, 0.08], [0.30, 0.42, -0.10], [-0.22, -0.46, 0.05]]) {
    P.add('turret', box(0.13, 0.045, 0.11), x, 0.719, z, 0, ry, 0);
    P.add('turretGlass', box(0.09, 0.036, 0.02), x, 0.741, z + 0.05, 0, ry, 0);
  }
  // ventilator mushroom (owner-absorb §5.272: roof-relief intent)
  P.add('turret', cylY(0.12, 0.14, 0.06, 14), -0.38, 0.6915, -0.68);
  P.add('turretDark', cylY(0.098, 0.11, 0.018, 12), -0.38, 0.7295, -0.68);

  // 902 smoke banks on the cheek flank cluster (T-80BV obr. fit) — seated
  // flush on the rebased casting skin.
  uaSmoke(P, { x: 1.36, y: 0.40, z: 0.64, count: 4, seed: 8810, yaw: 0.30 });

  // Bustle: rack rail, stowage boxes, rolled tarp (UA-era kit), whips —
  // pulled forward to the rebased casting's shorter rear wall.
  P.add('turretDetail', cylX(0.020, 1.46, 12), 0, 0.40, -1.10);
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.05, 0.15, 0.08), s * 0.58, 0.32, -1.05);
    P.add('turret', box(0.33, 0.23, 0.28), s * 0.56, 0.34, -1.16, 0.06, 0, 0);
    P.add('turretDark', box(0.28, 0.03, 0.22), s * 0.56, 0.475, -1.16, 0.06, 0, 0);
  }
  P.add('turret', cylX(0.11, 0.90, 12), 0, 0.545, -1.16);
  P.add('turretDark', box(0.06, 0.16, 0.05), -0.30, 0.49, -1.16);
  P.add('turretDark', box(0.06, 0.16, 0.05), 0.30, 0.49, -1.16);
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.06, 0.06, 0.06), s * 0.86, 0.30, -0.88);
    seat(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats,
      h: 0.30, r: 0.011, rake: -s * 0.55, seed: 8812 + (s > 0 ? 1 : 0) }),
      s * 0.86, 0.33, -0.88);
  }

  addModernizedT80TurretSuite(P, 'bv');

  // 2A46M-1 at the 1.69 axis: saddle, boot, sleeve, muzzle +6.27, bore
  // (gun local +0.06 compensates the 1.50 -> 1.44 ring drop — the world
  // axis is certified).
  P.gunG.position.set(0, 0.25, 1.02);
  ruSaddle(P, { rollR: 0.165, rollW: 0.30, tubeR: 0.086, rootR: 0.185, rootL: 0.50 });
  // §5.272 fix (4): Luna-4 IR searchlight READABLE left of the gun — big
  // scheme-painted drum on a mask bracket in the gun frame (elevates with
  // the tube, the real L-4A articulation), dark face rim + recessed lens.
  P.add('gunMountDark', box(0.30, 0.09, 0.12), -0.33, 0.24, 0.16);
  P.add('gunMountDark', box(0.05, 0.15, 0.05), -0.52, 0.135, 0.18);
  P.add('gunMount', cylZ(0.185, 0.34, 18), -0.53, 0.26, 0.30);
  P.add('gunMountDark', cylZ(0.192, 0.05, 18), -0.53, 0.26, 0.49);
  P.add('gunMountDark', cylZ(0.155, 0.022, 18), -0.53, 0.26, 0.515);
  P.add('gunMount', cylZ(0.125, 0.016, 16), -0.53, 0.26, 0.528);      // inner lens ring (owner-absorb)
  ruBoot(P, { pts: [
    [-0.28, 0.16, 0.38, -0.10],
    [0.04, 0.15, 0.30, -0.06],
    [0.34, 0.135, 0.22, -0.02],
    [0.60, 0.12, 0.15, 0.00],
  ] });
  tubeGun(P, [
    [0.60, 1.62, 0.097],
    [1.62, 2.52, 0.100],
    [2.52, 3.46, 0.1025],
    [3.46, 4.30, 0.088],
    [4.30, 5.30, 0.084],
  ], {
    rings: [[0.94, 0.100], [1.62, 0.103], [2.52, 0.1055], [3.46, 0.091], [4.30, 0.087], [4.95, 0.087]],
    muzzle: 5.30,
  });
  P.add('gunDark', cylZ(0.086, 0.05, 16), 0, 0, 5.275);
  muzzleBore(P, { r: 0.082 });

  // decal on the fat wall band (z -0.30 keeps the plane on the rebased
  // casting's skin — the old -0.60 station falls off the shorter rear)
  P.decal('turret', 'number', P.spec.visual.number || '', 0.22, [1.39, 0.36, -0.30], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.22, [-1.39, 0.36, -0.30], -Math.PI / 2);
  P.topY = 1.36;
}

// ---------------------------------------------------------------------------
// ua_t80u_kursk — UA-service T-80U (print: t80u_kursk_manako.glb, whole-view
// oracle). Print frame (yawOffset +90 registration): overall -2.6%, width
// -1.8% — near-true instrument. Identities: Kontakt-5 wedge shoulders +
// glacis wedge, tall right-forward gunner sight, asymmetric rear roof
// crates, rolled snorkel across the bustle, triangle-era stowage.
// ---------------------------------------------------------------------------
function buildUAT80UKursk(P) {
  const { box, cylX, cylY, cylZ, slab, buildRunningGear } = KIT;

  // T-80U hull: same turbine chassis lines as the T-80 family at the
  // published 7.01/9.65/3.60/2.20 datum, frame +-3.505.
  loftHull(P, {
    deck: [
      [-3.42, 1.43], [-3.00, 1.42], [-2.60, 1.45], [-2.00, 1.47],
      [-1.70, 1.505], [-1.38, 1.505], [-1.10, 1.46], [1.35, 1.45],
      [1.70, 1.46], [1.95, 1.44], [2.15, 1.41], [2.30, 1.40],
      [2.70, 1.24], [3.10, 1.09], [3.505, 1.00],
    ],
    belly: [
      [-3.505, 1.32], [-3.36, 1.10], [-3.18, 0.88], [-3.02, 0.72],
      [-2.65, 0.44], [2.45, 0.44], [3.00, 0.57], [3.505, 0.75],
    ],
    wUp: [[-3.505, 1.28], [3.505, 1.28]],
    wLo: [[-3.505, 1.05], [3.505, 1.02]],
    sponsonY: [[-3.505, 1.42], [-2.42, 1.42], [-2.26, 1.24], [2.46, 1.24], [3.505, 1.24]],
  });

  // Turbine stern hump + lip (family identity).
  for (const s of [-1, 1]) {
    P.add('hull', box(0.875, 0.42, 0.24), s * 1.2175, 1.63, -3.25);
    P.add('hull', box(0.84, 0.30, 0.12), s * 1.215, 1.55, -3.44);
    P.add('hull', box(0.885, 0.15, 0.11), s * 1.2125, 1.70, -3.05);
    P.add('hull', box(0.90, 0.38, 0.19), s * 1.21, 1.20, -3.17);
    P.add('hull', box(0.475, 0.030, 4.50), s * 1.4775, 1.245, 0.22);
    P.add('hull', box(0.060, 0.030, 4.50), s * 1.22, 1.215, 0.22);
    P.add('hull', box(0.045, 0.125, 4.50), s * 1.6925, 1.1875, 0.22);
  }
  P.add('hullDark', box(1.60, 0.02, 1.05), 0, 1.465, -2.00);
  for (let k = 0; k < 5; k++) P.add('hullDetail', box(1.52, 0.02, 0.05), 0, 1.471, -1.67 - k * 0.15);
  P.add('hull', box(0.95, 0.06, 0.58), 0.40, 1.475, -1.55);

  // Kontakt-5 glacis wedge: the broad chevron modules with lid seams
  // (the U-model identity — chunkier than K-1 rafts). §5.341 "more era":
  // a SECOND staggered chevron course rides the glacis toe below the main
  // row (x <= 1.15, clear of the idler lanes), alternating proud offsets
  // for the varied-field read.
  P.add('hull', box(1.90, 0.045, 0.16), 0, 1.30, 2.72);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const x = s * (0.25 + i * 0.31);
    P.add('hullTrack', box(0.285, 0.115, 0.36), x, 1.315, 2.42 + (i & 1) * 0.02, -0.34, s * 0.06, 0);
    P.add('hullDark', box(0.22, 0.028, 0.03), x, 1.36, 2.59 + (i & 1) * 0.02, -0.34, s * 0.06, 0);
  }
  // (course pulled to the glacis TOE inboard of the ±1.055 track-band
  // inner edge — the first seat at x->1.17 / z 2.83 entered the idler-lane
  // strict sweep, 34/16 voxel receipt; §5.272 t80bv precedent.)
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const x = s * (0.33 + i * 0.27);
    P.add('hullTrack', box(0.24, 0.10, 0.28), x, 1.095 + (i & 1) * 0.016, 3.02 + (i & 1) * 0.014, -0.36, s * 0.05, 0);
    P.add('hullDark', box(0.18, 0.024, 0.026), x, 1.133 + (i & 1) * 0.016, 3.155 + (i & 1) * 0.014, -0.36, s * 0.05, 0);
  }
  ruGlacisKit(P, { w: 3.0, y: 1.16, z: 2.76, eyeX: 0.82, eyeZ: 3.20, eyeY: 0.80, hookY: 0.80, hookZ: 3.30, hlY: 1.28 });
  for (const s of [-1, 1]) {
    P.add('hull', box(0.33, 0.10, 0.05), s * 0.46, 1.13, 3.26, 0, -s * 0.27, 0);
    P.add('hull', box(0.57, 0.10, 0.05), s * 0.83, 1.13, 3.40, 0, -s * 0.62, 0);
    P.add('hull', box(0.38, 0.07, 0.18), s * 0.82, 1.11, 3.20);
    P.add('hull', box(0.945, 0.10, 0.21), s * 1.2725, 1.11, 3.40);
    P.add('hullRubber', box(0.34, 0.30, 0.045), s * 1.38, 0.95, 3.43);
    P.add('hullRubber', box(0.34, 0.26, 0.045), s * 1.36, 1.00, -3.22);
  }

  // Stern: grille, eyes, low drum pair + log (UA service fit).
  P.add('hullDark', box(1.80, 0.30, 0.035), 0, 1.35, -3.44);
  for (let i = 0; i < 5; i++) P.add('hullDetail', box(0.30, 0.13, 0.025), -0.72 + i * 0.36, 1.35, -3.46);
  for (const s of [-1, 1]) {
    P.add('hullDark', KIT.torus(0.075, 0.018, 12), s * 0.85, 0.62, -3.46, Math.PI / 2, 0, 0);
  }
  P.add('hull', cylX(0.25, 1.34, 16), 0, 1.52, -3.22);
  P.add('hullDark', cylX(0.258, 0.05, 14), -0.64, 1.52, -3.22);
  P.add('hullDark', cylX(0.258, 0.05, 14), 0.64, 1.52, -3.22);
  {
    // §5.272 fix (4): log seated LOW on the stern (print class) and
    // desaturated — the bright fleet wood read as a floating tan bar at the
    // old grille-line seat. Hanger straps chain it into the stern plate.
    const log = FITTINGS.unditchingLog({ mats: P.mats, len: 2.30, r: 0.10, straps: 3, seed: 8901 });
    log.position.set(0, 0.64, -3.34);
    const woodDim = P.mats.wood.clone();
    woodDim.color = new THREE.Color(0x77705d);
    woodDim.onBeforeCompile = vehicleAmbientFloorHook;
    woodDim.customProgramCacheKey = () => 'veh-ambient-floor-v2';
    log.traverse((o) => { if (o.isMesh && o.material === P.mats.wood) o.material = woodDim; });
    P.disposables.push(woodDim);
    P.hullG.add(log);
    P.add('hullDark', box(0.045, 0.52, 0.05), -0.72, 0.95, -3.35, 0.12, 0, 0);
    P.add('hullDark', box(0.045, 0.52, 0.05), 0.72, 0.95, -3.35, 0.12, 0, 0);
  }

  // T-80U running gear (published chassis constants, frame +-3.505).
  // §5.272 fix (1): wheel rim/hub contrast lifted (tireHex/wheelHex law —
  // the six dished wheels read as a black smear behind the old deep skirt;
  // the resident t80u guard proves the pipeline bar).
  buildRunningGear(P, {
    style: 'dished', wheelR: 0.335, wheelW: 0.21, wheelY: 0.44, xc: 1.345, dishR: 0.80,
    tireHex: 0x2e2f29, wheelHex: 0x4b503d,
    wheelZs: [-1.66, -0.93, -0.20, 0.53, 1.26, 1.99],
    sprocket: { z: -2.62, y: 0.95, r: 0.235 }, idler: { z: 2.80, y: 0.86, r: 0.19 },
    rollers: [-1.30, -0.57, 0.16, 0.89, 1.62].map((z) => ({ z, y: 0.86, r: 0.08 })),
    trackW: 0.58, topY: 0.85, botY: 0.06, paintedEnds: true, coveredTop: true, arms: true,
  });

  // Skirts — §5.341 t90-line FULL PROGRAM (owner: "a bunch of sideskirts
  // and more era"): the §5.272 §B9-proven band + rubber fore-sections
  // stay; SIX armored K-1 panels per side now run the full hull (bottoms
  // 0.84 front pair / 0.87 aft — all above the 0.775 wheel tops, §B9) and
  // a skirt-top ERA cassette strip rides the lip (t90 skirt-ERA grammar).
  // Faces stay inside the ±1.80 width guard (§5.263 — nothing rescales).
  ruSkirtBand(P, { x: 1.755, th: 0.05, z0: -2.74, z1: 2.98, yTop: 1.17, yBot: 1.02, panels: 8, lipX: 1.775, lipY: 1.03 });
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    P.add('hullRubber', box(0.035, 0.25, 0.72), s * 1.772, 0.945, 2.60 - i * 0.76, 0, 0, -s * 0.015);
  }
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
    const z = 1.30 - i * 0.72;
    const deep = i < 2;
    kTile(P, 'hull', s * 1.769, deep ? 1.00 : 1.055, z, 0.028, deep ? 0.46 : 0.37, 0.54, [0, 0, -s * 0.018], false);
    P.add('hullDark', box(0.014, 0.026, 0.44), s * 1.779, 1.13, z, 0, 0, -s * 0.018);
    P.add('hullTrack', box(0.012, 0.095, 0.58), s * 1.7715, 1.20, z, 0, 0, -s * 0.018);
    P.add('hullDark', box(0.010, 0.022, 0.52), s * 1.7755, 1.235, z, 0, 0, -s * 0.018);
  }
  widthAnchor(P, 1.80, 0.82, -2.55);

  // T-80U turret — §5.341 T-80 DOME REBASE (owner order, same law as
  // ua_t80bv): the odd sz-1.12 ellipse is replaced by the RESIDENT
  // t80-line cast profile (t80.js buildT80Line v1 ring list — the 9-ring
  // low broad casting), squashed 0.88 above the ring base, plan bias
  // cz +0.22 per the resident. turretG drops 1.50 -> 1.44 (ring recess);
  // the gun axis keeps its certified 1.70 world height below.
  P.turretG.position.set(0, 1.44, 0.0);
  const rings = [
    [1.44, 0.06], [1.465, 0.40], [1.435, 0.44], [1.30, 0.545],
    [1.19, 0.585], [1.05, 0.615], [0.86, 0.68], [0.60, 0.72], [0.02, 0.735],
  ].map(([r, y]) => [r, 0.06 + (y - 0.06) * 0.88]);
  meshDomeCurved(P, rings, 0.88, 0, 0.22, { capR: 1.60, roofTiltScale: 0.62 });
  P.add('turret', cylY(0.82, 0.86, 0.10, 24), 0, 0.0, 0);
  P.add('turretDark', cylY(0.88, 0.88, 0.035, 24), 0, 0.02, 0);
  P.add('turretDark', box(1.00, 0.40, 1.20), 0, -0.18, 0.24);

  // The frontal package is installed after its welded carrier by
  // addModernizedT80TurretSuite, replacing the former steel wedge leaves,
  // mixed dark bricks and detached V tips with one coherent painted array.

  // Tall right-forward gunner primary sight — the print's strongest roof
  // tell and this build's ONE budgeted p95 spike window (~3 columns at
  // z 0.07..0.37). The NSVT stows FOLDED on the roof (Challenger 2
  // folded-MAG precedent, §K.4 exact-group census) so the sight owns the
  // spike budget alone.
  P.add('turret', box(0.32, 0.08, 0.20), 0.55, 0.72, 0.22);
  P.add('turretDetail', box(0.28, 0.15, 0.18), 0.55, 0.695, 0.22);
  P.add('turretGlass', box(0.19, 0.10, 0.024), 0.55, 0.72, 0.30);
  P.add('turret', cylY(0.25, 0.268, 0.085, 18), 0.52, 0.635, -0.42);
  P.add('turretDark', cylY(0.212, 0.212, 0.028, 18), 0.52, 0.67, -0.42);
  {
    // stowed NSVT: §5.272 fix (3) — the folded gun must READ as a gun
    // (Challenger 2 folded-MAG precedent): real receiver mass + top cover,
    // ammo can on the left, long barrel with root ring + muzzle booster,
    // spade grips, cradle blocks. Everything under the 2.20 p95 datum;
    // census via the exact-group contract.
    const g = new THREE.Group();
    const mk = (mat, geo, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      g.add(m); return m;
    };
    mk(P.mats.dark, box(0.13, 0.10, 0.52), 0, 0.048, -0.02);
    mk(P.mats.detail, box(0.055, 0.018, 0.46), 0, 0.11, -0.02);
    mk(P.mats.dark, box(0.035, 0.05, 0.07), -0.045, 0.015, -0.32);
    mk(P.mats.dark, box(0.035, 0.05, 0.07), 0.045, 0.015, -0.32);
    mk(P.mats.detail, box(0.10, 0.125, 0.20), -0.115, 0.04, -0.10);
    mk(P.mats.dark, cylZ(0.030, 0.46, 12), 0, 0.04, 0.45);
    mk(P.mats.dark, cylZ(0.041, 0.05, 10), 0, 0.04, 0.245);
    mk(P.mats.dark, cylZ(0.044, 0.10, 12), 0, 0.04, 0.72);
    mk(P.mats.dark, box(0.06, 0.055, 0.06), 0, -0.028, -0.16);
    mk(P.mats.dark, box(0.06, 0.055, 0.06), 0, -0.028, 0.12);
    FITTINGS.markExact(g, 'pintleMG');
    g.position.set(0.30, 0.53, -0.86);
    g.rotation.y = 0.18;
    P.turretG.add(g);
  }
  P.add('turret', cylY(0.225, 0.24, 0.06, 16), -0.50, 0.655, -0.34);
  P.add('turretDark', cylY(0.195, 0.195, 0.024, 16), -0.50, 0.69, -0.34);
  for (const [gx, gz, gry, gy] of [[0.36, -0.14, 0.30, 0.664], [0.55, -0.16, 0, 0.657], [0.70, -0.22, -0.30, 0.628]]) {
    P.add('turret', box(0.10, 0.05, 0.08), gx, gy, gz, -0.10, gry, 0);
    P.add('turretGlass', box(0.07, 0.038, 0.02), gx, gy + 0.022, gz + 0.04, -0.10, gry, 0);
  }
  for (const [x, z, ry, gy] of [[-0.26, 0.42, 0.08, 0.668], [0.10, 0.50, -0.02, 0.668], [-0.22, -0.50, 0.05, 0.630]]) {
    P.add('turret', box(0.13, 0.045, 0.11), x, gy, z, 0, ry, 0);
    P.add('turretGlass', box(0.09, 0.036, 0.02), x, gy + 0.022, z + 0.05, 0, ry, 0);
  }

  // Asymmetric rear roof crates + rolled snorkel across the bustle
  // (kursk print tells), 902B banks both cheeks, whips — rear kit pulled
  // to the rebased casting's shorter rear wall.
  for (const s of [-1, 1]) {
    P.add('turret', box(0.42, 0.34, 0.46), s * 1.02, 0.36, -0.78 + (s > 0 ? 0.12 : -0.08), 0, s * 0.08, 0);
    P.add('turretDark', box(0.36, 0.04, 0.38), s * 1.02, 0.545, -0.78 + (s > 0 ? 0.12 : -0.08), 0, s * 0.08, 0);
  }
  // The snorkel is carried transversely across the bustle. The former cylZ
  // call laid it fore-aft and made the tube spear out of the turret rear.
  P.addEquipment('turret', cylX(0.13, 1.55, 14), 0, 0.50, -1.30);
  P.add('turretDark', cylX(0.138, 0.045, 12), -0.68, 0.50, -1.30);
  P.add('turretDark', cylX(0.138, 0.045, 12), 0.68, 0.50, -1.30);
  P.turretG.userData.uaRearTubeAxis = 'x';
  P.add('turretDetail', cylX(0.020, 1.42, 12), 0, 0.38, -1.06);
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.05, 0.14, 0.07), s * 0.56, 0.31, -0.99);
  }
  uaSmoke(P, { x: 1.28, y: 0.44, z: 0.62, count: 5, seed: 8910, yaw: 0.32 });
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.06, 0.06, 0.06), s * 0.88, 0.28, -0.83);
    seat(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats,
      h: 0.18, r: 0.011, rake: -s * 0.9, seed: 8912 + (s > 0 ? 1 : 0) }),
      s * 0.88, 0.31, -0.83);
  }

  addModernizedT80TurretSuite(P, 'kursk');

  // 2A46M-1 at the 1.70 axis, muzzle +6.145 world, true bore (gun local
  // +0.06 compensates the 1.50 -> 1.44 ring drop — world axis certified).
  P.gunG.position.set(0, 0.26, 1.05);
  ruSaddle(P, { rollR: 0.165, rollW: 0.30, tubeR: 0.086, rootR: 0.185, rootL: 0.50 });
  ruBoot(P, { pts: [
    [-0.28, 0.16, 0.38, -0.10],
    [0.04, 0.15, 0.30, -0.06],
    [0.34, 0.135, 0.22, -0.02],
    [0.60, 0.12, 0.15, 0.00],
  ] });
  tubeGun(P, [
    [0.60, 1.60, 0.097],
    [1.60, 2.48, 0.100],
    [2.48, 3.42, 0.1025],
    [3.42, 4.24, 0.088],
    [4.24, 5.095, 0.084],
  ], {
    rings: [[0.92, 0.100], [1.60, 0.103], [2.48, 0.1055], [3.42, 0.091], [4.24, 0.087], [4.85, 0.087]],
    muzzle: 5.095,
  });
  P.add('gunDark', cylZ(0.086, 0.05, 16), 0, 0, 5.07);
  muzzleBore(P, { r: 0.082 });

  // decal on the fat wall band (z -0.30 keeps the plane on the rebased
  // casting's skin — the old -0.66 station falls off the shorter rear)
  P.decal('turret', 'number', P.spec.visual.number || '', 0.20, [1.37, 0.36, -0.30], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.20, [-1.37, 0.36, -0.30], -Math.PI / 2);
  P.topY = 1.40;
}

// ---------------------------------------------------------------------------
// ua_t84_oplot_m — BM Oplot / Oplot-M (print: oplot_m_manako.glb).
// Print frame map: zBuild = (zPrint + 4.393) * 1.1166 - 3.54 (print hull
// -10.4% short; the z-warp plan is banked, the build is published-true).
// Measured identities: KMDB WELDED turret (prism loft, not a cast dome)
// with Duplet ERA wedge cheeks + edge cassette stacks to +-1.53; full-height
// Duplet skirt cassettes on the forward hull; the tall PNK-6 panoramic
// tower (capped at the published 2.80 MG-band datum per the P95 law);
// rear anti-thermal cover roll on the bustle; Varta dazzler pair flanking
// the gun; 6x rubber-rim gear with the Ukrainian skirt line.
// ---------------------------------------------------------------------------
function buildUAOplotM(P) {
  const { box, cylX, cylY, cylZ, buildRunningGear } = KIT;
  const slab = orientedSlab;
  const eraReceipt = {
    carrierDerivedTransforms: true,
    contactEmbedM: 0.012,
    maxSupportGapM: 0,
    faceNormalAlignmentDeg: 0,
    hullGlacisCassettes: 0,
    turretWingCassettes: 0,
    turretShoulderCassettes: 0,
    replacedTurretCassettes: 30,
    additionalTurretCassettes: 0,
  };

  // Hull loft (T-80UD lineage): deck plateau 1.42, rear deck fall to the
  // 1.27 tail, glacis break +1.85 falling 1.36 -> 0.84 at the bow tip,
  // 0.45 belly with the stern undercut rising to the 1.15 overhang lip
  // (print rear belly 1.20@-3.54) and the bow rise to 0.80.
  loftHull(P, {
    deck: [
      [-3.54, 1.27], [-3.35, 1.30], [-3.05, 1.345], [-2.90, 1.42],
      [-1.60, 1.42], [-1.30, 1.435], [0.50, 1.42], [1.30, 1.40],
      [1.85, 1.36], [2.30, 1.245], [2.80, 1.10], [3.20, 0.95], [3.54, 0.84],
    ],
    belly: [
      [-3.54, 1.15], [-3.44, 0.92], [-3.30, 0.68], [-3.10, 0.50],
      [-2.75, 0.45], [2.30, 0.45], [2.85, 0.56], [3.54, 0.80],
    ],
    wUp: [[-3.54, 1.30], [3.54, 1.28]],
    // wLo inside the 0.95 track-band inner edge (wrap-zone clip law,
    // shoe-margin 0.9387 - 2 cm)
    wLo: [[-3.54, 0.88], [-3.20, 0.90], [3.10, 0.90], [3.54, 0.86]],
    sponsonY: [[-3.54, 1.40], [-2.45, 1.40], [-2.30, 1.22], [2.30, 1.22], [2.70, 1.09], [3.54, 1.11]],
  });

  // Rear deck: powerpack louvres + the exhaust duct LEFT (UD diesel, not
  // the T-80 turbine hump — the print's flat rear run).
  P.add('hullDark', box(1.64, 0.02, 1.10), 0, 1.432, -2.30);
  for (let k = 0; k < 6; k++) P.add('hullDetail', box(1.56, 0.02, 0.05), 0, 1.438, -2.72 + k * 0.155);
  P.add('hullDark', box(0.26, 0.16, 0.86), -1.32, 1.34, -2.35);
  P.add('hullDetail', box(0.22, 0.12, 0.72), -1.32, 1.43, -2.35);
  P.add('hull', box(0.95, 0.05, 0.55), 0.42, 1.445, -2.05);

  // Glacis: two Nozh courses seated from the actual piecewise-linear hull
  // profile. The former fixed -0.30 pitch leaned the modules against the
  // armor slope; deriving +X pitch from dy/dz makes their backs parallel to
  // the glacis and buries the complete inner face by 12 mm.
  {
    const profile = [[1.85, 1.36], [2.30, 1.245], [2.80, 1.10], [3.20, 0.95], [3.54, 0.84]];
    const carrierAt = (z) => {
      for (let i = 0; i < profile.length - 1; i++) {
        const [z0, y0] = profile[i];
        const [z1, y1] = profile[i + 1];
        if (z >= z0 && z <= z1) {
          const slope = (y1 - y0) / (z1 - z0);
          return { y: y0 + (z - z0) * slope, slope };
        }
      }
      throw new Error(`Oplot-M glacis ERA station ${z} is outside the carrier profile`);
    };
    for (const z of [2.18, 2.56]) {
      const carrier = carrierAt(z);
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
        faceSeatedCassette(P, 'hull',
          [s * (0.23 + i * 0.30), carrier.y, z],
          [0, 1, -carrier.slope], [0, carrier.slope, 1],
          0.25, 0.10, 0.29, { embed: eraReceipt.contactEmbedM });
        eraReceipt.hullGlacisCassettes += 1;
      }
    }
  }
  P.add('hull', box(1.92, 0.05, 0.16), 0, 1.335, 2.10);
  ruGlacisKit(P, { w: 3.05, y: 1.12, z: 2.70, eyeX: 0.74, eyeZ: 3.24, eyeY: 0.85, hookY: 0.95, hookZ: 3.30, hlY: 1.22 });
  // center nose plate between the tracks (the full-width glacis foot ends
  // at the fender line; the tip below runs x <= 0.86 clear of the wraps)
  P.add('hull', slab(
    [-0.86, 0.45, 3.02], [0.86, 0.45, 3.02], [0.82, 0.45, 3.50], [-0.82, 0.45, 3.50],
    [-0.86, 1.09, 3.02], [0.86, 1.09, 3.02], [0.82, 0.82, 3.50], [-0.82, 0.82, 3.50]));
  for (const s of [-1, 1]) {
    P.add('hull', box(0.34, 0.10, 0.05), s * 0.47, 1.12, 3.30, 0, -s * 0.26, 0);
    P.add('hull', box(0.58, 0.10, 0.05), s * 0.85, 1.12, 3.42, 0, -s * 0.60, 0);
    // §5.272 MUST-FIX (1): the 0.945-wide transverse tip bar (x to 1.745,
    // air under both ends) is DELETED — the bow now carries a real fender
    // run stepping down the glacis edge to a fender-line tip plate with the
    // flap chained under it; the idler adjuster is authored INBOARD as a
    // crank boss pair on the nose plate. Nothing passes the fender line.
    P.add('hull', box(0.38, 0.030, 0.68), s * 1.27, 1.17, 2.96, -0.06, 0, 0);
    P.add('hull', box(0.38, 0.07, 0.22), s * 1.27, 1.04, 3.40, -0.45, 0, 0);
    P.add('hullRubber', box(0.30, 0.26, 0.045), s * 1.27, 0.80, 3.50);
    P.add('hullDetail', cylZ(0.052, 0.07, 10), s * 0.70, 0.62, 3.485);
    P.add('hullDark', cylZ(0.028, 0.05, 8), s * 0.70, 0.62, 3.52);
    P.add('hullRubber', box(0.34, 0.26, 0.045), s * 1.36, 0.92, -3.47);
  }

  // Driver station.
  P.add('hull', cylY(0.23, 0.23, 0.04, 14), 0, 1.44, 1.55);
  KIT.periscope(P, 'hullDetail', -0.14, 1.45, 1.80);
  KIT.periscope(P, 'hullDetail', 0.14, 1.45, 1.80);

  // Fender runs with bins + tow cable. The bins occupy only the inboard
  // half of the fender. A segmented welded shelf now spans the remaining
  // channel to the Duplet side-skirt root, so the skirt is visibly carried
  // by the hull rather than floating outside the track run.
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) {
    const z = 1.90 - i * 0.72;
    P.add('hull', box(0.38, 0.11, 0.60), s * 1.27, 1.30, z);
    P.add('hullDark', box(0.32, 0.026, 0.50), s * 1.27, 1.362, z);
  }
  {
    const fenderStep = 5.60 / 9;
    for (const s of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        const z = -3.30 + (i + 0.5) * fenderStep;
        P.addMudguard(`ua-oplot-fender-bridge-${s}-${i}`, 'hull',
          box(0.64, 0.06, fenderStep * 0.985),
          s * 1.565, 1.31, z, 0, 0, -s * 0.003);
        // Rolled outer seam and inboard support angle make the shelf read as
        // a supported fender assembly rather than one featureless slab.
        P.add('hullDark', box(0.035, 0.035, fenderStep * 0.90),
          s * 1.868, 1.337, z, 0, 0, -s * 0.003);
        P.add('hullDark', box(0.045, 0.09, fenderStep * 0.08),
          s * 1.43, 1.275, z, 0, 0, -s * 0.003);
      }
      // End plates continue the shelf into the existing raked bow tip and
      // stern transom instead of ending in mid-air at the first skirt seam.
      P.addMudguard(`ua-oplot-fender-bridge-${s}-bow`, 'hull',
        box(0.64, 0.06, 0.74), s * 1.565, 1.31, 2.655,
        0, 0, -s * 0.003);
      P.addMudguard(`ua-oplot-fender-bridge-${s}-nose`, 'hull',
        box(0.64, 0.06, 0.52), s * 1.245, 1.20, 3.27,
        -0.18, 0, -s * 0.003);
      P.addMudguard(`ua-oplot-fender-bridge-${s}-stern`, 'hull',
        box(0.64, 0.06, 0.20), s * 1.565, 1.295, -3.38,
        0, 0, -s * 0.003);
    }
    P.hullG.userData.uaOplotFenderBridge = Object.freeze({
      innerX: 1.245,
      outerX: 1.885,
      undersideY: 1.28,
      topY: 1.34,
      skirtRootX: 1.70,
      skirtTopY: 1.30,
      trackTopY: 0.88,
      registeredParts: 24,
    });
  }
  KIT.towCable(P, [[-1.10, 1.43, 0.20], [-0.40, 1.455, -0.30], [0.42, 1.455, -0.32], [1.10, 1.43, 0.16]]);
  {
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 4, width: 0.50, seed: 8401 });
    links.position.set(0.60, 1.432, -1.60);
    P.hullG.add(links);
  }

  // Stern: layered transom with louvre field, recovery eyes, log.
  P.add('hull', box(2.55, 0.58, 0.14), 0, 0.84, -3.46, 0.05, 0, 0);
  P.add('hullDark', box(1.76, 0.26, 0.035), 0, 0.95, -3.52);
  for (let i = 0; i < 6; i++) P.add('hullDetail', box(0.24, 0.11, 0.025), -0.75 + i * 0.30, 0.95, -3.54);
  for (const s of [-1, 1]) {
    P.add('hullDark', KIT.torus(0.075, 0.018, 12), s * 0.84, 0.56, -3.50, Math.PI / 2, 0, 0);
    P.add('hullDark', box(0.07, 0.24, 0.08), s * 0.84, 0.72, -3.47);
  }
  {
    const rack = FITTINGS.stowageRack({ mats: P.mats, w: 1.9, d: 0.30, h: 0.20, fill: 0.7, seed: 8402 });
    rack.position.set(0, 1.14, -3.36);
    P.hullG.add(rack);
  }

  // T-84 running gear: six 0.335 rubber-rim wheels, rear drive, raised
  // front idler, four rollers (print KOLLO span mapped to +-2.93).
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.335, wheelW: 0.23, wheelY: 0.40, xc: 1.24, dishR: 0.84,
    wheelZs: [2.32, 1.39, 0.46, -0.47, -1.40, -2.33],
    sprocket: { z: -2.95, y: 0.75, r: 0.28 }, idler: { z: 2.93, y: 0.72, r: 0.22 },
    rollers: [-1.85, -0.45, 0.95, 1.90].map((z) => ({ z, y: 0.88, r: 0.08 })),
    trackW: 0.58, topY: 0.88, botY: 0.06, paintedEnds: true, coveredTop: true, arms: false,
    contactZF: 2.35, contactZR: -2.36,
  });

  // Skirts: the Ukrainian line — the print's SKIRT shell is a THICK armor
  // slab spanning x 1.70..1.8875 (0.19 m deep: its plan columns at
  // +-1.71..1.85 read the full hull length), full-run at the published
  // face; heavy Duplet cassette lids dress the forward half.
  for (const s of [-1, 1]) for (let i = 0; i < 9; i++) {
    const z0 = -3.30 + i * (5.60 / 9);
    const z = z0 + (5.60 / 18);
    P.add('hull', box(0.185, 0.72, (5.60 / 9) * 0.94), s * 1.7925, 0.94, z, 0, 0, -s * 0.006);
    P.add('hullDark', box(0.048, 0.64, 0.02), s * 1.795, 0.94, z0 + 5.60 / 9 - 0.02, 0, 0, -s * 0.006);
  }
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const z = 2.06 - i * 0.60;
    P.add('hullDark', box(0.02, 0.44, 0.44), s * 1.879, 0.98, z, 0, 0, -s * 0.006);
    P.add('hullDark', box(0.018, 0.03, 0.44), s * 1.8835, 1.24, z, 0, 0, -s * 0.006);
  }
  for (const s of [-1, 1]) {
    P.add('hullRubber', box(0.035, 0.26, 2.20), s * 1.80, 0.50, -2.10, 0, 0, -s * 0.010);
  }
  // §5.272 MUST-FIX (2): the print's THICK skirt runs the FULL hull length
  // — forward panel + raked tip now shroud the raised idler wrap whose
  // exposed shoe teeth read as forward-facing TOOTHED WHEEL DISCS at the
  // bow (the "mine-roller" read); the idler spinner itself is the smooth
  // dished idlerGeo, correctly toothless on the rear-drive T-84.
  for (const s of [-1, 1]) {
    P.add('hull', box(0.185, 0.68, 0.74), s * 1.7925, 0.96, 2.655, 0, 0, -s * 0.006);
    P.add('hullDark', box(0.048, 0.60, 0.02), s * 1.795, 0.96, 3.015, 0, 0, -s * 0.006);
    // raked tip wedge: inner face at 1.60 closes the head-on slit between
    // track band (1.553) and skirt plane (strict-audit receipt: the sweep
    // hit was the fender plank, never this face — hit box |x| <= 1.44)
    P.add('hull', slab(
      [s * 1.60, 0.64, 3.02], [s * 1.885, 0.64, 3.02], [s * 1.885, 1.02, 3.34], [s * 1.60, 1.02, 3.34],
      [s * 1.60, 1.30, 3.02], [s * 1.885, 1.30, 3.02], [s * 1.885, 1.28, 3.36], [s * 1.60, 1.28, 3.36]));
  }
  widthAnchor(P, 1.8875, 0.80, -2.60);

  // ---- KMDB WELDED TURRET — measured from the WARPED (published-scale)
  // print's TUR subtree (tools/tmp-ua-turprofile.mjs): a long arrowhead —
  // Duplet wedge wings sweeping to world +1.26 at halfW 1.43..1.54, nose
  // converging to +2.26 flanking the mantlet, shell shoulders 1.55 at
  // world -0.54..0.06, bustle rack to -2.50, flat weld roof at the
  // published 2.285, PNK-6 tower at world -1.34 (the ref's own spike
  // column), and the real interior basket the print carries (its turret
  // mask bottoms at 0.61 inside the hull).
  P.turretG.position.set(0, 1.42, -0.30);
  // SHELL PRISM: the flat-roof welded body only (world -1.88..+0.25).
  // §5.272 fix (5): the roof plate drops to 0.795 local (world 2.215) so
  // the hatch rings / periscopes / stowed kit STAND PROUD and read — the
  // old 0.865 plate swallowed every roof fitting authored under the p95
  // datum (bare-roof read). Furniture tops stay <=2.285; the proud wing
  // shoulders (0.845) keep the print's raised-wing line.
  P.add('turret', KIT.polyTurret([
    [-0.60, -1.58], [-1.04, -1.54], [-1.34, -0.86], [-1.52, 0.10],
    [-1.44, 0.55], [-0.30, 0.55], [0.30, 0.55], [1.44, 0.55],
    [1.52, 0.10], [1.34, -0.86], [1.04, -1.54], [0.60, -1.58],
  ], 0.775, 1, 0.90), 0, 0.02, 0);
  for (const s of [-1, 1]) {
    const wingTop = [
      [s * 0.24, 0.40, 2.10], [s * 1.18, 0.56, 1.24],
      [s * 1.38, 0.845, 0.30], [s * 0.30, 0.845, 0.52],
    ];
    // WEDGE WING: tall at the shell junction (roof line), sloping to the
    // low nose tip at world +2.12..2.26 (print wing profile).
    P.add('turret', slab(
      [s * 0.30, 0.02, 2.36], [s * 1.50, 0.02, 1.30], [s * 1.55, 0.02, 0.30], [s * 0.32, 0.02, 0.52],
      ...wingTop));
    // Dense 3x5 Duplet field. Each module inherits the bilinear wing's
    // compound pitch and sweep, so both complete banks stay flush while the
    // turret gains eight cassettes over the former hand-tuned coverage.
    for (const u of [0.22, 0.50, 0.78]) for (const v of [0.10, 0.245, 0.39, 0.535, 0.68]) {
      const face = sampleFace(...wingTop, u, v, [0, 1, 0]);
      faceSeatedCassette(P, 'turret', face.point.toArray(), face.normal.toArray(),
        face.dv.toArray(), 0.235, 0.09, 0.205, { embed: eraReceipt.contactEmbedM });
      eraReceipt.turretWingCassettes += 1;
    }
    // shell-flank Duplet brick AFT of the edge stack — the rear turret
    // side reads a stacked module too (the edge cassette stack owns the
    // forward flank corner; the bustle stowage owns z < -1.27)
    seatedCassette(P, 'turret', s * 1.21, 0.34, -1.12, 0.13, 0.36, 0.34,
      [0, s * 0.30, 0], {
        axis: 'x', contactSide: -s, embed: 0.045, painted: true,
      });
    P.add('turretDark', box(0.02, 0.30, 0.035), s * 1.258, 0.34, -1.28, 0, s * 0.30, 0);
    // Shoulder wrap follows the actual welded side quad rather than four
    // plumb boxes. Local width runs vertically and the course runs aft.
    const shoulderFace = [
      [s * 1.52, 0.02, 0.10], [s * 1.34, 0.02, -0.86],
      [s * 1.206, 0.795, -0.774], [s * 1.368, 0.795, 0.09],
    ];
    for (const u of [0.11, 0.37, 0.63, 0.89]) {
      const face = sampleFace(...shoulderFace, u, 0.42, [s, 0, 0]);
      faceSeatedCassette(P, 'turret', face.point.toArray(), face.normal.toArray(),
        face.du.toArray(), 0.245, 0.11, 0.28, { embed: eraReceipt.contactEmbedM });
      eraReceipt.turretShoulderCassettes += 1;
    }
  }
  eraReceipt.additionalTurretCassettes = eraReceipt.turretWingCassettes
    + eraReceipt.turretShoulderCassettes - eraReceipt.replacedTurretCassettes;
  P.turretG.userData.uaOplotMERAReceipt = Object.freeze({ ...eraReceipt });
  P.hullG.userData.uaOplotMERAReceipt = P.turretG.userData.uaOplotMERAReceipt;
  // gun cradle channel: solid center wedge from the shell front to the
  // mantlet (the wings flank it; no see-through channel, §B2).
  P.add('turret', slab(
    [-0.32, 0.02, 2.30], [0.32, 0.02, 2.30], [0.34, 0.02, 0.55], [-0.34, 0.02, 0.55],
    [-0.26, 0.44, 2.24], [0.26, 0.44, 2.24], [0.32, 0.845, 0.55], [-0.32, 0.845, 0.55]));
  // interior basket (the print's turret mask carries it to 0.61 world):
  // ring drum + floor, real turret-owned volume inside the hull.
  P.add('turret', cylY(0.80, 0.84, 0.10, 24), 0, 0.0, -0.10);
  P.add('turretDark', cylY(0.76, 0.76, 0.72, 18), 0, -0.72, -0.10);
  P.add('turretDark', cylY(0.78, 0.78, 0.04, 18), 0, -0.78, -0.10);
  // bustle: ammo run + rack to world -2.50, anti-thermal roll on top
  P.add('turret', box(2.00, 0.50, 0.56), 0, 0.27, -1.32);
  P.add('turret', box(1.72, 0.42, 0.50), 0, 0.24, -1.78);
  P.add('turretDark', box(1.56, 0.05, 0.40), 0, 0.48, -1.76);
  P.add('turretDark', box(1.30, 0.34, 0.22), 0, 0.22, -2.09);
  P.add('turretDetail', box(1.22, 0.05, 0.18), 0, 0.42, -2.09);
  // anti-thermal roll ON the bustle rack behind the shell (its old -1.46
  // seat was inside the prism — zero rendered pixels)
  P.add('turretDetail', cylX(0.112, 1.70, 14), 0, 0.565, -1.66);
  P.add('turretDark', cylX(0.12, 0.05, 12), -0.58, 0.565, -1.66);
  P.add('turretDark', cylX(0.12, 0.05, 12), 0.58, 0.565, -1.66);
  P.add('turretDark', box(0.06, 0.14, 0.06), -0.88, 0.50, -1.66);
  P.add('turretDark', box(0.06, 0.14, 0.06), 0.88, 0.50, -1.66);
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.38, 0.26, 0.46), s * 1.16, 0.20, -1.50, 0, -s * 0.06, 0);
    P.add('turretDetail', box(0.32, 0.05, 0.40), s * 1.16, 0.36, -1.50, 0, -s * 0.06, 0);
  }

  // Roof furniture: hatch rings proud of the 0.795 roof plate, vision
  // blocks under the datum, the PNK-6 tower at the ref's own world -1.34
  // spike column (local -1.04).
  P.add('turret', cylY(0.25, 0.27, 0.06, 18), 0.56, 0.815, -0.34);
  P.add('turretDark', cylY(0.215, 0.215, 0.02, 18), 0.56, 0.848, -0.34);
  for (const [gx, gz, gry] of [[0.42, -0.08, 0.30], [0.60, -0.04, 0], [0.74, -0.14, -0.30]]) {
    P.add('turret', box(0.10, 0.05, 0.08), gx, 0.815, gz, -0.08, gry, 0);
    P.add('turretGlass', box(0.07, 0.038, 0.02), gx, 0.838, gz + 0.04, -0.08, gry, 0);
  }
  P.add('turret', cylY(0.225, 0.24, 0.055, 16), -0.54, 0.81, -0.38);
  P.add('turretDark', cylY(0.195, 0.195, 0.02, 16), -0.54, 0.842, -0.38);
  {
    // NSVT stowed on the low bustle deck (UA wartime fit) — exact-group
    // census; the PNK-6 keeps the single p95 spike window.
    const g = new THREE.Group();
    const mk = (mat, geo, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      g.add(m); return m;
    };
    // §5.272 fix (5): the stowed NSVT must READ as a gun — receiver mass +
    // top cover, ammo can, long barrel with root ring + muzzle booster,
    // spade grips, cradle blocks (Challenger 2 folded-MAG precedent).
    mk(P.mats.dark, box(0.13, 0.10, 0.52), 0, 0.048, -0.02);
    mk(P.mats.detail, box(0.055, 0.018, 0.46), 0, 0.11, -0.02);
    mk(P.mats.dark, box(0.035, 0.05, 0.07), -0.045, 0.015, -0.32);
    mk(P.mats.dark, box(0.035, 0.05, 0.07), 0.045, 0.015, -0.32);
    mk(P.mats.detail, box(0.10, 0.125, 0.20), -0.115, 0.04, -0.10);
    mk(P.mats.dark, cylZ(0.030, 0.46, 12), 0, 0.04, 0.45);
    mk(P.mats.dark, cylZ(0.041, 0.05, 10), 0, 0.04, 0.245);
    mk(P.mats.dark, cylZ(0.044, 0.10, 12), 0, 0.04, 0.72);
    mk(P.mats.dark, box(0.06, 0.055, 0.06), 0, -0.028, -0.16);
    mk(P.mats.dark, box(0.06, 0.055, 0.06), 0, -0.028, 0.12);
    FITTINGS.markExact(g, 'pintleMG');
    // across the bustle rack, clear of the shell so the whole gun shape
    // reads at top/side/rear (the old -1.24 seat was inside the prism)
    g.position.set(0.30, 0.505, -1.85);
    g.rotation.y = 1.35;
    P.turretG.add(g);
  }
  // §5.319 left finish: the gunner-sight ZONE at the print's own station
  // (left relief F: housing x -0.78..-0.41 over world z 0.28..0.65) — the
  // small §5.272 box grows to the print's armored housing standing on the
  // wing/cradle top: base skirt, body, brow hood, twin pane, cheek plates.
  // Top capped 0.855 local (2.275 world) under the 2.285 datum (P95 law;
  // the print's own 2.42 housing top is the banked capped class).
  P.add('turretDark', box(0.38, 0.05, 0.32), -0.60, 0.720, 0.70);
  P.add('turret', box(0.36, 0.13, 0.30), -0.60, 0.790, 0.70);
  P.add('turret', box(0.40, 0.024, 0.10), -0.60, 0.843, 0.86);
  P.add('turretGlass', box(0.24, 0.078, 0.024), -0.60, 0.800, 0.862);
  P.add('turretDark', box(0.024, 0.11, 0.28), -0.415, 0.785, 0.70);
  P.add('turretDark', box(0.024, 0.11, 0.28), -0.785, 0.785, 0.70);
  for (const s of [-1, 1]) {
    // Varta dazzlers re-seated on the wing leading faces (the old 1.72
    // seats sit under the new inner brick course)
    P.add('turretDark', box(0.16, 0.18, 0.14), s * 0.44, 0.21, 2.12, -0.20, s * 0.26, 0);
    P.add('turretGlass', box(0.10, 0.10, 0.022), s * 0.455, 0.225, 2.20, -0.20, s * 0.26, 0);
  }
  // PNK-6 panoramic tower at local -1.04 (world -1.34): §5.272 fix (3) —
  // the print's ~0.5 m tower MASS (the old 0.15 straw): plinth + broad
  // shaft + head housing with the WINDOW FACE forward + lens hood + cap
  // plate. Cap held at the published 2.80 band; z-span <=0.34 keeps the
  // single p95 spike window <=2.5 columns.
  P.add('turret', box(0.36, 0.05, 0.24), -0.14, 0.845, -1.04);
  P.add('turretDetail', box(0.28, 0.28, 0.20), -0.14, 1.03, -1.04);
  P.add('turretDark', box(0.30, 0.035, 0.22), -0.14, 1.19, -1.04);
  P.add('turretDetail', box(0.40, 0.21, 0.24), -0.14, 1.245, -1.04);
  P.add('turretGlass', box(0.26, 0.11, 0.024), -0.14, 1.26, -0.896);
  P.add('turretDark', box(0.30, 0.030, 0.055), -0.14, 1.325, -0.918);
  P.add('turretDetail', box(0.34, 0.022, 0.22), -0.14, 1.36, -1.04);
  P.add('turretDark', box(0.10, 0.05, 0.09), -0.14, 1.10, -0.92);
  P.add('turretDark', box(0.05, 0.05, 0.05), 0.30, 0.875, -1.05);
  for (const [x, z, ry] of [[-0.28, 0.30, 0.06], [0.28, 0.26, -0.06], [0.02, 0.48, 0]]) {
    P.add('turret', box(0.13, 0.045, 0.11), x, 0.808, z, 0, ry, 0);
    P.add('turretGlass', box(0.09, 0.036, 0.02), x, 0.83, z + 0.05, 0, ry, 0);
  }
  // §5.272 fix (5): roof furniture density on the 0.795 plate — lifting
  // eyes, GPS puck, junction box, spent-case port, tie-down cleats (tops
  // <=0.85 local, well under the 2.285 datum).
  P.add('turretDetail', KIT.torus(0.05, 0.013, 10), -0.95, 0.80, 0.06, Math.PI / 2, 0, 0);
  P.add('turretDetail', KIT.torus(0.05, 0.013, 10), 0.95, 0.80, -0.86, Math.PI / 2, 0, 0);
  P.add('turretDetail', cylY(0.065, 0.07, 0.04, 12), 0.30, 0.815, -0.64);
  P.add('turretDark', box(0.15, 0.045, 0.11), -0.26, 0.818, 0.08);
  P.add('turretDark', cylY(0.088, 0.088, 0.028, 14), -0.06, 0.809, -0.70);
  P.add('turretDetail', cylY(0.094, 0.094, 0.012, 14), -0.06, 0.826, -0.70);
  P.add('turretDark', box(0.07, 0.04, 0.05), 0.84, 0.815, -0.20);
  P.add('turretDark', box(0.07, 0.04, 0.05), -0.84, 0.815, -0.15);
  P.add('turretDark', box(0.07, 0.04, 0.05), 0.30, 0.815, -1.34);

  // Aerosol banks: the RIGHT keeps its ratified §5.248 uaSmoke seat verbatim
  // (inline s=+1 expansion, seed 8411 unchanged); the LEFT bank re-seats to
  // the print's own shoulder station in the §5.319 block below (relief
  // receipt: left cluster world z -0.80..-0.38 topping 2.36, capped 2.28).
  seat(P, 'turret', FITTINGS.smokeBank({ mats: P.mats, count: 6,
    r: 0.042, len: 0.28, splay: 1.05, pitch: -0.42,
    arc: 0.55, spacing: 0.096, slot: 'detail',
    rotation: [0, 0.40, -0.10],
    seed: 8411 }),
    1.24, 0.40, -0.40);

  // ---- §5.319 LEFT-SIDE TURRET FINISH (owner order: "finish the left side
  // of oplots turret"). The print's LEFT carries a full Duplet grammar the
  // §5.288 round only delivered on the wing TOP faces: the left relief
  // probe (tools/tmp-oplotleft-shots/relief round tools) stations a
  // full-height cheek cassette wall at the max-width plane (print -1.4725
  // -> build -1.54) over world z +0.34..+1.32, a shoulder smoke bank at
  // world z -0.86..-0.43, a mid-wall junction/cable band and a solid
  // bustle flank at x -1.32. ASYMMETRY LAW: authored s=-1 only — the
  // ratified right side keeps its §5.288/§5.291 bytes byte-identical.
  {
    // (a) cheek cassette wall: three camo Duplet cassettes, plumb faces at
    // x -1.54 under the wing's raked flank, world y 1.445..2.025, closed by
    // a top deck buried into the wing face (no see-through slot, §B2) with
    // tier/bay seams + ground shadow strip; a fourth cassette rides the
    // leading-edge line (1.50,1.30)->(0.30,2.36) yawed +0.848 so the
    // silhouette stays on the certified wing plan.
    for (let i = 0; i < 3; i++) {
      P.add('turret', box(0.13, 0.58, 0.215), -1.475, 0.315, 0.98 + (i - 1) * 0.2325);
    }
    P.add('turret', box(0.32, 0.032, 0.72), -1.38, 0.588, 0.98);
    P.add('turretDark', box(0.012, 0.030, 0.70), -1.543, 0.315, 0.98);
    P.add('turretDark', box(0.012, 0.56, 0.030), -1.543, 0.315, 0.865);
    P.add('turretDark', box(0.012, 0.56, 0.030), -1.543, 0.315, 1.0975);
    P.add('turretDark', box(0.012, 0.045, 0.70), -1.542, 0.043, 0.98);
    P.add('turret', box(0.125, 0.52, 0.34), -1.34, 0.28, 1.4415, 0, 0.848, 0);
    P.add('turretDark', box(0.014, 0.44, 0.28), -1.384, 0.28, 1.491, 0, 0.848, 0);
    // (b) junction cassette panel bridging wing -> wall (world z 0.07..0.35,
    // clear of the ratified edge-stack tiles aft of it)
    P.add('turret', box(0.10, 0.50, 0.28), -1.48, 0.30, 0.51);
    P.add('turretDark', box(0.012, 0.46, 0.026), -1.532, 0.30, 0.51);
    // (c) The common bilinear Duplet field above now owns these outer
    // terrace stations; keeping the old three boxes would double-stack ERA.
    // (d) shoulder smoke bank at the print's left station (print top 2.36
    // CAPPED: muzzle tops ~2.27, the PNK-6 keeps the only >2.285 window) —
    // two staggered rows of three, breeches recessed into the shoulder
    // slope, muzzles fanning forward-out like the print's cluster.
    seat(P, 'turret', FITTINGS.smokeBank({ mats: P.mats, count: 3,
      r: 0.048, len: 0.30, splay: -0.60, pitch: -0.46, arc: 0.45,
      spacing: 0.115, slot: 'detail', rotation: [0, -0.35, 0.10],
      seed: 8412 }), -1.30, 0.730, -0.50);
    seat(P, 'turret', FITTINGS.smokeBank({ mats: P.mats, count: 3,
      r: 0.048, len: 0.30, splay: -0.60, pitch: -0.46, arc: 0.45,
      spacing: 0.115, slot: 'detail', rotation: [0, -0.35, 0.10],
      seed: 8413 }), -1.27, 0.715, -0.24);
    // (e) wall kit density (order items: junction box, cable runs, grab
    // rail): ported junction box + pale lid + dome bolts, vertical cable
    // drop with clips, angled conduit hugging the receding aft wall, grab
    // rail on three standoff feet — every piece buried into the wall plane
    // and turret-owned (§B5: the whole band yaws with the shell).
    P.add('turretDark', box(0.055, 0.155, 0.20), -1.46, 0.44, -0.25);
    P.add('turretDetail', box(0.014, 0.115, 0.16), -1.492, 0.44, -0.25);
    P.add('turretDetail', cylX(0.02, 0.014, 8), -1.482, 0.44, -0.13);
    P.add('turretDetail', cylX(0.02, 0.014, 8), -1.444, 0.44, -0.37);
    P.add('turretDark', cylY(0.016, 0.016, 0.26, 8), -1.468, 0.26, -0.25);
    P.add('turretDetail', box(0.05, 0.028, 0.045), -1.462, 0.20, -0.25);
    P.add('turretDetail', box(0.05, 0.028, 0.045), -1.462, 0.33, -0.25);
    P.add('turretDark', cylZ(0.014, 0.43, 8), -1.362, 0.50, -0.68, 0, -0.154, 0);
    P.add('turretDetail', box(0.05, 0.028, 0.028), -1.40, 0.50, -0.52);
    P.add('turretDetail', box(0.05, 0.028, 0.028), -1.318, 0.50, -0.84);
    P.add('turretDetail', cylZ(0.015, 0.44, 8), -1.355, 0.62, -0.84, 0, -0.154, 0);
    P.add('turretDetail', box(0.055, 0.028, 0.028), -1.393, 0.62, -0.68);
    P.add('turretDetail', box(0.075, 0.028, 0.028), -1.352, 0.62, -0.84);
    P.add('turretDetail', box(0.095, 0.028, 0.028), -1.312, 0.62, -1.00);
    // (f) bustle flank: solid left side bin at the print's x -1.32 face
    // (world z -1.62..-2.36) with rim + straps + rack bracket, seated into
    // the rack tier so the flank reads closed like the print's.
    P.add('turret', box(0.20, 0.46, 0.74), -1.22, 0.34, -1.69);
    P.add('turretDetail', box(0.11, 0.030, 0.68), -1.24, 0.585, -1.69);
    P.add('turretDark', box(0.212, 0.36, 0.030), -1.22, 0.32, -1.48);
    P.add('turretDark', box(0.212, 0.36, 0.030), -1.22, 0.32, -1.86);
    P.add('turretDark', box(0.30, 0.06, 0.05), -1.00, 0.13, -1.90);
  }

  // ---- §5.340 RIGHT-WALL FINISH (owner follow-up: "still missing a huge
  // chunk of its turret ... check the left side from us facing the front"
  // = the TANK'S RIGHT). The both-side relief re-probe stations the print's
  // RIGHT cheek wall at face +1.462 (build +1.535, 1 cm shier than the
  // left's outer stack — the print is measurably asymmetric) over the SAME
  // world z -0.25..+1.36 window down to y 1.35, the same wing terrace
  // steps and mid-wall kit band, but NO tall smoke cluster (left-only in
  // the print — the ratified right uaSmoke bank keeps its seat) and a
  // LOW shoulder ledge topping ~2.20 instead. Authored s=+1 only; the
  // §5.338 left side stays byte-untouched.
  {
    // (a) right cheek cassette wall + top deck + seams (§B2-closes the
    // wall<->wing slot exactly like the left's)
    for (let i = 0; i < 3; i++) {
      P.add('turret', box(0.13, 0.58, 0.215), 1.470, 0.315, 0.98 + (i - 1) * 0.2325);
    }
    P.add('turret', box(0.32, 0.032, 0.72), 1.375, 0.588, 0.98);
    P.add('turretDark', box(0.012, 0.030, 0.70), 1.538, 0.315, 0.98);
    P.add('turretDark', box(0.012, 0.56, 0.030), 1.538, 0.315, 0.865);
    P.add('turretDark', box(0.012, 0.56, 0.030), 1.538, 0.315, 1.0975);
    P.add('turretDark', box(0.012, 0.045, 0.70), 1.537, 0.043, 0.98);
    P.add('turret', box(0.125, 0.52, 0.34), 1.34, 0.28, 1.4415, 0, -0.848, 0);
    P.add('turretDark', box(0.014, 0.44, 0.28), 1.384, 0.28, 1.491, 0, -0.848, 0);
    // (b) junction cassette panel wing -> wall (clear of the ratified
    // right edge-stack tiles aft of it)
    P.add('turret', box(0.10, 0.50, 0.28), 1.475, 0.30, 0.51);
    P.add('turretDark', box(0.012, 0.46, 0.026), 1.527, 0.30, 0.51);
    // (c) The common bilinear Duplet field above owns the mirrored outer
    // terrace too, keeping one continuous carrier-seated layer.
    // (d) LOW shoulder ledge + stowage kit (print right cluster tops 2.17
    // -> ledge 2.20 / kit 2.28 world; no smoke mirror — asymmetry law)
    P.add('turret', box(0.29, 0.045, 0.44), 1.345, 0.755, -0.22);
    P.add('turretDark', box(0.16, 0.08, 0.20), 1.26, 0.8175, -0.22);
    P.add('turretDark', box(0.07, 0.04, 0.05), 1.32, 0.79, -0.04);
    P.add('turretDark', box(0.07, 0.04, 0.05), 1.32, 0.79, -0.40);
    // (e) wall kit density mirrored in class (junction box + lid + bolts,
    // cable drop + clips, conduit + grab rail on feet along the receding
    // aft wall; all buried into the wall plane, turret-owned)
    P.add('turretDark', box(0.055, 0.155, 0.20), 1.46, 0.44, -0.25);
    P.add('turretDetail', box(0.014, 0.115, 0.16), 1.492, 0.44, -0.25);
    P.add('turretDetail', cylX(0.02, 0.014, 8), 1.482, 0.44, -0.13);
    P.add('turretDetail', cylX(0.02, 0.014, 8), 1.444, 0.44, -0.37);
    P.add('turretDark', cylY(0.016, 0.016, 0.26, 8), 1.468, 0.26, -0.25);
    P.add('turretDetail', box(0.05, 0.028, 0.045), 1.462, 0.20, -0.25);
    P.add('turretDetail', box(0.05, 0.028, 0.045), 1.462, 0.33, -0.25);
    P.add('turretDark', cylZ(0.014, 0.43, 8), 1.362, 0.50, -0.68, 0, 0.154, 0);
    P.add('turretDetail', box(0.05, 0.028, 0.028), 1.40, 0.50, -0.52);
    P.add('turretDetail', box(0.05, 0.028, 0.028), 1.318, 0.50, -0.84);
    P.add('turretDetail', cylZ(0.015, 0.44, 8), 1.355, 0.62, -0.84, 0, 0.154, 0);
    P.add('turretDetail', box(0.055, 0.028, 0.028), 1.393, 0.62, -0.68);
    P.add('turretDetail', box(0.075, 0.028, 0.028), 1.352, 0.62, -0.84);
    P.add('turretDetail', box(0.095, 0.028, 0.028), 1.312, 0.62, -1.00);
  }
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.06, 0.07, 0.06), s * 0.94, 0.40, -1.98);
    seat(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats,
      h: 0.20, r: 0.012, rake: -s * 0.85, seed: 8420 + (s > 0 ? 1 : 0) }),
      s * 0.94, 0.44, -1.98);
  }

  // KBA-3 125 mm: trunnion inside the arrowhead nose, sealed saddle, boot,
  // stepped thermal sleeve, muzzle +6.18 world, true bore.
  P.gunG.position.set(0, 0.30, 1.90);
  ruSaddle(P, { rollR: 0.17, rollW: 0.32, tubeR: 0.088, rootR: 0.19, rootL: 0.52 });
  ruBoot(P, { pts: [
    [-0.30, 0.17, 0.42, -0.10],
    [0.05, 0.16, 0.33, -0.06],
    [0.36, 0.14, 0.24, -0.02],
    [0.64, 0.125, 0.16, 0.00],
  ] });
  tubeGun(P, [
    [0.64, 1.50, 0.098],
    [1.50, 2.30, 0.101],
    [2.30, 3.14, 0.1035],
    [3.14, 3.90, 0.089],
    [3.90, 4.58, 0.085],
  ], {
    rings: [[0.90, 0.101], [1.50, 0.104], [2.30, 0.1065], [3.14, 0.092], [3.90, 0.088], [4.30, 0.088]],
    muzzle: 4.58,
  });
  P.add('gunDark', cylZ(0.087, 0.05, 16), 0, 0, 4.555);
  muzzleBore(P, { r: 0.0625 });

  P.decal('turret', 'number', P.spec.visual.number || '', 0.22, [1.40, 0.32, -0.60], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.22, [-1.40, 0.32, -0.60], -Math.PI / 2);
  addVehicleGhillieSuit(P);
  P.topY = 1.42;
}

// ---------------------------------------------------------------------------
// ua_m1a1 — unchanged certified composition (abrams base + first-party
// drone cage). NOT part of the §5.248 drop set.
// ---------------------------------------------------------------------------
function addCageBar(P, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  P.add('turretDark', KIT.box(w, h, d), x, y, z, rx, ry, rz);
}

function addAbramsDroneCage(P) {
  const { box, cylY } = KIT;
  const t = 0.032;
  // The Ukrainian field cage follows the Abrams turret's wedge instead of
  // enclosing it in a cuboid.  Four frame stations create a low front brow,
  // a pitched crown and a slightly falling rear canopy.  All coordinates are
  // turret-local, so the complete cage, payload and jammer yaw as one unit.
  // The native M1A1HA turret reaches about x=+/-1.71 and z=-3.16..+2.40.
  // Keep the cage outside that envelope instead of using the armor skin as
  // its centerline. The front remains shorter for the gun aperture, while
  // the bustle station clears the ammunition compartment and rear rack.
  const stations = [
    { z: 2.62, x: 1.94, base: 0.20, roof: 1.16 },
    { z: 0.28, x: 1.98, base: 0.10, roof: 1.30 },
    { z: -1.28, x: 2.04, base: 0.08, roof: 1.34 },
    { z: -3.34, x: 2.06, base: 0.14, roof: 1.28 },
  ];
  const pitchedZBar = (s, a, b, yKey, thickness = t) => {
    const dz = b.z - a.z;
    const dy = b[yKey] - a[yKey];
    const len = Math.hypot(dz, dy);
    addCageBar(P, thickness, thickness, len,
      s * (a.x + b.x) * 0.5, (a[yKey] + b[yKey]) * 0.5, (a.z + b.z) * 0.5,
      -Math.atan2(dy, dz), 0, 0);
  };

  for (const s of [-1, 1]) {
    // Broad, armored feet overlap the real cheek/bustle side and carry each
    // post.  They are fittings, not extra hit armor or track-side geometry.
    for (const st of stations) {
      const footDepth = st === stations[0] ? 0.56 : 0.30;
      P.addEquipment('turret', box(0.48, 0.11, footDepth), s * (st.x - 0.25), st.base, st.z,
        0, 0, s * 0.08);
      addCageBar(P, t, st.roof - st.base, t,
        s * st.x, (st.roof + st.base) * 0.5, st.z);
      // Mid rails break up each cell without turning the cage into opaque
      // slab armor.
      for (const q of [0.32, 0.62]) {
        addCageBar(P, t * 0.70, t * 0.70, 0.34,
          s * st.x, THREE.MathUtils.lerp(st.base, st.roof, q), st.z);
      }
    }
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i]; const b = stations[i + 1];
      pitchedZBar(s, a, b, 'base');
      pitchedZBar(s, a, b, 'roof');
      for (const q of [0.34, 0.66]) {
        const aq = { ...a, rail: THREE.MathUtils.lerp(a.base, a.roof, q) };
        const bq = { ...b, rail: THREE.MathUtils.lerp(b.base, b.roof, q) };
        pitchedZBar(s, aq, bq, 'rail', t * 0.70);
      }
      // One planted diagonal per bay makes the screen read field-built yet
      // structurally continuous.
      const dz = b.z - a.z;
      const dy = b.roof - a.base;
      addCageBar(P, t * 0.76, t * 0.76, Math.hypot(dz, dy),
        s * (a.x + b.x) * 0.5, (a.base + b.roof) * 0.5, (a.z + b.z) * 0.5,
        -Math.atan2(dy, dz), 0, 0);
    }
  }

  // Transverse roof ribs join both side frames.  The front rib is split at
  // x ±0.50 to preserve the gun/elevation corridor; aft ribs cross the full
  // canopy above the turret equipment.
  const frontTieOverlap = t * 0.50;
  const frontTieSpan = 0.50 + frontTieOverlap * 2;
  for (let k = 0; k < stations.length; k++) {
    const st = stations[k];
    if (k === 0) {
      for (const s of [-1, 1]) addCageBar(P, st.x - 0.50, t, t,
        s * (0.50 + (st.x - 0.50) * 0.5), st.roof, st.z);
    } else addCageBar(P, st.x * 2, t, t, 0, st.roof, st.z);
  }
  for (const xf of [-1.38, -0.69, 0, 0.69, 1.38]) {
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i]; const b = stations[i + 1];
      const dz = b.z - a.z; const dy = b.roof - a.roof;
      addCageBar(P, t * 0.76, t * 0.76, Math.hypot(dz, dy), xf,
        (a.roof + b.roof) * 0.5, (a.z + b.z) * 0.5,
        -Math.atan2(dy, dz), 0, 0);
    }
  }

  // The longitudinal centre rail used to end unsupported inside the split
  // front rib.  Two slim lap-jointed ties now bridge it to the left/right
  // rib halves.  Each tie overlaps both the centre rail and its outer rib,
  // eliminating the visible floating prong while retaining a light cage.
  for (const s of [-1, 1]) addCageBar(P, frontTieSpan, t * 0.76, t * 0.76,
    s * 0.25, stations[0].roof, stations[0].z);
  P.turretG.userData.uaM1A1CageRailReceipt = Object.freeze({
    centerRailHalfWidthM: t * 0.76 * 0.5,
    frontRibInnerXM: 0.50,
    connectorSpanM: frontTieSpan,
    connectorCenterXM: 0.25,
    overlapM: frontTieOverlap,
    yM: stations[0].roof,
    zM: stations[0].z,
  });

  // Tapered front shoulder screens frame the mantlet rather than crossing
  // it. Their upper rail follows the pitched first bay.
  for (const s of [-1, 1]) {
    const w = stations[0].x - 0.50;
    for (const q of [0, 0.33, 0.66, 1]) {
      const y = THREE.MathUtils.lerp(stations[0].base, stations[0].roof, q);
      addCageBar(P, w, t * 0.72, t * 0.72,
        s * (0.50 + w * 0.5), y, stations[0].z - q * 0.16);
    }
    for (const xq of [0.50, 0.97, 1.44, stations[0].x]) {
      addCageBar(P, t * 0.72, stations[0].roof - stations[0].base, t * 0.72,
        s * xq, (stations[0].roof + stations[0].base) * 0.5, stations[0].z - 0.08,
        -0.17, 0, 0);
    }
  }

  // Connected rear wall and filled bustle payload.  The rack, spare aerial
  // boxes, EW heads and rolled covers eliminate the former empty black cage.
  const rear = stations.at(-1);
  addCageBar(P, rear.x * 2, t, t, 0, rear.base, rear.z);
  addCageBar(P, rear.x * 2, t, t, 0, rear.roof, rear.z);
  for (let i = 0; i <= 8; i++) addCageBar(P, t, rear.roof - rear.base, t,
    -rear.x + i * rear.x * 0.25, (rear.roof + rear.base) * 0.5, rear.z);
  for (const q of [0.28, 0.55, 0.80]) addCageBar(P, rear.x * 2, t * 0.70, t * 0.70,
    0, THREE.MathUtils.lerp(rear.base, rear.roof, q), rear.z);

  const rack = FITTINGS.stowageRack({ mats: P.mats, w: 2.62, d: 0.62, h: 0.38,
    rails: 4, fill: 0.82, seed: 1101 });
  rack.position.set(0, 0.52, -2.86);
  P.turretG.add(rack);
  for (const s of [-1, 1]) {
    P.addEquipment('turret', box(0.48, 0.30, 0.42), s * 0.94, 0.72, -2.86);
    P.add('turretDark', box(0.42, 0.025, 0.36), s * 0.94, 0.89, -2.86);
    P.addEquipment('turret', cylY(0.15, 0.15, 0.48, 14), s * 0.58, 0.96, -2.74,
      0, 0, Math.PI / 2);
    seat(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: 0.72, r: 0.011,
      rake: -s * 0.10, seed: 1110 + (s > 0 ? 1 : 0) }), s * 1.32, 0.92, -2.78);
  }
  // Forward EO/EW cluster is planted on a real crossmember and remains
  // below the canopy crown.
  addCageBar(P, 0.72, 0.10, 0.20, 0, 1.15, 0.74);
  P.add('turretGlass', box(0.28, 0.095, 0.026), 0, 1.17, 0.855);
  P.addEquipment('turret', box(0.24, 0.20, 0.20), -0.96, 1.04, -1.62);
  P.add('turretGlass', box(0.13, 0.07, 0.024), -0.96, 1.07, -1.505);
  P.decal('turret', 'number', 'UA M1', 0.24, [-1.48, 0.32, -0.80], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.48);
}

function buildUAM1A1(P) {
  // buildTejasFamily branches on the source family id.  Present the exact
  // M1A1HA id only for the base build, then restore the Ukrainian identity
  // before attaching the first-party cage and decals.
  const id = P.spec.id;
  P.spec.id = 'm1a1ha';
  try {
    ABRAMS_PROFILES.m1a1ha.build(P, ABRAMS_PROFILES.m1a1ha);
  } finally {
    P.spec.id = id;
  }
  addAbramsDroneCage(P);
  addVehicleGhillieSuit(P);
}

export const UKRAINE_PROFILES = {
  ua_t64bv: { build: buildUAT64BV },
  ua_t80bv: { build: buildUAT80BV },
  ua_t80u_kursk: { build: buildUAT80UKursk },
  ua_t84_oplot_m: { build: buildUAOplotM },
  ua_m1a1: { build: buildUAM1A1 },
};
