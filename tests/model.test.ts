import { describe, expect, it } from 'vitest';
import { inspectGltfDocument, parseGltfBytes } from '../src/core/model-validation';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectModelFile } from '../scripts/model-tools';
const document = {
  asset: { version: '2.0' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ name: 'shaft', mesh: 0, extras: { objectId: 'shaft-object' } }],
  meshes: [{ primitives: [{ attributes: {} }] }],
};
const bytes = (text: string) => new TextEncoder().encode(text);

describe('model import validation', () => {
  it('parses glTF and preserves object identifiers and original positions', () => {
    const inspection = inspectGltfDocument(parseGltfBytes(bytes(JSON.stringify(document))));
    expect(inspection.issues).toEqual([]);
    expect(inspection.objects[0].key).toBe('$');
    expect(inspection.objects[1].key).toBe('id:shaft-object');
    expect(inspection.objects[1].position).toEqual([0, 0, 0]);
  });
  it('parses the JSON chunk of a GLB', () => {
    const json = JSON.stringify(document);
    const padded = json.padEnd(Math.ceil(json.length / 4) * 4, ' ');
    const data = new Uint8Array(20 + padded.length);
    const view = new DataView(data.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, data.length, true);
    view.setUint32(12, padded.length, true);
    view.setUint32(16, 0x4e4f534a, true);
    data.set(bytes(padded), 20);
    expect(parseGltfBytes(data)).toEqual(document);
    view.setUint32(8, data.length + 4, true);
    expect(() => parseGltfBytes(data)).toThrow('length');
  });
  it('reports absent mesh resources and malformed model metadata', () => {
    expect(inspectGltfDocument({ ...document, meshes: [] }).issues[0].message).toContain(
      'Missing mesh',
    );
    expect(inspectGltfDocument({ asset: { version: '1.0' } }).issues.length).toBeGreaterThan(0);
    expect(() => parseGltfBytes(bytes('not a model'))).toThrow();
  });
  it('detects duplicate identifiers and cyclic scenes', () => {
    const duplicate = structuredClone(document);
    duplicate.nodes.push(duplicate.nodes[0]);
    expect(
      inspectGltfDocument(duplicate).issues.some((issue) =>
        issue.message.includes('Duplicate persistent'),
      ),
    ).toBe(true);
    const cycle = {
      ...document,
      nodes: [
        { name: 'first', children: [1] },
        { name: 'second', children: [0] },
      ],
    };
    expect(
      inspectGltfDocument(cycle).issues.some((issue) => issue.message.includes('Cyclic')),
    ).toBe(true);
  });
  it('reports relative resources and source scales without rewriting them', () => {
    const model = {
      ...document,
      nodes: [{ ...document.nodes[0], scale: [0.001, 0.001, 0.001], translation: [1, 2, 3] }],
      buffers: [{ uri: 'model.bin', byteLength: 12 }],
    };
    const inspection = inspectGltfDocument(model);
    expect(inspection.resources).toEqual(['model.bin']);
    expect(inspection.objects[1].position).toEqual([1, 2, 3]);
    expect(inspection.warnings.some((warning) => warning.includes('scale'))).toBe(true);
    expect(model.nodes[0].scale).toEqual([0.001, 0.001, 0.001]);
  });
  it('reports missing model files and missing local dependencies', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'model-validation-'));
    try {
      const file = join(directory, 'missing.gltf');
      await expect(inspectModelFile(file)).rejects.toThrow('ENOENT');
      writeFileSync(
        file,
        JSON.stringify({ ...document, buffers: [{ uri: 'absent.bin', byteLength: 12 }] }),
      );
      const resource = await inspectModelFile(file);
      expect(resource.issues).toContainEqual({
        path: 'resources',
        message: 'Missing local asset: absent.bin',
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('validates matrix scale and malformed rotations without changing source transforms', () => {
    const matrix = [0.001, 0, 0, 0, 0, 0.001, 0, 0, 0, 0, 0.001, 0, 0, 0, 0, 1];
    const inspection = inspectGltfDocument({
      ...document,
      nodes: [{ ...document.nodes[0], matrix }],
    });
    expect(inspection.warnings.some((warning) => warning.includes('matrix scale'))).toBe(true);
    expect(matrix[0]).toBe(0.001);
    expect(
      inspectGltfDocument({
        ...document,
        nodes: [{ ...document.nodes[0], rotation: [0, 0, 0, 0] }],
      }).issues.some((issue) => issue.message.includes('unit quaternion')),
    ).toBe(true);
  });
});
