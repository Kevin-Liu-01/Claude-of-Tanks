const VIEW_POSITIONS = Object.freeze({
  hero: [4, 4],
  front: [12, 2.5],
  left: [2.5, 12],
  right: [21.5, 12],
  rear: [12, 21.5],
  'elevated-left': [3.5, 6],
  'elevated-right': [20.5, 6],
});

const tankPlan = () => `
  <path class="camera-view-glyph__tank" d="M8.5 8.4h7v7.8h-7zM10.1 6.7h3.8v3.4h-3.8zM11.4 3.8h1.2v3.4h-1.2z"/>
  <path class="camera-view-glyph__track" d="M7 8v8.7M17 8v8.7"/>`;

function marker(x, y, elevated = false) {
  const dx = 12 - x;
  const dy = 12 - y;
  const length = Math.hypot(dx, dy) || 1;
  const endX = 12 - (dx / length) * 4.8;
  const endY = 12 - (dy / length) * 4.8;
  return `
    <path class="camera-view-glyph__guide" d="M${x} ${y}L${endX.toFixed(2)} ${endY.toFixed(2)}"/>
    <circle class="camera-view-glyph__camera" cx="${x}" cy="${y}" r="1.8"/>
    ${elevated ? `<path class="camera-view-glyph__height" d="M${x - 2.2} ${y - 2.2}L${x} ${y - 4.2}l2.2 2"/>` : ''}`;
}

export const CAMERA_VIEW_IDS = Object.freeze([
  'hero', 'front', 'left', 'right', 'rear', 'top', 'elevated-left', 'elevated-right', 'auto',
]);

export function cameraViewGlyphSVG(view) {
  if (!CAMERA_VIEW_IDS.includes(view)) throw new Error(`Unknown camera view: ${view}`);
  let overlay = '';
  if (view === 'top') {
    overlay = '<path class="camera-view-glyph__focus" d="M5 8V5h3M16 5h3v3M19 16v3h-3M8 19H5v-3"/>';
  } else if (view === 'auto') {
    overlay = '<path class="camera-view-glyph__orbit" d="M4.2 9.2A8.2 8.2 0 0 1 18 5.4l1.8-.2-.3-1.8M19.8 14.8A8.2 8.2 0 0 1 6 18.6l-1.8.2.3 1.8"/>';
  } else {
    const [x, y] = VIEW_POSITIONS[view];
    overlay = marker(x, y, view.startsWith('elevated-'));
  }
  return `<svg class="camera-view-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${tankPlan()}${overlay}</svg>`;
}
