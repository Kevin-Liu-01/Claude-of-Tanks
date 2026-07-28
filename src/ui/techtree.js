// src/ui/techtree.js — WoT-style research tree screen, reachable from the
// garage. Nation tabs (USA / Germany / USSR·Russia), tier I–X ladder with
// connecting lines, the 8 real roster tanks placed at sensible tiers as
// unlocked + clickable nodes (click -> select in garage), plus greyed
// silhouette placeholder nodes for flavor (clearly non-functional).
// Smooth pointer pan / wheel zoom. Switzer typography, procedural flags.

import { FONT_STACK, ensureFonts } from './fonts.js';
import { flagSVG } from './flags.js';
import { drawSilhouette } from './silhouette.js';
import { iconUrl } from './icons.js';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// pseudo-dims for placeholder silhouettes (real nodes use their real spec)
const DIMS = {
  light: { hullLengthM: 4.2, overallLengthM: 4.7, heightM: 2.2 },
  medium: { hullLengthM: 6.0, overallLengthM: 7.7, heightM: 2.6 },
  heavy: { hullLengthM: 6.6, overallLengthM: 8.7, heightM: 3.0 },
  mbt: { hullLengthM: 7.9, overallLengthM: 9.8, heightM: 2.4 },
};

const CLASS_LABEL = {
  light: 'Light tank', medium: 'Medium tank', heavy: 'Heavy tank', mbt: 'Main battle tank',
};

// n(key, name, tier, row, cls, era, opts) — opts: {spec:'realSpecId', from:[keys]}
function n(key, name, tier, row, cls, era, o = {}) {
  return { key, name, tier, row, cls, era, specId: o.spec || null, from: o.from || [] };
}

const TABS = [
  {
    id: 'usa', label: 'USA', flags: [['USA', 'modern']],
    nodes: [
      n('m2', 'M2 Light Tank', 2, 0, 'light', 'ww2'),
      n('m3lee', 'M3 Lee', 4, 0, 'medium', 'ww2', { from: ['m2'] }),
      n('m4', 'M4 Sherman', 5, 0, 'medium', 'ww2', { from: ['m3lee'] }),
      n('e8', 'M4A3E8 Sherman', 6, 0, 'medium', 'ww2', { spec: 'm4a3e8', from: ['m4'] }),
      n('t29', 'T29', 7, 1, 'heavy', 'ww2', { from: ['e8'] }),
      n('m103', 'M103', 9, 1, 'heavy', 'ww2', { from: ['t29'] }),
      n('m26', 'M26 Pershing', 8, 0, 'medium', 'ww2', { from: ['e8'] }),
      n('m60', 'M60 Patton', 9, 0, 'mbt', 'modern', { from: ['m26'] }),
      n('abrams', 'M1A2 Abrams SEPv3', 10, 0, 'mbt', 'modern', { spec: 'm1a2', from: ['m60'] }),
    ],
  },
  {
    id: 'germany', label: 'Germany', flags: [['Germany', 'ww2'], ['Germany', 'modern']],
    nodes: [
      n('pz2', 'Pz.Kpfw. II', 2, 0, 'light', 'ww2'),
      n('pz3', 'Pz.Kpfw. III', 4, 0, 'medium', 'ww2', { from: ['pz2'] }),
      n('pz4', 'Pz.Kpfw. IV Ausf. H', 5, 0, 'medium', 'ww2', { from: ['pz3'] }),
      n('panther', 'Panther Ausf. G', 7, 0, 'medium', 'ww2', { spec: 'panther_g', from: ['pz4'] }),
      n('tiger', 'Tiger I', 7, 1, 'heavy', 'ww2', { spec: 'tiger1', from: ['pz4'] }),
      n('tiger2', 'Tiger II', 8, 1, 'heavy', 'ww2', { from: ['tiger'] }),
      n('maus', 'Maus', 10, 1, 'heavy', 'ww2', { from: ['tiger2'] }),
      n('leo1', 'Leopard 1', 9, 0, 'mbt', 'modern', { from: ['panther'] }),
      n('leo2', 'Leopard 2A7', 10, 0, 'mbt', 'modern', { spec: 'leo2a7', from: ['leo1'] }),
    ],
  },
  {
    id: 'ussr', label: 'USSR · Russia', flags: [['USSR', 'ww2'], ['Russia', 'modern']],
    nodes: [
      n('t26', 'T-26', 2, 0, 'light', 'ww2'),
      n('bt7', 'BT-7', 3, 0, 'light', 'ww2', { from: ['t26'] }),
      n('t34', 'T-34', 5, 0, 'medium', 'ww2', { from: ['bt7'] }),
      n('t3485', 'T-34-85', 6, 0, 'medium', 'ww2', { spec: 't34_85', from: ['t34'] }),
      n('t54', 'T-54', 8, 0, 'medium', 'ww2', { from: ['t3485'] }),
      n('t72', 'T-72B', 9, 0, 'mbt', 'modern', { from: ['t54'] }),
      n('t90', 'T-90M Proryv', 10, 0, 'mbt', 'modern', { spec: 't90m', from: ['t72'] }),
      n('kv1', 'KV-1', 5, 1, 'heavy', 'ww2', { from: ['bt7'] }),
      n('is2', 'IS-2', 7, 1, 'heavy', 'ww2', { spec: 'is2', from: ['kv1'] }),
      n('is3', 'IS-3', 8, 1, 'heavy', 'ww2', { from: ['is2'] }),
    ],
  },
];

