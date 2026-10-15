import type { AssetDefinition, MappingConfig } from '@/core/types';
import { projectPartsAsset, projectPartsMapping } from './project-parts';

/** Add versioned models + exported editor mappings here. Geometry never owns catalog IDs.
 * A matching assembly asset is preferred over the full model and loaded only on navigation.
 * Example: {asset:{id:'lbx-v1', url:'/models/lbx.glb', assemblyId:'lbx', unit:'m', upAxis:'Y', label:'LBX supplied geometry'}, mapping: importedMapping}
 */
export const assetRegistry: { asset: AssetDefinition; mapping: MappingConfig }[] = [
  { asset: projectPartsAsset, mapping: projectPartsMapping },
];
