/**
 * The proving ground's range card (owner 2026-10-17: "build out all the options": proving ground / test drive; the owner's
 * UI rules: Chakra Petch and IBM Plex, less text, more showing). Copyright © 2026 Kevin B. Liu. The HUD loads it lazily the
 * first time a frame carries the range (hud.ts updateRangeCard), so no other battle downloads it.
 *
 *  - the last shot: its verdict in the shot card's own words and colour (ui/hitEventFormat.ts), a gauge of the round's
 *    penetration roll against the armour it met (the tick), the figures, the range and the angle;
 *  - the lanes: each lane's range, its hull and the angle it presents (a hull seen from above, turned as it stands), and
 *    the loaded round's expected verdict laid on its centre of mass (sim/provingGround.ts provingShellCard); the lane the
 *    gun is laid on is lit;
 *  - the controls: reset the range, moving targets, back to the Garage; their keys on a keyboard, the buttons on a phone.
 *
 * It renders only when its inputs change (the range record, the loaded slot, the laid lane, the switch, the last shot,
 * the key labels), so a steady frame does no DOM or string work.
 */
import { createElement, ensureStyle } from './dom.ts';
import { t } from './i18n.ts';
import { uiIconSVG } from './uiIcons.ts';
import { hitOutcomeFor, nominalPenFor } from './hitEventFormat.ts';
import { PROVING_DISPLAY, PROVING_MONO, loadProvingType } from './provingType.ts';

/** The range as the HUD receives it (sim/matchModes.ts ProvingRangePresentation, structurally). */
export interface RangeCardState {
  readonly moving: boolean;
  readonly lanes: ReadonlyArray<{
    readonly index: number;
    readonly rangeM: number;
    readonly presentDeg: number;
    readonly x: number;
    readonly z: number;
    readonly targetId: string;
    readonly targetName: string;
    readonly shells: ReadonlyArray<{
      readonly penMm: number;
      readonly ratio: number;
      readonly outcome: 'pen' | 'marginal' | 'nopen';
    }>;
  }>;
  readonly lastShot: {
    readonly serial: number;
    readonly kind: string;
    readonly targetId: string;
    readonly targetName: string;
    readonly shellName: string;
    readonly shellType: string;
    readonly attackerSpecId: string;
    readonly rangeM: number;
    readonly penRollMm: number;
    readonly effectiveMm: number;
    readonly impactAngleDeg: number;
    readonly damage: number;
  } | null;
}

interface RangeCardInput {
  readonly range: RangeCardState | null | undefined;
  /** The loaded shell slot and its name (the HUD's own shell rail names it). */
  readonly shellSlot: number;
  readonly shellName: string;
  /** The hull the gun is laid on (the aim's gun target), or null; the range the gun is laid at (m), or null. */
  readonly laidTargetId: string | null;
  readonly laidRangeM: number | null;
  readonly resetKey: string;
  readonly movingKey: string;
}

interface ProvingRangeCard {
  readonly root: HTMLElement;
  update(input: RangeCardInput): void;
  hide(): void;
}