// ladder geometry (world px, pre-zoom)
const PAD_X = 60;
const HEAD_H = 76;
const TIER_W = 176;
const NODE_W = 150;
const NODE_H = 106;
const ROW_H = 168;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.75;

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
.cot-tt-hint{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);
  font-size:9.5px;font-weight:600;letter-spacing:.18em;color:rgba(138,151,163,.75);
  text-transform:uppercase;pointer-events:none;white-space:nowrap;}
.cot-tt-hint b{color:rgba(240,176,74,.9);font-weight:700;}
`;

function ensureStyle(id, css) {
  if (!document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id;
    s.textContent = css;
    document.head.appendChild(s);
  }
}

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
  const emit = (ev, p) => { if (bus && bus.emit) bus.emit(ev, p); };

  const root = document.createElement('div');
  root.className = 'cot-tt';
  root.innerHTML =
    `<div class="cot-tt-hdr">` +
    `<div class="ttl">TECH <b>TREE</b></div>` +
    `<div class="cot-tt-tabs"></div>` +
    `<button class="cot-tt-close" type="button">&larr;&nbsp; Garage</button>` +
    `</div>` +
    `<div class="cot-tt-view">` +
    `<div class="cot-tt-world"></div>` +
    `<div class="cot-tt-hint">drag to pan &middot; scroll to zoom &middot; <b>gold nodes</b> are battle-ready &middot; grey silhouettes are future research</div>` +
    `</div>`;
  document.body.appendChild(root);

  const tabsEl = root.querySelector('.cot-tt-tabs');
  const view = root.querySelector('.cot-tt-view');
  const world = root.querySelector('.cot-tt-world');

  let nationId = 'usa';
  let bounds = { w: 1000, h: 600 };

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

  function fitCam() {
    const vw = view.clientWidth || window.innerWidth;
    const vh = view.clientHeight || (window.innerHeight - 70);
    const s = Math.max(MIN_ZOOM, Math.min(1,
      (vw - 40) / bounds.w, (vh - 40) / bounds.h));
    tgt.s = s;
    tgt.x = (vw - bounds.w * s) / 2;
    tgt.y = Math.max(10, (vh - bounds.h * s) / 2);
    snapCam();
  }

  // --- tree build ---
  function nodePos(node) {
    return {
      x: PAD_X + (node.tier - 1) * TIER_W + (TIER_W - NODE_W) / 2,
      y: HEAD_H + node.row * ROW_H + (node.row > 0 ? 26 : 0),
    };
  }

  function buildTree(tab) {
    world.innerHTML = '';
    const byKey = new Map();
    let maxRow = 0;
    for (const node of tab.nodes) { byKey.set(node.key, node); maxRow = Math.max(maxRow, node.row); }
    bounds = {
      w: PAD_X * 2 + 10 * TIER_W,
      h: HEAD_H + maxRow * ROW_H + 26 + NODE_H + 60,
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
        const gold = node.specId && parent.specId;
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

    // tier ladder headers
    for (let t = 1; t <= 10; t++) {
      const hd = document.createElement('div');
      hd.className = 'cot-tt-tierhd';
      hd.style.left = `${PAD_X + (t - 1) * TIER_W + (TIER_W - NODE_W) / 2}px`;
      hd.innerHTML = `${ROMAN[t]}<i>tier</i>`;
      world.appendChild(hd);
    }

    // nodes
    for (const node of tab.nodes) {
      const real = !!node.specId;
      const spec = real ? specById.get(node.specId) : null;
      const p = nodePos(node);
      const el = document.createElement('div');
      el.className = `cot-tt-node ${real && spec ? 'real' : 'ghost'}`;
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      const nation = spec ? spec.nation : (tab.id === 'usa' ? 'USA' : tab.id === 'germany' ? 'Germany' : (node.era === 'ww2' ? 'USSR' : 'Russia'));
      el.innerHTML =
        `<div class="top">${flagSVG(nation, node.era, 20, 13)}` +
        `<span class="tier">${ROMAN[node.tier]}</span></div>` +
        // battle-ready nodes show the real 3/4 hero icon of the shipped model;
        // ghost research placeholders keep the flat grey vector silhouette
        (real && spec ? `<img class="ti" src="${iconUrl(spec.id, 'angle')}" alt="">` : `<canvas></canvas>`) +
        `<div class="nm"></div>` +
        `<div class="cls">${CLASS_LABEL[node.cls] || node.cls}</div>` +
        (real && spec ? `<div class="ready"></div>` : `<span class="lock">&#128274;</span>`);
      el.querySelector('.nm').textContent = node.name;
      if (!(real && spec)) {
        drawSilhouette(el.querySelector('canvas'),
          { dims: DIMS[node.cls] || DIMS.medium, era: node.era, class: node.cls === 'light' ? 'medium' : node.cls },
          { w: 118, h: 36, color: 'rgba(120,134,146,0.55)' });
      }
      if (real && spec) {
        el.addEventListener('click', () => {
          if (dragMoved) return;
          emit('ui:click', {});
          api.hide();
          if (onPick) onPick(spec.id);
        });
      }
      world.appendChild(el);
    }
  }

  // --- nation tabs ---
  const tabEls = new Map();
  for (const tab of TABS) {
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
      api.setNation(TABS.some((t) => t.id === nation) ? nation : 'usa');
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
      buildTree(TABS.find((t) => t.id === id));
      fitCam();
    },
  };

  return api;
}
