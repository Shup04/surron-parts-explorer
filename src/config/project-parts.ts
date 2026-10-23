import manifest from '../../public/parts/manifest.json';
import hardware from '../../data/models/mounted-hardware.json';
import type { AssetDefinition, Catalog, MappingConfig, Part } from '../core/types';
import { CURATED_SYSTEMS } from '../navigation/definition';
import { partModelKey } from '../viewer/part-models';
import { jackshaftExplosion, jackshaftPartDetails } from './jackshaft-parts';
import { rearWheelExplosion, rearWheelPartDetails } from './rear-wheel-parts';

export const projectParts = manifest.parts;
const hardwareSpecs: Record<string, (typeof hardware.specs)[keyof typeof hardware.specs]> =
  hardware.specs;
const partId = (id: string) => `project-${id}`;
const roleSystems = new Map<string, string>();
for (const system of CURATED_SYSTEMS) {
  const visit = (node: { id: string; children?: { id: string }[] }) => {
    roleSystems.set(node.id, system.id);
    node.children?.forEach(visit);
  };
  visit(system);
}

/** Model identities stay separate from the source catalog, including sourced hardware. */
export function withProjectParts(catalog: Catalog): Catalog {
  const available = new Set(catalog.parts.map((part) => part.id));
  const parts: Part[] = projectParts.map((model): Part => {
    const spec =
      'hardwareSpec' in model && model.hardwareSpec ? hardwareSpecs[model.hardwareSpec] : undefined;
    return {
      id: partId(model.id),
      name: model.name,
      kind: 'component',
      parentId: available.has(roleSystems.get(model.role)!)
        ? roleSystems.get(model.role)!
        : catalog.motorcycleId,
      description: spec
        ? 'Catalog-sized screw aligned with the modeled mounting hole. Thread detail is omitted.'
        : 'Supplied 3D part from the current Blender assembly.',
      oemNumber: spec?.oemNumber ?? null,
      genericDesignation: spec ? `${spec.thread} × ${spec.lengthMm} · ${spec.headType} head` : null,
      quantity: spec ? 1 : null,
      material: spec ? null : model.materials.join(', '),
      specifications: {
        ...(spec
          ? {
              'Allen key': `${spec.allenKeyMm} mm`,
              'Head standard': spec.headStandard,
              Finish: hardware.finish,
            }
          : {}),
        'Model role': model.role,
        'Model file': model.file,
      },
      dimensions: spec
        ? [
            { label: 'Thread diameter', value: spec.diameterMm, unit: 'mm' },
            { label: 'Length under head', value: spec.lengthMm, unit: 'mm' },
            { label: 'Head diameter', value: spec.headDiameterMm, unit: 'mm' },
            { label: 'Head height', value: spec.headHeightMm, unit: 'mm' },
          ]
        : [],
      compatibility: [],
      sources: spec
        ? [
            ...spec.sources,
            {
              document: 'Modeled hardware notes',
              notes: `${hardware.geometryNotes} ${hardware.finishBasis} ${hardware.placementNotes}`,
            },
          ]
        : [],
      verification: spec ? 'source-confirmed' : 'unknown',
      images: [],
      alternatives: [],
      crossReferences: [],
      ...jackshaftPartDetails(model.id),
      ...rearWheelPartDetails(model.id),
    };
  });
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
    ...(jackshaftExplosion(model.id) ? { explosion: jackshaftExplosion(model.id) } : {}),
    ...(rearWheelExplosion(model.id) ? { explosion: rearWheelExplosion(model.id) } : {}),
  })),
};