const AMBER = '#f0a030';
/** A last shot older than this steps back (ms). */
const STALE_SHOT_MS = 6000;
const CSS = `
.cot-range-card{position:absolute;z-index:var(--hud-layer-controls,30);left:12px;
  top:calc(var(--hud-left-top,120px) + var(--hud-toast-height,0px) + 8px);
  width:min(288px,var(--hud-side-width,288px));max-height:calc(var(--hud-left-height,60vh) - var(--hud-toast-height,0px) - 8px);
  overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;display:none;flex-direction:column;gap:6px;
  padding:9px 10px 10px;color:#e8f0f5;background:linear-gradient(180deg,rgba(10,15,19,.95),rgba(7,11,14,.93));
  border:1px solid rgba(176,194,208,.2);border-top:2px solid ${AMBER};box-shadow:0 8px 22px rgba(0,0,0,.4);
  font:600 11px ${PROVING_DISPLAY};pointer-events:auto;}
.cot-range-card.show{display:flex}
.cot-range-card .rc-head{display:flex;align-items:center;gap:8px}
.cot-range-card .rc-head .mi,.cot-range-card .rc-head .mi svg{display:block;width:18px;height:18px;color:${AMBER}}
.cot-range-card .rc-round{font:700 13px ${PROVING_DISPLAY};letter-spacing:.02em;color:#fff1d6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cot-range-card .rc-rng{margin-left:auto;display:flex;align-items:center;gap:5px;font:500 15px ${PROVING_MONO};color:#e8f0f5;
  font-variant-numeric:tabular-nums;white-space:nowrap}
.cot-range-card .rc-rng svg{width:14px;height:14px;color:#7f909c}
.cot-range-card .rc-rng small{font-size:11px;color:#7f909c;margin-left:-3px}
.cot-range-card .rc-shot{display:none;flex-direction:column;gap:4px;padding:7px 8px 8px;background:rgba(255,255,255,.035);
  border-left:3px solid var(--rc-tone,#9aa7b0)}
.cot-range-card .rc-shot.on{display:flex}
/* a last shot some seconds old steps back: it is history, not what the gun is laid on now */
.cot-range-card .rc-shot.stale{opacity:.5;transition:opacity .4s}
.cot-range-card .rc-verdict{display:flex;align-items:baseline;gap:8px}
.cot-range-card .rc-verdict b{font:700 19px ${PROVING_DISPLAY};letter-spacing:.04em;text-transform:uppercase;color:var(--rc-tone,#e8f0f5)}
.cot-range-card .rc-verdict .rc-at{margin-left:auto;font:500 12px ${PROVING_MONO};color:#c8d4dc;font-variant-numeric:tabular-nums;
  white-space:nowrap}
.cot-range-card .rc-gauge{position:relative;height:9px;background:rgba(255,255,255,.08)}
.cot-range-card .rc-gauge i{position:absolute;left:0;top:0;bottom:0;background:var(--rc-tone,#9aa7b0);opacity:.85}
.cot-range-card .rc-gauge s{position:absolute;top:-3px;bottom:-3px;width:3px;margin-left:-1.5px;background:#f4f7f9;
  box-shadow:0 0 0 1px rgba(0,0,0,.55)}
.cot-range-card .rc-figs{display:flex;align-items:center;gap:10px;font:500 12px ${PROVING_MONO};color:#e8f0f5;
  font-variant-numeric:tabular-nums}
.cot-range-card .rc-figs .rc-pen,.cot-range-card .rc-figs .rc-eff{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
.cot-range-card .rc-figs svg{width:13px;height:13px;flex:0 0 auto}
.cot-range-card .rc-figs .rc-pen svg{color:var(--rc-tone,#9aa7b0)}
.cot-range-card .rc-figs .rc-pen small{font:500 10px ${PROVING_MONO};color:#7f909c;margin-left:2px}
.cot-range-card .rc-figs .rc-eff svg{color:#c8d4dc}
.cot-range-card .rc-shot.glance .rc-eff,.cot-range-card .rc-shot.glance .rc-gauge s{display:none}
.cot-range-card .rc-tgt{font:600 11px ${PROVING_DISPLAY};color:#9fb0bb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cot-range-card .rc-tgt:empty{display:none}
.cot-range-card .rc-lanes{display:flex;flex-direction:column;gap:1px}
.cot-range-card .rc-lane{display:grid;grid-template-columns:44px 20px minmax(0,1fr) auto;gap:6px;align-items:center;
  padding:3px 5px;border-left:2px solid transparent}
.cot-range-card .rc-lane.laid{background:rgba(240,160,48,.13);border-left-color:${AMBER}}
.cot-range-card .rc-r{font:500 12px ${PROVING_MONO};color:#e2ebf2;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.cot-range-card .rc-r small{font-size:10px;color:#7f909c;margin-left:1px}
.cot-range-card .rc-a svg{display:block;width:20px;height:20px}
.cot-range-card .rc-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#c8d4dc}
.cot-range-card .rc-o{font:700 10px ${PROVING_DISPLAY};letter-spacing:.06em;text-transform:uppercase;padding:1px 6px;
  border:1px solid currentColor;white-space:nowrap}
.cot-range-card .rc-o.pen{color:#7ee87e}.cot-range-card .rc-o.marginal{color:#f3a536}.cot-range-card .rc-o.nopen{color:#f05a5a}
.cot-range-card .rc-foot{display:grid;grid-template-columns:1fr 1fr 40px;gap:5px}
.cot-range-card .rc-foot button{min-height:32px;display:flex;align-items:center;justify-content:center;gap:6px;padding:4px 6px;
  color:#e8f0f5;background:rgba(126,148,164,.12);border:1px solid rgba(176,194,208,.26);
  font:700 11px ${PROVING_DISPLAY};letter-spacing:.06em;text-transform:uppercase;cursor:pointer;touch-action:manipulation}
.cot-range-card .rc-foot button:hover{border-color:rgba(240,160,48,.6)}
.cot-range-card .rc-foot button[aria-pressed='true']{color:#fff1d6;border-color:${AMBER};background:rgba(240,160,48,.18)}
.cot-range-card .rc-foot button svg{width:15px;height:15px;flex:0 0 auto}
.cot-range-card .rc-foot kbd{font:500 10px ${PROVING_MONO};color:${AMBER};border:1px solid rgba(240,160,48,.45);padding:0 4px}
/* a phone: one row (the range, then the three controls as icons) and the last shot under it; the left lane is short there,
   so the card never scrolls or clips its controls */
body.cot-touch-layout .cot-range-card{width:min(236px,var(--hud-side-width,236px));max-height:none;overflow:visible;
  flex-direction:row;flex-wrap:wrap;align-items:center;padding:6px 7px;gap:5px}
body.cot-touch-layout .cot-range-card .rc-head{flex:1 1 auto;min-width:0}
body.cot-touch-layout .cot-range-card .rc-round,body.cot-touch-layout .cot-range-card .rc-lanes,
body.cot-touch-layout .cot-range-card .rc-foot kbd,body.cot-touch-layout .cot-range-card .rc-foot span{display:none}
body.cot-touch-layout .cot-range-card .rc-foot{display:flex;gap:4px}
body.cot-touch-layout .cot-range-card .rc-foot button{width:40px;min-height:40px;padding:0}
body.cot-touch-layout .cot-range-card .rc-foot button svg{width:18px;height:18px}
/* the last shot at the top right under the screen's own buttons, one line: clear of the sight in the middle and of the
   round controls under the card */
body.cot-touch-layout .cot-range-card .rc-shot{position:fixed;left:auto;top:calc(env(safe-area-inset-top,0px) + 58px);
  right:calc(env(safe-area-inset-right,0px) + 12px);width:max-content;max-width:min(300px,36vw);flex-wrap:wrap;
  flex-direction:row;align-items:center;gap:8px;padding:6px 9px;background:rgba(7,11,14,.86);border:1px solid rgba(176,194,208,.2);
  border-left:3px solid var(--rc-tone,#9aa7b0)}
body.cot-touch-layout .cot-range-card .rc-shot .rc-gauge,body.cot-touch-layout .cot-range-card .rc-shot .rc-tgt,
body.cot-touch-layout .cot-range-card .rc-shot .rc-at,body.cot-touch-layout .cot-range-card .rc-shot .rc-pen small{display:none}
body.cot-touch-layout .cot-range-card .rc-verdict b{font-size:15px}
body.cot-touch-layout .cot-range-card .rc-verdict .rc-at{font-size:11px}
`;

