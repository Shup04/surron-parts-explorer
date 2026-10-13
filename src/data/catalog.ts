import type { Catalog, Part } from '@/core/types';

/** These records identify demonstration geometry only; no OEM facts are asserted. */
function demoPart(
  id: string,
  name: string,
  parentId: string | null,
  kind: Part['kind'] = 'assembly',
  description?: string,
): Part {
  return {
    id,
    name,
    parentId,
    kind,
    description:
      description ??
      'Synthetic demonstration geometry. Component identification, dimensions, quantity and fitment require verification against your source drawings and final model.',
    oemNumber: null,
    genericDesignation: null,
    quantity: null,
    material: null,
    specifications: {},
    dimensions: [],
    compatibility: [],
    sources: [],
    verification: 'demonstration',
    images: [],
    alternatives: [],
    crossReferences: [],
  };
}

export const demoCatalog: Catalog = {
  version: 1,
  motorcycleId: 'lbx',
  parts: [
    demoPart(
      'lbx',
      'Sur-Ron Light Bee X',
      null,
      'motorcycle',
      'A functional explorer for the Light Bee X project. All visible geometry is a synthetic demonstration, not an accurate Sur-Ron model. Supply verified geometry and factory source information before using this catalog for identification or fitment.',
    ),
    demoPart('front-wheel', 'Front wheel', 'lbx'),
    demoPart('rear-wheel', 'Rear wheel', 'lbx'),
    demoPart('front-suspension', 'Front suspension', 'lbx'),
    demoPart('rear-suspension', 'Rear suspension', 'lbx'),
    demoPart('frame', 'Frame', 'lbx'),
    demoPart('swingarm', 'Swingarm', 'lbx'),
    demoPart('drivetrain', 'Motor & drivetrain', 'lbx'),
    demoPart('motor', 'Motor', 'drivetrain'),
    demoPart(
      'jackshaft',
      'Jackshaft assembly',
      'drivetrain',
      'assembly',
      'A synthetic axial assembly that demonstrates nested navigation, individually mapped components and configurable exploded views. Spacing, arrangement and geometry are illustrative and are not mechanically verified.',
    ),
    demoPart('shaft', 'Jackshaft', 'jackshaft', 'component'),
    demoPart('bearing-left', 'Left jackshaft bearing', 'jackshaft', 'component'),
    demoPart('bearing-right', 'Right jackshaft bearing', 'jackshaft', 'component'),
    demoPart('spacer-left', 'Left spacer', 'jackshaft', 'component'),
    demoPart('spacer-right', 'Right spacer', 'jackshaft', 'component'),
    demoPart('sprocket', 'Jackshaft sprocket', 'jackshaft', 'component'),
    demoPart('retaining-clips', 'Retaining clips', 'jackshaft', 'component'),
    demoPart('jackshaft-fasteners', 'Jackshaft fasteners', 'jackshaft', 'component'),
    demoPart('battery', 'Battery', 'lbx'),
    demoPart('controls', 'Handlebars & controls', 'lbx'),
    demoPart('brakes', 'Braking system', 'lbx'),
    demoPart('body', 'Seat & bodywork', 'lbx'),
  ],
};

export const catalog = demoCatalog;
