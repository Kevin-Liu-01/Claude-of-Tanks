// Mission brief (campaign slice 5, 2026-09-14): the card a Frontline Assault sortie opens
// with — operation number and map, title, one-paragraph brief, the three objectives and the
// opposing formation. Shown from the pre-battle countdown until a few seconds after roll-out,
// then it fades; leaving the battlefield removes it at once. Pure DOM over the i18n catalog.
import { t } from './i18n.ts';
import { ensureStyle } from './dom.ts';
import { ensureFonts, FONT_COND, FONT_STACK } from './fonts.ts';
import {
  CAMPAIGN_OBJECTIVE_KEYS, CAMPAIGN_OPERATIONS, campaignOperationById, campaignOperationForMap,
  type CampaignOperation,
} from '../game/campaignOperations.ts';

const STYLE_ID = 'cot-mission-brief-style';
const CSS = `
.cot-brief{position:fixed;left:22px;top:clamp(220px,30vh,320px);z-index:34;width:min(380px,calc(100vw - 44px));padding:14px 16px 13px;
  color:#e9eef2;background:linear-gradient(180deg,rgba(9,13,18,.92),rgba(9,13,18,.84));border:1px solid rgba(230,154,54,.55);
  border-left:3px solid #e69a36;border-radius:4px;box-shadow:0 14px 34px rgba(0,0,0,.45);font-family:${FONT_STACK};
  opacity:0;transform:translateX(-14px);transition:opacity .35s ease,transform .35s ease;pointer-events:none}
.cot-brief.show{opacity:1;transform:none}
.cot-brief .kicker{font:900 9px ${FONT_COND};letter-spacing:.22em;text-transform:uppercase;color:#e2b56a}
.cot-brief h3{margin:4px 0 6px;font:900 19px ${FONT_COND};letter-spacing:.06em;text-transform:uppercase;color:#fff0d8}
.cot-brief p{margin:0 0 9px;font-size:12px;line-height:1.45;color:#c8d3db}
.cot-brief .objectives{font:900 8px ${FONT_COND};letter-spacing:.2em;text-transform:uppercase;color:#8ea2b0;margin:0 0 4px}
.cot-brief ul{margin:0 0 8px;padding:0;list-style:none}
.cot-brief li{position:relative;padding-left:14px;font-size:11.5px;line-height:1.4;color:#dfe7ec}
.cot-brief li::before{content:'';position:absolute;left:0;top:7px;width:6px;height:6px;border:1px solid #e69a36;transform:rotate(45deg)}
.cot-brief .enemy{font:700 9px ${FONT_COND};letter-spacing:.12em;text-transform:uppercase;color:#f0a4a4}
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
  ensureStyle(STYLE_ID, CSS);
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
