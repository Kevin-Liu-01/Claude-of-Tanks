// src/ui/techtree.js — WoT-style research tree screen, reachable from the
// garage. Nation tabs (USA / Germany / USSR·Russia), tier I–X ladder with
// connecting lines, the 8 real roster tanks placed at sensible tiers as
// unlocked + clickable nodes (click -> select in garage), plus greyed
// silhouette placeholder nodes for flavor (clearly non-functional).
// Smooth pointer pan / wheel zoom. Switzer typography, procedural flags.

import { FONT_STACK, ensureFonts } from './fonts.js';
import { flagSVG } from './flags.js';
import { iconUrl } from './icons.js';
import { getTankThumb } from './tankThumbs.js';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

const CLASS_LABEL = {
  light: 'Light tank', medium: 'Medium tank', heavy: 'Heavy tank',
  mbt: 'Main battle tank', td: 'Tank destroyer', ifv: 'Infantry fighting vehicle',
};

// WoT-style class lanes (top to bottom). MBTs continue the medium line;
// IFVs ride the scout (light) lane.
const LANE = { light: 0, medium: 1, mbt: 1, heavy: 2, td: 3, ifv: 0 };
const LANE_LABEL = ['LIGHT', 'MEDIUM · MBT', 'HEAVY', 'TANK DESTROYER'];

// ---------------------------------------------------------------------------
// META-GAME ECONOMY — persistent XP/credit wallet + researched ghost nodes.
// Earning is driven entirely by sim bus events (battle entity ids ARE spec
// ids, and the garage announces the player's spec on 'ui:battleStart'), so
// no game module needs to know about the economy to feed it; main.js only
// READS getLastBattleEarnings() to print the payout line on the battle
// report (see docs/handoff/content_breadth-r1.md).
// ---------------------------------------------------------------------------
const ECON_KEY = 'cot_progress_v1';
// research cost in XP by tier — tier I a formality, tier X a long grind
const RESEARCH_COST = [0, 300, 700, 1300, 2200, 3600, 5800, 9200, 14500, 22500, 34000];
// enlistment stipend: enough to research a couple of low-tier nodes right
// away, so a fresh profile can feel the loop before its first battle
const SEED_XP = 900;
const SEED_CREDITS = 20000;

let _prog = null;
function loadProgress() {
  if (_prog) return _prog;
  _prog = { xp: SEED_XP, credits: SEED_CREDITS, researched: {} };
  try {
    const raw = localStorage.getItem(ECON_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p.xp === 'number') {
        _prog = {
          xp: p.xp,
          credits: typeof p.credits === 'number' ? p.credits : 0,
          researched: p.researched && typeof p.researched === 'object' ? p.researched : {},
        };
      }
    }
  } catch (e) { /* storage unavailable (private mode): session-only wallet */ }
  return _prog;
}
function saveProgress() {
  try { localStorage.setItem(ECON_KEY, JSON.stringify(_prog)); } catch (e) { /* session-only */ }
}
const fmt = (n) => Math.round(n).toLocaleString('en-US');

/** Current wallet {xp, credits} (persisted across sessions). */
export function getWallet() { const p = loadProgress(); return { xp: p.xp, credits: p.credits }; }

let _lastEarnings = null;
/** Payout of the most recent battle this session (null before the first). */
export function getLastBattleEarnings() { return _lastEarnings; }

/**
 * Award the end-of-battle payout and persist it.
 * @param {{result:string,kills?:number,damage?:number}} o battle summary
 * @returns {{xp:number,credits:number,kills:number,damage:number,result:string}}
 */
export function recordBattleResult({ result, kills = 0, damage = 0 } = {}) {
  const p = loadProgress();
  const mult = result === 'victory' ? 1 : result === 'draw' ? 0.6 : 0.4;
  const xp = Math.round((260 + kills * 170 + damage * 0.24) * mult);
  const credits = Math.round((5400 + kills * 3600 + damage * 5.2) * mult);
  p.xp += xp;
  p.credits += credits;
  saveProgress();
  _lastEarnings = { xp, credits, kills, damage: Math.round(damage), result };
  return _lastEarnings;
}

// n(key, name, tier, cls, era, opts) — opts: {spec:'realSpecId', from:[keys],
// row: lane override} — row lets a second same-class line use a free lane
// (e.g. the USA M1A1/TUSK ladder rides the HEAVY lane next to the SEPv3 line).
function n(key, name, tier, cls, era, o = {}) {
  return {
    key, name, tier, row: o.row != null ? o.row : (LANE[cls] ?? 1),
    cls, era, specId: o.spec || null, from: o.from || [],
  };
}

