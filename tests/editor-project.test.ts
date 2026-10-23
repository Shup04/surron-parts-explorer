import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectParts, projectPartsAsset, projectPartsMapping } from '../src/config/project-parts';
import { oemCatalog, oemDatabase } from '../src/data/oem';
import { createProjectWorkspace } from '../src/editor/project-workspace';
import { assignPartModel, partModelTarget } from '../src/editor/part-project';
import { materializeProjectFiles, parseEditorProject } from '../src/editor/storage';
import { buildCuratedNavigation } from '../src/navigation/model';

afterEach(() => vi.restoreAllMocks());

describe('editing the current project assembly', () => {
  it('loads the explorer assets and mappings without needing browser-local files', async () => {
    const project = createProjectWorkspace(oemCatalog);
    const createURL = vi.spyOn(URL, 'createObjectURL');
    const asset = await materializeProjectFiles([], project);
    expect(asset.models).toEqual(projectPartsAsset.models);
    expect(project.mapping).toEqual(projectPartsMapping);
    expect(project.partModels).toHaveLength(projectParts.length);
    expect(parseEditorProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
    expect(createURL).not.toHaveBeenCalled();
    asset.dispose();
    project.mapping.mappings.pop();
    project.catalog.parts[0].name = 'Editor change';
    expect(projectPartsMapping.mappings).toHaveLength(projectParts.length);
    expect(oemCatalog.parts[0].name).not.toBe('Editor change');
  });

  it('resolves every project model to its physical role, including individual hardware', () => {
    const project = createProjectWorkspace(oemCatalog);
    const navigation = buildCuratedNavigation(oemDatabase, project.catalog);
    for (const source of projectParts) {
      const target = partModelTarget(project, navigation, source.id);
      expect(target.node?.id, source.id).toBe(source.role);
      expect(target.model?.partId).toBe(`project-${source.id}`);
    }
    expect(partModelTarget(project, navigation, 'nav.body.seat').model?.id).toBe('seat');
    const shared = projectParts.find(
      (model) => projectParts.filter((p) => p.role === model.role).length > 1,
    )!;
    expect(partModelTarget(project, navigation, shared.role).model).toBeUndefined();
  });

  it('replaces one bolt with a local file while preserving other geometry references and metadata', async () => {
    const project = createProjectWorkspace(oemCatalog);
    const navigation = buildCuratedNavigation(oemDatabase, project.catalog);
    const target = partModelTarget(project, navigation, 'bolt-peg-left-upper');
    const replaced = assignPartModel(
      project,
      target.node!,
      'replacement.glb',
      'Updated bolt.glb',
      target.model!.id,
    );
    const roundTrip = parseEditorProject(JSON.parse(JSON.stringify(replaced)));
    const modified = roundTrip.partModels!.find((model) => model.id === target.model!.id)!;
    expect(modified.projectModelId).toBeUndefined();
    expect(modified.partId).toBe(target.model!.partId);
    expect(roundTrip.partModels!.filter((model) => model.id !== modified.id)).toEqual(
      project.partModels!.filter((model) => model.id !== modified.id),
    );
    expect(roundTrip.catalog.parts).toHaveLength(project.catalog.parts.length);
    expect(roundTrip.mapping.mappings).toHaveLength(project.mapping.mappings.length);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:replacement');
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const asset = await materializeProjectFiles([new File(['glb'], 'replacement.glb')], roundTrip);
    expect(asset.models).toEqual(
      projectPartsAsset.models!.map((model) =>
        model.id === modified.id ? { id: model.id, url: 'blob:replacement' } : model,
      ),
    );
    asset.dispose();
    expect(revoked).toHaveBeenCalledExactlyOnceWith('blob:replacement');
  });

  it('rejects missing public references and missing local replacements instead of showing stale geometry', async () => {
    const project = createProjectWorkspace(oemCatalog);
    project.partModels![0].projectModelId = 'removed-project-model';
    expect(() => parseEditorProject(project)).toThrow('unknown project model');
    await expect(materializeProjectFiles([], project)).rejects.toThrow('Unknown project model');
    delete project.partModels![0].projectModelId;
    await expect(materializeProjectFiles([], project)).rejects.toThrow('missing');
  });
});
