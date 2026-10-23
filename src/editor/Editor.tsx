'use client';

import { Button, IconButton } from '@/components/ui/Button';
import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import {
  ArrowLeft,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Focus,
  Layers,
  Plus,
  Save,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { demoCatalog } from '@/data/catalog';
import { oemCatalog, oemDatabase } from '@/data/oem';
import { loadReviewPatches } from '@/catalog-review/storage';
import { applyReviewPatches } from '@/oem/review';
import { toExplorerCatalog } from '@/oem/adapter';
import { createDemoScene } from '@/viewer/demo-scene';
import { loadModel } from '@/viewer/load-model';
import {
  AssetModelLoader,
  availableModelMapping,
  partModelKey,
  wrapPartModel,
  type ModelLoadSnapshot,
} from '@/viewer/part-models';
import { ModelLoadStatus } from '@/viewer/ModelLoadStatus';
import { buildCuratedNavigation, navigationForOccurrence } from '@/navigation/model';
import { validateCatalog } from '@/core/catalog';
import { classifyObjects, getObjectKey, validateMapping } from '@/core/mapping';
import type { Explosion, MappingConfig, Part, Vec3 } from '@/core/types';
import { EditorCanvas, type CameraCommand } from './EditorCanvas';
import { ImportPreflightReport } from './ImportPreflightReport';
import { inspectImport, preflightImportedModel, type ImportPreflight } from './preflight';
import { PartModelPanel } from './PartModelPanel';
import { assignPartModel } from './part-project';
import {
  assignMappings,
  disposeScene,
  inspectScene,
  proposeMappings,
  sceneWarnings,
} from './model-tools';
import {
  downloadJSON,
  loadEditorProject,
  loadSavedEditorAsset,
  loadSavedEditorFiles,
  materializeFiles,
  materializeProjectFiles,
  parseEditorProject,
  saveEditorProject,
  type EditorProject,
  type LocalAsset,
} from './storage';
import './editor.css';
import {
  indexCatalogTargets,
  mergeCatalogIntoProject,
  searchCatalogTargets,
} from './catalog-tools';

function demoMapping(scene: THREE.Group): MappingConfig {
  const mapping: MappingConfig = {
    version: 1,
    assetId: 'demonstration',
    units: 'm',
    upAxis: 'Y',
    mappings: [],
  };
  scene.traverse((object) => {
    if (typeof object.userData.partId === 'string')
      mapping.mappings.push({
        objectKey: getObjectKey(object, scene),
        partId: object.userData.partId,
        ...(object.userData.explosion ? { explosion: object.userData.explosion as Explosion } : {}),
      });
  });
  return mapping;
}

class CanvasBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="editor-canvas-fallback">
        The 3D preview is unavailable. Enable WebGL or try another browser. Catalog editing and JSON
        export remain available.
      </div>
    ) : (
      this.props.children
    );
  }
}

const blankExplosion: Explosion = {
  direction: [0, 0, 1],
  distance: 0.15,
  duration: 0.7,
  easing: 'smooth',
  verification: 'unknown',
};

