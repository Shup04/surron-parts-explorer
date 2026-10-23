import assembly from '../../data/models/jackshaft-assembly.json';
import type { Explosion, Part, SourceReference } from '../core/types';

interface Specification {
  oemNumber: string | null;
  designation: string;
  notes: string;
  sources: SourceReference[];
  dimensions: { label: string; value: number; unit: string }[];
  referenceOemNumber?: string | null;
  modeledAllenKeyMm?: number;
}

const specs: Record<string, Specification> = assembly.specs;
const instances = new Map(assembly.instances.map((instance) => [instance.id, instance]));

/** Model metadata is separate from immutable OEM claims and installed variants. */
export function jackshaftPartDetails(id: string): Partial<Part> {
  const instance = instances.get(id);
  if (!instance) return {};
  const spec = specs[instance.spec];
  return {
    description: spec.notes,
    oemNumber: spec.oemNumber,
    genericDesignation: spec.designation,
    quantity: 1,
    material: null,
    specifications: {
      'Model role': instance.role,
      'Model file': `${instance.name}.glb`,
      ...(spec.referenceOemNumber ? { 'Catalog reference': spec.referenceOemNumber } : {}),
      ...(spec.modeledAllenKeyMm
        ? { 'Modeled Allen key (provisional)': `${spec.modeledAllenKeyMm} mm` }
        : {}),
    },
    dimensions: spec.dimensions.map((dimension) => ({ ...dimension, unit: 'mm' })),
    sources: [
      ...spec.sources,
      {
        document: 'Jackshaft model placement notes',
        notes: `${assembly.placementNotes} ${assembly.axis.evidence} ${assembly.explosionNotes}`,
      },
    ],
    verification: 'unknown',
  };
}

/** Offsets use the same raw coordinate scale as the project GLBs. */
export function jackshaftExplosion(id: string): Explosion | undefined {
  const instance = instances.get(id);
  if (!instance) return undefined;
  const offset = instance.explosionOffsetMm;
  return {
    direction: [offset < 0 ? -1 : 1, 0, 0],
    distance: Math.abs(offset),
    verification: 'unknown',
  };
}
