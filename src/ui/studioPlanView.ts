/**
 * The Studio's Plan view (owner 2026-10-05, of the media previz: "the very basic storyboard versions are cool, do we
 * show those in the studio?"): the take from above — the battlefield's roads, buildings, woods and water (the HUD
 * minimap's features), every keyed tank's route, the camera's track and its view wedge at the playhead — over the
 * camera's distance to the hero and its height across the take. Sampled with the timeline's own interpolation, so the
 * plan shows the motion the renderer plays; the graph scrubs the timeline. A 2D canvas built only with the Studio.
 */
import { sampleActorTrack, sampleCameraRail } from '../game/studioTimeline.ts';
import type { ActorTrackSample, CameraRailSample, Storyboard } from '../game/studioTimeline.ts';

/** The battlefield's plan: the HUD minimap's features and the map's extent (Studio getPlanFeatures). */
export interface StudioPlanFeatures {
  readonly size: number;
  readonly roads: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  readonly buildings: ReadonlyArray<{ readonly x: number; readonly z: number; readonly [key: string]: unknown }>;
  readonly treeClusters: ReadonlyArray<{ readonly x: number; readonly z: number; readonly r: number }>;
  readonly waterOrSoft: ReadonlyArray<{ readonly x: number; readonly z: number; readonly r: number }>;
}

type PlanSide = 'hero' | 'ally' | 'foe';
/** A tank on the plan: its storyboard name (tracks key by it), where it stands and which side it reads as. */
export interface PlanActor {
  readonly name: string;
  readonly x: number;
  readonly z: number;
  readonly facingDeg: number;
}
interface PlanRoute { readonly name: string; readonly side: PlanSide; readonly points: Float32Array }
/** What the plan draws, independent of the canvas: the window, the routes, the camera's track and the take's graph. */
export interface PlanGeometry {
  readonly bounds: { readonly cx: number; readonly cz: number; readonly half: number };
  readonly routes: readonly PlanRoute[];
  readonly rail: Float32Array | null;
  readonly series: { readonly distance: Float32Array; readonly height: Float32Array; readonly max: number } | null;
  readonly hero: string | null;
}

/** The hero is the actor named so, else the first; names starting "foe" are the enemy (the shot tools' convention). */
export const planSide = (name: string, hero: string | null): PlanSide => (name === hero ? 'hero' : /^foe/i.test(name) ? 'foe' : 'ally');

/**
 * The plan of a take: every actor track and the camera rail sampled `samples` times across the storyboard, the
 * camera's distance to the hero and its height at each sample, and a square window holding all of it with a margin
 * (or 150 m round the cast when nothing moves).
 */
