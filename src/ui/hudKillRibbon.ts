// The kill ribbon and the personal event stream (brand-ui H3, the direction's 06-battle-hud.html .ribbon). Copyright ©
// 2026 Kevin B. Liu.
//
// One plate centre low, above the systems row and well clear of the sight: "Destroyed", the victim's flag and
// silhouette, callsign and vehicle, the cause where it says more than a shot (ammo rack, fire, ramming), the streak's
// multiplier on a tungsten block; under it, on the same plate, what the player's streak earned (+kills, +damage, the
// zones the side took and the tanks the player lit in the streak's window). It
// holds 2.4 s after the latest kill (SPEC 12.2.1) and steps aside while a notice meets its place (battleHudLayout.ts
// yieldKillRibbon). The mouse layouts wide and tall enough for it show it (laptop and desktop, 720 px and up); every other
// layout reads the same kill in the feed.

import { createElement as el } from './dom.ts';
import { ensureStyle } from './styleLayers.ts';
import { formatNumber, t } from './i18n.ts';
import { uiIconSVG } from './uiIcons.ts';
import { maskIcon } from './icons.ts';

/** How long the ribbon holds after the latest kill, and how soon another kill extends the streak. */
const RIBBON_HOLD_MS = 2400;
const STREAK_WINDOW_MS = 8000;
/** How many of the latest spots and captures the stream remembers. */
const RECENT = 8;

/** How many of `times` fall in the streak's window before `now`. */
function inWindow(times: Float64Array, now: number): number {
  let count = 0;
  for (let i = 0; i < times.length; i++) if (now - times[i] <= STREAK_WINDOW_MS) count++;
  return count;
}

const CSS = `
.cot-ribbon{position:absolute;z-index:var(--hud-layer-status);left:var(--hud-ribbon-x,50%);top:var(--hud-ribbon-top,var(--hud-systems-top,80%));
  transform:translate(-50%,calc(-100% - 8px));width:var(--hud-ribbon-w,min(520px,calc(100vw - 32px)));display:none;flex-direction:column;
  background:var(--hud-plate-strong);border-radius:var(--r1);box-shadow:var(--battle-edge-own);color:var(--ink-1);
  pointer-events:none;opacity:0;visibility:hidden;transition:opacity var(--dur-base) var(--ease-exit),visibility var(--dur-base) step-end}
/* (a mouse layout from 768 px wide: centred over the systems row in the gap its lower corners leave, battleHudLayout.ts;
   gauntlet r3 found no kill banner at 1024x600 and 900x700) */
body:not(.cot-touch-layout):is([data-cot-width='tablet'],[data-cot-width='laptop'],[data-cot-width='desktop']):not([data-cot-height='short']) .cot-ribbon{display:flex}
.cot-ribbon.on{opacity:1;visibility:visible;transition:opacity var(--dur-fast) var(--ease-enter)}
/* it steps aside for a notice that meets it, while spectating, and in the scope (the direction's 06b .sniper .ribbon) */
.cot-ribbon.on.yield,body.cot-spectating .cot-ribbon.on,html[data-cot-scoped] .cot-ribbon.on{opacity:0;visibility:hidden}
.cot-ribbon .top{display:flex;align-items:center;gap:10px;height:44px;padding:0 0 0 14px;min-width:0}
.cot-ribbon .top>:is(.id,.cause){display:contents}
.cot-ribbon .w{flex:none;font:700 var(--battle-fs-14)/1 var(--hud-font);letter-spacing:var(--track-label);text-transform:uppercase;color:var(--accent)}
/* the callsign takes the row (SPEC 12.2.3), its slack too: the cause chip by the streak's block (zh's shorter word left
   30-55 px before the block, gauntlet r6) */
.cot-ribbon .cs{flex:1 1 auto;min-width:6ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:700 var(--battle-fs-18)/1 var(--hud-font)}
/* the victim's vehicle is its silhouette beside the callsign; its name is spoken only (gauntlet r1: a long callsign cut it
   to "T-9..." in zh and to nothing in en) */
.cot-ribbon .vn{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.cot-ribbon .fl{display:flex;flex:none}.cot-ribbon .fl:empty{display:none}
.cot-ribbon .fl .cot-flag{display:block;border-radius:1px;box-shadow:var(--flag-ring)}
.cot-ribbon .sil{flex:none;width:40px;height:13px;color:var(--team-enemy);transform:scaleX(-1);filter:var(--sil-shadow)}
.cot-ribbon .sil[hidden]{display:none}
/* (the cause in the banner's capitals, as its word and the streak's: a title-case "Fire" beside them, gauntlet r5) */
.cot-ribbon .cot-c-chip{flex:none;height:26px;padding:0 var(--s2);font-size:var(--battle-fs-12);letter-spacing:var(--track-label);text-transform:uppercase}
.cot-ribbon .cot-c-chip[data-cause='ammorack']{color:var(--sys-ammo);box-shadow:var(--battle-ring-ammo)}
.cot-ribbon .cot-c-chip[data-cause='fire']{color:var(--danger);box-shadow:var(--ring-danger)}
.cot-ribbon .x{flex:none;margin-left:auto;align-self:stretch;min-width:58px;padding:0 14px;display:flex;flex-direction:column;
  justify-content:center;align-items:center;gap:2px;background:var(--accent);color:var(--ink-on-accent);font:700 var(--battle-fs-20)/1 var(--hud-font)}
.cot-ribbon .x[hidden]{display:none}
/* (a ribbon in a narrow gap keeps the callsign: the cause chip gives way, battleHudLayout.ts
   RIBBON_TIGHT; at 1024x600 the callsign read "Command…" beside them, gauntlet r4; the silhouette too, the flag naming
   the side: at 900x700 it read "Commander…", r5) */
.cot-ribbon.tight .cause,.cot-ribbon.tight .sil{display:none}
.cot-ribbon.tight .x{min-width:44px;padding:0 10px}
.cot-ribbon.on.cramped,.cot-ribbon.cramped{opacity:0;visibility:hidden}
.cot-ribbon .stream{display:flex;gap:16px;padding:7px 14px;border-top:1px solid var(--line-1);font:500 var(--battle-fs-13)/1 var(--font-data);color:var(--accent)}
.cot-ribbon .stream>span{display:flex;align-items:center;gap:5px;white-space:nowrap}
.cot-ribbon .stream>span[hidden],.cot-ribbon .stream[hidden]{display:none}
/* Chinese labels keep the 13 px floor (the type rules) */
:lang(zh-CN) .cot-ribbon .cot-c-chip{font-size:var(--battle-fs-13)}
.cot-ribbon .stream svg{width:14px;height:14px;flex:none}
.cot-ribbon .gi{display:flex}
`;

