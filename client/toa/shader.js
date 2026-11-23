// Fragment shader of the "scene-toa" program, which draws the sand and light
// of the Tombs of Amascut scenery. It pairs with the renderer's scene-effects
// vertex shader. A mesh picks its look with uniforms.u_animParams = [mode, a, b, c]:
//
//   11 sand   a, b = position of the light on the ground, c = how far it reaches (tiles)
//             vertex alpha = how much sand lies there; the edge dissolves into grains
//   12 veil   a sheet of light in a doorway; a = 1 for an open way, 0 for a locked one
//   13 fall   sand pouring off an edge
//   14 shaft  a beam of light
//
// Veil, fall and shaft are standing sheets: the vertex alpha sets how strong
// each end is, and normal.x runs from -1 to 1 across the sheet (toaMesh, below).
//
// Modes start at 11 because the vertex shader animates modes 1 to 10 itself.
export const toaShaderModes = { sand: 11, veil: 12, fall: 13, shaft: 14 };

// How every scenery fragment shader starts: its inputs and value noise.
export const fragmentShaderHead = `#version 300 es
precision highp float;
in vec3 v_worldPos;
in vec3 v_normal;
in vec4 v_color;
uniform float u_currentTick;
uniform vec4 u_animParams;
uniform float u_brightness;
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y);
}
float fbm(vec2 p) {
  float sum = 0.0;
  float weight = 0.5;
  for (int octave = 0; octave < 4; octave++) {
    sum += weight * noise(p);
    p = p * 2.03 + 19.7;
    weight *= 0.5;
  }
  return sum / 0.9375;
}
`;

export const toaFragmentShader = fragmentShaderHead + `
void main() {
  float mode = u_animParams.x;
  float seconds = u_currentTick * 0.6;
  // Sampling in blocks of 1/16 tile keeps the effects as coarse as the
  // game's own models and textures.
  vec3 cell = (floor(v_worldPos * 16.0) + 0.5) / 16.0;
  vec3 colour = v_color.rgb;
  float alpha = v_color.a;

  if (mode < 11.5) {
    float grain = fbm(cell.xy * 1.7);
    alpha = smoothstep(grain * 0.85, grain * 0.85 + 0.1, v_color.a * 1.3);
    float dune = fbm(vec2(cell.x * 0.8 + seconds * 0.02, cell.y * 2.4));
    colour *= 0.8 + 0.4 * dune;
    float reach = 1.0 - clamp(distance(cell.xy, u_animParams.yz) / u_animParams.w, 0.0, 1.0);
    float flicker = 0.88 + 0.12 * noise(vec2(seconds * 6.0, 1.5));
    colour *= 0.3 + 1.25 * reach * reach * flicker;
    vec2 speck = floor(v_worldPos.xy * 32.0);
    float glint = step(0.993, hash(speck)) * max(0.0, sin(seconds * 2.2 + hash(speck + 7.0) * 40.0));
    colour += glint * 0.3 * (0.3 + reach);
  } else if (mode < 12.5) {
    float open = u_animParams.y;
    float across = abs(v_normal.x);
    float along = cell.x * 1.3 + cell.y * 1.7;
    float rise = fbm(vec2(along * 2.4, cell.z * 1.5 - seconds * mix(0.06, 0.5, open)));
    float strands = smoothstep(0.4, 0.7, rise);
    float glyph = step(0.6, hash(floor(vec2(along * 5.0, cell.z * 4.0 - seconds * 0.35 * open))));
    float sides = 1.0 - smoothstep(0.6, 1.0, across);
    alpha = v_color.a * sides * (0.3 + 0.5 * strands + 0.2 * glyph * strands) * mix(0.55, 1.0, open);
    colour = mix(colour, vec3(1.0, 0.96, 0.78), 0.65 * strands);
    colour = mix(vec3(dot(colour, vec3(0.3, 0.5, 0.2))) * 0.7, colour, open);
  } else if (mode < 13.5) {
    float along = cell.x * 1.3 + cell.y * 1.7;
    float pour = fbm(vec2(along * 5.0, cell.z * 0.45 + seconds * 1.1));
    alpha = v_color.a * smoothstep(0.42, 0.62, pour);
    colour *= 0.55 + 0.6 * pour;
  } else {
    float core = 1.0 - clamp(abs(v_normal.x), 0.0, 1.0);
    float drift = fbm(vec2(cell.x * 1.3 + cell.y * 1.7, cell.z * 0.45 - seconds * 0.3));
    alpha = v_color.a * core * (0.5 + 0.5 * drift);
    colour = mix(colour, vec3(1.0, 0.97, 0.85), 0.5 * core);
  }

  colour *= u_brightness / 0.6;
  fragColor = vec4(colour, alpha);
}`;

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

// Collects one mesh for the "scene-toa" program, or for another program that
// pairs a fragment shader with the same vertex shader.
// A sheet's normals carry its own coordinates: x from -1 to 1 across, y from
// 0 at the bottom to 1 at the top.
export function toaMesh(meshId, zIndex, depth, animParams, modelMatrix = identity, shaderId = "scene-toa") {
  const positions = [], normals = [], colors = [], alphas = [], indices = [];
  const vertex = (x, y, z, color, alpha, across = 0, up = 0) => {
    positions.push(x, y, z);
    normals.push(across, up, 1);
    colors.push(color);
    alphas.push(alpha);
    return alphas.length - 1;
  };
  const quad = (a, b, c, d) => indices.push(a, b, c, a, c, d);
  return {
    vertex,
    quad,
    // A standing sheet between two ground points, from z to z + height.
    // `taper` narrows the top: 1 keeps it as wide as the bottom.
    sheet([x1, y1], [x2, y2], z, height, color, bottomAlpha, topAlpha, taper = 1) {
      const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
      const topX = (x2 - x1) / 2 * taper, topY = (y2 - y1) / 2 * taper;
      quad(
        vertex(x1, y1, z, color, bottomAlpha, -1, 0),
        vertex(x2, y2, z, color, bottomAlpha, 1, 0),
        vertex(midX + topX, midY + topY, z + height, color, topAlpha, 1, 1),
        vertex(midX - topX, midY - topY, z + height, color, topAlpha, -1, 1),
      );
    },
    command: () => ({
      kind: "mesh3d",
      meshId,
      materialId: "osrs-terrain",
      modelMatrix,
      cullFace: "none",
      zIndex,
      depth,
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      perVertexHslColors: new Float32Array(colors),
      perVertexAlphas: new Float32Array(alphas),
      indices: new Uint16Array(indices),
      blend: "normal",
      shaderId,
      uniforms: { u_animParams: animParams },
    }),
  };
}
