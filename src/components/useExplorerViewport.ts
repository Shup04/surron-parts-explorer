'use client';

import { useCallback, useEffect, useRef } from 'react';

/** Keep the workbench above the software keyboard without disabling browser zoom. */
export function useExplorerViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    root.classList.add('explorer-active');
    const resize = () => {
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
      root.style.setProperty('--explorer-height', `${viewport?.height ?? window.innerHeight}px`);
      root.style.setProperty('--explorer-top', `${viewport?.offsetTop ?? 0}px`);
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      window.removeEventListener('resize', resize);
      root.classList.remove('explorer-active');
      root.style.removeProperty('--explorer-height');
      root.style.removeProperty('--explorer-top');
    };
  }, []);
}

type ExplorerPanel = 'parts' | 'details';
interface PanelEntry {
  key: string;
  kind: ExplorerPanel;
  url: string;
}

function panelEntry(state: unknown, url: string): PanelEntry | null {
  if (!state || typeof state !== 'object') return null;
  const entry = (state as { explorerPanel?: Partial<PanelEntry> }).explorerPanel;
  return entry &&
    typeof entry.key === 'string' &&
    entry.url === url &&
    (entry.kind === 'parts' || entry.kind === 'details')
    ? (entry as PanelEntry)
    : null;
}

/** Panels own one same-URL entry, restored by Forward, reload, and return from other pages. */
export function usePanelHistory(
  enabled: boolean,
  panel: ExplorerPanel | null,
  onChange: (panel: ExplorerPanel | null) => void,
) {
  const active = useRef<PanelEntry | null>(null);
  const closing = useRef<string | null>(null);
  const initialized = useRef(false);
  const location = useRef<string | null>(null);
  const current = useRef({ enabled, onChange });
  current.current = { enabled, onChange };
  useEffect(() => {
    let mounted = true;
    location.current = window.location.href;
    const onPop = (event: PopStateEvent) => {
      const url = window.location.href;
      const entry = panelEntry(event.state, url);
      const sameLocation = location.current === url;
      const panelTransition = !!entry || active.current?.url === url || closing.current === url;
      location.current = url;
      active.current = entry;
      closing.current = null;
      if (sameLocation && panelTransition) {
        // A panel-only transition must not reset the camera, explosion or isolation.
        event.stopImmediatePropagation();
        if (current.current.enabled) current.current.onChange(entry?.kind ?? null);
      } else if (current.current.enabled) {
        // Let the explorer restore a different model first, then restore its panel.
        queueMicrotask(() => {
          if (mounted && current.current.enabled && window.location.href === url)
            current.current.onChange(entry?.kind ?? null);
        });
      }
    };
    window.addEventListener('popstate', onPop, true);
    return () => {
      mounted = false;
      window.removeEventListener('popstate', onPop, true);
    };
  }, []);
  useEffect(() => {
    const url = window.location.href;
    const entry = panelEntry(window.history.state, url);
    if (!enabled) {
      initialized.current = false;
      if (active.current && entry?.key === active.current.key && !closing.current) {
        active.current = null;
        closing.current = url;
        // A desktop sidebar is not a modal. Remove its mobile entry without dismissing it.
        window.history.back();
      }
      return;
    }
    if (!initialized.current) {
      initialized.current = true;
      if (entry) {
        active.current = entry;
        location.current = url;
        current.current.onChange(entry.kind);
        return;
      }
    }
    if (closing.current) return;
    if (panel) {
      if (entry && active.current?.key === entry.key) {
        if (entry.kind !== panel) {
          active.current = { ...entry, kind: panel };
          window.history.replaceState(
            { ...window.history.state, explorerPanel: active.current },
            '',
            url,
          );
        }
        return;
      }
      const key = `panel-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      active.current = { key, kind: panel, url };
      location.current = url;
      window.history.pushState({ ...window.history.state, explorerPanel: active.current }, '', url);
    } else if (active.current) {
      const previous = active.current;
      active.current = null;
      if (entry?.key === previous.key) {
        closing.current = previous.url;
        window.history.back();
      }
    }
  }, [enabled, panel]);
  return useCallback((url: string) => {
    if (panelEntry(window.history.state, window.location.href))
      window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
    active.current = null;
    location.current = window.location.href;
  }, []);
}
