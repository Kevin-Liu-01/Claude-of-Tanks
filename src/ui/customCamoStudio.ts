import { createModal } from './modal.ts';
import { uiIconSVG } from './uiIcons.ts';
import {
  CUSTOM_CAMO_ASSETS,
  customCamoPatternId,
  normalizeCustomCamo,
} from '../vehicles/camoPolicy.ts';
import type {
  CustomCamo,
  CustomCamoAsset,
  CustomCamoBrush,
} from '../vehicles/camoPolicy.ts';
import { paintCustomCamoStrokes } from '../vehicles/customCamoCanvas.ts';
import type { CustomCamoStudioController } from './customCamoStudioAccess.ts';

type CustomCamoDraft = CustomCamo;

interface CustomCamoOptions {
  getCustom(specId: string): unknown;
  setCustom(specId: string, draft: CustomCamoDraft): void;
}

export interface CustomCamoStudioOptions {
  button: HTMLButtonElement;
  camo: CustomCamoOptions;
  selectedId: () => string | null;
  selectedSpec: () => unknown;
  paintPreview: (canvas: HTMLCanvasElement, spec: unknown, patternId: string) => void;
  emitClick: () => void;
  refreshSelection: () => void;
  requeueThumb: (specId: string) => void;
}

const normalized = (value?: unknown): CustomCamoDraft => normalizeCustomCamo(value);

/**
 * Full custom-paint authoring surface. This module is intentionally reachable
 * only from explicit Garage intent; no editor DOM, modal CSS, or painter code
 * participates in pristine boot.
 */
