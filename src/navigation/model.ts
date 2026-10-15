import type { Catalog } from '../core/types';
import type { OemDatabase } from '../oem/types';
import { getOccurrenceDetails } from '../oem/queries';
import {
  CURATED_SYSTEMS,
  REFERENCE_ONLY_ASSEMBLY_IDS,
  REFERENCE_ONLY_OEM_NUMBERS,
  type NavigationDefinition,
  type SystemDefinition,
} from './definition';

/** An inspected configuration is separate from source-edition/year claims and geometry. */
export interface VerifiedConfiguration {
  id: string;
  name: string;
  motorcycleId: string;
  modelYear: number;
  assignments: {
    nodeId: string;
    occurrenceIds: string[];
    verification: 'verified-installed';
    evidence: string;
  }[];
}

export interface ReferenceGroup {
  id: string;
  partId: string;
  name: string;
  oemNumber: string | null;
  occurrenceIds: string[];
}

export interface NavigationNode {
  id: string;
  name: string;
  kind: 'system' | 'component' | 'group' | 'service' | 'installed';
  scopeId: string;
  parentId: string | null;
  children: NavigationNode[];
  references: ReferenceGroup[];
  installedOccurrenceIds: string[];
  occurrenceId?: string;
  modelPartIds?: string[];
}

export interface NavigationModel {
  roots: NavigationNode[];
  byId: Map<string, NavigationNode>;
  warnings: string[];
}

interface NavigationOptions {
  modelYear?: number | 'unknown';
  configurationId?: string;
  configurations?: VerifiedConfiguration[];
  definitions?: SystemDefinition[];
}