export function planGeometry(storyboard: Storyboard, actors: readonly PlanActor[], samples = 120): PlanGeometry {
  const hero = actors.find((a) => a.name === 'hero')?.name ?? actors[0]?.name ?? null;
  const dur = Math.max(1, storyboard.durationMs), track: ActorTrackSample = {}, cam: CameraRailSample = {};
  const routes: PlanRoute[] = [];
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const grow = (x: number, z: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
  for (const a of actors) grow(a.x, a.z);
  for (const t of storyboard.actorTracks) {
    if (t.keys.length < 2) continue;
    const points = new Float32Array((samples + 1) * 2);
    for (let i = 0; i <= samples; i++) {
      sampleActorTrack(t.keys, dur * i / samples, track);
      points[i * 2] = track.x ?? 0; points[i * 2 + 1] = track.z ?? 0;
      grow(points[i * 2], points[i * 2 + 1]);
    }
    routes.push({ name: t.actor, side: planSide(t.actor, hero), points });
  }
  let rail: Float32Array | null = null, series: PlanGeometry['series'] = null;
  if (storyboard.shots.length) {
    rail = new Float32Array((samples + 1) * 2);
    const distance = new Float32Array(samples + 1), height = new Float32Array(samples + 1);
    const heroTrack = storyboard.actorTracks.find((t) => t.actor === hero && t.keys.length);
    const heroStill = actors.find((a) => a.name === hero);
    let max = 10;
    for (let i = 0; i <= samples; i++) {
      const tMs = dur * i / samples;
      sampleCameraRail(storyboard.shots, tMs, cam);
      const cx = cam.x ?? 0, cy = cam.y ?? 0, cz = cam.z ?? 0;
      rail[i * 2] = cx; rail[i * 2 + 1] = cz;
      grow(cx, cz);
      let hx = heroStill?.x ?? cx, hz = heroStill?.z ?? cz;
      if (heroTrack) { sampleActorTrack(heroTrack.keys, tMs, track); hx = track.x ?? hx; hz = track.z ?? hz; }
      distance[i] = Math.hypot(cx - hx, cy - 1.5, cz - hz); height[i] = cy;
      max = Math.max(max, distance[i], height[i]);
    }
    series = { distance, height, max };
  }
  if (!Number.isFinite(x0)) return { bounds: { cx: 0, cz: 0, half: 150 }, routes, rail, series, hero };
  const half = Math.max(60, (Math.max(x1 - x0, z1 - z0) / 2) * 1.15 + 25);
  return { bounds: { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, half }, routes, rail, series, hero };
}

interface PlanSource {
  getPlanFeatures(): StudioPlanFeatures | null;
  getStoryboard(): unknown;
  getCamera(): { readonly pos: readonly number[]; readonly lookAt: readonly number[]; readonly fov: number };
  readonly fxTimeMs: number;
  readonly durationMs: number;
  readonly mapId: string | null;
  readonly _internal: { readonly actors: ReadonlyArray<{ readonly uid: string; readonly name?: string | null; readonly pose: { readonly x: number; readonly z: number; readonly facingDeg: number } }> };
  seek(milliseconds: number): unknown;
}

const COLORS = { ground: '#1d2418', grid: 'rgba(255,255,255,0.06)', road: '#a89f86', building: '#b07a5a', wood: 'rgba(60,140,60,0.42)',
  water: 'rgba(70,120,190,0.55)', hero: '#f0a12e', ally: '#7fb2e5', foe: '#e5484d', lens: '#65d0dd', height: '#ffd27a', ink: '#0b0e11', text: '#9fb0bf' };

/** The Plan block for the Studio panel: the map canvas over the graph, redrawn as the playhead and the take change. */
export function createPlanView(S: PlanSource, t: (key: string) => string): { readonly root: HTMLElement; refreshPlan(): void; refreshTime(): void } {
  const root = document.createElement('div');
  root.className = 'planView';
  root.style.cssText = 'display:grid;gap:6px;margin-top:8px';
  const map = document.createElement('canvas'), graph = document.createElement('canvas');
  map.setAttribute('role', 'img'); map.setAttribute('aria-label', t('studioPanel.plan.aria'));
  graph.setAttribute('role', 'slider'); graph.setAttribute('aria-label', t('studioPanel.plan.graphAria'));
  map.style.cssText = 'width:100%;aspect-ratio:1;border-radius:3px;display:block;background:' + COLORS.ground;
  graph.style.cssText = 'width:100%;height:64px;border-radius:3px;display:block;cursor:ew-resize;background:' + COLORS.ink;
  const legend = document.createElement('div');
  legend.style.cssText = 'font:10px/1.3 ui-monospace,monospace;letter-spacing:.06em;color:' + COLORS.text;
  root.append(map, graph, legend);
  let plan: PlanGeometry | null = null, features: StudioPlanFeatures | null = null, base: HTMLCanvasElement | null = null, mapKey = '';
  const cam: CameraRailSample = {}, track: ActorTrackSample = {};

  const fit = (canvas: HTMLCanvasElement) => {
    const ratio = Math.min(2, window.devicePixelRatio || 1), w = Math.max(1, Math.round(canvas.clientWidth * ratio)), h = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; return true; }
    return false;
  };
  // north-up like the game's tactical map (minimapOrientation.ts): world +Z is up the map and -X is to its right
  const toPx = (x: number, z: number, size: number) => {
    const b = plan!.bounds, k = size / (2 * b.half);
    return [(b.cx + b.half - x) * k, (b.cz + b.half - z) * k] as const;
  };
  /** The still layer: ground, grid, roads, water, woods, buildings — redrawn when the window or the map changes. */
  function drawBase(size: number): HTMLCanvasElement {
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const g = c.getContext('2d')!;
    g.fillStyle = COLORS.ground; g.fillRect(0, 0, size, size);
    const b = plan!.bounds, k = size / (2 * b.half), step = b.half > 220 ? 100 : 50;
    g.strokeStyle = COLORS.grid; g.lineWidth = 1;
    for (let v = Math.ceil((b.cx - b.half) / step) * step; v < b.cx + b.half; v += step) { const [px] = toPx(v, 0, size); g.beginPath(); g.moveTo(px, 0); g.lineTo(px, size); g.stroke(); }
    for (let v = Math.ceil((b.cz - b.half) / step) * step; v < b.cz + b.half; v += step) { const [, pz] = toPx(0, v, size); g.beginPath(); g.moveTo(0, pz); g.lineTo(size, pz); g.stroke(); }
    if (!features) return c;
    g.fillStyle = COLORS.water;
    for (const w of features.waterOrSoft) { const [px, pz] = toPx(w.x, w.z, size); g.beginPath(); g.arc(px, pz, w.r * k, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = COLORS.road; g.lineWidth = Math.max(1.5, 8 * k); g.lineJoin = 'round'; g.lineCap = 'round';
    for (const road of features.roads) { g.beginPath(); road.forEach(([x, z], i) => { const [px, pz] = toPx(x, z, size); if (i) g.lineTo(px, pz); else g.moveTo(px, pz); }); g.stroke(); }
    g.fillStyle = COLORS.wood;
    for (const w of features.treeClusters) { const [px, pz] = toPx(w.x, w.z, size); g.beginPath(); g.arc(px, pz, Math.max(2, w.r * k), 0, Math.PI * 2); g.fill(); }
    g.fillStyle = COLORS.building;
    for (const bd of features.buildings) {
      const w = Number(bd.w) || 8, d = Number(bd.d) || 8, rot = Number(bd.rot) || 0, c0 = Math.cos(rot), s0 = Math.sin(rot);
      g.beginPath();
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([u, v], i) => {
        const [px, pz] = toPx(bd.x + c0 * u * w / 2 - s0 * v * d / 2, bd.z + s0 * u * w / 2 + c0 * v * d / 2, size);
        if (i) g.lineTo(px, pz); else g.moveTo(px, pz);
      });
      g.closePath(); g.fill();
    }
    return c;
  }
  function draw() {
    if (!root.isConnected || !plan) return;
    fit(map); fit(graph);
    const size = map.width, g = map.getContext('2d')!;
    if (!base || base.width !== size) base = drawBase(size);
    g.drawImage(base, 0, 0);
    const now = S.fxTimeMs;
    // routes, then the camera's track
    g.lineWidth = Math.max(1, size / 260);
    for (const r of plan.routes) {
      g.strokeStyle = COLORS[r.side]; g.globalAlpha = 0.55; g.beginPath();
      for (let i = 0; i < r.points.length; i += 2) { const [px, pz] = toPx(r.points[i], r.points[i + 1], size); if (i) g.lineTo(px, pz); else g.moveTo(px, pz); }
      g.stroke(); g.globalAlpha = 1;
    }
    if (plan.rail) {
      g.strokeStyle = COLORS.lens; g.lineWidth = Math.max(1.5, size / 200); g.beginPath();
      for (let i = 0; i < plan.rail.length; i += 2) { const [px, pz] = toPx(plan.rail[i], plan.rail[i + 1], size); if (i) g.lineTo(px, pz); else g.moveTo(px, pz); }
      g.stroke();
    }
    // the cast at the playhead: a dot and a heading tick each
    const storyboard = S.getStoryboard() as Storyboard;
    for (const a of S._internal.actors) {
      const name = a.name ?? a.uid, keys = storyboard.actorTracks.find((tr) => tr.actor === name || tr.actor === a.uid)?.keys;
      let x = a.pose.x, z = a.pose.z, h = a.pose.facingDeg;
      if (keys?.length) { sampleActorTrack(keys, now, track); x = track.x ?? x; z = track.z ?? z; h = track.facingDeg ?? h; }
      const [px, pz] = toPx(x, z, size), r = Math.max(3, size / 90);
      g.fillStyle = COLORS[planSide(name, plan.hero)];
      g.beginPath(); g.arc(px, pz, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = g.fillStyle; g.lineWidth = Math.max(1, size / 300); g.beginPath(); g.moveTo(px, pz);
      g.lineTo(px - Math.sin(h * Math.PI / 180) * r * 2.4, pz - Math.cos(h * Math.PI / 180) * r * 2.4); g.stroke();
    }
    // the camera at the playhead (on its rail, else where the free camera stands) and its view wedge
    let cx: number, cz: number, lx: number, lz: number, fov: number;
    if (storyboard.shots.length) { sampleCameraRail(storyboard.shots, now, cam); cx = cam.x ?? 0; cz = cam.z ?? 0; lx = cam.lookX ?? cx; lz = cam.lookZ ?? cz + 1; fov = cam.fov ?? 40; }
    else { const c = S.getCamera(); cx = c.pos[0]; cz = c.pos[2]; lx = c.lookAt[0]; lz = c.lookAt[2]; fov = c.fov; }
    const yaw = Math.atan2(lx - cx, lz - cz), aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const halfH = Math.atan(Math.tan(fov * Math.PI / 360) * aspect), reach = Math.max(40, plan.bounds.half * 0.35);
    const [pcx, pcz] = toPx(cx, cz, size);
    g.fillStyle = 'rgba(101,208,221,0.22)'; g.beginPath(); g.moveTo(pcx, pcz);
    for (const s of [-1, 1]) { const [px, pz] = toPx(cx + Math.sin(yaw + s * halfH) * reach, cz + Math.cos(yaw + s * halfH) * reach, size); g.lineTo(px, pz); }
    g.closePath(); g.fill();
    g.fillStyle = COLORS.lens; g.beginPath(); g.arc(pcx, pcz, Math.max(3.5, size / 80), 0, Math.PI * 2); g.fill();
    // the graph: the camera's distance to the hero and its height across the take, the playhead
    const gg = graph.getContext('2d')!, W = graph.width, H = graph.height, s = plan.series;
    gg.fillStyle = COLORS.ink; gg.fillRect(0, 0, W, H);
    if (s) {
      const n = s.distance.length - 1, px = (i: number) => (i / n) * W, py = (v: number) => H - 4 - (v / s.max) * (H - 8);
      for (const [series, color] of [[s.height, COLORS.height], [s.distance, COLORS.lens]] as const) {
        gg.strokeStyle = color; gg.lineWidth = Math.max(1.5, H / 40); gg.beginPath();
        for (let i = 0; i <= n; i++) { if (i) gg.lineTo(px(i), py(series[i])); else gg.moveTo(px(i), py(series[i])); }
        gg.stroke();
      }
    }
    const x = (now / Math.max(1, S.durationMs)) * W;
    gg.strokeStyle = COLORS.hero; gg.lineWidth = Math.max(1.5, W / 300); gg.beginPath(); gg.moveTo(x, 0); gg.lineTo(x, H); gg.stroke();
    graph.setAttribute('aria-valuenow', String(Math.round(now)));
  }
  function seekAt(event: PointerEvent) {
    const rect = graph.getBoundingClientRect();
    S.seek(Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))) * S.durationMs);
  }
  graph.addEventListener('pointerdown', (event) => { graph.setPointerCapture(event.pointerId); seekAt(event); });
  graph.addEventListener('pointermove', (event) => { if (graph.hasPointerCapture(event.pointerId)) seekAt(event); });
  graph.setAttribute('aria-valuemin', '0');

  return {
    root,
    refreshPlan() {
      const storyboard = S.getStoryboard() as Storyboard;
      const actors = S._internal.actors.map((a) => ({ name: a.name ?? a.uid, x: a.pose.x, z: a.pose.z, facingDeg: a.pose.facingDeg }));
      const next = planGeometry(storyboard, actors);
      const key = `${S.mapId}|${next.bounds.cx.toFixed(0)}|${next.bounds.cz.toFixed(0)}|${next.bounds.half.toFixed(0)}`;
      if (key !== mapKey) { features = S.getPlanFeatures(); base = null; mapKey = key; }
      plan = next;
      graph.setAttribute('aria-valuemax', String(Math.round(S.durationMs)));
      legend.textContent = next.series ? t('studioPanel.plan.legend') : t('studioPanel.plan.empty');
      draw();
    },
    refreshTime() { draw(); },
  };
}
