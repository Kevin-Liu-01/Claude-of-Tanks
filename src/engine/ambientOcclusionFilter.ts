/**
 * Keep AO, its surface normal and view depth together in the existing RGBA16F
 * target. The stock denoiser reconstructs a normal from nine depth reads for
 * every sparse, randomly rotated tap. Reusing the producer's normal lets a
 * dense 5x5 edge-aware filter remove that spatial grain with fewer reads and
 * no new target, pass, history, or resolution increase.
 */
export function packAmbientOcclusionShader(source: string): string {
  if (!source.includes('void main()') || !source.includes('gl_FragColor = FRAGMENT_OUTPUT;')) {
    throw new Error('GTAO producer changed: revalidate packed surface output');
  }
  return source.replace('void main()', `
    vec2 cotPackAoNormal(vec3 n) {
      n /= max(abs(n.x) + abs(n.y) + abs(n.z), 1e-6);
      return n.z >= 0.0 ? n.xy : (1.0 - abs(n.yx))
        * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
    }
    void main()`)
    // Sky and clipped geometry have no surface. Never leave the clear alpha
    // (one metre) behind for a neighbouring silhouette to treat as geometry.
    .replaceAll('discard;', 'gl_FragColor = vec4(1.0, 0.0, 0.0, 0.0);')
    .replace('gl_FragColor = FRAGMENT_OUTPUT;',
      'gl_FragColor = vec4(ao, cotPackAoNormal(viewNormal), -viewPos.z);');
}

export const AMBIENT_OCCLUSION_DENOISE_SHADER = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform mat4 cameraProjectionMatrixInverse;
  uniform float depthPhi, normalPhi, lumaPhi;

  vec3 cotUnpackAoNormal(vec2 e) {
    vec3 n = vec3(e, 1.0 - abs(e.x) - abs(e.y));
    float t = clamp(-n.z, 0.0, 1.0);
    n.xy += vec2(n.x >= 0.0 ? -t : t, n.y >= 0.0 ? -t : t);
    return normalize(n);
  }
  vec3 cotAoViewPosition(vec2 uv, float depth) {
    vec4 ray = cameraProjectionMatrixInverse * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
    return ray.xyz * (-depth / ray.z);
  }
  float cotAoGaussian(int offset) {
    return offset == 0 ? 6.0 : (abs(offset) == 1 ? 4.0 : 1.0);
  }
  void main() {
    ivec2 size = textureSize(tDiffuse, 0);
    ivec2 p = clamp(ivec2(vUv * vec2(size)), ivec2(0), size - 1);
    vec4 center = texelFetch(tDiffuse, p, 0);
    if (center.a <= 0.0) { gl_FragColor = vec4(1.0); return; }
    vec3 normal = cotUnpackAoNormal(center.gb);
    vec3 position = cotAoViewPosition((vec2(p) + 0.5) / vec2(size), center.a);
    float total = 0.0;
    float weight = 0.0;
    for (int y = -2; y <= 2; y++) {
      for (int x = -2; x <= 2; x++) {
        ivec2 q = clamp(p + ivec2(x, y), ivec2(0), size - 1);
        vec4 sampleValue = texelFetch(tDiffuse, q, 0);
        vec3 sampleNormal = cotUnpackAoNormal(sampleValue.gb);
        vec3 samplePosition = cotAoViewPosition((vec2(q) + 0.5) / vec2(size), sampleValue.a);
        float normalWeight = pow(max(dot(normal, sampleNormal), 0.0), normalPhi);
        float planeWeight = max(1.0 - abs(dot(position - samplePosition, normal)) / depthPhi, 0.0);
        float lumaWeight = max(1.0 - abs(center.r - sampleValue.r) / lumaPhi, 0.0);
        float w = cotAoGaussian(x) * cotAoGaussian(y) * normalWeight * planeWeight
          * lumaWeight * step(0.0001, sampleValue.a);
        total += sampleValue.r * w;
        weight += w;
      }
    }
    float ao = weight > 0.0 ? total / weight : center.r;
    gl_FragColor = vec4(vec3(ao), 1.0);
  }
`;
