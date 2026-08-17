import { flagIconCode } from '../ui/flagCodes.js';

export const VEHICLE_MARKING_SCHEMA_VERSION = 1;

export const VEHICLE_MARKING_ANCHOR_SCHEMA_VERSION = 1;

export const SURFACE_MARKING_STYLE = Object.freeze({
  surfaceLiftM: 0.006,
  markingPigment: '#d8d5c9',
  markingOutline: '#171815',
  bareMetal: '#d6dce4',
  impactHole: '#030202',
  impactHeat: '#fa923e',
  wearSeedSalt: 0x4d41524b,
});

const COUNTRY_MARKINGS = Object.freeze({
  us: Object.freeze({ countryLabel: 'United States', filterLabel: 'US', insignia: 'us-star', designation: 'US' }),
  de: Object.freeze({ countryLabel: 'Germany', filterLabel: 'DE', insignia: 'de-cross', designation: 'BW' }),
  ru: Object.freeze({ countryLabel: 'Russia', filterLabel: 'RU', insignia: 'ru-star', designation: 'RU' }),
  gb: Object.freeze({ countryLabel: 'United Kingdom', filterLabel: 'UK', insignia: 'gb-roundel', designation: 'UK' }),
  fr: Object.freeze({ countryLabel: 'France', filterLabel: 'FR', insignia: 'fr-roundel', designation: 'FR' }),
  cn: Object.freeze({ countryLabel: 'China', filterLabel: 'CN', insignia: 'cn-star', designation: 'CN' }),
  il: Object.freeze({ countryLabel: 'Israel', filterLabel: 'IL', insignia: 'il-star', designation: 'IDF' }),
  it: Object.freeze({ countryLabel: 'Italy', filterLabel: 'IT', insignia: 'it-shield', designation: 'EI' }),
  jp: Object.freeze({ countryLabel: 'Japan', filterLabel: 'JP', insignia: 'jp-roundel', designation: 'JGSDF' }),
  pl: Object.freeze({ countryLabel: 'Poland', filterLabel: 'PL', insignia: 'pl-checker', designation: 'PL' }),
  kr: Object.freeze({ countryLabel: 'South Korea', filterLabel: 'KR', insignia: 'kr-taeguk', designation: 'ROK' }),
  se: Object.freeze({ countryLabel: 'Sweden', filterLabel: 'SE', insignia: 'se-crowns', designation: 'SE' }),
  ua: Object.freeze({ countryLabel: 'Ukraine', filterLabel: 'UA', insignia: 'ua-trident', designation: 'UA' }),
  xx: Object.freeze({ countryLabel: 'Workshop', filterLabel: 'XX', insignia: 'workshop-shield', designation: 'COT' }),
});

// Canonical marking seats are deliberately keyed per playable vehicle.  The
// values are surface-search hints, not final XYZ coordinates: tankFactory
// ray-seats each hint against that vehicle's authored armor after the builder
// has finished.  This keeps an insignia physically on a real plate while
// still allowing related family members to choose different turret/hull
// stations.  `longitudinal` runs rear (0) -> bow (1); `vertical` runs bottom
// (0) -> roof (1) inside the selected articulation owner.
const anchor = (owner, side, longitudinal, vertical, sizeM, designationDirection = -1) => Object.freeze({
  schemaVersion: VEHICLE_MARKING_ANCHOR_SCHEMA_VERSION,
  owner,
  side,
  longitudinal,
  vertical,
  sizeM,
  designationDirection,
});