export function createCustomCamoStudio({
  button, camo, selectedId, selectedSpec, paintPreview, emitClick, refreshSelection, requeueThumb,
}: CustomCamoStudioOptions): CustomCamoStudioController {
  let customTone = 0;
  let customBrush: CustomCamoBrush = 'round';
  let customAsset: CustomCamoAsset = 'star';
  let drawingStroke = -1;
  let draft = normalized();

  const modal = createModal({
    title: 'Custom camouflage studio',
    eyebrow: 'Local paint laboratory',
    subtitle: 'Author one seamless tile, preview it on the selected vehicle, then save it to this device.',
    size: 'wide',
    onOpen: () => button.setAttribute('aria-expanded', 'true'),
    onClose: () => button.setAttribute('aria-expanded', 'false'),
  });
  const root = document.createElement('div');
  root.className = 'cot-camo-lab';
  const canvasColumn = document.createElement('section');
  canvasColumn.className = 'cot-camo-lab__canvas';
  const canvasHeading = document.createElement('div');
  canvasHeading.className = 'cot-camo-lab__heading';
  canvasHeading.innerHTML = '<span>Pattern tile</span><small>512 × 256 authoring surface</small>';
  const drawWrap = document.createElement('div');
  drawWrap.className = 'cot-custom-draw-wrap';
  const drawCanvas = document.createElement('canvas');
  drawCanvas.className = 'cot-custom-draw';
  drawCanvas.width = 512;
  drawCanvas.height = 256;
  drawCanvas.tabIndex = 0;
  drawCanvas.setAttribute('aria-label', 'Paint a repeating camouflage tile');
  drawCanvas.setAttribute('role', 'application');
  const drawLabel = document.createElement('span');
  drawLabel.className = 'cot-custom-draw-label';
  drawLabel.textContent = 'Drag to paint · tap to stamp';
  drawWrap.append(drawCanvas, drawLabel);
  const tools = document.createElement('div');
  tools.className = 'cot-custom-tools';

  const drawTile = () => {
    const ctx = drawCanvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = drawCanvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = draft.base;
    ctx.fillRect(0, 0, width, height);
    paintCustomCamoStrokes(ctx, draft.strokes, {
      width, height, colorA: draft.colorA, colorB: draft.colorB, eraseColor: draft.base,
    });
  };

  const previewCanvas = document.createElement('canvas');
  const repaintPreview = () => {
    drawTile();
    const spec = selectedSpec();
    if (spec) paintPreview(previewCanvas, spec, customCamoPatternId(draft));
  };

  const syncControls = () => {
    root.querySelectorAll<HTMLElement>('[data-custom-tone]').forEach((control) => {
      const on = Number(control.dataset.customTone) === customTone;
      control.classList.toggle('on', on);
      control.setAttribute('aria-pressed', String(on));
    });
    root.querySelectorAll<HTMLElement>('[data-custom-brush-type]').forEach((control) => {
      const on = control.dataset.customBrushType === customBrush;
      control.classList.toggle('on', on);
      control.setAttribute('aria-pressed', String(on));
    });
    root.querySelectorAll<HTMLElement>('[data-custom-asset]').forEach((control) => {
      const on = control.dataset.customAsset === customAsset && customBrush === 'stamp';
      control.classList.toggle('on', on);
      control.setAttribute('aria-pressed', String(on));
    });
    for (const key of ['base', 'colorA', 'colorB'] as const) {
      const input = root.querySelector<HTMLInputElement>(`[data-custom-color="${key}"]`);
      if (input) input.value = draft[key];
    }
    for (const [key, value] of [
      ['repeat-x', draft.repeatX], ['repeat-y', draft.repeatY], ['rotation', draft.rotation],
    ] as const) {
      const input = root.querySelector<HTMLInputElement>(`[data-custom-${key}]`);
      const output = root.querySelector<HTMLOutputElement>(`[data-custom-${key}-value]`);
      if (input) input.value = String(value);
      if (output) output.value = key === 'rotation' ? `${value}°` : `${value}×`;
    }
    const mirror = root.querySelector<HTMLInputElement>('[data-custom-mirror]');
    if (mirror) mirror.checked = draft.mirror;
    repaintPreview();
  };

  const brushDefs: ReadonlyArray<readonly [CustomCamoBrush, string, string]> = [
    ['round', 'brush', 'Round'], ['flat', 'stamp', 'Flat'], ['spray', 'spray', 'Spray'],
    ['pixel', 'pixels', 'Pixel'], ['eraser', 'eraser', 'Eraser'],
  ];
  for (const [id, icon, label] of brushDefs) {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'cot-custom-tool';
    control.dataset.customBrushType = id;
    control.innerHTML = `${uiIconSVG(icon, 17)}<span>${label}</span>`;
    control.addEventListener('click', () => { customBrush = id; syncControls(); });
    tools.appendChild(control);
  }
  for (const [tone, label] of [[0, 'Tone 1'], [1, 'Tone 2']] as const) {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'cot-custom-tool';
    control.dataset.customTone = String(tone);
    control.innerHTML = `${uiIconSVG('camouflage', 17)}<span>${label}</span>`;
    control.addEventListener('click', () => {
      customTone = tone;
      if (customBrush === 'eraser') customBrush = 'round';
      syncControls();
    });
    tools.appendChild(control);
  }
  const undoDraft = () => {
    draft = normalized({ ...draft, style: 'drawn', strokes: draft.strokes.slice(0, -1) });
    syncControls();
  };
  const undo = document.createElement('button');
  undo.type = 'button';
  undo.className = 'cot-custom-tool';
  undo.innerHTML = `${uiIconSVG('undo', 17)}<span>Undo</span>`;
  undo.addEventListener('click', undoDraft);
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'cot-custom-tool';
  clear.innerHTML = `${uiIconSVG('trash', 17)}<span>Clear</span>`;
  clear.addEventListener('click', () => {
    draft = normalized({ ...draft, style: 'drawn', strokes: [] });
    syncControls();
  });
  tools.append(undo, clear);

  const assetPanel = document.createElement('div');
  assetPanel.className = 'cot-camo-lab__panel';
  const assetHeading = document.createElement('div');
  assetHeading.className = 'cot-camo-lab__heading';
  assetHeading.innerHTML = '<span>Stencil assets</span><small>Select, then place on the tile</small>';
  const assets = document.createElement('div');
  assets.className = 'cot-custom-assets';
  const assetIcons: Record<string, string> = {
    star: 'star', chevron: 'chevronRight', leaf: 'camouflage', hex: 'pixels', cross: 'repair',
  };
  for (const asset of CUSTOM_CAMO_ASSETS) {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'cot-custom-tool';
    control.dataset.customAsset = asset;
    control.innerHTML = `${uiIconSVG(assetIcons[asset], 18)}<span>${asset}</span>`;
    control.addEventListener('click', () => { customAsset = asset; customBrush = 'stamp'; syncControls(); });
    assets.appendChild(control);
  }
  assetPanel.append(assetHeading, assets);
  canvasColumn.append(canvasHeading, tools, drawWrap, assetPanel);

  const controlsColumn = document.createElement('aside');
  controlsColumn.className = 'cot-camo-lab__controls';
  const previewPanel = document.createElement('div');
  previewPanel.className = 'cot-camo-lab__panel';
  const previewHeading = document.createElement('div');
  previewHeading.className = 'cot-camo-lab__heading';
  previewHeading.innerHTML = '<span>Vehicle preview</span><small>Live material bake</small>';
  const preview = document.createElement('div');
  preview.className = 'cot-custom-preview';
  const localOnly = document.createElement('span');
  localOnly.className = 'cot-custom-local';
  localOnly.textContent = 'Solo · this device only';
  preview.append(previewCanvas, localOnly);
  previewPanel.append(previewHeading, preview);

  const colorPanel = document.createElement('div');
  colorPanel.className = 'cot-camo-lab__panel';
  const colorHeading = document.createElement('div');
  colorHeading.className = 'cot-camo-lab__heading';
  colorHeading.innerHTML = '<span>Palette</span><small>Base + two field tones</small>';
  const colors = document.createElement('div');
  colors.className = 'cot-custom-colors';
  for (const [key, label] of [['base', 'Base'], ['colorA', 'Tone 1'], ['colorB', 'Tone 2']] as const) {
    const wrap = document.createElement('label');
    wrap.className = 'cot-custom-color';
    const input = document.createElement('input');
    input.type = 'color';
    input.dataset.customColor = key;
    input.setAttribute('aria-label', `${label} color`);
    const text = document.createElement('span');
    text.textContent = label;
    input.addEventListener('input', () => { draft = normalized({ ...draft, style: 'drawn', [key]: input.value }); syncControls(); });
    wrap.append(input, text);
    colors.appendChild(wrap);
  }
  colorPanel.append(colorHeading, colors);

  const repeatPanel = document.createElement('div');
  repeatPanel.className = 'cot-camo-lab__panel cot-custom-repeat-grid';
  const brush = document.createElement('label');
  brush.className = 'cot-custom-repeat';
  brush.innerHTML = '<span>Brush size</span><input type="range" min="2" max="40" step="1" value="8" data-custom-brush><output data-custom-brush-value>8</output>';
  const brushInput = brush.querySelector<HTMLInputElement>('input')!;
  const brushOutput = brush.querySelector<HTMLOutputElement>('output')!;
  brushInput.addEventListener('input', () => { brushOutput.value = brushInput.value; });
  repeatPanel.appendChild(brush);
  for (const [key, label] of [['repeat-x', 'Repeat X'], ['repeat-y', 'Repeat Y']] as const) {
    const control = document.createElement('label');
    control.className = 'cot-custom-repeat';
    control.innerHTML = `<span>${label}</span><input type="range" min="1" max="8" step="1" data-custom-${key}><output data-custom-${key}-value></output>`;
    control.querySelector<HTMLInputElement>('input')!.addEventListener('input', (event) => {
      const field = key === 'repeat-x' ? 'repeatX' : 'repeatY';
      draft = normalized({ ...draft, style: 'drawn', [field]: Number((event.currentTarget as HTMLInputElement).value) });
      syncControls();
    });
    repeatPanel.appendChild(control);
  }
  const rotation = document.createElement('label');
  rotation.className = 'cot-custom-repeat';
  rotation.innerHTML = '<span>Tile rotation</span><input type="range" min="-180" max="180" step="15" data-custom-rotation><output data-custom-rotation-value></output>';
  rotation.querySelector<HTMLInputElement>('input')!.addEventListener('input', (event) => {
    draft = normalized({ ...draft, style: 'drawn', rotation: Number((event.currentTarget as HTMLInputElement).value) });
    syncControls();
  });
  const mirror = document.createElement('label');
  mirror.className = 'cot-custom-check';
  mirror.innerHTML = '<input type="checkbox" data-custom-mirror><span>Mirror alternate tiles to hide seams</span>';
  mirror.querySelector<HTMLInputElement>('input')!.addEventListener('change', (event) => {
    draft = normalized({ ...draft, style: 'drawn', mirror: (event.currentTarget as HTMLInputElement).checked });
    syncControls();
  });
  repeatPanel.append(rotation, mirror);

  const transferPanel = document.createElement('div');
  transferPanel.className = 'cot-camo-lab__panel';
  const transferHeading = document.createElement('div');
  transferHeading.className = 'cot-camo-lab__heading';
  transferHeading.innerHTML = '<span>Copy & paste</span><small>Share pattern recipes between local vehicles</small>';
  const transfer = document.createElement('div');
  transfer.className = 'cot-custom-transfer';
  const status = document.createElement('div');
  status.className = 'cot-custom-status';
  status.setAttribute('role', 'status');
  const setStatus = (message: string, kind = '') => {
    status.textContent = message;
    status.className = `cot-custom-status${kind ? ` ${kind}` : ''}`;
  };
  const copyPattern = document.createElement('button');
  copyPattern.type = 'button';
  copyPattern.className = 'cot-custom-tool';
  copyPattern.innerHTML = `${uiIconSVG('copy', 17)}<span>Copy pattern</span>`;
  copyPattern.addEventListener('click', async () => {
    const recipe = JSON.stringify({ schemaVersion: 1, tool: 'claude-of-tanks-camo', pattern: draft }, null, 2);
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(recipe);
      else {
        const textarea = document.createElement('textarea');
        textarea.value = recipe;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      setStatus('Pattern recipe copied to the clipboard.', 'ok');
    } catch { setStatus('Clipboard access was blocked by the browser.', 'error'); }
  });
  const pastePattern = document.createElement('button');
  pastePattern.type = 'button';
  pastePattern.className = 'cot-custom-tool';
  pastePattern.innerHTML = `${uiIconSVG('paste', 17)}<span>Paste pattern</span>`;
  pastePattern.addEventListener('click', async () => {
    try {
      const raw = await navigator.clipboard?.readText?.();
      if (!raw) throw new Error('Clipboard is empty');
      const parsed = JSON.parse(raw) as { pattern?: unknown };
      const candidate = parsed?.pattern || parsed;
      if (!candidate || typeof candidate !== 'object' || !('style' in candidate)
        || candidate.style !== 'drawn' || !('strokes' in candidate) || !Array.isArray(candidate.strokes)) {
        throw new Error('Unsupported pattern');
      }
      draft = normalized(candidate);
      syncControls();
      setStatus('Pattern recipe loaded. Apply when the preview looks right.', 'ok');
    } catch { setStatus('Paste a copied Claude of Tanks camo recipe.', 'error'); }
  });
  transfer.append(copyPattern, pastePattern);
  transferPanel.append(transferHeading, transfer, status);
  const help = document.createElement('div');
  help.className = 'cot-custom-help';
  help.innerHTML = '<strong>Local-only paint:</strong> custom recipes stay on this device. Multiplayer automatically substitutes Factory camouflage, so authored patterns never add network or match-time texture work.';
  controlsColumn.append(previewPanel, colorPanel, repeatPanel, transferPanel, help);
  root.append(canvasColumn, controlsColumn);
  modal.body.appendChild(root);

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'cot-modal__button';
  cancel.textContent = 'Close';
  cancel.addEventListener('click', () => modal.close());
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.className = 'cot-modal__button cot-modal__button--primary';
  apply.innerHTML = `${uiIconSVG('check', 17)}<span>Apply to solo vehicle</span>`;
  apply.addEventListener('click', () => {
    const id = selectedId();
    if (!id) return;
    emitClick();
    camo.setCustom(id, draft);
    refreshSelection();
    requeueThumb(id);
    setStatus('Saved locally and applied to the selected vehicle.', 'ok');
  });
  modal.footer.append(cancel, apply);

  const pointFromEvent = (event: PointerEvent): [number, number] => {
    const rect = drawCanvas.getBoundingClientRect();
    return [
      Math.max(0, Math.min(100, Math.round(((event.clientX - rect.left) / rect.width) * 100))),
      Math.max(0, Math.min(100, Math.round(((event.clientY - rect.top) / rect.height) * 100))),
    ];
  };
  drawCanvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    drawCanvas.setPointerCapture(event.pointerId);
    const strokes = draft.strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => [...point]) }));
    strokes.push({
      color: customTone as 0 | 1, size: Number(brushInput.value), brush: customBrush,
      asset: customAsset, rotation: 0, points: [pointFromEvent(event)],
    });
    draft = normalized({ ...draft, style: 'drawn', strokes });
    drawingStroke = customBrush === 'stamp' ? -1 : draft.strokes.length - 1;
    drawTile();
    if (customBrush === 'stamp') repaintPreview();
  });
  drawCanvas.addEventListener('pointermove', (event) => {
    if (drawingStroke < 0 || !drawCanvas.hasPointerCapture(event.pointerId)) return;
    const point = pointFromEvent(event);
    const strokes = draft.strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((entry) => [...entry]) }));
    const activeStroke = strokes[drawingStroke];
    const last = activeStroke.points.at(-1)!;
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 1.5) return;
    activeStroke.points.push(point);
    draft = normalized({ ...draft, style: 'drawn', strokes });
    drawTile();
  });
  const finishDrawing = () => {
    if (drawingStroke < 0) return;
    drawingStroke = -1;
    repaintPreview();
  };
  drawCanvas.addEventListener('pointerup', finishDrawing);
  drawCanvas.addEventListener('pointercancel', finishDrawing);
  root.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undoDraft();
    }
  });

  const syncSelected = () => {
    const id = selectedId();
    if (!id) return;
    draft = normalized(camo.getCustom(id));
    if (draft.style !== 'drawn') draft = normalized({ ...draft, style: 'drawn', strokes: [] });
    syncControls();
  };

  return {
    open() {
      syncSelected();
      modal.open({ trigger: button });
    },
    syncSelected,
    close: (options) => modal.close(options),
    dispose: () => modal.dispose(),
  };
}
