'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Expand,
  Eye,
  EyeOff,
  Focus,
  Layers3,
  Link2,
  Menu,
  RotateCcw,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import { demoCatalog } from '@/data/catalog';
import { oemCatalog, oemDatabase } from '@/data/oem';
import { toExplorerCatalog } from '@/oem/adapter';
import { applyReviewPatches } from '@/oem/review';
import { availableModelYears } from '@/oem/queries';
import { loadReviewPatches } from '@/catalog-review/storage';
import { OemDetails } from './OemDetails';
import { PartDetails } from './PartDetails';
import { CuratedPartsTree, CuratedAssemblyDetails } from './CuratedParts';
import {
  buildCuratedNavigation,
  navigationAncestors,
  navigationForOccurrence,
  type NavigationNode,
} from '@/navigation/model';
import { resolveNavigationLocation } from '@/navigation/location';
import { verifiedConfigurations } from '@/navigation/configurations';
import type { CatalogFilters } from '@/oem/types';

function sourceFilters(search: string): CatalogFilters {
  const params = new URLSearchParams(search);
  const year = params.get('year');
  return {
    modelYear:
      year === 'unknown' ? 'unknown' : year && /^20\d\d$/.test(year) ? Number(year) : undefined,
    sourceId: params.get('source') || undefined,
  };
}

import {
  buildCatalogIndex,
  getAncestors,
  getChildren,
  getDescendants,
  searchParts,
} from '@/core/catalog';
import { createExplorerUrl } from '@/core/navigation';
import type { AssetDefinition, Catalog, MappingConfig, ViewerDiagnostics } from '@/core/types';
import { assetRegistry } from '@/config/assets';

const Viewer = dynamic(() => import('@/viewer/Viewer'), {
  ssr: false,
  loading: () => (
    <div className="viewer-loading">
      <span className="loader" />
      Preparing the 3D workbench…
    </div>
  ),
});

