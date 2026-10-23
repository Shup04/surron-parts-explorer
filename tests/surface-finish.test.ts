import { describe, expect, it } from 'vitest';
import { DataTexture, MeshStandardMaterial, Texture } from 'three';
import { applySurfaceFinish, copySurfaceFinish } from '../src/viewer/surface-finish';

function compile(material: MeshStandardMaterial) {
  const shader = {
    uniforms: {},
    vertexShader: 'void main() {\n#include <begin_vertex>\n}',
    fragmentShader:
      'void main() {\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n}',
  } as Parameters<MeshStandardMaterial['onBeforeCompile']>[0];
  material.onBeforeCompile(shader, null!);
  return shader;
}

describe('procedural surface finish', () => {
  it('adds UV-free raw-aluminum scratches and preserves them on inspection clones', () => {
    const metal = new MeshStandardMaterial({ name: 'Raw aluminum', metalness: 1, roughness: 0.58 });
    applySurfaceFinish(metal, 1);
    const shader = compile(metal);
    expect(shader.vertexShader).toContain(
      'vFinishPosition = position * finishScale * uFinishUnitScale',
    );
    expect(shader.uniforms.uFinishUnitScale.value).toBe(1);
    expect(shader.fragmentShader).toContain('finishSample()');
    expect(shader.fragmentShader).toContain('finishNormal(');
    expect(shader.fragmentShader).toContain('finishData.b * uFinishWear');
    expect(shader.uniforms.uFinishTexture.value).toBeInstanceOf(DataTexture);
    const pixels = shader.uniforms.uFinishTexture.value.image.data as Uint8Array;
    expect(pixels.some((value, index) => index % 4 === 2 && value > 0)).toBe(true);
    expect(shader.uniforms.uFinishBump.value).toBeGreaterThan(0);
    expect(shader.uniforms.uFinishTile.value).toBe(32);

    const selected = metal.clone();
    copySurfaceFinish(metal, selected);
    const cloneShader = compile(selected);
    expect(cloneShader.uniforms.uFinishTexture.value).toBe(shader.uniforms.uFinishTexture.value);
    expect(cloneShader.uniforms.uFinishUnitScale.value).toBe(1);
    expect(cloneShader.fragmentShader).toContain('finishSample()');
    expect(selected.customProgramCacheKey()).toBe(metal.customProgramCacheKey());
  });

  it('does not draw generic scratch lines on coated metal', () => {
    const coated = new MeshStandardMaterial({
      name: 'Black Metal',
      metalness: 0.45,
      roughness: 0.36,
    });
    applySurfaceFinish(coated, 1);
    const shader = compile(coated);
    const pixels = shader.uniforms.uFinishTexture.value.image.data as Uint8Array;
    expect(shader.uniforms.uFinishWear.value).toBe(0);
    expect(pixels.every((value, index) => index % 4 !== 2 || value === 0)).toBe(true);
  });

  it('uses different grain for plastic and rubber and leaves authored textures alone', () => {
    const plastic = new MeshStandardMaterial({
      name: 'Black Plastic',
      metalness: 0,
      roughness: 0.55,
    });
    const rubber = new MeshStandardMaterial({ name: 'Seat Vinyl', metalness: 0, roughness: 0.76 });
    applySurfaceFinish(plastic);
    applySurfaceFinish(rubber);
    expect(compile(plastic).uniforms.uFinishTile.value).toBe(48);
    expect(compile(rubber).uniforms.uFinishTexture.value).not.toBe(
      compile(plastic).uniforms.uFinishTexture.value,
    );

    const authored = new MeshStandardMaterial({ map: new Texture() });
    const originalCompiler = authored.onBeforeCompile;
    applySurfaceFinish(authored);
    expect(authored.onBeforeCompile).toBe(originalCompiler);
    authored.map?.dispose();
  });
});
