// The probe's two passes: a depth-only pass from the light, then a Lambert pass with a 3 × 3 comparison-PCF shadow.
struct Globals {
  view_proj: mat4x4<f32>,
  light_view_proj: mat4x4<f32>,
  light_dir: vec4<f32>,
};
struct Object {
  model: mat4x4<f32>,
  color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var shadow_map: texture_depth_2d;
@group(0) @binding(2) var shadow_sampler: sampler_comparison;
@group(1) @binding(0) var<uniform> object: Object;

@vertex
fn vs_shadow(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
  return globals.light_view_proj * object.model * vec4<f32>(position, 1.0);
}

struct VsOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) light_clip: vec4<f32>,
};

@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>) -> VsOut {
  let world = object.model * vec4<f32>(position, 1.0);
  var out: VsOut;
  out.clip = globals.view_proj * world;
  out.normal = (object.model * vec4<f32>(normal, 0.0)).xyz;
  out.light_clip = globals.light_view_proj * world;
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let n = normalize(in.normal);
  let ndl = max(dot(n, -globals.light_dir.xyz), 0.0);
  let ndc = in.light_clip.xyz / in.light_clip.w;
  let uv = ndc.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
  var lit = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      lit += textureSampleCompare(shadow_map, shadow_sampler, uv + vec2<f32>(f32(x), f32(y)) / 2048.0, ndc.z - 0.0015);
    }
  }
  lit = lit / 9.0;
  return vec4<f32>(object.color.rgb * (0.3 + 0.7 * ndl * lit), 1.0);
}