// NOTE on spec wiring: nodes may carry a specId that is not shipped yet
// (m26 / tiger2 / t54 and the TD line tips). They render as ghost research
// nodes until the spec lands in src/vehicles/specs.js, then light up gold
// automatically — see docs/handoff/content_breadth-r1.md.
const TABS = [
  {
    id: 'usa', label: 'USA', flags: [['USA', 'modern']],
    nodes: [
      n('t1c', 'T1 Cunningham', 1, 'light', 'ww2'),
      n('m2', 'M2 Light Tank', 2, 'light', 'ww2', { from: ['t1c'] }),
      n('m3stuart', 'M3 Stuart', 3, 'light', 'ww2', { from: ['m2'] }),
      // r6: the light line used to dead-end at tier III, leaving the whole
      // top-right quarter of the canvas blank — continued to IX like the
      // real US scout line, feeding the MBT ladder at the top tiers
      n('m5', 'M5 Stuart', 4, 'light', 'ww2', { from: ['m3stuart'] }),
      n('chaffee', 'M24 Chaffee', 5, 'light', 'ww2', { from: ['m5'] }),
      n('t37', 'T37', 6, 'light', 'ww2', { from: ['chaffee'] }),
      n('t71', 'T71 DA', 7, 'light', 'ww2', { from: ['t37'] }),
      // MODERN EXPANSION: the scout line tops out in the Bradley IFV
      n('bradley', 'M2A2 Bradley', 8, 'ifv', 'modern', { spec: 'm2a2_bradley', from: ['t71'] }),
      n('sheridan', 'M551 Sheridan', 9, 'light', 'modern', { from: ['bradley'] }),
      n('m3lee', 'M3 Lee', 4, 'medium', 'ww2', { from: ['m3stuart'] }),
      n('m4', 'M4 Sherman', 5, 'medium', 'ww2', { from: ['m3lee'] }),
      n('e8', 'M4A3E8 Sherman', 6, 'medium', 'ww2', { spec: 'm4a3e8', from: ['m4'] }),
      n('t20', 'T20', 7, 'medium', 'ww2', { from: ['e8'] }),
      n('t29', 'T29', 7, 'heavy', 'ww2', { from: ['e8'] }),
      n('t32', 'T32', 8, 'heavy', 'ww2', { from: ['t29'] }),
      // MODERN EXPANSION: second Abrams ladder rides the free heavy lane —
      // M1A1 (variant GLB) into the TUSK survivability flagship
      n('m1a1', 'M1A1 Abrams', 9, 'mbt', 'modern', { spec: 'm1a1', from: ['m26'], row: 2 }),
      n('m1a2tusk', 'M1A2 Abrams TUSK', 10, 'mbt', 'modern', { spec: 'm1a2_tusk', from: ['m1a1'], row: 2 }),
      n('m26', 'M26 Pershing', 8, 'medium', 'ww2', { spec: 'm26', from: ['t20'] }),
      // ghost carries the roster's sourced-ready M60A3 spec id — lights up
      // automatically the moment the toshueyi GLB integration lands
      n('m60', 'M60A3 Patton', 9, 'mbt', 'modern', { spec: 'm60a3', from: ['m26'] }),
      n('abrams', 'M1A2 Abrams SEPv3', 10, 'mbt', 'modern', { spec: 'm1a2', from: ['m60'] }),
      n('m10', 'M10 Wolverine', 5, 'td', 'ww2', { from: ['m3lee'] }),
      n('hellcat', 'M18 Hellcat', 6, 'td', 'ww2', { from: ['m10'] }),
      n('m36', 'M36 Jackson', 7, 'td', 'ww2', { spec: 'm36', from: ['hellcat'] }),
      n('t28us', 'T28', 8, 'td', 'ww2', { from: ['m36'] }),
      n('t30', 'T30', 9, 'td', 'ww2', { spec: 't30', from: ['t28us'] }),
    ],
  },
  {
    id: 'germany', label: 'Germany', flags: [['Germany', 'ww2'], ['Germany', 'modern']],
    nodes: [
      n('ltraktor', 'Leichttraktor', 1, 'light', 'ww2'),
      n('pz2', 'Pz.Kpfw. II', 2, 'light', 'ww2', { from: ['ltraktor'] }),
      n('pz38t', 'Pz.Kpfw. 38 (t)', 3, 'light', 'ww2', { from: ['pz2'] }),
      // r6: German scout line continued past III (the empty top-right half of
      // the Germany canvas was a critique item) — ends at Ru 251 which feeds
      // Leopard 1, the classic WoT light->medium merge
      n('pz38na', 'Pz.Kpfw. 38 nA', 4, 'light', 'ww2', { from: ['pz38t'] }),
      n('luchs', 'Pz.Kpfw. II Luchs', 5, 'light', 'ww2', { from: ['pz38na'] }),
      n('vk1602', 'VK 16.02 Leopard', 6, 'light', 'ww2', { from: ['luchs'] }),
      n('aufklpanther', 'Aufklärungspanther', 7, 'light', 'ww2', { from: ['vk1602'] }),
      n('ru251', 'Spähpanzer Ru 251', 8, 'light', 'ww2', { from: ['aufklpanther'] }),
      // MODERN EXPANSION: the paper-armor speedster continues the scout lane
      n('leo1a5', 'Leopard 1A5', 9, 'mbt', 'modern', { spec: 'leo1a5', from: ['ru251'], row: 0 }),
      // ghost carries the sourced-ready KF51 spec id (kf51-grip420 GLB) —
      // lights up automatically when that integration lands
      n('kf51', 'KF51 Panther', 10, 'mbt', 'modern', { spec: 'kf51', from: ['leo1a5'], row: 0 }),
      n('pz3', 'Pz.Kpfw. III', 4, 'medium', 'ww2', { from: ['pz38t'] }),
      n('pz4', 'Pz.Kpfw. IV Ausf. H', 5, 'medium', 'ww2', { from: ['pz3'] }),
      n('vk3002m', 'VK 30.02 (M)', 6, 'medium', 'ww2', { from: ['pz4'] }),
      n('panther', 'Panther Ausf. G', 7, 'medium', 'ww2', { spec: 'panther_g', from: ['vk3002m'] }),
      // MODERN EXPANSION: the full Leopard 2 family ladder (2A4 -> 2A6 -> 2A7)
      n('leo2a4', 'Leopard 2A4', 8, 'mbt', 'modern', { spec: 'leo2a4', from: ['panther'] }),
      n('leo2a6', 'Leopard 2A6', 9, 'mbt', 'modern', { spec: 'leo2a6', from: ['leo2a4'] }),
      n('leo2', 'Leopard 2A7', 10, 'mbt', 'modern', { spec: 'leo2a7', from: ['leo2a6'] }),
      n('vk3601', 'VK 36.01 (H)', 6, 'heavy', 'ww2', { from: ['pz4'] }),
      n('tiger', 'Tiger I', 7, 'heavy', 'ww2', { spec: 'tiger1', from: ['vk3601'] }),
      n('tiger2', 'Tiger II', 8, 'heavy', 'ww2', { spec: 'tiger2', from: ['tiger'] }),
      n('e75', 'E 75', 9, 'heavy', 'ww2', { from: ['tiger2'] }),
      n('maus', 'Maus', 10, 'heavy', 'ww2', { from: ['e75'] }),
      n('stug', 'StuG III Ausf. G', 5, 'td', 'ww2', { from: ['pz3'] }),
      n('jpz4', 'Jagdpanzer IV', 6, 'td', 'ww2', { from: ['stug'] }),
      n('jagdpanther', 'Jagdpanther', 7, 'td', 'ww2', { spec: 'jagdpanther', from: ['jpz4'] }),
      n('ferdinand', 'Ferdinand', 8, 'td', 'ww2', { from: ['jagdpanther'] }),
      n('jagdtiger', 'Jagdtiger', 9, 'td', 'ww2', { spec: 'jagdtiger', from: ['ferdinand'] }),
      n('jpze100', 'Jagdpanzer E 100', 10, 'td', 'ww2', { spec: 'jpz_e100', from: ['jagdtiger'] }),
    ],
  },
  {
    id: 'ussr', label: 'USSR · Russia', flags: [['USSR', 'ww2'], ['Russia', 'modern']],
    nodes: [
      n('ms1', 'MS-1', 1, 'light', 'ww2'),
      n('t26', 'T-26', 2, 'light', 'ww2', { from: ['ms1'] }),
      n('bt7', 'BT-7', 3, 'light', 'ww2', { from: ['t26'] }),
      // r6: Soviet light line continued past III — ends at LTTB feeding the
      // T-72B MBT ladder (mirrors the USA/Germany scout-line merges)
      n('t80l', 'T-80', 4, 'light', 'ww2', { from: ['bt7'] }),
      n('t50', 'T-50', 5, 'light', 'ww2', { from: ['t80l'] }),
      n('mt25', 'MT-25', 6, 'light', 'ww2', { from: ['t50'] }),
      // MODERN EXPANSION: the scout lane flows into the flanker IFV, the
      // turbine hot-rod T-80U and tops out at the T-14 Armata flagship
      n('bmp2', 'BMP-2', 7, 'ifv', 'modern', { spec: 'bmp2', from: ['mt25'] }),
      n('t80u', 'T-80U', 8, 'mbt', 'modern', { spec: 't80u', from: ['bmp2'], row: 0 }),
      n('t14', 'T-14 Armata', 10, 'mbt', 'modern', { spec: 't14', from: ['t80u'], row: 0 }),
      n('t28', 'T-28', 4, 'medium', 'ww2', { from: ['bt7'] }),
      n('t34', 'T-34', 5, 'medium', 'ww2', { from: ['t28'] }),
      n('t3485', 'T-34-85', 6, 'medium', 'ww2', { spec: 't34_85', from: ['t34'] }),
      // MODERN EXPANSION: T-72B3 (procedural) -> T-90A (variant GLB) -> T-90M
      n('t72b3', 'T-72B3', 8, 'mbt', 'modern', { spec: 't72b3', from: ['t3485'] }),
      n('t90a', 'T-90A', 9, 'mbt', 'modern', { spec: 't90a', from: ['t72b3'] }),
      n('t90', 'T-90M Proryv', 10, 'mbt', 'modern', { spec: 't90m', from: ['t90a'] }),
      n('kv1', 'KV-1', 5, 'heavy', 'ww2', { from: ['bt7'] }),
      n('kv85', 'KV-85', 6, 'heavy', 'ww2', { from: ['kv1'] }),
      n('is2', 'IS-2', 7, 'heavy', 'ww2', { spec: 'is2', from: ['kv85'] }),
      // cross-linked to the community-sourced IS-3 (PanzerFactory): the same
      // vehicle must not sit as future research here while being battle-ready
      // on the COMMUNITY tab — the node lights gold and routes to that spec
      n('is3', 'IS-3', 8, 'heavy', 'ww2', { spec: 'is3', from: ['is2'] }),
      n('t10', 'T-10', 9, 'heavy', 'ww2', { from: ['is3'] }),
      // cross-linked to the community-sourced IS-7 (same rule as IS-3 above)
      n('is7', 'IS-7', 10, 'heavy', 'ww2', { spec: 'is7', from: ['t10'] }),
      n('su76', 'SU-76M', 3, 'td', 'ww2', { from: ['t26'] }),
      n('su85', 'SU-85', 5, 'td', 'ww2', { from: ['su76'] }),
      n('su100', 'SU-100', 6, 'td', 'ww2', { spec: 'su100', from: ['su85'] }),
      n('su152', 'SU-152', 7, 'td', 'ww2', { from: ['su100'] }),
      n('isu152', 'ISU-152', 8, 'td', 'ww2', { from: ['su152'] }),
      n('obj704', 'Object 704', 9, 'td', 'ww2', { from: ['isu152'] }),
    ],
  },
  // -------------------------------------------------------------------------
  // MODERN EXPANSION nation tabs (docs/research/modern-roster.md): compact
  // ladders — a couple of era-bridging ghost ancestors feeding each shipped
  // modern vehicle, so every new nation reads as a tree, not a lone card.
  // -------------------------------------------------------------------------
  {
    id: 'uk', label: 'UK', flags: [['UK', 'modern']],
    nodes: [
      n('cromwell', 'Cromwell', 4, 'medium', 'ww2'),
      n('comet', 'Comet', 5, 'medium', 'ww2', { from: ['cromwell'] }),
      n('centurion', 'Centurion Mk 7', 6, 'medium', 'modern', { from: ['comet'] }),
      n('chieftain', 'Chieftain Mk 10', 7, 'mbt', 'modern', { spec: 'chieftain_mk10', from: ['centurion'] }),
      n('challenger1', 'Challenger 1', 8, 'mbt', 'modern', { from: ['chieftain'] }),
      n('challenger2', 'Challenger 2', 9, 'mbt', 'modern', { spec: 'challenger2', from: ['challenger1'] }),
    ],
  },
  {
    id: 'france', label: 'France', flags: [['France', 'modern']],
    nodes: [
      n('amx13', 'AMX-13', 6, 'light', 'modern'),
      n('amx30', 'AMX-30B', 8, 'mbt', 'modern', { from: ['amx13'] }),
      n('leclerc', 'Leclerc S2', 9, 'mbt', 'modern', { spec: 'leclerc', from: ['amx30'] }),
    ],
  },
  {
    id: 'israel', label: 'Israel', flags: [['Israel', 'modern']],
    nodes: [
      n('m50sherman', 'M-50 Super Sherman', 6, 'medium', 'ww2'),
      n('magach', 'Magach 6B', 7, 'mbt', 'modern', { from: ['m50sherman'] }),
      n('merkava1', 'Merkava Mk 1', 8, 'mbt', 'modern', { from: ['magach'] }),
      n('merkava4', 'Merkava IVm Windbreaker', 9, 'mbt', 'modern', { spec: 'merkava4', from: ['merkava1'] }),
    ],
  },
  {
    id: 'china', label: 'China', flags: [['China', 'modern']],
    nodes: [
      n('type59', 'Type 59', 7, 'mbt', 'modern'),
      n('type88', 'Type 88 (ZTZ-88)', 8, 'mbt', 'modern', { from: ['type59'] }),
      n('type99a', 'Type 99A (ZTZ-99A)', 9, 'mbt', 'modern', { spec: 'type99a', from: ['type88'] }),
    ],
  },
  {
    id: 'korea', label: 'S. Korea', flags: [['South Korea', 'modern']],
    nodes: [
      n('m48k', 'M48A5K', 7, 'mbt', 'modern'),
      n('k1', 'K1 88-Tank', 8, 'mbt', 'modern', { from: ['m48k'] }),
      n('k2', 'K2 Black Panther', 9, 'mbt', 'modern', { spec: 'k2', from: ['k1'] }),
    ],
  },
  {
    id: 'japan', label: 'Japan', flags: [['Japan', 'modern']],
    nodes: [
      n('type61', 'Type 61', 7, 'mbt', 'modern'),
      // USER DROPS 2026-07-28: no longer a ghost — the NullOps Type 74
      // (quarantine GLB, userdrops.js) registered the spec and lit this node
      // up. The old STB-1 print base stays rejected (provenance conflict,
      // docs/ATTRIBUTION.md evaluation record).
      n('type74', 'Type 74', 8, 'mbt', 'modern', { spec: 'type74', from: ['type61'] }),
      n('type10', 'Type 10', 9, 'mbt', 'modern', { spec: 'type10', from: ['type74'] }),
    ],
  },
  {
    id: 'italy', label: 'Italy', flags: [['Italy', 'modern']],
    nodes: [
      n('m47i', 'M47 Patton (EI)', 6, 'mbt', 'modern'),
      n('of40', 'OF-40', 7, 'mbt', 'modern', { from: ['m47i'] }),
      n('ariete', 'C1 Ariete', 8, 'mbt', 'modern', { spec: 'ariete', from: ['of40'] }),
    ],
  },
];

