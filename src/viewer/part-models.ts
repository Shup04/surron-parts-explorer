import { Group } from 'three';
import { getObjectKey } from '@/core/mapping';
import type { AssetModelSource, MappingConfig } from '@/core/types';
import { loadModel } from './load-model';
import { disposeScene, sceneDisposer } from './scene';

export function partModelKey(id: string): string {
  return `id:part-model:${id}`;
}

/** Namespace source identifiers so independently exported parts cannot collide. */
export function wrapPartModel(source: Group, id: string): Group {
  const objects: { object: import('three').Object3D; key: string }[] = [];
  source.traverse((object) => objects.push({ object, key: getObjectKey(object, source) }));
  for (const { object, key } of objects) {
    const objectId = `part-model:${id}:source:${key}`;
    object.userData.objectId = objectId;
  }
  const wrapper = new Group();
  wrapper.name = id;
  wrapper.userData.objectId = `part-model:${id}`;
  wrapper.add(source);
  return wrapper;
}

export interface ModelAsset {
  url: string;
  label?: string;
  models?: AssetModelSource[];
}

export interface ModelLoadState extends AssetModelSource {
  status: 'queued' | 'loading' | 'loaded' | 'failed';
  error?: string;
}

export interface ModelLoadSnapshot {
  scene: Group | null;
  /** Changes only when geometry changes, not when a request starts or fails. */
  revision: number;
  models: ModelLoadState[];
  total: number;
  loaded: number;
  failed: number;
  loading: boolean;
}

interface Entry {
  state: ModelLoadState;
  object?: Group;
  release?: () => void;
}

