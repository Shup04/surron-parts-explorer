import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
} from 'three';

type SurfaceShader = Parameters<MeshStandardMaterial['onBeforeCompile']>[0];
type FinishKind = 'metal' | 'plastic' | 'rubber';
interface FinishState {
  kind: FinishKind;
  millimetersPerUnit: number;
}

const finishes = new WeakMap<MeshStandardMaterial, FinishState>();
const textures = new Map<FinishKind, DataTexture>();
const textureSize = 256;

const settings: Record<
  FinishKind,
  { tile: number; bump: number; roughness: number; wear: number; grainColor: number }
> = {
  metal: { tile: 32, bump: 0.025, roughness: 0.1, wear: 0.06, grainColor: 0.025 },
  plastic: { tile: 48, bump: 0.02, roughness: 0.06, wear: 0, grainColor: 0.03 },
  rubber: { tile: 48, bump: 0.03, roughness: 0.05, wear: 0, grainColor: 0.025 },
};

function random(x: number, y: number, seed: number): number {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function finishTexture(kind: FinishKind): DataTexture {
  const existing = textures.get(kind);
  if (existing) return existing;
  const height = new Float32Array(textureSize * textureSize);
  const roughness = new Float32Array(textureSize * textureSize);
  const scratches = new Float32Array(textureSize * textureSize);
  for (let y = 0; y < textureSize; y++) {
    for (let x = 0; x < textureSize; x++) {
      const index = y * textureSize + x;
      const fine = random(x, y, 17) - 0.5;
      const broad =
        Math.sin((x / textureSize) * Math.PI * 12) * Math.sin((y / textureSize) * Math.PI * 14);
      const grain = kind === 'metal' ? 0.16 : kind === 'plastic' ? 0.34 : 0.26;
      height[index] = 0.5 + fine * grain + broad * (kind === 'metal' ? 0.025 : 0.08);
      roughness[index] = 0.5 + fine * 0.65 + broad * 0.12;
    }
  }
  if (kind === 'metal') {
    // Short, uneven tool marks; the texture repeats seamlessly around each part.
    for (let line = 0; line < 65; line++) {
      const y = Math.floor(random(line, 1, 101) * textureSize);
      const start = Math.floor(random(line, 2, 101) * textureSize);
      const length = 8 + Math.floor(random(line, 3, 101) * 95);
      const depth = 0.03 + random(line, 4, 101) * 0.08;
      for (let step = 0; step < length; step++) {
        const x = (start + step) % textureSize;
        const fade = Math.min(1, step / 8, (length - step) / 8);
        for (let offset = -1; offset <= 1; offset++) {
          const row = (y + offset + textureSize) % textureSize;
          const index = row * textureSize + x;
          const weight = offset === 0 ? 1 : 0.25;
          height[index] -= depth * fade * weight;
          roughness[index] += depth * fade * weight;
          scratches[index] = Math.max(scratches[index], fade * (0.4 + depth * 2) * weight);
        }
      }
    }
  }
  const pixels = new Uint8Array(textureSize * textureSize * 4);
  for (let index = 0; index < height.length; index++) {
    pixels[index * 4] = Math.round(Math.max(0, Math.min(1, height[index])) * 255);
    pixels[index * 4 + 1] = Math.round(Math.max(0, Math.min(1, roughness[index])) * 255);
    pixels[index * 4 + 2] = Math.round(Math.min(1, scratches[index]) * 255);
    pixels[index * 4 + 3] = 255;
  }
  const texture = new DataTexture(pixels, textureSize, textureSize, RGBAFormat, UnsignedByteType);
  texture.name = `Procedural ${kind} surface finish`;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  textures.set(kind, texture);
  return texture;
}

const fragmentFunctions = /* glsl */ `
varying vec3 vFinishPosition;
varying vec3 vFinishNormal;
uniform sampler2D uFinishTexture;
uniform float uFinishTile;
uniform float uFinishBump;
uniform float uFinishRoughness;
uniform float uFinishWear;
uniform float uFinishGrainColor;

vec3 finishSample() {
  vec3 weights = abs(normalize(vFinishNormal));
  weights *= weights;
  weights *= weights;
  weights += vec3(0.0001);
  weights /= weights.x + weights.y + weights.z;
  return texture2D(uFinishTexture, vFinishPosition.yz / uFinishTile).rgb * weights.x
       + texture2D(uFinishTexture, vFinishPosition.zx / uFinishTile).rgb * weights.y
       + texture2D(uFinishTexture, vFinishPosition.xy / uFinishTile).rgb * weights.z;
}

vec3 finishNormal(vec3 surface, vec3 normal, vec2 heightGradient, float faceDirection) {
  vec3 dx = normalize(dFdx(surface));
  vec3 dy = normalize(dFdy(surface));
  vec3 crossX = cross(dy, normal);
  vec3 crossY = cross(normal, dx);
  float determinant = dot(dx, crossX) * faceDirection;
  vec3 gradient = sign(determinant) * (heightGradient.x * crossX + heightGradient.y * crossY);
  return normalize(abs(determinant) * normal - gradient);
}
`;

function addFinish(shader: SurfaceShader, { kind, millimetersPerUnit }: FinishState): void {
  const { tile, bump, roughness, wear, grainColor } = settings[kind];
  shader.uniforms.uFinishTexture = { value: finishTexture(kind) };
  shader.uniforms.uFinishTile = { value: tile };
  shader.uniforms.uFinishBump = { value: bump };
  shader.uniforms.uFinishRoughness = { value: roughness };
  shader.uniforms.uFinishWear = { value: wear };
  shader.uniforms.uFinishGrainColor = { value: grainColor };
  shader.uniforms.uFinishUnitScale = { value: millimetersPerUnit };
  shader.vertexShader = shader.vertexShader
    .replace(
      'void main() {',
      'varying vec3 vFinishPosition;\nvarying vec3 vFinishNormal;\nuniform float uFinishUnitScale;\nvoid main() {',
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vec3 finishScale = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
       vFinishPosition = position * finishScale * uFinishUnitScale;
       vFinishNormal = normal;`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', `${fragmentFunctions}\nvoid main() {`)
    .replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       vec3 finishData = finishSample();
       diffuseColor.rgb *= 1.0 + (finishData.r - 0.5) * uFinishGrainColor;
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.7), finishData.b * uFinishWear);`,
    )
    .replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
       float finishHeight = finishData.r - 0.5;
       roughnessFactor = clamp(roughnessFactor + (finishData.g - 0.5) * uFinishRoughness, 0.04, 1.0);`,
    )
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
       normal = finishNormal(-vViewPosition, normal, vec2(dFdx(finishHeight), dFdy(finishHeight)) * uFinishBump, faceDirection);`,
    );
}

/** Shared triplanar detail follows each mesh and needs no UVs or additional geometry. */
export function applySurfaceFinish(
  material: MeshStandardMaterial,
  millimetersPerUnit = 1000,
  kind?: FinishKind,
): void {
  if (
    finishes.has(material) ||
    material.map ||
    material.normalMap ||
    material.bumpMap ||
    material.roughnessMap ||
    material.metalnessMap
  )
    return;
  kind ??=
    material.metalness >= 0.4
      ? 'metal'
      : material.roughness >= 0.7 || /rubber|vinyl|tire/i.test(material.name)
        ? 'rubber'
        : 'plastic';
  const finish = { kind, millimetersPerUnit };
  finishes.set(material, finish);
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    addFinish(shader, finish);
  };
  material.customProgramCacheKey = () => `surface-finish-v3:${previousKey()}`;
}

/** Material.clone() omits onBeforeCompile, so inspection variants inherit the finish explicitly. */
export function copySurfaceFinish(
  source: MeshStandardMaterial,
  target: MeshStandardMaterial,
): void {
  const finish = finishes.get(source);
  if (finish) applySurfaceFinish(target, finish.millimetersPerUnit, finish.kind);
}
