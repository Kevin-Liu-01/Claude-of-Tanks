/** Director workspace: curated scenes and camera tools, backed by the same Studio API as captures. */
import { PRODUCTION_PRESETS, type ProductionFormat } from '../game/studioProduction.ts';
import type { StudioPanelApi } from './studioPanel.ts';
import { getLocale } from './i18n.ts';

const COPY = {
  director: ['Director', '导演台'], scene: ['Scene', '场景'], actors: ['Tanks', '坦克'],
  effects: ['Effects', '特效'], timeline: ['Timeline', '时间线'], output: ['Export', '导出'],
  eyebrow: ['CLAUDE OF TANKS / PRODUCTION', 'CLAUDE OF TANKS / 影像制作'],
  title: ['Make every frame count.', '让每一帧都精彩。'],
  intro: ['Stage a sequence, shape your camera, then capture the moment.', '布置镜头序列、调整机位，再捕捉精彩瞬间。'],
  library: ['Sequence library', '镜头序列库'], stage: ['Stage sequence', '布置序列'],
  staging: ['Staging your sequence…', '正在布置镜头序列…'], ready: ['Sequence ready. Preview or make it yours.', '序列已就绪。可预览或继续调整。'],
  format: ['Frame', '画幅'], landscape: ['16:9 Film', '16:9 影片'], portrait: ['9:16 Vertical', '9:16 竖屏'], square: ['1:1 Square', '1:1 方形'],
  subject: ['Featured tank', '主角坦克'], defaultTank: ['Sequence default', '使用序列默认坦克'],
  shotlist: ['Shot list', '镜头列表'], empty: ['Stage a sequence or add camera shots in Timeline.', '布置序列，或在时间线中添加机位。'],
  camera: ['Camera & framing', '机位与构图'], hero: ['Hero', '主角'], track: ['Tracking', '跟拍'],
  rear: ['Rear chase', '后方追拍'], overhead: ['Overhead', '俯拍'], detail: ['Detail', '细节'],
  lens: ['Lens', '镜头'], wide: ['Wide · 58°', '广角 · 58°'], natural: ['Natural · 42°', '标准 · 42°'], tight: ['Tight · 28°', '特写 · 28°'],
  cameraHint: ['Rig and lens changes update the camera key at the playhead.', '机位和镜头调整会保存到当前时间点的相机关键帧。'],
  guides: ['Frame guides', '构图参考线'], guidesHint: ['Guides are for composition only; they never appear in exports.', '参考线仅辅助构图，不会出现在导出内容中。'],
  play: ['Play sequence', '播放序列'], pause: ['Pause', '暂停'], restart: ['Restart', '重新开始'],
  scrub: ['Sequence position', '序列位置'], export: ['Capture & export', '拍摄与导出'],
  photo: ['Capture PNG', '拍摄 PNG'], video: ['Record film', '录制影片'], stop: ['Stop recording', '停止录制'],
  photoHint: ['Clean image · selected frame · no interface', '纯净画面 · 当前画幅 · 无界面'],
  videoHint: ['Records the complete sequence from its first frame.', '从第一帧开始录制完整序列。'],
  nativeVideo: ['Video uses the current canvas aspect ratio.', '影片使用当前画布比例。'],
  saved: ['Saved to downloads.', '已保存至下载文件夹。'], unsupported: ['Video recording is unavailable in this browser.', '此浏览器不支持录制影片。'],
  workspace: ['Studio workspace', '工作区'], hide: ['Hide controls', '隐藏控制面板'], show: ['Show controls', '显示控制面板'],
} as const;

type CopyKey = keyof typeof COPY;
export function productionLabel(key: CopyKey): string {
  return COPY[key][getLocale() === 'zh-CN' ? 1 : 0];
}

