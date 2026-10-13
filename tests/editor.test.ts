import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene } from 'three';
import { demoCatalog } from '../src/data/catalog';
import {
  assignMappings,
  inspectScene,
  proposeMappings,
  sceneWarnings,
} from '../src/editor/model-tools';
import { materializeModel, parseEditorProject } from '../src/editor/storage';
import type { MappingConfig, SceneObjectInfo } from '../src/core/types';

const mapping: MappingConfig = {
  version: 1,
  assetId: 'test-model',
  units: 'm',
  upAxis: 'Y',
  mappings: [],
};
const sceneObject = (key: string, name: string): SceneObjectInfo => ({
  key,
  name,
  parentKey: '$',
  mesh: true,
  position: [0, 0, 0],
});
afterEach(() => vi.restoreAllMocks());

describe('editor identity and mapping operations', () => {
  it('keeps object keys stable when the import root is attached to a runtime scene', () => {
    const root = new Group();
    const part = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    part.name = 'shaft';
    root.add(part);
    const before = inspectScene(root);
    new Scene().add(root);
    expect(inspectScene(root)).toEqual(before);
    part.geometry.dispose();
    (part.material as MeshBasicMaterial).dispose();
  });

  it('replaces ambiguous mappings while preserving the configured explosion and other entries', () => {
    const explosion = {
      direction: [0, 0, 1] as [number, number, number],
      distance: 0.2,
      verification: 'unknown' as const,
    };
    const input = {
      ...mapping,
      mappings: [
        { objectKey: 'a', partId: 'shaft' },
        { objectKey: 'a', partId: 'bearing-left', explosion },
        { objectKey: 'b', partId: 'shaft' },
      ],
    };
    const assigned = assignMappings(input, ['a', 'c'], 'spacer-left');
    expect(assigned.mappings).toEqual([
      { objectKey: 'b', partId: 'shaft' },
      { objectKey: 'a', partId: 'spacer-left', explosion },
      { objectKey: 'c', partId: 'spacer-left' },
    ]);
    expect(input.mappings).toHaveLength(3);
  });

  it('proposes exact and normalized matches without modifying mappings or accepting uncertainty', () => {
    const catalogPart = demoCatalog.parts.find((part) => part.id === 'bearing-left')!;
    const proposals = proposeMappings(
      [
        sceneObject('a', 'bearing-left'),
        sceneObject('b', catalogPart.name.toUpperCase()),
        sceneObject('c', 'part__shaft'),
      ],
      demoCatalog,
      mapping,
    );
    expect(proposals).toContainEqual({
      objectKey: 'a',
      partId: 'bearing-left',
      confidence: 'exact',
    });
    expect(proposals).toContainEqual({
      objectKey: 'b',
      partId: 'bearing-left',
      confidence: 'suggestion',
    });
    expect(proposals).toContainEqual({ objectKey: 'c', partId: 'shaft', confidence: 'exact' });
    expect(mapping.mappings).toEqual([]);
  });

  it('reports duplicate mesh names and suspicious scale without changing geometry', () => {
    const root = new Group();
    const a = new Mesh(new BoxGeometry(200, 200, 200));
    a.name = 'same';
    const b = new Mesh(new BoxGeometry());
    b.name = 'same';
    root.add(a, b);
    const warnings = sceneWarnings(root).join(' ');
    expect(warnings).toContain('Duplicate mesh name');
    expect(warnings).toContain('200.00 m');
    expect(a.scale.toArray()).toEqual([1, 1, 1]);
    a.geometry.dispose();
    b.geometry.dispose();
  });
});

describe('portable project validation', () => {
  it('round trips catalog and mapping with explicit unknown source data', () => {
    const project = { version: 1, catalog: demoCatalog, mapping, assetFileName: 'motorcycle.glb' };
    expect(parseEditorProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
  });

  it('rejects unsupported versions, ambiguous mappings, and unknown catalog parts', () => {
    const project = { version: 1, catalog: demoCatalog, mapping, assetFileName: null };
    expect(() => parseEditorProject({ ...project, version: 2 })).toThrow('version');
    expect(() =>
      parseEditorProject({
        ...project,
        mapping: {
          ...mapping,
          mappings: [
            { objectKey: 'a', partId: 'shaft' },
            { objectKey: 'a', partId: 'shaft' },
          ],
        },
      }),
    ).toThrow('Ambiguous');
    expect(() =>
      parseEditorProject({
        ...project,
        mapping: { ...mapping, mappings: [{ objectKey: 'a', partId: 'invented' }] },
      }),
    ).toThrow('Unknown catalog part');
  });
});

describe('local glTF companion import', () => {
  it('rewrites companion URIs while preserving source transforms', async () => {
    const blobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return `blob:test-${blobs.length}`;
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const source = {
      asset: { version: '2.0' },
      buffers: [{ uri: 'geometry.bin', byteLength: 4 }],
      images: [{ uri: 'textures/metal.png' }, { uri: 'data:image/png;base64,abc' }],
      nodes: [{ name: 'shaft', translation: [0.12, 0, 0], scale: [1, 1, 1] }],
    };
    const result = await materializeModel(
      [
        { name: 'model.gltf', path: 'bike/model.gltf', blob: new Blob([JSON.stringify(source)]) },
        { name: 'geometry.bin', path: 'bike/geometry.bin', blob: new Blob([new Uint8Array(4)]) },
        { name: 'metal.png', path: 'bike/textures/metal.png', blob: new Blob(['texture']) },
      ],
      'bike/model.gltf',
    );
    const rewritten = JSON.parse(await blobs.at(-1)!.text());
    expect(rewritten.buffers[0].uri).toBe('blob:test-1');
    expect(rewritten.images[0].uri).toBe('blob:test-2');
    expect(rewritten.images[1]).toEqual(source.images[1]);
    expect(rewritten.nodes).toEqual(source.nodes);
    expect(result.url).toBe('blob:test-3');
    result.dispose();
    expect(revoke).toHaveBeenCalledTimes(3);
  });

  it('rejects missing companions and external fetches with actionable errors', async () => {
    const file = (uri: string) => [
      {
        name: 'model.gltf',
        path: 'model.gltf',
        blob: new Blob([JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri }] })]),
      },
    ];
    await expect(materializeModel(file('missing.bin'), 'model.gltf')).rejects.toThrow(
      'Missing companion file',
    );
    await expect(
      materializeModel(file('https://example.com/private.bin'), 'model.gltf'),
    ).rejects.toThrow('local companion file');
    await expect(materializeModel([], 'missing.glb')).rejects.toThrow('missing');
  });

  it('rejects ambiguous companion basenames instead of binding the wrong texture', async () => {
    const files = [
      {
        name: 'model.gltf',
        path: 'model.gltf',
        blob: new Blob([
          JSON.stringify({ asset: { version: '2.0' }, images: [{ uri: 'textures/metal.png' }] }),
        ]),
      },
      { name: 'metal.png', path: 'a/metal.png', blob: new Blob(['a']) },
      { name: 'metal.png', path: 'b/metal.png', blob: new Blob(['b']) },
    ];
    await expect(materializeModel(files, 'model.gltf')).rejects.toThrow('Ambiguous companion file');
  });
});
