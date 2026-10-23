import manifest from '../../public/parts/manifest.json';
import { rearShockExplosion, rearShockPartDetails } from './rear-shock-parts';
import type { AssetDefinition, Catalog, MappingConfig, Part } from '../core/types';
import { CURATED_SYSTEMS } from '../navigation/definition';
import { partModelKey } from '../viewer/part-models';

export const projectParts = manifest.parts;
const partId = (id: string) => `project-${id}`;
const roleSystems = new Map<string, string>();
for (const system of CURATED_SYSTEMS) {
  const visit = (node: { id: string; children?: { id: string }[] }) => {
    roleSystems.set(node.id, system.id);
    node.children?.forEach(visit);
  };
  visit(system);
}

/** Supplied geometry has its own identity; it does not select an OEM variant. */
export function withProjectParts(catalog: Catalog): Catalog {
  const available = new Set(catalog.parts.map((part) => part.id));
  const parts: Part[] = projectParts.map((model) => ({
    id: partId(model.id),
    name: model.name,
    kind: 'component',
    parentId: available.has(roleSystems.get(model.role)!)
      ? roleSystems.get(model.role)!
      : catalog.motorcycleId,
    description: 'Supplied 3D part from the current Blender assembly.',
    oemNumber: null,
    genericDesignation: null,
    quantity: null,
    material: model.materials.join(', '),
    specifications: { 'Model role': model.role, 'Model file': model.file },
    dimensions: [],
    compatibility: [],
    sources: [],
    verification: 'unknown',
    images: [],
    alternatives: [],
    crossReferences: [],
    ...rearShockPartDetails(model.id),
  }));
  const ids = new Set(parts.map((part) => part.id));
  return { ...catalog, parts: [...catalog.parts.filter((part) => !ids.has(part.id)), ...parts] };
}

export const projectPartsAsset: AssetDefinition = {
  id: manifest.id,
  url: `/parts/${encodeURIComponent(projectParts[0].file)}`,
  models: projectParts.map((model) => ({
    id: model.id,
    url: `/parts/${encodeURIComponent(model.file)}?v=${model.sha256.slice(0, 12)}`,
  })),
  assemblyId: 'lbx',
  label: 'Project parts',
  unit: 'm',
  upAxis: 'Y',
};

export const projectPartsMapping: MappingConfig = {
  version: 1,
  assetId: manifest.id,
  units: 'm',
  upAxis: 'Y',
  mappings: projectParts.map((model) => ({
    objectKey: partModelKey(model.id),
    partId: partId(model.id),
    ...(rearShockExplosion(model.id) ? { explosion: rearShockExplosion(model.id) } : {}),
  })),
};