/** The victim as the HUD knows it: `flag` is its nation's flag markup (flags.ts), empty where none has loaded. */
interface RibbonVictim {
  id: string;
  callsign: string;
  vehicle: string;
  flag: string;
  specId: string | null;
}

/** The kill's cause as killPresentation() names it. */
interface RibbonCause {
  cause: string;
  icon: string;
  label: string;
}

interface KillRibbonRuntime {
  root: HTMLElement;
  /** The player hit a tank for `amount` (summed into the stream when it dies). */
  damage(targetId: string, amount: number): void;
  /** The player destroyed `victim`. */
  kill(victim: RibbonVictim, cause: RibbonCause): void;
  /** The player lit an enemy (the stream counts the spots of the streak's window). */
  spot(): void;
  /** The player's side took a zone. */
  zone(): void;
  /** A battle ends or restarts: forget the streak and the damage ledger. */
  clear(): void;
}

const CAUSE_CHIPS = new Set(['ammorack', 'fire', 'ram', 'drone']);

export function createKillRibbon(parent: HTMLElement): KillRibbonRuntime {
  ensureStyle('cot-hud-ribbon-style', CSS, 'surfaces');
  const root = el('div', 'cot-ribbon', parent);
  root.setAttribute('role', 'status');
  const top = el('div', 'top', root);
  const word = el('span', 'w', top);
  const identity = el('span', 'id', top);
  const flagHost = el('span', 'fl', identity);
  const silhouette = el('span', 'sil', identity);
  silhouette.setAttribute('aria-hidden', 'true');
  const callsign = el('b', 'cs', top);
  const vehicle = el('span', 'vn', top);
  const causeHost = el('span', 'cause', top);
  const multi = el('span', 'x', top);
  // (the streak is its count alone: a word under "×3" said "TRIPLE" again, gauntlet r12)
  const multiCount = el('span', 'n', multi);
  const stream = el('div', 'stream', root);
  const killsItem = el('span', 'k', stream);
  el('span', 'gi', killsItem).innerHTML = uiIconSVG('skull', 14);
  const killsText = el('span', '', killsItem);
  const damageItem = el('span', 'd', stream);
  el('span', 'gi', damageItem).innerHTML = uiIconSVG('damage', 14);
  const damageText = el('span', '', damageItem);
  const zonesItem = el('span', 'z', stream);
  el('span', 'gi', zonesItem).innerHTML = uiIconSVG('modeZones', 14);
  const zonesText = el('span', '', zonesItem);
  const spotsItem = el('span', 's', stream);
  el('span', 'gi', spotsItem).innerHTML = uiIconSVG('optics', 14);
  const spotsText = el('span', '', spotsItem);
  // the latest spots and captures, as times: a fixed ring each, so an event allocates nothing
  const spotTimes = new Float64Array(RECENT).fill(-Infinity);
  const zoneTimes = new Float64Array(RECENT).fill(-Infinity);
  let spotNext = 0, zoneNext = 0;
  const dealt = new Map<string, number>();
  let streak = 0, streakDamage = 0, lastKillMs = -Infinity;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  function paintStream(): void {
    const now = performance.now();
    killsText.textContent = t('hud.ribbon.kills', { count: streak });
    // (a streak's count is its multiplier's: the stream says it only for a single kill, gauntlet r2 read "×3 TRIPLE" and
    // "+3 kills" together)
    killsItem.hidden = streak >= 2;
    damageItem.hidden = streakDamage <= 0;
    damageText.textContent = t('hud.ribbon.damage', { amount: formatNumber(Math.round(streakDamage)) });
    const zones = inWindow(zoneTimes, now), spots = inWindow(spotTimes, now);
    zonesItem.hidden = zones <= 0;
    zonesText.textContent = t('hud.ribbon.zones', { count: zones });
    spotsItem.hidden = spots <= 0;
    spotsText.textContent = t('hud.ribbon.spots', { count: spots });
    // (a streak with nothing to add drops the band itself: an empty ruled strip hung under the plate, gauntlet r3)
    stream.hidden = killsItem.hidden && damageItem.hidden && zonesItem.hidden && spotsItem.hidden;
  }

  return {
    root,
    damage(targetId, amount) {
      if (!targetId || !(amount > 0)) return;
      dealt.set(targetId, (dealt.get(targetId) ?? 0) + amount);
    },
    kill(victim, cause) {
      const now = performance.now();
      if (now - lastKillMs > STREAK_WINDOW_MS) { streak = 0; streakDamage = 0; }
      lastKillMs = now;
      streak++;
      streakDamage += dealt.get(victim.id) ?? 0;
      dealt.delete(victim.id);
      word.textContent = t('hud.kill.shot');
      flagHost.innerHTML = victim.flag;
      silhouette.hidden = !victim.specId;
      if (victim.specId) maskIcon(silhouette, victim.specId, 'side_silhouette', 'currentColor');
      callsign.textContent = victim.callsign;
      vehicle.textContent = victim.vehicle;
      vehicle.hidden = !victim.vehicle || victim.vehicle === victim.callsign;
      causeHost.replaceChildren();
      if (CAUSE_CHIPS.has(cause.cause)) {
        const chip = el('span', 'cot-c-chip', causeHost);
        chip.dataset.cause = cause.cause;
        el('span', 'gi', chip).innerHTML = uiIconSVG(cause.icon, 16);
        el('span', '', chip).textContent = cause.label;
      }
      multi.hidden = streak < 2;
      multiCount.textContent = `×${streak}`;
      paintStream();
      root.classList.add('on');
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { hideTimer = null; root.classList.remove('on'); }, RIBBON_HOLD_MS);
    },
    spot() {
      spotTimes[spotNext] = performance.now();
      spotNext = (spotNext + 1) % RECENT;
      if (root.classList.contains('on')) paintStream();
    },
    zone() {
      zoneTimes[zoneNext] = performance.now();
      zoneNext = (zoneNext + 1) % RECENT;
      if (root.classList.contains('on')) paintStream();
    },
    clear() {
      dealt.clear();
      spotTimes.fill(-Infinity);
      zoneTimes.fill(-Infinity);
      streak = 0; streakDamage = 0; lastKillMs = -Infinity;
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      root.classList.remove('on');
    },
  };
}
