import assembly from '../../data/models/rear-shock-assembly.json';
import type { Explosion, Part } from '../core/types';

const instances = new Map(assembly.instances.map((part) => [part.id, part]));

export function rearShockPartDetails(id: string): Partial<Part> {
  const part = instances.get(id);
  if (!part) return {};
  return {
    description: part.description,
    oemNumber: null,
    genericDesignation: 'Stock rear-shock model',
    quantity: 1,
    sources: [
      { document: 'Approved rear-shock model', notes: assembly.geometryNotes },
      { document: 'Supplied finish references', notes: assembly.materialNotes },
    ],
    verification: 'unknown',
  };
}

/** Move the coil and adjuster away from the damper in its fitted local frame. */
export function rearShockExplosion(id: string): Explosion | undefined {
  const part = instances.get(id);
  if (!part) return undefined;
  const offset = part.explosionOffset;
  const distance = Math.hypot(...offset);
  return {
    direction: distance
      ? [offset[0] / distance, offset[1] / distance, offset[2] / distance]
      : [0, 1, 0],
    distance,
    verification: 'unknown',
  };
}