export default function Explorer() {
  const [catalog, setCatalog] = useState<Catalog>(oemCatalog);
  const [demoMode, setDemoMode] = useState(false);
  const [database, setDatabase] = useState(oemDatabase);
  const [filters, setFilters] = useState<CatalogFilters>({});
  const [navId, setNavId] = useState<string | null>(null);
  const [configurationId, setConfigurationId] = useState('');
  const [localAsset, setLocalAsset] = useState<AssetDefinition>();
  const [localWorkspace, setLocalWorkspace] = useState(false);
  const [mapping, setMapping] = useState<MappingConfig>();
  const [assetMessage, setAssetMessage] = useState('');
  const [assemblyId, setAssemblyId] = useState(demoCatalog.motorcycleId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [explosion, setExplosion] = useState(0);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [isolatedId, setIsolatedId] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set([demoCatalog.motorcycleId, 'drivetrain']),
  );
  const [navOpen, setNavOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [revealRequest, setRevealRequest] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState('');
  const [diagnostics, setDiagnostics] = useState<ViewerDiagnostics>();
  const workspace = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const navPanel = useRef<HTMLElement>(null);
  const detailPanel = useRef<HTMLElement>(null);
  const partsButton = useRef<HTMLButtonElement>(null);
  const detailsButton = useRef<HTMLButtonElement>(null);
  const revealNode = useRef<string | null>(null);
  const index = useMemo(() => buildCatalogIndex(catalog), [catalog]);
  const curatedEnabled =
    !demoMode &&
    (!localWorkspace || catalog.parts.some((part) => part.specifications['Catalog identity']));
  const navigation = useMemo(
    () =>
      curatedEnabled
        ? buildCuratedNavigation(database, catalog, {
            modelYear: filters.modelYear,
            configurationId,
            configurations: verifiedConfigurations,
          })
        : null,
    [curatedEnabled, database, catalog, filters.modelYear, configurationId],
  );
  const assembly = index.byId.get(assemblyId) ?? index.byId.get(catalog.motorcycleId)!;
  const selection = selectedId ? index.byId.get(selectedId) : undefined;
  const detail = selection ?? assembly;
  const activeNode =
    selection?.kind === 'component' ? undefined : navigation?.byId.get(navId ?? assemblyId);
  const selectionNode =
    selectedId && navigation ? navigationForOccurrence(navigation, selectedId) : undefined;
  const presentationNode = activeNode ?? selectionNode;
  const navigationPath =
    presentationNode && navigation
      ? [
          ...navigationAncestors(navigation, presentationNode.id).map(
            (id) => navigation.byId.get(id)!,
          ),
          presentationNode,
        ]
      : [];
  const overview =
    assemblyId === catalog.motorcycleId &&
    !activeNode &&
    (!selection || selection.kind === 'motorcycle');
  const detailsVisible = detailOpen && !overview;
  const isFull = assemblyId === catalog.motorcycleId;
  const results = useMemo(
    () => (query.trim() ? searchParts(index, query, 101) : []),
    [index, query],
  );
  const breadcrumbs = [...getAncestors(index, assembly.id), assembly];
  const childParts = getChildren(index, detail.id);
  const detailBreadcrumbs = [...getAncestors(index, detail.id), detail];
  const assetEntry =
    assetRegistry.find((entry) => entry.asset.assemblyId === assemblyId) ??
    assetRegistry.find((entry) => entry.asset.assemblyId === catalog.motorcycleId);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1100px)');
    const update = () => {
      setCompact(media.matches);
      setNavOpen(!media.matches);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!compact || (!navOpen && !detailsVisible)) return;
    const panel = navOpen ? navPanel.current : detailPanel.current;
    if (!panel) return;
    const trigger = navOpen ? partsButton.current : detailsButton.current;
    const focusable = () =>
      [
        ...panel.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
        ),
      ].filter((element) => element.getClientRects().length > 0);
    (navOpen ? search.current : focusable()[0])?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first || !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      trigger?.focus();
    };
  }, [compact, navOpen, detailsVisible]);

  useEffect(() => {
    let disposed = false;
    let release: (() => void) | undefined;
    async function initialize() {
      const params = new URLSearchParams(window.location.search);
      const demo = params.get('demo') === '1';
      setDemoMode(demo);
      setNavId(params.get('nav'));
      setConfigurationId(params.get('configuration') ?? '');
      let reviewed = oemDatabase;
      try {
        reviewed = applyReviewPatches(oemDatabase, loadReviewPatches());
      } catch {
        setNotice('Saved review could not be loaded. Original source data is displayed.');
      }
      setDatabase(reviewed);
      const initialFilters = sourceFilters(window.location.search);
      setFilters(initialFilters);
      let activeCatalog = demo ? demoCatalog : toExplorerCatalog(reviewed, initialFilters);
      setCatalog(activeCatalog);
      if (new URLSearchParams(window.location.search).get('workspace') === 'local') {
        try {
          const { loadEditorProject, loadSavedEditorAsset } = await import('@/editor/storage');
          const project = loadEditorProject();
          if (!project)
            throw new Error(
              'No saved local project. Import and save a model in the mapping editor first.',
            );
          const loaded = await loadSavedEditorAsset();
          if (!loaded && project.assetFileName)
            throw new Error('The saved model is unavailable. Reimport it in the mapping editor.');
          release = loaded?.dispose;
          if (disposed) {
            release?.();
            return;
          }
          activeCatalog = project.catalog;
          setCatalog(activeCatalog);
          setMapping(project.mapping);
          setLocalWorkspace(true);
          if (loaded)
            setLocalAsset({
              id: project.mapping.assetId,
              url: loaded.url,
              assemblyId: activeCatalog.motorcycleId,
              label: project.assetFileName ?? 'Local model',
              unit: 'm',
              upAxis: 'Y',
            });
          setAssetMessage(
            loaded
              ? 'Local model · verification follows catalog metadata'
              : 'Local mapping workspace · synthetic demonstration geometry',
          );
        } catch (error) {
          if (!disposed)
            setAssetMessage(
              `${error instanceof Error ? error.message : 'Could not open local model.'} Showing the source catalog.`,
            );
        }
      }
      if (disposed) return;
      const activeNavigation =
        !demo &&
        (!params.has('workspace') ||
          activeCatalog.parts.some((part) => part.specifications['Catalog identity']))
          ? buildCuratedNavigation(reviewed, activeCatalog, {
              modelYear: initialFilters.modelYear,
              configurationId: params.get('configuration') ?? '',
              configurations: verifiedConfigurations,
            })
          : null;
      const state = resolveNavigationLocation(
        window.location.search,
        activeCatalog,
        activeNavigation,
      );
      setAssemblyId(state.assemblyId);
      setSelectedId(state.partId);
      setDetailOpen(
        !!params.get('nav') ||
          (!!state.partId &&
            activeCatalog.parts.find((part) => part.id === state.partId)?.kind === 'component'),
      );
      setExpanded(
        new Set([
          activeCatalog.motorcycleId,
          state.assemblyId,
          ...getAncestors(buildCatalogIndex(activeCatalog), state.partId ?? state.assemblyId).map(
            (p) => p.id,
          ),
        ]),
      );
    }
    void initialize();
    return () => {
      disposed = true;
      release?.();
    };
  }, []);

  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      setNavId(params.get('nav'));
      setConfigurationId(params.get('configuration') ?? '');
      const nextFilters = sourceFilters(window.location.search);
      setFilters(nextFilters);
      const active =
        demoMode || localWorkspace ? catalog : toExplorerCatalog(database, nextFilters);
      if (!demoMode && !localWorkspace) setCatalog(active);
      const activeNavigation = curatedEnabled
        ? buildCuratedNavigation(database, active, {
            modelYear: nextFilters.modelYear,
            configurationId: params.get('configuration') ?? '',
            configurations: verifiedConfigurations,
          })
        : null;
      const state = resolveNavigationLocation(window.location.search, active, activeNavigation);
      setAssemblyId(state.assemblyId);
      setSelectedId(state.partId);
      const activeIndex = buildCatalogIndex(active);
      setDetailOpen(
        !!params.get('nav') ||
          (!!state.partId && activeIndex.byId.get(state.partId)?.kind === 'component'),
      );
      setExpanded(
        new Set([
          active.motorcycleId,
          state.assemblyId,
          ...getAncestors(activeIndex, state.partId ?? state.assemblyId).map((part) => part.id),
        ]),
      );
      if (compact) setNavOpen(false);
      setHoveredId(null);
      setHiddenIds([]);
      setIsolatedId(null);
      setExplosion(0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [catalog, database, demoMode, localWorkspace, curatedEnabled, compact]);

  const navigate = useCallback(
    (partId: string, presentationId?: string) => {
      const part = index.byId.get(partId);
      if (!part) return;
      setNavId(presentationId ?? null);
      const nextAssembly =
        part.kind === 'component' ? (part.parentId ?? catalog.motorcycleId) : part.id;
      const nextPart = part.kind === 'motorcycle' ? null : part.id;
      const url = createExplorerUrl(
        { assemblyId: nextAssembly, partId: nextPart },
        catalog.motorcycleId,
      );
      const target = new URL(url, window.location.origin);
      if (localWorkspace) target.searchParams.set('workspace', 'local');
      if (demoMode) target.searchParams.set('demo', '1');
      if (filters.modelYear) target.searchParams.set('year', String(filters.modelYear));
      if (filters.sourceId) target.searchParams.set('source', filters.sourceId);
      if (configurationId) target.searchParams.set('configuration', configurationId);
      if (presentationId) target.searchParams.set('nav', presentationId);
      if (
        `${window.location.pathname}${window.location.search}` !==
        `${target.pathname}${target.search}`
      )
        window.history.pushState(null, '', `${target.pathname}${target.search}`);
      setAssemblyId(nextAssembly);
      setSelectedId(nextPart);
      setExpanded(
        (prev) => new Set([...prev, ...getAncestors(index, partId).map((p) => p.id), nextAssembly]),
      );
      setIsolatedId((previous) => (previous === partId ? previous : null));
      setHiddenIds((previous) =>
        nextAssembly !== assemblyId ? [] : previous.filter((id) => id !== partId),
      );
      setHoveredId(null);
      if (nextAssembly !== assemblyId) setExplosion(0);
      if (compact) setNavOpen(false);
      setQuery('');
      setDetailOpen(!!presentationId || part.kind === 'component');
      setNotice(`${part.name} selected`);
    },
    [
      assemblyId,
      catalog.motorcycleId,
      index,
      localWorkspace,
      demoMode,
      filters,
      configurationId,
      compact,
    ],
  );

  const adjustExplosion = (amount: number) => {
    setExplosion(amount);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        document
          .querySelectorAll(
            '.explorer-ux .viewer-options[open], .explorer-ux .workspace-tools[open]',
          )
          .forEach((menu) => menu.removeAttribute('open'));
        setNavOpen((previous) => (compact ? false : previous));
        setDetailOpen(false);
        setHelpOpen(false);
        setStatsOpen(false);
        setIsolatedId(null);
        if (compact) partsButton.current?.focus();
        return;
      }
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      )
        return;
      if (event.key === '/') {
        event.preventDefault();
        setNavOpen(true);
        if (compact) setDetailOpen(false);
        requestAnimationFrame(() => search.current?.focus());
      }
      if (event.key.toLowerCase() === 'r') setResetToken((v) => v + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compact]);

  const toggleHidden = (id: string) =>
    setHiddenIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice('Copy the page address from your browser to share this selection.');
    }
  };
  function changeSourceFilter(patch: Partial<CatalogFilters>) {
    const next = { ...filters, ...patch };
    const active = toExplorerCatalog(database, next);
    setFilters(next);
    setCatalog(active);
    const url = new URL(window.location.href);
    for (const [key, value] of [
      ['year', next.modelYear],
      ['source', next.sourceId],
    ] as const) {
      if (value) url.searchParams.set(key, String(value));
      else url.searchParams.delete(key);
    }
    const state = resolveNavigationLocation(
      url.search,
      active,
      buildCuratedNavigation(database, active, {
        modelYear: next.modelYear,
        configurationId,
        configurations: verifiedConfigurations,
      }),
    );
    setAssemblyId(state.assemblyId);
    setSelectedId(state.partId);
    if (!state.partId) url.searchParams.delete('part');
    if (state.assemblyId === 'lbx') url.searchParams.delete('assembly');
    setHiddenIds([]);
    setIsolatedId(null);
    setExplosion(0);
    window.history.pushState(null, '', url.pathname + url.search);
  }
  const activeMapping = mapping ?? assetEntry?.mapping;
  const hasImportedGeometry = !!(localAsset ?? assetEntry?.asset);
  const mappedIds = new Set(activeMapping?.mappings.map((entry) => entry.partId) ?? []);
  const geometryIds = [detail.id, ...getDescendants(index, detail.id).map((part) => part.id)];
  const hasGeometry =
    demoMode || (hasImportedGeometry && geometryIds.some((id) => mappedIds.has(id)));
  const showDemonstration = !hasImportedGeometry && !demoMode && overview && !selection;
  const showViewer = hasGeometry || showDemonstration;
  const sceneCatalog = showDemonstration ? demoCatalog : catalog;
  const selectGeometry = (id: string) => {
    if (index.byId.has(id)) navigate(id);
    else if (showDemonstration) {
      const parents = getAncestors(buildCatalogIndex(demoCatalog), id).reverse();
      const match = parents.find((parent) => index.byId.has(parent.id) && parent.id !== 'lbx');
      if (match) navigate(match.id);
    }
  };
  const navigateOccurrence = (id: string) => {
    if (index.byId.has(id)) {
      navigate(id);
      return;
    }
    const active = toExplorerCatalog(database);
    const part = active.parts.find((item) => item.id === id);
    if (!part) return;
    setFilters({});
    setNavId(null);
    setConfigurationId('');
    setCatalog(active);
    setAssemblyId(part.parentId ?? 'lbx');
    setSelectedId(id);
    setHiddenIds([]);
    setIsolatedId(null);
    setHoveredId(null);
    setExplosion(0);
    setDetailOpen(true);
    setExpanded(new Set(['lbx', part.parentId ?? 'lbx']));
    window.history.pushState(
      null,
      '',
      createExplorerUrl({ assemblyId: part.parentId ?? 'lbx', partId: id }),
    );
  };
  const navigateNode = (node: NavigationNode) => {
    if (node.occurrenceId) {
      navigateOccurrence(node.occurrenceId);
      return;
    }
    // The renderer keeps its existing scope and original catalog parent relationships.
    navigate(node.scopeId, node.id);
    setExpanded(
      (previous) => new Set([...previous, ...navigationAncestors(navigation!, node.id), node.id]),
    );
  };
  const navigateParent = () => {
    if (selection?.kind === 'component') {
      const parent = selectionNode?.parentId && navigation?.byId.get(selectionNode.parentId);
      if (parent) {
        navigateNode(parent);
        return;
      }
      navigate(assembly.id);
      return;
    }
    const parent = activeNode?.parentId && navigation?.byId.get(activeNode.parentId);
    if (parent) navigateNode(parent);
    else navigate(assembly.parentId ?? catalog.motorcycleId);
  };
  const browseParts = (nodeId: string | null = presentationNode?.id ?? null) => {
    revealNode.current = nodeId;
    setRevealRequest((value) => value + 1);
    setQuery('');
    setNavOpen(true);
    if (compact) setDetailOpen(false);
    if (nodeId && navigation)
      setExpanded(
        (previous) => new Set([...previous, ...navigationAncestors(navigation, nodeId), nodeId]),
      );
  };
  useEffect(() => {
    if (!navigation) return;
    const node =
      navigation.byId.get(navId ?? '') ??
      (selectedId ? navigationForOccurrence(navigation, selectedId) : undefined);
    if (node)
      setExpanded(
        (previous) => new Set([...previous, ...navigationAncestors(navigation, node.id)]),
      );
  }, [navigation, navId, selectedId]);
  useEffect(() => {
    if (!navOpen || query) return;
    const frame = requestAnimationFrame(() => {
      const target = revealNode.current;
      revealNode.current = null;
      const row = target
        ? [...(navPanel.current?.querySelectorAll<HTMLElement>('.tree-row') ?? [])].find(
            (item) => item.dataset.navigationId === target,
          )
        : navPanel.current?.querySelector<HTMLElement>('.tree-row.active');
      row?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      if (target) row?.querySelector<HTMLButtonElement>('.tree-select')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedId, navId, navOpen, query, revealRequest]);
  function changeConfiguration(id: string) {
    const config = verifiedConfigurations.find((item) => item.id === id);
    setConfigurationId(config?.id ?? '');
    if (config) changeSourceFilter({ modelYear: config.modelYear });
    const url = new URL(window.location.href);
    if (config) url.searchParams.set('configuration', config.id);
    else url.searchParams.delete('configuration');
    window.history.replaceState(null, '', url.pathname + url.search);
  }
  const renderTree = (parentId: string, depth = 0): React.ReactNode =>
    getChildren(index, parentId).map((part) => {
      const children = getChildren(index, part.id);
      return (
        <li key={part.id}>
          <div
            className={`tree-row ${selectedId === part.id || (!selectedId && assemblyId === part.id) ? 'active' : ''} ${hiddenIds.includes(part.id) ? 'is-hidden' : ''}`}
            data-navigation-id={part.id}
            style={{ paddingLeft: 8 + depth * 15 }}
          >
            {children.length > 0 ? (
              <button
                className="tree-toggle"
                aria-label={`${expanded.has(part.id) ? 'Collapse' : 'Expand'} ${part.name}`}
                aria-expanded={expanded.has(part.id)}
                onClick={() => toggleExpanded(part.id)}
              >
                {expanded.has(part.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="tree-spacer" />
            )}
            <button
              className="tree-select"
              onClick={() => navigate(part.id)}
              onMouseEnter={() => setHoveredId(part.id)}
              onMouseLeave={() => setHoveredId(null)}
              aria-current={selectedId === part.id ? 'true' : undefined}
            >
              <span className="tree-label">{part.name}</span>
              {children.length > 0 && (
                <small aria-hidden="true">{children.length.toString().padStart(2, '0')}</small>
              )}
            </button>
            {part.kind === 'component' && (demoMode || mappedIds.has(part.id)) && (
              <button
                className="tree-visibility"
                aria-label={`${hiddenIds.includes(part.id) ? 'Show' : 'Hide'} ${part.name}`}
                aria-pressed={hiddenIds.includes(part.id)}
                onClick={() => toggleHidden(part.id)}
              >
                {hiddenIds.includes(part.id) ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            )}
          </div>
          {children.length > 0 && expanded.has(part.id) && (
            <ul>{renderTree(part.id, depth + 1)}</ul>
          )}
        </li>
      );
    });

  const detailActions = detail.kind === 'component' && hasGeometry && (
    <div className="detail-actions">
      <button
        aria-pressed={isolatedId === detail.id}
        onClick={() => {
          setIsolatedId(isolatedId === detail.id ? null : detail.id);
          setHiddenIds((previous) => previous.filter((id) => id !== detail.id));
        }}
      >
        <Focus size={16} />
        {isolatedId === detail.id ? 'Show assembly' : 'Isolate'}
      </button>
      <button
        aria-pressed={hiddenIds.includes(detail.id)}
        onClick={() => {
          setIsolatedId(null);
          toggleHidden(detail.id);
        }}
      >
        {hiddenIds.includes(detail.id) ? <Eye size={16} /> : <EyeOff size={16} />}
        {hiddenIds.includes(detail.id) ? 'Show part' : 'Hide part'}
      </button>
    </div>
  );

  return (
    <main className="explorer-shell explorer-ux">
      <header className="topbar" inert={compact && (navOpen || detailsVisible)}>
        <Link
          className="brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            navigate(catalog.motorcycleId);
          }}
          aria-label="Sur-Ron Parts Explorer home"
        >
          <span className="brand-icon">
            <Box size={24} strokeWidth={1.5} />
          </span>
          <span>
            SUR-RON<span className="brand-sub">PARTS EXPLORER</span>
          </span>
        </Link>
        <div className="header-model">LIGHT BEE X</div>
        <details className="workspace-tools">
          <summary>
            Tools <Settings2 size={16} />
          </summary>
          <div className="tools-menu">
            <Link href="/catalog">Catalog review</Link>
            <Link href={demoMode ? '/editor?demo=1' : '/editor'}>Model editor</Link>
            {!demoMode && <Link href="/?demo=1">Geometry demonstration</Link>}
            {demoMode && <Link href="/">OEM motorcycle explorer</Link>}
          </div>
        </details>
      </header>

      <div
        ref={workspace}
        className={`workspace ${navOpen ? 'with-navigation' : ''} ${detailOpen && !overview ? 'with-details' : ''}`}
      >
        {compact && (navOpen || (detailOpen && !overview)) && (
          <button
            className="panel-backdrop"
            aria-label="Dismiss open panel"
            tabIndex={-1}
            onClick={() => {
              setNavOpen(false);
              setDetailOpen(false);
            }}
          />
        )}
        <aside
          ref={navPanel}
          id="parts-navigation"
          hidden={!navOpen}
          className={`catalog-panel ${navOpen ? 'mobile-open' : ''}`}
          aria-label="Parts navigation"
          role={compact ? 'dialog' : undefined}
          aria-modal={compact && navOpen ? true : undefined}
          inert={compact && detailsVisible}
        >
          <div className="panel-heading">
            <span className="eyebrow">PARTS</span>
            <span className="count-tag">
              {navigation ? `${navigation.roots.length} systems` : catalog.parts.length - 1}
            </span>
            <button
              className="icon-button"
              aria-label="Close parts navigation"
              onClick={() => {
                setNavOpen(false);
                partsButton.current?.focus();
              }}
            >
              <X size={18} />
            </button>
          </div>
          <div className="search-box">
            <Search size={16} />
            <input
              ref={search}
              aria-label="Search parts"
              placeholder="Part name or OEM number"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <button aria-label="Clear search" onClick={() => setQuery('')}>
                <X size={15} />
              </button>
            ) : (
              <kbd>/</kbd>
            )}
          </div>
          {!demoMode && !localWorkspace && (
            <details
              className="catalog-filter-disclosure"
              open={!!filters.modelYear || !!filters.sourceId || undefined}
            >
              <summary>
                Catalog filters{(filters.modelYear || filters.sourceId) && <span> · active</span>}
              </summary>
              <div className="catalog-filters">
                <label>
                  Source year
                  <select
                    aria-label="Catalog model year"
                    value={filters.modelYear ?? ''}
                    onChange={(event) =>
                      changeSourceFilter({
                        modelYear:
                          event.target.value === 'unknown'
                            ? 'unknown'
                            : event.target.value
                              ? Number(event.target.value)
                              : undefined,
                      })
                    }
                  >
                    <option value="">All source years</option>
                    {availableModelYears(database).map((year) => (
                      <option key={year} value={year}>
                        MY{year}
                      </option>
                    ))}
                    <option value="unknown">Year unspecified</option>
                  </select>
                </label>
                <label>
                  Source document
                  <select
                    aria-label="Catalog source"
                    value={filters.sourceId ?? ''}
                    onChange={(event) =>
                      changeSourceFilter({ sourceId: event.target.value || undefined })
                    }
                  >
                    <option value="">All source documents</option>
                    {database.sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.title}
                      </option>
                    ))}
                  </select>
                </label>
                {verifiedConfigurations.length > 0 && (
                  <select
                    aria-label="Verified motorcycle configuration"
                    value={configurationId}
                    onChange={(event) => changeConfiguration(event.target.value)}
                  >
                    <option value="">Installed configuration unconfirmed</option>
                    {verifiedConfigurations.map((config) => (
                      <option key={config.id} value={config.id}>
                        {config.name} · MY{config.modelYear}
                      </option>
                    ))}
                  </select>
                )}
                <small>
                  Source years filter references; they do not confirm installed parts or fitment.
                </small>
              </div>
            </details>
          )}
          <button
            className={`motorcycle-button ${overview ? 'active' : ''}`}
            aria-current={overview ? 'true' : undefined}
            onClick={() => navigate(catalog.motorcycleId)}
          >
            <Layers3 size={18} />
            <span>Complete motorcycle</span>
          </button>
          <div className="catalog-scroll">
            {query.trim() ? (
              <div className="search-results">
                <p className="eyebrow">
                  {results.length > 100 ? '100+' : results.length}{' '}
                  {navigation ? 'REFERENCE MATCHES' : 'MATCHING PARTS'}
                </p>
                {results.length ? (
                  results.slice(0, 100).map((part) => (
                    <button
                      key={part.id}
                      className="search-result"
                      onClick={() => navigate(part.id)}
                    >
                      <span>
                        {part.name}
                        <small>
                          {part.oemNumber ??
                            part.genericDesignation ??
                            index.byId.get(part.parentId ?? '')?.name}
                          {!demoMode && part.sources[0] && (
                            <>
                              {' '}
                              · {part.sources[0].document.split(' — ')[0]} ·{' '}
                              {part.sources[0].item ?? 'Unnumbered row'}
                            </>
                          )}
                        </small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  ))
                ) : (
                  <p className="empty-state">
                    No matching parts. Try a part name or OEM number
                    {filters.modelYear || filters.sourceId ? ', or clear the catalog filters' : ''}.
                  </p>
                )}
                {results.length > 100 && (
                  <p className="muted">Showing the first 100. Refine your search.</p>
                )}
              </div>
            ) : (
              <ul className="parts-tree">
                {navigation ? (
                  <CuratedPartsTree
                    nodes={navigation.roots}
                    expanded={expanded}
                    activeId={presentationNode?.id ?? null}
                    selectedId={selectedId}
                    onToggle={toggleExpanded}
                    onNavigate={navigateNode}
                    hiddenIds={hiddenIds}
                    mappedIds={mappedIds}
                    onToggleHidden={toggleHidden}
                    onHover={setHoveredId}
                  />
                ) : (
                  renderTree(catalog.motorcycleId)
                )}
              </ul>
            )}
          </div>
          <div className="catalog-footer">
            {navigation ? (
              <Link className="inline-link" href="/catalog">
                Complete OEM reference catalog
              </Link>
            ) : (
              <small className="muted">Demonstration parts · not mechanical specifications</small>
            )}
          </div>
        </aside>

        <section
          className="viewer-panel"
          aria-label="Interactive motorcycle viewer"
          inert={compact && (navOpen || detailsVisible)}
        >
          <div className="viewer-bar">
            <button
              ref={partsButton}
              className="toolbar-button"
              aria-expanded={navOpen}
              aria-controls="parts-navigation"
              onClick={() => {
                setNavOpen((value) => !value);
                if (compact) setDetailOpen(false);
              }}
            >
              <Menu size={18} />
              Parts
            </button>
            {!overview && (
              <button
                className="icon-button"
                aria-label="Parent assembly"
                title="Back to parent assembly"
                onClick={navigateParent}
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <nav className="breadcrumbs" aria-label="Assembly breadcrumb">
              {navigationPath.length ? (
                <>
                  <span>
                    <button onClick={() => navigate(catalog.motorcycleId)}>Light Bee X</button>
                  </span>
                  {navigationPath.map((node) => (
                    <span key={node.id}>
                      <ChevronRight size={12} />
                      <button
                        onClick={() => navigateNode(node)}
                        aria-current={node.id === presentationNode?.id ? 'location' : undefined}
                      >
                        {node.name}
                      </button>
                    </span>
                  ))}
                </>
              ) : (
                breadcrumbs.map((part, i) => (
                  <span key={part.id}>
                    {i > 0 && <ChevronRight size={12} />}
                    <button
                      onClick={() => navigate(part.id)}
                      aria-current={i === breadcrumbs.length - 1 ? 'location' : undefined}
                    >
                      {part.kind === 'motorcycle' ? 'Light Bee X' : part.name}
                    </button>
                  </span>
                ))
              )}
            </nav>
            <button
              ref={detailsButton}
              className="toolbar-button"
              disabled={overview}
              aria-expanded={detailOpen && !overview}
              aria-controls="component-details"
              onClick={() => {
                setDetailOpen((value) => !value);
                if (compact) setNavOpen(false);
              }}
            >
              Details
            </button>
          </div>
          <h1 className="sr-only">
            {overview ? 'Sur-Ron Light Bee X' : (activeNode?.name ?? assembly.name)}
          </h1>
          <div className={`canvas-wrap ${!overview && hasGeometry ? 'assembly-canvas' : ''}`}>
            {showViewer ? (
              <Viewer
                catalog={sceneCatalog}
                assemblyId={assemblyId}
                selectedId={selectedId}
                hoveredId={hoveredId}
                explosion={explosion}
                hiddenIds={hiddenIds}
                isolatedId={isolatedId}
                resetToken={resetToken}
                onSelect={selectGeometry}
                onHover={setHoveredId}
                onDiagnostics={setDiagnostics}
                asset={localAsset ?? assetEntry?.asset}
                mapping={activeMapping}
              />
            ) : (
              <div className="geometry-empty" data-testid="geometry-unassigned">
                <Box size={30} strokeWidth={1} />
                <h2>No 3D representation assigned</h2>
                <p>{activeNode?.name ?? detail.name} is available in the parts catalog.</p>
                <button
                  className="text-button"
                  onClick={() => {
                    setDetailOpen(true);
                    if (compact) setNavOpen(false);
                  }}
                >
                  View part information <ChevronRight size={15} />
                </button>
                <details>
                  <summary>Model options</summary>
                  <Link href="/editor">Open model mapping editor</Link>
                  <Link href="/?demo=1">Explore the geometry demonstration</Link>
                </details>
              </div>
            )}
          </div>
          <div className="viewer-tools">
            <button
              className="icon-button"
              aria-label="Reset camera"
              title="Reset camera (R)"
              disabled={!showViewer}
              onClick={() => setResetToken((value) => value + 1)}
            >
              <RotateCcw size={18} />
            </button>
            <details className="viewer-options">
              <summary>Viewer options</summary>
              <div
                className="tools-menu"
                onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
              >
                <button
                  onClick={() => {
                    if (document.fullscreenElement) void document.exitFullscreen();
                    else
                      void workspace.current
                        ?.requestFullscreen()
                        .catch(() => setNotice('Fullscreen is unavailable in this browser.'));
                  }}
                >
                  Toggle fullscreen <Expand size={16} />
                </button>
                <button
                  aria-expanded={helpOpen}
                  onClick={() => {
                    setHelpOpen((value) => !value);
                    setStatsOpen(false);
                  }}
                >
                  Viewer help <CircleHelp size={16} />
                </button>
                <button
                  aria-expanded={statsOpen}
                  onClick={() => {
                    setStatsOpen((value) => !value);
                    setHelpOpen(false);
                  }}
                >
                  Performance diagnostics
                </button>
              </div>
            </details>
          </div>
          {helpOpen && (
            <div className="viewer-popover help-popover">
              <strong>Viewer controls</strong>
              <button
                className="icon-button"
                aria-label="Close viewer help"
                onClick={() => setHelpOpen(false)}
              >
                <X size={16} />
              </button>
              <p>Drag to rotate · Scroll to zoom · Right-drag to pan.</p>
              <p>Touch: one finger to rotate, two to pan and zoom.</p>
              <p>
                Use Tab and Enter in the parts list. <kbd>R</kbd> resets the camera; <kbd>/</kbd>{' '}
                opens search; <kbd>Esc</kbd> closes panels.
              </p>
            </div>
          )}
          {statsOpen && (
            <div className="viewer-popover stats-popover">
              <strong>Scene diagnostics</strong>
              <button
                className="icon-button"
                aria-label="Close performance diagnostics"
                onClick={() => setStatsOpen(false)}
              >
                <X size={16} />
              </button>
              <dl>
                <dt>Visible meshes</dt>
                <dd>{diagnostics?.meshes ?? '—'}</dd>
                <dt>Triangles / frame</dt>
                <dd>{diagnostics?.triangles.toLocaleString() ?? '—'}</dd>
                <dt>Draw calls / frame</dt>
                <dd>{diagnostics?.drawCalls ?? '—'}</dd>
                <dt>Geometries</dt>
                <dd>{diagnostics?.geometries ?? '—'}</dd>
                <dt>Textures</dt>
                <dd>{diagnostics?.textures ?? '—'}</dd>
              </dl>
              <p>Demand rendering · Y up · metres</p>
            </div>
          )}
          {assetMessage && (
            <div className="asset-notice" role="status">
              {assetMessage}
            </div>
          )}
          <div className="stage-bottom">
            {(isolatedId || hiddenIds.length > 0) && (
              <div className="visibility-status">
                {isolatedId && (
                  <button
                    className="isolation-banner"
                    aria-label="Exit isolation"
                    onClick={() => setIsolatedId(null)}
                  >
                    <Focus size={15} />
                    Isolating {index.byId.get(isolatedId)?.name}
                    <X size={15} />
                  </button>
                )}
                {hiddenIds.length > 0 && (
                  <button className="text-button" onClick={() => setHiddenIds([])}>
                    <Eye size={15} />
                    Show {hiddenIds.length} hidden
                  </button>
                )}
              </div>
            )}
            {!overview && hasGeometry ? (
              <div className="explosion-controls">
                <div className="explosion-title">
                  <strong>Exploded view</strong>
                  <output htmlFor="explosion-range">{Math.round(explosion * 100)}%</output>
                </div>
                <div className="explosion-slider">
                  <button
                    aria-label="Reassemble"
                    aria-pressed={explosion === 0}
                    onClick={() => adjustExplosion(0)}
                  >
                    Assembled
                  </button>
                  <input
                    id="explosion-range"
                    aria-label="Explosion amount"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={explosion}
                    onChange={(event) => adjustExplosion(Number(event.target.value))}
                  />
                  <button aria-pressed={explosion === 1} onClick={() => adjustExplosion(1)}>
                    Exploded
                  </button>
                </div>
              </div>
            ) : null}
            {(demoMode || showDemonstration) && (
              <small className="model-status">
                Demonstration geometry · not mechanically accurate
              </small>
            )}
          </div>
        </section>

        <aside
          ref={detailPanel}
          id="component-details"
          hidden={!detailOpen || overview}
          className={`detail-panel ${detailOpen && !overview ? 'mobile-open' : ''}`}
          aria-label="Component information"
          role={compact ? 'dialog' : undefined}
          aria-modal={compact && detailOpen && !overview ? true : undefined}
          inert={compact && navOpen}
        >
          <div className="panel-heading">
            <span className="eyebrow">
              {detail.kind === 'component' ? 'PART DETAILS' : 'ASSEMBLY DETAILS'}
            </span>
            <button
              className="icon-button share-button"
              aria-label="Copy share link"
              onClick={() => void share()}
            >
              {copied ? <Check size={17} /> : <Link2 size={17} />}
            </button>
            <button
              className="icon-button"
              aria-label="Close component details"
              onClick={() => {
                setDetailOpen(false);
                detailsButton.current?.focus();
              }}
            >
              <X size={18} />
            </button>
          </div>
          <div className="detail-scroll">
            <nav className="detail-breadcrumbs" aria-label="Part hierarchy">
              {navigationPath.length ? (
                <>
                  <button onClick={() => navigate(catalog.motorcycleId)}>Motorcycle</button>
                  {navigationPath.slice(0, -1).map((node) => (
                    <button key={node.id} onClick={() => navigateNode(node)}>
                      {node.name}
                    </button>
                  ))}
                </>
              ) : (
                detailBreadcrumbs.slice(0, -1).map((part) => (
                  <button key={part.id} onClick={() => navigate(part.id)}>
                    {part.kind === 'motorcycle' ? 'Motorcycle' : part.name}
                  </button>
                ))
              )}
            </nav>
            {!demoMode && database.occurrences.some((occurrence) => occurrence.id === detail.id) ? (
              <OemDetails
                key={detail.id}
                database={database}
                occurrenceId={detail.id}
                hasGeometry={hasGeometry}
                actions={detailActions}
                onNavigate={navigateOccurrence}
              />
            ) : navigation && (activeNode || isFull) ? (
              <CuratedAssemblyDetails
                key={activeNode?.id ?? 'overview'}
                node={activeNode ?? null}
                roots={navigation.roots}
                database={database}
                onNavigate={navigateNode}
                onSelectOccurrence={navigateOccurrence}
                onBrowseParts={browseParts}
              />
            ) : !demoMode && !localWorkspace ? (
              <>
                <h2>{detail.name}</h2>
                <details className="detail-section oem-conflict">
                  <summary>OEM reference parts · {childParts.length}</summary>
                  <ul className="component-list">
                    {childParts.map((part) => (
                      <li key={part.id}>
                        <button onClick={() => navigate(part.id)}>
                          <span>
                            {part.name}
                            <small className="oem-list-number">
                              {part.oemNumber}
                              {part.quantity !== null && ` · Qty ${part.quantity}`}
                              {part.sources[0]?.item && ` · ${part.sources[0].item}`}
                            </small>
                          </span>
                          <ChevronRight size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
                <Link className="inline-link" href="/catalog">
                  Complete OEM reference catalog
                </Link>
              </>
            ) : (
              <>
                <PartDetails
                  key={detail.id}
                  part={detail}
                  actions={detailActions}
                  parentName={index.byId.get(detail.parentId ?? '')?.name}
                  onNavigate={navigate}
                />
                {childParts.length > 0 && (
                  <button className="text-button" onClick={() => browseParts()}>
                    Browse components <ChevronRight size={15} />
                  </button>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
      <div className="sr-only" aria-live="polite">
        {notice}
      </div>
    </main>
  );
}
