/**
 * airSupportHud.ts — Air Support's controls and warnings (air-support-270; owner 2026-11-05: "if you ativatee the thing it
 * goes in with a transition to an airstrike view where you can enter a special binocular view and theres a giant aiming
 * reticle on the ground respecting ground geometry and u cann call in 3 differennt kinnds of airstrikes", then "keep and add
 * artillery annd recon with the 3 airstrikes").
 *
 * - The strip, low in the middle on a desktop and above the fire button on a phone: the crew's support points, the
 *   binoculars (X) and the five call-ins (1-5: recon, artillery, strafing run, precision bomb, AC-130), each with its
 *   price, its key and its cooldown; a tile the crew cannot call now says why (points, cooldown, the side's air full).
 * - The strike view: the binoculars come up over the scope's camera (game/strikeViewState.ts; the camera rig enters the
 *   scope), a two-lens vignette with the range and bearing to the reticle, the call-in's name, price and warning, and on a
 *   phone a CALL button and a close button. The reticle itself is on the ground (engine/strikeMarks.ts).
 * - The warning: a strike whose footprint covers the crew raises a red INCOMING plate with its countdown (every strike's
 *   footprint is also on the minimap and the ground).
 * Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import type { EventBus } from '../game/stateCore.ts';
import { AIR_STRIKE_KINDS, AIR_SUPPORT_RULES as R, type AirStrikeKind } from '../sim/matchRuleset.ts';
import { strikeCovers, strikeDangerS, type AirSupportView } from '../sim/airSupport.ts';
import { strikeView, STRIKE_VIEW_TRANSITION_S } from '../game/strikeViewState.ts';
import { drawStrikeGlyph } from './objectiveGlyphs.ts';
import { t } from './i18n.ts';
import { setAttr, setData, setDisabled, setHidden, setStyle, setText } from './domWrite.ts';
import { prefersReducedMotion } from './accessibilityPreferences.ts';

interface Point { x: number; y: number; z: number }

function node<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.className = cls; parent.append(element); return element;
}

/** Why a call-in cannot be made now (null: it can). */
function blocker(air: AirSupportView, kind: AirStrikeKind, rangeM: number): 'points' | 'cooldown' | 'air' | 'range' | null {
  if ((air.points ?? 0) < R[kind].cost) return 'points';
  if ((air.cooldowns?.[kind] ?? 0) > 0) return 'cooldown';
  if (air.teamAirFull) return 'air';
  if (rangeM > R.callRangeM) return 'range';
  return null;
}

