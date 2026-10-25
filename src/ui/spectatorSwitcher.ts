import { uiIconSVG } from './uiIcons.ts';
import { t } from './i18n.ts';

const SAFE_SPEC_ID = /^[a-z0-9_]+$/;

/** Build the small amount of presentation data the spectator card needs. */
export interface SpectatorCardPayload {
  readonly specId?: string;
  readonly count?: number;
  readonly index?: number;
}

interface SpectatorCardModel {
  readonly icon: string;
  readonly position: string;
}

export function spectatorCardModel(payload: SpectatorCardPayload = {}): SpectatorCardModel {
  const specId = SAFE_SPEC_ID.test(String(payload.specId || '')) ? String(payload.specId) : '';
  const rawCount = payload.count ?? 0;
  const rawIndex = payload.index ?? 0;
  const count = Number.isInteger(rawCount) && rawCount > 0 ? rawCount : 0;
  const index = Number.isInteger(rawIndex) && rawIndex > 0
    ? Math.min(rawIndex, count || rawIndex)
    : 0;
  return {
    icon: specId ? `/icons/${specId}_angle.webp` : '',
    position: count && index ? `${index} / ${count}` : '',
  };
}

export function spectatorSwitcherMarkup(): string {
  return '<div class="subject"><div class="portrait" aria-hidden="true"><img alt=""></div>' +
    '<div class="identity" aria-live="polite">' +
      '<span class="spec-status">' +
        uiIconSVG('scope', 14) +
        `<span>${t('spectator.spectating')}</span>` +
      '</span>' +
      '<span class="who"><b class="nick"></b><span class="veh"></span></span>' +
      `<span class="cursor-hint" hidden>${t('spectator.releaseCursor')}</span>` +
    '</div></div>' +
    '<div class="switch" role="group" aria-label="' + t('spectator.switchGroupAria') + '">' +
      '<button type="button" class="cycle prev" data-tip aria-keyshortcuts="A" aria-label="' + t('spectator.cyclePrevAria') + '">' +
        '<span class="cycle-icon" aria-hidden="true">' + uiIconSVG('chevronLeft', 13) + '</span>' +
        '<kbd aria-hidden="true">A</kbd>' +
      '</button>' +
      `<b class="idx" aria-label="${t('spectator.idxAria')}" hidden></b>` +
      '<button type="button" class="cycle next" data-tip aria-keyshortcuts="D" aria-label="' + t('spectator.cycleNextAria') + '">' +
        '<span class="cycle-icon" aria-hidden="true">' + uiIconSVG('chevronRight', 13) + '</span>' +
        '<kbd aria-hidden="true">D</kbd>' +
      '</button>' +
    '</div>' +
    `<button type="button" class="gar" aria-label="${t('spectator.garageAria')}">` +
      '<span class="gar-icon" aria-hidden="true">' + uiIconSVG('garage', 17) + '</span>' +
      `<span>${t('spectator.garage')}</span>` +
    '</button>';
}

/**
 * The Premiere direction's plates (the Watch bar's language, watchHud.ts): the watched tank's own 3/4 render on the HUD
 * plate ringed all round (no edge stripe, owner 2026-10-25), its commander in the display face and its vehicle under it; the cycle pair and the
 * garage as the kit's square plates with their key caps. The SPECTATING line stays for assistive technology only (no
 * eyebrow over a name, owner UI rules), the scope glyph says it.
 */