export const STUDIO_PRODUCTION_CSS = `
body[data-studio-workspace]{--studio-dock:440px;--studio-preview-width:calc(var(--cot-viewport-width,100dvw) - var(--studio-dock));--studio-preview-height:var(--cot-viewport-height,100dvh)}
body[data-studio-workspace] #app{width:var(--studio-preview-width);height:var(--studio-preview-height)}
body[data-studio-workspace]:is([data-cot-width='laptop'],[data-cot-width='tablet']){--studio-dock:360px}
body[data-studio-workspace]:is([data-cot-width='phone'],[data-cot-width='compact']){--studio-preview-width:var(--cot-viewport-width,100dvw);--studio-preview-height:calc(var(--cot-viewport-height,100dvh) * .51)}
body[data-studio-workspace][data-cot-height='short']{--studio-dock:calc(var(--cot-viewport-width,100dvw) * .5);--studio-preview-width:calc(var(--cot-viewport-width,100dvw) - var(--studio-dock));--studio-preview-height:var(--cot-viewport-height,100dvh)}
body[data-studio-workspace='collapsed']{--studio-preview-width:var(--cot-viewport-width,100dvw)!important;--studio-preview-height:var(--cot-viewport-height,100dvh)!important}
body[data-studio-workspace] .cot-studio .dock{width:var(--studio-dock)}
.cot-studio{--studio-line:rgba(170,194,211,.18)}
.cot-studio .dock{width:var(--studio-dock);padding:0 18px 28px;background:rgba(6,10,14,.96)}
.cot-studio .workspace-nav{position:sticky;top:0;z-index:30;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:15px 0 13px;margin-bottom:15px;background:#080d12;border-bottom:1px solid var(--studio-line)}
.cot-studio .workspace-nav button{min-height:38px;padding:8px 4px;font-size:10px;letter-spacing:.05em;background:#101820;border-color:transparent}
.cot-studio .workspace-nav button[aria-selected=true]{background:#352715;color:#ffd58a;border-color:#d79938}
.cot-studio [data-workspace-hidden=true]{display:none!important}
.cot-studio .director{display:grid;gap:22px}
.cot-studio .director-head small{display:block;color:#e6a841;font-size:8px;font-weight:900;letter-spacing:.18em;margin-bottom:9px}
.cot-studio .director-head h2{font-size:27px;line-height:1.08;letter-spacing:-.025em;font-weight:800;margin-bottom:9px}
.cot-studio .director p{font-size:11px;line-height:1.6;color:#9cafbd;font-weight:500}
.cot-studio .director h3{font-size:11px;font-weight:800;letter-spacing:.08em;margin-bottom:10px;color:#dfe9ef}
.cot-studio .production-library{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cot-studio .production-card{position:relative;padding:0;overflow:hidden;text-align:left;letter-spacing:0;text-transform:none;background:#101920;border-color:var(--studio-line)}
.cot-studio .production-card img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;filter:brightness(.82);transition:filter .18s}
.cot-studio .production-card:hover img,.cot-studio .production-card[aria-pressed=true] img{filter:brightness(1)}
.cot-studio .production-card[aria-pressed=true]{border-color:#edb45c;box-shadow:inset 0 -2px #edb45c}
.cot-studio .production-card strong{display:block;padding:9px 9px 4px;font-size:12px;line-height:1.25;color:#eff4f7}
.cot-studio .production-card small{display:block;padding:0 9px 10px;color:#94a9b7;font-size:9px;font-weight:600;line-height:1.3}
.cot-studio .production-card .production-duration{position:absolute;right:6px;top:6px;background:#071016d9;color:#ffe0a4;padding:3px 5px;font-size:8px}
.cot-studio .production-description{margin:10px 0!important;min-height:35px}
.cot-studio .production-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
.cot-studio .production-fields label,.cot-studio .production-lens{display:grid;gap:6px;font-size:9px;color:#9cafbd}
.cot-studio .director select{width:100%;min-height:38px;font-size:11px;background:#080e13;padding:6px 9px}
.cot-studio .director button{min-height:36px}
.cot-studio .director .production-stage{min-height:42px;background:#e8a139;color:#101318;border-color:#ffca72;font-size:11px;letter-spacing:.09em;width:100%}
.cot-studio .director button:disabled{opacity:.42;cursor:default}
.cot-studio .production-status{font-size:10px;line-height:1.5;color:#d4b374;min-height:15px;margin-top:7px}
.cot-studio .production-status[data-error=true]{color:#ff9c83}
.cot-studio .production-transport{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;margin-bottom:8px}
.cot-studio .production-transport output{font-variant-numeric:tabular-nums;color:#e7bf7a;font-size:11px;text-align:center}
.cot-studio .production-scrub{width:100%;margin-bottom:12px!important}
.cot-studio .production-shots{display:grid;gap:4px;max-height:205px;overflow:auto;scrollbar-width:thin;scrollbar-color:#806139 transparent}
.cot-studio .production-shot{display:grid;grid-template-columns:23px minmax(0,1fr) auto;gap:7px;align-items:center;text-align:left;font-size:10px!important;text-transform:none!important;letter-spacing:0!important;padding:8px!important;background:#101820!important;border-color:transparent!important}
.cot-studio .production-shot[aria-current=true]{border-color:#947037!important;background:#2c2317!important}
.cot-studio .production-shot span:first-child{color:#e4aa52;font-size:9px}
.cot-studio .production-shot span:last-child{font-size:9px;color:#90a4b3}
.cot-studio .production-rigs{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:10px}
.cot-studio .production-rigs button{font-size:9px;letter-spacing:.03em;text-transform:none}
.cot-studio .production-guide{display:flex;align-items:center;gap:9px;margin-top:12px;min-height:36px;font-size:11px;color:#ccd8e1;cursor:pointer}
.cot-studio .production-guide input{accent-color:#e6a841;width:16px;height:16px}
.cot-studio .director p.production-note{font-size:9px;line-height:1.5;margin-top:7px;color:#8195a4}
.cot-studio .production-exports{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cot-studio .production-exports button{min-height:42px;font-size:10px;text-transform:none;letter-spacing:.03em}
.cot-studio .production-exports button:last-child{color:#ffca83;border-color:#966e32}
.cot-studio .studio-frame-guides{position:absolute;left:0;top:0;width:var(--studio-preview-width);height:var(--studio-preview-height);overflow:hidden;pointer-events:none;display:flex;align-items:center;justify-content:center}
.cot-studio .studio-frame-guides[hidden]{display:none}
.cot-studio .studio-frame-guide{position:relative;width:min(calc(var(--studio-preview-width) * .86),calc(var(--studio-preview-height) * .86 * var(--frame-aspect)));height:auto;aspect-ratio:var(--frame-aspect);border:1px solid #ffdf9a99;box-shadow:0 0 0 100vmax #0004}
.cot-studio .studio-frame-guide::before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent calc(33.333% - .5px),#fff5 33.333%,transparent calc(33.333% + .5px),transparent calc(66.667% - .5px),#fff5 66.667%,transparent calc(66.667% + .5px)),linear-gradient(0deg,transparent calc(33.333% - .5px),#fff5 33.333%,transparent calc(33.333% + .5px),transparent calc(66.667% - .5px),#fff5 66.667%,transparent calc(66.667% + .5px))}
.cot-studio .studio-frame-guide small{position:absolute;left:8px;top:7px;color:#ffe1a7;font-size:9px;letter-spacing:.12em}
.cot-studio .studio-panel-toggle{position:absolute;top:14px;right:calc(var(--studio-dock) + 12px);min-height:34px;pointer-events:auto;z-index:3;background:#080e13e6}
.cot-studio[data-controls-collapsed=true] .dock{display:none}
.cot-studio[data-controls-collapsed=true] .studio-panel-toggle{right:16px}
.cot-studio .foot{max-width:calc(100vw - var(--studio-dock) - 40px);font-size:9px}
body:is([data-cot-width='laptop'],[data-cot-width='tablet']) .cot-studio .badge{left:12px;top:12px;gap:7px}body:is([data-cot-width='laptop'],[data-cot-width='tablet']) .cot-studio .badge .t{font-size:9px;letter-spacing:.1em}body:is([data-cot-width='laptop'],[data-cot-width='tablet']) .cot-studio .badge .m{display:none}body:is([data-cot-width='laptop'],[data-cot-width='tablet']) .cot-studio .studio-panel-toggle{top:64px}body:is([data-cot-width='laptop'],[data-cot-width='tablet']) .cot-studio .director-head h2{font-size:24px}
body[data-studio-workspace]:is([data-cot-width='phone'],[data-cot-width='compact']) .cot-studio .dock{top:auto;left:0;right:0;bottom:0;width:100%;height:calc(var(--cot-viewport-height,100dvh) * .49);border-left:0;border-top:1px solid #a37a36;padding:0 14px 25px}body:is([data-cot-width='phone'],[data-cot-width='compact']) .cot-studio .workspace-nav{grid-template-columns:repeat(6,minmax(0,1fr));padding:8px 0;gap:3px}body:is([data-cot-width='phone'],[data-cot-width='compact']) .cot-studio .workspace-nav button{font-size:8px;letter-spacing:0;padding:5px 1px;min-height:38px}body:is([data-cot-width='phone'],[data-cot-width='compact']) .cot-studio .production-library{grid-template-columns:repeat(2,minmax(0,1fr))}body:is([data-cot-width='phone'],[data-cot-width='compact']) .cot-studio .badge{right:12px;max-width:calc(100vw - 24px);padding:7px 9px}body:is([data-cot-width='phone'],[data-cot-width='compact']) .cot-studio .badge button{min-height:30px;font-size:8px}body:is([data-cot-width='phone'],[data-cot-width='compact']) .cot-studio .badge .t{flex:1}body:is([data-cot-width='phone'],[data-cot-width='compact']) .cot-studio .badge .bm{width:15px}body:is([data-cot-width='phone'],[data-cot-width='compact']) .cot-studio .badge button img{display:none}body:is([data-cot-width='phone'],[data-cot-width='compact']) .cot-studio .studio-panel-toggle{right:12px;top:65px}body:is([data-cot-width='phone'],[data-cot-width='compact']) .cot-studio .foot{left:12px;bottom:calc(49dvh + 9px);max-width:calc(100vw - 24px);font-size:8px}body:is([data-cot-width='phone'],[data-cot-width='compact']) .cot-studio .foot>div:last-child{display:none}body:is([data-cot-width='phone'],[data-cot-width='compact']) .cot-studio[data-controls-collapsed=true] .foot{bottom:12px}body:is([data-cot-width='phone'],[data-cot-width='compact']) .cot-studio .busy{top:106px;font-size:9px;width:max-content;max-width:90vw;text-align:center}body:is([data-cot-width='phone'],[data-cot-width='compact']) .cot-studio .director-head h2{font-size:23px}
body[data-studio-workspace][data-cot-height='short'] .cot-studio .dock{left:auto;top:0;right:0;bottom:0;width:var(--studio-dock);height:auto;padding:0 12px 20px}
body[data-cot-height='short'] .cot-studio .workspace-nav{grid-template-columns:repeat(3,minmax(0,1fr))}
body[data-cot-height='short'] .cot-studio .badge{right:calc(var(--studio-dock) + 8px);left:8px;flex-wrap:wrap}
body[data-cot-height='short'] .cot-studio .badge .t{font-size:8px}
body[data-cot-height='short'] .cot-studio .studio-panel-toggle{left:8px;right:auto;top:86px}
body[data-cot-height='short'] .cot-studio .foot{bottom:8px;left:8px;max-width:calc(50vw - 20px)}
@media(prefers-reduced-motion:reduce){.cot-studio .production-card img{transition:none}}
`;

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text) element.textContent = text;
  return element;
}
function button(text: string, action: () => void, className = ''): HTMLButtonElement {
  const element = node('button', className, text);
  element.type = 'button';
  element.addEventListener('click', action);
  return element;
}

