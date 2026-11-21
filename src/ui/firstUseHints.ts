/**
 * firstUseHints.ts — the one owner of "the first time you meet X" (owner 2026-11-20, mobile-hud-274: "esp stuff like the
 * module damage thats so good. make sure it properly is taken into account with other ui stuff like our existing
 * notifications"). Copyright © 2026 Kevin B. Liu.
 *
 * Each hint shows once per player, at the moment it first matters: the armour colours (273's tip), a module knocked out
 * (the repair kit's key), the first reload after the first shot (the readout's grey figure), auto-aim's first lock, and,
 * in a battle whose HUD shows them, the suspension, the roof gun, the drone, Air Support and the rack's rounds. When one
 * may show is firstUseHintPolicy.ts's (one at a time, combat first, none early, none behind a gate, none twice); where,
 * the battle's notice region's (battleNotices.ts, placed by the guidance plan clear of the controls, the edge sections,
 * the centre notices, the reticle and the kill lanes), at a priority under every other notice there. Its keys are
 * keyPrompt.ts's prompts: the bound key or button, or on touch the tile, lit on the HUD while the hint shows.
 * Event-driven: the bus's moments, and a 400 ms step only while a hint shows or waits.
 */
import type { ActionId } from '../game/input.ts';
import { battleNotices } from './battleNotices.ts';
import { createHintPolicy, START_DELAY_MS, type HintPolicy } from './firstUseHintPolicy.ts';
import { formatKeyLine, inputDevice, promptRevision, promptTiles, type PromptInput } from './keyPrompt.ts';
import { t } from './i18n.ts';
import {
  abilityPicture, ammoPicture, autoAimPicture, moduleRepairPicture, reloadPicture, shadedHullPicture, suspensionPicture,
} from './firstUseHintPictures.ts';

type HintId = 'armourShading' | 'moduleRepair' | 'reload' | 'autoAim' | 'suspension' | 'airSupport' | 'drone' | 'roofGun' | 'ammoTypes';

interface HintDef {
  /** Lower shows first. */
  readonly urgency: number;
  readonly durationMs: number;
  readonly title: string;
  /** The line, with each key's placeholder; `actions` names them (the module hint's slot is read when it fires). */
  readonly line: string;
  readonly actions: Readonly<Record<string, ActionId>>;
  /** The line where the device has no prompt for the actions (the armour colours on a phone): its own words. */
  readonly lineNoPrompt?: string;
  readonly picture: () => string;
  /** The picture's label (a screen reader's, a mouse's tooltip); the title where none. */
  readonly label?: (vars: Readonly<Record<string, string>>) => string;
  /** Taught by the tutorial's battle chapter: a player who finished it skips the hint. */
  readonly taught?: boolean;
}

const HINTS: Readonly<Record<HintId, HintDef>> = {
  armourShading: { urgency: 1, durationMs: 12_000, title: 'hud.tip.armorOverlayOn.text', line: 'hud.tip.armorOverlayOn.detailKey',
    actions: { key: 'hitboxOverlay' }, lineNoPrompt: 'hud.tip.armorOverlayOn.legend', picture: shadedHullPicture,
    label: (vars) => t('hud.tip.armorOverlayOn.detailSettings', vars) },
  moduleRepair: { urgency: 0, durationMs: 8_000, title: 'hud.hint.moduleRepair.title', line: 'hud.hint.moduleRepair.line',
    actions: { repair: 'consumable1' }, picture: moduleRepairPicture },
  // (not skipped after the tutorial: its battle chapter no longer teaches the reload, tutorial-journey-273 07ca63cb44)
  reload: { urgency: 2, durationMs: 8_000, title: 'hud.hint.reload.title', line: 'hud.hint.reload.line', actions: {},
    picture: reloadPicture },
  autoAim: { urgency: 3, durationMs: 8_000, title: 'hud.hint.autoAim.title', line: 'hud.hint.autoAim.line',
    actions: { autoAim: 'autoAim' }, picture: autoAimPicture },
  suspension: { urgency: 4, durationMs: 8_000, title: 'hud.hint.suspension.title', line: 'hud.hint.suspension.line',
    actions: { tilt: 'specialAction' }, picture: suspensionPicture },
  airSupport: { urgency: 4, durationMs: 8_000, title: 'hud.hint.airSupport.title', line: 'hud.hint.airSupport.line',
    actions: { strike: 'strikeView' }, picture: () => abilityPicture('modeAirSupport') },
  drone: { urgency: 5, durationMs: 8_000, title: 'hud.hint.drone.title', line: 'hud.hint.drone.line',
    actions: { drone: 'drone' }, picture: () => abilityPicture('modeDrone') },
  roofGun: { urgency: 5, durationMs: 8_000, title: 'hud.hint.roofGun.title', line: 'hud.hint.roofGun.line',
    actions: { roofGun: 'roofGun' }, picture: () => abilityPicture('roofGun') },
  ammoTypes: { urgency: 6, durationMs: 8_000, title: 'hud.hint.ammoTypes.title', line: 'hud.hint.ammoTypes.line',
    actions: { shell1: 'shell1', shell2: 'shell2', shell3: 'shell3' }, picture: ammoPicture, taught: true },
};