// ladder geometry (world px, pre-zoom)
const PAD_X = 60;
const HEAD_H = 76;
const TIER_W = 176;
const NODE_W = 150;
const NODE_H = 118; // room for the research-cost / battle-ready footer strip
const ROW_H = 152;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.75;
const MAX_FIT_ZOOM = 1.32; // fit-to-content may zoom IN this far on sparse trees

const TT_CSS = `
.cot-tt{position:fixed;inset:0;z-index:66;display:none;flex-direction:column;
  font-family:${FONT_STACK};color:#e6edf3;-webkit-user-select:none;user-select:none;
  background:
    radial-gradient(120% 90% at 50% 10%,rgba(20,28,38,.5) 0%,rgba(5,8,11,0) 60%),
    linear-gradient(180deg,#070b0f 0%,#0a0f14 55%,#06090c 100%);}
.cot-tt.open{display:flex;}
.cot-tt *{box-sizing:border-box;margin:0;padding:0;}
.cot-tt-hdr{display:flex;align-items:center;gap:26px;padding:16px 30px 12px;
  border-bottom:1px solid rgba(146,164,180,.22);
  background:linear-gradient(180deg,rgba(9,13,17,.95),rgba(7,10,13,.88));flex:0 0 auto;}
.cot-tt-hdr .ttl{font-size:17px;font-weight:800;letter-spacing:.30em;color:#9fb0bf;
  text-transform:uppercase;white-space:nowrap;}
.cot-tt-hdr .ttl b{color:#f0a030;}
.cot-tt-tabs{display:flex;gap:4px;flex:1;justify-content:center;}
.cot-tt-tab{display:flex;align-items:center;gap:9px;cursor:pointer;border:1px solid transparent;
  border-bottom:2px solid transparent;background:none;padding:8px 20px 7px;
  font-family:${FONT_STACK};font-size:12px;font-weight:700;letter-spacing:.18em;
  color:#8a97a3;text-transform:uppercase;transition:color .12s,border-color .12s;}
.cot-tt-tab svg{display:block;box-shadow:0 1px 4px rgba(0,0,0,.5);}
.cot-tt-tab:hover{color:#c6d2dc;}
.cot-tt-tab.sel{color:#ffd27a;border-bottom-color:#f0a030;
  background:linear-gradient(180deg,rgba(240,160,48,.10),rgba(240,160,48,0));}
.cot-tt-close{cursor:pointer;border:1px solid rgba(146,164,180,.35);
  border-bottom:2px solid rgba(146,164,180,.45);background:rgba(11,15,20,.8);
  color:#9fb0bf;font-family:${FONT_STACK};font-size:11px;font-weight:800;
  letter-spacing:.2em;text-transform:uppercase;padding:9px 22px;white-space:nowrap;
  transition:color .12s,border-color .12s;}
.cot-tt-close:hover{color:#f0b04a;border-color:rgba(240,176,74,.6);}
.cot-tt-view{position:relative;flex:1;overflow:hidden;cursor:grab;
  background-image:
    linear-gradient(rgba(146,164,180,.045) 1px,transparent 1px),
    linear-gradient(90deg,rgba(146,164,180,.045) 1px,transparent 1px);
  background-size:44px 44px;}
.cot-tt-view.panning{cursor:grabbing;}
.cot-tt-world{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;}
.cot-tt-world svg.wire{position:absolute;left:0;top:0;overflow:visible;}
.cot-tt-tierhd{position:absolute;top:14px;width:${NODE_W}px;text-align:center;
  font-size:15px;font-weight:800;letter-spacing:.30em;color:rgba(159,176,191,.55);}
.cot-tt-tierhd i{display:block;font-style:normal;font-size:8px;font-weight:700;
  letter-spacing:.26em;color:rgba(138,151,163,.4);margin-top:2px;text-transform:uppercase;}
.cot-tt-node{position:absolute;width:${NODE_W}px;height:${NODE_H}px;padding:7px 10px 6px;
  background:linear-gradient(180deg,rgba(13,18,23,.94),rgba(8,11,14,.96));
  border:1px solid rgba(146,164,180,.26);border-top:2px solid rgba(146,164,180,.26);}
.cot-tt-node .top{display:flex;align-items:center;gap:6px;margin-bottom:3px;}
.cot-tt-node .top svg{display:block;}
.cot-tt-node .tier{margin-left:auto;font-size:11px;font-weight:800;letter-spacing:.14em;
  color:#8a97a3;}
.cot-tt-node canvas{display:block;margin:1px auto 2px;}
.cot-tt-node .ti{display:block;margin:0 auto 1px;width:118px;height:38px;
  object-fit:contain;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));}
.cot-tt-node .nm{font-size:10.5px;font-weight:600;letter-spacing:.01em;color:#eef4f9;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;}
.cot-tt-node .cls{font-size:8px;font-weight:700;letter-spacing:.22em;color:#8a97a3;
  text-transform:uppercase;text-align:center;margin-top:2px;}
.cot-tt-node.real{cursor:pointer;border-color:rgba(240,160,48,.55);border-top-color:#f0a030;
  box-shadow:0 4px 18px rgba(0,0,0,.45);
  transition:transform .12s,box-shadow .12s,border-color .12s;}
.cot-tt-node.real:hover{transform:translateY(-3px);border-color:#ffc169;
  box-shadow:0 10px 28px rgba(240,140,20,.30);}
.cot-tt-node.real .tier{color:#f0b04a;}
.cot-tt-node.ghost{border-style:dashed;opacity:.62;}
.cot-tt-node.ghost .nm{color:#93a1ad;}
.cot-tt-node.ghost .lock{position:absolute;top:6px;right:8px;font-size:9px;color:#5c6771;}
.cot-tt-node.ghost .tier{margin-right:14px;}
.cot-tt-node .ready{position:absolute;left:0;right:0;bottom:-1px;height:2px;
  background:linear-gradient(90deg,rgba(240,160,48,0),#f0a030,rgba(240,160,48,0));}
/* META-GAME: research footer strip on ghost nodes (cost / locked / researched) */
.cot-tt-node .res{position:absolute;left:0;right:0;bottom:0;padding:3px 4px 4px;
  text-align:center;font-size:8.5px;font-weight:800;letter-spacing:.14em;
  color:#67727d;text-transform:uppercase;white-space:nowrap;overflow:hidden;
  background:linear-gradient(180deg,rgba(146,164,180,.07),rgba(146,164,180,.02));}
.cot-tt-node.ghost.available{opacity:.78;cursor:pointer;
  transition:transform .12s,border-color .12s,opacity .12s;}
.cot-tt-node.ghost.available .res{color:#f0b04a;}
.cot-tt-node.ghost.available.poor .res{color:#b97a6c;}
.cot-tt-node.ghost.available:hover{opacity:1;transform:translateY(-2px);
  border-color:rgba(240,176,74,.55);}
.cot-tt-node.ghost.researched{border-style:solid;opacity:.85;
  border-color:rgba(240,160,48,.42);border-top-color:rgba(240,160,48,.85);}
.cot-tt-node.ghost.researched .res{color:#8fce8f;}
.cot-tt-node.ghost.researched .nm{color:#d9c9a8;}
@keyframes cot-tt-deny{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}
  75%{transform:translateX(4px)}}
.cot-tt-node.deny{animation:cot-tt-deny .16s linear 2;}
/* wallet chip in the header */
.cot-tt-wallet{display:flex;gap:20px;align-items:center;margin-right:8px;}
.cot-tt-wallet .w{font-size:9px;font-weight:700;letter-spacing:.2em;color:#6d7a86;
  text-transform:uppercase;white-space:nowrap;text-align:right;}
.cot-tt-wallet .w b{display:block;font-size:14px;font-weight:800;letter-spacing:.05em;
  color:#ffd27a;margin-top:1px;}
.cot-tt-wallet .w.cr b{color:#cfd9e2;}
.cot-tt-hint{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);
  font-size:9.5px;font-weight:600;letter-spacing:.18em;color:rgba(138,151,163,.75);
  text-transform:uppercase;pointer-events:none;white-space:nowrap;}
.cot-tt-hint b{color:rgba(240,176,74,.9);font-weight:700;}
.cot-tt-lane{position:absolute;font-size:10px;font-weight:800;letter-spacing:.30em;
  color:rgba(159,176,191,.38);text-transform:uppercase;white-space:nowrap;
  pointer-events:none;z-index:3;}
.cot-tt-lane::after{content:'';display:inline-block;vertical-align:middle;
  width:220px;height:1px;margin-left:14px;
  background:linear-gradient(90deg,rgba(146,164,180,.25),rgba(146,164,180,0));}
/* COMMUNITY TANKS: sourced-asset cards carry a mandatory author credit line.
   r3: WRAPS to two lines (line-clamp) instead of ellipsizing — longer CC-BY
   attributions ('by Lukasz Wesiora (canisferus)…') were clipped at default
   zoom; the full string also rides the title tooltip. */
.cot-tt-node.comm{height:140px;}
.cot-tt-node .credit{font-size:7.5px;font-weight:600;letter-spacing:.04em;
  color:#7f96a8;text-align:center;margin-top:2px;white-space:normal;
  line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;
  -webkit-box-orient:vertical;overflow:hidden;}
.cot-tt-node .credit b{color:#a8bccc;font-weight:700;}
`;

