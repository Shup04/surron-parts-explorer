import type { Catalog, ExplosionGroup, Part } from '../core/types';
import type { OemDatabase } from '../oem/types';
import {
  buildCuratedNavigation,
  navigationAncestors,
  navigationForOccurrence,
  type NavigationModel,
  type NavigationNode,
} from './model';

/** Keep modeled parts and their grouping ancestors. Catalog evidence never creates a part. */
export function buildModeledNavigation(
  database: OemDatabase,
  catalog: Catalog,
  modeledPartIds: ReadonlySet<string>,
  options: Parameters<typeof buildCuratedNavigation>[2] = {},
): NavigationModel {
  const reference: NavigationModel = catalog.parts.some(
    (part) => part.specifications['Model role'] || part.specifications['Catalog identity'],
  )
    ? buildCuratedNavigation(database, catalog, options)
    : { roots: [], byId: new Map(), warnings: [] };
  const parts = new Map(catalog.parts.map((part) => [part.id, part]));
  const assignments = new Map<string, Part[]>();
  const unassigned: Part[] = [];
  for (const part of catalog.parts) {
    if (!modeledPartIds.has(part.id) || part.id === catalog.motorcycleId) continue;
    const role =
      reference.byId.get(part.specifications['Model role']) ??
      reference.byId.get(part.id) ??
      navigationForOccurrence(reference, part.id);
    if (role) assignments.set(role.id, [...(assignments.get(role.id) ?? []), part]);
    else unassigned.push(part);
  }

  const byId = new Map<string, NavigationNode>();
  function add(node: NavigationNode) {
    byId.set(node.id, node);
    return node;
  }
  function leaf(part: Part, parentId: string | null, role?: NavigationNode): NavigationNode {
    return add({
      id: role?.id ?? `modeled.${part.id}`,
      name: role?.kind === 'component' ? role.name : part.name,
      kind: 'component',
      scopeId: part.parentId ?? catalog.motorcycleId,
      parentId,
      children: [],
      references: [],
      installedOccurrenceIds: [],
      occurrenceId: part.id,
      modelPartIds: [part.id],
    });
  }
  function project(node: NavigationNode, parentId: string | null): NavigationNode[] {
    const direct = assignments.get(node.id) ?? [];
    // Service is a source-catalog disclosure, not a physical assembly.
    if (node.kind === 'service' && !direct.length)
      return node.children.flatMap((child) => project(child, parentId));
    const children = node.children.flatMap((child) => project(child, node.id));
    if (!direct.length && !children.length) return [];
    if (direct.length === 1 && !children.length && node.kind !== 'system' && !node.selectAsAssembly)
      return [leaf(direct[0], parentId, node)];
    children.push(...direct.map((part) => leaf(part, node.id)));
    return [
      add({
        ...node,
        kind: node.kind === 'system' ? 'system' : 'group',
        parentId,
        children,
        references: [],
        installedOccurrenceIds: [],
        occurrenceId: undefined,
        modelPartIds: [...new Set(children.flatMap((child) => child.modelPartIds ?? []))],
      }),
    ];
  }
  const roots = reference.roots.flatMap((node) => project(node, null));

  // Advanced imports and newly authored roles can use the existing catalog hierarchy.
  // They must remain visible even if they have no OEM reference or curated role.
  function parentGroup(id: string | null): NavigationNode | undefined {
    if (!id || id === catalog.motorcycleId) return undefined;
    const existing = byId.get(id);
    if (existing) return existing;
    const part = parts.get(id);
    if (!part || part.kind === 'component') return undefined;
    const parent = parentGroup(part.parentId);
    const group = add({
      id,
      name: part.name,
      kind: 'group',
      scopeId: id,
      parentId: parent?.id ?? null,
      children: [],
      references: [],
      installedOccurrenceIds: [],
      modelPartIds: [],
    });
    (parent?.children ?? roots).push(group);
    return group;
  }
  for (const part of unassigned) {
    const parent = parentGroup(part.kind === 'assembly' ? part.id : part.parentId);
    if (part.kind !== 'assembly') (parent?.children ?? roots).push(leaf(part, parent?.id ?? null));
    let ancestor = parent;
    while (ancestor) {
      ancestor.modelPartIds = [...new Set([...(ancestor.modelPartIds ?? []), part.id])];
      ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
    }
  }
  return { roots, byId, warnings: reference.warnings };
}

export function assemblyExplosion(node: NavigationNode | undefined): number {
  return node && !node.occurrenceId && (node.modelPartIds?.length ?? 0) > 1 ? 1 : 0;
}

/** Only unopened assemblies are rigid. Their first modeled child anchors the group. */
export function closedAssemblyGroups(
  navigation: NavigationModel | null,
  activeNode: NavigationNode | undefined,
): ExplosionGroup[] {
  const groups: ExplosionGroup[] = [];
  function visit(node: NavigationNode) {
    if (node.selectAsAssembly && !node.occurrenceId && node.modelPartIds?.length) {
      groups.push({ id: node.id, partIds: node.modelPartIds, anchorPartId: node.modelPartIds[0] });
      return;
    }
    node.children.forEach(visit);
  }
  (activeNode?.children ?? navigation?.roots ?? []).forEach(visit);
  return groups;
}

/** Enter an assembly through any of its meshes; allow part picks once inside it. */
export function geometrySelectionAssembly(
  navigation: NavigationModel | null,
  activeNode: NavigationNode | undefined,
  partId: string,
): NavigationNode | undefined {
  if (!navigation) return undefined;
  const part = navigationForOccurrence(navigation, partId);
  if (!part) return undefined;
  const activePath = new Set(
    activeNode ? [...navigationAncestors(navigation, activeNode.id), activeNode.id] : [],
  );
  return navigationAncestors(navigation, part.id)
    .map((id) => navigation.byId.get(id)!)
    .find((node) => node.selectAsAssembly && !activePath.has(node.id));
}

/** A part link opens that part unless the URL explicitly retains its modeled assembly. */
export function modeledScope(
  navigation: NavigationModel | null,
  assemblyId: string,
  partId: string | null,
  navId: string | null,
): NavigationNode | undefined {
  if (!navigation) return undefined;
  if (partId && partId !== assemblyId) {
    const context = navId ? navigation.byId.get(navId) : undefined;
    return context?.modelPartIds?.includes(partId)
      ? context
      : navigationForOccurrence(navigation, partId);
  }
  return navigation.byId.get(navId ?? assemblyId);
}