/** No description matching, inferred fitment, source preference, geometry inference or item caps. */
export function buildCuratedNavigation(
  database: OemDatabase,
  catalog: Catalog,
  options: NavigationOptions = {},
): NavigationModel {
  const available = new Set(catalog.parts.map((part) => part.id));
  const excludedAssemblies = new Set<string>(REFERENCE_ONLY_ASSEMBLY_IDS);
  const excludedNumbers = new Set<string>(REFERENCE_ONLY_OEM_NUMBERS);
  const records = database.occurrences
    .filter((occurrence) => available.has(occurrence.id))
    .map((occurrence) => getOccurrenceDetails(database, occurrence.id)!)
    .filter(
      (record) =>
        !excludedAssemblies.has(record.occurrence.assemblyId) &&
        !excludedNumbers.has(record.sourceRow.oemNumber ?? '') &&
        !excludedNumbers.has(record.part.oemNumber ?? ''),
    );
  const recordIndex = new Map(records.map((record) => [record.occurrence.id, record]));
  const byId = new Map<string, NavigationNode>();
  const warnings: string[] = [];
  const configuration = options.configurations?.find(
    (config) =>
      config.id === options.configurationId &&
      config.motorcycleId === catalog.motorcycleId &&
      config.modelYear === options.modelYear,
  );
  if (options.configurationId && !configuration)
    warnings.push('The selected configuration is not verified for this motorcycle and year.');

  function groupReferences(ids: Iterable<string>): ReferenceGroup[] {
    const groups = new Map<string, ReferenceGroup>();
    for (const id of new Set(ids)) {
      const record = recordIndex.get(id);
      if (!record) continue;
      // Group evidence by identity within this explicit physical role, never across locations.
      // An OEM override does not silently merge it into another historical identity.
      const key = `${record.part.id}:${record.part.oemNumber ?? ''}`;
      const prior = groups.get(key);
      if (prior) prior.occurrenceIds.push(id);
      else
        groups.set(key, {
          id: key,
          partId: record.part.id,
          name: record.part.normalizedName,
          oemNumber: record.part.oemNumber,
          occurrenceIds: [id],
        });
    }
    return [...groups.values()];
  }
  function add(node: NavigationNode) {
    if (byId.has(node.id)) throw new Error(`Duplicate curated navigation ID: ${node.id}`);
    byId.set(node.id, node);
    return node;
  }
  function makeNode(
    definition: NavigationDefinition,
    system: SystemDefinition,
    parentId: string,
  ): NavigationNode {
    const scopes = new Set(definition.sourceAssemblyIds ?? system.sourceAssemblyIds);
    const numbers = new Set(definition.oemNumbers ?? []);
    const sourceRows = new Set(definition.sourceRowIds ?? []);
    const direct = records.filter(
      (record) =>
        scopes.has(record.occurrence.assemblyId) &&
        (numbers.has(record.sourceRow.oemNumber ?? '') || sourceRows.has(record.sourceRow.id)),
    );
    const node = add({
      id: definition.id,
      name: definition.name,
      kind: definition.kind,
      scopeId: available.has(system.id) ? system.id : catalog.motorcycleId,
      parentId,
      children: [],
      references: [],
      installedOccurrenceIds: [],
    });
    node.children = (definition.children ?? []).map((child) => makeNode(child, system, node.id));
    const referenceIds = new Set([
      ...direct.map((record) => record.occurrence.id),
      ...node.children.flatMap((child) => child.references.flatMap((group) => group.occurrenceIds)),
    ]);
    node.references = groupReferences(referenceIds);
    const assignments =
      configuration?.assignments.filter((assignment) => assignment.nodeId === node.id) ?? [];
    if (assignments.length > 1)
      warnings.push(`Several configuration claims target ${node.name}; none was chosen.`);
    const assignment = assignments.length === 1 ? assignments[0] : undefined;
    if (assignment) {
      const ids = [...new Set(assignment.occurrenceIds)];
      const identities = new Set(ids.map((id) => recordIndex.get(id)?.part.id));
      if (
        assignment.verification !== 'verified-installed' ||
        !assignment.evidence.trim() ||
        !ids.length ||
        ids.some((id) => !referenceIds.has(id)) ||
        identities.size !== 1 ||
        node.kind !== 'component'
      ) {
        warnings.push(
          `Installed configuration for ${node.name} is incomplete or ambiguous; reference choices remain separate.`,
        );
      } else {
        node.installedOccurrenceIds = ids;
        // One navigation item per installed identity. All source/placement occurrences stay selectable.
        const record = recordIndex.get(ids[0])!;
        node.children.push(
          add({
            id: `${node.id}.installed`,
            name: record.part.normalizedName,
            kind: 'installed',
            parentId: node.id,
            scopeId: record.occurrence.assemblyId,
            children: [],
            references: groupReferences(ids),
            installedOccurrenceIds: ids,
            occurrenceId: ids[0],
          }),
        );
      }
    }
    return node;
  }
  const roots = (options.definitions ?? CURATED_SYSTEMS).map((system) => {
    const node = add({
      id: system.id,
      name: system.name,
      kind: 'system',
      parentId: null,
      scopeId: available.has(system.id) ? system.id : catalog.motorcycleId,
      children: [],
      references: [],
      installedOccurrenceIds: [],
    });
    node.children = system.children.map((child) => makeNode(child, system, node.id));
    const scopes = new Set(system.sourceAssemblyIds);
    node.references = groupReferences([
      ...records
        .filter((record) => scopes.has(record.occurrence.assemblyId))
        .map((record) => record.occurrence.id),
      ...node.children.flatMap((child) => child.references.flatMap((group) => group.occurrenceIds)),
    ]);
    return node;
  });
  function includeModels(node: NavigationNode): string[] {
    node.modelPartIds = [
      ...catalog.parts
        .filter((part) => part.specifications['Model role'] === node.id)
        .map((part) => part.id),
      ...node.children.flatMap(includeModels),
    ];
    return node.modelPartIds;
  }
  roots.forEach(includeModels);
  return { roots, byId, warnings };
}

export function navigationAncestors(model: NavigationModel, id: string): string[] {
  const ancestors: string[] = [];
  let node = model.byId.get(id);
  while (node?.parentId) {
    ancestors.unshift(node.parentId);
    node = model.byId.get(node.parentId);
  }
  return ancestors;
}

/** Locate a presentation role without rewriting any catalog parent or mapping. */
export function navigationForOccurrence(
  model: NavigationModel,
  id: string,
): NavigationNode | undefined {
  const nodes = [...model.byId.values()];
  const modelRole = nodes.find(
    (node) =>
      node.modelPartIds?.includes(id) &&
      !node.children.some((child) => child.modelPartIds?.includes(id)),
  );
  if (modelRole) return modelRole;
  const contains = (node: NavigationNode) =>
    node.references.some((group) => group.occurrenceIds.includes(id)) ||
    !!node.modelPartIds?.includes(id);
  return (
    nodes.find((node) => node.kind === 'component' && contains(node)) ??
    nodes.find((node) => node.kind === 'group' && !node.children.length && contains(node))
  );
}