function ensureStyle(id, css) {
  if (!document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id;
    s.textContent = css;
    document.head.appendChild(s);
  }
}

// ---------------------------------------------------------------------------
// Ghost-node silhouette painters — parametric side profiles driven by a
// per-vehicle proportion table (GHOSTS below) instead of one generic hull
// template, so locked research nodes read as the vehicles they name.
// Front faces RIGHT. All proportions in meters, auto-scaled to the canvas.
//
// Turreted profile fields:
//   L overall length (incl gun) · HL hull length · H total height ·
//   hullH ground->hull-roof · wheels/wheelR running gear (skirt: side skirts)
//   glacis/rear hull roof edge setbacks · tPos turret center (0 rear..1 front)
//   tLen/tH turret size · taper turret side rake · dome rounded turret ·
//   cupola commander bump · gunLen from turret front · gunTh barrel Ø ·
//   brake muzzle brake block · gunUp barrel height in the turret (0..1)
// Casemate profile ({td:true}): caseX0/caseX1 superstructure extent (hull
//   fractions), caseH height over hull roof, front/rear rake fractions.
// ---------------------------------------------------------------------------
function drawGhostTank(canvas, p, opts = {}) {
  const W = opts.w || 118, Hpx = opts.h || 38;
  canvas.width = W; canvas.height = Hpx;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, W, Hpx);
  const hullC = opts.color || 'rgba(126,140,152,0.60)';
  const gearC = opts.gearColor || 'rgba(92,104,115,0.52)';
  // ABSOLUTE px-per-meter scale shared by EVERY ghost (capped so the largest
  // roster hulls — Jagdtiger 10.7 m / Maus 3.6 m tall — still fit the box).
  // The old per-vehicle fit-to-canvas normalized all size differences away,
  // which is why four different mediums read as one repeated shape: a
  // Cunningham must be visibly half a Pershing.
  const s = opts.pxm || Math.min((W - 6) / 11.5, (Hpx - 3) / 3.7);
  const groundY = Hpx - 1.5;
  const x0 = (W - p.L * s) / 2; // hull rear; the gun overhangs to the right
  const hullL = p.HL * s;
  const wheelR = (p.wheelR ?? 0.34) * s;
  const trackTop = groundY - wheelR * 2;
  const hullTop = groundY - p.hullH * s;
  // running gear — its own darker tone, so wheels/tracks separate from the
  // hull mass instead of merging into one flat blob
  c.fillStyle = gearC;
  if (p.skirt) {
    c.fillRect(x0 + 1, trackTop - 1, hullL - 2, groundY - trackTop + 1);
  } else {
    const n = p.wheels ?? 6;
    const span = hullL - wheelR * 2;
    for (let i = 0; i < n; i++) {
      const wx = x0 + wheelR + (n === 1 ? span / 2 : (i / (n - 1)) * span);
      c.beginPath();
      c.arc(wx, groundY - wheelR, wheelR, 0, Math.PI * 2);
      c.fill();
    }
    c.fillRect(x0 + wheelR * 0.5, trackTop - 1.2, hullL - wheelR, 1.4); // return run
  }
  c.fillStyle = hullC;
  // hull: sloped glacis front, slightly raked rear plate
  const g = (p.glacis ?? 0.5) * s, rSet = (p.rear ?? 0.25) * s;
  const beltY = groundY - wheelR - 0.8; // sponson/track-guard line
  c.beginPath();
  c.moveTo(x0, beltY);
  c.lineTo(x0 + rSet, hullTop);
  c.lineTo(x0 + hullL - g, hullTop);
  c.lineTo(x0 + hullL, hullTop + (p.nose ?? 0.42) * (beltY - hullTop));
  c.lineTo(x0 + hullL, beltY);
  c.closePath();
  c.fill();
  if (p.td) {
    // fixed casemate superstructure
    const cx0 = x0 + hullL * (p.caseX0 ?? 0.10), cx1 = x0 + hullL * (p.caseX1 ?? 0.86);
    const caseH = p.caseH * s;
    c.beginPath();
    c.moveTo(cx0, hullTop);
    c.lineTo(cx0 + (cx1 - cx0) * (p.caseRear ?? 0.16), hullTop - caseH);
    c.lineTo(cx1 - (cx1 - cx0) * (p.caseFront ?? 0.26), hullTop - caseH);
    c.lineTo(cx1, hullTop);
    c.closePath();
    c.fill();
    const gy = hullTop - caseH * (p.gunUp ?? 0.5);
    const gth = (p.gunTh ?? 0.24) * s * 2.2;
    c.fillRect(cx1 - 4, gy - gth * 1.4, 4.5, gth * 2.8); // mantlet block
    c.fillRect(cx1, gy - gth / 2, x0 + p.L * s - cx1, gth);
    if (p.brake) c.fillRect(x0 + p.L * s - 3.2, gy - gth * 1.1, 3.2, gth * 2.2);
    return;
  }
  // turret
  const tcx = x0 + (p.tPos ?? 0.55) * hullL;
  const half = (p.tLen * s) / 2, tH = p.tH * s;
  if (p.dome) {
    c.beginPath();
    c.ellipse(tcx, hullTop + 0.5, half, tH, 0, Math.PI, 0);
    c.fill();
  } else {
    const taper = (p.taper ?? 0.25) * s;
    c.beginPath();
    c.moveTo(tcx - half, hullTop);
    c.lineTo(tcx - half + taper, hullTop - tH);
    c.lineTo(tcx + half - taper, hullTop - tH);
    c.lineTo(tcx + half, hullTop);
    c.closePath();
    c.fill();
  }
  if (p.cupola) c.fillRect(tcx - half * 0.55, hullTop - tH - 1.8, half * 0.55, 1.8);
  // gun from the turret front, with mantlet block + optional muzzle brake
  const gy = hullTop - tH * (p.gunUp ?? 0.55);
  const gth = Math.max(1.2, (p.gunTh ?? 0.22) * s * 2.2);
  const tipX = x0 + p.L * s;
  c.fillRect(tcx + half - 3.5, gy - gth * 1.3, 4.5, gth * 2.6); // mantlet
  c.fillRect(tcx + half, gy - gth / 2, tipX - (tcx + half), gth);
  if (p.brake) c.fillRect(tipX - 3.2, gy - gth * 1.1, 3.2, gth * 2.2);
  if (p.sponson) { // M3 Lee hull sponson gun
    c.fillRect(x0 + hullL - 2, hullTop + (beltY - hullTop) * 0.45 - 1, (p.L - p.HL) * s * 0.55 + 2, 2);
  }
}

