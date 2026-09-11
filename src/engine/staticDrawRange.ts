import { Box3, Frustum, Matrix4, type BufferGeometry, type Camera, type Mesh } from 'three';

/** Exact contiguous primitive runs in one uniquely owned, immutable buffer. */
export interface StaticDrawRun {
  start: number;
  count: number;
  bounds: Box3;
}

// Only complete post transactions enable this optimization. Standalone warm,
// capture and shadow submissions retain the full authored range.
let frameDepth = 0;
const pending: StaticDrawRange[] = [];

export function beginStaticDrawRangeFrame(): number {
  frameDepth++;
  return pending.length;
}

export function endStaticDrawRangeFrame(marker: number): void {
  try {
    while (pending.length > marker) pending.pop()?.restore();
  } finally {
    frameDepth--;
  }
}

class StaticDrawRange {
  private readonly mesh: Mesh;
  private readonly runs: readonly StaticDrawRun[];
  private readonly geometry: BufferGeometry;
  private readonly projection = new Matrix4();
  private readonly previousProjection = new Matrix4();
  private readonly frustum = new Frustum();
  private previousCoordinateSystem: number | undefined;
  private previousReversedDepth: boolean | undefined;
  private cached = false;
  private active = false;
  private start = 0;
  private count = 0;
  private savedStart = 0;
  private savedCount = Infinity;

  constructor(mesh: Mesh, runs: readonly StaticDrawRun[]) {
    this.mesh = mesh;
    this.runs = runs;
    this.geometry = mesh.geometry;
  }

  private select(camera: Camera): void {
    // Test owner-local boxes directly against owner-local clip planes. This
    // covers root re-seating/rotation/non-uniform scale without transforming
    // every box or allocating frame scratch.
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .multiply(this.mesh.matrixWorld);
    if (this.cached && this.projection.equals(this.previousProjection)
      && camera.coordinateSystem === this.previousCoordinateSystem
      && camera.reversedDepth === this.previousReversedDepth) return;
    this.previousProjection.copy(this.projection);
    this.previousCoordinateSystem = camera.coordinateSystem;
    this.previousReversedDepth = camera.reversedDepth;
    this.cached = true;
    this.frustum.setFromProjectionMatrix(this.projection, camera.coordinateSystem, camera.reversedDepth);
    let first = Infinity, last = 0;
    for (const run of this.runs) {
      if (!this.frustum.intersectsBox(run.bounds)) continue;
      first = Math.min(first, run.start);
      last = Math.max(last, run.start + run.count);
    }
    this.start = Number.isFinite(first) ? first : 0;
    this.count = Math.max(0, last - this.start);
  }

  before(camera: Camera): void {
    // A nested draw of this same mesh must not inherit its outer camera's
    // trimmed range. Restore and use the full range for that nested draw.
    if (this.active) { this.restore(); return; }
    const material = this.mesh.material;
    if (!frameDepth || this.mesh.castShadow || !this.mesh.frustumCulled
      || this.mesh.geometry !== this.geometry || Array.isArray(material)
      || material.transparent || this.geometry.drawRange.start !== 0
      || this.geometry.drawRange.count !== Infinity) return;
    this.select(camera);
    this.savedStart = this.geometry.drawRange.start;
    this.savedCount = this.geometry.drawRange.count;
    this.active = true;
    pending.push(this);
    this.geometry.setDrawRange(this.start, this.count);
  }

  restore(): void {
    if (!this.active) return;
    this.geometry.setDrawRange(this.savedStart, this.savedCount);
    this.active = false;
  }

  after(): void {
    this.restore();
    if (pending[pending.length - 1] === this) pending.pop();
  }
}

/** No new GPU resources or draw owners: trim only invisible end runs. */
export function installStaticDrawRange(mesh: Mesh, runs: readonly StaticDrawRun[]): void {
  if (mesh.castShadow || !mesh.frustumCulled || runs.length < 2) return;
  const range = new StaticDrawRange(mesh, runs);
  mesh.userData.staticDrawRangeRuns = runs.length;
  mesh.onBeforeRender = (_renderer, _scene, camera) => { range.before(camera); };
  mesh.onAfterRender = () => { range.after(); };
}
