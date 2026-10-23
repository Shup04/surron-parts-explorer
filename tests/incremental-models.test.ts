import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Texture } from 'three';
import {
  AssetModelLoader,
  partModelKey,
  priorityModelIds,
  wrapPartModel,
} from '../src/viewer/part-models';
import { validateViewerAsset } from '../src/viewer/asset-validation';
import { demoCatalog } from '../src/data/catalog';
import type { AssetDefinition, MappingConfig } from '../src/core/types';

const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function model() {
  const source = new Group();
  source.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial({ map: new Texture() })));
  return source;
}
function controlled(concurrency = 2) {
  const pending = new Map<
    string,
    { resolve: (group: Group) => void; reject: (error: Error) => void }
  >();
  const load = vi.fn(
    (url: string) => new Promise<Group>((resolve, reject) => pending.set(url, { resolve, reject })),
  );
  const loader = new AssetModelLoader(load, concurrency);
  return { loader, load, pending };
}
const asset = {
  url: '/bike',
  models: ['frame', 'seat', 'wheel', 'fork', 'brake'].map((id) => ({ id, url: `/${id}.glb` })),
};

describe('incremental model ownership and scheduling', () => {
  it('bounds concurrency, renders the first finished part, and prioritizes a newly opened scope', async () => {
    const { loader, load, pending } = controlled();
    loader.update(asset, ['wheel']);
    await tick();
    expect(load.mock.calls.map(([url]) => url)).toEqual(['/wheel.glb', '/frame.glb']);
    loader.prioritize(['brake']);
    pending.get('/wheel.glb')!.resolve(model());
    await tick();
    expect(loader.getSnapshot()).toMatchObject({ loaded: 1, total: 5, loading: true });
    expect(loader.getSnapshot().scene!.children.map((child) => child.name)).toEqual(['wheel']);
    expect(load.mock.calls.map(([url]) => url)).toEqual(['/wheel.glb', '/frame.glb', '/brake.glb']);
    loader.dispose();
    pending.get('/frame.glb')!.resolve(model());
    pending.get('/brake.glb')!.resolve(model());
    await tick();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('keeps successful geometry through failures and retries only the failed file', async () => {
    const { loader, load, pending } = controlled();
    const pair = { ...asset, models: asset.models.slice(0, 2) };
    loader.update(pair);
    await tick();
    const frame = model();
    const mesh = frame.children[0] as Mesh;
    const dispose = vi.spyOn(mesh.geometry, 'dispose');
    pending.get('/frame.glb')!.resolve(frame);
    pending.get('/seat.glb')!.reject(new Error('HTTP 503'));
    await tick();
    const root = loader.getSnapshot().scene!;
    const wrapper = root.children[0];
    expect(loader.getSnapshot()).toMatchObject({ loaded: 1, failed: 1, loading: false });
    expect(loader.getSnapshot().models[1]).toMatchObject({
      id: 'seat',
      url: '/seat.glb',
      error: 'HTTP 503',
    });
    loader.update({ ...pair, models: [...pair.models] });
    await tick();
    expect(load).toHaveBeenCalledTimes(2);
    loader.retry('seat');
    loader.retry('seat');
    await tick();
    expect(root.children[0]).toBe(wrapper);
    expect(dispose).not.toHaveBeenCalled();
    expect(load.mock.calls.map(([url]) => url)).toEqual(['/frame.glb', '/seat.glb', '/seat.glb']);
    pending.get('/seat.glb')!.resolve(model());
    await loader.settled();
    expect(loader.getSnapshot()).toMatchObject({ loaded: 2, failed: 0, loading: false });
    expect(loader.getSnapshot().scene).toBe(root);
    expect(root.children[0]).toBe(wrapper);
    loader.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('reuses unchanged meshes and materials, invalidates changed URLs, and releases removed resources once', async () => {
    const load = vi.fn(async () => model());
    const loader = new AssetModelLoader(load);
    loader.update({ ...asset, models: asset.models.slice(0, 2) });
    await loader.settled();
    const scene = loader.getSnapshot().scene!;
    const frame = scene.children[0];
    const seat = scene.children[1];
    const oldMesh = seat.children[0].children[0] as Mesh;
    const frameMesh = frame.children[0].children[0] as Mesh;
    const geometry = vi.spyOn(oldMesh.geometry, 'dispose');
    const material = vi.spyOn(oldMesh.material as MeshBasicMaterial, 'dispose');
    const texture = vi.spyOn((oldMesh.material as MeshBasicMaterial).map!, 'dispose');
    const frameDisposal = vi.spyOn(frameMesh.geometry, 'dispose');
    const originalFrameMaterial = frameMesh.material;
    // A temporary highlight must not hide the source material from the owner.
    oldMesh.material = new MeshBasicMaterial();
    loader.update({ ...asset, models: [asset.models[0], { id: 'seat', url: '/seat.glb?v=2' }] });
    await loader.settled();
    expect(load.mock.calls).toHaveLength(3);
    expect(scene.children[0]).toBe(frame);
    expect(frameMesh.material).toBe(originalFrameMaterial);
    expect(frameDisposal).not.toHaveBeenCalled();
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
    expect(texture).toHaveBeenCalledTimes(1);
    loader.dispose();
    loader.dispose();
    expect(frameDisposal).toHaveBeenCalledTimes(1);
    expect(geometry).toHaveBeenCalledTimes(1);
    (oldMesh.material as MeshBasicMaterial).dispose();
  });

  it('discards superseded and unmounted loads without exceeding the request limit or publishing stale geometry', async () => {
    const { loader, load, pending } = controlled(1);
    loader.update({ url: '/old.glb' });
    await tick();
    loader.update({ url: '/new.glb' });
    await tick();
    expect(load).toHaveBeenCalledTimes(1);
    const stale = model();
    const disposed = vi.spyOn((stale.children[0] as Mesh).geometry, 'dispose');
    pending.get('/old.glb')!.resolve(stale);
    await tick();
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(loader.getSnapshot().scene).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
    const notify = vi.fn();
    loader.subscribe(notify);
    const settled = loader.settled();
    loader.dispose();
    await settled;
    const late = model();
    const lateDisposal = vi.spyOn((late.children[0] as Mesh).geometry, 'dispose');
    pending.get('/new.glb')!.resolve(late);
    await tick();
    expect(lateDisposal).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it('adopts a validated replacement without loading it again or restarting another in-flight file', async () => {
    const { loader, load, pending } = controlled();
    loader.update({ ...asset, models: asset.models.slice(0, 2) });
    await tick();
    const replacement = wrapPartModel(model(), 'seat');
    loader.update(
      { ...asset, models: [asset.models[0], { id: 'seat', url: '/new-seat.glb' }] },
      ['seat'],
      new Map([['seat', replacement]]),
    );
    pending.get('/frame.glb')!.resolve(model());
    pending.get('/seat.glb')!.resolve(model());
    await loader.settled();
    expect(load).toHaveBeenCalledTimes(2);
    expect(loader.getSnapshot().scene!.children).toContain(replacement);
    expect(loader.getSnapshot()).toMatchObject({ loaded: 2, failed: 0 });
    loader.dispose();
  });

  it('does not start queued downloads after immediate disposal (including React effect replay)', async () => {
    const { loader, load } = controlled();
    loader.update(asset);
    loader.dispose();
    await tick();
    expect(load).not.toHaveBeenCalled();
  });
});

describe('part mappings while files are unavailable', () => {
  const mapping: MappingConfig = {
    version: 1,
    assetId: 'parts',
    units: 'm',
    upAxis: 'Y',
    mappings: [
      { objectKey: partModelKey('frame'), partId: 'shaft' },
      { objectKey: partModelKey('seat'), partId: 'bearing-left' },
    ],
  };
  const registered: AssetDefinition = {
    ...asset,
    models: asset.models.slice(0, 2),
    id: 'parts',
    label: 'Parts',
    assemblyId: 'lbx',
    unit: 'm',
    upAxis: 'Y',
  };
  it('prioritizes explicit scopes across catalog assemblies', () => {
    expect(priorityModelIds(registered, mapping, new Set(['bearing-left']))).toEqual(['seat']);
  });
  it('defers only unavailable manifest keys, then validates each arriving file', async () => {
    const { loader, pending } = controlled();
    loader.update(registered);
    await tick();
    pending.get('/frame.glb')!.resolve(model());
    pending.get('/seat.glb')!.reject(new Error('Offline'));
    await loader.settled();
    const scene = loader.getSnapshot().scene!;
    expect(validateViewerAsset(registered, demoCatalog, mapping, scene, ['seat'])).toBeNull();
    expect(validateViewerAsset(registered, demoCatalog, mapping, scene)).toContain(
      'Missing model object',
    );
    const invalid: MappingConfig = {
      ...mapping,
      mappings: [...mapping.mappings, { objectKey: 'id:typo', partId: 'shaft' }],
    };
    expect(validateViewerAsset(registered, demoCatalog, invalid, scene, ['seat'])).toContain(
      'id:typo',
    );
    expect(
      validateViewerAsset(
        registered,
        demoCatalog,
        { ...mapping, mappings: [{ objectKey: partModelKey('seat'), partId: 'unknown' }] },
        scene,
        ['seat'],
      ),
    ).toContain('Unknown catalog part');
    loader.retry('seat');
    await tick();
    pending.get('/seat.glb')!.resolve(model());
    await loader.settled();
    expect(validateViewerAsset(registered, demoCatalog, mapping, scene)).toBeNull();
    loader.dispose();
  });
});