// per-vehicle proportion table (side-profile caricatures of the real tanks)
const GHOSTS = {
  // --- USA ---
  t1c: { L: 4.6, HL: 4.4, H: 2.7, hullH: 1.6, wheels: 4, wheelR: 0.26, tPos: 0.5, tLen: 1.5, tH: 0.9, cupola: true, gunLen: 1, gunTh: 0.14 },
  m2: { L: 4.8, HL: 4.4, H: 2.6, hullH: 1.55, wheels: 4, wheelR: 0.30, tPos: 0.52, tLen: 1.6, tH: 0.85, gunTh: 0.14 },
  m3stuart: { L: 5.0, HL: 4.5, H: 2.5, hullH: 1.5, wheels: 4, wheelR: 0.31, tPos: 0.5, tLen: 1.7, tH: 0.9, taper: 0.32, gunTh: 0.16 },
  m3lee: { L: 6.4, HL: 5.6, H: 3.1, hullH: 2.2, wheels: 6, wheelR: 0.3, tPos: 0.58, tLen: 1.9, tH: 0.85, cupola: true, sponson: true, gunTh: 0.16 },
  m4: { L: 7.0, HL: 5.9, H: 2.9, hullH: 2.0, wheels: 6, wheelR: 0.3, glacis: 0.8, tPos: 0.58, tLen: 2.2, tH: 0.95, dome: true, gunTh: 0.2 },
  t29: { L: 10.4, HL: 7.6, H: 3.2, hullH: 1.9, wheels: 7, wheelR: 0.32, tPos: 0.55, tLen: 3.6, tH: 1.25, taper: 0.5, cupola: true, brake: true, gunTh: 0.26 },
  m103: { L: 11.3, HL: 7.4, H: 2.9, hullH: 1.7, wheels: 7, wheelR: 0.32, tPos: 0.55, tLen: 3.8, tH: 1.15, dome: true, brake: true, gunTh: 0.28 },
  m26: { L: 8.6, HL: 6.3, H: 2.8, hullH: 1.85, wheels: 6, wheelR: 0.33, tPos: 0.6, tLen: 2.6, tH: 1.0, taper: 0.4, brake: true, gunTh: 0.22 },
  m60: { L: 9.4, HL: 6.9, H: 2.6, hullH: 1.6, wheels: 6, wheelR: 0.34, glacis: 1.1, tPos: 0.55, tLen: 3.2, tH: 1.1, dome: true, gunTh: 0.24 },
  m10: { L: 6.8, HL: 5.9, H: 2.5, hullH: 1.7, wheels: 5, wheelR: 0.31, glacis: 0.9, tPos: 0.55, tLen: 2.4, tH: 0.75, taper: 0.5, gunTh: 0.19 },
  hellcat: { L: 6.7, HL: 5.4, H: 2.3, hullH: 1.5, wheels: 5, wheelR: 0.31, glacis: 0.8, tPos: 0.55, tLen: 2.3, tH: 0.7, taper: 0.45, gunTh: 0.19 },
  m36: { L: 7.5, HL: 5.9, H: 2.5, hullH: 1.7, wheels: 5, wheelR: 0.31, glacis: 0.9, tPos: 0.55, tLen: 2.5, tH: 0.8, taper: 0.45, brake: true, gunTh: 0.21 },
  // --- Germany ---
  ltraktor: { L: 4.4, HL: 4.2, H: 2.6, hullH: 1.7, wheels: 4, wheelR: 0.24, tPos: 0.3, tLen: 1.4, tH: 0.85, gunTh: 0.13 },
  pz2: { L: 4.9, HL: 4.6, H: 2.2, hullH: 1.4, wheels: 5, wheelR: 0.26, tPos: 0.55, tLen: 1.5, tH: 0.8, gunTh: 0.13 },
  pz38t: { L: 4.8, HL: 4.5, H: 2.4, hullH: 1.5, wheels: 4, wheelR: 0.32, tPos: 0.52, tLen: 1.6, tH: 0.85, cupola: true, gunTh: 0.15 },
  pz3: { L: 6.3, HL: 5.5, H: 2.5, hullH: 1.6, wheels: 6, wheelR: 0.28, tPos: 0.55, tLen: 2.0, tH: 0.9, cupola: true, gunTh: 0.17 },
  pz4: { L: 7.0, HL: 5.9, H: 2.7, hullH: 1.7, wheels: 8, wheelR: 0.24, tPos: 0.56, tLen: 2.2, tH: 0.95, cupola: true, brake: true, gunTh: 0.18 },
  vk3601: { L: 8.0, HL: 6.2, H: 2.7, hullH: 1.75, wheels: 7, wheelR: 0.34, glacis: 0.3, tPos: 0.55, tLen: 2.5, tH: 0.95, taper: 0.2, cupola: true, brake: true, gunTh: 0.2 },
  tiger2: { L: 10.3, HL: 7.4, H: 3.0, hullH: 1.85, wheels: 8, wheelR: 0.34, glacis: 1.3, tPos: 0.56, tLen: 3.1, tH: 1.1, taper: 0.55, brake: true, gunTh: 0.23 },
  maus: { L: 10.1, HL: 9.0, H: 3.6, hullH: 2.4, skirt: true, glacis: 1.2, tPos: 0.42, tLen: 3.6, tH: 1.2, taper: 0.5, cupola: true, gunTh: 0.3 },
  leo1: { L: 9.5, HL: 7.1, H: 2.6, hullH: 1.55, wheels: 7, wheelR: 0.33, glacis: 1.3, tPos: 0.55, tLen: 2.9, tH: 0.95, dome: true, gunTh: 0.2 },
  stug: { L: 6.8, HL: 5.9, H: 2.15, hullH: 1.45, wheels: 6, wheelR: 0.28, td: true, caseH: 0.7, caseX0: 0.06, caseX1: 0.8, caseFront: 0.3, brake: true, gunTh: 0.18 },
  jagdpanther: { L: 9.9, HL: 6.9, H: 2.7, hullH: 1.6, wheels: 8, wheelR: 0.34, td: true, caseH: 1.1, caseX0: 0.05, caseX1: 0.9, caseFront: 0.38, caseRear: 0.2, gunUp: 0.55, brake: true, gunTh: 0.22 },
  jagdtiger: { L: 10.7, HL: 7.4, H: 3.1, hullH: 1.85, wheels: 8, wheelR: 0.34, td: true, caseH: 1.25, caseX0: 0.2, caseX1: 0.82, caseFront: 0.2, caseRear: 0.14, gunUp: 0.5, brake: true, gunTh: 0.26 },
  // --- USSR ---
  ms1: { L: 4.0, HL: 3.5, H: 2.6, hullH: 1.6, wheels: 4, wheelR: 0.24, tPos: 0.42, tLen: 1.3, tH: 0.9, gunTh: 0.13 },
  t26: { L: 4.9, HL: 4.6, H: 2.4, hullH: 1.5, wheels: 4, wheelR: 0.28, tPos: 0.5, tLen: 1.6, tH: 0.9, gunTh: 0.15 },
  bt7: { L: 5.7, HL: 5.6, H: 2.4, hullH: 1.5, wheels: 4, wheelR: 0.42, glacis: 1.0, tPos: 0.52, tLen: 1.8, tH: 0.85, taper: 0.4, gunTh: 0.15 },
  t28: { L: 7.4, HL: 7.2, H: 2.9, hullH: 1.9, wheels: 6, wheelR: 0.28, tPos: 0.68, tLen: 2.3, tH: 1.0, cupola: true, gunTh: 0.17 },
  t34: { L: 6.7, HL: 6.1, H: 2.5, hullH: 1.6, wheels: 5, wheelR: 0.4, glacis: 1.5, tPos: 0.62, tLen: 2.2, tH: 0.85, dome: true, gunTh: 0.19 },
  kv1: { L: 6.9, HL: 6.7, H: 2.8, hullH: 1.9, wheels: 6, wheelR: 0.3, tPos: 0.52, tLen: 2.3, tH: 1.0, cupola: true, gunTh: 0.19 },
  is3: { L: 9.9, HL: 6.8, H: 2.5, hullH: 1.6, wheels: 6, wheelR: 0.32, glacis: 1.4, tPos: 0.6, tLen: 3.0, tH: 0.95, dome: true, brake: true, gunTh: 0.26 },
  t72: { L: 9.2, HL: 6.6, H: 2.3, hullH: 1.5, wheels: 6, wheelR: 0.36, glacis: 1.4, tPos: 0.55, tLen: 2.6, tH: 0.8, dome: true, gunTh: 0.24 },
  su76: { L: 5.2, HL: 4.9, H: 2.2, hullH: 1.4, wheels: 5, wheelR: 0.28, td: true, caseH: 0.75, caseX0: 0.3, caseX1: 0.95, caseFront: 0.15, caseRear: 0.25, gunTh: 0.16 },
  su85: { L: 8.2, HL: 6.1, H: 2.45, hullH: 1.55, wheels: 5, wheelR: 0.4, td: true, caseH: 0.85, caseX0: 0.04, caseX1: 0.78, caseFront: 0.34, caseRear: 0.22, gunTh: 0.19 },
  isu152: { L: 9.0, HL: 6.8, H: 2.9, hullH: 1.75, wheels: 6, wheelR: 0.33, td: true, caseH: 1.15, caseX0: 0.06, caseX1: 0.82, caseFront: 0.24, caseRear: 0.16, gunUp: 0.45, brake: true, gunTh: 0.34 },
};

