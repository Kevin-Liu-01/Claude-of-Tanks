import { DepthFormat, DepthTexture, REVISION, Texture, UnsignedIntType, WebGLRenderTarget,
  type WebGLRenderer } from 'three';

interface TargetProperties {
  __webglFramebuffer?: WebGLFramebuffer | WebGLFramebuffer[];
  __boundDepthTexture?: DepthTexture;
  __useDefaultFramebuffer?: boolean;
  __hasExternalTextures?: boolean;
}
interface DepthProperties {
  __renderTarget?: WebGLRenderTarget;
  __webglTexture?: WebGLTexture;
  __version?: number;
}

function nativeHandle(value: WebGLFramebuffer | WebGLTexture | WebGLFramebuffer[] | undefined): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ordinaryTarget(target: WebGLRenderTarget): boolean {
  return target.constructor === WebGLRenderTarget && target.depth === 1
    && !target.multiview && !target.useArrayDepthTexture && target.textures.length === 1
    && target.texture.constructor === Texture && !target.texture.generateMipmaps
    && target.texture.mipmaps.length === 0 && !target.scissorTest
    && target.depthBuffer && !target.stencilBuffer;
}

function compatibleDepth(target: WebGLRenderTarget): boolean {
  const depth = target.depthTexture;
  return depth?.constructor === DepthTexture && depth.format === DepthFormat
    && depth.type === UnsignedIntType && !depth.generateMipmaps && depth.mipmaps.length === 0
    && depth.image.width === target.width && depth.image.height === target.height;
}

function compatibleTargets(source: WebGLRenderTarget, destination: WebGLRenderTarget): boolean {
  return source !== destination && source.depthTexture !== destination.depthTexture
    && Number.isSafeInteger(source.width) && source.width > 0
    && Number.isSafeInteger(source.height) && source.height > 0
    && source.width === destination.width && source.height === destination.height
    && Number.isSafeInteger(source.samples) && source.samples >= 0
    && source.resolveDepthBuffer && destination.samples === 0;
}

function initializedTarget(renderer: WebGLRenderer, target: WebGLRenderTarget): boolean {
  const depth = target.depthTexture!;
  if (!renderer.properties.has(target) || !renderer.properties.has(depth)) return false;
  const resources = renderer.properties.get(target) as TargetProperties;
  const texture = renderer.properties.get(depth) as DepthProperties;
  return nativeHandle(resources.__webglFramebuffer)
    && resources.__useDefaultFramebuffer === undefined && !resources.__hasExternalTextures
    && resources.__boundDepthTexture === depth && texture.__renderTarget === target
    && nativeHandle(texture.__webglTexture) && texture.__version === depth.version;
}

function fastPathSupported(renderer: WebGLRenderer, source: WebGLRenderTarget, destination: WebGLRenderTarget): boolean {
  try {
    return REVISION === '185' && ordinaryTarget(source) && ordinaryTarget(destination)
      && compatibleTargets(source, destination) && compatibleDepth(source) && compatibleDepth(destination)
      && source.depthTexture!.internalFormat === destination.depthTexture!.internalFormat
      && renderer.getRenderTarget() === destination && renderer.getActiveCubeFace() === 0
      && renderer.getActiveMipmapLevel() === 0 && !renderer.getScissorTest()
      && initializedTarget(renderer, source) && initializedTarget(renderer, destination);
  } catch { return false; }
}

function copyContext(renderer: WebGLRenderer): WebGL2RenderingContext | null {
  try {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    return typeof gl?.blitFramebuffer === 'function' && typeof renderer.state?.bindFramebuffer === 'function' ? gl : null;
  } catch { return null; }
}

function blitDepth(
  renderer: WebGLRenderer, gl: WebGL2RenderingContext,
  sourceFramebuffer: WebGLFramebuffer, destinationFramebuffer: WebGLFramebuffer,
  width: number, height: number,
): void {
  let failure: (() => never) | undefined;
  try {
    renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER, sourceFramebuffer);
    renderer.state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, destinationFramebuffer);
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
  } catch (error) { failure = () => { throw error; }; }
  finally {
    // Match Three185's depth branch, including its DRAW/FRAMEBUFFER cache alias.
    // A caller's following setRenderTarget must observe the invalidated binding.
    try { renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER, null); }
    catch (error) { failure ??= () => { throw error; }; }
    try { renderer.state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null); }
    catch (error) { failure ??= () => { throw error; }; }
  }
  failure?.();
}

/**
 * Exact full-size Three185 depth-only copy without CPU-upload UNPACK queries.
 * Caller has completed the source scene render (and its MSAA depth resolve),
 * and currently owns the ordinary destination target at face/mip zero.
 * Read current renderer properties on every call; never own/cache native handles.
 * Unsupported state falls back before any framebuffer mutation. Native errors
 * after submission begins propagate after both cleanup attempts, never retry.
 */
export function copyResolvedDepth(
  renderer: WebGLRenderer, source: WebGLRenderTarget, destination: WebGLRenderTarget,
): void {
  if (!fastPathSupported(renderer, source, destination)) {
    return renderer.copyTextureToTexture(source.depthTexture!, destination.depthTexture!);
  }
  const gl = copyContext(renderer);
  const sourceFramebuffer = (renderer.properties.get(source) as TargetProperties).__webglFramebuffer!;
  const destinationFramebuffer = (renderer.properties.get(destination) as TargetProperties).__webglFramebuffer!;
  const sourceTexture = (renderer.properties.get(source.depthTexture!) as DepthProperties).__webglTexture;
  const destinationTexture = (renderer.properties.get(destination.depthTexture!) as DepthProperties).__webglTexture;
  if (!gl || sourceFramebuffer === destinationFramebuffer || sourceTexture === destinationTexture) {
    return renderer.copyTextureToTexture(source.depthTexture!, destination.depthTexture!);
  }
  blitDepth(renderer, gl, sourceFramebuffer as WebGLFramebuffer,
    destinationFramebuffer as WebGLFramebuffer, source.width, source.height);
}