export const VEHICLE_MARKING_ANCHORS = Object.freeze({
  tiger1: anchor('turret', 'right', 0.46, 0.48, 0.30, 1),
  panther_g: anchor('turret', 'left', 0.42, 0.50, 0.29, -1),
  m1a2: anchor('turret', 'left', 0.43, 0.43, 0.27, 1),
  // T-62 keeps its own left-rear casting seat; the adjacent T-64 uses the
  // opposite cheek so the Soviet family does not repeat one decal template.
  t62mv1: anchor('turret', 'left', 0.48, 0.46, 0.23, 1),
  t64bv1: anchor('turret', 'right', 0.46, 0.48, 0.24, -1),
  t72b3m: anchor('turret', 'left', 0.40, 0.50, 0.23, 1),
  t72bu: anchor('turret', 'right', 0.43, 0.47, 0.24, -1),
  pt91m: anchor('turret', 'left', 0.38, 0.47, 0.22, 1),
  t80: anchor('turret', 'right', 0.46, 0.45, 0.23, -1),
  t80b: anchor('turret', 'left', 0.44, 0.46, 0.23, 1),
  t80bv: anchor('turret', 'right', 0.41, 0.49, 0.23, -1),
  t80u: anchor('turret', 'left', 0.39, 0.48, 0.24, 1),
  t84: anchor('turret', 'right', 0.36, 0.49, 0.24, -1),
  t90: anchor('turret', 'left', 0.43, 0.46, 0.23, 1),
  t90a: anchor('turret', 'right', 0.45, 0.45, 0.23, -1),
  t90a_vladimir: anchor('turret', 'left', 0.40, 0.48, 0.23, 1),
  t90a_burlak: anchor('turret', 'right', 0.35, 0.47, 0.23, -1),
  t90sm: anchor('turret', 'left', 0.37, 0.48, 0.24, 1),
  t90ms: anchor('turret', 'right', 0.34, 0.49, 0.24, -1),
  t90m: anchor('turret', 'left', 0.36, 0.46, 0.24, 1),
  strv103: anchor('hull', 'right', 0.46, 0.66, 0.27, -1),
  strv103a: anchor('hull', 'left', 0.44, 0.64, 0.27, 1),
  strv81: anchor('turret', 'left', 0.42, 0.48, 0.25, 1),
  strv122: anchor('turret', 'right', 0.34, 0.44, 0.25, -1),
  // Polish family deliberately uses three different, source-appropriate
  // seats: Jaguar on the cast turret flank, Twardy on the opposite ERAWA
  // cheek, and PL-01 on its broad faceted hull-side armor.
  t72m1_jaguar: anchor('turret', 'left', 0.39, 0.46, 0.23, 1),
  pt91_twardy: anchor('turret', 'right', 0.36, 0.45, 0.23, -1),
  pl01: anchor('hull', 'left', 0.44, 0.61, 0.26, 1),
  kv2: anchor('turret', 'left', 0.43, 0.48, 0.32, 1),
  jpz_e100: anchor('hull', 'right', 0.40, 0.66, 0.34, -1),
  sturmtiger: anchor('hull', 'left', 0.45, 0.64, 0.31, 1),
  t95: anchor('hull', 'right', 0.39, 0.61, 0.29, -1),
  chieftain5: anchor('turret', 'left', 0.43, 0.48, 0.25, 1),
  chieftain_mk10: anchor('turret', 'right', 0.39, 0.49, 0.25, -1),
  challenger1: anchor('turret', 'left', 0.39, 0.45, 0.26, 1),
  challenger2: anchor('turret', 'right', 0.37, 0.44, 0.26, -1),
  challenger_3: anchor('turret', 'left', 0.35, 0.46, 0.26, 1),
  k2: anchor('turret', 'right', 0.39, 0.44, 0.24, -1),
  k1a1: anchor('turret', 'left', 0.42, 0.46, 0.24, 1),
  // K2B (§5.299): the resurrected pre-§5.248 pl01 geometry — reuse that
  // build's proven seat on its broad faceted hull-side armor.
  k2b: anchor('hull', 'left', 0.44, 0.61, 0.26, 1),
  type74: anchor('turret', 'right', 0.45, 0.47, 0.23, -1),
  type90: anchor('turret', 'left', 0.40, 0.43, 0.23, 1),
  type10: anchor('turret', 'right', 0.37, 0.44, 0.23, -1),
  // Japanese prototype and upgrade marks use different, physically seated
  // armor faces: STB-1 on its cast left flank, Type 90A on the right NERA
  // cheek, and Type 10B on the high left modular skirt course.
  stb1: anchor('turret', 'left', 0.41, 0.47, 0.22, 1),
  type90a: anchor('turret', 'right', 0.35, 0.44, 0.24, -1),
  type10b: anchor('hull', 'left', 0.39, 0.61, 0.23, 1),
  m2a2_bradley: anchor('hull', 'left', 0.43, 0.64, 0.25, 1),
  bmp2: anchor('hull', 'right', 0.45, 0.65, 0.23, -1),
  spz_puma: anchor('hull', 'left', 0.40, 0.62, 0.25, 1),
  type89: anchor('hull', 'right', 0.42, 0.64, 0.23, -1),
  carro45t: anchor('turret', 'right', 0.46, 0.47, 0.24, -1),
  ariete: anchor('turret', 'left', 0.41, 0.45, 0.25, 1),
  ariete_c1: anchor('turret', 'right', 0.37, 0.46, 0.25, -1),
  ariete_c2: anchor('hull', 'left', 0.40, 0.64, 0.26, 1),
  amx40: anchor('turret', 'right', 0.39, 0.47, 0.24, -1),
  leo1a5: anchor('turret', 'left', 0.43, 0.47, 0.24, 1),
  leopard2_proto: anchor('turret', 'right', 0.42, 0.43, 0.25, -1),
  leo2a4: anchor('turret', 'left', 0.40, 0.44, 0.25, 1),
  leo2a5: anchor('turret', 'right', 0.38, 0.43, 0.25, -1),
  leo2a6: anchor('turret', 'left', 0.37, 0.45, 0.25, 1),
  // German derivatives use separate, surface-seated stations so their
  // markings remain readable around each distinct applique/slat package.
  leo2a4_otco: anchor('turret', 'right', 0.36, 0.44, 0.24, -1),
  leo2a4m: anchor('hull', 'left', 0.40, 0.62, 0.24, 1),
  leo2a6m: anchor('turret', 'left', 0.32, 0.43, 0.24, 1),
  leo2_revolution: anchor('turret', 'right', 0.34, 0.43, 0.25, -1),
  leo2a7v: anchor('turret', 'left', 0.35, 0.44, 0.25, 1),
  leclerc: anchor('turret', 'right', 0.38, 0.44, 0.24, -1),
  leclerc_xlr: anchor('turret', 'left', 0.34, 0.43, 0.24, 1),
  amx56: anchor('turret', 'right', 0.31, 0.45, 0.24, -1),
  type99a: anchor('turret', 'left', 0.39, 0.45, 0.24, 1),
  ztz85_iii: anchor('turret', 'right', 0.44, 0.47, 0.23, -1),
  ztz99a2: anchor('turret', 'left', 0.34, 0.45, 0.25, 1),
  t14: anchor('turret', 'right', 0.36, 0.45, 0.24, -1),
  m1a1: anchor('turret', 'left', 0.45, 0.44, 0.27, 1),
  m1a2_tusk: anchor('turret', 'right', 0.42, 0.43, 0.27, -1),
  kf51: anchor('turret', 'left', 0.36, 0.43, 0.25, 1),
  kf51b: anchor('turret', 'left', 0.34, 0.42, 0.24, 1),
  m1a2_legacy: anchor('turret', 'right', 0.44, 0.43, 0.27, -1),
  abramsx: anchor('turret', 'left', 0.38, 0.42, 0.26, 1),
  fv510: anchor('hull', 'right', 0.44, 0.66, 0.24, -1),
  m1a1ha: anchor('turret', 'left', 0.42, 0.44, 0.27, 1),
  m1a2_sepv2: anchor('turret', 'right', 0.40, 0.43, 0.27, -1),
  m1a2_sepv3: anchor('turret', 'left', 0.39, 0.44, 0.27, 1),
  m60a1: anchor('turret', 'right', 0.44, 0.48, 0.25, -1),
  merkava1b: anchor('turret', 'left', 0.40, 0.45, 0.25, 1),
  merkava2b: anchor('turret', 'right', 0.39, 0.46, 0.25, -1),
  merkava2d: anchor('turret', 'left', 0.37, 0.45, 0.25, 1),
  // The Mk 3C/D oracle turrets have deep undercuts and rear chain racks that
  // leave no broad ray-stable flank at the generic mid-height seat.  Their
  // IDF markings instead use separate, physically ray-seated skirt plates:
  // right-forward on 3C and left-rear on 3D.
  merkava3c: anchor('hull', 'right', 0.57, 0.58, 0.25, -1),
  merkava3d: anchor('hull', 'left', 0.40, 0.58, 0.25, 1),
  merkava4b: anchor('turret', 'right', 0.38, 0.44, 0.24, -1),
  type59: anchor('turret', 'right', 0.45, 0.48, 0.23, -1),
  amx30: anchor('turret', 'left', 0.43, 0.47, 0.24, 1),
  amx30b2: anchor('turret', 'right', 0.41, 0.48, 0.24, -1),
  m48: anchor('turret', 'left', 0.43, 0.48, 0.25, 1),
  m60a2: anchor('turret', 'right', 0.41, 0.46, 0.25, -1),
  isu152: anchor('hull', 'left', 0.42, 0.64, 0.27, 1),
  isu122s: anchor('hull', 'right', 0.40, 0.65, 0.27, -1),
  centurion3: anchor('turret', 'left', 0.44, 0.48, 0.25, 1),
  centurion5: anchor('turret', 'right', 0.42, 0.49, 0.25, -1),
  m46_patton: anchor('turret', 'left', 0.43, 0.48, 0.25, 1),
  m47_patton: anchor('turret', 'right', 0.41, 0.49, 0.25, -1),
  m26_pershing: anchor('turret', 'left', 0.44, 0.48, 0.26, 1),
  m45_patton: anchor('turret', 'right', 0.42, 0.47, 0.26, -1),
  m60a3: anchor('turret', 'left', 0.40, 0.49, 0.25, 1),
  ua_t64bv: anchor('turret', 'right', 0.38, 0.47, 0.23, -1),
  ua_t80bv: anchor('hull', 'left', 0.42, 0.63, 0.24, 1),
  ua_t80u_kursk: anchor('turret', 'left', 0.35, 0.46, 0.24, 1),
  ua_t84_oplot_m: anchor('turret', 'right', 0.32, 0.45, 0.25, -1),
  ua_m1a1: anchor('hull', 'right', 0.40, 0.65, 0.27, -1),
  // AFV family: every marking uses a different physically ray-seated face.
  // Tall slab vehicles use their broad appliqué flanks; compact stations use
  // turret cheeks that remain clear of weapons, sights and missile boxes.
  bmp3_rok: anchor('turret', 'right', 0.43, 0.46, 0.21, -1),
  ua_m2a3_bradley: anchor('hull', 'left', 0.39, 0.63, 0.24, 1),
  bmpt_terminator2: anchor('turret', 'right', 0.36, 0.48, 0.21, -1),
  // §5.363 bmpt_t90: the station walls sit behind the quad Ataka columns —
  // the broad §5.350 skirt-ERA panel field carries the painted designation.
  bmpt_t90: anchor('hull', 'left', 0.44, 0.60, 0.22, 1),
  upior_ifv: anchor('hull', 'right', 0.41, 0.64, 0.24, -1),
  marder1a3: anchor('hull', 'left', 0.46, 0.62, 0.23, 1),
  m3a3_bradley: anchor('turret', 'left', 0.39, 0.45, 0.23, 1),
  // §5.248 ground-up wave: flat authored faces per build — bmp3 turret dome
  // flank, upiór skirt panel field (bmpt removed by §5.304 owner order).
  bmp3: anchor('turret', 'right', 0.44, 0.47, 0.20, -1),
  upior: anchor('hull', 'right', 0.42, 0.60, 0.22, -1),
});

