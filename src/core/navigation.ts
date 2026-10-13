import { buildCatalogIndex, getAssemblyForPart, getAncestors } from './catalog';
import type { Catalog } from './types';

export interface ExplorerLocation {
  assemblyId: string;
  partId: string | null;
}

export function parseExplorerUrl(
  search: string | URLSearchParams,
  catalog: Catalog,
): ExplorerLocation {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(
          search.includes('?') ? search.slice(search.indexOf('?') + 1).split('#')[0] : search,
        )
      : search;
  const index = buildCatalogIndex(catalog);
  if (params.has('motorcycle') && params.get('motorcycle') !== catalog.motorcycleId)
    return { assemblyId: catalog.motorcycleId, partId: null };
  const requestedPart = index.byId.get(params.get('part') ?? '');
  const requestedAssembly = index.byId.get(params.get('assembly') ?? '');
  const validAssembly =
    requestedAssembly && requestedAssembly.kind !== 'component' ? requestedAssembly : undefined;
  let assemblyId = validAssembly ? validAssembly.id : catalog.motorcycleId;
  if (
    requestedPart &&
    requestedPart.id !== assemblyId &&
    !getAncestors(index, requestedPart.id).some((part) => part.id === assemblyId)
  )
    assemblyId = getAssemblyForPart(index, requestedPart.id).id;
  if (requestedPart && !validAssembly) assemblyId = getAssemblyForPart(index, requestedPart.id).id;
  return { assemblyId, partId: requestedPart?.id ?? null };
}

export function createExplorerUrl(location: ExplorerLocation, motorcycleId = 'lbx'): string {
  const params = new URLSearchParams({ motorcycle: motorcycleId });
  if (location.assemblyId !== motorcycleId) params.set('assembly', location.assemblyId);
  if (location.partId) params.set('part', location.partId);
  return `/?${params.toString()}`;
}
