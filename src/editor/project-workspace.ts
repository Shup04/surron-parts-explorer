import { projectParts, projectPartsMapping, withProjectParts } from '@/config/project-parts';
import type { Catalog } from '@/core/types';
import type { EditorProject } from './storage';

/** Start with the same geometry, identities and placements as the public explorer. */
export function createProjectWorkspace(catalog: Catalog): EditorProject {
  return {
    version: 1,
    catalog: structuredClone(withProjectParts(catalog)),
    mapping: structuredClone(projectPartsMapping),
    assetFileName: projectParts[0].file,
    partModels: projectParts.map((model) => ({
      id: model.id,
      partId: `project-${model.id}`,
      fileName: model.file,
      originalName: model.file,
      projectModelId: model.id,
    })),
  };
}