export function vehicleMarkingAnchor(specOrId) {
  const id = typeof specOrId === 'string' ? specOrId : specOrId?.id;
  return VEHICLE_MARKING_ANCHORS[id] || null;
}

function stableNumber(id) {
  let hash = 0x811c9dc5;
  for (const ch of String(id || 'tank')) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return String(100 + (hash % 900));
}

function cleanTacticalNumber(value, id) {
  const text = String(value || '').toUpperCase().replace(/[^A-Z0-9 -]/g, '').replace(/\s+/g, ' ').trim();
  return text || stableNumber(id);
}

export function vehicleMarkingRecord(spec) {
  const countryCode = flagIconCode(spec?.nation);
  const country = COUNTRY_MARKINGS[countryCode] || COUNTRY_MARKINGS.xx;
  const tacticalNumber = cleanTacticalNumber(spec?.visual?.number, spec?.id);
  const designationPrefix = spec?.nation === 'USSR' ? 'SU' : country.designation;
  return Object.freeze({
    schemaVersion: VEHICLE_MARKING_SCHEMA_VERSION,
    countryCode,
    countryLabel: country.countryLabel,
    filterLabel: country.filterLabel,
    insignia: country.insignia,
    tacticalNumber,
    designation: `${designationPrefix}-${tacticalNumber}`,
    markingCode: `${countryCode.toUpperCase()}:${country.insignia}:${tacticalNumber}`,
  });
}

