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
      '<button type="button" class="cycle prev" aria-keyshortcuts="A" aria-label="' + t('spectator.cyclePrevAria') + '">' +
        '<span class="cycle-icon" aria-hidden="true">' + uiIconSVG('chevronLeft', 13) + '</span>' +
        '<kbd aria-hidden="true">A</kbd>' +
      '</button>' +
      `<b class="idx" aria-label="${t('spectator.idxAria')}" hidden></b>` +
      '<button type="button" class="cycle next" aria-keyshortcuts="D" aria-label="' + t('spectator.cycleNextAria') + '">' +
        '<kbd aria-hidden="true">D</kbd>' +
        '<span class="cycle-icon" aria-hidden="true">' + uiIconSVG('chevronRight', 13) + '</span>' +
      '</button>' +
    '</div>' +
    `<button type="button" class="gar" aria-label="${t('spectator.garageAria')}">` +
      '<span class="gar-icon" aria-hidden="true">' + uiIconSVG('garage', 17) + '</span>' +
      `<span>${t('spectator.garage')}</span>` +
    '</button>';
}

/** Same outlined hexagons and open instrument layout as the aerial consoles. */
export const spectatorSwitcherStyles = `
.cot-spec{--spec-cut:polygon(12px 0,calc(100% - 12px) 0,100% 50%,calc(100% - 12px) 100%,12px 100%,0 50%);
 position:absolute;z-index:var(--hud-layer-controls);left:50%;bottom:16px;transform:translate(-50%,12px);
 display:none;grid-template-columns:minmax(0,1fr) 144px 88px;align-items:center;gap:10px;
 width:min(620px,calc(100vw - 32px));min-width:0;padding:0;border:0;background:none;box-shadow:none;
 pointer-events:none;opacity:0;color:#ecf3f5;transition:opacity .2s ease,transform .2s ease;}
.cot-spec.show{display:grid}.cot-spec.in{opacity:1;transform:translate(-50%,0)}
.cot-spec .subject{position:relative;isolation:isolate;display:grid;grid-template-columns:66px minmax(0,1fr);
 align-items:center;gap:10px;min-width:0;padding:10px 18px 10px 12px;pointer-events:auto;
 filter:drop-shadow(0 3px 6px #0007);}
.cot-spec .subject::before{content:'';position:absolute;inset:0;z-index:-1;clip-path:var(--spec-cut);
 background:linear-gradient(110deg,#14232dec,#081219f5);border-block:1px solid #91a7b644;}
.cot-spec .portrait{display:grid;place-items:center;width:66px;height:52px;border:0;
 background:radial-gradient(ellipse,#dda64924,transparent 70%);}
.cot-spec .portrait img{display:block;width:66px;height:52px;object-fit:contain;filter:drop-shadow(0 3px 3px #0009)}
.cot-spec .identity{display:flex;flex-direction:column;justify-content:center;gap:5px;min-width:0;padding:0}
.cot-spec .spec-status{display:flex;align-items:center;gap:6px;color:#ffc46b;font-size:9px;font-weight:800;line-height:1.2;letter-spacing:.14em;text-transform:uppercase}
.cot-spec .spec-status svg{width:13px;height:13px;flex-shrink:0}
.cot-spec .who{display:flex;flex-direction:column;gap:4px;min-width:0;width:100%}
.cot-spec .nick{font-size:18px;line-height:1.15;font-weight:750;letter-spacing:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cot-spec .veh{color:#abbecb;font-size:11px;line-height:1.2;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cot-spec .cursor-hint{color:#bdcbd4;font-size:10px;line-height:1.3;letter-spacing:0}
.cot-spec .cursor-hint[hidden],.cot-spec .idx[hidden]{display:none}
.cot-spec .switch{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;align-items:center;gap:3px;min-width:0;padding:0;background:none;border:0}
.cot-spec .idx{font-size:9px;font-weight:650;font-variant-numeric:tabular-nums;line-height:1.5;color:#d9e6ed;text-align:center;white-space:nowrap;text-shadow:0 1px 3px #000,0 0 8px #000}
.cot-spec :is(.cycle,.gar){position:relative;isolation:isolate;display:flex;align-items:center;justify-content:center;
 min-width:0;min-height:48px;margin:0;padding:7px 12px;border:0;border-radius:0;background:none;box-shadow:none;
 color:#e8f0f5;font:inherit;cursor:pointer;pointer-events:auto;filter:drop-shadow(0 2px 4px #0008);transition:color .15s ease,transform .15s ease;}
.cot-spec :is(.cycle,.gar)::before,.cot-spec :is(.cycle,.gar)::after{content:'';position:absolute;inset:0;z-index:-2;clip-path:var(--spec-cut);background:#7e949e}
.cot-spec :is(.cycle,.gar)::after{inset:1px;z-index:-1;background:linear-gradient(155deg,#203440f2,#081219f5)}
.cot-spec .cycle{flex-direction:column;gap:3px;padding:7px 10px}
.cot-spec .cycle-icon{display:flex;order:0;color:#ffd18b}.cot-spec .cycle-icon svg{width:14px;height:14px;display:block}
.cot-spec .cycle kbd{order:1;display:block;padding:0;border:0;background:none;box-shadow:none;color:#a9bdc9;font:700 10px/1.1 ui-monospace,monospace}
.cot-spec .gar{flex-direction:column;gap:4px;color:#ffc46b;text-transform:uppercase;font-size:9px;font-weight:800;letter-spacing:.1em}
.cot-spec .gar::before{background:#c29550}.cot-spec .gar::after{background:linear-gradient(155deg,#342c1df2,#141c20f5)}
.cot-spec .gar-icon,.cot-spec .gar-icon svg{display:block;width:20px;height:20px}
.cot-spec :is(.cycle,.gar):focus-visible{outline:2px solid #ffe1a5;outline-offset:3px}
.cot-spec :is(.cycle,.gar):active{transform:translateY(1px)}
.cot-spec .cycle:disabled{opacity:.35;cursor:default;transform:none}
@media(hover:hover){.cot-spec :is(.cycle,.gar):hover:not(:disabled)::before{background:#ffd18b}.cot-spec :is(.cycle,.gar):hover:not(:disabled)::after{background:#30404bef}}
@keyframes cotSpecSw{from{opacity:.35;transform:translateY(3px)}to{opacity:1;transform:none}}
.cot-spec .who.sw{animation:cotSpecSw .18s ease-out}
@media(max-width:900px){
 .cot-spec{grid-template-columns:minmax(0,1fr) 144px 64px;gap:8px}
 .cot-spec .subject{grid-template-columns:48px minmax(0,1fr);gap:7px;padding:8px 14px 8px 10px}
 .cot-spec .portrait,.cot-spec .portrait img{width:48px;height:46px}.cot-spec .nick{font-size:15px}.cot-spec .veh{font-size:10px}
 .cot-spec .gar{font-size:8px;letter-spacing:.04em}
}
body.cot-touch-layout .cot-spec .cycle kbd{display:none}
body.cot-touch-layout .cot-spec .cursor-hint{display:none}
@media(max-width:600px){.cot-spec{grid-template-columns:minmax(0,1fr) 144px 48px;gap:6px}.cot-spec .gar>span:last-child{display:none}.cot-spec .spec-status{font-size:8px;letter-spacing:.08em}.cot-spec .nick{font-size:14px}}
@media(max-width:400px) and (orientation:portrait){
 .cot-spec{grid-template-columns:minmax(0,1fr) 88px;gap:7px 12px}
 .cot-spec .subject{grid-column:1/-1}.cot-spec .switch{width:144px;justify-self:center}
 .cot-spec .gar>span:last-child{display:block}
}
@media(prefers-reduced-motion:reduce){.cot-spec,.cot-spec .who.sw,.cot-spec .cycle,.cot-spec .gar{animation:none;transition:none}}
`;
