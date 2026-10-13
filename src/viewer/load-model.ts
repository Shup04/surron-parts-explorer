import { Box3, Group, LoadingManager } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { disposeScene } from './scene';

/** Self-host the Draco files at /draco/ and pass decoderPath for offline deployments. */
export const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

export async function loadModel(
  url: string,
  options: { manager?: LoadingManager; decoderPath?: string } = {},
): Promise<Group> {
  const loader = new GLTFLoader(options.manager);
  const draco = new DRACOLoader().setDecoderPath(options.decoderPath ?? DRACO_DECODER_PATH);
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  try {
    const gltf = await loader.loadAsync(url);
    const scene = gltf.scene;
    const box = new Box3().setFromObject(scene);
    if (box.isEmpty() || !Number.isFinite(box.max.length())) {
      disposeScene(scene);
      throw new Error('The asset has no valid visible geometry. Check its GLB/glTF export.');
    }
    return scene;
  } finally {
    draco.dispose();
  }
}