// class fallbacks for any ghost without a table entry
const GHOST_DEFAULT = {
  light: { L: 5.0, HL: 4.6, H: 2.4, hullH: 1.5, wheels: 4, wheelR: 0.3, tPos: 0.52, tLen: 1.7, tH: 0.85, gunTh: 0.15 },
  medium: { L: 7.6, HL: 6.2, H: 2.7, hullH: 1.75, wheels: 6, wheelR: 0.31, tPos: 0.57, tLen: 2.4, tH: 0.95, gunTh: 0.2 },
  heavy: { L: 9.4, HL: 7.0, H: 3.0, hullH: 1.9, wheels: 7, wheelR: 0.33, tPos: 0.55, tLen: 3.0, tH: 1.1, cupola: true, brake: true, gunTh: 0.24 },
  mbt: { L: 9.6, HL: 7.0, H: 2.5, hullH: 1.55, wheels: 6, wheelR: 0.34, glacis: 1.2, tPos: 0.55, tLen: 3.0, tH: 1.0, dome: true, gunTh: 0.23 },
  td: { L: 8.8, HL: 6.4, H: 2.4, hullH: 1.55, wheels: 6, wheelR: 0.32, td: true, caseH: 0.95, brake: true, gunTh: 0.22 },
};

/**
 * Create the tech tree screen. Appends its root to document.body (hidden).
 * @param {{specs:TankSpec[],bus:{emit:Function},onPick:Function,onClose:Function}} opts
 *   onPick(specId) fires when an unlocked (real) tank node is clicked;
 *   onClose() fires when the screen is dismissed.
 * @returns {{root:HTMLElement,isOpen:boolean,show:Function,hide:Function,setNation:Function}}
 */
