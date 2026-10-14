import type { Catalog } from '../core/types';
import { parseExplorerUrl } from '../core/navigation';
import type { NavigationModel } from './model';

/** nav addresses UI groups only; part and assembly retain their original engine identities. */
export function resolveNavigationLocation(
  search: string,
  catalog: Catalog,
  navigation: NavigationModel | null,
) {
  const state = parseExplorerUrl(search, catalog);
  const params = new URLSearchParams(search);
  if (params.has('motorcycle') && params.get('motorcycle') !== catalog.motorcycleId) return state;
  if (catalog.parts.find((part) => part.id === state.partId)?.kind === 'component') return state;
  const node = navigation?.byId.get(params.get('nav') ?? '');
  if (!node) return state;
  return {
    assemblyId: node.scopeId,
    partId: node.scopeId === catalog.motorcycleId ? null : node.scopeId,
  };
}
