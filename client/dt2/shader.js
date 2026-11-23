// Fragment shader of the "scene-dt2" program, which draws the elements and the light of the Desert Treasure II gateway. Like "scene-toa"
// it pairs with the renderer's scene-effects vertex shader, and a mesh picks
// its look with uniforms.u_animParams = [mode, a, b, c]:
//
//   15 stream  an element running along the floor. a = length, b = half width (tiles)
//   16 ring    the rune ring around the door. a = radius (tiles), b = how awake the
//              inner ring is, 0 to 1; below 0 it wakes and sleeps by itself
//   17 shaft   a beam of light
//
// Stream and shaft are sheets: normal.x runs from -1 to 1 across,
// normal.y from 0 to 1 along (toaMesh). The ring is a square with both from -1 to 1.
//
// Modes start at 15: the vertex shader animates 1 to 10, "scene-toa" has 11 to 14.
import { fragmentShaderHead, toaMesh } from "../toa/shader.js";

export const dt2ShaderModes = { stream: 15, ring: 16, shaft: 17 };

export const dt2FragmentShader = fragmentShaderHead + `
const vec3 BLOOD = vec3(0.78, 0.07, 0.07);
const vec3 ICE = vec3(0.50, 0.85, 1.0);
const vec3 SHADOW = vec3(0.47, 0.23, 0.80);
const vec3 SMOKE = vec3(0.66, 0.64, 0.60);
const vec3 AWAKENED = vec3(0.80, 0.66, 1.0);

// The element of a quarter turn: 0 blood, 1 ice, 2 shadow, 3 smoke.
vec3 element(float quarter) {
  return quarter < 0.5 ? BLOOD : quarter < 1.5 ? ICE : quarter < 2.5 ? SHADOW : SMOKE;
}

void main() {
  float mode = u_animParams.x;
  float seconds = u_currentTick * 0.6;
  // Sampling in blocks of 1/16 tile keeps the effects as coarse as the
  // game's own models and textures.
  vec3 cell = (floor(v_worldPos * 16.0) + 0.5) / 16.0;
  vec3 colour = v_color.rgb;
  float alpha = v_color.a;

  if (mode < 15.5) {
    vec2 sheet = (floor(vec2(v_normal.x * u_animParams.z, v_normal.y * u_animParams.y) * 16.0) + 0.5) / 16.0;
    float across = abs(sheet.x) / u_animParams.z;
    float flow = fbm(vec2(sheet.x * 3.0, sheet.y * 1.4 - seconds * 1.1));
    float body = 1.0 - smoothstep(0.35, 1.0, across + (flow - 0.5) * 0.8);
    float pulse = 0.6 + 0.4 * sin(sheet.y * 2.4 - seconds * 2.6);
    alpha = v_color.a * body * (0.45 + 0.55 * flow) * pulse;
    colour = mix(colour, vec3(1.0), 0.45 * body * flow * pulse);
  } else if (mode < 16.5) {
    float size = u_animParams.y;
    vec2 p = (floor(v_normal.xy * size * 16.0) + 0.5) / (size * 16.0);
    float r = length(p);
    float turn = seconds * 0.11;
    float around = fract((atan(p.y, p.x) + turn) / 6.2832);
    // The outer ring: two thin rims with runes between them, a quarter for each element.
    float rims = (1.0 - smoothstep(0.0, 0.035, abs(r - 0.95))) + (1.0 - smoothstep(0.0, 0.03, abs(r - 0.72)));
    float band = step(0.76, r) * step(r, 0.91);
    vec2 mark = vec2(floor(around * 28.0), floor((r - 0.76) * 20.0));
    float rune = band * step(0.42, hash(mark)) * step(0.12, fract(around * 28.0));
    vec3 ringColour = element(floor(around * 4.0));
    float outer = clamp(rims * 0.9 + rune * (0.55 + 0.35 * sin(seconds * 1.7 + mark.x)), 0.0, 1.0);
    // The inner ring turns the other way and ignites when the gate is awake.
    float awake = u_animParams.z < 0.0 ? smoothstep(0.35, 0.8, sin(seconds * 0.22)) : u_animParams.z;
    float back = fract((atan(p.y, p.x) - turn * 2.3) / 6.2832);
    float innerBand = step(0.4, r) * step(r, 0.56);
    float innerRune = innerBand * step(0.5, hash(vec2(floor(back * 16.0), 3.0))) * step(0.18, fract(back * 16.0));
    float innerRims = (1.0 - smoothstep(0.0, 0.03, abs(r - 0.58))) + (1.0 - smoothstep(0.0, 0.03, abs(r - 0.38)));
    float flame = fbm(vec2(back * 22.0, r * 6.0 - seconds * 1.4));
    float inner = clamp(innerRune + innerRims, 0.0, 1.0);
    float halo = awake * (1.0 - smoothstep(0.0, 0.6, abs(r - 0.48))) * (0.25 + 0.3 * flame);
    colour = mix(ringColour, vec3(1.0), 0.25 * rune);
    alpha = outer * 0.9;
    float innerAlpha = clamp(inner * mix(0.22, 1.0, awake) * (0.7 + 0.3 * flame) + halo, 0.0, 1.0);
    colour = mix(colour, mix(vec3(0.3, 0.28, 0.34), AWAKENED, awake), innerAlpha / max(innerAlpha + alpha, 0.001));
    alpha = max(alpha, innerAlpha) * v_color.a;
  } else {
    float core = 1.0 - clamp(abs(v_normal.x), 0.0, 1.0);
    float drift = fbm(vec2(cell.x * 1.3 + cell.y * 1.7, cell.z * 0.45 - seconds * 0.3));
    alpha = v_color.a * core * (0.5 + 0.5 * drift);
    colour = mix(colour, vec3(1.0), 0.35 * core);
  }

  colour *= u_brightness / 0.6;
  fragColor = vec4(colour, alpha);
}`;

// Collects one mesh for the "scene-dt2" program (see toaMesh).
export const dt2Mesh = (meshId, zIndex, depth, animParams, modelMatrix) =>
  toaMesh(meshId, zIndex, depth, animParams, modelMatrix, "scene-dt2");
