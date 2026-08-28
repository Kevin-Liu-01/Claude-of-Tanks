/**
 * studioPanel.js — SCENE STUDIO control panel (src/game/studio.js's UI).
 *
 * Workspace layout: one scrollable, grouped workspace (Battlefield / Tanks /
 * Effects / Global / Output). The panel stays a THIN VIEW over the studio API
 * — every control
 * calls the same window.__STUDIO methods the scripted shoot uses, so
 * anything staged by hand round-trips through state()/load() unchanged.
 *
 * Layout: right workspace dock, top-left phase badge with EXIT,
 * bottom-left key hints + live camera readout.
 */
import { FONT_STACK, ensureFonts } from './fonts.ts';
import { iconUrl } from './icons.ts';
import { MAP_HEROES, MAP_THUMBS } from './mapThumbs.ts';
import { FEATURED_SHOTS } from './featuredShots.ts';
import { mountMediaArchive } from '../presentation/mediaArchive.js';
import { PRODUCT_STATS } from '../productStats.js';
import { vehicleEraLabel } from '../vehicles/taxonomy.js';
import { createInfoButton } from './contextInfo.js';

const STUDIO_GROUP_INFO = Object.freeze({
  Battlefield: 'Choose the live battlefield, seed, and environmental foundation used by the current composition.',
  Tanks: 'Add first-party playable vehicles, then stage their position, facing, turret, gun, camouflage, and damage state.',
  Effects: 'Schedule the same pooled firing, impact, destruction, weather, and battlefield effects used by the game.',
  Cinematics: 'Build a bounded camera storyboard and actor tracks on the deterministic Scene Studio timeline.',
  Output: 'Capture stills or video, copy the complete scene JSON, and restore a composition with the same Studio load contract.',
});

const STUDIO_SECTION_INFO = Object.freeze({
  Map: 'Select any live battlefield and preserve its deterministic environment in the scene JSON.',
  'Add tanks': 'Add a vehicle from the shipped roster to the current composition.',
  'Selected tank': 'Edit the selected actor’s pose, paint, state, and scene identity.',
  'Layers & events': 'Place and time gameplay-authentic effects against actors or a terrain marker.',
  Storyboard: 'Camera shots, actor keys, effects, and the playhead share one bounded deterministic timeline.',
  Camera: 'Move the live camera or capture its current transform into the storyboard.',
  'Video · Stills · Scene': 'The complete JSON in this info panel can be copied and passed directly to window.__STUDIO.load(recipe).',
  'Production archive': 'Each field frame with an info icon exposes the complete Scene Studio JSON used to reproduce it.',
});