export function createTechTree(opts) {
  const { specs, bus, onPick, onClose } = opts;
  ensureFonts();
  ensureStyle('cot-tt-style', TT_CSS);

  const specById = new Map();
  for (const s of specs || []) specById.set(s.id, s);

  // COMMUNITY TANKS: sourced, permissively-licensed vehicles get their own
  // tab, built from the shipped specs (spec.community = author/source/license
  // — the on-card credit satisfies CC-BY attribution alongside
  // docs/ATTRIBUTION.md).
  const COMM_TIER = {
    leichttraktor: 1, pziii_konserwa: 3, newc_pziii: 4, t34_85_cad: 6,
    newc_tiger: 7, is3: 8, recon_tank: 8, q_heavy: 9, strv103: 9,
    // wave 2 (print-model crawl)
    kv2: 6, sherman_jumbo: 6, tiger2: 8, sturmtiger: 8,
    jagdtiger: 9, t30: 9, t95: 9, jpz_e100: 10,
    // wave 3 (IS-series hunt)
    is1: 5, is6b: 8, is7: 10, object279: 10,
  };
  // Variant vehicles (spec.variantOf — CC-BY derivatives of nation-roster
  // bases like the M1A1/TUSK/T-90A) live on their NATION tabs; the community
  // tab curates the sourced third-party pool only. Their credit line still
  // renders on the nation-tab node via spec.community.
  const commSpecs = (specs || []).filter((sp) => sp.community && !sp.variantOf);
  const tabs = TABS.slice();
  if (commSpecs.length) {
    tabs.push({
      id: 'community', label: 'Community', flags: [['Community', 'modern']],
      nodes: commSpecs.map((sp) => ({
        ...n(`c_${sp.id}`, sp.name, COMM_TIER[sp.id] || 5, sp.class === 'mbt' ? 'mbt' : sp.class,
          sp.era, { spec: sp.id }),
        credit: sp.community,
      })),
    });
  }
  const emit = (ev, p) => { if (bus && bus.emit) bus.emit(ev, p); };

  const root = document.createElement('div');
  root.className = 'cot-tt';
  root.innerHTML =
    `<div class="cot-tt-hdr">` +
    `<div class="ttl">TECH <b>TREE</b></div>` +
    `<div class="cot-tt-tabs"></div>` +
    `<div class="cot-tt-wallet">` +
    `<span class="w xp">Experience<b class="wxp">0 XP</b></span>` +
    `<span class="w cr">Credits<b class="wcr">0</b></span>` +
    `</div>` +
    `<button class="cot-tt-close" type="button">&larr;&nbsp; Garage</button>` +
    `</div>` +
    `<div class="cot-tt-view">` +
    `<div class="cot-tt-world"></div>` +
    `<div class="cot-tt-hint">drag to pan &middot; scroll to zoom &middot; <b>gold nodes</b> are battle-ready &middot; research grey silhouettes with XP earned in battle</div>` +
    `</div>`;
  document.body.appendChild(root);

  const tabsEl = root.querySelector('.cot-tt-tabs');
  const view = root.querySelector('.cot-tt-view');
  const world = root.querySelector('.cot-tt-world');
  const wxpEl = root.querySelector('.wxp');
  const wcrEl = root.querySelector('.wcr');

  function refreshWallet() {
    const w = getWallet();
    wxpEl.textContent = `${fmt(w.xp)} XP`;
    wcrEl.textContent = fmt(w.credits);
  }
  refreshWallet();

  // Battle tally → payout. Battle entity ids ARE spec ids (state.spawnTanks)
  // and the garage announces the player's spec id on 'ui:battleStart', so the
  // whole earning loop rides the existing bus with no sim-side changes.
  let battleTally = null;
  if (bus && bus.on) {
    bus.on('ui:battleStart', (ev) => {
      battleTally = { playerId: ev && ev.specId, kills: 0, damage: 0 };
    });
    bus.on('shell:hit', (ev) => {
      if (battleTally && ev && ev.attackerId === battleTally.playerId &&
          ev.targetId && ev.targetId !== battleTally.playerId) {
        battleTally.damage += ev.damage || 0;
      }
    });
    bus.on('tank:destroyed', (ev) => {
      if (battleTally && ev && ev.killerId === battleTally.playerId &&
          ev.id !== battleTally.playerId) battleTally.kills += 1;
    });
    bus.on('battle:ended', (ev) => {
      if (!battleTally) return;
      recordBattleResult({
        result: (ev && ev.result) || 'defeat',
        kills: battleTally.kills,
        damage: battleTally.damage,
      });
      battleTally = null;
      refreshWallet();
    });
  }

  let nationId = 'usa';
  let bounds = { w: 1000, h: 600 };
  // bbox of the active nation's actual nodes (+ lane labels), for fit-to-content
  let content = { x0: 0, y0: 0, x1: 1000, y1: 600 };

  // --- pan/zoom state (current eased toward target each frame) ---
  const cam = { x: 0, y: 0, s: 1 };
  const tgt = { x: 0, y: 0, s: 1 };
  let rafId = 0;

  function applyCam() {
    world.style.transform = `translate(${cam.x.toFixed(2)}px,${cam.y.toFixed(2)}px) scale(${cam.s.toFixed(4)})`;
  }

  function frame() {
    rafId = api.isOpen ? requestAnimationFrame(frame) : 0;
    const k = 0.22;
    cam.x += (tgt.x - cam.x) * k;
    cam.y += (tgt.y - cam.y) * k;
    cam.s += (tgt.s - cam.s) * k;
    if (Math.abs(tgt.x - cam.x) < 0.05) cam.x = tgt.x;
    if (Math.abs(tgt.y - cam.y) < 0.05) cam.y = tgt.y;
    if (Math.abs(tgt.s - cam.s) < 0.0005) cam.s = tgt.s;
    applyCam();
  }

  function snapCam() { cam.x = tgt.x; cam.y = tgt.y; cam.s = tgt.s; applyCam(); }

  // Fit-and-center the ACTIVE nation's node bounding box (not the full 10-tier
  // canvas): sparse rosters fill the screen instead of floating in dead space.
  function fitCam() {
    const vw = view.clientWidth || window.innerWidth;
    const vh = view.clientHeight || (window.innerHeight - 70);
    const cw = content.x1 - content.x0, ch = content.y1 - content.y0;
    const s = Math.max(MIN_ZOOM, Math.min(MAX_FIT_ZOOM,
      (vw - 36) / cw, (vh - 36) / ch));
    tgt.s = s;
    tgt.x = (vw - cw * s) / 2 - content.x0 * s;
    tgt.y = (vh - ch * s) / 2 - content.y0 * s;
    snapCam();
  }

  // --- tree build ---
  // A node is "lit" when it can anchor further research: battle-ready (spec
  // ships) or already researched with XP.
  const isLit = (nd) => (nd.specId && specById.has(nd.specId)) ||
    !!loadProgress().researched[nd.key];
  // Ghost research state: researched | available (a parent is lit, or a root)
  // | locked (deeper down the line).
  function ghostState(node, byKey) {
    if (loadProgress().researched[node.key]) return 'researched';
    if (!node.from.length) return 'available';
    for (const fk of node.from) {
      const par = byKey.get(fk);
      if (par && isLit(par)) return 'available';
    }
    return 'locked';
  }

  function buildTree(tab) {
    world.innerHTML = '';
    const isComm = tab.id === 'community';
    const byKey = new Map();
    let maxRow = 0, minRow = 3, minTier = 10, maxTier = 1;
    for (const node of tab.nodes) {
      byKey.set(node.key, node);
      maxRow = Math.max(maxRow, node.row);
      minRow = Math.min(minRow, node.row);
      minTier = Math.min(minTier, node.tier);
      maxTier = Math.max(maxTier, node.tier);
    }
    // COMMUNITY layout compaction: the 9-tank roster spread over the full
    // tier grid left dead columns (II/V/VII) and a large dead zone — collapse
    // to only the OCCUPIED tiers; each card keeps its true tier badge.
    const tiersUsed = isComm
      ? [...new Set(tab.nodes.map((nd) => nd.tier))].sort((x, y) => x - y)
      : null;
    const colOfTier = isComm ? new Map(tiersUsed.map((tv, ci) => [tv, ci])) : null;
    const colOf = (nd) => (isComm ? colOfTier.get(nd.tier) : nd.tier - 1);
    const minCol = isComm ? 0 : minTier - 1;
    // Collision-safe placement (modern expansion): two nodes sharing a
    // (lane,tier) cell — e.g. two community heavies at the same tier — shift
    // right to the next free column instead of stacking on top of each other.
    // Each card keeps its true tier badge, so a shifted card stays honest.
    const colByKey = new Map();
    const cellTaken = new Set();
    let maxCol = isComm ? tiersUsed.length - 1 : maxTier - 1;
    for (const nd of tab.nodes) {
      let c = colOf(nd);
      while (cellTaken.has(`${nd.row}:${c}`)) c++;
      cellTaken.add(`${nd.row}:${c}`);
      colByKey.set(nd.key, c);
      if (c > maxCol) maxCol = c;
    }
    function nodePos(node) {
      return {
        x: PAD_X + colByKey.get(node.key) * TIER_W + (TIER_W - NODE_W) / 2,
        y: HEAD_H + node.row * ROW_H,
      };
    }
    bounds = {
      w: PAD_X * 2 + Math.max(10, maxCol + 1) * TIER_W,
      h: HEAD_H + maxRow * ROW_H + NODE_H + 60,
    };
    // r8: fit the camera to the OCCUPIED row band vertically (was y0:0 — the
    // fixed head zone above the first class row counted as content, so nation
    // tabs rendered their rows low with a dead band above the LIGHT lane).
    // The COMMUNITY credit cards run ~22 px taller than NODE_H; include them.
    const cardH = isComm ? NODE_H + 22 : NODE_H;
    content = {
      x0: PAD_X + minCol * TIER_W - 16,
      y0: HEAD_H + minRow * ROW_H - 24,
      x1: PAD_X + (maxCol + 1) * TIER_W + 16,
      y1: HEAD_H + maxRow * ROW_H + cardH + 24,
    };
    world.style.width = `${bounds.w}px`;
    world.style.height = `${bounds.h}px`;

    // connector wires under the nodes
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'wire');
    svg.setAttribute('width', bounds.w);
    svg.setAttribute('height', bounds.h);
    for (const node of tab.nodes) {
      const p2 = nodePos(node);
      for (const fk of node.from) {
        const parent = byKey.get(fk);
        if (!parent) continue;
        const p1 = nodePos(parent);
        const x1 = p1.x + NODE_W, y1 = p1.y + NODE_H / 2;
        const x2 = p2.x, y2 = p2.y + NODE_H / 2;
        const mx = (x1 + x2) / 2;
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', y1 === y2
          ? `M${x1} ${y1} L${x2} ${y2}`
          : `M${x1} ${y1} L${mx} ${y1} L${mx} ${y2} L${x2} ${y2}`);
        path.setAttribute('fill', 'none');
        // gold wire when BOTH ends are lit (battle-ready spec OR researched)
        const gold = isLit(node) && isLit(parent);
        path.setAttribute('stroke', gold ? 'rgba(240,160,48,.45)' : 'rgba(146,164,180,.30)');
        path.setAttribute('stroke-width', '2');
        svg.appendChild(path);
        // arrowhead at the child
        const tri = document.createElementNS(svgNS, 'path');
        tri.setAttribute('d', `M${x2 - 7} ${y2 - 4.5} L${x2} ${y2} L${x2 - 7} ${y2 + 4.5} Z`);
        tri.setAttribute('fill', gold ? 'rgba(240,160,48,.55)' : 'rgba(146,164,180,.4)');
        svg.appendChild(tri);
      }
    }
    world.appendChild(svg);

    // tier ladder headers — only over OCCUPIED tiers (and on the community
    // tab only over the COLLAPSED columns), so no header ever floats over an
    // empty stretch of blank grid
    const headerTiers = isComm ? tiersUsed : [];
    if (!isComm) for (let t = minTier; t <= maxTier; t++) headerTiers.push(t);
    for (const t of headerTiers) {
      const hd = document.createElement('div');
      hd.className = 'cot-tt-tierhd';
      const hc = isComm ? colOfTier.get(t) : t - 1;
      hd.style.left = `${PAD_X + hc * TIER_W + (TIER_W - NODE_W) / 2}px`;
      // r8: anchor the ladder just above the TOP OCCUPIED row instead of the
      // world's absolute top — with the row-band camera fit the old top:14px
      // strip drifted into the dead zone above the frame
      hd.style.top = `${HEAD_H + minRow * ROW_H - 56}px`;
      hd.innerHTML = `${ROMAN[t]}<i>tier</i>`;
      world.appendChild(hd);
    }

    // class-lane captions (light / medium·mbt / heavy / td rows).
    // r6: on the COMMUNITY tab the taller credit cards (140 px vs ROW_H 152)
    // reached below the -22 px caption line of the NEXT row and covered all
    // but the first letter ("...a lone 'M' behind the tier-I card") — lift
    // the captions clear of the tallest card and z-order them above nodes.
    const laneYOff = isComm ? 38 : 26;
    const usedRows = new Set(tab.nodes.map((nd) => nd.row));
    for (const r of usedRows) {
      const lb = document.createElement('div');
      lb.className = 'cot-tt-lane';
      lb.style.left = `${content.x0 + 16}px`;
      lb.style.top = `${HEAD_H + r * ROW_H - laneYOff}px`;
      lb.textContent = LANE_LABEL[r] || '';
      world.appendChild(lb);
    }

    // nodes
    for (const node of tab.nodes) {
      const real = !!node.specId;
      const spec = real ? specById.get(node.specId) : null;
      // CC-BY: credit rides the node on the COMMUNITY tab, and follows any
      // cross-linked community spec onto its nation tab (IS-3)
      const credit = node.credit || (spec && spec.community) || null;
      const st = real && spec ? 'ready' : ghostState(node, byKey);
      const cost = RESEARCH_COST[node.tier] || 0;
      const p = nodePos(node);
      const el = document.createElement('div');
      el.className = `cot-tt-node ${real && spec ? 'real' : `ghost ${st}`}` +
        `${credit ? ' comm' : ''}${st === 'available' && loadProgress().xp < cost ? ' poor' : ''}`;
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      const TAB_NATION = {
        usa: 'USA', germany: 'Germany', uk: 'UK', france: 'France',
        israel: 'Israel', china: 'China', korea: 'South Korea',
        japan: 'Japan', italy: 'Italy', community: 'Community',
      };
      const nation = spec ? spec.nation
        : (TAB_NATION[tab.id] || (node.era === 'ww2' ? 'USSR' : 'Russia'));
      const resLabel = st === 'researched' ? 'Researched'
        : st === 'available' ? `Research &middot; ${fmt(cost)} XP`
          : `Locked &middot; ${fmt(cost)} XP`;
      el.innerHTML =
        `<div class="top">${flagSVG(nation, node.era, 20, 13)}` +
        `<span class="tier">${ROMAN[node.tier]}</span></div>` +
        // battle-ready nodes show the real 3/4 hero icon of the shipped model;
        // ghost research placeholders keep the flat grey vector silhouette
        (real && spec ? `<img class="ti" data-cot-thumb="${spec.id}" src="${getTankThumb(spec.id) || iconUrl(spec.id, 'angle')}" alt="">` : `<canvas></canvas>`) +
        `<div class="nm"></div>` +
        `<div class="cls">${CLASS_LABEL[node.cls] || node.cls}</div>` +
        (credit ? `<div class="credit"></div>` : '') +
        (real && spec ? `<div class="ready"></div>`
          : `<div class="res">${resLabel}</div>` +
            (st === 'locked' ? `<span class="lock">&#128274;</span>` : ''));
      el.querySelector('.nm').textContent = node.name;
      if (credit) {
        const cr = el.querySelector('.credit');
        cr.innerHTML = 'by <b></b> &middot; <span></span>';
        cr.querySelector('b').textContent = credit.author;
        cr.querySelector('span').textContent = credit.license;
        cr.title = `${credit.author} — ${credit.license} — ${credit.source}`;
      }
      if (!(real && spec)) {
        drawGhostTank(el.querySelector('canvas'),
          GHOSTS[node.key] || GHOST_DEFAULT[node.cls] || GHOST_DEFAULT.medium,
          st === 'researched'
            ? { w: 118, h: 38, color: 'rgba(233,177,88,0.75)', gearColor: 'rgba(186,132,58,0.60)' }
            : { w: 118, h: 38 });
      }
      if (real && spec) {
        el.addEventListener('click', () => {
          if (dragMoved) return;
          emit('ui:click', {});
          api.hide();
          if (onPick) onPick(spec.id);
        });
      } else if (st === 'available') {
        // spend XP to research: node (and its outgoing wires) flip gold
        el.addEventListener('click', () => {
          if (dragMoved) return;
          const prog = loadProgress();
          if (prog.xp >= cost) {
            emit('ui:click', {});
            prog.xp -= cost;
            prog.researched[node.key] = true;
            saveProgress();
            buildTree(tab); // relight wires + downstream availability
            refreshWallet();
          } else {
            el.classList.remove('deny');
            void el.offsetWidth; // restart the shake animation
            el.classList.add('deny');
          }
        });
      }
      world.appendChild(el);
    }
  }

  // --- nation tabs ---
  const tabEls = new Map();
  for (const tab of tabs) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cot-tt-tab';
    b.innerHTML = tab.flags.map(([na, era]) => flagSVG(na, era, 21, 14)).join('') +
      `<span>${tab.label}</span>`;
    b.addEventListener('click', () => { emit('ui:click', {}); api.setNation(tab.id); });
    tabsEl.appendChild(b);
    tabEls.set(tab.id, b);
  }

  root.querySelector('.cot-tt-close').addEventListener('click', () => {
    emit('ui:click', {});
    api.hide();
    if (onClose) onClose();
  });

  // --- pan / zoom input ---
  let dragging = false;
  let dragMoved = false;
  let px = 0, py = 0;
  view.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    dragMoved = false;
    px = e.clientX; py = e.clientY;
    view.classList.add('panning');
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - px, dy = e.clientY - py;
    if (Math.abs(e.clientX - px) + Math.abs(e.clientY - py) > 0) {
      tgt.x += dx; tgt.y += dy;
      px = e.clientX; py = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragMoved = true;
    }
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    view.classList.remove('panning');
    if (e.pointerId != null && view.hasPointerCapture(e.pointerId)) view.releasePointerCapture(e.pointerId);
    // allow the click that ends this gesture to be suppressed, then reset
    setTimeout(() => { dragMoved = false; }, 0);
  };
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', endDrag);
  view.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = view.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const ns = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, tgt.s * (e.deltaY < 0 ? 1.16 : 1 / 1.16)));
    // anchor the zoom on the cursor
    const wx = (cx - tgt.x) / tgt.s, wy = (cy - tgt.y) / tgt.s;
    tgt.s = ns;
    tgt.x = cx - wx * ns;
    tgt.y = cy - wy * ns;
  }, { passive: false });

  function onKey(e) {
    if (!api.isOpen) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      api.hide();
      if (onClose) onClose();
    }
  }

  const api = {
    root,
    isOpen: false,

    /**
     * Open the tech tree.
     * @param {string} [nation='usa'] 'usa' | 'germany' | 'ussr'
     */
    show(nation = nationId) {
      root.classList.add('open');
      if (!api.isOpen) window.addEventListener('keydown', onKey, true);
      api.isOpen = true;
      refreshWallet();
      api.setNation(tabs.some((t) => t.id === nation) ? nation : 'usa');
      if (!rafId) rafId = requestAnimationFrame(frame);
    },

    /** Close the tech tree screen. */
    hide() {
      root.classList.remove('open');
      if (api.isOpen) window.removeEventListener('keydown', onKey, true);
      api.isOpen = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    },

    /** Switch nation tab (rebuilds the ladder, refits the camera). */
    setNation(id) {
      nationId = id;
      for (const [tid, el] of tabEls) el.classList.toggle('sel', tid === id);
      buildTree(tabs.find((t) => t.id === id));
      fitCam();
    },
  };

  return api;
}
