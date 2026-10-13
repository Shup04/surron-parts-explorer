'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Crosshair,
  Expand,
  Eye,
  EyeOff,
  Focus,
  Layers3,
  Link2,
  Menu,
  MousePointer2,
  RotateCcw,
  Search,
  Settings2,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { demoCatalog } from '@/data/catalog';
import {
  buildCatalogIndex,
  getAncestors,
  getChildren,
  getDescendants,
  searchParts,
} from '@/core/catalog';
import { createExplorerUrl, parseExplorerUrl } from '@/core/navigation';
import type {
  AssetDefinition,
  Catalog,
  MappingConfig,
  Part,
  ViewerDiagnostics,
} from '@/core/types';
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
  const [catalog, setCatalog] = useState<Catalog>(demoCatalog);
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState('');
  const [diagnostics, setDiagnostics] = useState<ViewerDiagnostics>();
  const stage = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const autoExplosion = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = useMemo(() => buildCatalogIndex(catalog), [catalog]);
  const assembly = index.byId.get(assemblyId) ?? index.byId.get(catalog.motorcycleId)!;
  const selection = selectedId ? index.byId.get(selectedId) : undefined;
  const detail = selection ?? assembly;
  const isFull = assemblyId === catalog.motorcycleId;
  const results = useMemo(
    () => (query.trim() ? searchParts(index, query, 101) : []),
    [index, query],
  );
  const breadcrumbs = [...getAncestors(index, assembly.id), assembly];
  const childParts = getChildren(index, detail.id);
  const detailBreadcrumbs = [...getAncestors(index, detail.id), detail];
  const featuredAssembly = catalog.parts.find(
    (part) =>
      part.kind === 'assembly' &&
      getChildren(index, part.id).some((child) => child.kind === 'component'),
  );
  const assetEntry =
    assetRegistry.find((entry) => entry.asset.assemblyId === assemblyId) ??
    assetRegistry.find((entry) => entry.asset.assemblyId === catalog.motorcycleId);

  useEffect(() => {
    let disposed = false;
    let release: (() => void) | undefined;
    async function initialize() {
      let activeCatalog = demoCatalog;
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
              `${error instanceof Error ? error.message : 'Could not open local model.'} Showing the demonstration.`,
            );
        }
      }
      if (disposed) return;
      const state = parseExplorerUrl(window.location.search, activeCatalog);
      setAssemblyId(state.assemblyId);
      setSelectedId(state.partId);
      setDetailOpen(
        !!state.partId &&
          activeCatalog.parts.find((part) => part.id === state.partId)?.kind === 'component',
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
      const state = parseExplorerUrl(window.location.search, catalog);
      setAssemblyId(state.assemblyId);
      setSelectedId(state.partId);
      setHiddenIds([]);
      setIsolatedId(null);
      setExplosion(0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [catalog]);

  const navigate = useCallback(
    (partId: string) => {
      const part = index.byId.get(partId);
      if (!part) return;
      const nextAssembly =
        part.kind === 'component' ? (part.parentId ?? catalog.motorcycleId) : part.id;
      const nextPart = part.kind === 'motorcycle' ? null : part.id;
      const url = createExplorerUrl(
        { assemblyId: nextAssembly, partId: nextPart },
        catalog.motorcycleId,
      );
      const target = new URL(url, window.location.origin);
      if (localWorkspace) target.searchParams.set('workspace', 'local');
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
      setIsolatedId(null);
      setHiddenIds([]);
      setHoveredId(null);
      if (nextAssembly !== assemblyId) setExplosion(0);
      setNavOpen(false);
      setDetailOpen(part.kind === 'component');
      setNotice(`${part.name} selected`);
    },
    [assemblyId, catalog.motorcycleId, index, localWorkspace],
  );

  useEffect(() => {
    if (isFull) return;
    autoExplosion.current = setTimeout(() => {
      setExplosion(1);
      autoExplosion.current = null;
    }, 650);
    return () => {
      if (autoExplosion.current) clearTimeout(autoExplosion.current);
    };
  }, [assemblyId, isFull]);

  const adjustExplosion = (amount: number) => {
    if (autoExplosion.current) clearTimeout(autoExplosion.current);
    autoExplosion.current = null;
    setExplosion(amount);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      )
        return;
      if (event.key === '/') {
        event.preventDefault();
        setNavOpen(true);
        requestAnimationFrame(() => search.current?.focus());
      }
      if (event.key === 'Escape') {
        setNavOpen(false);
        setDetailOpen(false);
        setHelpOpen(false);
        setIsolatedId(null);
      }
      if (event.key.toLowerCase() === 'r') setResetToken((v) => v + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
  const renderTree = (parentId: string, depth = 0): React.ReactNode =>
    getChildren(index, parentId).map((part) => {
      const children = getChildren(index, part.id);
      return (
        <li key={part.id}>
          <div
            className={`tree-row ${selectedId === part.id || (!selectedId && assemblyId === part.id) ? 'active' : ''}`}
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
              <span className={`part-dot ${part.kind}`} />
              <span>{part.name}</span>
              {children.length > 0 && <small>{children.length.toString().padStart(2, '0')}</small>}
            </button>
          </div>
          {children.length > 0 && expanded.has(part.id) && (
            <ul>{renderTree(part.id, depth + 1)}</ul>
          )}
        </li>
      );
    });

  return (
    <main className="explorer-shell">
      <header className="topbar">
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
        <div className="header-model">
          <span className="status-dot" />
          LIGHT BEE X<span className="header-divider" />
          STOCK EXPLORER
        </div>
        <Link href="/editor" className="editor-link">
          <Settings2 size={16} />
          <span>Model editor</span>
          <ArrowUpRight size={14} />
        </Link>
      </header>

      <div className="workspace">
        <aside
          className={`catalog-panel ${navOpen ? 'mobile-open' : ''}`}
          aria-label="Parts navigation"
        >
          <div className="panel-heading">
            <span className="eyebrow">ASSEMBLY INDEX</span>
            <button
              className="mobile-only icon-button"
              aria-label="Close parts navigation"
              onClick={() => setNavOpen(false)}
            >
              <X size={18} />
            </button>
            <span className="count-tag">{catalog.parts.length - 1}</span>
          </div>
          <div className="search-box">
            <Search size={16} />
            <input
              ref={search}
              aria-label="Search parts"
              placeholder="Find a part or OEM number"
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
          <button
            className={`motorcycle-button ${isFull ? 'active' : ''}`}
            onClick={() => navigate(catalog.motorcycleId)}
          >
            <Layers3 size={18} />
            <span>
              Complete motorcycle<small>Sur-Ron Light Bee X</small>
            </span>
            <ChevronRight size={16} />
          </button>
          <div className="catalog-scroll">
            {query.trim() ? (
              <div className="search-results">
                <p className="eyebrow">{results.length} MATCHING PARTS</p>
                {results.length ? (
                  results.slice(0, 100).map((part) => (
                    <button
                      key={part.id}
                      className="search-result"
                      onClick={() => {
                        navigate(part.id);
                        setQuery('');
                      }}
                    >
                      <Box size={16} />
                      <span>
                        {part.name}
                        <small>
                          {part.oemNumber ??
                            part.genericDesignation ??
                            index.byId.get(part.parentId ?? '')?.name ??
                            'Motorcycle'}
                        </small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  ))
                ) : (
                  <p className="empty-state">
                    No matching parts. Try an assembly name or a verified designation.
                  </p>
                )}
                {results.length > 100 && (
                  <p className="muted">Showing the first 100. Refine your search.</p>
                )}
              </div>
            ) : (
              <ul className="parts-tree">{renderTree(catalog.motorcycleId)}</ul>
            )}
          </div>
          <div className="catalog-footer">
            <span className="verification-dot" />
            <div>
              <strong>Geometry demonstration</strong>
              <p>Stock geometry and OEM data await your verified source files.</p>
            </div>
          </div>
        </aside>

        <section className="viewer-panel" aria-label="Interactive motorcycle viewer" ref={stage}>
          <div className="viewer-title">
            <nav className="breadcrumbs" aria-label="Assembly breadcrumb">
              {breadcrumbs.map((part, i) => (
                <span key={part.id}>
                  {i > 0 && <ChevronRight size={12} />}
                  <button onClick={() => navigate(part.id)}>
                    {part.kind === 'motorcycle' ? 'Light Bee X' : part.name}
                  </button>
                </span>
              ))}
            </nav>
            <div className="viewer-heading">
              <div>
                <div className="eyebrow">
                  {isFull ? 'EXPLORE EVERY CONNECTION' : 'ASSEMBLY WORKBENCH'}
                </div>
                <h1>{isFull ? 'The machine, piece by piece.' : assembly.name}</h1>
              </div>
              <span className="demo-pill">
                {localAsset || assetEntry ? 'IMPORTED MODEL' : 'SYNTHETIC MODEL'}
              </span>
            </div>
          </div>
          <div className="canvas-wrap">
            <Viewer
              catalog={catalog}
              assemblyId={assemblyId}
              selectedId={selectedId}
              hoveredId={hoveredId}
              explosion={explosion}
              hiddenIds={hiddenIds}
              isolatedId={isolatedId}
              resetToken={resetToken}
              onSelect={navigate}
              onHover={setHoveredId}
              onDiagnostics={setDiagnostics}
              asset={localAsset ?? assetEntry?.asset}
              mapping={mapping ?? assetEntry?.mapping}
            />
          </div>
          {hoveredId && index.byId.has(hoveredId) && (
            <div className="hover-label">
              <span className="status-dot" />
              {index.byId.get(hoveredId)!.name}
              <small>Click to inspect</small>
            </div>
          )}
          {assetMessage && (
            <div className="asset-notice" role="status">
              {assetMessage}
            </div>
          )}
          <div className="viewer-tools">
            <button
              className="icon-button"
              aria-label="Reset camera"
              title="Reset camera (R)"
              onClick={() => setResetToken((v) => v + 1)}
            >
              <RotateCcw size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Toggle fullscreen"
              title="Fullscreen"
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                else
                  void stage.current
                    ?.requestFullscreen()
                    .catch(() => setNotice('Fullscreen is unavailable in this browser.'));
              }}
            >
              <Expand size={18} />
            </button>
            <span />
            <button
              className={`icon-button ${helpOpen ? 'active' : ''}`}
              aria-label="Viewer help"
              aria-expanded={helpOpen}
              onClick={() => setHelpOpen((v) => !v)}
            >
              <CircleHelp size={18} />
            </button>
            <button
              className={`icon-button ${statsOpen ? 'active' : ''}`}
              aria-label="Performance diagnostics"
              aria-expanded={statsOpen}
              onClick={() => setStatsOpen((v) => !v)}
            >
              <SlidersHorizontal size={18} />
            </button>
          </div>
          {helpOpen && (
            <div className="viewer-popover help-popover">
              <strong>At your fingertips</strong>
              <p>
                Drag to orbit · Scroll to zoom
                <br />
                Right-drag to pan
              </p>
              <p>Touch: one finger to orbit, two to pan and pinch to zoom.</p>
              <p>
                Use the parts list with Tab and Enter. <kbd>R</kbd> resets the camera; <kbd>/</kbd>{' '}
                opens search; <kbd>Esc</kbd> closes panels.
              </p>
            </div>
          )}
          {statsOpen && (
            <div className="viewer-popover stats-popover">
              <strong>Scene diagnostics</strong>
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
              <p>
                Demand rendering · Adaptive pixel ratio
                <br />
                Counts update while the scene renders.
              </p>
            </div>
          )}
          {isolatedId && (
            <button className="isolation-banner" onClick={() => setIsolatedId(null)}>
              <Focus size={15} />
              Isolating {index.byId.get(isolatedId)?.name}
              <X size={15} />
            </button>
          )}
          <div className="stage-bottom">
            {isFull ? (
              <div className="explore-hint">
                <MousePointer2 size={19} />
                <span>
                  Select an assembly to see how it comes together.
                  <small>Rotate, inspect, and explore from the inside out.</small>
                </span>
                <>
                  {featuredAssembly && (
                    <button className="text-button" onClick={() => navigate(featuredAssembly.id)}>
                      Explore {featuredAssembly.name.replace(/ assembly$/i, '').toLowerCase()}{' '}
                      <ArrowUpRight size={16} />
                    </button>
                  )}
                </>
              </div>
            ) : (
              <div className="explosion-controls">
                <div className="explosion-title">
                  <Layers3 size={19} />
                  <div>
                    <strong>Exploded view</strong>
                    <small>
                      {localAsset || assetEntry
                        ? 'Configured vectors; unmapped vectors use approximate layout'
                        : 'Demonstration layout · not mechanically verified'}
                    </small>
                  </div>
                  <output htmlFor="explosion-range">
                    {Math.round(explosion * 100)}
                    <span>%</span>
                  </output>
                </div>
                <div className="explosion-slider">
                  <button onClick={() => adjustExplosion(0)} aria-label="Reassemble">
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
                    onChange={(e) => adjustExplosion(Number(e.target.value))}
                  />
                  <button onClick={() => adjustExplosion(1)}>Exploded</button>
                </div>
                <div className="explosion-footer">
                  <button onClick={() => navigate(assembly.parentId ?? catalog.motorcycleId)}>
                    <ArrowLeft size={14} />
                    Parent assembly
                  </button>
                  <button
                    onClick={() => {
                      setHiddenIds([]);
                      setIsolatedId(null);
                    }}
                  >
                    {hiddenIds.length
                      ? `Show ${hiddenIds.length} hidden`
                      : 'All components visible'}
                    <Eye size={14} />
                  </button>
                </div>
              </div>
            )}
            <div className="viewer-footnote">
              <span>
                <span className="status-dot" />
                {isFull
                  ? 'MOTORCYCLE OVERVIEW'
                  : `${getDescendants(index, assemblyId).length} CATALOG COMPONENTS`}
              </span>
              <span>
                Y UP <span className="muted">/</span> METRES
              </span>
            </div>
          </div>
          <div className="mobile-controls">
            <button
              onClick={() => {
                setNavOpen(true);
                setDetailOpen(false);
              }}
            >
              <Menu size={18} />
              Parts
            </button>
            <button
              onClick={() => {
                setDetailOpen((v) => !v);
                setNavOpen(false);
              }}
            >
              <Box size={18} />
              Details
            </button>
          </div>
        </section>

        <aside
          className={`detail-panel ${detailOpen ? 'mobile-open' : ''}`}
          aria-label="Component information"
        >
          <div className="panel-heading">
            <span className="eyebrow">
              {detail.kind === 'component' ? 'COMPONENT DETAILS' : 'ASSEMBLY DETAILS'}
            </span>
            <button
              className="icon-button mobile-only"
              aria-label="Close component details"
              onClick={() => setDetailOpen(false)}
            >
              <X size={18} />
            </button>
            <button
              className="icon-button share-button"
              aria-label="Copy share link"
              onClick={() => void share()}
            >
              {copied ? <Check size={17} /> : <Link2 size={17} />}
            </button>
          </div>
          <div className="detail-scroll">
            <nav className="detail-breadcrumbs" aria-label="Part hierarchy">
              {detailBreadcrumbs.map((part) => (
                <button key={part.id} onClick={() => navigate(part.id)}>
                  {part.kind === 'motorcycle' ? 'Motorcycle' : part.name}
                </button>
              ))}
            </nav>
            <div className="part-emblem">
              <Box size={36} strokeWidth={1} />
              <span>
                {detail.kind === 'component' ? 'COMPONENT' : 'ASSEMBLY'}
                <small>{detail.id}</small>
              </span>
            </div>
            <h2>{detail.name}</h2>
            <span
              className={`verification-badge ${detail.verification === 'mechanically-verified' ? 'verified' : ''}`}
            >
              <span />
              {detail.verification.replaceAll('-', ' ')}
            </span>
            <p className="part-description">{detail.description}</p>
            <div className="detail-actions">
              <button
                onClick={() => {
                  setIsolatedId(isolatedId === detail.id ? null : detail.id);
                  setHiddenIds((v) => v.filter((id) => id !== detail.id));
                }}
                className={isolatedId === detail.id ? 'active' : ''}
              >
                <Focus size={16} />
                {isolatedId === detail.id ? 'Show assembly' : 'Isolate'}
              </button>
              <button
                onClick={() => {
                  setResetToken((v) => v + 1);
                }}
              >
                <Crosshair size={16} />
                Focus
              </button>
            </div>
            <div className="detail-section">
              <h3>Identification</h3>
              <dl>
                <dt>OEM part number</dt>
                <dd>{detail.oemNumber ?? <span className="unknown">Unknown</span>}</dd>
                <dt>Generic designation</dt>
                <dd>{detail.genericDesignation ?? <span className="unknown">Unverified</span>}</dd>
                <dt>Quantity in assembly</dt>
                <dd>{detail.quantity ?? <span className="unknown">Unconfirmed</span>}</dd>
                <dt>Material</dt>
                <dd>{detail.material ?? <span className="unknown">Unknown</span>}</dd>
                <dt>Parent assembly</dt>
                <dd>
                  {detail.parentId ? (
                    <button className="inline-link" onClick={() => navigate(detail.parentId!)}>
                      {index.byId.get(detail.parentId)?.name}
                    </button>
                  ) : (
                    'Motorcycle root'
                  )}
                </dd>
              </dl>
            </div>
            <div className="detail-section">
              <h3>Specifications & dimensions</h3>
              {Object.keys(detail.specifications).length || detail.dimensions.length ? (
                <dl>
                  {Object.entries(detail.specifications).map(([key, value]) => (
                    <div className="definition-pair" key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                  {detail.dimensions.map((dim, i) => (
                    <div className="definition-pair" key={i}>
                      <dt>{dim.label}</dt>
                      <dd>
                        {dim.value} {dim.unit}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="muted">
                  Awaiting verified source information. Geometry is not a measurement reference.
                </p>
              )}
            </div>
            {childParts.length > 0 && (
              <div className="detail-section">
                <h3>
                  Inside this assembly <span>{childParts.length}</span>
                </h3>
                <ul className="component-list">
                  {childParts.map((part) => (
                    <li key={part.id}>
                      <button onClick={() => navigate(part.id)}>
                        <span className="part-dot" />
                        <span>{part.name}</span>
                        <ChevronRight size={13} />
                      </button>
                      <button
                        aria-label={`${hiddenIds.includes(part.id) ? 'Show' : 'Hide'} ${part.name}`}
                        onClick={() => toggleHidden(part.id)}
                      >
                        {hiddenIds.includes(part.id) ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <>
              {detail.images.length > 0 && (
                <div className="detail-section part-images">
                  {detail.images
                    .filter((image) => /^(https?:\/\/|\/(?!\/))/.test(image.url))
                    .map((image) => (
                      <figure key={image.url}>
                        <img src={image.url} alt={image.alt} loading="lazy" />
                        <figcaption>{image.alt}</figcaption>
                      </figure>
                    ))}
                </div>
              )}
            </>
            <div className="detail-section">
              <h3>Source documentation</h3>
              {detail.sources.length ? (
                detail.sources.map((source, i) => (
                  <div className="source-card" key={i}>
                    <strong>{source.document}</strong>
                    <p>
                      {[
                        source.page && `Page ${source.page}`,
                        source.diagram && `Diagram ${source.diagram}`,
                        source.item && `Item ${source.item}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {source.url && /^https?:\/\//.test(source.url) && (
                      <a href={source.url} target="_blank" rel="noreferrer">
                        Open source <ArrowUpRight size={12} />
                      </a>
                    )}
                    {source.notes && <p>{source.notes}</p>}
                  </div>
                ))
              ) : (
                <p className="muted">
                  No factory drawing linked. OEM numbers and fitment remain unverified.
                </p>
              )}
            </div>
            <div className="detail-section">
              <h3>Compatibility</h3>
              {detail.compatibility.length ? (
                detail.compatibility.map((fit, i) => (
                  <p className="muted" key={i}>
                    {fit.model} · {fit.years.length ? fit.years.join(', ') : 'Years unknown'}
                    <br />
                    {fit.verification.replaceAll('-', ' ')}
                  </p>
                ))
              ) : (
                <p className="muted">No confirmed model or model-year fitment.</p>
              )}
              {detail.alternatives.length > 0 && (
                <>
                  <h3>Cross-referenced alternatives</h3>
                  {detail.alternatives.map((alt) => (
                    <p className="muted" key={alt.id}>
                      {alt.id} · {alt.relation.replaceAll('-', ' ')}
                      <br />
                      {alt.notes}
                    </p>
                  ))}
                </>
              )}
            </div>
            <div className="data-note">
              <CircleHelp size={16} />
              <p>
                Identification before assumption.
                <br />
                Only sourced, verified data belongs on a real build.
              </p>
            </div>
          </div>
        </aside>
      </div>
      <footer className="app-footer">
        <span>
          STOCK EXPLORER <span className="muted">/</span> LBX
        </span>
        <span>Demonstration geometry · No verified OEM catalog supplied</span>
        <Link href="/editor">
          LOCAL MODEL WORKBENCH <ArrowUpRight size={12} />
        </Link>
      </footer>
      <div className="sr-only" aria-live="polite">
        {notice}
      </div>
    </main>
  );
}