const SEEN_KEY = (id: HintId) => `cot.hint.${id}.v1`;
const TICK_MS = 400;
/** A hit's or a kill's toast is combat while it is this fresh. */
const COMBAT_SELECTORS = '.cot-sixth.on,.cot-alert.show,.cot-si-toasthost>:not([hidden])';

interface FirstUseHintsHost {
  // (the bus's listeners take its payloads as the runtime's values: each hook narrows its own)
  readonly bus: { on(type: string, listener: (payload: any) => void): unknown };
  readonly input: PromptInput & { getSettings(): { readonly showHints?: boolean } };
  readonly playerId: () => string | null;
  /** A watched, couch or spectated battle: the player is not driving. */
  readonly watched: () => boolean;
  readonly airSupportMode: () => boolean;
  readonly now?: () => number;
}

function readSeen(): Set<string> {
  const seen = new Set<string>();
  try { for (const id of Object.keys(HINTS) as HintId[]) if (localStorage.getItem(SEEN_KEY(id)) === 'seen') seen.add(id); }
  catch { /* storage off: every hint is new this page */ }
  return seen;
}
function tutorialBattleDone(): boolean {
  try { return (JSON.parse(localStorage.getItem('cot.tutorial.v1') || '{}') as { battle?: string }).battle === 'done'; }
  catch { return false; }
}

