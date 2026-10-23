import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import bakes from '../data/models/surface-normals.json';
import manifest from '../public/parts/manifest.json';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function readAsset(file: string) {
  const bytes = readFileSync(`public/parts/${file}`);
  const length = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.subarray(20, 20 + length).toString());
  const binary = bytes.subarray(28 + length);
  function accessor(index: number) {
    const item = document.accessors[index] as {
      bufferView: number;
      byteOffset?: number;
      count: number;
      componentType: number;
      type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4';
    };
    const view = document.bufferViews[item.bufferView];
    const size = item.componentType === 5123 ? 2 : 4;
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[item.type];
    const start = (view.byteOffset ?? 0) + (item.byteOffset ?? 0);
    const stride = view.byteStride ?? size * width;
    return {
      count: item.count,
      rowBytes: size * width,
      row: (index: number) =>
        binary.subarray(start + index * stride, start + index * stride + size * width),
      value: (index: number, component = 0) => {
        const offset = start + index * stride + component * size;
        return item.componentType === 5126
          ? binary.readFloatLE(offset)
          : item.componentType === 5123
            ? binary.readUInt16LE(offset)
            : binary.readUInt32LE(offset);
      },
    };
  }
  function image(texture: number) {
    const image = document.images[document.textures[texture].source];
    const view = document.bufferViews[image.bufferView];
    return binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  }
  return { bytes, document, accessor, image };
}

describe('baked surface shading on reduced project parts', () => {
  for (const part of bakes.parts) {
    it(`${part.id} preserves every triangle position, UV and authored transform`, () => {
      const asset = readAsset(part.file);
      const primitive = asset.document.meshes[0].primitives[0];
      const indices = asset.accessor(primitive.indices);
      expect(indices.count / 3).toBe(part.id === 'main-frame' ? 60000 : 30000);
      for (const [name, fingerprint] of Object.entries(part.geometryPerCornerSha256)) {
        const attribute = asset.accessor(primitive.attributes[name]);
        const corners = Buffer.alloc(indices.count * attribute.rowBytes);
        for (let i = 0; i < indices.count; i++)
          attribute.row(indices.value(i)).copy(corners, i * attribute.rowBytes);
        expect(hash(corners), name).toBe(fingerprint);
      }
      expect(asset.document.nodes).toEqual(part.nodes);
      const published = manifest.parts.find((entry) => entry.id === part.id)!;
      expect(hash(asset.bytes)).toBe(published.sha256);
      expect(hash(asset.bytes)).toBe(part.sha256);
      expect(asset.bytes.length).toBe(published.bytes);
    });

    it(`${part.id} corrects the base and clearcoat while retaining the purple flake finish`, () => {
      const asset = readAsset(part.file);
      const material = asset.document.materials[0];
      const coat = material.extensions.KHR_materials_clearcoat;
      const baseNormal = material.normalTexture;
      const coatNormal = coat.clearcoatNormalTexture;
      expect(material.name).toBe('Deep Purple Metallic');
      expect(baseNormal.scale ?? 1).toBe(1);
      expect(coatNormal.scale ?? 1).toBe(1);
      expect(coatNormal.texCoord ?? 0).toBe(baseNormal.texCoord ?? 0);
      // The bake uses unique UVs, not the repeating transform of the original flake bump.
      expect(baseNormal.extensions?.KHR_texture_transform).toBeUndefined();
      expect(coatNormal.extensions?.KHR_texture_transform).toBeUndefined();
      const normal = asset.image(baseNormal.index);
      expect(hash(normal)).toBe(part.normalTextureSha256);
      expect(hash(asset.image(coatNormal.index))).toBe(part.normalTextureSha256);
      expect(normal.readUInt32BE(16)).toBe(part.normalTextureSize);
      expect(normal.readUInt32BE(20)).toBe(part.normalTextureSize);
      const pbr = material.pbrMetallicRoughness;
      expect(pbr.baseColorFactor).toEqual([
        0.05612849071621895, 0.019382361322641373, 0.11443537473678589, 1,
      ]);
      expect(hash(asset.image(pbr.metallicRoughnessTexture.index))).toBe(
        part.metallicRoughnessTextureSha256,
      );
      expect(coat.clearcoatFactor).toBeCloseTo(0.52);
      expect(coat.clearcoatRoughnessFactor).toBeCloseTo(0.19);
    });
  }
});