export const spectatorSwitcherStyles = `
.cot-spec{position:absolute;z-index:var(--hud-layer-controls);left:50%;bottom:16px;transform:translate(-50%,12px);
 display:none;grid-template-columns:minmax(0,1fr) 144px 88px;align-items:center;gap:var(--s2);
 width:min(620px,calc(100vw - 32px));min-width:0;padding:0;border:0;background:none;box-shadow:none;
 pointer-events:none;opacity:0;color:var(--ink-1);font-family:var(--font-ui);
 transition:opacity var(--dur-fast) var(--ease-enter),transform var(--dur-fast) var(--ease-enter);}
.cot-spec.show{display:grid}.cot-spec.in{opacity:1;transform:translate(-50%,0)}
.cot-spec .subject{position:relative;display:grid;grid-template-columns:66px minmax(0,1fr);align-items:center;gap:var(--s3);
 min-width:0;height:64px;padding:0 var(--s4) 0 var(--s2);pointer-events:auto;background:var(--hud-plate);border-radius:var(--r1);
 box-shadow:var(--ring-1);}
.cot-spec .portrait{display:grid;place-items:center;width:66px;height:52px;border:0;background:none;}
.cot-spec .portrait img{display:block;width:66px;height:52px;object-fit:contain;}
.cot-spec .identity{position:relative;display:flex;flex-direction:column;justify-content:center;gap:var(--s1);min-width:0;padding:0}
.cot-spec .spec-status{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.cot-spec .who{display:flex;flex-direction:column;gap:var(--s1);min-width:0;width:100%}
.cot-spec .nick{font:700 var(--fs-18)/1.1 var(--font-display);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cot-spec .veh{color:var(--ink-3);font:500 var(--battle-fs-12)/1.2 var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cot-spec .cursor-hint{color:var(--ink-3);font:500 var(--battle-fs-11)/1.3 var(--font-ui)}
.cot-spec .cursor-hint[hidden],.cot-spec .idx[hidden]{display:none}
.cot-spec .switch{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;align-items:center;gap:var(--s1);min-width:0;padding:0;background:none;border:0}
.cot-spec .idx{font:500 var(--battle-fs-12)/1.5 var(--font-data);color:var(--ink-2);text-align:center;white-space:nowrap;text-shadow:var(--battle-text-halo)}
.cot-spec :is(.cycle,.gar){position:relative;display:flex;align-items:center;justify-content:center;min-width:0;min-height:48px;margin:0;
 padding:var(--s1) var(--s2);border:0;border-radius:var(--r1);background:var(--hud-plate);box-shadow:var(--ring-1);color:var(--ink-1);
 font:inherit;cursor:pointer;pointer-events:auto;transition:box-shadow var(--dur-fast) var(--ease-enter),transform var(--dur-fast) var(--ease-enter);}
.cot-spec .cycle{flex-direction:column;gap:var(--s1)}
.cot-spec .cycle-icon{display:flex;color:var(--accent-hi)}.cot-spec .cycle-icon svg{width:14px;height:14px;display:block}
.cot-spec .cycle kbd{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:16px;padding:0 var(--s1);border:0;
 border-radius:var(--control-radius);background:none;box-shadow:var(--ring-3);color:var(--ink-2);font:500 var(--battle-fs-11)/1 var(--font-data)}
.cot-spec .gar{flex-direction:column;gap:var(--s1);color:var(--accent-hi);font:600 var(--battle-fs-11)/1 var(--font-ui);text-transform:uppercase;
 letter-spacing:var(--track-label-s);box-shadow:var(--ring-accent)}
.cot-spec .gar-icon,.cot-spec .gar-icon svg{display:block;width:20px;height:20px}
.cot-spec :is(.cycle,.gar):focus-visible{outline:none;box-shadow:var(--focus-ring)}
.cot-spec :is(.cycle,.gar):active{transform:translateY(var(--btn-press-drop))}
.cot-spec .cycle:disabled{opacity:.35;cursor:default;transform:none}
@media(hover:hover){.cot-spec :is(.cycle,.gar):hover:not(:disabled){box-shadow:var(--ring-3)}.cot-spec .gar:hover{background:var(--accent-wash)}}
@keyframes cotSpecSw{from{opacity:.35;transform:translateY(3px)}to{opacity:1;transform:none}}
.cot-spec .who.sw{animation:cotSpecSw var(--dur-fast) var(--ease-enter)}
@media(max-width:900px){
 .cot-spec{grid-template-columns:minmax(0,1fr) 144px 64px;gap:8px}
 .cot-spec .subject{grid-template-columns:48px minmax(0,1fr);gap:var(--s2);height:56px;padding:0 var(--s3) 0 var(--s2)}
 .cot-spec .portrait,.cot-spec .portrait img{width:48px;height:46px}.cot-spec .nick{font-size:var(--battle-fs-15)}
 .cot-spec .gar{letter-spacing:0}
}
body.cot-touch-layout .cot-spec .cycle kbd{display:none}
body.cot-touch-layout .cot-spec .cursor-hint{display:none}
@media(max-width:600px){.cot-spec{grid-template-columns:minmax(0,1fr) 144px 48px;gap:var(--s2)}.cot-spec .gar>span:last-child{display:none}.cot-spec .nick{font-size:var(--battle-fs-14)}}
@media(max-width:400px) and (orientation:portrait){
 .cot-spec{grid-template-columns:minmax(0,1fr) 88px;gap:7px 12px}
 .cot-spec .subject{grid-column:1/-1}.cot-spec .switch{width:144px;justify-self:center}
 .cot-spec .gar>span:last-child{display:block}
}
@media(prefers-reduced-motion:reduce){.cot-spec,.cot-spec .who.sw,.cot-spec .cycle,.cot-spec .gar{animation:none;transition:none}}
`;
