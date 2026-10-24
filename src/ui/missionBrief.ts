// Mission brief (campaign slice 5, 2026-09-14): the card a Frontline Assault sortie opens
// with — operation number and map, title, one-paragraph brief, the three objectives and the
// opposing formation. Shown from the pre-battle countdown until a few seconds after roll-out,
// then it fades; leaving the battlefield removes it at once. Pure DOM over the i18n catalog.
import { t } from './i18n.ts';
import { ensureStyle } from './styleLayers.ts';
import { ensureFonts } from './fonts.ts';
import {
  CAMPAIGN_OBJECTIVE_KEYS, CAMPAIGN_OPERATIONS, campaignOperationById, campaignOperationForMap,
  type CampaignOperation,
} from '../game/campaignOperations.ts';

const STYLE_ID = 'cot-mission-brief-style';
const CSS = `
.cot-brief{position:fixed;left:22px;top:clamp(220px,30vh,320px);z-index:34;width:min(380px,calc(100vw - 44px));padding:var(--s3) var(--s4);
  color:var(--ink-1);background:var(--hud-plate);border-radius:var(--plate-radius);box-shadow:inset 2px 0 0 var(--accent),var(--e2);
  font-family:var(--font-ui);opacity:0;transform:translateX(-14px);
  transition:opacity var(--dur-screen) var(--ease-enter),transform var(--dur-screen) var(--ease-enter);pointer-events:none}
.cot-brief.show{opacity:1;transform:none}
.cot-brief .kicker{font:600 max(11px,var(--fs-11))/1 var(--font-display);letter-spacing:var(--track-label);text-transform:uppercase;color:var(--ink-3)}
.cot-brief h3{margin:var(--s1) 0 var(--s2);font:600 max(20px,var(--fs-20))/1.15 var(--font-display);letter-spacing:var(--track-title);color:var(--ink-1)}
.cot-brief p{margin:0 0 var(--s2);font:400 max(13px,var(--fs-13))/1.45 var(--font-body);color:var(--ink-2)}
.cot-brief .objectives{margin:0 0 var(--s1);font:600 max(11px,var(--fs-11))/1 var(--font-display);letter-spacing:var(--track-label);
  text-transform:uppercase;color:var(--ink-3)}
.cot-brief ul{margin:0 0 var(--s2);padding:0;list-style:none}
.cot-brief li{position:relative;padding-left:14px;font:400 max(13px,var(--fs-13))/1.4 var(--font-body);color:var(--ink-1)}
.cot-brief li::before{content:'';position:absolute;left:1px;top:6px;width:5px;height:5px;background:var(--accent)}
.cot-brief .enemy{font:600 max(11px,var(--fs-11))/1.3 var(--font-display);letter-spacing:var(--track-label-s);text-transform:uppercase;
  color:var(--text-enemy)}
`;

interface MissionBriefRequest {
  /** Ladder operation launched from the campaign card, when there is one. */
  readonly operationId?: string | null;
  readonly mapId: string;
  /** Seconds the card stays before fading (pre-battle countdown plus a few seconds of play). */
  readonly durationS?: number;
}

interface MissionBriefView {
  readonly kicker: string;
  readonly title: string;
  readonly brief: string | null;
  readonly objectives: readonly string[];
  readonly enemy: string | null;
}

/** Copy for a sortie: the ladder operation's brief, or the free-sortie framing for any other map. */
function missionBriefView(request: Pick<MissionBriefRequest, 'operationId' | 'mapId'>): MissionBriefView {
  const operation: CampaignOperation | null = campaignOperationById(request.operationId) ?? campaignOperationForMap(request.mapId);
  const mapName = t(`map.${request.mapId}`);
  const objectives = CAMPAIGN_OBJECTIVE_KEYS.map((key) => t(key));
  if (!operation) {
    return { kicker: t('missionBrief.freeSortie'), title: mapName, brief: null, objectives, enemy: null };
  }
  return {
    kicker: t('missionBrief.kicker', { index: String(operation.index), total: String(CAMPAIGN_OPERATIONS.length), map: mapName }),
    title: t(`campaign.op.${operation.id}.title`),
    brief: t(`campaign.op.${operation.id}.brief`),
    objectives,
    enemy: t('missionBrief.enemy', { enemy: t(`campaign.enemy.${operation.enemy}`) }),
  };
}

interface MissionBriefRuntime {
  show(request: MissionBriefRequest): MissionBriefView;
  hide(): void;
  isShowing(): boolean;
  dispose(): void;
}

export function createMissionBrief(parent: HTMLElement = document.body): MissionBriefRuntime {
  ensureFonts();
  ensureStyle(STYLE_ID, CSS, 'surfaces');
  const root = document.createElement('aside');
  root.className = 'cot-brief';
  root.setAttribute('role', 'note');
  root.setAttribute('aria-live', 'polite');
  root.hidden = true;
  parent.appendChild(root);
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let showing = false;

  const clearTimers = (): void => {
    if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  };

  function hide(): void {
    clearTimers();
    showing = false;
    root.classList.remove('show');
    root.hidden = true;
  }

  function show(request: MissionBriefRequest): MissionBriefView {
    const view = missionBriefView(request);
    clearTimers();
    root.replaceChildren();
    const kicker = document.createElement('div'); kicker.className = 'kicker'; kicker.textContent = view.kicker;
    const title = document.createElement('h3'); title.textContent = view.title;
    root.append(kicker, title);
    if (view.brief) { const brief = document.createElement('p'); brief.textContent = view.brief; root.append(brief); }
    const heading = document.createElement('div'); heading.className = 'objectives'; heading.textContent = t('missionBrief.objectives');
    const list = document.createElement('ul');
    for (const objective of view.objectives) { const item = document.createElement('li'); item.textContent = objective; list.append(item); }
    root.append(heading, list);
    if (view.enemy) { const enemy = document.createElement('div'); enemy.className = 'enemy'; enemy.textContent = view.enemy; root.append(enemy); }
    root.hidden = false;
    showing = true;
    // next frame so the transition runs from the hidden state
    requestAnimationFrame(() => { if (showing) root.classList.add('show'); });
    const durationS = Math.max(4, request.durationS ?? 18);
    // the card counts as shown only while it is legible: the fade flips `showing` at once, so a
    // BRIEF tap that lands during the fade re-opens instead of cancelling (batch 21)
    fadeTimer = setTimeout(() => { root.classList.remove('show'); showing = false; }, durationS * 1000);
    hideTimer = setTimeout(() => { if (!showing) hide(); }, durationS * 1000 + 450);
    return view;
  }

  return {
    show, hide,
    isShowing: () => showing,
    dispose() { hide(); root.remove(); },
  };
}
