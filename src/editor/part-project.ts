import type { Part } from '@/core/types';
import type { NavigationModel, NavigationNode } from '@/navigation/model';
import { partModelKey } from '@/viewer/part-models';
import type { EditorProject, PartModel } from './storage';

/** A role can contain multiple models (for example, four separate bracket bolts). */
export function partModelTarget(
  project: EditorProject,
  navigation: NavigationModel,
  selection: string,
): { node?: NavigationNode; model?: PartModel } {
  const roleOf = (model: PartModel) =>
    project.catalog.parts.find((part) => part.id === model.partId)?.specifications['Model role'];
  const selected = project.partModels?.find((model) => model.id === selection);
  const matches = project.partModels?.filter((model) => roleOf(model) === selection) ?? [];
  const model = selected ?? (matches.length === 1 ? matches[0] : undefined);
  const role = selected ? roleOf(selected) : selection;
  return { node: typeof role === 'string' ? navigation.byId.get(role) : undefined, model };
}

/** A user-selected physical role does not require choosing an OEM source occurrence. */
export function assignPartModel(
  project: EditorProject,
  node: NavigationNode,
  fileName: string,
  originalName: string,
  replacementId?: string,
): EditorProject {
  const previous = project.partModels?.find((model) => model.id === (replacementId ?? node.id));
  const id = previous?.id ?? node.id;
  const partId = previous?.partId ?? `model-${node.id}`;
  const existing = project.catalog.parts.find((part) => part.id === partId);
  const part: Part = {
    id: partId,
    name: node.name,
    kind: 'component',
    parentId: node.scopeId,
    description: 'Your imported part model.',
    oemNumber: null,
    genericDesignation: null,
    quantity: null,
    material: null,
    specifications: { 'Model role': node.id, 'Model file': originalName },
    dimensions: [],
    compatibility: [],
    sources: [],
    verification: 'unknown',
    images: [],
    alternatives: [],
    crossReferences: [],
    ...existing,
  };
  part.specifications = {
    ...part.specifications,
    'Model role': node.id,
    'Model file': originalName,
  };
  const model: PartModel = { id, partId, fileName, originalName };
  const partModels = previous
    ? project.partModels!.map((entry) => (entry.id === id ? model : entry))
    : [...(project.partModels ?? []), model];
  const key = partModelKey(id);
  return {
    ...project,
    assetFileName: partModels[0].fileName,
    partModels,
    catalog: {
      ...project.catalog,
      parts: [...project.catalog.parts.filter((entry) => entry.id !== partId), part],
    },
    mapping: {
      version: 1,
      assetId: 'local-parts',
      units: 'm',
      upAxis: 'Y',
      mappings: [
        ...(project.partModels ? project.mapping.mappings : []).filter(
          (entry) => entry.objectKey !== key && !entry.objectKey.startsWith(`${key}:source:`),
        ),
        { objectKey: key, partId },
      ],
    },
  };
}
