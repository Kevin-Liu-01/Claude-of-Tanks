import { FONT_STACK, FONT_COND } from './fonts.ts';

export const DAMAGE_PANEL_CSS = `
.cot-dp{position:absolute;z-index:var(--hud-layer-controls,24);left:12px;bottom:12px;width:136px;pointer-events:none;
  font-family:${FONT_STACK};color:#e6edf3;background:linear-gradient(180deg,rgba(10,14,18,.72),rgba(6,9,12,.8));
  border:1px solid rgba(146,164,180,.25);box-shadow:0 6px 22px rgba(0,0,0,.5);
  padding:7px 8px 8px;-webkit-user-select:none;user-select:none;}
.cot-dp *{box-sizing:border-box;margin:0;padding:0;}
.cot-dp .hprow{display:flex;align-items:baseline;
  gap:6px;margin-bottom:3px;}
.cot-dp .hplabel{font-size:9px;font-weight:700;letter-spacing:.12em;color:#8a97a3;
  font-family:${FONT_COND};white-space:nowrap;}
.cot-dp .hpnum{font-size:11px;font-weight:700;color:#d6e2ec;font-variant-numeric:tabular-nums;
  font-family:${FONT_COND};letter-spacing:-.01em;white-space:nowrap;margin-left:auto;text-align:right;}
.cot-dp .hptrack{height:5px;background:rgba(4,6,8,.75);border:1px solid rgba(0,0,0,.6);margin-bottom:5px;}
.cot-dp .hpfill{height:100%;width:100%;transition:width .15s linear;}
.cot-dp canvas{display:block;margin:0 auto;}
/* EQUIPMENT SYSTEM: mounted-loadout readout — three quiet glyphs at healthy-
   pip alpha under the schematic; hides itself when the tank runs empty. */
.cot-dp .equiprow{display:flex;justify-content:center;gap:8px;margin-top:6px;
  padding-top:5px;border-top:1px solid rgba(146,164,180,.16);}
.cot-dp .equiprow:empty{display:none;}
.cot-dp .equiprow .eq{display:flex;opacity:.5;}
.cot-dp .equiprow .eq svg{display:block;}
.cot-dp .fire{position:absolute;top:34px;right:10px;font-size:9px;font-weight:800;
  letter-spacing:.14em;color:#ff6a3c;text-shadow:0 0 8px rgba(255,80,30,.8);display:none;
  animation:cotFirePulse .7s ease-in-out infinite alternate;}
@keyframes cotFirePulse{from{opacity:.55}to{opacity:1}}
`;