export function modelFileName(model: AssetModelSource): string {
  if (model.label) return model.label;
  const file = model.url.split(/[?#]/)[0].split('/').at(-1) || model.id;
  try {
    return decodeURIComponent(file);
  } catch {
    return file;
  }
}

/** Map the open catalog scope to files, including mappings inside a part wrapper. */
export function priorityModelIds(
  asset: ModelAsset,
  mapping: MappingConfig | undefined,
  partIds: ReadonlySet<string>,
): string[] {
  return (asset.models ?? [])
    .filter((model) => {
      const key = partModelKey(model.id);
      return mapping?.mappings.some(
        (entry) =>
          partIds.has(entry.partId) &&
          (entry.objectKey === key || entry.objectKey.startsWith(`${key}:source:`)),
      );
    })
    .map((model) => model.id);
}

/** Defer only object references owned by files that have not loaded successfully. */
export function availableModelMapping(
  mapping: MappingConfig,
  unavailableIds: string[],
): MappingConfig {
  const keys = unavailableIds.map(partModelKey);
  return {
    ...mapping,
    mappings: mapping.mappings.filter(
      (entry) =>
        !keys.some(
          (key) => entry.objectKey === key || entry.objectKey.startsWith(`${key}:source:`),
        ),
    ),
  };
}

/** One owner per mounted workspace. Unchanged (ID, URL) entries retain their exact geometry. */
export class AssetModelLoader {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private waiters = new Set<(snapshot: ModelLoadSnapshot) => void>();
  private priority = new Set<string>();
  private group = new Group();
  private multipart = true;
  private active = 0;
  private revision = 0;
  private disposed = false;
  private scheduled = false;
  private snapshot: ModelLoadSnapshot = {
    scene: null,
    revision: 0,
    models: [],
    total: 0,
    loaded: 0,
    failed: 0,
    loading: false,
  };

  constructor(
    private readonly load: (url: string) => Promise<Group> = loadModel,
    private readonly concurrency = 3,
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1)
      throw new Error('Model loading concurrency must be a positive integer.');
    this.group.name = 'motorcycle-parts';
    this.group.userData.objectId = 'motorcycle-parts';
  }

  getSnapshot = (): ModelLoadSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Also resolves on disposal so an abandoned restore can release its URLs. */
  settled(): Promise<ModelLoadSnapshot> {
    if (!this.snapshot.loading || this.disposed) return Promise.resolve(this.snapshot);
    return new Promise((resolve) => this.waiters.add(resolve));
  }

  /** Preloaded parts are already wrapped with wrapPartModel; ownership transfers here. */
  update(asset: ModelAsset | null, priority: string[] = [], preloaded = new Map<string, Group>()) {
    if (this.disposed) return;
    const multipart = !!asset?.models;
    const sources =
      asset?.models ?? (asset ? [{ id: '$asset', url: asset.url, label: asset.label }] : []);
    const sourcesById = new Map(sources.map((source) => [source.id, source]));
    if (sourcesById.size !== sources.length) throw new Error('Duplicate part model ID.');
    for (const [id, entry] of this.entries) {
      if (
        multipart === this.multipart &&
        sourcesById.get(id)?.url === entry.state.url &&
        !preloaded.has(id)
      )
        continue;
      entry.object?.removeFromParent();
      entry.release?.();
      this.entries.delete(id);
      this.revision++;
    }
    this.multipart = multipart;
    // Preserve manifest order for equal-priority requests.
    this.entries = new Map(
      sources.map((source) => {
        const existing = this.entries.get(source.id);
        if (existing) {
          existing.state = { ...existing.state, ...source };
          return [source.id, existing];
        }
        const entry: Entry = { state: { ...source, status: 'queued' } };
        const ready = preloaded.get(source.id);
        if (ready) this.accept(entry, ready, true);
        return [source.id, entry];
      }),
    );
    this.priority = new Set(priority);
    this.publish();
    this.schedule();
  }

  prioritize(ids: string[]) {
    this.priority = new Set(ids);
    this.schedule();
  }

  retry(id: string) {
    const entry = this.entries.get(id);
    if (this.disposed || entry?.state.status !== 'failed') return;
    entry.state = { ...entry.state, status: 'queued', error: undefined };
    this.priority.add(id);
    this.publish();
    this.schedule();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    for (const entry of this.entries.values()) {
      entry.object?.removeFromParent();
      entry.release?.();
    }
    this.entries.clear();
    this.waiters.forEach((resolve) => resolve(this.snapshot));
    this.waiters.clear();
  }

  private accept(entry: Entry, source: Group, prepared = false) {
    entry.release = sceneDisposer(source);
    entry.object = this.multipart && !prepared ? wrapPartModel(source, entry.state.id) : source;
    if (this.multipart) this.group.add(entry.object);
    entry.state = { ...entry.state, status: 'loaded', error: undefined };
    this.revision++;
  }

  private publish() {
    const models = [...this.entries.values()].map((entry) => entry.state);
    this.snapshot = {
      scene: this.multipart ? this.group : (this.entries.get('$asset')?.object ?? null),
      revision: this.revision,
      models,
      total: models.length,
      loaded: models.filter((model) => model.status === 'loaded').length,
      failed: models.filter((model) => model.status === 'failed').length,
      loading: models.some((model) => model.status === 'queued' || model.status === 'loading'),
    };
    this.listeners.forEach((listener) => listener());
    if (!this.snapshot.loading) {
      this.waiters.forEach((resolve) => resolve(this.snapshot));
      this.waiters.clear();
    }
  }

  private schedule() {
    if (this.disposed || this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.pump();
    });
  }

  private pump() {
    if (this.disposed) return;
    while (this.active < this.concurrency) {
      const queued = [...this.entries.values()].filter((entry) => entry.state.status === 'queued');
      const entry = queued.find((entry) => this.priority.has(entry.state.id)) ?? queued[0];
      if (!entry) break;
      this.active++;
      entry.state = { ...entry.state, status: 'loading' };
      this.publish();
      void this.run(entry);
    }
  }

  private async run(entry: Entry) {
    try {
      const source = await this.load(entry.state.url);
      if (this.disposed || this.entries.get(entry.state.id) !== entry) disposeScene(source);
      else this.accept(entry, source);
    } catch (error) {
      if (!this.disposed && this.entries.get(entry.state.id) === entry)
        entry.state = {
          ...entry.state,
          status: 'failed',
          error:
            error instanceof Error ? error.message : 'Could not load this model and its resources.',
        };
    } finally {
      this.active--;
      if (!this.disposed) {
        this.publish();
        this.schedule();
      }
    }
  }
}