export function createFirstUseHints(host: FirstUseHintsHost) {
  const now = host.now ?? (() => performance.now());
  const policy: HintPolicy = createHintPolicy({ seen: readSeen() });
  let timer: ReturnType<typeof setInterval> | null = null;
  let capabilityCheck: ReturnType<typeof setTimeout> | null = null;
  let inBattle = false, dead = false, fired = false;
  let shown: { id: HintId; revision: string; until: number; tiles: Element[]; vars: Record<string, ActionId> } | null = null;

  const markSeen = (id: HintId) => { try { localStorage.setItem(SEEN_KEY(id), 'seen'); } catch { /* storage off */ } };
  const visible = (selector: string) => !!document.querySelector<HTMLElement>(selector)?.checkVisibility?.();
  const blocked = () => !inBattle || dead || host.watched() || host.input.getSettings().showHints === false
    || document.body.classList.contains('cot-tutorial') || document.body.classList.contains('cot-kc-live')
    || document.documentElement.hasAttribute('data-cot-scoped') || !!document.querySelector('.cot-tut.is-open');
  const combat = () => [...document.querySelectorAll<HTMLElement>(COMBAT_SELECTORS)].some((node) => node.checkVisibility?.() !== false);

  /** The repair kit's slot as the tray holds it now (a loadout may move it). */
  const repairAction = (): ActionId | null => {
    const slots = [...document.querySelectorAll<HTMLElement>('.cot-con')];
    const at = slots.findIndex((slot) => slot.dataset.item === 'repair');
    return at < 0 ? null : (`consumable${at + 1}` as ActionId);
  };

  function render(id: HintId) {
    const def = HINTS[id];
    const actions: Record<string, ActionId> = { ...def.actions };
    if (id === 'moduleRepair') actions.repair = repairAction() ?? 'consumable1';
    const device = inputDevice(host.input);
    const noPrompt = !!def.lineNoPrompt && device !== 'keyboard';
    const detailHtml = noPrompt ? formatKeyLine(host.input, def.lineNoPrompt!, {}) : formatKeyLine(host.input, def.line, actions);
    const settingsPath = `${t('settings.title')} › ${t('settings.tab.gameplay')} › ${t('settings.interface.armorOverlay')}`;
    battleNotices.show({
      id: `cot-hint-${id}`,
      severity: 'info',
      className: `cot-first-hint cot-first-hint--${id}`,
      text: t(def.title),
      detailHtml,
      media: { svg: def.picture(), label: def.label ? def.label({ path: settingsPath }) : t(def.title) },
      // (the hint goes by its time; a keyboard needs no close, its key is the hint's own word; a phone and a pad keep one)
      durationMs: def.durationMs,
      dismissible: device !== 'keyboard',
      priority: -1,
    });
    return actions;
  }
  function light(tiles: Element[], on: boolean) { for (const tile of tiles) tile.toggleAttribute('data-hint-pulse', on); }
  function takeDown(id: HintId, seen: boolean) {
    battleNotices.dismiss(`cot-hint-${id}`);
    if (shown?.id === id) { light(shown.tiles, false); shown = null; }
    if (seen) markSeen(id);
  }

  function step() {
    const at = now();
    if (shown) {
      // (closed by its time, or by the player's close: gone from the region)
      const gone = at > shown.until || (at > shown.until - HINTS[shown.id].durationMs + 600 && !document.querySelector(`.cot-first-hint--${shown.id}`));
      if (gone) { const id = shown.id; policy.closed(id, at); takeDown(id, true); }
      else {
        const revision = promptRevision(host.input);
        if (revision !== shown.revision) { shown.vars = render(shown.id); shown.revision = revision; }
      }
    }
    const out = policy.step({ now: at, blocked: blocked(), combat: combat() });
    if (out.withdraw) takeDown(out.withdraw.id as HintId, out.withdraw.seen);
    if (out.show) {
      const id = out.show as HintId;
      const vars = render(id);
      const tiles = promptTiles(host.input, Object.values(vars)).flatMap((selector) => [...document.querySelectorAll(selector)]);
      light(tiles, true);
      shown = { id, revision: promptRevision(host.input), until: at + HINTS[id].durationMs, tiles, vars };
    }
    if (!policy.busy() && timer) { clearInterval(timer); timer = null; }
  }
  const wake = () => { if (!timer && inBattle) timer = setInterval(step, TICK_MS); };

  function offer(id: HintId) {
    if (!inBattle) return;
    if (HINTS[id].taught && tutorialBattleDone()) return;
    if (policy.offer(id, HINTS[id].urgency, now())) wake();
  }

  /** The abilities the HUD shows for this battle's tank and mode, read once its tiles are up (before the start delay). */
  function offerCapabilities() {
    if (visible('.cot-vehicle-controls>[data-control="suspension"]')) offer('suspension');
    if (visible('.cot-strike-dock') || host.airSupportMode()) offer('airSupport');
    if (visible('.cot-vehicle-controls>[data-control="drone"]')) offer('drone');
    if (visible('.cot-vehicle-controls>[data-control="roofGun"]')) offer('roofGun');
    if ([...document.querySelectorAll<HTMLElement>('.cot-shell')].filter((shell) => shell.checkVisibility?.()).length >= 2) offer('ammoTypes');
  }

  const player = () => host.playerId();
  host.bus.on('module:state', (p: { id?: string; state?: string }) => {
    if (p.id && p.id === player() && p.state === 'red' && repairAction()) offer('moduleRepair');
  });
  host.bus.on('shell:fired', (p: { isPlayer?: boolean }) => { if (p.isPlayer) fired = true; });
  host.bus.on('player:reload', (p: { done?: boolean }) => { if (p.done && fired) offer('reload'); });
  host.bus.on('ui:autoAimState', (p: { on?: boolean }) => { if (p.on) offer('autoAim'); });
  host.bus.on('tank:destroyed', (p: { id?: string }) => { if (p.id && p.id === player()) { dead = true; wake(); } });
  for (const type of ['battle:ended', 'battle:presented']) host.bus.on(type, () => end());

  function end() {
    if (shown) takeDown(shown.id, false);
    inBattle = false;
    policy.battleEnd();
    if (timer) { clearInterval(timer); timer = null; }
    if (capabilityCheck) { clearTimeout(capabilityCheck); capabilityCheck = null; }
  }

  return {
    /** A battle the player drives rolled out. */
    battleStart(): void {
      end();
      inBattle = true; dead = false; fired = false;
      policy.battleStart(now());
      capabilityCheck = setTimeout(() => { capabilityCheck = null; offerCapabilities(); }, START_DELAY_MS - 1_000);
    },
    offer,
    end,
    /** (dev, __DEBUG.previewHint: the stills) draws a hint as it shows, its tiles lit, past the policy and never seen. */
    preview(id: HintId): void {
      if (shown) takeDown(shown.id, false);
      const vars = render(id);
      const tiles = promptTiles(host.input, Object.values(vars)).flatMap((selector) => [...document.querySelectorAll(selector)]);
      light(tiles, true);
      shown = { id, revision: promptRevision(host.input), until: Infinity, tiles, vars };
    },
  };
}

