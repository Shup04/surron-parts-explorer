import type { Part } from '@/core/types';
import type { NavigationNode } from '@/navigation/model';
import { partModelKey } from '@/viewer/part-models';
import type { EditorProject, PartModel } from './storage';

/** A user-selected physical role does not require choosing an OEM source occurrence. */
export function assignPartModel(
  project: EditorProject,
  node: NavigationNode,
  fileName: string,
  originalName: string,
): EditorProject {
  const partId = `model-${node.id}`;
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
  const model: PartModel = { id: node.id, partId, fileName, originalName };
  const partModels = [...(project.partModels ?? []).filter((entry) => entry.id !== node.id), model];
  const key = partModelKey(node.id);
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