const CSS = `
.cot-studio{position:fixed;inset:0;z-index:58;display:none;pointer-events:none;
  font-family:${FONT_STACK};color:#e6edf3;-webkit-user-select:none;user-select:none;}
.cot-studio *{box-sizing:border-box;margin:0;padding:0;}
.cot-studio .badge{position:absolute;top:16px;left:20px;pointer-events:auto;display:flex;
  align-items:center;gap:10px;padding:8px 12px;background:rgba(6,9,12,.85);
  border:1px solid rgba(190,204,216,.28);border-left:3px solid #e69a2d;backdrop-filter:blur(4px);}
.cot-studio .badge .bm{width:18px;height:18px;object-fit:contain;display:block;}
.cot-studio .badge .t{font-size:12px;font-weight:800;letter-spacing:.26em;color:#ffd27a;}
.cot-studio .badge .m{font-size:10px;font-weight:700;letter-spacing:.14em;color:#8a97a3;}
.cot-studio .badge button{display:inline-flex;align-items:center;gap:5px;}
.cot-studio .badge button img{display:block;width:18px;height:15px;object-fit:contain;}
.cot-studio .busy{position:absolute;top:16px;left:50%;transform:translateX(-50%);
  padding:8px 18px;background:rgba(6,9,12,.88);border:1px solid rgba(230,154,45,.5);
  color:#ffd27a;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;display:none;}
.cot-studio .dock{position:absolute;top:0;right:0;bottom:0;width:390px;pointer-events:auto;
  background:rgba(5,8,11,.94);border-left:1px solid rgba(210,221,230,.17);
  box-shadow:-12px 0 28px rgba(0,0,0,.26);backdrop-filter:blur(12px) saturate(.85);
  padding:16px 14px 28px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;
  scrollbar-color:rgba(230,154,45,.4) transparent;}
.cot-studio .dock::-webkit-scrollbar{width:7px;}
.cot-studio .dock::-webkit-scrollbar-thumb{background:rgba(230,154,45,.35);}
.cot-studio .pgroup{position:relative;margin-bottom:19px;}
.cot-studio .pgroup+.pgroup{padding-top:2px;}
.cot-studio .ghead{display:grid;grid-template-columns:28px minmax(0,1fr) 20px;align-items:center;
  column-gap:8px;margin:0 2px 8px;}
.cot-studio .gnum{grid-row:1 / 3;align-self:stretch;display:flex;align-items:center;justify-content:center;
  border-right:1px solid rgba(230,154,45,.42);font-size:9px;font-weight:900;letter-spacing:.08em;
  color:#e69a2d;}
.cot-studio .gtitle{font-size:11px;font-weight:900;letter-spacing:.23em;color:#dce5ec;
  line-height:1.25;text-transform:uppercase;}
.cot-studio .gsub{font-size:7.5px;font-weight:700;letter-spacing:.12em;color:#65727d;
  line-height:1.45;text-transform:uppercase;}
.cot-studio .ghead>.cot-info-trigger{grid-column:3;grid-row:1/3;align-self:center;justify-self:end}
.cot-studio .gbody{display:grid;gap:7px;}
.cot-studio .sec{position:relative;border:1px solid rgba(190,204,216,.17);
  background:rgba(10,15,20,.68);padding:10px 10px 9px;}
.cot-studio .sec::before{content:'';position:absolute;top:-1px;left:-1px;width:3px;height:17px;
  background:#e69a2d;}
.cot-studio .sec>.h{font-size:10px;font-weight:800;letter-spacing:.24em;color:#c9d4dd;
  text-transform:uppercase;margin-bottom:9px;border-bottom:1px solid rgba(190,204,216,.16);
  padding-bottom:6px;padding-left:7px;display:flex;justify-content:space-between;align-items:baseline;}
.cot-studio .sec>.h .sub{font-size:8px;color:#5f6b76;letter-spacing:.1em;font-weight:700;}
.cot-studio .sec>.h .sub{min-width:0;margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cot-studio .sec>.h>.cot-info-trigger{margin-left:6px;flex:none}
.cot-studio .cot-info-trigger{width:20px;height:20px;min-width:20px;min-height:20px;max-width:20px;max-height:20px;
  padding:0;display:inline-grid;place-items:center;border:1px solid rgba(154,174,189,.3);border-radius:50%;
  background:rgba(8,12,16,.76);color:#9aabb8;font-size:inherit;line-height:1;letter-spacing:0;text-transform:none;box-shadow:none}
.cot-studio .row{display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;}
.cot-studio label.k{font-size:9px;font-weight:700;letter-spacing:.12em;color:#8a97a3;
  text-transform:uppercase;min-width:52px;}
.cot-studio input[type=range]{flex:1;-webkit-appearance:none;appearance:none;height:16px;
  min-width:60px;background:transparent;}
.cot-studio input[type=range]::-webkit-slider-runnable-track{height:3px;
  background:linear-gradient(90deg,rgba(230,154,45,.55),rgba(190,204,216,.22));}
.cot-studio input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:11px;height:13px;
  margin-top:-5px;background:linear-gradient(180deg,#ffc169,#e69a2d);border:1px solid #0b0f12;}
.cot-studio input[type=range]::-moz-range-track{height:3px;background:rgba(190,204,216,.22);}
.cot-studio input[type=range]::-moz-range-thumb{width:10px;height:12px;border-radius:0;
  background:#e69a2d;border:1px solid #0b0f12;}
.cot-studio input[type=number],.cot-studio input[type=text]{width:58px;background:rgba(4,7,10,.9);
  border:1px solid rgba(190,204,216,.25);color:#ffd27a;font-family:${FONT_STACK};
  font-size:11px;font-weight:700;padding:3px 5px;}
.cot-studio input[type=text]{width:100%;}
.cot-studio select{background:rgba(4,7,10,.9);border:1px solid rgba(190,204,216,.25);
  color:#e6edf3;font-family:${FONT_STACK};font-size:11px;font-weight:600;padding:4px 5px;flex:1;min-width:0;}
.cot-studio button{cursor:pointer;background:linear-gradient(180deg,rgba(26,34,42,.95),rgba(15,21,27,.95));
  color:#d8e0e7;border:1px solid rgba(190,204,216,.3);font-family:${FONT_STACK};font-size:9.5px;
  font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:5px 8px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05);}
.cot-studio button:hover{border-color:#e69a2d;color:#ffd27a;}
.cot-studio button:focus-visible,.cot-studio input:focus-visible,.cot-studio select:focus-visible{
  outline:2px solid #ffd27a;outline-offset:1px;}
.cot-studio button.on{background:linear-gradient(180deg,#8a5a14,#5c3a0a);
  border-color:#ffc169;color:#fff2d9;}
.cot-studio button.prime{background:linear-gradient(180deg,#ffa02e,#d95f00);
  border-color:#ffc169;color:#fff7ea;font-size:11px;padding:8px 10px;width:100%;
  letter-spacing:.2em;}
.cot-studio button.warn{border-color:rgba(240,90,90,.55);color:#f0a0a0;}
.cot-studio .grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;}
.cot-studio .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;}
/* --- battlefield picker ----------------------------------------------------- */
.cot-studio .mapPick{position:relative;width:100%;}
.cot-studio .mapBtn{position:relative;display:block;width:100%;height:148px;padding:0;overflow:hidden;
  text-align:left;border-color:rgba(190,204,216,.32);background:#111820;}
.cot-studio .mapBtn:hover{border-color:#e69a2d;}
.cot-studio .mapBtn:disabled{cursor:wait;opacity:.78;}
.cot-studio .mapBtn .mhero{display:block;width:100%;height:100%;object-fit:cover;
  transform:scale(1.01);transition:transform .2s ease,filter .2s ease;}
.cot-studio .mapBtn:hover .mhero{transform:scale(1.035);filter:saturate(1.08);}
.cot-studio .mapBtn .mshade{position:absolute;inset:42% 0 0;background:linear-gradient(180deg,transparent,
  rgba(4,7,10,.35) 25%,rgba(4,7,10,.94) 100%);pointer-events:none;}
.cot-studio .mapBtn .mcopy{position:absolute;left:11px;right:42px;bottom:10px;min-width:0;}
.cot-studio .mapBtn .mn{display:block;font-size:13px;font-weight:900;letter-spacing:.07em;color:#fff3db;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 2px 7px #000;}
.cot-studio .mapBtn .mid{position:absolute;top:9px;left:9px;padding:3px 6px;
  background:rgba(4,7,10,.78);border:1px solid rgba(255,255,255,.2);font-size:7px;font-weight:900;
  letter-spacing:.16em;color:#ffd27a;}
.cot-studio .mapBtn .mar{position:absolute;right:10px;bottom:12px;width:22px;height:22px;display:grid;
  place-items:center;background:rgba(4,7,10,.74);border:1px solid rgba(255,255,255,.2);
  color:#ffd27a;font-size:8px;}
.cot-studio .mapPop{position:absolute;top:calc(100% + 5px);left:0;right:0;z-index:20;display:none;
  max-height:min(65vh,560px);background:rgba(5,8,11,.99);border:1px solid rgba(230,154,45,.55);
  box-shadow:0 18px 54px rgba(0,0,0,.8);}
.cot-studio .mapPop.open{display:flex;flex-direction:column;}
.cot-studio .mapPopHead{display:flex;align-items:center;justify-content:space-between;padding:8px 9px 7px;
  border-bottom:1px solid rgba(190,204,216,.15);font-size:8px;font-weight:900;letter-spacing:.2em;
  color:#aebbc6;text-transform:uppercase;}
.cot-studio .mapPopHead span:last-child{color:#687784;letter-spacing:.08em;}
.cot-studio .mapGrid{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:max-content;
  align-content:start;flex:1;min-height:0;gap:7px;padding:8px;overflow-y:auto;
  overscroll-behavior:contain;scrollbar-width:thin;
  scrollbar-color:rgba(230,154,45,.4) transparent;}
.cot-studio .mapCard{position:relative;display:block;min-width:0;padding:0 0 7px;overflow:hidden;
  align-self:start;text-align:left;text-transform:none;background:rgba(14,19,24,.9);
  border:1px solid rgba(190,204,216,.2);}
.cot-studio .mapCard:hover{border-color:rgba(230,154,45,.72);color:#ffd27a;}
.cot-studio .mapCard[aria-selected="true"]{border-color:#e69a2d;
  box-shadow:inset 0 -2px 0 #e69a2d;background:rgba(52,36,12,.6);}
.cot-studio .mapCard img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;margin-bottom:6px;
  background:#111820;}
.cot-studio .mapCard .cn{display:block;padding:0 7px;font-size:9px;font-weight:900;letter-spacing:.045em;
  color:#e6edf3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cot-studio .mapCard .check{position:absolute;top:5px;right:5px;display:none;width:18px;height:18px;
  place-items:center;background:#e69a2d;color:#111820;font-size:10px;box-shadow:0 2px 8px #000;}
.cot-studio .mapCard[aria-selected="true"] .check{display:grid;}
/* tank silhouette icon (public/icons/<id>_side_silhouette.png, mask-tinted) */
.cot-studio .tic{flex:none;background:#cfd9e2;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
  -webkit-mask-position:center;mask-position:center;-webkit-mask-size:contain;mask-size:contain;}
/* --- tank picker ------------------------------------------------------------ */
.cot-studio .pick{position:relative;width:100%;}
.cot-studio .pickBtn{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;
  text-align:left;letter-spacing:.06em;font-size:10.5px;}
.cot-studio .pickBtn .tic{width:44px;height:17px;}
.cot-studio .pickBtn .nm{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.cot-studio .pickBtn .ar{color:#8a97a3;font-size:8px;}
.cot-studio .pickPop{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:5;display:none;
  background:rgba(5,8,11,.98);border:1px solid rgba(230,154,45,.45);max-height:328px;
  box-shadow:0 14px 40px rgba(0,0,0,.7);}
.cot-studio .pickPop.open{display:flex;flex-direction:column;}
.cot-studio .pickPop .flt{margin:7px;width:calc(100% - 14px);}
.cot-studio .pickPop .lst{overflow-y:auto;scrollbar-width:thin;
  scrollbar-color:rgba(230,154,45,.4) transparent;}
.cot-studio .pickPop .lst::-webkit-scrollbar{width:7px;}
.cot-studio .pickPop .lst::-webkit-scrollbar-thumb{background:rgba(230,154,45,.35);}
.cot-studio .prow{display:flex;align-items:center;gap:8px;padding:4px 8px;cursor:pointer;
  border-left:2px solid transparent;}
.cot-studio .prow:hover{background:rgba(52,36,12,.55);border-left-color:#e69a2d;}
.cot-studio .prow.cur{background:rgba(52,36,12,.4);border-left-color:#ffd27a;}
.cot-studio .prow .tic{width:46px;height:17px;}
.cot-studio .prow .nm{flex:1;font-size:10.5px;font-weight:700;color:#e6edf3;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;}
.cot-studio .prow .era{font-size:7.5px;font-weight:800;letter-spacing:.12em;color:#8a97a3;
  border:1px solid rgba(190,204,216,.25);padding:1px 4px;text-transform:uppercase;}
.cot-studio .prow .dev{font-size:7px;font-weight:900;letter-spacing:.12em;color:#8fd0ff;
  border:1px solid rgba(103,191,255,.55);background:rgba(21,62,92,.32);padding:2px 4px;}
.cot-studio .pgh{padding:5px 8px 3px;font-size:8px;font-weight:800;letter-spacing:.2em;
  color:#e69a2d;text-transform:uppercase;border-bottom:1px solid rgba(190,204,216,.12);}
/* --- actor list -------------------------------------------------------------- */
.cot-studio .alist{max-height:168px;overflow-y:auto;scrollbar-width:thin;margin-bottom:6px;}
.cot-studio .arow{display:flex;align-items:center;gap:7px;padding:4px 6px;cursor:pointer;
  border:1px solid transparent;border-left:2px solid rgba(190,204,216,.2);margin-bottom:3px;
  background:rgba(14,19,24,.6);}
.cot-studio .arow:hover{border-color:rgba(230,154,45,.4);}
.cot-studio .arow.sel{border-color:#e69a2d;border-left-color:#ffd27a;background:rgba(52,36,12,.55);}
.cot-studio .arow .tic{width:40px;height:15px;}
.cot-studio .arow.st-bad .tic{background:#e0766a;}
.cot-studio .arow.st-warn .tic{background:#e0b46a;}
.cot-studio .arow .nm{flex:1;font-size:10.5px;font-weight:700;color:#e6edf3;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;}
.cot-studio .arow .st{font-size:7.5px;font-weight:800;letter-spacing:.08em;color:#8a97a3;
  text-transform:uppercase;}
.cot-studio .arow.st-bad .st{color:#e0766a;}
.cot-studio .arow.st-warn .st{color:#e0b46a;}
.cot-studio .arow .del{padding:1px 6px;font-size:10px;}
/* --- selected actor header ---------------------------------------------------- */
.cot-studio .selhead{display:flex;align-items:center;gap:9px;margin-bottom:8px;
  padding:6px 8px;background:rgba(14,19,24,.7);border:1px solid rgba(190,204,216,.16);}
.cot-studio .selhead .tic{width:56px;height:21px;background:#ffd27a;}
.cot-studio .selhead .nm{flex:1;min-width:0;}
.cot-studio .selhead .nm .n1{font-size:12px;font-weight:800;color:#ffd27a;letter-spacing:.05em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cot-studio .selhead .nm .n2{font-size:8px;font-weight:700;color:#8a97a3;letter-spacing:.14em;
  text-transform:uppercase;}
/* --- effects board ------------------------------------------------------------ */
.cot-studio .fxg{margin-bottom:8px;}
.cot-studio .fxg:last-child{margin-bottom:0;}
.cot-studio .fxg .gh{font-size:8px;font-weight:800;letter-spacing:.22em;color:#e69a2d;
  text-transform:uppercase;margin-bottom:5px;display:flex;align-items:center;gap:6px;}
.cot-studio .fxg .gh::after{content:'';flex:1;height:1px;background:rgba(230,154,45,.25);}
.cot-studio .fxstack{max-height:188px;overflow-y:auto;margin-bottom:8px;scrollbar-width:thin;
  scrollbar-color:rgba(230,154,45,.4) transparent;}
.cot-studio .fxempty{padding:10px 7px;border:1px dashed rgba(190,204,216,.2);color:#687784;
  font-size:8.5px;line-height:1.5;letter-spacing:.1em;text-align:center;text-transform:uppercase;}
.cot-studio .fxrow{display:grid;grid-template-columns:8px minmax(0,1fr) 54px auto;align-items:center;gap:7px;
  min-height:38px;padding:5px 5px 5px 7px;margin-bottom:3px;cursor:pointer;background:rgba(14,19,24,.72);
  border:1px solid transparent;border-left:2px solid rgba(190,204,216,.22);}
.cot-studio .fxrow:hover,.cot-studio .fxrow:focus-visible{border-color:rgba(230,154,45,.5);outline:none;}
.cot-studio .fxrow.sel{border-color:#e69a2d;border-left-color:#ffd27a;background:rgba(52,36,12,.62);}
.cot-studio .fxrow .pip{width:6px;height:6px;border-radius:50%;background:#e69a2d;
  box-shadow:0 0 7px rgba(255,177,70,.65);}
.cot-studio .fxrow .fn{min-width:0;}
.cot-studio .fxrow .fn .n1{font-size:9.5px;font-weight:800;color:#dce5ec;letter-spacing:.1em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase;}
.cot-studio .fxrow .fn .n2{font-size:7.5px;font-weight:700;color:#7d8c98;letter-spacing:.08em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase;margin-top:2px;}
.cot-studio .fxrow.sel .fn .n1{color:#ffd27a;}
.cot-studio .fxrow .ftime{width:54px;font-size:9px;text-align:right;padding:3px 4px;}
.cot-studio .fxrow .del{padding:2px 6px;font-size:10px;}
.cot-studio .fxstackbar{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;}
.cot-studio .fxstackbar .hint{font-size:7.5px;color:#71808d;letter-spacing:.08em;text-transform:uppercase;}
/* --- cinematic storyboard ---------------------------------------------------- */
.cot-studio .storyClock{display:flex;align-items:center;justify-content:space-between;margin:5px 0 7px;
  color:#ffd27a;font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;}
.cot-studio .storyClock .limit{color:#71808d;font-size:7.5px;letter-spacing:.08em;}
.cot-studio .scrub{width:100%;display:block;margin:1px 0 8px;}
.cot-studio .timelineBoard{display:grid;gap:3px;margin:7px 0 8px;padding:5px;
  background:rgba(3,6,9,.78);border:1px solid rgba(190,204,216,.16);}
.cot-studio .tlane{display:grid;grid-template-columns:34px minmax(0,1fr);align-items:center;gap:5px;}
.cot-studio .tlane>.lbl{font-size:7px;font-weight:900;letter-spacing:.13em;color:#71808d;text-align:right;}
.cot-studio .tltrack{position:relative;height:18px;cursor:crosshair;overflow:hidden;
  background:linear-gradient(90deg,rgba(230,154,45,.05),rgba(190,204,216,.04));
  border-left:1px solid rgba(230,154,45,.45);border-right:1px solid rgba(190,204,216,.16);}
.cot-studio .tltrack::before{content:'';position:absolute;inset:0;
  background:repeating-linear-gradient(90deg,transparent 0,transparent calc(10% - 1px),rgba(190,204,216,.1) calc(10% - 1px),rgba(190,204,216,.1) 10%);}
.cot-studio .tlmarker{position:absolute;top:4px;width:8px;height:10px;transform:translateX(-50%);
  border:0;padding:0;background:#e69a2d;box-shadow:0 0 5px rgba(230,154,45,.55);z-index:2;}
.cot-studio .tlmarker.actor{background:#7fc7ff;}
.cot-studio .tlmarker.fx{width:6px;border-radius:50%;background:#ef6d58;}
.cot-studio .tlmarker.sel{outline:2px solid #fff2d9;outline-offset:1px;}
.cot-studio .playhead{position:absolute;top:0;bottom:0;width:1px;background:#fff2d9;
  box-shadow:0 0 5px #ffd27a;pointer-events:none;z-index:3;}
.cot-studio .shotboard{display:grid;gap:4px;max-height:154px;overflow-y:auto;margin:6px 0 8px;}
.cot-studio .shotcard{display:grid;grid-template-columns:28px minmax(0,1fr) 66px 24px 28px;align-items:center;
  gap:5px;padding:5px;background:rgba(14,19,24,.72);border:1px solid rgba(190,204,216,.17);}
.cot-studio .shotcard.sel{border-color:#e69a2d;background:rgba(52,36,12,.62);}
.cot-studio .shotcard .num{font-size:8px;font-weight:900;color:#e69a2d;text-align:center;}
.cot-studio .shotcard .copy{min-width:0;cursor:pointer;}
.cot-studio .shotcard .name{font-size:9px;font-weight:900;color:#dce5ec;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cot-studio .shotcard .time{font-size:7.5px;font-weight:700;color:#71808d;margin-top:2px;}
.cot-studio .shotcard select{font-size:8px;padding:3px;}
.cot-studio .shotcard .del{padding:2px 5px;}
.cot-studio .recStatus{margin:6px 0;font-size:8px;font-weight:800;letter-spacing:.1em;
  color:#71808d;text-transform:uppercase;text-align:center;}
.cot-studio .recStatus.on{color:#ff806b;animation:studioRecPulse 1s ease-in-out infinite;}
@keyframes studioRecPulse{50%{opacity:.45;}}
.cot-studio .foot{position:absolute;left:20px;bottom:14px;pointer-events:none;
  font-size:10px;font-weight:600;letter-spacing:.08em;color:#9fb0bf;
  text-shadow:0 1px 4px rgba(0,0,0,.9);line-height:1.7;}
.cot-studio .foot .cam{color:#ffd27a;font-weight:700;}
.cot-studio .val{font-size:10px;font-weight:800;color:#ffd27a;min-width:34px;text-align:right;}
.cot-studio-archive{width:min(94vw,1560px);max-width:none;padding:0;border:1px solid rgba(190,204,216,.32);
  background:#05080b;color:#e6edf3;box-shadow:0 36px 140px rgba(0,0,0,.82);font-family:${FONT_STACK};}
.cot-studio-archive::backdrop{background:rgba(1,3,5,.9);backdrop-filter:blur(10px);}
.cot-studio-archive>header{display:flex;align-items:end;justify-content:space-between;gap:24px;padding:22px 24px 18px;
  border-bottom:1px solid rgba(190,204,216,.17);background:linear-gradient(120deg,rgba(230,154,45,.1),transparent 55%);}
.cot-studio-archive>header small,.cot-studio-archive>header strong,.cot-studio-archive>header span{display:block;}
.cot-studio-archive>header small{color:#e69a2d;font-size:8px;font-weight:900;letter-spacing:.2em;text-transform:uppercase;}
.cot-studio-archive>header strong{margin-top:5px;font-size:clamp(26px,4vw,50px);line-height:.95;text-transform:uppercase;}
.cot-studio-archive>header span{margin-top:7px;color:#84939f;font-size:10px;}
.cot-studio-archive>header button{width:42px;height:42px;padding:0;border:1px solid rgba(190,204,216,.24);
  background:transparent;color:#ffd27a;font-size:22px;}
.cot-studio-archive .archiveBody{padding:18px 18px 24px;}
`;