function starPath(ctx, cx, cy, outer, inner = outer * 0.42, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = -Math.PI / 2 + i * Math.PI / points;
    const radius = i % 2 ? inner : outer;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function crossPath(ctx, cx, cy, size, arm = 0.31) {
  const h = size / 2, a = size * arm / 2;
  ctx.beginPath();
  ctx.moveTo(cx - a, cy - h); ctx.lineTo(cx + a, cy - h);
  ctx.lineTo(cx + a, cy - a); ctx.lineTo(cx + h, cy - a);
  ctx.lineTo(cx + h, cy + a); ctx.lineTo(cx + a, cy + a);
  ctx.lineTo(cx + a, cy + h); ctx.lineTo(cx - a, cy + h);
  ctx.lineTo(cx - a, cy + a); ctx.lineTo(cx - h, cy + a);
  ctx.lineTo(cx - h, cy - a); ctx.lineTo(cx - a, cy - a);
  ctx.closePath();
}

function ring(ctx, cx, cy, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
}

/** Draw a deterministic, country-specific vehicle insignia into any 2D canvas. */
export function drawNationalInsignia(ctx, insignia, cx, cy, size) {
  const r = size / 2;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (insignia === 'us-star') {
    ctx.strokeStyle = '#e2dfd2'; ctx.lineWidth = size * 0.07;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#e2dfd2'; starPath(ctx, cx, cy, r * 0.72); ctx.fill();
  } else if (insignia === 'de-cross') {
    ctx.strokeStyle = '#d6d2c5'; ctx.lineWidth = size * 0.13;
    ctx.fillStyle = '#1d1f1d'; crossPath(ctx, cx, cy, size * 0.9, 0.36); ctx.stroke(); ctx.fill();
  } else if (insignia === 'ru-star' || insignia === 'cn-star') {
    ctx.strokeStyle = insignia === 'cn-star' ? '#f1d45f' : '#eee9db';
    ctx.lineWidth = size * 0.07; ctx.fillStyle = '#b6322e';
    starPath(ctx, cx, cy, r * 0.86); ctx.stroke(); ctx.fill();
  } else if (insignia === 'gb-roundel' || insignia === 'fr-roundel') {
    const colors = insignia === 'gb-roundel' ? ['#2d4d83', '#e9e5d8', '#b93838'] : ['#b93838', '#e9e5d8', '#31548b'];
    ring(ctx, cx, cy, r * 0.9, colors[0]); ring(ctx, cx, cy, r * 0.61, colors[1]); ring(ctx, cx, cy, r * 0.31, colors[2]);
  } else if (insignia === 'il-star') {
    ctx.strokeStyle = '#5677a8'; ctx.lineWidth = size * 0.075;
    for (const flip of [0, Math.PI]) {
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = flip - Math.PI / 2 + i * Math.PI * 2 / 3;
        const x = cx + Math.cos(a) * r * 0.85, y = cy + Math.sin(a) * r * 0.85;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.stroke();
    }
  } else if (insignia === 'it-shield') {
    ctx.beginPath(); ctx.moveTo(cx - r * 0.72, cy - r * 0.8); ctx.lineTo(cx + r * 0.72, cy - r * 0.8);
    ctx.lineTo(cx + r * 0.58, cy + r * 0.48); ctx.lineTo(cx, cy + r * 0.9); ctx.lineTo(cx - r * 0.58, cy + r * 0.48); ctx.closePath();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#318351'; ctx.fillRect(cx - r, cy - r, r * 0.67, size);
    ctx.fillStyle = '#ece8db'; ctx.fillRect(cx - r * 0.33, cy - r, r * 0.67, size);
    ctx.fillStyle = '#b93636'; ctx.fillRect(cx + r * 0.34, cy - r, r * 0.67, size);
    ctx.restore(); ctx.strokeStyle = '#d7d3c6'; ctx.lineWidth = size * 0.05; ctx.stroke();
  } else if (insignia === 'jp-roundel') {
    ring(ctx, cx, cy, r * 0.82, '#b63838');
  } else if (insignia === 'pl-checker') {
    const s = r * 0.82;
    ctx.fillStyle = '#e7e2d5'; ctx.fillRect(cx - s, cy - s, s, s); ctx.fillRect(cx, cy, s, s);
    ctx.fillStyle = '#bb3b40'; ctx.fillRect(cx, cy - s, s, s); ctx.fillRect(cx - s, cy, s, s);
    ctx.strokeStyle = '#e7e2d5'; ctx.lineWidth = size * 0.05; ctx.strokeRect(cx - s, cy - s, s * 2, s * 2);
  } else if (insignia === 'kr-taeguk') {
    ring(ctx, cx, cy, r * 0.78, '#ece8dc');
    ctx.fillStyle = '#b63b3f'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#345888'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, 0, Math.PI); ctx.fill();
    ring(ctx, cx - r * 0.31, cy, r * 0.31, '#345888'); ring(ctx, cx + r * 0.31, cy, r * 0.31, '#b63b3f');
  } else if (insignia === 'se-crowns') {
    ctx.fillStyle = '#dfbd55';
    for (const [dx, dy] of [[-0.34, -0.28], [0.34, -0.28], [0, 0.35]]) {
      const x = cx + dx * r, y = cy + dy * r, w = r * 0.54;
      ctx.beginPath(); ctx.moveTo(x - w / 2, y + w * 0.22); ctx.lineTo(x - w * 0.42, y - w * 0.25);
      ctx.lineTo(x, y + w * 0.02); ctx.lineTo(x + w * 0.42, y - w * 0.25); ctx.lineTo(x + w / 2, y + w * 0.22); ctx.closePath(); ctx.fill();
    }
  } else if (insignia === 'ua-trident') {
    ctx.strokeStyle = '#e0bd4c'; ctx.lineWidth = size * 0.09;
    ctx.beginPath(); ctx.moveTo(cx - r * 0.55, cy - r * 0.62); ctx.lineTo(cx - r * 0.32, cy + r * 0.4);
    ctx.lineTo(cx, cy + r * 0.78); ctx.lineTo(cx + r * 0.32, cy + r * 0.4); ctx.lineTo(cx + r * 0.55, cy - r * 0.62);
    ctx.moveTo(cx, cy - r * 0.72); ctx.lineTo(cx, cy + r * 0.78); ctx.stroke();
  } else {
    ctx.fillStyle = '#d6a74f';
    ctx.beginPath(); ctx.moveTo(cx - r * 0.72, cy - r * 0.78); ctx.lineTo(cx + r * 0.72, cy - r * 0.78);
    ctx.lineTo(cx + r * 0.52, cy + r * 0.48); ctx.lineTo(cx, cy + r * 0.88); ctx.lineTo(cx - r * 0.52, cy + r * 0.48); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

export function drawTacticalNumber(ctx, record, bounds = {}) {
  const x = bounds.x ?? 0, y = bounds.y ?? 0, width = bounds.width ?? ctx.canvas.width, height = bounds.height ?? ctx.canvas.height;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const text = record.tacticalNumber;
  const fontSize = Math.min(height * 0.68, width / Math.max(1, text.length) * 1.75);
  ctx.font = `800 ${Math.max(16, fontSize)}px 'ABC Monument Grotesk', sans-serif`;
  ctx.lineWidth = Math.max(2, fontSize * 0.08);
  ctx.strokeStyle = SURFACE_MARKING_STYLE.markingOutline;
  ctx.fillStyle = SURFACE_MARKING_STYLE.markingPigment;
  ctx.strokeText(text, x + width / 2, y + height / 2);
  ctx.fillText(text, x + width / 2, y + height / 2);
  ctx.restore();
}

/** Combined tactical marking used by generated identity cards. */
export function drawVehicleDesignation(ctx, record, bounds = {}) {
  const x = bounds.x ?? 0, y = bounds.y ?? 0, width = bounds.width ?? ctx.canvas.width, height = bounds.height ?? ctx.canvas.height;
  const emblemSize = Math.min(height * 0.68, width * 0.34);
  drawNationalInsignia(ctx, record.insignia, x + width * 0.25, y + height / 2, emblemSize);
  drawTacticalNumber(ctx, record, { x: x + width * 0.42, y, width: width * 0.52, height });
}
