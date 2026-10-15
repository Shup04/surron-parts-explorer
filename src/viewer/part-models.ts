import { Group } from 'three';
import { getObjectKey } from '@/core/mapping';
import { loadModel } from './load-model';
import { disposeScene } from './scene';

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

/** Keep every model's authored position, rotation, scale and geometry. */
export async function loadAssetModel(asset: {
  url: string;
  models?: { id: string; url: string }[];
}): Promise<Group> {
  if (!asset.models) return loadModel(asset.url);
  const results = await Promise.allSettled(
    asset.models.map(async (model) => wrapPartModel(await loadModel(model.url), model.id)),
  );
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') {
    for (const result of results) if (result.status === 'fulfilled') disposeScene(result.value);
    throw failure.reason;
  }
  const scene = new Group();
  scene.name = 'motorcycle-parts';
  scene.userData.objectId = 'motorcycle-parts';
  for (const result of results) if (result.status === 'fulfilled') scene.add(result.value);
  return scene;
}