export function Editor() {
  const [demoMode] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('demo') === '1',
  );
  const [advanced, setAdvanced] = useState(
    () =>
      demoMode ||
      (typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('advanced') === '1'),
  );
  const [partRole, setPartRole] = useState(() =>
    typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('part') ?? '')
      : '',
  );
  const [scene, setScene] = useState(() => createDemoScene());
  const [preflight, setPreflight] = useState<ImportPreflight | null>(null);
  const [project, setProject] = useState<EditorProject>(() => ({
    version: 1,
    catalog: demoMode ? demoCatalog : oemCatalog,
    mapping: demoMode
      ? demoMapping(scene)
      : {
          version: 1,
          assetId: 'demonstration',
          units: 'm',
          upAxis: 'Y',
          mappings: [],
        },
    assetFileName: null,
  }));
  const [selected, setSelected] = useState<string[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [isolated, setIsolated] = useState<string[] | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(250);
  const [targetPart, setTargetPart] = useState('jackshaft');
  const [partSearch, setPartSearch] = useState('');
  const [targetLimit, setTargetLimit] = useState(150);
  const [mergeRetained, setMergeRetained] = useState<string[]>([]);
  const [partName, setPartName] = useState('');
  const [partParent, setPartParent] = useState('');
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<'component' | 'assembly'>('component');
  const [amount, setAmount] = useState(0);
  const [explosion, setExplosion] = useState<Explosion>(blankExplosion);
  const [cameraCommand, setCameraCommand] = useState<CameraCommand>({ id: 0, kind: 'all' });
  const cameraSnapshot = useRef<MappingConfig['camera']>(undefined);
  const pendingFiles = useRef<File[] | undefined>(undefined);
  const localAsset = useRef<LocalAsset | null>(null);
  const modelLoader = useRef<AssetModelLoader | null>(null);
  const managedScenes = useRef(new WeakSet<THREE.Group>());
  const originalVisibilityByObject = useRef(new WeakMap<THREE.Object3D, boolean>());
  const [modelLoad, setModelLoad] = useState<ModelLoadSnapshot | null>(null);
  const sceneRevision = modelLoad?.scene === scene ? modelLoad.revision : 0;
  const importSequence = useRef(0);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState(
    demoMode
      ? 'Demo model loaded. Import your geometry to start mapping.'
      : 'Choose a bike part and add its GLB. Each model is assigned automatically.',
  );
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const modelInput = useRef<HTMLInputElement>(null);
  const partModelInput = useRef<HTMLInputElement>(null);
  const directoryInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);

  const objects = useMemo(() => inspectScene(scene), [scene, sceneRevision]);
  const partNavigation = useMemo(
    () => buildCuratedNavigation(oemDatabase, project.catalog),
    [project.catalog],
  );
  const originalVisibility = useMemo(() => {
    const visibility = new Map<string, boolean>();
    scene.traverse((object) => {
      if (!originalVisibilityByObject.current.has(object))
        originalVisibilityByObject.current.set(object, object.visible);
      visibility.set(getObjectKey(object, scene), originalVisibilityByObject.current.get(object)!);
    });
    return visibility;
  }, [scene, sceneRevision]);
  const objectByKey = useMemo(
    () => new Map(objects.map((object) => [object.key, object])),
    [objects],
  );
  const parentObjectKeys = useMemo(
    () => new Set(objects.map((object) => object.parentKey).filter(Boolean)),
    [objects],
  );
  const partsById = useMemo(
    () => new Map(project.catalog.parts.map((part) => [part.id, part])),
    [project.catalog],
  );
  const targetSearchIndex = useMemo(() => indexCatalogTargets(project.catalog), [project.catalog]);
  const matchingTargets = useMemo(
    () => searchCatalogTargets(targetSearchIndex, partSearch),
    [targetSearchIndex, partSearch],
  );
  const targetOptions = useMemo(() => {
    const options = matchingTargets.slice(0, targetLimit);
    const selectedPart = partsById.get(targetPart);
    return selectedPart && !options.some((part) => part.id === targetPart)
      ? [selectedPart, ...options]
      : options;
  }, [matchingTargets, targetLimit, partsById, targetPart]);
  const mappingEnabled = project.assetFileName !== null || demoMode;
  const directClassification = useMemo(
    () => classifyObjects(objects, project.mapping, project.catalog),
    [objects, project.mapping, project.catalog],
  );
  const classified = useMemo(() => {
    const byKey = new Map(directClassification.map((entry) => [entry.object.key, entry]));
    return directClassification.map((entry) => {
      let parent = entry.object.parentKey;
      if (entry.status !== 'unmapped') return { ...entry, inherited: false };
      while (parent) {
        const ancestor = byKey.get(parent);
        if (!ancestor) break;
        if (ancestor.status !== 'unmapped')
          return { ...entry, status: ancestor.status, partIds: ancestor.partIds, inherited: true };
        parent = ancestor.object.parentKey;
      }
      return { ...entry, inherited: false };
    });
  }, [directClassification]);
  const proposals = useMemo(() => {
    if (!mappingEnabled) return [];
    const unmapped = new Set(
      classified.filter((entry) => entry.status === 'unmapped').map((entry) => entry.object.key),
    );
    return proposeMappings(objects, project.catalog, project.mapping).filter((proposal) =>
      unmapped.has(proposal.objectKey),
    );
  }, [objects, project.catalog, project.mapping, classified, mappingEnabled]);
  const warnings = useMemo(
    () => preflight?.warnings ?? [...new Set(sceneWarnings(scene))],
    [scene, preflight],
  );
  const mappingValidation = useMemo(() => {
    const validation = validateMapping(project.mapping, project.catalog);
    return validation.success
      ? validateMapping(
          availableModelMapping(
            project.mapping,
            modelLoad?.models
              .filter((model) => model.status !== 'loaded')
              .map((model) => model.id) ?? [],
          ),
          project.catalog,
          objects,
        )
      : validation;
  }, [project.mapping, project.catalog, objects, modelLoad]);
  const currentPart = partsById.get(targetPart);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const hasDirectMapping = project.mapping.mappings.some((entry) =>
    selectedSet.has(entry.objectKey),
  );
  const hasInheritedMapping = classified.some(
    (entry) => selectedSet.has(entry.object.key) && entry.inherited,
  );
  const objectVisibility = useMemo(() => {
    const hiddenSet = new Set(hidden);
    const ancestors = (key: string) => {
      const keys: string[] = [];
      let current: string | null = key;
      while (current) {
        keys.push(current);
        current = objectByKey.get(current)?.parentKey ?? null;
      }
      return keys;
    };
    const isolationAncestors = new Set(isolated?.flatMap(ancestors));
    return new Map(
      objects.map((object) => {
        const path = ancestors(object.key);
        const hidden = path.some(
          (key) => hiddenSet.has(key) || originalVisibility.get(key) === false,
        );
        const outsideIsolation =
          isolated?.length &&
          !isolationAncestors.has(object.key) &&
          !path.some((key) => isolated.includes(key));
        return [object.key, hidden ? 'Hidden' : outsideIsolation ? 'Outside isolation' : null];
      }),
    );
  }, [objects, objectByKey, originalVisibility, hidden, isolated]);
  const meshStats = useMemo(
    () =>
      classified
        .filter((entry) => entry.object.mesh)
        .reduce((acc, entry) => ({ ...acc, [entry.status]: acc[entry.status] + 1 }), {
          mapped: 0,
          unmapped: 0,
          ambiguous: 0,
        }),
    [classified],
  );
  const rows = useMemo(
    () =>
      classified.filter((entry) => {
        if (filter !== 'all' && entry.status !== filter) return false;
        if (search)
          return `${entry.object.name} ${entry.object.key} ${entry.partIds.map((id) => `${id} ${partsById.get(id)?.name ?? ''}`).join(' ')}`
            .toLowerCase()
            .includes(search.toLowerCase());
        let parent = entry.object.parentKey;
        while (parent) {
          if (collapsed.includes(parent)) return false;
          parent = objectByKey.get(parent)?.parentKey ?? null;
        }
        return true;
      }),
    [classified, filter, search, collapsed, objectByKey, partsById],
  );
  const parents = project.catalog.parts.filter((part) => part.kind !== 'component');

  useEffect(() => {
    setPartName(currentPart?.name ?? '');
    setPartParent(currentPart?.parentId ?? '');
  }, [currentPart]);

  useEffect(() => {
    const match = project.mapping.mappings.find((mapping) => mapping.objectKey === selected[0]);
    setExplosion(
      match?.explosion ? structuredClone(match.explosion) : structuredClone(blankExplosion),
    );
  }, [selected, project.mapping]);

  useEffect(() => {
    let cancelled = false;
    const loader = new AssetModelLoader();
    modelLoader.current = loader;
    const unsubscribe = loader.subscribe(() => {
      const snapshot = loader.getSnapshot();
      setModelLoad(snapshot);
      if (snapshot.scene) {
        managedScenes.current.add(snapshot.scene);
        setScene(snapshot.scene);
        if (!snapshot.loading) setPreflight(inspectImport(snapshot.scene));
      }
    });
    async function restore() {
      let asset: LocalAsset | null = null;
      let imported: THREE.Group | undefined;
      try {
        const saved = loadEditorProject();
        if (!saved) {
          if (!demoMode) {
            const reviewed = toExplorerCatalog(
              applyReviewPatches(oemDatabase, loadReviewPatches()),
            );
            setProject((current) => ({ ...current, catalog: reviewed }));
          }
          return;
        }
        setBusy(true);
        asset = await loadSavedEditorAsset();
        if (cancelled) {
          asset?.dispose();
          return;
        }
        if (asset) {
          if (asset.models) {
            setProject(saved);
            const navigation = buildCuratedNavigation(oemDatabase, saved.catalog);
            const scope = navigation.byId.get(partRole);
            const priority =
              saved.partModels
                ?.filter(
                  (model) => model.id === partRole || scope?.modelPartIds?.includes(model.partId),
                )
                .map((model) => model.id) ?? [];
            loader.update(asset, priority);
            imported = (await loader.settled()).scene!;
          } else imported = await loadModel(asset.url);
          const report = asset.models
            ? inspectImport(imported)
            : await preflightImportedModel(imported, asset.url);
          if (cancelled) {
            if (!managedScenes.current.has(imported)) disposeScene(imported);
            asset.dispose();
            return;
          }
          localAsset.current?.dispose();
          localAsset.current = asset;
          setPreflight(report);
          setScene(imported);
          asset = null;
          imported = undefined;
        }
        setProject(saved);
        if (!new URLSearchParams(window.location.search).has('part')) {
          const navigation = buildCuratedNavigation(oemDatabase, saved.catalog);
          const mappedRole = saved.mapping.mappings
            .map((entry) => navigationForOccurrence(navigation, entry.partId))
            .find(Boolean);
          setPartRole(
            saved.partModels?.at(-1)?.id ??
              mappedRole?.id ??
              (/seat/i.test(saved.assetFileName ?? '') ? 'nav.body.seat' : ''),
          );
        }
        setTargetPart(saved.catalog.motorcycleId);
        setMessage(
          loader.getSnapshot().failed
            ? `${loader.getSnapshot().loaded} of ${loader.getSnapshot().total} models loaded. Retry the failed files in the preview.`
            : saved.partModels
              ? `${saved.partModels.length} saved part models restored. Add another part or replace its GLB.`
              : advanced
                ? 'Saved local workspace restored intact. Use Merge current OEM catalog to add missing sourced records.'
                : saved.assetFileName
                  ? 'Your saved model is restored. Choose its bike part to finish adding it.'
                  : 'Your workspace is restored. Choose a bike part and import its GLB.',
        );
        setCameraCommand((command) => ({
          id: command.id + 1,
          kind: saved.mapping.camera ? 'saved' : 'all',
        }));
      } catch (cause) {
        asset?.dispose();
        if (imported && !managedScenes.current.has(imported)) disposeScene(imported);
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : 'Could not restore this workspace.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void restore();
    return () => {
      cancelled = true;
      importSequence.current++;
      unsubscribe();
      loader.dispose();
      if (modelLoader.current === loader) modelLoader.current = null;
    };
  }, [demoMode]);

  useEffect(
    () => () => {
      if (!managedScenes.current.has(scene)) disposeScene(scene);
    },
    [scene],
  );
  useEffect(() => () => localAsset.current?.dispose(), []);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, []);

  function updateProject(next: EditorProject) {
    setProject(next);
    dirtyRef.current = true;
    setDirty(true);
    setError(null);
  }
  function updateMapping(mapping: MappingConfig) {
    updateProject({ ...project, mapping });
  }
  function selectObject(key: string | null, additive = false) {
    if (!key) {
      if (!additive) setSelected([]);
      return;
    }
    setSelected((previous) =>
      additive
        ? previous.includes(key)
          ? previous.filter((item) => item !== key)
          : [...previous, key]
        : [key],
    );
    const match = classified.find((entry) => entry.object.key === key);
    if (match?.partIds.length === 1) setTargetPart(match.partIds[0]);
  }
  function frame(kind: CameraCommand['kind']) {
    setCameraCommand((previous) => ({ id: previous.id + 1, kind }));
  }

  function retryModel(id: string) {
    const loader = modelLoader.current;
    if (!loader) return;
    loader.retry(id);
    void loader.settled().then((snapshot) => {
      if (modelLoader.current !== loader) return;
      setMessage(
        snapshot.failed
          ? `${snapshot.loaded} of ${snapshot.total} models loaded. Retry the failed files in the preview.`
          : `${snapshot.loaded} models loaded. All files are available.`,
      );
    });
  }

  async function importModel(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    const models = files.filter((file) => /\.(glb|gltf)$/i.test(file.name));
    if (models.length !== 1) {
      setError('Select exactly one GLB or glTF model, plus any companion .bin and texture files.');
      return;
    }
    const filename = models[0].webkitRelativePath || models[0].name;
    const sequence = ++importSequence.current;
    setBusy(true);
    setError(null);
    let asset: LocalAsset | undefined;
    try {
      asset = await materializeFiles(files, filename);
      const imported = await loadModel(asset.url);
      const report = await preflightImportedModel(imported, asset.url);
      if (sequence !== importSequence.current) {
        asset.dispose();
        disposeScene(imported);
        return;
      }
      localAsset.current?.dispose();
      localAsset.current = asset;
      pendingFiles.current = files;
      modelLoader.current?.update(null);
      const preserve =
        project.assetFileName !== null || project.mapping.assetId !== 'demonstration';
      updateProject({
        ...project,
        partModels: undefined,
        assetFileName: filename,
        mapping: preserve
          ? { ...project.mapping, assetId: filename }
          : { version: 1, assetId: filename, units: 'm', upAxis: 'Y', mappings: [] },
      });
      setPreflight(report);
      setScene(imported);
      setSelected([]);
      setHidden([]);
      setIsolated(null);
      setAmount(0);
      setCollapsed([]);
      frame('all');
      setMessage(
        `Loaded ${models[0].name}. ${preserve ? 'Existing mappings retained; review missing keys below.' : 'No model transforms were changed.'} Save locally to preview in the explorer.`,
      );
    } catch (cause) {
      asset?.dispose();
      setError(cause instanceof Error ? cause.message : 'Model import failed.');
    } finally {
      if (sequence === importSequence.current) setBusy(false);
    }
  }

  async function addPart(file?: File) {
    const node = partNavigation.byId.get(partRole);
    if (!node) {
      setError('Choose a bike part first.');
      return;
    }
    if (file && !/\.glb$/i.test(file.name)) {
      setError('Choose a GLB file for this part.');
      return;
    }
    const sequence = ++importSequence.current;
    setBusy(true);
    setError(null);
    let asset: LocalAsset | undefined;
    let imported: THREE.Group | undefined;
    try {
      let files =
        pendingFiles.current ?? (project.assetFileName ? await loadSavedEditorFiles() : []);
      const fileName = file ? `part-${node.id}.glb` : project.assetFileName;
      if (!fileName) throw new Error('Import a GLB for this part first.');
      if (file) {
        const previousFile = project.partModels?.find((model) => model.id === node.id)?.fileName;
        files = [
          ...files.filter((entry) => {
            const path = entry.webkitRelativePath || entry.name;
            return (
              path !== fileName &&
              (!previousFile || !/\.glb$/i.test(previousFile) || path !== previousFile)
            );
          }),
          new File([file], fileName, { type: file.type }),
        ];
      }
      const next = assignPartModel(project, node, fileName, file?.name ?? project.assetFileName!);
      asset = await materializeProjectFiles(
        files,
        next,
        localAsset.current ? { project, asset: localAsset.current } : undefined,
      );
      const id = node.id;
      const source = asset.models!.find((entry) => entry.id === id)!;
      imported = wrapPartModel(await loadModel(source.url), id);
      const configuration = validateMapping(next.mapping, next.catalog);
      if (!configuration.success)
        throw new Error(configuration.issues.map((issue) => issue.message).join('; '));
      const key = partModelKey(id);
      const validated = validateMapping(
        {
          ...next.mapping,
          mappings: next.mapping.mappings.filter(
            (entry) => entry.objectKey === key || entry.objectKey.startsWith(`${key}:source:`),
          ),
        },
        next.catalog,
        inspectScene(imported),
      );
      if (!validated.success)
        throw new Error(validated.issues.map((issue) => issue.message).join('; '));
      if (sequence !== importSequence.current) {
        asset.dispose();
        disposeScene(imported);
        return;
      }
      modelLoader.current!.update(asset, [id], new Map([[id, imported]]));
      imported = undefined;
      localAsset.current?.dispose();
      localAsset.current = asset;
      pendingFiles.current = files;
      updateProject(next);
      setPreflight(inspectImport(modelLoader.current!.getSnapshot().scene!));
      setSelected([]);
      setHidden([]);
      setIsolated(null);
      setAmount(0);
      frame('all');
      const replacing = project.partModels?.some((model) => model.id === id);
      setMessage(
        `${node.name} ${replacing ? 'replaced' : 'added and assigned'}. Save & preview to see it in the explorer.`,
      );
    } catch (cause) {
      asset?.dispose();
      if (imported) disposeScene(imported);
      setError(cause instanceof Error ? cause.message : 'Could not add this part model.');
    } finally {
      if (sequence === importSequence.current) setBusy(false);
    }
  }

  async function importJSON(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const value: unknown = JSON.parse(await file.text());
      if (value && typeof value === 'object' && 'catalog' in value) {
        const imported = parseEditorProject(value);
        // JSON describes a model; it does not load or replace the current geometry.
        updateProject({ ...imported, assetFileName: project.assetFileName });
        setTargetPart(imported.catalog.motorcycleId);
        setMessage(
          `Project metadata imported. ${imported.assetFileName ? `Expected source model: ${imported.assetFileName}. ` : ''}Check object mapping validation against the currently loaded geometry.`,
        );
      } else if (
        value &&
        typeof value === 'object' &&
        'parts' in value &&
        'motorcycleId' in value
      ) {
        const validated = validateCatalog(value);
        if (!validated.success)
          throw new Error(
            validated.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '),
          );
        updateProject({ ...project, catalog: validated.data });
        setTargetPart(validated.data.motorcycleId);
        setMessage(
          'Catalog imported. Existing object mappings are retained; review any references to removed parts.',
        );
      } else {
        const validated = validateMapping(value, project.catalog);
        if (!validated.success)
          throw new Error(
            validated.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '),
          );
        updateMapping(validated.data);
        setMessage(
          'Mapping imported. Missing objects are reported until the matching model is loaded.',
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invalid JSON.');
    }
  }

  function assign(partId = targetPart, keys = selected) {
    if (!mappingEnabled || !partsById.has(partId) || !keys.length) return;
    if (!project.assetFileName && partsById.get(partId)?.sources.length) {
      setError('Import real geometry before assigning a source-backed OEM catalog entry.');
      return;
    }
    updateMapping(assignMappings(project.mapping, keys, partId));
    setMessage(
      `${keys.length} object${keys.length === 1 ? '' : 's'} mapped to ${partsById.get(partId)!.name}.`,
    );
  }
  function applyExact() {
    if (!mappingEnabled) return;
    let mapping = project.mapping;
    for (const proposal of proposals.filter(
      (proposal) =>
        proposal.confidence === 'exact' &&
        (project.assetFileName || !partsById.get(proposal.partId)?.sources.length),
    ))
      mapping = assignMappings(mapping, [proposal.objectKey], proposal.partId);
    updateMapping(mapping);
    setMessage('Exact ID proposals applied. Review the mapping in the viewport.');
  }
  function mergeCurrentOemCatalog() {
    try {
      const reviewed = toExplorerCatalog(applyReviewPatches(oemDatabase, loadReviewPatches()));
      const result = mergeCatalogIntoProject(project, reviewed);
      updateProject(result.project);
      setMergeRetained(result.retainedDifferences);
      setMessage(
        `Added ${result.addedCount} missing OEM catalog entries. Existing IDs, custom edits, geometry and mappings are preserved. ${result.retainedDifferences.length} existing entries differ from the current OEM catalog and were retained.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Catalog merge failed.');
    }
  }
  function savePart() {
    if (!currentPart) return;
    const catalog = {
      ...project.catalog,
      parts: project.catalog.parts.map((part) =>
        part.id === targetPart
          ? {
              ...part,
              name: partName.trim(),
              parentId: part.id === project.catalog.motorcycleId ? null : partParent,
            }
          : part,
      ),
    };
    const validation = validateCatalog(catalog);
    if (!validation.success) {
      setError(validation.issues.map((issue) => issue.message).join('; '));
      return;
    }
    updateProject({ ...project, catalog: validation.data });
    setMessage('Catalog name and parent assembly updated. Stable part ID preserved.');
  }
  function createPart() {
    const part: Part = {
      id: newId.trim(),
      name: newName.trim(),
      description: '',
      kind: newKind,
      parentId:
        currentPart?.kind === 'component'
          ? currentPart.parentId
          : (currentPart?.id ?? project.catalog.motorcycleId),
      oemNumber: null,
      genericDesignation: null,
      quantity: null,
      material: null,
      specifications: {},
      dimensions: [],
      compatibility: [],
      sources: [],
      verification: 'unknown',
      images: [],
      alternatives: [],
      crossReferences: [],
    };
    const result = validateCatalog({ ...project.catalog, parts: [...project.catalog.parts, part] });
    if (!result.success) {
      setError(result.issues.map((issue) => issue.message).join('; '));
      return;
    }
    updateProject({ ...project, catalog: result.data });
    setTargetPart(part.id);
    setNewId('');
    setNewName('');
    setMessage(`Created ${part.name}. Mechanical data remains unknown.`);
  }
  function applyExplosion() {
    const selectedKeys = new Set(selected);
    const mapping = {
      ...project.mapping,
      mappings: project.mapping.mappings.map((entry) =>
        selectedKeys.has(entry.objectKey) ? { ...entry, explosion } : entry,
      ),
    };
    const result = validateMapping(mapping, project.catalog);
    if (!result.success) {
      setError(result.issues.map((issue) => issue.message).join('; '));
      return;
    }
    updateMapping(result.data);
    setMessage(
      'Explosion settings applied in parent coordinate space. Review direction against the model.',
    );
  }
  async function save(preview = false) {
    setBusy(true);
    setError(null);
    try {
      if (!mappingValidation.success)
        throw new Error(
          'Resolve mapping validation issues before saving this project. Export JSON to keep a repair copy.',
        );
      await saveEditorProject(project, pendingFiles.current);
      pendingFiles.current = undefined;
      dirtyRef.current = false;
      setDirty(false);
      setMessage(
        'Workspace saved in this browser. Export JSON and keep your original model files as a backup.',
      );
      if (preview)
        window.location.assign(demoMode ? '/?workspace=local&demo=1' : '/?workspace=local');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Saving failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`editor-shell ${advanced ? '' : 'editor-simple'}`}>
      <header className="editor-header">
        <a href={demoMode ? '/?demo=1' : '/'} className="editor-back">
          <ArrowLeft size={17} /> Explorer
        </a>
        <div className="editor-title">
          <span className="editor-eyebrow">Local workspace</span>
          <h1>{advanced ? 'Model mapping studio' : 'Add bike parts'}</h1>
        </div>
        <span className={`editor-save-state ${dirty ? 'dirty' : ''}`}>
          {dirty ? 'Unsaved changes' : 'Local only'}
        </span>
        <Button
          onClick={() => setAdvanced((value) => !value)}
          aria-pressed={advanced}
          disabled={busy}
        >
          {advanced ? 'Simple part uploads' : 'Advanced tools'}
        </Button>
        <Button
          className="editor-advanced-import"
          onClick={() => modelInput.current?.click()}
          disabled={busy}
        >
          <Upload size={15} /> Import model
        </Button>
        <Button onClick={() => void save()} disabled={busy}>
          <Save size={15} /> Save locally
        </Button>
        <Button
          variant="primary"
          className="editor-primary"
          onClick={() => void save(true)}
          disabled={busy}
        >
          {advanced ? 'Preview in explorer' : 'Save & preview'} <ChevronRight size={15} />
        </Button>
        <input
          ref={partModelInput}
          type="file"
          accept=".glb"
          hidden
          aria-label="Import part GLB"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void addPart(file);
          }}
        />
        <input
          ref={modelInput}
          type="file"
          multiple
          accept=".glb,.gltf,.bin,.png,.jpg,.jpeg,.webp,.ktx2"
          onChange={importModel}
          hidden
          aria-label="Import model and companion files"
        />
        <input
          ref={directoryInput}
          type="file"
          multiple
          {...{ webkitdirectory: '' }}
          onChange={importModel}
          hidden
          aria-label="Import model folder and nested companion files"
        />
        <input
          ref={jsonInput}
          type="file"
          accept=".json,application/json"
          onChange={importJSON}
          hidden
          aria-label="Import project, catalog or mapping JSON"
        />
      </header>
      <div className="editor-message" role="status" aria-label="Editor status">
        {busy ? 'Loading local model workspace…' : message}
      </div>
      {error && (
        <div className="editor-error" role="alert" aria-label="Editor error">
          <span>{error}</span>
          <IconButton onClick={() => setError(null)} label="Dismiss error">
            <X size={15} />
          </IconButton>
        </div>
      )}
      <div className="editor-workspace">
        {!advanced && (
          <PartModelPanel
            project={project}
            navigation={partNavigation}
            roleId={partRole}
            onRoleChange={setPartRole}
            onUpload={() => partModelInput.current?.click()}
            onAssignExisting={() => void addPart()}
            busy={busy}
          />
        )}
        <aside className="editor-tree-panel" aria-label="Model object hierarchy">
          <div className="editor-panel-heading">
            <Layers size={17} />
            <h2>Scene objects</h2>
            <span>{objects.length}</span>
          </div>
          <div className="editor-model-name">
            {project.assetFileName ?? 'Synthetic demonstration motorcycle'}
          </div>
          <div className="editor-stats">
            <span>
              <i className="editor-dot mapped" /> {meshStats.mapped} mapped
            </span>
            <span>
              <i className="editor-dot unmapped" /> {meshStats.unmapped} unmapped
            </span>
            <span>
              <i className="editor-dot ambiguous" /> {meshStats.ambiguous} conflicts
            </span>
          </div>
          <label className="editor-search">
            <Search size={15} />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setLimit(250);
              }}
              placeholder="Find objects or catalog parts"
              aria-label="Search scene objects"
            />
          </label>
          <div className="editor-tree-options">
            <select
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
                setLimit(250);
              }}
              aria-label="Filter mapping status"
            >
              <option value="all">All objects</option>
              <option value="mapped">Mapped</option>
              <option value="unmapped">Unmapped</option>
              <option value="ambiguous">Ambiguous</option>
            </select>
            <button onClick={() => setCollapsed([])}>Expand all</button>
          </div>
          <div className="editor-object-list" role="group" aria-label="Selectable scene objects">
            {rows.slice(0, limit).map((entry) => {
              let depth = 0,
                parent = entry.object.parentKey;
              while (parent) {
                depth++;
                parent = objectByKey.get(parent)?.parentKey ?? null;
              }
              const hasChildren = parentObjectKeys.has(entry.object.key);
              return (
                <div
                  key={entry.object.key}
                  className={`editor-object ${selectedSet.has(entry.object.key) ? 'selected' : ''} ${objectVisibility.get(entry.object.key) ? 'not-visible' : ''}`}
                  style={{ paddingLeft: `${8 + Math.min(depth, 8) * 11}px` }}
                >
                  <input
                    type="checkbox"
                    checked={selectedSet.has(entry.object.key)}
                    onChange={() => selectObject(entry.object.key, true)}
                    aria-label={`Select ${entry.object.name}`}
                  />
                  {hasChildren ? (
                    <button
                      className="editor-collapse"
                      onClick={() =>
                        setCollapsed((previous) =>
                          previous.includes(entry.object.key)
                            ? previous.filter((key) => key !== entry.object.key)
                            : [...previous, entry.object.key],
                        )
                      }
                      aria-label={`${collapsed.includes(entry.object.key) ? 'Expand' : 'Collapse'} ${entry.object.name}`}
                      aria-expanded={!collapsed.includes(entry.object.key)}
                    >
                      {collapsed.includes(entry.object.key) ? (
                        <ChevronRight size={13} />
                      ) : (
                        <ChevronDown size={13} />
                      )}
                    </button>
                  ) : (
                    <span className="editor-collapse-placeholder" />
                  )}
                  <button
                    className="editor-object-name"
                    aria-pressed={selectedSet.has(entry.object.key)}
                    onClick={(event) =>
                      selectObject(
                        entry.object.key,
                        event.shiftKey || event.ctrlKey || event.metaKey,
                      )
                    }
                    title={`${entry.object.key}\n${entry.partIds.map((id) => partsById.get(id)?.name ?? id).join(', ') || 'Unmapped'}`}
                  >
                    <span>{entry.object.name}</span>
                    <small>
                      {entry.partIds.length
                        ? `${entry.inherited ? '↳ ' : ''}${entry.partIds.join(', ')}`
                        : entry.object.mesh
                          ? 'unmapped mesh'
                          : 'group'}
                    </small>
                    {objectVisibility.get(entry.object.key) && (
                      <small className="editor-object-visibility">
                        {objectVisibility.get(entry.object.key)}
                      </small>
                    )}
                  </button>
                  <i
                    className={`editor-dot ${entry.status}`}
                    title={`${entry.status}${entry.inherited ? ' through parent' : ''}`}
                  />
                </div>
              );
            })}
            {!rows.length && <p className="editor-empty">No objects match this filter.</p>}
            {rows.length > limit && (
              <button className="editor-load-more" onClick={() => setLimit((value) => value + 250)}>
                Show 250 more ({rows.length - limit} remaining)
              </button>
            )}
          </div>
          <div className="editor-tree-footer">
            Checkboxes or Shift-click select several objects. Group mappings apply to descendants.
          </div>
        </aside>
        <main className="editor-preview">
          <div className="editor-preview-top">
            <span className="editor-badge">
              {project.assetFileName ? 'Imported model · unverified' : 'Synthetic demonstration'}
            </span>
            <span>{selected.length} selected · metres · Y up</span>
          </div>
          <div className="editor-canvas">
            {!advanced && !project.assetFileName ? (
              <div className="editor-part-empty">
                <Box size={32} />
                <h2>Your bike starts here</h2>
                <p>Choose a part and import its GLB to start.</p>
              </div>
            ) : (
              <CanvasBoundary key={scene.uuid}>
                <EditorCanvas
                  scene={scene}
                  revision={sceneRevision}
                  mapping={project.mapping}
                  selected={selected}
                  hovered={hovered}
                  hidden={hidden}
                  isolated={isolated}
                  amount={amount}
                  cameraCommand={cameraCommand}
                  cameraSnapshot={cameraSnapshot}
                  onSelect={selectObject}
                  onHover={setHovered}
                />
              </CanvasBoundary>
            )}
            <ModelLoadStatus state={modelLoad} onRetry={retryModel} />
            {hovered && (
              <div className="editor-hover">
                {objectByKey.get(hovered)?.name}
                <small>
                  {classified
                    .find((entry) => entry.object.key === hovered)
                    ?.partIds.map((id) => partsById.get(id)?.name ?? id)
                    .join(', ') || 'Unmapped object'}
                </small>
              </div>
            )}
            <div className="editor-viewport-controls">
              <button onClick={() => frame('all')}>
                <Focus size={15} /> Frame model
              </button>
              <button onClick={() => frame('selection')} disabled={!selected.length}>
                Frame selected
              </button>
              <button
                onClick={() => {
                  if (cameraSnapshot.current) {
                    updateMapping({
                      ...project.mapping,
                      camera: structuredClone(cameraSnapshot.current),
                    });
                    setMessage('Current camera framing saved to the mapping configuration.');
                  }
                }}
              >
                Save camera
              </button>
              {project.mapping.camera && (
                <button onClick={() => frame('saved')}>Recall camera</button>
              )}
            </div>
          </div>
          <div className="editor-preview-controls">
            <div>
              <strong>Explosion preview</strong>
              <span>Original positions are preserved</span>
            </div>
            <button onClick={() => setAmount(amount > 0.5 ? 0 : 1)}>
              {amount > 0.5 ? 'Reassemble' : 'Explode'}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
              aria-label="Editor explosion amount"
            />
            <output>{Math.round(amount * 100)}%</output>
          </div>
          <div className="editor-selection-tools">
            <button
              disabled={!selected.length && !isolated}
              aria-pressed={!!isolated}
              onClick={() => setIsolated(isolated ? null : [...selected])}
            >
              {isolated ? 'Show all objects' : 'Isolate selection'}
            </button>
            <button
              disabled={!selected.length}
              onClick={() => setHidden((previous) => [...new Set([...previous, ...selected])])}
            >
              Hide selected
            </button>
            <button
              disabled={!hidden.length && !isolated}
              onClick={() => {
                setHidden([]);
                setIsolated(null);
              }}
            >
              Restore visibility
            </button>
            <span>Drag orbit · right-drag pan · scroll zoom</span>
          </div>
          <details className="editor-validation" open={!mappingValidation.success}>
            <summary>
              {mappingValidation.success ? <Check size={15} /> : <X size={15} />}
              {preflight
                ? `Import preflight · ${warnings.length} review items`
                : mappingValidation.success
                  ? 'Mapping is structurally valid'
                  : `${mappingValidation.issues.length} mapping issues`}
              <span>
                {preflight
                  ? mappingValidation.success
                    ? 'Mapping is structurally valid'
                    : `${mappingValidation.issues.length} mapping issues`
                  : 'Geometry checks'}
              </span>
            </summary>
            <div className={preflight ? 'editor-preflight-content' : undefined}>
              {preflight && <ImportPreflightReport report={preflight} />}
              <ul>
                {!mappingValidation.success &&
                  mappingValidation.issues.map((issue, i) => (
                    <li key={`issue-${i}`}>{issue.message}</li>
                  ))}
                {warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
              {!mappingValidation.success && (
                <button
                  onClick={() => {
                    const keys = new Set(objects.map((object) => object.key));
                    updateMapping({
                      ...project.mapping,
                      mappings: project.mapping.mappings.filter((entry) =>
                        keys.has(entry.objectKey),
                      ),
                    });
                  }}
                >
                  Remove mappings for missing objects
                </button>
              )}
            </div>
          </details>
        </main>
        <aside className="editor-inspector" aria-label="Mapping and catalog inspector">
          <section>
            <div className="editor-panel-heading">
              <Box size={17} />
              <h2>Map to catalog</h2>
            </div>
            <p>Select objects, then choose the catalog part they belong to.</p>
            <label>
              Search catalog targets
              <input
                type="search"
                value={partSearch}
                onChange={(event) => {
                  setPartSearch(event.target.value);
                  setTargetLimit(150);
                }}
                placeholder="OEM number, name, source or stable ID"
              />
            </label>
            <label>
              Catalog part
              <select value={targetPart} onChange={(event) => setTargetPart(event.target.value)}>
                {targetOptions.map((part) => (
                  <option key={part.id} value={part.id}>
                    {part.name}
                    {part.oemNumber ? ` · ${part.oemNumber}` : ''} · {part.id}
                  </option>
                ))}
              </select>
            </label>
            <p className="editor-target-count" aria-live="polite">
              {matchingTargets.length} matching catalog entries
              {matchingTargets.length > targetLimit ? ` · showing first ${targetLimit}` : ''}.
            </p>
            {matchingTargets.length > targetLimit && (
              <button onClick={() => setTargetLimit((value) => value + 150)}>
                Show 150 more catalog targets
              </button>
            )}
            {currentPart && (
              <div className="editor-target-details">
                <strong>{currentPart.oemNumber ?? currentPart.name}</strong>
                <code>{currentPart.id}</code>
                {currentPart.specifications['Catalog identity'] && (
                  <small>Physical part: {currentPart.specifications['Catalog identity']}</small>
                )}
                {currentPart.sources.slice(0, 1).map((source) => (
                  <small key={`${source.document}:${source.page}:${source.item}`}>
                    {source.document} · page {source.page ?? '—'} · figure {source.diagram ?? '—'}
                    {source.item ? ` · ${source.item}` : ''}
                  </small>
                ))}
              </div>
            )}
            {!mappingEnabled && (
              <p className="editor-synthetic-note">
                Import your GLB/glTF to assign OEM parts. The synthetic sample has no OEM mapping.
              </p>
            )}
            <div className="editor-button-row">
              <Button
                variant="primary"
                disabled={!selected.length || !mappingEnabled}
                onClick={() => assign()}
              >
                Map {selected.length || ''} selected
              </Button>
              <button
                disabled={!hasDirectMapping}
                aria-describedby={hasInheritedMapping ? 'inherited-mapping-note' : undefined}
                onClick={() =>
                  updateMapping({
                    ...project.mapping,
                    mappings: project.mapping.mappings.filter(
                      (entry) => !selectedSet.has(entry.objectKey),
                    ),
                  })
                }
              >
                Unmap
              </button>
            </div>
            {hasInheritedMapping && (
              <p id="inherited-mapping-note" className="editor-inherited-note">
                Mapping inherited from a parent object. Select that parent to remove it.
              </p>
            )}
            {selected.length === 1 && <code className="editor-key">{selected[0]}</code>}
          </section>
          <section>
            <h3>Explosion transform</h3>
            <p>
              Directions use the object’s parent axes. Distance is in metres. Map the object before
              applying.
            </p>
            <div className="editor-vector">
              {(['X', 'Y', 'Z'] as const).map((axis, index) => (
                <label key={axis}>
                  {axis}
                  <input
                    type="number"
                    step="0.1"
                    value={explosion.direction[index]}
                    onChange={(event) =>
                      setExplosion((previous) => ({
                        ...previous,
                        direction: previous.direction.map((value, i) =>
                          i === index ? Number(event.target.value) : value,
                        ) as Vec3,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <div className="editor-two-col">
              <label>
                Distance (m)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={explosion.distance}
                  onChange={(event) =>
                    setExplosion((previous) => ({
                      ...previous,
                      distance: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Duration (s)
                <input
                  type="number"
                  min="0.01"
                  step="0.1"
                  value={explosion.duration ?? 0.7}
                  onChange={(event) =>
                    setExplosion((previous) => ({
                      ...previous,
                      duration: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>
            <label>
              Easing
              <select
                value={explosion.easing ?? 'smooth'}
                onChange={(event) =>
                  setExplosion((previous) => ({
                    ...previous,
                    easing: event.target.value as Explosion['easing'],
                  }))
                }
              >
                <option value="smooth">Smooth</option>
                <option value="linear">Linear</option>
                <option value="cubic">Cubic</option>
              </select>
            </label>
            <label>
              Verification
              <select
                value={explosion.verification}
                onChange={(event) =>
                  setExplosion((previous) => ({
                    ...previous,
                    verification: event.target.value as Explosion['verification'],
                  }))
                }
              >
                <option value="unknown">Unverified</option>
                <option value="demonstration">Demonstration</option>
                <option value="source-confirmed">Source confirmed</option>
                <option value="mechanically-verified">Mechanically verified</option>
              </select>
            </label>
            <button
              disabled={
                !selected.some((key) =>
                  project.mapping.mappings.some((entry) => entry.objectKey === key),
                )
              }
              onClick={applyExplosion}
            >
              Apply to mapped selection
            </button>
          </section>
          <section>
            <h3>Catalog organization</h3>
            <p>
              Workspace changes preserve source records.{' '}
              <a href="/catalog">Review factual catalog data</a> to save shared review edits.
            </p>
            <label>
              Human-readable name
              <input value={partName} onChange={(event) => setPartName(event.target.value)} />
            </label>
            {currentPart?.kind !== 'motorcycle' && (
              <label>
                Parent assembly
                <select value={partParent} onChange={(event) => setPartParent(event.target.value)}>
                  {parents
                    .filter((part) => part.id !== targetPart)
                    .map((part) => (
                      <option key={part.id} value={part.id}>
                        {part.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <button onClick={savePart} disabled={!currentPart}>
              Save catalog changes
            </button>
            <details className="editor-new-part">
              <summary>
                <Plus size={14} /> Add part or assembly
              </summary>
              <label>
                Stable ID
                <input
                  value={newId}
                  onChange={(event) => setNewId(event.target.value)}
                  placeholder="e.g. left-bearing"
                />
              </label>
              <label>
                Name
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="Human-readable name"
                />
              </label>
              <label>
                Kind
                <select
                  value={newKind}
                  onChange={(event) => setNewKind(event.target.value as 'component' | 'assembly')}
                >
                  <option value="component">Component</option>
                  <option value="assembly">Assembly</option>
                </select>
              </label>
              <p>
                Added under{' '}
                {currentPart?.kind === 'component'
                  ? partsById.get(currentPart.parentId ?? '')?.name
                  : currentPart?.name}
                . All mechanical facts remain unknown.
              </p>
              <button onClick={createPart}>Create catalog entry</button>
            </details>
          </section>
          <section>
            <h3>Name matching proposals</h3>
            <p>Exact IDs can be applied together. Similar names require individual confirmation.</p>
            <button
              disabled={!proposals.some((proposal) => proposal.confidence === 'exact')}
              onClick={applyExact}
            >
              Apply {proposals.filter((proposal) => proposal.confidence === 'exact').length} exact
              ID matches
            </button>
            <div className="editor-proposals">
              {proposals.slice(0, 30).map((proposal) => (
                <div key={`${proposal.objectKey}:${proposal.partId}`}>
                  <span>
                    {objectByKey.get(proposal.objectKey)?.name}
                    <small>
                      → {partsById.get(proposal.partId)?.name} · {proposal.confidence}
                    </small>
                  </span>
                  <button onClick={() => assign(proposal.partId, [proposal.objectKey])}>
                    Confirm
                  </button>
                </div>
              ))}
              {!proposals.length && <p>No unapplied matches found.</p>}
              {proposals.length > 30 && <p>Apply matches to reveal more proposals.</p>}
            </div>
          </section>
          <section className="editor-file-actions">
            <h3>Portable workspace</h3>
            <button onClick={mergeCurrentOemCatalog} disabled={busy}>
              Merge current OEM catalog
            </button>
            <p>
              Adds missing entries with saved review edits. Existing catalog records and mappings
              are retained on ID collisions.
            </p>
            {mergeRetained.length > 0 && (
              <details className="editor-merge-report">
                <summary>{mergeRetained.length} existing entries retained</summary>
                <p>
                  These local records differ from current OEM metadata. Export this project before
                  reviewing changes individually.
                </p>
                <ul>
                  {mergeRetained.map((id) => (
                    <li key={id}>
                      <code>{id}</code>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <button disabled={busy} onClick={() => directoryInput.current?.click()}>
              <Upload size={14} /> Import model folder
            </button>
            <button onClick={() => jsonInput.current?.click()}>
              <Upload size={14} /> Import project / catalog / mapping JSON
            </button>
            <button onClick={() => downloadJSON(project, 'parts-explorer-project.json')}>
              <Download size={14} /> Export full project JSON
            </button>
            <button onClick={() => downloadJSON(project.catalog, 'parts-catalog.json')}>
              <Download size={14} /> Export catalog only
            </button>
            <button onClick={() => downloadJSON(project.mapping, 'model-mapping.json')}>
              <Download size={14} /> Export mapping only
            </button>
            <p>
              Models and metadata stay in this browser. JSON exports contain catalog and mapping
              data; keep the original model files separately. Browser storage can be cleared or
              evicted.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default Editor;