/** A hull seen from above (its gun forward, toward the top), turned by the angle it presents to the firing line. */
function presentedGlyph(deg: number): string {
  return `<svg viewBox="-10 -10 20 20" aria-hidden="true"><g transform="rotate(${180 + deg})">` +
    `<rect x="-4.2" y="-7" width="8.4" height="14" rx="1.2" fill="none" stroke="#c8d4dc" stroke-width="1.4"/>` +
    `<circle cx="0" cy="0.6" r="2.6" fill="#c8d4dc"/><path d="M0 -1.6V-9.6" stroke="#c8d4dc" stroke-width="1.5"/></g>` +
    `<path d="M-9 9.2h18" stroke="${AMBER}" stroke-width="1.2" opacity=".7"/></svg>`;
}

/** The presented angle in words, for the glyph's title (screen readers and a hover). */
function presentedAngleLabel(deg: number): string {
  const angle = Math.round(Math.abs(deg));
  if (angle === 0) return t('hud.range.noseOn');
  if (angle === 90) return t('hud.range.broadside');
  return t('hud.range.angle', { value: String(angle) });
}

export function createProvingRangeCard(parent: HTMLElement, emit: (type: string) => void): ProvingRangeCard {
  ensureStyle('cot-range-card-style', CSS);
  void loadProvingType();
  const root = createElement('section', 'cot-range-card', parent);
  root.setAttribute('aria-label', t('hud.range.title'));
  root.innerHTML = `<div class="rc-head"><span class="mi">${uiIconSVG('modeProving', 18)}</span><span class="rc-round"></span>` +
    `<span class="rc-rng" title="${t('hud.range.laid')}">${uiIconSVG('statRange', 14)}<span></span><small>m</small></span></div>` +
    `<div class="rc-shot" aria-live="polite"><div class="rc-verdict"><b></b><span class="rc-at"></span></div>` +
    `<div class="rc-gauge"><i></i><s></s></div><div class="rc-figs">` +
    `<span class="rc-pen" title="${t('hud.range.penRoll')}">${uiIconSVG('penetration', 13)}<span></span><small></small></span>` +
    `<span class="rc-eff" title="${t('hud.range.armour')}">${uiIconSVG('shield', 13)}<span></span></span></div>` +
    `<div class="rc-tgt"></div></div>` +
    `<div class="rc-lanes" role="list"></div>` +
    `<div class="rc-foot"><button type="button" data-range-action="reset" title="${t('action.rangeReset')}">` +
    `${uiIconSVG('reload', 15)}<span>${t('hud.range.reset')}</span><kbd></kbd></button>` +
    `<button type="button" data-range-action="moving" aria-pressed="false" title="${t('action.rangeMoving')}">` +
    `${uiIconSVG('modeProving', 15)}<span>${t('hud.range.moving')}</span><kbd></kbd></button>` +
    `<button type="button" data-range-action="exit" title="${t('hud.range.exit')}" aria-label="${t('hud.range.exit')}">` +
    `${uiIconSVG('garage', 16)}</button></div>`;
  const roundEl = root.querySelector<HTMLElement>('.rc-round')!;
  const laidRangeEl = root.querySelector<HTMLElement>('.rc-rng span')!;
  const shotEl = root.querySelector<HTMLElement>('.rc-shot')!;
  const verdictEl = shotEl.querySelector<HTMLElement>('.rc-verdict b')!;
  const atEl = shotEl.querySelector<HTMLElement>('.rc-at')!;
  const barEl = shotEl.querySelector<HTMLElement>('.rc-gauge i')!;
  const tickEl = shotEl.querySelector<HTMLElement>('.rc-gauge s')!;
  const penEl = shotEl.querySelector<HTMLElement>('.rc-pen span')!;
  const avgEl = shotEl.querySelector<HTMLElement>('.rc-pen small')!;
  const effEl = shotEl.querySelector<HTMLElement>('.rc-eff span')!;
  const targetEl = shotEl.querySelector<HTMLElement>('.rc-tgt')!;
  const lanesEl = root.querySelector<HTMLElement>('.rc-lanes')!;
  const resetButton = root.querySelector<HTMLButtonElement>('[data-range-action="reset"]')!;
  const movingButton = root.querySelector<HTMLButtonElement>('[data-range-action="moving"]')!;
  const exitButton = root.querySelector<HTMLButtonElement>('[data-range-action="exit"]')!;
  const resetKeyEl = resetButton.querySelector('kbd')!;
  const movingKeyEl = movingButton.querySelector('kbd')!;
  resetButton.addEventListener('click', (event) => { event.stopPropagation(); emit('ui:rangeReset'); });
  movingButton.addEventListener('click', (event) => { event.stopPropagation(); emit('ui:rangeMoving'); });
  exitButton.addEventListener('click', (event) => { event.stopPropagation(); emit('ui:rangeExit'); });
  // touch: a tap on the card must not fall through to the battle's look/fire surface
  root.addEventListener('pointerdown', (event) => event.stopPropagation());

  let shown = false;
  let lastRange: RangeCardState | null = null;
  let lastSlot = -1;
  let lastShellName = '';
  let lastMoving: boolean | null = null;
  let lastLaid = -2;
  let lastSerial = -1;
  let shotAtMs = 0;
  let stale = false;
  let lastLaidRange = -2;
  let lastResetKey = '';
  let lastMovingKey = '';
  let rows: HTMLElement[] = [];

  const renderLanes = (range: RangeCardState, slot: number): void => {
    lanesEl.textContent = '';
    rows = range.lanes.map((lane) => {
      const card = lane.shells[Math.min(Math.max(0, slot), lane.shells.length - 1)];
      const outcome = card ? card.outcome : 'nopen';
      const row = createElement('div', 'rc-lane', lanesEl);
      row.setAttribute('role', 'listitem');
      row.innerHTML = `<span class="rc-r">${lane.rangeM}<small>m</small></span>` +
        `<span class="rc-a" title="${presentedAngleLabel(lane.presentDeg)}">${presentedGlyph(lane.presentDeg)}</span>` +
        `<span class="rc-t"></span><span class="rc-o ${outcome}">${t(`hud.range.outcome.${outcome}`)}</span>`;
      row.querySelector<HTMLElement>('.rc-t')!.textContent = lane.targetName || '—';
      return row;
    });
  };

  const renderShot = (range: RangeCardState, shot: NonNullable<RangeCardState['lastShot']>): void => {
    const verdict = hitOutcomeFor({ kind: shot.kind, damage: shot.damage });
    shotEl.style.setProperty('--rc-tone', verdict.color);
    verdictEl.textContent = verdict.label;
    atEl.textContent = `${Math.round(shot.rangeM)} m · ${Math.round(shot.impactAngleDeg)}°`;
    // a glance off the face tests no thickness: the roll and the angle say it (the verdict line carries the angle)
    const glance = shot.kind === 'ricochet';
    shotEl.classList.toggle('glance', glance);
    const pen = Math.max(0, shot.penRollMm), armour = glance ? 0 : Math.max(0, shot.effectiveMm);
    const scale = Math.max(pen, armour, 1) * 1.12;
    barEl.style.width = `${(pen / scale) * 100}%`;
    tickEl.style.left = `${(armour / scale) * 100}%`;
    penEl.textContent = `${Math.round(pen)} mm`;
    // the roll is one of a spread (within 25 % of the round's average at this range): the average beside it
    const average = nominalPenFor({ attackerSpecId: shot.attackerSpecId, shellName: shot.shellName, shellType: shot.shellType,
      flightDistM: shot.rangeM });
    avgEl.textContent = average > 0 ? t('hud.range.average', { value: String(average) }) : '';
    effEl.textContent = `${Math.round(armour)} mm`;
    // a lane's hull is named on its own line; a plate is its thickness and angle, already in the figures and the verdict
    targetEl.textContent = range.lanes.some((lane) => lane.targetId === shot.targetId) ? shot.targetName : '';
  };

  const hide = (): void => {
    if (!shown) return;
    shown = false;
    root.classList.remove('show');
    lastRange = null;
  };

  const update = (input: RangeCardInput): void => {
    const range = input.range;
    if (!range || !range.lanes.length) { hide(); return; }
    if (!shown) { shown = true; root.classList.add('show'); }
    if (range !== lastRange || input.shellSlot !== lastSlot) {
      renderLanes(range, input.shellSlot);
      lastRange = range;
      lastSlot = input.shellSlot;
      lastLaid = -2;
      lastSerial = -1;
    }
    if (input.shellName !== lastShellName) { roundEl.textContent = input.shellName; lastShellName = input.shellName; }
    // the rangefinder: the range the gun is laid at, to the metre (a dash with nothing under the sight)
    const laidRange = input.laidRangeM != null && Number.isFinite(input.laidRangeM) ? Math.round(input.laidRangeM) : -1;
    if (laidRange !== lastLaidRange) { laidRangeEl.textContent = laidRange >= 0 ? String(laidRange) : '—'; lastLaidRange = laidRange; }
    const serial = range.lastShot?.serial ?? 0;
    if (serial !== lastSerial) {
      lastSerial = serial;
      shotEl.classList.toggle('on', !!range.lastShot);
      if (range.lastShot) renderShot(range, range.lastShot);
      shotAtMs = performance.now();
      if (stale) { stale = false; shotEl.classList.remove('stale'); }
    } else if (!stale && range.lastShot && performance.now() - shotAtMs > STALE_SHOT_MS) {
      stale = true;
      shotEl.classList.add('stale');
    }
    if (range.moving !== lastMoving) {
      movingButton.setAttribute('aria-pressed', String(range.moving));
      lastMoving = range.moving;
    }
    let laid = -1;
    if (input.laidTargetId) {
      for (let i = 0; i < range.lanes.length; i++) if (range.lanes[i].targetId === input.laidTargetId) { laid = i; break; }
    }
    if (laid !== lastLaid) {
      for (let i = 0; i < rows.length; i++) rows[i].classList.toggle('laid', i === laid);
      lastLaid = laid;
    }
    if (input.resetKey !== lastResetKey) { resetKeyEl.textContent = input.resetKey; lastResetKey = input.resetKey; }
    if (input.movingKey !== lastMovingKey) { movingKeyEl.textContent = input.movingKey; lastMovingKey = input.movingKey; }
  };

  return { root, update, hide };
}
