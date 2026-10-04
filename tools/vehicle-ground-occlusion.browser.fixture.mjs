// The in-page half of tools/vehicle-ground-occlusion.browser.selftest.mjs (and of the vehicle-ground lane's capture
// lab): compile the ground-occlusion GLSL (src/engine/vehicleGroundOcclusion.ts) with stand-ins for the aerial pass's
// contact block, evaluate cotVehicleGroundShade at each receiver into one row of a float target, and read back
// 1 − shade per receiver. page.evaluate serializes this function: it must not reference anything outside itself.

/**
 * @param {{ glsl: string, hullCount: number, rows: number[], solids: number[], light: number[], amb: number[],
 *   sunLum: number, sunDir: number[], fillDir: number[], points: number[][], normals: number[][] }} input
 * @returns {{ values: number[], renderer: string | null }}
 */
export function evaluateVehicleGroundGlsl(input) {
  const n = input.points.length;
  const canvas = document.createElement('canvas');
  canvas.width = n; canvas.height = 1;
  const gl = canvas.getContext('webgl2', { antialias: false, depth: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('webgl2 unavailable');
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float unavailable');
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : null;
  const vs = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4( aPos, 0.0, 1.0 ); }`;
  const fs = `#version 300 es
precision highp float;
precision highp int;
uniform vec4 uContactAmb;
uniform float uContactSunLum;
uniform vec3 uContactFillDir;
uniform vec3 uSunDir;
uniform vec3 uPts[ ${n} ];
uniform vec3 uNrm[ ${n} ];
float cotSunVisOf( float alpha ) { return 1.0; }
vec3 cotNormalAt( vec2 uv, vec3 P ) { return uNrm[ int( uv.x ) ]; }
${input.glsl}
out vec4 outColor;
void main() {
  int i = int( gl_FragCoord.x );
  outColor = vec4( 1.0 - cotVehicleGroundShade( vec2( float( i ) + 0.25, 0.5 ), uPts[ i ], 2.5, 0.0 ), 0.0, 0.0, 1.0 );
}`;
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`compile: ${gl.getShaderInfoLog(shader)}`);
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(program)}`);
  gl.useProgram(program);
  const at = (name) => gl.getUniformLocation(program, name);
  gl.uniform1f(at('uVehGround'), input.hullCount);
  gl.uniform4fv(at('uVehGroundM'), new Float32Array(input.rows));
  gl.uniform4fv(at('uVehGroundB'), new Float32Array(input.solids));
  gl.uniform4fv(at('uVehGroundLight'), new Float32Array(input.light));
  gl.uniform4fv(at('uContactAmb'), new Float32Array(input.amb));
  gl.uniform1f(at('uContactSunLum'), input.sunLum);
  gl.uniform3fv(at('uSunDir'), new Float32Array(input.sunDir));
  gl.uniform3fv(at('uContactFillDir'), new Float32Array(input.fillDir));
  gl.uniform3fv(at('uPts'), new Float32Array(input.points.flat()));
  gl.uniform3fv(at('uNrm'), new Float32Array(input.normals.flat()));
  const target = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, target);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, n, 1, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('float target incomplete');
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.viewport(0, 0, n, 1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const out = new Float32Array(n * 4);
  gl.readPixels(0, 0, n, 1, gl.RGBA, gl.FLOAT, out);
  const values = Array.from({ length: n }, (_, i) => out[i * 4]);
  gl.deleteBuffer(buffer); gl.deleteFramebuffer(framebuffer); gl.deleteTexture(target); gl.deleteProgram(program);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return { values, renderer };
}
