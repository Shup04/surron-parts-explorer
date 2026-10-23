import { Box3, Group, LoadingManager, Mesh, MeshStandardMaterial } from 'three';
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
    // The untextured raw-aluminum exports wash out under studio lighting.
    // Give each shared material one darker satin adjustment without extra textures.
    const adjusted = new Set<MeshStandardMaterial>();
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material])
        if (
          material instanceof MeshStandardMaterial &&
          material.name.toLowerCase() === 'raw aluminum' &&
          !material.map &&
          !material.roughnessMap &&
          !adjusted.has(material)
        ) {
          adjusted.add(material);
          material.color.multiplyScalar(0.62);
          material.roughness = Math.max(material.roughness, 0.58);
          material.envMapIntensity = Math.min(material.envMapIntensity, 0.65);
        }
    });
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
