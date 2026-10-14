'use client';

import { Suspense, useEffect, useMemo, useRef, type RefObject } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { scene as sceneColors } from '@/ui/tokens.json';
import type { MappingConfig, Vec3 } from '@/core/types';
import { getObjectKey } from '@/core/mapping';
import { easeProgress, explosionOffset } from '@/core/explosion';

export type CameraCommand = { id: number; kind: 'all' | 'selection' | 'saved' };
interface Props {
  scene: THREE.Group;
  mapping: MappingConfig;
  selected: string[];
  hovered: string | null;
  hidden: string[];
  isolated: string[] | null;
  amount: number;
  cameraCommand: CameraCommand;
  cameraSnapshot: RefObject<MappingConfig['camera']>;
  onSelect: (key: string | null, additive: boolean) => void;
  onHover: (key: string | null) => void;
}

function ModelScene(props: Props) {
  const {
    scene,
    mapping,
    selected,
    hovered,
    hidden,
    isolated,
    amount,
    cameraCommand,
    cameraSnapshot,
    onSelect,
    onHover,
  } = props;
  const { camera, invalidate } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const entries = useMemo(() => {
    const result: {
      key: string;
      object: THREE.Object3D;
      original: THREE.Vector3;
      visible: boolean;
    }[] = [];
    scene.traverse((object) =>
      result.push({
        key: getObjectKey(object, scene),
        object,
        original: object.position.clone(),
        visible: object.visible,
      }),
    );
    return result;
  }, [scene]);
  const keyByObject = useMemo(
    () => new Map(entries.map((entry) => [entry.object, entry.key])),
    [entries],
  );
  const selectionBoxes = useMemo(
    () =>
      [...selected, ...(hovered && !selected.includes(hovered) ? [hovered] : [])]
        .map((key) => entries.find((entry) => entry.key === key))
        .filter((entry) => !!entry)
        .map((entry) => {
          const helper = new THREE.BoxHelper(
            entry.object,
            selected.includes(entry.key) ? sceneColors.selection : sceneColors.hover,
          );
          helper.raycast = () => {};
          helper.material.depthTest = false;
          helper.renderOrder = 10;
          return { helper, object: entry.object };
        }),
    [entries, selected, hovered],
  );
  const animation = useRef<
    {
      entry: (typeof entries)[number];
      from: THREE.Vector3;
      target: THREE.Vector3;
      elapsed: number;
      duration: number;
      easing: 'linear' | 'smooth' | 'cubic';
    }[]
  >([]);

  useEffect(() => {
    const byKey = new Map(mapping.mappings.map((item) => [item.objectKey, item]));
    animation.current = entries.map((entry) => {
      const explosion = byKey.get(entry.key)?.explosion;
      const offset = explosionOffset(explosion, amount);
      return {
        entry,
        from: entry.object.position.clone(),
        target: entry.original.clone().add(new THREE.Vector3(...offset)),
        elapsed: 0,
        duration: explosion?.duration ?? 0.5,
        easing: explosion?.easing ?? 'smooth',
      };
    });
    invalidate();
  }, [entries, mapping, amount, invalidate]);

  useEffect(() => {
    const hiddenSet = new Set(hidden);
    const isolatedObjects = isolated
      ?.map((key) => entries.find((entry) => entry.key === key)?.object)
      .filter(Boolean) as THREE.Object3D[] | undefined;
    for (const entry of entries) {
      let related = !isolatedObjects?.length;
      if (isolatedObjects?.length) {
        let ancestor: THREE.Object3D | null = entry.object;
        while (ancestor && !related) {
          related = isolatedObjects.includes(ancestor);
          ancestor = ancestor.parent;
        }
        if (!related)
          for (const target of isolatedObjects) {
            let parent: THREE.Object3D | null = target;
            while (parent) {
              if (parent === entry.object) {
                related = true;
                break;
              }
              parent = parent.parent;
            }
          }
      }
      entry.object.visible = entry.visible && !hiddenSet.has(entry.key) && related;
    }
    invalidate();
  }, [entries, hidden, isolated, invalidate]);

  useEffect(
    () => () => {
      for (const entry of entries) {
        entry.object.position.copy(entry.original);
        entry.object.visible = entry.visible;
      }
    },
    [entries],
  );

  useEffect(
    () => () => {
      for (const { helper } of selectionBoxes) {
        helper.geometry.dispose();
        helper.material.dispose();
      }
    },
    [selectionBoxes],
  );

  useEffect(() => {
    if (!controls.current) return;
    if (cameraCommand.kind === 'saved' && mapping.camera) {
      camera.position.set(...mapping.camera.position);
      controls.current.target.set(...mapping.camera.target);
    } else {
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3();
      const focusEntries =
        cameraCommand.kind === 'selection' && selected.length
          ? entries.filter((entry) => selected.includes(entry.key))
          : [{ object: scene }];
      focusEntries.forEach((entry) => box.expandByObject(entry.object));
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.length() / 2, 0.005);
      const perspective = camera as THREE.PerspectiveCamera;
      const vertical = THREE.MathUtils.degToRad(perspective.fov || 45) / 2;
      const horizontal = Math.atan(Math.tan(vertical) * (perspective.aspect || 1));
      const distance = (radius / Math.sin(Math.min(vertical, horizontal))) * 1.25;
      camera.position
        .copy(center)
        .add(new THREE.Vector3(1.2, 0.65, 1.5).normalize().multiplyScalar(distance));
      controls.current.target.copy(center);
      perspective.near = Math.max(radius / 1000, 0.00001);
      perspective.far = Math.max(distance * 100, 100);
      perspective.updateProjectionMatrix();
      controls.current.minDistance = radius / 100;
      controls.current.maxDistance = distance * 20;
    }
    controls.current.update();
    cameraSnapshot.current = {
      position: camera.position.toArray() as Vec3,
      target: controls.current.target.toArray() as Vec3,
    };
    invalidate();
    // Camera framing is an explicit command, not a side effect of selection or sliders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraCommand, scene]);

  useFrame((_, delta) => {
    let active = false;
    for (const step of animation.current) {
      if (step.elapsed >= step.duration) continue;
      step.elapsed = Math.min(step.duration, step.elapsed + delta);
      const progress = easeProgress(step.elapsed / step.duration, step.easing);
      step.entry.object.position.lerpVectors(step.from, step.target, progress);
      if (step.elapsed === step.duration) step.entry.object.position.copy(step.target);
      else active = true;
    }
    scene.updateMatrixWorld(true);
    selectionBoxes.forEach(({ helper, object: selectedObject }) => {
      let object: THREE.Object3D | null = selectedObject;
      helper.visible = true;
      while (object) {
        if (!object.visible) {
          helper.visible = false;
          break;
        }
        object = object.parent;
      }
      if (helper.visible) helper.update();
    });
    if (active) invalidate();
  });

  function click(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    if (event.delta > 5) return;
    onSelect(
      keyByObject.get(event.object) ?? null,
      event.shiftKey || event.ctrlKey || event.metaKey,
    );
  }

  return (
    <>
      <ambientLight intensity={1.15} />
      <hemisphereLight args={[sceneColors.hemisphereSky, sceneColors.hemisphereGround, 1.7]} />
      <directionalLight position={[4, 6, 5]} intensity={3} color={sceneColors.key} />
      <directionalLight position={[-3, 2, -4]} intensity={2} color={sceneColors.fill} />
      <primitive
        object={scene}
        dispose={null}
        onClick={click}
        onPointerMove={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          onHover(keyByObject.get(event.object) ?? null);
        }}
        onPointerOut={() => onHover(null)}
      />
      {selectionBoxes.map(({ helper }) => (
        <primitive key={helper.uuid} object={helper} />
      ))}
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.09}
        onEnd={() => {
          if (controls.current)
            cameraSnapshot.current = {
              position: camera.position.toArray() as Vec3,
              target: controls.current.target.toArray() as Vec3,
            };
        }}
      />
    </>
  );
}

export function EditorCanvas(props: Props) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.75]}
      camera={{ position: [2, 1.5, 3], fov: 42 }}
      onPointerMissed={(event) => {
        if (event.type === 'click') props.onSelect(null, false);
      }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={[sceneColors.background]} />
      <Suspense fallback={null}>
        <ModelScene {...props} />
      </Suspense>
    </Canvas>
  );
}
