import * as THREE from 'three';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { LATE_FX_LAYER } from '../fx/layers.ts';

/**
 * Keep resolved world color/depth in one independent target. The following
 * SceneAerialPass reads that target directly, so the normal composer path does
 * not need an identity color copy before doing its first real shading work.
 */
export class SceneAAPass extends RenderPass {
  readonly sceneTarget: THREE.WebGLRenderTarget;
  readonly copyMaterial: THREE.ShaderMaterial;
  readonly copyQuad: FullScreenQuad;
  directColorConsumer: SceneAerialPass | null = null;
  private matrixFrameOpen = false;
  private matrixFrameReady = false;
  private matrixFrameEpoch = 0;
  private matrixFrameRenderer: THREE.WebGLRenderer | null = null;
  private matrixFrameScene: THREE.Scene | null = null;
  private matrixFrameCamera: THREE.Camera | null = null;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    target: THREE.WebGLRenderTarget,
  ) {
    super(scene, camera);
    this.sceneTarget = target;
    // Preserve the existing standalone/terminal-pass presentation path. This
    // quad is not submitted in the normal scene -> aerial composer chain.
    this.copyMaterial = new THREE.ShaderMaterial({
      name: 'SceneAAPass.Copy',
      uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
      vertexShader: CopyShader.vertexShader,
      fragmentShader: CopyShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      toneMapped: false,
    });
    this.copyMaterial.uniforms.tDiffuse.value = target.texture;
    this.copyQuad = new FullScreenQuad(this.copyMaterial);
  }

  setSize(width: number, height: number): void {
    this.endMatrixFrame();
    this.sceneTarget.setSize(width, height);
  }

  /** Only the complete synchronous composer transaction may share transforms. */
  beginMatrixFrame(renderer: THREE.WebGLRenderer): void {
    this.matrixFrameEpoch++;
    this.matrixFrameOpen = true;
    this.matrixFrameReady = false;
    this.matrixFrameRenderer = renderer;
    this.matrixFrameScene = this.scene;
    this.matrixFrameCamera = this.camera;
  }

  endMatrixFrame(): void {
    this.matrixFrameEpoch++;
    this.matrixFrameOpen = false;
    this.matrixFrameReady = false;
    this.matrixFrameRenderer = null;
    this.matrixFrameScene = null;
    this.matrixFrameCamera = null;
  }

  /** One consumer, same scene/camera, and never a previous or failed frame. */
  consumeMatrixFrame(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): boolean {
    const ready = this.matrixFrameReady && renderer === this.matrixFrameRenderer
      && scene === this.matrixFrameScene && camera === this.matrixFrameCamera
      && scene === this.scene && camera === this.camera
      && scene.matrixWorldAutoUpdate;
    this.endMatrixFrame();
    return ready;
  }

  setSamples(samples: number): void {
    if (this.sceneTarget.samples === samples) return;
    this.sceneTarget.samples = samples;
    // Reallocate only GPU storage; the following pass keeps the same target
    // and texture identities through both preset and viewport changes.
    this.sceneTarget.dispose();
  }

  render(
    renderer: THREE.WebGLRenderer,
    _writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    const oldAutoClear = renderer.autoClear;
    const oldLayerMask = this.camera.layers.mask;
    const matrixEpoch = this.matrixFrameEpoch;
    const updatesMatrices = this.scene.matrixWorldAutoUpdate;
    this.matrixFrameReady = false;
    renderer.autoClear = false;
    try {
      this.camera.layers.disable(LATE_FX_LAYER);
      renderer.setRenderTarget(this.sceneTarget);
      renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
      renderer.render(this.scene, this.camera);
      // Three updates the entire graph before layer filtering, including FX.
      // Aerial and GTAO do not mutate application transforms between draws.
      this.matrixFrameReady = this.matrixFrameOpen && matrixEpoch === this.matrixFrameEpoch
        && renderer === this.matrixFrameRenderer && this.scene === this.matrixFrameScene
        && this.camera === this.matrixFrameCamera && updatesMatrices && this.scene.matrixWorldAutoUpdate;
      // WebGLRenderer resolves its multisampled target after the scene draw.
      // No composer buffer is a source until SceneAerialPass has written it.
      // Isolated warming/debugging can disable Aerial. Preserve the old
      // composer input in that case rather than exposing a stale buffer.
      if (this.renderToScreen || !this.directColorConsumer?.enabled) {
        this.copyMaterial.uniforms.tDiffuse.value = this.sceneTarget.texture;
        renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
        this.copyQuad.render(renderer);
      }
    } finally {
      this.camera.layers.mask = oldLayerMask;
      renderer.autoClear = oldAutoClear;
    }
  }
}

/** First shading pass: source color is independent of composer swap parity. */
export class SceneAerialPass extends ShaderPass {
  readonly sceneTarget: THREE.WebGLRenderTarget;
  private directColorTarget: THREE.WebGLRenderTarget | null = null;
  private directColorReadBuffer: THREE.WebGLRenderTarget | null = null;

  constructor(
    shader: ConstructorParameters<typeof ShaderPass>[0],
    sceneTarget: THREE.WebGLRenderTarget,
  ) {
    super(shader);
    this.sceneTarget = sceneTarget;
  }

  /** Borrow LateFX's color attachment for this canonical composer frame only. */
  beginDirectColorFrame(target: THREE.WebGLRenderTarget | null): void {
    this.directColorTarget = target;
    this.directColorReadBuffer = null;
  }

  endDirectColorFrame(): void {
    this.directColorTarget = null;
    this.directColorReadBuffer = null;
  }

  /** The producer's original write buffer becomes LateFX's read buffer after swap. */
  consumeDirectColor(target: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): boolean {
    const ready = this.directColorTarget === target && this.directColorReadBuffer === readBuffer;
    this.endDirectColorFrame();
    return ready;
  }

  setSize(_width: number, _height: number): void {
    this.endDirectColorFrame();
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    _readBuffer: THREE.WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ): void {
    const target = this.directColorTarget;
    this.directColorReadBuffer = null;
    // Standalone/warm, masked, terminal and incompatible-target paths retain
    // ShaderPass's original destination. No composer swap semantics change.
    const direct = target && this.needsSwap && !this.renderToScreen && !maskActive
      && target !== this.sceneTarget && target !== writeBuffer && target.samples === 0
      && target.width === writeBuffer.width && target.height === writeBuffer.height
      && target.texture.type === writeBuffer.texture.type
      && target.texture.format === writeBuffer.texture.format
      && target.texture.internalFormat === writeBuffer.texture.internalFormat
      && target.texture.colorSpace === writeBuffer.texture.colorSpace;
    if (!direct) {
      super.render(renderer, writeBuffer, this.sceneTarget, deltaTime, maskActive);
      return;
    }
    // Composer color buffers have no depth attachment; LateFX's target does.
    // Preserve that former behavior until LateFX installs resolved scene depth.
    const oldDepthTest = this.material.depthTest;
    const oldDepthWrite = this.material.depthWrite;
    this.material.depthTest = false;
    this.material.depthWrite = false;
    try {
      super.render(renderer, target, this.sceneTarget, deltaTime, maskActive);
      this.directColorReadBuffer = writeBuffer;
    } finally {
      this.material.depthTest = oldDepthTest;
      this.material.depthWrite = oldDepthWrite;
    }
  }
}
