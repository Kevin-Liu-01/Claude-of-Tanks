import { FONT_STACK } from './fonts.ts';

// The damage panel on the direction's grammar (brand-ui H4, bui01/src/pages/06-battle-hud.html .dp): the HUD plate, the
// hull points as a large readout over the 20-cell bar, the camera-up plan on its grid, the mounted equipment in hairline
// cells, the fire as a danger chip. The plan itself (damagePanel.ts) is unchanged: every marker at its exact anchor.
export const DAMAGE_PANEL_CSS = `
/* (the lower corners share one 16 px floor: the panel and the dial stood 4 px below the tray and the map, gauntlet r2) */
.cot-dp{position:absolute;z-index:var(--hud-layer-controls);left:12px;bottom:16px;width:136px;pointer-events:none;
  font-family:${FONT_STACK};color:var(--ink-1);background:var(--hud-plate);border:0;border-radius:var(--r1);
  box-shadow:var(--battle-plate-shadow);padding:8px 9px 9px;-webkit-user-select:none;user-select:none;}
.cot-dp *{box-sizing:border-box;margin:0;padding:0;}
.cot-dp .hprow{display:flex;align-items:baseline;gap:4px;margin-bottom:7px;white-space:nowrap;overflow:hidden;}
.cot-dp .hplabel{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);}
.cot-dp .hpnum{font:500 var(--battle-fs-28)/.9 var(--font-mono);color:var(--ink-1);}
.cot-dp .hpmax{min-width:0;overflow:hidden;text-overflow:clip;font:500 var(--battle-fs-fig-12)/1 var(--font-mono);color:var(--ink-3);}
.cot-dp .hptrack{display:grid;grid-template-columns:repeat(20,minmax(0,1fr));gap:2px;height:7px;margin-bottom:9px;}
.cot-dp .hptrack i{background:var(--fill-scale);}
.cot-dp .hptrack i.on{background:var(--ink-1);}
.cot-dp .hptrack[data-tone=warn] i.on{background:var(--warn);}
.cot-dp .hptrack[data-tone=danger] i.on{background:var(--danger);}
.cot-dp canvas{display:block;margin:0 auto;border-radius:var(--r1);box-shadow:var(--ring-1);
  background:linear-gradient(var(--line-1) 1px,transparent 1px) center/23px 23px,
    linear-gradient(90deg,var(--line-1) 1px,transparent 1px) center/23px 23px,
    radial-gradient(70% 55% at 50% 50%,var(--fill-scale),transparent);}
/* EQUIPMENT SYSTEM: the mounted loadout in hairline cells under the plan (the direction's .eqr); hides itself when the
   tank runs empty. */
.cot-dp .equiprow{display:flex;gap:6px;margin-top:8px;}
.cot-dp .equiprow:empty{display:none;}
.cot-dp .equiprow .eq{display:grid;place-items:center;width:28px;height:26px;border-radius:var(--r1);box-shadow:var(--ring-2);
  color:var(--ink-2);}
.cot-dp .equiprow .eq svg{display:block;}
.cot-dp .fire{position:absolute;top:52px;left:13px;display:none;padding:4px 7px;border-radius:var(--r1);
  font:600 var(--battle-fs-11)/1 var(--hud-font);letter-spacing:var(--track-label-s);text-transform:uppercase;color:var(--text-danger);
  background:var(--hud-plate-strong);box-shadow:var(--battle-chip-danger);
  animation:cotFirePulse var(--dur-stage) ease-in-out infinite alternate;}
body.cot-touch-layout .cot-dp .hpnum{font-size:var(--battle-fs-18);}
/* the narrow touch strip (112-150 px, the plan hidden there: touchControls.ts): the points and their maximum on one line */
body.cot-touch-layout:is([data-cot-width='phone'],[data-cot-width='compact'],[data-cot-height-density='tight']) .cot-dp .hpnum{font-size:var(--battle-fs-15);}
body.cot-touch-layout:is([data-cot-width='phone'],[data-cot-width='compact'],[data-cot-height-density='tight']) .cot-dp .hpmax{font-size:var(--battle-fs-fig-11);}
:lang(zh-CN) .cot-dp .fire{font-size:var(--battle-fs-13);}
@keyframes cotFirePulse{from{opacity:.55}to{opacity:1}}
`;
