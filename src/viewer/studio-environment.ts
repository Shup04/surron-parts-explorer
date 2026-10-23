import { Color, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, Scene } from 'three';

/** Broad reflection panels keep reduced meshes readable without pinpoint specular highlights. */
export function createStudioEnvironment(): Scene {
  const studio = new Scene();
  studio.background = new Color().setScalar(0.45);
  const panelGeometry = new PlaneGeometry(1, 1);

  // Linear radiance, with a low-contrast surround and large key, rim, ceiling and fill panels.
  for (const [position, size, intensity] of [
    [[-3, 4, 4], [7, 9], 3],
    [[4, 2, -3], [5, 7], 2],
    [[0, 5, 0], [5, 5], 2],
    [[2, 1, 5], [5, 6], 1.5],
  ] as const) {
    const panel = new Mesh(
      panelGeometry,
      new MeshBasicMaterial({
        color: new Color().setScalar(intensity),
        side: DoubleSide,
      }),
    );
    panel.position.set(position[0], position[1], position[2]);
    panel.scale.set(size[0], size[1], 1);
    panel.lookAt(0, 0, 0);
    studio.add(panel);
  }

  return studio;
}