export function createAirSupportHud(parent: HTMLElement, bus: EventBus) {
  const strip = node('section', 'cot-strike-strip', parent);
  strip.hidden = true;
  strip.setAttribute('aria-label', t('airSupport.strip'));
  const points = node('div', 'strike-points', strip);
  points.setAttribute('role', 'status');
  const pointsValue = node('b', 'num', points);
  node('span', 'strike-points-unit', points).textContent = t('airSupport.points');
  const view = node('button', 'strike-view-button', strip);
  view.type = 'button';
  view.setAttribute('aria-label', t('airSupport.view'));
  view.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="14" r="4.5"/><circle cx="17" cy="14" r="4.5"/><path d="M9.5 10.5h5M5 9.6 7 5h3l1 4.2M19 9.6 17 5h-3l-1 4.2"/></svg>';
  const viewKey = node('kbd', 'strike-key', view);
  view.addEventListener('click', () => bus.emit('ui:strikeViewToggle', {}));
  const tiles = AIR_STRIKE_KINDS.map((kind, index) => {
    const button = node('button', 'strike-tile', strip);
    button.type = 'button';
    button.dataset.kind = kind;
    const glyph = node('canvas', 'strike-tile-glyph', button);
    glyph.width = glyph.height = 56;
    const context = glyph.getContext('2d');
    if (context) drawStrikeGlyph(context, 28, 28, 25, kind, 'own');
    const copy = node('span', 'strike-tile-copy', button);
    node('strong', 'strike-tile-name', copy).textContent = t(`airSupport.kind.${kind}`);
    const cost = node('small', 'strike-tile-cost num', copy);
    cost.textContent = String(R[kind].cost);
    const key = node('kbd', 'strike-key', button);
    key.textContent = String(index + 1);
    const status = node('small', 'strike-tile-status', button);
    button.addEventListener('click', () => {
      if (strikeView.open && strikeView.kind === kind) bus.emit('ui:strikeCall', {});
      else bus.emit('ui:strikePick', { kind });
    });
    return { kind, button, status };
  });

  // ---- the binoculars ----
  const binoculars = node('div', 'cot-binoculars', parent);
  binoculars.hidden = true;
  binoculars.setAttribute('role', 'dialog');
  binoculars.setAttribute('aria-label', t('airSupport.view'));
  node('div', 'binocular-lens', binoculars).setAttribute('aria-hidden', 'true');
  const scale = node('div', 'binocular-scale', binoculars);
  scale.setAttribute('aria-hidden', 'true');
  const readout = node('div', 'binocular-readout', binoculars);
  const kindName = node('strong', 'binocular-kind', readout);
  const facts = node('span', 'binocular-facts num', readout);
  const range = node('span', 'binocular-range num', readout);
  const state = node('span', 'binocular-state', readout);
  const hint = node('div', 'binocular-hint', binoculars);
  const call = node('button', 'binocular-call', binoculars);
  call.type = 'button';
  call.textContent = t('airSupport.call');
  call.addEventListener('click', () => bus.emit('ui:strikeCall', {}));
  const close = node('button', 'binocular-close', binoculars);
  close.type = 'button';
  close.setAttribute('aria-label', t('airSupport.lower'));
  close.textContent = '×';
  close.addEventListener('click', () => bus.emit('ui:strikeViewClose', {}));

  // ---- the warning ----
  const warning = node('div', 'cot-strike-warning', parent);
  warning.hidden = true;
  warning.setAttribute('role', 'alert');
  const warningTitle = node('strong', '', warning);
  const warningTime = node('span', 'num', warning);

  let lastTimeS = 0, wasOpen = false, called = false;
  bus.on('ui:strikeCalled', () => { called = true; });
  bus.on('ui:strikeView', (payload) => {
    const open = !!(payload as { open?: boolean } | null)?.open;
    binoculars.classList.toggle('is-raising', open && !prefersReducedMotion());
    if (!open) called = false;
  });

  /**
   * Each frame: the ledger and the strikes (`air`, the viewer's), the crew's aim point and hull, its side, the clock and
   * whether the HUD shows; `keyX` is the binoculars' key as bound.
   */
  function update(air: AirSupportView | null | undefined, aim: Point | null | undefined, hull: Point | null | undefined,
    team: 'alpha' | 'bravo', timeS: number, active: boolean, keyX: string): void {
    const dt = Math.max(0, Math.min(0.1, timeS - lastTimeS));
    lastTimeS = timeS;
    const shown = !!air && active;
    setHidden(strip, !shown);
    if (!air || !shown) {
      if (strikeView.open) bus.emit('ui:strikeViewClose', {});
      setHidden(binoculars, true); setHidden(warning, true);
      strikeView.blend = 0;
      return;
    }
    // the reticle rides the crew's aim point; the run's heading is the hull's line to it
    let rangeM = 0;
    if (aim && hull) {
      strikeView.x = aim.x; strikeView.y = aim.y; strikeView.z = aim.z;
      const dx = aim.x - hull.x, dz = aim.z - hull.z;
      rangeM = Math.hypot(dx, dz);
      if (rangeM > 1) strikeView.heading = Math.atan2(dx, dz);
    }
    const why = blocker(air, strikeView.kind, rangeM);
    strikeView.ready = !why;
    const step = dt / STRIKE_VIEW_TRANSITION_S;
    strikeView.blend = Math.max(0, Math.min(1, strikeView.blend + (strikeView.open ? step : -step)));
    // a call made: the reticle holds its lock, then the binoculars come down
    if (called && strikeView.open && timeS >= strikeView.lockedUntilS) bus.emit('ui:strikeViewClose', {});

    setText(pointsValue, String(air.points ?? 0));
    setText(viewKey, keyX);
    setData(view, 'open', strikeView.open ? 'true' : 'false');
    for (const tile of tiles) {
      const tileWhy = blocker(air, tile.kind, tile.kind === strikeView.kind ? rangeM : 0);
      setData(tile.button, 'state', tileWhy ?? 'ready');
      setData(tile.button, 'selected', strikeView.open && strikeView.kind === tile.kind ? 'true' : 'false');
      const cool = air.cooldowns?.[tile.kind] ?? 0;
      setStyle(tile.button, '--strike-cool', String(Math.min(1, cool / R[tile.kind].cooldownS)));
      setText(tile.status, tileWhy === 'cooldown' ? `${Math.ceil(cool)} s` : '');
      setAttr(tile.button, 'aria-label', `${t(`airSupport.kind.${tile.kind}`)}, ${R[tile.kind].cost} ${t('airSupport.points')}`);
    }

    setHidden(binoculars, !strikeView.open);
    if (strikeView.open) {
      const kind = strikeView.kind;
      setText(kindName, t(`airSupport.kind.${kind}`));
      setText(facts, t('airSupport.facts', { cost: String(R[kind].cost), warning: String(R[kind].warningS) }));
      setText(range, `${Math.round(rangeM)} m · ${String(Math.round(((strikeView.heading * 180 / Math.PI) + 360) % 360)).padStart(3, '0')}°`);
      const locked = timeS < strikeView.lockedUntilS;
      setText(state, locked ? t('airSupport.state.called') : why ? t(`airSupport.state.${why}`) : t('airSupport.state.ready'));
      setData(binoculars, 'state', locked ? 'called' : why ?? 'ready');
      setText(hint, t('airSupport.hint', { key: keyX }));
      setDisabled(call, !strikeView.ready || locked);
    }

    // the warning: the nearest-landing strike of the other side (or a friendly one: friendly fire is on) whose footprint
    // covers the crew, until its danger is past
    let threat: (typeof air.strikes)[number] | null = null;
    if (hull) {
      for (const strike of air.strikes) {
        if (strike.downedS != null || strike.kind === 'recon' || strike.mine) continue;
        if (air.nowS > strike.landsS + strikeDangerS(R, strike.kind)) continue;
        if (!strikeCovers(R, strike, hull.x, hull.z, 8)) continue;
        if (!threat || strike.landsS < threat.landsS) threat = strike;
      }
    }
    setHidden(warning, !threat);
    if (threat) {
      setData(warning, 'side', threat.team === team ? 'own' : 'enemy');
      setText(warningTitle, t(`airSupport.incoming.${threat.kind}`));
      const left = threat.landsS - air.nowS;
      setText(warningTime, left > 0 ? `${left.toFixed(1)} s` : t('airSupport.incoming.now'));
    }
  }

  return { update };
}