export function mountStudioProductionPanel(S: StudioPanelApi, root: HTMLElement, dock: HTMLElement, refreshAll: () => void): { refresh(): void; setVisible(visible: boolean): void } {
  let visible = false;
  function syncPreviewViewport(): void {
    if (visible) document.body.dataset.studioWorkspace = root.dataset.controlsCollapsed === 'true' ? 'collapsed' : 'open';
    else delete document.body.dataset.studioWorkspace;
    // The renderer's existing viewport owner listens here; its ResizeObserver
    // only repairs boot-time zero-size layouts and is not a persistent observer.
    window.dispatchEvent(new Event('cot:layoutchange'));
  }
  function setVisible(next: boolean): void { visible = next; syncPreviewViewport(); }
  const director = node('section', 'director');
  director.dataset.group = 'director';
  const head = node('header', 'director-head');
  head.append(node('small', '', productionLabel('eyebrow')), node('h2', '', productionLabel('title')), node('p', '', productionLabel('intro')));
  director.append(head);
  let selectedId = PRODUCTION_PRESETS[0]?.id ?? '';
  let format: ProductionFormat = S.productionFormat;
  let staging = false;
  let shotSignature = '';
  const status = node('div', 'production-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  function notify(text: string, error = false): void { status.textContent = text; status.dataset.error = String(error); }
  function failure(error: unknown): void { notify(error instanceof Error ? error.message : String(error), true); }
  const librarySection = node('section');
  librarySection.append(node('h3', '', productionLabel('library')));
  const library = node('div', 'production-library');
  const description = node('p', 'production-description');
  const cards = new Map<string, HTMLButtonElement>();
  function selectPreset(id: string): void {
    selectedId = id;
    const preset = PRODUCTION_PRESETS.find((entry) => entry.id === id);
    description.textContent = preset?.description ?? '';
    for (const [cardId, card] of cards) card.setAttribute('aria-pressed', String(cardId === id));
  }
  for (const preset of PRODUCTION_PRESETS) {
    const card = button('', () => selectPreset(preset.id), 'production-card');
    card.dataset.productionPreset = preset.id;
    const photo = node('img');
    photo.src = `/maps/cards/${preset.map}.webp`;
    photo.alt = '';
    photo.loading = 'lazy';
    photo.decoding = 'async';
    card.append(photo, node('span', 'production-duration', `${Math.round(preset.durationMs / 1000)}s`), node('strong', '', preset.title), node('small', '', `${S.getMapInfo(preset.map).name} · ${preset.shots.length} ${getLocale() === 'zh-CN' ? '个镜头' : 'shots'}`));
    cards.set(preset.id, card);
    library.append(card);
  }
  const fields = node('div', 'production-fields');
  const frameLabel = node('label', '', productionLabel('format'));
  const frame = node('select');
  frame.dataset.productionFormat = '';
  for (const value of ['landscape', 'portrait', 'square'] as const) {
    const option = node('option', '', productionLabel(value)); option.value = value; frame.append(option);
  }
  frame.value = format;
  const tankLabel = node('label', '', productionLabel('subject'));
  const tanks = node('select');
  tanks.dataset.productionTank = '';
  const defaultOption = node('option', '', productionLabel('defaultTank')); defaultOption.value = ''; tanks.append(defaultOption);
  for (const id of S.TANK_IDS) { const option = node('option', '', S.getSpecInfo(id).name); option.value = id; tanks.append(option); }
  frameLabel.append(frame); tankLabel.append(tanks); fields.append(frameLabel, tankLabel);
  const stage = button(productionLabel('stage'), () => {
    if (staging || S.recordingStatus().active) return;
    staging = true; refresh(); notify(productionLabel('staging'));
    S.directProduction({ presetId: selectedId, format, ...(tanks.value ? { vehicleId: tanks.value } : {}) })
      .then(() => { notify(productionLabel('ready')); refreshAll(); })
      .catch(failure)
      .finally(() => { staging = false; refresh(); });
  }, 'production-stage');
  stage.dataset.productionStage = '';
  librarySection.append(library, description, fields, stage, status);
  selectPreset(selectedId);
  director.append(librarySection);

  const sequence = node('section');
  sequence.append(node('h3', '', productionLabel('shotlist')));
  const transport = node('div', 'production-transport');
  const play = button(productionLabel('play'), () => { if (S.playing) S.pause(); else S.play(); refresh(); });
  const clock = node('output');
  const restart = button(productionLabel('restart'), () => { S.stop(); S.seek(0); refresh(); });
  transport.append(play, clock, restart);
  const scrub = node('input', 'production-scrub');
  scrub.type = 'range'; scrub.min = '0'; scrub.step = '10'; scrub.setAttribute('aria-label', productionLabel('scrub'));
  scrub.addEventListener('input', () => { S.pause(); S.seek(Number(scrub.value)); refresh(); });
  const shots = node('div', 'production-shots');
  sequence.append(transport, scrub, shots);
  director.append(sequence);

  const cameras = node('section'); cameras.append(node('h3', '', productionLabel('camera')));
  const rigs = node('div', 'production-rigs');
  for (const rig of ['hero', 'track', 'rear', 'overhead', 'detail'] as const) {
    const control = button(productionLabel(rig), () => { S.pause(); S.applyProductionCamera(rig); S.addCameraShot(); refreshAll(); });
    control.dataset.productionRig = rig; rigs.append(control);
  }
  const lensLabel = node('label', 'production-lens', productionLabel('lens'));
  const lens = node('select');
  for (const [label, fov] of [['wide', 58], ['natural', 42], ['tight', 28]] as const) {
    const option = node('option', '', productionLabel(label)); option.value = String(fov); lens.append(option);
  }
  lens.dataset.productionLens = '';
  lens.value = '42';
  lens.addEventListener('change', () => { S.pause(); S.setCamera({ fov: Number(lens.value) }); S.addCameraShot(); refreshAll(); });
  lensLabel.append(lens);
  const guides = node('label', 'production-guide');
  const guideCheck = node('input'); guideCheck.type = 'checkbox';
  guides.append(guideCheck, node('span', '', productionLabel('guides')));
  const guideLayer = node('div', 'studio-frame-guides'); guideLayer.hidden = true; guideLayer.setAttribute('aria-hidden', 'true');
  const guide = node('div', 'studio-frame-guide'); const guideCaption = node('small'); guide.append(guideCaption); guideLayer.append(guide); root.prepend(guideLayer);
  function setFormat(): void {
    format = frame.value as ProductionFormat;
    guide.style.setProperty('--frame-aspect', String(format === 'portrait' ? 9 / 16 : format === 'square' ? 1 : 16 / 9));
    guideCaption.textContent = productionLabel(format);
  }
  frame.addEventListener('change', () => { setFormat(); S.setProductionFormat(format); }); setFormat();
  guideCheck.addEventListener('change', () => { guideLayer.hidden = !guideCheck.checked; });
  cameras.append(rigs, lensLabel, node('p', 'production-note', productionLabel('cameraHint')), guides, node('p', 'production-note', productionLabel('guidesHint')));
  director.append(cameras);

  const exports = node('section'); exports.append(node('h3', '', productionLabel('export')));
  const exportButtons = node('div', 'production-exports');
  const photo = button(productionLabel('photo'), () => {
    const [width, height] = format === 'portrait' ? [2160, 3840] : format === 'square' ? [2880, 2880] : [3840, 2160];
    Promise.resolve().then(() => S.capture({ width, height, download: true })).then(() => notify(productionLabel('saved'))).catch(failure);
  });
  const video = button(productionLabel('video'), () => {
    if (S.recordingStatus().active) { S.stopRecording(); return; }
    S.recordVideo({ fps: 30, download: true }).then(() => notify(productionLabel('saved'))).catch(failure);
    refresh();
  });
  exportButtons.append(photo, video);
  exports.append(exportButtons, node('p', 'production-note', productionLabel('photoHint')), node('p', 'production-note', productionLabel('videoHint')), node('p', 'production-note', productionLabel('nativeVideo')));
  director.append(exports);
  dock.prepend(director);

  const nav = node('nav', 'workspace-nav'); nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', productionLabel('workspace'));
  const workspaceIds = ['director', 'battlefield', 'tanks', 'effects', 'cinematics', 'output'] as const;
  const workspaceGroups = ['director', 'battlefield', 'tanks', 'effects', 'global', 'output'] as const;
  const labels = ['director', 'scene', 'actors', 'effects', 'timeline', 'output'] as const;
  const navButtons: HTMLButtonElement[] = [];
  function activate(id: typeof workspaceIds[number]): void {
    const groupId = workspaceGroups[workspaceIds.indexOf(id)];
    for (const section of dock.querySelectorAll<HTMLElement>(':scope > [data-group]')) {
      const selected = section.dataset.group === groupId;
      section.dataset.workspaceHidden = String(!selected);
      section.hidden = !selected;
    }
    for (const tab of navButtons) {
      const selected = tab.dataset.workspace === id;
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    }
    dock.scrollTop = 0;
  }
  workspaceIds.forEach((id, index) => {
    const tab = button(productionLabel(labels[index]), () => activate(id));
    tab.dataset.workspace = id; tab.setAttribute('role', 'tab'); tab.id = `studio-workspace-${id}`;
    tab.setAttribute('aria-controls', `studio-panel-${id}`);
    const panel = dock.querySelector<HTMLElement>(`:scope > [data-group="${workspaceGroups[index]}"]`);
    if (panel) { panel.id = `studio-panel-${id}`; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id); }
    tab.addEventListener('keydown', (event) => {
      const next = event.key === 'ArrowRight' ? (index + 1) % workspaceIds.length : event.key === 'ArrowLeft' ? (index + workspaceIds.length - 1) % workspaceIds.length : event.key === 'Home' ? 0 : event.key === 'End' ? workspaceIds.length - 1 : -1;
      if (next >= 0) { event.preventDefault(); activate(workspaceIds[next]); navButtons[next]?.focus(); }
    });
    navButtons.push(tab); nav.append(tab);
  });
  dock.prepend(nav); activate('director');
  const toggle = button(productionLabel('hide'), () => {
    const collapsed = root.dataset.controlsCollapsed !== 'true';
    root.dataset.controlsCollapsed = String(collapsed);
    syncPreviewViewport();
    toggle.textContent = productionLabel(collapsed ? 'show' : 'hide');
    toggle.setAttribute('aria-expanded', String(!collapsed));
  }, 'studio-panel-toggle');
  toggle.setAttribute('aria-expanded', 'true'); root.append(toggle);

  function refresh(): void {
    if (format !== S.productionFormat) { frame.value = S.productionFormat; setFormat(); }
    const recording = S.recordingStatus();
    const locked = staging || recording.active;
    toggle.disabled = recording.active;
    for (const element of [stage, frame, tanks, play, restart, scrub, lens, photo]) element.disabled = locked;
    for (const element of cards.values()) element.disabled = locked;
    for (const element of rigs.querySelectorAll('button')) element.disabled = locked || S._internal.actors.length === 0;
    play.textContent = productionLabel(S.playing ? 'pause' : 'play');
    video.textContent = productionLabel(recording.active ? 'stop' : 'video');
    video.disabled = staging || !recording.supported;
    video.title = recording.supported ? '' : productionLabel('unsupported');
    clock.textContent = `${(S.fxTimeMs / 1000).toFixed(1)} / ${(S.durationMs / 1000).toFixed(1)}s`;
    scrub.max = String(S.durationMs);
    if (document.activeElement !== scrub) scrub.value = String(S.fxTimeMs);
    const storyboard = S.getStoryboard();
    const signature = JSON.stringify(storyboard.shots.map((shot) => [shot.id, shot.label, shot.tMs]));
    if (signature !== shotSignature) {
      shotSignature = signature; shots.replaceChildren();
      if (!storyboard.shots.length) shots.append(node('p', '', productionLabel('empty')));
      storyboard.shots.forEach((shot, index) => {
        const entry = button('', () => { S.pause(); S.seek(shot.tMs); S.selectCameraShot(shot.id); refreshAll(); }, 'production-shot');
        entry.dataset.productionShot = shot.id;
        entry.append(node('span', '', String(index + 1).padStart(2, '0')), node('span', '', shot.label), node('span', '', `${(shot.tMs / 1000).toFixed(1)}s`));
        shots.append(entry);
      });
    }
    for (const entry of shots.querySelectorAll<HTMLButtonElement>('button')) {
      entry.disabled = locked;
      entry.setAttribute('aria-current', String(entry.dataset.productionShot === S.selectedShotId));
    }
  }
  refresh();
  return { refresh, setVisible };
}
