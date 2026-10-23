import assembly from '../../data/models/rear-wheel-assembly.json';
import type { Explosion, Part, SourceReference } from '../core/types';

interface Specification {
  designation: string;
  notes: string;
  reference?: string;
  quantity?: number;
  dimensions: { label: string; value: number; unit: string }[];
  sources: SourceReference[];
}

const specs: Record<string, Specification> = assembly.specs;
const instances = new Map(assembly.instances.map((instance) => [instance.id, instance]));

/** Photographic geometry never establishes an installed OEM identity. */
export function rearWheelPartDetails(id: string): Partial<Part> {
  const instance = instances.get(id);
  if (!instance) return {};
  const spec = specs[instance.spec];
  return {
    description: spec.notes,
    oemNumber: null,
    genericDesignation: spec.designation,
    quantity: spec.quantity ?? 1,
    specifications: {
      'Model role': instance.role,
      'Model file': `${instance.name}.glb`,
      ...(spec.reference ? { 'Catalog reference': spec.reference } : {}),
    },
    dimensions: spec.dimensions.map((dimension) => ({ ...dimension, unit: 'mm' })),
    sources: [
      ...spec.sources,
      { document: 'Rear-wheel placement notes', notes: assembly.placementNotes },
    ],
    verification: 'unknown',
  };
}

/** Keep rings, spoke lacing and each fastener set coherent during disassembly. */
export function rearWheelExplosion(id: string): Explosion | undefined {
  const instance = instances.get(id);
  if (!instance) return undefined;
  const offset = instance.explosionOffsetMm;
  return {
    direction: [offset < 0 ? -1 : 1, 0, 0],
    distance: Math.abs(offset),
    verification: 'unknown',
  };
}
