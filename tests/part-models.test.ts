import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { oemCatalog, oemDatabase } from '../src/data/oem';
import { buildCuratedNavigation, navigationForOccurrence } from '../src/navigation/model';
import { assignPartModel } from '../src/editor/part-project';
import {
  materializeProjectFiles,
  parseEditorProject,
  type EditorProject,
} from '../src/editor/storage';
import { inspectScene } from '../src/editor/model-tools';
import { validateCatalog, buildCatalogIndex } from '../src/core/catalog';
import { validateMapping } from '../src/core/mapping';
import { partModelKey, wrapPartModel } from '../src/viewer/part-models';
import { disposeScene, mappedPartId, prepareScene, updateVisibility } from '../src/viewer/scene';

const navigation = buildCuratedNavigation(oemDatabase, oemCatalog);
const seat = navigation.byId.get('nav.body.seat')!;
const fender = navigation.byId.get('nav.body.front-fender')!;
const blank: EditorProject = {
  version: 1,
  catalog: oemCatalog,
  assetFileName: null,
  mapping: { version: 1, assetId: 'demonstration', units: 'm', upAxis: 'Y', mappings: [] },
};
afterEach(() => vi.restoreAllMocks());

describe('separate part models', () => {
  it('adds and replaces one part while retaining other models and original catalog records', () => {
    const a = assignPartModel(blank, seat, 'seat.glb', 'Seat.glb');
    const b = assignPartModel(a, fender, 'fender.glb', 'Fender.glb');
    const replaced = assignPartModel(b, seat, 'new-seat.glb', 'Seat revision.glb');
    expect(replaced.partModels).toHaveLength(2);
    expect(replaced.partModels!.find((model) => model.id === seat.id)?.fileName).toBe(
      'new-seat.glb',
    );
    expect(replaced.partModels!.find((model) => model.id === fender.id)).toEqual(b.partModels![1]);
    expect(replaced.mapping.mappings).toHaveLength(2);
    expect(replaced.catalog.parts.filter((part) => !part.id.startsWith('model-'))).toEqual(
      oemCatalog.parts,
    );
    expect(validateCatalog(replaced.catalog).success).toBe(true);
    expect(parseEditorProject(JSON.parse(JSON.stringify(replaced)))).toEqual(replaced);
    const model = buildCuratedNavigation(oemDatabase, replaced.catalog);
    expect(model.byId.get(seat.id)?.modelPartIds).toEqual(['model-nav.body.seat']);
    expect(model.byId.get('body')?.modelPartIds).toContain('model-nav.body.seat');
    expect(navigationForOccurrence(model, 'model-nav.body.seat')?.id).toBe(seat.id);
    expect(model.byId.get(seat.id)?.installedOccurrenceIds).toEqual([]);
  });

  it('maps the entire imported group and namespaces duplicate identifiers across files', () => {
    const project = assignPartModel(
      assignPartModel(blank, seat, 'seat.glb', 'seat.glb'),
      fender,
      'fender.glb',
      'fender.glb',
    );
    const scene = new Group();
    const meshes = [seat, fender].map((node) => {
      const source = new Group();
      const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
      mesh.userData.objectId = 'same-source-id';
      mesh.position.set(1, 2, 3);
      mesh.scale.set(0.5, 0.6, 0.7);
      source.add(mesh);
      scene.add(wrapPartModel(source, node.id));
      return mesh;
    });
    expect(validateMapping(project.mapping, project.catalog, inspectScene(scene)).success).toBe(
      true,
    );
    prepareScene(scene, project.mapping);
    expect(mappedPartId(meshes[0])).toBe('model-nav.body.seat');
    expect(mappedPartId(meshes[1])).toBe('model-nav.body.front-fender');
    expect(meshes[0].position.toArray()).toEqual([1, 2, 3]);
    expect(meshes[0].scale.toArray()).toEqual([0.5, 0.6, 0.7]);
    expect(
      updateVisibility(scene, buildCatalogIndex(project.catalog), 'body', [], null, [
        'model-nav.body.seat',
      ]),
    ).toBe(1);
    expect(meshes[1].layers.mask).toBe(0);
    expect(project.mapping.mappings[0].objectKey).toBe(partModelKey(seat.id));
    disposeScene(scene);
  });

  it('materializes all files and releases their URLs together', async () => {
    const project = assignPartModel(
      assignPartModel(blank, seat, 'seat.glb', 'same.glb'),
      fender,
      'fender.glb',
      'same.glb',
    );
    let ordinal = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:model-${++ordinal}`);
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const files = ['seat.glb', 'fender.glb'].map((name) => new File(['glb'], name));
    const asset = await materializeProjectFiles(files, project);
    expect(asset.models?.map((model) => model.id)).toEqual([seat.id, fender.id]);
    asset.dispose();
    expect(revoked).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed manifests and cleans up when a companion model is missing', async () => {
    const project = assignPartModel(
      assignPartModel(blank, seat, 'seat.glb', 'seat.glb'),
      fender,
      'fender.glb',
      'fender.glb',
    );
    expect(() =>
      parseEditorProject({
        ...project,
        partModels: [project.partModels![0], project.partModels![0]],
      }),
    ).toThrow('Duplicate');
    expect(() =>
      parseEditorProject({
        ...project,
        partModels: [{ ...project.partModels![0], partId: 'missing' }],
      }),
    ).toThrow('unknown');
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    await expect(materializeProjectFiles([new File(['glb'], 'seat.glb')], project)).rejects.toThrow(
      'missing',
    );
    expect(revoked).toHaveBeenCalledTimes(1);
  });
});