/**
 * Build the studio panel.
 * @param {object} S the studio API (createStudio's `api`)
 * @returns {object} { root, show, hide, tick, setBusy, setSelected,
 *   setPlaceArmed, refreshActors, refreshSelected, refreshCamera,
 *   refreshTime, refreshAll }
 */
export function createStudioPanel(S) {
  ensureFonts();
  if (!document.getElementById('cot-studio-css')) {
    const st = document.createElement('style');
    st.id = 'cot-studio-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  const root = el('div', 'cot-studio');
  document.body.appendChild(root);

  /** Tinted side-silhouette icon for a tank id (mask, so one PNG serves any tint). */
  function tankIcon(id, cls = 'tic') {
    const d = el('div', cls);
    const u = `url(${iconUrl(id, 'side_silhouette')})`;
    d.style.webkitMaskImage = u;
    d.style.maskImage = u;
    return d;
  }

  // --- top badge -------------------------------------------------------------
  const badge = el('div', 'badge');
  const badgeMark = document.createElement('img');
  badgeMark.className = 'bm';
  badgeMark.src = '/brand/nav/studio.svg';
  badgeMark.alt = '';
  badgeMark.draggable = false;
  const badgeTitle = el('div', 't', 'SCENE STUDIO');
  const badgeMap = el('div', 'm', '');
  const galleryBtn = el('button');
  galleryBtn.innerHTML = '<img src="/brand/nav/tank-gallery.svg" alt="">TANK GALLERY';
  galleryBtn.addEventListener('click', () => {
    const id = S._internal.selected?.spec?.id;
    window.location.href = id ? `/gallery?id=${encodeURIComponent(id)}` : '/gallery';
  });
  const exitBtn = el('button', null, 'EXIT (F8)');
  exitBtn.addEventListener('click', () => S.exit());
  badge.append(badgeMark, badgeTitle, badgeMap, galleryBtn, exitBtn);
  root.appendChild(badge);

  const busy = el('div', 'busy');
  root.appendChild(busy);

  // --- right dock --------------------------------------------------------------
  const dock = el('div', 'dock');
  root.appendChild(dock);
  // keep canvas drag-look from firing when interacting with the dock
  for (const evName of ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'keydown']) {
    dock.addEventListener(evName, (e) => e.stopPropagation());
  }

  // === BATTLEFIELD group ===
  const battlefieldGroup = panelGroup('01', 'Battlefield', 'Map & environment');
  dock.appendChild(battlefieldGroup.root);
  const secScene = section('Map', `${PRODUCT_STATS.battlefields} live battlefields`);
  const mapPick = el('div', 'mapPick');
  const mapBtn = el('button', 'mapBtn');
  mapBtn.type = 'button';
  mapBtn.setAttribute('aria-haspopup', 'listbox');
  mapBtn.setAttribute('aria-expanded', 'false');
  mapBtn.setAttribute('aria-label', 'Choose battlefield');
  const mapHero = document.createElement('img');
  mapHero.className = 'mhero';
  mapHero.alt = '';
  mapHero.draggable = false;
  const mapShade = el('span', 'mshade');
  const mapCopy = el('span', 'mcopy');
  const mapName = el('span', 'mn');
  mapCopy.append(mapName);
  const mapId = el('span', 'mid');
  const mapArrow = el('span', 'mar', '▼');
  mapBtn.append(mapHero, mapShade, mapCopy, mapId, mapArrow);
  const mapPop = el('div', 'mapPop');
  mapPop.setAttribute('role', 'listbox');
  mapPop.setAttribute('aria-label', 'Battlefields');
  const mapPopHead = el('div', 'mapPopHead');
  mapPopHead.append(el('span', null, 'Choose battlefield'), el('span', null, 'Preview · click to load'));
  const mapGrid = el('div', 'mapGrid');
  const mapCards = new Map();
  const mapImages = [];
  for (const id of S.MAP_IDS) {
    const info = S.getMapInfo ? S.getMapInfo(id) : { name: id };
    const card = el('button', 'mapCard');
    card.type = 'button';
    card.dataset.mapId = id;
    card.setAttribute('role', 'option');
    card.setAttribute('aria-selected', 'false');
    card.setAttribute('aria-label', `Load ${info.name || id}`);
    const thumb = document.createElement('img');
    thumb.alt = '';
    thumb.loading = 'lazy';
    thumb.decoding = 'async';
    thumb.dataset.src = MAP_THUMBS[id] || '';
    mapImages.push(thumb);
    card.append(
      thumb,
      el('span', 'cn', info.name || id),
      el('span', 'check', '✓'),
    );
    card.addEventListener('click', () => chooseMap(id));
    mapCards.set(id, card);
    mapGrid.appendChild(card);
  }
  mapPop.append(mapPopHead, mapGrid);
  mapPick.append(mapBtn, mapPop);
  secScene.appendChild(mapPick);
  battlefieldGroup.body.appendChild(secScene);

  let mapPreviewsHydrated = false;
  function hydrateMapPreviews() {
    if (mapPreviewsHydrated) return;
    mapPreviewsHydrated = true;
    for (const image of mapImages) {
      if (image.dataset.src) image.src = image.dataset.src;
    }
  }
  function toggleMapPick(open) {
    const next = open != null ? open : !mapPop.classList.contains('open');
    mapPop.classList.toggle('open', next);
    mapBtn.setAttribute('aria-expanded', String(next));
    mapArrow.textContent = next ? '▲' : '▼';
    if (next) {
      hydrateMapPreviews();
      requestAnimationFrame(() => mapCards.get(S.mapId)?.focus({ preventScroll: true }));
    }
  }
  function setMapLoading(loading) {
    mapBtn.disabled = loading;
    mapPick.setAttribute('aria-busy', String(loading));
    for (const card of mapCards.values()) card.disabled = loading;
  }
  function chooseMap(id) {
    toggleMapPick(false);
    if (!id || id === S.mapId) return;
    setMapLoading(true);
    Promise.resolve(S.setMap(id))
      .catch((error) => flashBusy(`MAP FAILED: ${error.message}`))
      .finally(() => {
        setMapLoading(false);
        api.refreshMap();
      });
  }
  mapBtn.addEventListener('click', () => toggleMapPick());
  mapPop.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      toggleMapPick(false);
      mapBtn.focus();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (mapPop.classList.contains('open') && !mapPick.contains(event.target)) toggleMapPick(false);
  });

  // === TANKS group ===
  const tanksGroup = panelGroup('02', 'Tanks', 'Roster, staging & pose');
  dock.appendChild(tanksGroup.root);
  const secActors = section('Add tanks', 'the shipped roster');
  // -- tank picker (icon rows, filterable) --
  let pickedId = 'm1a2';
  const pick = el('div', 'pick');
  const pickBtn = el('button', 'pickBtn');
  const pickIcon = tankIcon(pickedId);
  const pickName = el('span', 'nm', '');
  const pickArrow = el('span', 'ar', '▼');
  pickBtn.append(pickIcon, pickName, pickArrow);
  const pickPop = el('div', 'pickPop');
  const pickFlt = document.createElement('input');
  pickFlt.type = 'text';
  pickFlt.className = 'flt';
  pickFlt.placeholder = 'FILTER…';
  const pickList = el('div', 'lst');
  pickPop.append(pickFlt, pickList);
  pick.append(pickBtn, pickPop);
  secActors.appendChild(pick);

  const specInfo = (id) => {
    try { return S.getSpecInfo(id); } catch (_) { return { id, name: id, era: '' }; }
  };
  function setPicked(id) {
    pickedId = id;
    const info = specInfo(id);
    pickName.textContent = info.name;
    const u = `url(${iconUrl(id, 'side_silhouette')})`;
    pickIcon.style.webkitMaskImage = u;
    pickIcon.style.maskImage = u;
  }
  function buildPickList(filter = '') {
    pickList.textContent = '';
    const f = filter.trim().toLowerCase();
    const groups = [
      ['Production roster', S.TANK_IDS.filter((id) => !specInfo(id).developmentOnly)],
      ['Development roster', S.TANK_IDS.filter((id) => specInfo(id).developmentOnly)],
    ];
    for (const [label, ids] of groups) {
      const hits = ids.filter((id) => {
        if (!f) return true;
        const info = specInfo(id);
        return id.toLowerCase().includes(f) || String(info.name).toLowerCase().includes(f);
      });
      if (!hits.length) continue;
      pickList.appendChild(el('div', 'pgh', label));
      for (const id of hits) {
        const info = specInfo(id);
        const row = el('div', 'prow' + (id === pickedId ? ' cur' : ''));
        row.appendChild(tankIcon(id));
        row.appendChild(el('span', 'nm', info.name));
        if (info.developmentOnly) row.appendChild(el('span', 'dev', info.rosterTag || 'DEV'));
        if (info.era) row.appendChild(el('span', 'era', vehicleEraLabel(info.era, { short: true })));
        row.addEventListener('click', () => {
          setPicked(id);
          togglePick(false);
        });
        pickList.appendChild(row);
      }
    }
  }
  function togglePick(open) {
    const o = open != null ? open : !pickPop.classList.contains('open');
    pickPop.classList.toggle('open', o);
    if (o) {
      pickFlt.value = '';
      buildPickList();
      pickFlt.focus();
    }
  }
  pickBtn.addEventListener('click', () => togglePick());
  pickFlt.addEventListener('input', () => buildPickList(pickFlt.value));
  pickFlt.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') togglePick(false);
    if (e.key === 'Enter') {
      const first = pickList.querySelector('.prow');
      if (first) first.click();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (pickPop.classList.contains('open') && !pick.contains(e.target)) togglePick(false);
  });
  setPicked(pickedId);

  const addRow2 = el('div', 'grid');
  addRow2.style.marginTop = '6px';
  const addAtMarker = el('button', null, 'ADD IN VIEW');
  addAtMarker.title = 'Uses the terrain marker when set; otherwise places at the camera focus';
  addAtMarker.addEventListener('click', () => {
    const point = S._internal.markerActive
      ? S._internal.markerPos
      : (() => {
        const camera = S.getCamera();
        return { x: camera.lookAt[0], z: camera.lookAt[2] };
      })();
    S.addActor({ id: pickedId, pos: [point.x, point.z] });
  });
  const placeBtn = el('button', null, 'CLICK TO PLACE');
  placeBtn.addEventListener('click', () => {
    S._internal.placeArmed = S._internal.placeArmed ? null : pickedId;
    api.setPlaceArmed(S._internal.placeArmed);
  });
  addRow2.append(addAtMarker, placeBtn);
  secActors.appendChild(addRow2);
  const alist = el('div', 'alist');
  alist.style.marginTop = '6px';
  secActors.appendChild(alist);
  tanksGroup.body.appendChild(secActors);

  // === SELECTED ACTOR section ===
  const secSel = section('Selected tank', 'pose, paint & state');
  const selHead = el('div', 'selhead');
  const selIcon = tankIcon('m1a2');
  const selNames = el('div', 'nm');
  const selN1 = el('div', 'n1', '');
  const selN2 = el('div', 'n2', '');
  selNames.append(selN1, selN2);
  selHead.append(selIcon, selNames);
  secSel.appendChild(selHead);
  const facing = sliderRow('Facing', 0, 360, 1, (v) => patchSel({ facingDeg: v }));
  const turret = sliderRow('Turret', -180, 180, 1, (v) => patchSel({ turretDeg: v }));
  const gun = sliderRow('Gun', -10, 25, 0.5, (v) => patchSel({ gunDeg: v }));
  secSel.append(facing.row, turret.row, gun.row);
  const posRow = el('div', 'row');
  posRow.appendChild(el('label', 'k', 'Pos X/Z'));
  const px = numInput((v) => patchSel({ x: v }));
  const pz = numInput((v) => patchSel({ z: v }));
  posRow.append(px, pz);
  secSel.appendChild(posRow);
  const camoRow = el('div', 'row');
  camoRow.appendChild(el('label', 'k', 'Camo'));
  const camoSel = document.createElement('select');
  for (const cid of ['inherit', ...S.CAMO_PATTERN_IDS]) {
    const o = document.createElement('option');
    o.value = cid;
    o.textContent = cid === 'inherit' ? '(garage pick)' : cid.toUpperCase();
    camoSel.appendChild(o);
  }
  camoSel.addEventListener('change', () => patchSel({ camo: camoSel.value === 'inherit' ? null : camoSel.value }));
  camoRow.appendChild(camoSel);
  secSel.appendChild(camoRow);
  const stateRow = el('div', 'row');
  stateRow.appendChild(el('label', 'k', 'State'));
  const stateSel = document.createElement('select');
  for (const sid of S.ACTOR_STATES) {
    const o = document.createElement('option');
    o.value = sid;
    o.textContent = sid.toUpperCase();
    stateSel.appendChild(o);
  }
  stateSel.addEventListener('change', () => {
    const a = S._internal.selected;
    if (a) S.setActorState(a, stateSel.value);
  });
  stateRow.appendChild(stateSel);
  secSel.appendChild(stateRow);
  const delRow = el('div', 'grid');
  const recoilBtn = el('button', null, 'RECOIL POSE');
  recoilBtn.addEventListener('click', () => patchSel({ recoilAgeS: 0.05 }));
  const delBtn = el('button', 'warn', 'REMOVE');
  delBtn.addEventListener('click', () => { const a = S._internal.selected; if (a) S.removeActor(a); });
  delRow.append(recoilBtn, delBtn);
  secSel.appendChild(delRow);
  tanksGroup.body.appendChild(secSel);

  // === EFFECTS group ===
  const effectsGroup = panelGroup('03', 'Effects', 'Game-authentic layers & events');
  dock.appendChild(effectsGroup.root);
  const secFx = section('Layers & events', 'sel tank · else marker');
  const fxStackBar = el('div', 'fxstackbar');
  fxStackBar.appendChild(el('div', 'hint', 'select a layer · delete removes only it'));
  const clearStackBtn = el('button', 'warn', 'CLEAR ALL');
  clearStackBtn.addEventListener('click', () => S.clearEffects());
  fxStackBar.appendChild(clearStackBtn);
  const fxStack = el('div', 'fxstack');
  fxStack.setAttribute('role', 'listbox');
  fxStack.setAttribute('aria-label', 'Authored effects');
  secFx.append(fxStackBar, fxStack);
  const selOr = (fn, needActor = false) => {
    const a = S._internal.selected;
    if (needActor && !a) { flashBusy('SELECT AN ACTOR FIRST'); return null; }
    return fn(a);
  };
  const atMarker = (fn) => {
    if (!S._internal.markerActive) {
      flashBusy('CLICK THE BATTLEFIELD TO PLACE THE FX MARKER');
      return null;
    }
    return fn();
  };
  const fireProjectile = (effect) => {
    const fired = S.effect(effect);
    // A shell born on a frozen timeline is still at its muzzle. Advance one
    // real simulation frame so the button immediately shows the projectile
    // and its improved tracer profile without unfreezing the composition.
    if (fired && S.timeScale === 0) S.advanceFx(1000 / 60);
    return fired;
  };
  /** actor-anchored when one is selected, marker-anchored otherwise */
  const impactFx = (kind, hFrac = 0.55, caliberMm = 120) => selOr((a) => S.effect({
    type: 'impact', actor: a.uid, hFrac, params: { kind, caliberMm, normal: [0.15, 0.35, -0.92] },
  }), true);
  function fxGroup(title, defs) {
    const g = el('div', 'fxg');
    g.appendChild(el('div', 'gh', title));
    const grid = el('div', 'grid');
    for (const [label, fn, wide] of defs) {
      const b = el('button', null, label);
      if (wide) b.style.gridColumn = '1 / -1';
      b.addEventListener('click', fn);
      grid.appendChild(b);
    }
    g.appendChild(grid);
    secFx.appendChild(g);
  }
  fxGroup('Gunnery', [
    ['FIRE GUN', () => selOr((a) => fireProjectile({ type: 'fire', actor: a.uid }), true)],
    ['MUZZLE FLASH', () => selOr((a) => S.effect(a
      ? { type: 'muzzle_flash', actor: a.uid } : { type: 'muzzle_flash' }))],
    ['MG BURST', () => selOr((a) => S.effect({ type: 'mg_burst', actor: a.uid }), true)],
    ['RECOIL + FLASH', () => selOr((a) => S.effect({ type: 'firing_moment', actor: a.uid, params: { ageS: 0.05 } }), true)],
    ['TRACER MARKER → ACTOR', () => selOr((a) => {
      if (!S._internal.markerActive) {
        flashBusy('CLICK THE BATTLEFIELD TO PLACE THE TRACER ORIGIN');
        return false;
      }
      const m = S._internal.markerPos;
      const t = a.state.pos;
      fireProjectile({
        type: 'tracer',
        from: [m.x, m.y + 1.8, m.z],
        to: [t.x, t.y + a.spec.dims.heightM * 0.6, t.z],
        params: { shellType: 'APFSDS' },
      });
    }, true), true],
  ]);
  fxGroup('Strikes · at marker', [
    ['EXPL SMALL', () => atMarker(() => S.effect({ type: 'explosion', params: { size: 'small' } }))],
    ['EXPL MEDIUM', () => atMarker(() => S.effect({ type: 'explosion', params: { size: 'medium' } }))],
    ['EXPL LARGE', () => atMarker(() => S.effect({ type: 'explosion', params: { size: 'large' } }))],
    ['BARRAGE ×5', () => atMarker(() => S.effect({ type: 'barrage', params: { count: 5, radiusM: 10 } }))],
    ['DUST BURST', () => atMarker(() => S.effect({ type: 'dust' }))],
    ['SPARKS', () => atMarker(() => S.effect({ type: 'sparks' }))],
    ['FROZEN FIREBALL', () => atMarker(() => S.effect({
      type: 'explosion_moment', params: { ageS: 0.6 },
    })), true],
  ]);
  fxGroup('Armor hits · sel actor', [
    ['IMPACT PEN', () => impactFx('pen', 0.55)],
    ['NON-PEN', () => impactFx('nonpen', 0.5)],
    ['RICOCHET', () => impactFx('ricochet', 0.72)],
    ['HE SPLASH', () => impactFx('he_splash', 0.5, 152)],
    ['ERA POP', () => impactFx('era', 0.45)],
    ['ARMOR SCARS', () => selOr((a) => S.effect({ type: 'armor_scar', actor: a.uid }), true)],
  ]);
  fxGroup('Vehicle state', [
    ['KILL · AMMO-RACK', () => selOr((a) => S.effect({ type: 'tank_kill', actor: a.uid }), true)],
    ['KILL · BURN-OUT', () => selOr((a) => S.effect({ type: 'tank_kill', actor: a.uid, params: { cause: 'fire', pop: false } }), true)],
    ['DETRACK L', () => selOr((a) => S.effect({ type: 'detrack', actor: a.uid, params: { side: 'L' } }), true)],
    ['DETRACK R', () => selOr((a) => S.effect({ type: 'detrack', actor: a.uid, params: { side: 'R' } }), true)],
    ['EXHAUST BELCH', () => selOr((a) => S.effect({ type: 'exhaust', actor: a.uid }), true)],
    ['ENGINE SMOKE', () => selOr((a) => S.effect({ type: 'engine_smoke', actor: a.uid }), true)],
    ['SET BURNING', () => selOr((a) => S.effect({ type: 'burning', actor: a.uid }), true)],
    ['EXTINGUISH', () => selOr((a) => {
      S.effect({ type: 'burning', actor: a.uid, params: { off: true } });
      S.effect({ type: 'engine_smoke', actor: a.uid, params: { off: true } });
    }, true)],
  ]);
  effectsGroup.body.appendChild(secFx);

  // === GLOBAL group ===
  const globalGroup = panelGroup('04', 'Cinematics', 'Storyboard, rail & choreography');
  globalGroup.root.dataset.group = 'global'; // stable automation selector
  dock.appendChild(globalGroup.root);
  const secTime = section('Storyboard', 'camera · actors · effects · 20 s max');
  const duration = sliderRow('Length', 1, 20, 0.5, (v) => S.setStoryboardDuration(v * 1000));
  secTime.appendChild(duration.row);
  const ts = sliderRow('Speed', 0.25, 2, 0.05, (v) => S.setTimeScale(v));
  secTime.appendChild(ts.row);
  const timeRow = el('div', 'grid3');
  const restartBtn = el('button', null, 'RESTART');
  restartBtn.addEventListener('click', () => S.stop());
  const pauseBtn = el('button', null, 'PLAY');
  pauseBtn.addEventListener('click', () => (S.playing ? S.pause() : S.play()));
  const stepBtn = el('button', null, '+1 FRAME');
  stepBtn.addEventListener('click', () => { S.pause(); S.seek(S.fxTimeMs + 1000 / 30); });
  timeRow.append(restartBtn, pauseBtn, stepBtn);
  secTime.appendChild(timeRow);
  const clockLine = el('div', 'storyClock');
  const clockNow = el('span', null, '00.00 / 12.00 S');
  const clockLimit = el('span', 'limit', 'MAX 20 S');
  clockLine.append(clockNow, clockLimit);
  secTime.appendChild(clockLine);
  const scrub = document.createElement('input');
  scrub.type = 'range';
  scrub.className = 'scrub';
  scrub.min = '0';
  scrub.max = String(S.durationMs);
  scrub.step = '10';
  scrub.value = '0';
  scrub.setAttribute('aria-label', 'Storyboard playhead');
  let scrubFrame = 0;
  scrub.addEventListener('input', () => {
    cancelAnimationFrame(scrubFrame);
    scrubFrame = requestAnimationFrame(() => S.seek(Number(scrub.value)));
  });
  secTime.appendChild(scrub);

  const timelineBoard = el('div', 'timelineBoard');
  function timelineLane(label) {
    const lane = el('div', 'tlane');
    lane.appendChild(el('div', 'lbl', label));
    const track = el('div', 'tltrack');
    track.addEventListener('pointerdown', (event) => {
      if (event.target !== track) return;
      const rect = track.getBoundingClientRect();
      S.seek(((event.clientX - rect.left) / Math.max(1, rect.width)) * S.durationMs);
    });
    lane.appendChild(track);
    timelineBoard.appendChild(lane);
    return track;
  }
  const cameraLane = timelineLane('CAM');
  const actorLane = timelineLane('TANK');
  const effectLane = timelineLane('FX');
  secTime.appendChild(timelineBoard);

  const authorRow = el('div', 'grid');
  const addShotBtn = el('button', null, 'ADD CAMERA SHOT');
  addShotBtn.addEventListener('click', () => S.addCameraShot());
  const keyActorBtn = el('button', null, 'KEY SELECTED TANK');
  keyActorBtn.addEventListener('click', () => {
    const actor = S._internal.selected;
    if (!actor) { flashBusy('SELECT A TANK FIRST'); return; }
    S.keyActor(actor);
  });
  authorRow.append(addShotBtn, keyActorBtn);
  secTime.appendChild(authorRow);
  const railRow = el('div', 'grid');
  railRow.style.marginTop = '5px';
  const railBtn = el('button', null, 'SHOW CAMERA RAIL');
  railBtn.addEventListener('click', () => S.setRailVisible(!S.railVisible));
  const clearTrackBtn = el('button', 'warn', 'CLEAR TANK TRACK');
  clearTrackBtn.addEventListener('click', () => {
    const actor = S._internal.selected;
    if (!actor) { flashBusy('SELECT A TANK FIRST'); return; }
    S.clearActorTrack(actor);
  });
  railRow.append(railBtn, clearTrackBtn);
  secTime.appendChild(railRow);
  const duelBtn = el('button', 'prime', 'DIRECT 12 S DUEL');
  duelBtn.style.marginTop = '6px';
  duelBtn.title = 'Uses the first two staged tanks and replaces cinematic tracks and effects';
  duelBtn.addEventListener('click', () => {
    try {
      S.directDuel();
      flashBusy('12 SECOND DUEL STORYBOARD READY');
    } catch (error) {
      flashBusy(error.message);
    }
  });
  secTime.appendChild(duelBtn);
  const shotboard = el('div', 'shotboard');
  secTime.appendChild(shotboard);
  const resetFxBtn = el('button', 'warn', 'CLEAR ALL EFFECTS');
  resetFxBtn.style.cssText = 'width:100%;margin-top:2px;';
  resetFxBtn.addEventListener('click', () => S.clearEffects());
  secTime.appendChild(resetFxBtn);
  globalGroup.body.appendChild(secTime);

  // === CAMERA section ===
  const secCam = section('Camera');
  const camModeRow = el('div', 'grid');
  const flyBtn = el('button', null, 'FREE-FLY');
  const orbBtn = el('button', null, 'ORBIT');
  flyBtn.addEventListener('click', () => { S.setCamera({ mode: 'fly' }); api.refreshCamera(); });
  orbBtn.addEventListener('click', () => {
    const a = S._internal.selected;
    const m = S._internal.markerPos;
    const t = a ? a.state.pos : m;
    S.setCamera({ mode: 'orbit', lookAt: [t.x, t.y + 1.6, t.z] });
    api.refreshCamera();
  });
  camModeRow.append(flyBtn, orbBtn);
  secCam.appendChild(camModeRow);
  const fov = sliderRow('FOV', 15, 100, 1, (v) => S.setCamera({ fov: v }));
  const roll = sliderRow('Roll', -45, 45, 0.5, (v) => S.setCamera({ rollDeg: v }));
  const spd = sliderRow('Speed', 2, 60, 1, (v) => { S._internal.cam.speed = v; });
  secCam.append(fov.row, roll.row, spd.row);
  globalGroup.body.appendChild(secCam);

  // === OUTPUT group ===
  const outputGroup = panelGroup('05', 'Output', 'Capture & scene files');
  dock.appendChild(outputGroup.root);
  const secCap = section('Video · Stills · Scene', 'record, render, save & restore');
  const videoRow = el('div', 'row');
  videoRow.appendChild(el('label', 'k', 'Video'));
  const fpsSel = document.createElement('select');
  for (const [label, fps] of [['60 FPS · 12 Mbps', 60], ['30 FPS · 12 Mbps', 30]]) {
    const option = document.createElement('option');
    option.value = String(fps);
    option.textContent = label;
    fpsSel.appendChild(option);
  }
  videoRow.appendChild(fpsSel);
  secCap.appendChild(videoRow);
  const recordBtn = el('button', 'prime', 'RECORD VIDEO');
  recordBtn.addEventListener('click', () => {
    if (S.recordingStatus().active) {
      S.stopRecording();
      return;
    }
    S.recordVideo({ fps: Number(fpsSel.value), download: true })
      .then((result) => flashBusy(`VIDEO SAVED · ${(result.size / 1048576).toFixed(1)} MB`))
      .catch((error) => flashBusy(`RECORD FAILED: ${error.message}`));
    api.refreshStoryboard();
  });
  secCap.appendChild(recordBtn);
  const recStatus = el('div', 'recStatus', 'READY · VIDEO FOLLOWS STORYBOARD ONCE');
  secCap.appendChild(recStatus);
  const capRow = el('div', 'row');
  capRow.style.marginTop = '8px';
  capRow.appendChild(el('label', 'k', 'Width'));
  const capSel = document.createElement('select');
  for (const [label, w] of [['2560 px', 2560], ['3200 px', 3200], ['3840 px', 3840], ['5120 px', 5120]]) {
    const o = document.createElement('option');
    o.value = String(w);
    o.textContent = label;
    capSel.appendChild(o);
  }
  capRow.appendChild(capSel);
  secCap.appendChild(capRow);
  const capBtn = el('button', null, 'CAPTURE PNG');
  capBtn.style.width = '100%';
  capBtn.addEventListener('click', () => {
    S.capture({ width: parseInt(capSel.value, 10), download: true });
  });
  secCap.appendChild(capBtn);
  const svRow = el('div', 'grid3');
  svRow.style.marginTop = '6px';
  const saveBtn = el('button', null, 'SAVE JSON');
  saveBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(S.state(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `studio_scene_${S.mapId || 'map'}_${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
  const loadBtn = el('button', null, 'LOAD JSON');
  const fileIn = document.createElement('input');
  fileIn.type = 'file';
  fileIn.accept = 'application/json,.json';
  fileIn.style.display = 'none';
  fileIn.addEventListener('change', () => {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    f.text().then((txt) => S.load(JSON.parse(txt)))
      .catch((err) => flashBusy(`LOAD FAILED: ${err.message}`));
    fileIn.value = '';
  });
  loadBtn.addEventListener('click', () => fileIn.click());
  const copyBtn = el('button', null, 'COPY JSON');
  copyBtn.addEventListener('click', () => {
    const txt = JSON.stringify(S.state());
    if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {});
    flashBusy('SCENE JSON COPIED');
  });
  svRow.append(saveBtn, loadBtn, copyBtn);
  secCap.append(svRow, fileIn);
  // localStorage slots
  const slotRow = el('div', 'grid3');
  slotRow.style.marginTop = '5px';
  for (let i = 1; i <= 3; i++) {
    const b = el('button', null, `SLOT ${i}`);
    b.title = 'Click: load · Shift-click: save';
    b.addEventListener('click', (e) => {
      const key = `cot.studio.slot${i}.v1`;
      if (e.shiftKey) {
        try {
          localStorage.setItem(key, JSON.stringify(S.state()));
          flashBusy(`SAVED SLOT ${i}`);
        } catch (_) { flashBusy('SAVE FAILED'); }
      } else {
        const txt = localStorage.getItem(key);
        if (!txt) { flashBusy(`SLOT ${i} EMPTY (shift-click saves)`); return; }
        S.load(JSON.parse(txt)).catch((err) => flashBusy(`LOAD FAILED: ${err.message}`));
      }
    });
    slotRow.appendChild(b);
  }
  secCap.appendChild(slotRow);
  outputGroup.body.appendChild(secCap);

  const secArchive = section('Production archive', '50 new deterministic field frames');
  const archiveCopy = el('div', 'fxempty', 'Open live gunnery, destruction, terrain, and vehicle references without leaving your scene.');
  const archiveBtn = el('button', null, 'OPEN FIELD FRAMES · 61');
  archiveBtn.style.width = '100%';
  archiveBtn.addEventListener('click', () => {
    let dialog = document.querySelector('.cot-studio-archive');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'cot-studio-archive';
      dialog.innerHTML = '<header><div><small>Scene Studio // shared component</small><strong>Field frames.</strong><span>Current renderer references for composition, lighting, effects, and vehicle staging.</span></div><button type="button" aria-label="Close field frames">×</button></header><div class="archiveBody" data-media-archive></div>';
      dialog.querySelector('button').addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
      document.body.appendChild(dialog);
    }
    dialog.showModal();
    mountMediaArchive(dialog.querySelector('[data-media-archive]'), { mode: 'compact', limit: 61 })
      .catch((error) => flashBusy(error.message));
  });
  secArchive.append(archiveCopy, archiveBtn);
  outputGroup.body.appendChild(secArchive);

  // --- footer hints ------------------------------------------------------------
  const foot = el('div', 'foot');
  const footCam = el('div', 'cam', '');
  const footHint = el('div', null,
    'LMB-drag look · WASD fly · Q/E height · Shift fast · wheel dolly · ' +
    'click terrain = marker · click tank = select · drag tank = move · Space freeze · F8 exit');
  foot.append(footCam, footHint);
  root.appendChild(foot);

  // --- helpers -------------------------------------------------------------------
  function el(tag, cls, text) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    return d;
  }
  function studioInfoImages(title) {
    if (title === 'Tanks' || title === 'Add tanks' || title === 'Selected tank') {
      const id = S._internal.selected?.spec?.id || pickedId;
      if (!id) return [];
      const info = specInfo(id);
      return [{
        src: iconUrl(id, 'angle'),
        alt: `${info.name || id} Studio vehicle render`,
        fit: 'contain',
        caption: `${info.name || id} // Studio actor`,
      }, {
        src: iconUrl(id, 'modules_side'),
        alt: `${info.name || id} internal module layout`,
        fit: 'contain',
        caption: `${info.name || id} // module layout`,
      }];
    }
    const src = MAP_HEROES[S.mapId] || MAP_THUMBS[S.mapId];
    if (!src) return [];
    const info = S.getMapInfo ? S.getMapInfo(S.mapId) : { name: S.mapId };
    const shot = FEATURED_SHOTS.find((entry) => entry.maps?.includes(S.mapId)) || FEATURED_SHOTS[0];
    return [{
      src,
      alt: `${info.name || S.mapId} Studio battlefield`,
      caption: `${info.name || S.mapId} // current production canvas`,
    }, shot ? {
      src: shot.img,
      alt: shot.cap,
      caption: `${shot.cap} // authored Scene Studio output`,
    } : null].filter(Boolean);
  }
  function section(title, sub) {
    const s = el('div', 'sec');
    const h = el('div', 'h', title);
    if (sub) h.appendChild(el('span', 'sub', sub));
    const help = STUDIO_SECTION_INFO[title];
    if (help) h.appendChild(createInfoButton({
      label: `About ${title}`,
      title,
      text: help,
      json: title === 'Video · Stills · Scene' ? () => S.state() : null,
      images: () => studioInfoImages(title),
    }));
    s.appendChild(h);
    return s;
  }
  function panelGroup(index, title, sub) {
    const groupRoot = el('section', 'pgroup');
    groupRoot.dataset.group = title.toLowerCase();
    const head = el('div', 'ghead');
    head.append(
      el('span', 'gnum', index),
      el('div', 'gtitle', title),
      el('div', 'gsub', sub),
    );
    const help = STUDIO_GROUP_INFO[title];
    if (help) head.appendChild(createInfoButton({
      label: `About ${title}`,
      title,
      text: help,
      images: () => studioInfoImages(title),
    }));
    const body = el('div', 'gbody');
    groupRoot.append(head, body);
    return { root: groupRoot, body };
  }
  function sliderRow(label, min, max, step, onInput) {
    const row = el('div', 'row');
    row.appendChild(el('label', 'k', label));
    const r = document.createElement('input');
    r.type = 'range';
    r.min = String(min);
    r.max = String(max);
    r.step = String(step);
    const val = el('div', 'val', '');
    r.addEventListener('input', () => {
      val.textContent = r.value;
      onInput(parseFloat(r.value));
    });
    row.append(r, val);
    return {
      row, input: r,
      set(v) { r.value = String(v); val.textContent = String(Math.round(v * 10) / 10); },
      setRange(mn, mx) { r.min = String(mn); r.max = String(mx); },
    };
  }
  function numInput(onChange) {
    const n = document.createElement('input');
    n.type = 'number';
    n.step = '1';
    n.addEventListener('change', () => onChange(parseFloat(n.value) || 0));
    return n;
  }
  function patchSel(patch) {
    const a = S._internal.selected;
    if (a) { S.updateActor(a, patch); }
  }
  let busyTimer = 0;
  function flashBusy(text) {
    api.setBusy(text);
    clearTimeout(busyTimer);
    busyTimer = setTimeout(() => api.setBusy(null), 1600);
  }
  /** amber/red tinting class for an actor row by damage state */
  function stateClass(name) {
    if (name === 'engine-smoking') return ' st-warn';
    if (name === 'burning' || name === 'wrecked' || name === 'wrecked-burnt'
      || name === 'turret-popped') return ' st-bad';
    return '';
  }

  function effectAnchorLabel(effect) {
    if (effect.actor != null) return `ACTOR ${String(effect.actor)}`;
    if (effect.from && effect.to) return 'FLIGHT PATH';
    if (effect.at) return `POINT ${effect.at.map((v) => Number(v).toFixed(1)).join(' / ')}`;
    return 'MAP MARKER';
  }

  function rebuildEffectList() {
    fxStack.textContent = '';
    const effects = S.listEffects();
    if (!effects.length) {
      fxStack.appendChild(el('div', 'fxempty', 'No effects yet · choose an effect below'));
      return;
    }
    for (const effect of effects) {
      const row = el('div', 'fxrow' + (effect.selected ? ' sel' : ''));
      row.tabIndex = 0;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(effect.selected));
      row.dataset.effectId = effect.id;
      row.appendChild(el('span', 'pip'));
      const names = el('div', 'fn');
      names.append(
        el('div', 'n1', effect.type.replaceAll('_', ' ')),
        el('div', 'n2', `${effectAnchorLabel(effect)} · T ${(effect.tMs / 1000).toFixed(2)} S`),
      );
      row.appendChild(names);
      const time = document.createElement('input');
      time.type = 'number';
      time.className = 'ftime';
      time.min = '0';
      time.max = String(S.durationMs / 1000);
      time.step = '0.05';
      time.value = (effect.tMs / 1000).toFixed(2);
      time.title = 'Effect time in seconds';
      time.setAttribute('aria-label', `${effect.type.replaceAll('_', ' ')} time in seconds`);
      time.addEventListener('pointerdown', (event) => event.stopPropagation());
      time.addEventListener('click', (event) => event.stopPropagation());
      time.addEventListener('change', (event) => {
        event.stopPropagation();
        S.updateEffect(effect.id, { tMs: Number(time.value) * 1000 });
      });
      row.appendChild(time);
      const del = el('button', 'del warn', '✕');
      del.title = `Delete ${effect.type.replaceAll('_', ' ')}`;
      del.setAttribute('aria-label', del.title);
      del.addEventListener('click', (event) => {
        event.stopPropagation();
        S.removeEffect(effect.id);
      });
      row.appendChild(del);
      row.addEventListener('click', () => S.selectEffect(effect.id));
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          S.selectEffect(effect.id);
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault();
          S.removeEffect(effect.id);
        }
      });
      fxStack.appendChild(row);
    }
  }

  function addTimelineMarker(track, className, timeMs, title, onClick, selected = false) {
    const marker = el('button', `tlmarker ${className}${selected ? ' sel' : ''}`);
    marker.type = 'button';
    marker.style.left = `${Math.max(0, Math.min(100, (timeMs / Math.max(1, S.durationMs)) * 100))}%`;
    marker.title = title;
    marker.setAttribute('aria-label', title);
    marker.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
    track.appendChild(marker);
  }

  function addPlayhead(track) {
    const playhead = el('div', 'playhead');
    playhead.style.left = `${Math.max(0, Math.min(100, (S.fxTimeMs / Math.max(1, S.durationMs)) * 100))}%`;
    track.appendChild(playhead);
  }

  function rebuildStoryboard() {
    const board = S.getStoryboard();
    cameraLane.textContent = '';
    actorLane.textContent = '';
    effectLane.textContent = '';
    shotboard.querySelectorAll('.cot-info-trigger').forEach((button) => button.disposeInfo?.());
    shotboard.textContent = '';
    board.shots.forEach((shot, index) => {
      addTimelineMarker(
        cameraLane,
        'camera',
        shot.tMs,
        `${shot.label} at ${(shot.tMs / 1000).toFixed(2)} seconds`,
        () => S.selectCameraShot(shot.id),
        shot.id === S.selectedShotId,
      );
      const card = el('div', `shotcard${shot.id === S.selectedShotId ? ' sel' : ''}`);
      card.appendChild(el('div', 'num', String(index + 1).padStart(2, '0')));
      const copy = el('div', 'copy');
      copy.append(
        el('div', 'name', shot.label),
        el('div', 'time', `${(shot.tMs / 1000).toFixed(2)} S · FOV ${Math.round(shot.fov)}`),
      );
      copy.addEventListener('click', () => S.selectCameraShot(shot.id));
      card.appendChild(copy);
      const transition = document.createElement('select');
      transition.setAttribute('aria-label', `${shot.label} transition`);
      for (const id of ['smooth', 'linear', 'cut']) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = id.toUpperCase();
        transition.appendChild(option);
      }
      transition.value = shot.transition;
      transition.addEventListener('change', () => S.updateCameraShot(shot.id, {
        transition: transition.value,
      }));
      card.appendChild(transition);
      card.appendChild(createInfoButton({
        label: `Show the Scene Studio JSON for ${shot.label}`,
        title: `Replicate ${shot.label}`,
        json: () => ({ ...S.state(), fxTime: shot.tMs, timeScale: 0 }),
        images: () => studioInfoImages('Storyboard'),
      }));
      const del = el('button', 'del warn', '✕');
      del.title = `Remove ${shot.label}`;
      del.setAttribute('aria-label', del.title);
      del.addEventListener('click', () => S.removeCameraShot(shot.id));
      card.appendChild(del);
      shotboard.appendChild(card);
    });
    for (const track of board.actorTracks) {
      for (const key of track.keys) {
        addTimelineMarker(
          actorLane,
          'actor',
          key.tMs,
          `${track.actor} pose at ${(key.tMs / 1000).toFixed(2)} seconds`,
          () => S.seek(key.tMs),
        );
      }
    }
    for (const effect of S.listEffects()) {
      addTimelineMarker(
        effectLane,
        'fx',
        effect.tMs,
        `${effect.type.replaceAll('_', ' ')} at ${(effect.tMs / 1000).toFixed(2)} seconds`,
        () => { S.selectEffect(effect.id); S.seek(effect.tMs); },
        effect.selected,
      );
    }
    addPlayhead(cameraLane);
    addPlayhead(actorLane);
    addPlayhead(effectLane);
    if (!board.shots.length) {
      shotboard.appendChild(el('div', 'fxempty', 'Add two camera shots to create a rail'));
    }
  }

  // --- public panel API -------------------------------------------------------
  let refreshAcc = 0;
  const api = {
    root,
    show() { root.style.display = 'block'; api.refreshAll(); },
    hide() { root.style.display = 'none'; togglePick(false); toggleMapPick(false); },
    setBusy(text) {
      busy.style.display = text ? 'block' : 'none';
      if (text) busy.textContent = text;
    },
    setPlaceArmed(specId) {
      placeBtn.classList.toggle('on', !!specId);
      placeBtn.textContent = specId ? `CLICK MAP TO PLACE ${specId.toUpperCase()}` : 'CLICK TO PLACE';
    },
    setSelected(actor) {
      api.refreshActors();
      api.refreshStoryboard();
    },
    setSelectedEffect(effect) {
      api.refreshEffects();
    },
    refreshActors() {
      alist.textContent = '';
      const sel = S._internal.selected;
      S._internal.actors.forEach((a) => {
        const row = el('div', 'arow' + (a === sel ? ' sel' : '') + stateClass(a.stateName));
        row.appendChild(tankIcon(a.spec.id));
        row.appendChild(el('div', 'nm', `${a.name ? a.name + ' · ' : ''}${a.spec.name}`));
        row.appendChild(el('div', 'st', a.stateName));
        const del = el('button', 'del', '✕');
        del.addEventListener('click', (e) => { e.stopPropagation(); S.removeActor(a); });
        row.appendChild(del);
        row.addEventListener('click', () => S.selectActor(a.uid));
        alist.appendChild(row);
      });
      api.refreshSelected();
    },
    refreshSelected() {
      const a = S._internal.selected;
      secSel.style.opacity = a ? '1' : '0.35';
      if (!a) {
        selN1.textContent = 'NONE — CLICK A TANK';
        selN2.textContent = 'or add one from the roster above';
        selIcon.style.visibility = 'hidden';
        return;
      }
      selIcon.style.visibility = 'visible';
      const u = `url(${iconUrl(a.spec.id, 'side_silhouette')})`;
      selIcon.style.webkitMaskImage = u;
      selIcon.style.maskImage = u;
      selN1.textContent = a.spec.name;
      selN2.textContent = `${a.name ? a.name + ' · ' : ''}${a.uid} · ${a.stateName}`;
      gun.setRange(-(a.spec.gunDepressionDeg ?? 10), a.spec.gunElevationDeg ?? 20);
      facing.set(a.pose.facingDeg);
      turret.set(a.pose.turretDeg);
      gun.set(a.pose.gunDeg);
      px.value = String(Math.round(a.pose.x * 10) / 10);
      pz.value = String(Math.round(a.pose.z * 10) / 10);
      camoSel.value = a.camo || 'inherit';
      stateSel.value = a.stateName;
    },
    refreshEffects() {
      rebuildEffectList();
      rebuildStoryboard();
    },
    refreshCamera() {
      const c = S.getCamera();
      fov.set(c.fov);
      roll.set(c.rollDeg);
      spd.set(S._internal.cam.speed);
      flyBtn.classList.toggle('on', c.mode === 'fly');
      orbBtn.classList.toggle('on', c.mode === 'orbit');
    },
    refreshTime() {
      const scale = S.timeScale;
      if (scale > 0 && Number(ts.input.value) !== scale) ts.set(scale);
      const pauseLabel = scale === 0 ? 'PLAY' : 'PAUSE';
      if (pauseBtn.textContent !== pauseLabel) pauseBtn.textContent = pauseLabel;
      pauseBtn.classList.toggle('on', S.timeScale === 0);
      const seconds = S.durationMs / 1000;
      if (Number(duration.input.value) !== seconds) duration.set(seconds);
      scrub.max = String(S.durationMs);
      if (document.activeElement !== scrub) scrub.value = String(S.fxTimeMs);
      const text = `${(S.fxTimeMs / 1000).toFixed(2)} / ${seconds.toFixed(2)} S`;
      if (clockNow.textContent !== text) clockNow.textContent = text;
      const left = `${Math.max(0, Math.min(100, (S.fxTimeMs / Math.max(1, S.durationMs)) * 100))}%`;
      for (const playhead of timelineBoard.querySelectorAll('.playhead')) playhead.style.left = left;
      const rec = S.recordingStatus();
      recordBtn.textContent = rec.active ? 'STOP RECORDING' : 'RECORD VIDEO';
      recordBtn.classList.toggle('on', rec.active);
      recStatus.classList.toggle('on', rec.active);
      recStatus.textContent = rec.active
        ? `RECORDING ${(rec.elapsedMs / 1000).toFixed(1)} / ${(rec.durationMs / 1000).toFixed(1)} S · ${rec.mimeType || 'VIDEO'}`
        : (rec.supported ? 'READY · VIDEO FOLLOWS STORYBOARD ONCE' : 'VIDEO RECORDING NOT SUPPORTED');
    },
    refreshStoryboard() {
      const isRecording = S.recordingStatus().active;
      railBtn.classList.toggle('on', S.railVisible);
      railBtn.textContent = S.railVisible ? 'HIDE CAMERA RAIL' : 'SHOW CAMERA RAIL';
      duration.input.disabled = isRecording;
      scrub.disabled = isRecording;
      restartBtn.disabled = isRecording;
      pauseBtn.disabled = isRecording;
      stepBtn.disabled = isRecording;
      addShotBtn.disabled = isRecording;
      keyActorBtn.disabled = isRecording || !S._internal.selected;
      clearTrackBtn.disabled = isRecording || !S._internal.selected;
      duelBtn.disabled = isRecording || S._internal.actors.length < 2;
      railBtn.disabled = isRecording;
      rebuildStoryboard();
      api.refreshTime();
    },
    refreshMap() {
      const id = S.mapId;
      badgeMap.textContent = id ? id.toUpperCase() : '';
      if (!id) return;
      const info = S.getMapInfo ? S.getMapInfo(id) : { name: id };
      mapHero.src = MAP_HEROES[id] || MAP_THUMBS[id] || '';
      mapName.textContent = info.name || id;
      mapId.textContent = id.toUpperCase();
      mapBtn.setAttribute('aria-label', `Choose battlefield. Current: ${info.name || id}`);
      for (const [cardId, card] of mapCards) {
        card.setAttribute('aria-selected', String(cardId === id));
      }
    },
    refreshAll() {
      api.refreshMap();
      api.refreshActors();
      api.refreshEffects();
      api.refreshCamera();
      api.refreshStoryboard();
      api.refreshTime();
    },
    tick(dt) {
      refreshAcc += dt;
      if (refreshAcc < 0.25) return;
      refreshAcc = 0;
      const c = S.getCamera();
      footCam.textContent =
        `CAM ${c.pos.map((v) => v.toFixed(1)).join(', ')}  ·  yaw ${c.yawDeg.toFixed(1)}°  ` +
        `pitch ${c.pitchDeg.toFixed(1)}°  ·  fov ${c.fov.toFixed(0)}  ·  T ${(S.fxTimeMs / 1000).toFixed(2)}s`;
      api.refreshTime();
    },
  };
  return api;
}
