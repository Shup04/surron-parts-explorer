'use client';

import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { CameraControls, GizmoHelper, GizmoViewport, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { scene as sceneColors } from '@/ui/tokens.json';
import { loadAssetModel } from './part-models';
import { savedCameraForScope, validateViewerAsset } from './asset-validation';
import { buildCatalogIndex } from '@/core/catalog';
import { easeProgress } from '@/core/explosion';
import type { ViewerProps, ViewerDiagnostics } from '@/core/types';
import { createDemoScene } from './demo-scene';
import {
  disposeScene,
  cameraRangeForBounds,
  explosionTargets,
  frameBounds,
  mappedPartId,
  partSet,
  prepareScene,
  selectionAtLevel,
  updateVisibility,
  visibleBounds,
} from './scene';

export type { ViewerProps } from '@/core/types';

class ViewerErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { message: string | null }
> {
  state = { message: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }
  render() {
    if (this.state.message)
      return (
        <div className="viewer-warning" role="alert">
          <strong>3D rendering is unavailable</strong>
          <p>{this.state.message}</p>
          <p>
            The catalog and component navigation remain available. Enable WebGL or try another
            browser.
          </p>
        </div>
      );
    return this.props.children;
  }
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const change = () => setReduced(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return reduced;
}

function MaterialEnvironment() {
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    const previous = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    const generator = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const environment = generator.fromScene(room, 0.04);
    room.dispose();
    generator.dispose();
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.7;
    invalidate();
    return () => {
      scene.environment = previous;
      scene.environmentIntensity = previousIntensity;
      environment.dispose();
    };
  }, [gl, scene, invalidate]);
  return null;
}

function Scene({
  object,
  props,
  onTip,
  onApproximate,
  onVisibleCount,
}: {
  object: THREE.Group;
  props: ViewerProps;
  onTip: (partId: string | null) => void;
  onApproximate: (value: boolean) => void;
  onVisibleCount: (value: number) => void;
}) {
  const { camera, gl, invalidate, size } = useThree();
  const reduced = useReducedMotion();
  const controls = useRef<CameraControls>(null);
  const previousFrame = useRef<{ reset: number; object: THREE.Object3D } | null>(null);
  const index = useMemo(() => buildCatalogIndex(props.catalog), [props.catalog]);
  const records = useMemo(() => prepareScene(object, props.mapping), [object, props.mapping]);
  const [localHover, setLocalHover] = useState<string | null>(null);
  const hovered = props.hoveredId ?? localHover;
  const hiddenKey = props.hiddenIds.join('|');
  const targetPositions = useMemo(
    () => explosionTargets(records, index, props.assemblyId, props.explosion, props.scopePartIds),
    [records, index, props.assemblyId, props.explosion, props.scopePartIds],
  );
  const animation = useRef<{
    elapsed: number;
    entries: {
      object: THREE.Object3D;
      from: THREE.Vector3;
      to: THREE.Vector3;
      duration: number;
      easing: 'linear' | 'smooth' | 'cubic';
    }[];
  } | null>(null);
  const materials = useMemo(() => {
    const original = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const selected = new Map<THREE.Material, THREE.Material>();
    const hovered = new Map<THREE.Material, THREE.Material>();
    object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      original.set(node, node.material);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (selected.has(material)) continue;
        for (const [destination, color, strength] of [
          [selected, sceneColors.selection, 0.13],
          [hovered, sceneColors.hover, 0.07],
        ] as const) {
          const highlighted = material.clone();
          const tint = new THREE.Color(color);
          if (highlighted instanceof THREE.MeshStandardMaterial) {
            // Keep the source finish and emission; add a restrained interaction tint.
            highlighted.emissive
              .multiplyScalar(highlighted.emissiveIntensity)
              .add(tint.clone().multiplyScalar(strength));
            highlighted.emissiveIntensity = 1;
          }
          if ('color' in highlighted && highlighted.color instanceof THREE.Color)
            highlighted.color.lerp(tint, strength);
          destination.set(material, highlighted);
        }
      }
    });
    return { original, selected, hovered };
  }, [object]);
  useEffect(
    () => () => {
      materials.original.forEach((material, mesh) => {
        mesh.material = material;
      });
      materials.selected.forEach((material) => material.dispose());
      materials.hovered.forEach((material) => material.dispose());
    },
    [materials],
  );

  useLayoutEffect(() => {
    onVisibleCount(
      updateVisibility(
        object,
        index,
        props.assemblyId,
        props.hiddenIds,
        props.isolatedId,
        props.scopePartIds,
      ),
    );
    setLocalHover(null);
    onTip(null);
    props.onHover?.(null);
    const moving = records.filter(
      (record) =>
        targetPositions.get(record.object)!.distanceTo(new THREE.Vector3(...record.original)) >
        0.00001,
    );
    onApproximate(
      moving.some(
        (record) =>
          record.automatic ||
          (!props.scopePartIds &&
            selectionAtLevel(index, record.partId, props.assemblyId) !== record.partId),
      ),
    );
    invalidate();
    // hiddenKey represents the full visibility set without recreating effects on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object, index, props.assemblyId, hiddenKey, props.isolatedId, targetPositions]);

  useLayoutEffect(() => {
    const selected =
      props.selectedId && props.selectedId !== props.assemblyId
        ? partSet(index, props.selectedId)
        : new Set<string>();
    const hover = hovered ? partSet(index, hovered) : new Set<string>();
    materials.original.forEach((original, mesh) => {
      const id = mappedPartId(mesh);
      const highlights =
        id && selected.has(id)
          ? materials.selected
          : id && hover.has(id)
            ? materials.hovered
            : null;
      mesh.material = highlights
        ? Array.isArray(original)
          ? original.map((material) => highlights.get(material)!)
          : highlights.get(original)!
        : original;
    });
    invalidate();
  }, [props.selectedId, props.assemblyId, hovered, index, materials, invalidate]);

  useLayoutEffect(() => {
    const entries = records.map((record) => ({
      object: record.object,
      from: record.object.position.clone(),
      to: targetPositions.get(record.object)!,
      duration: reduced ? 0 : Math.max(0.01, record.explosion?.duration ?? 0.7),
      easing: record.explosion?.easing ?? ('smooth' as const),
    }));
    if (reduced) {
      entries.forEach((entry) => entry.object.position.copy(entry.to));
      animation.current = null;
    } else animation.current = { elapsed: 0, entries };
    invalidate();
  }, [records, targetPositions, reduced, invalidate]);

  useEffect(() => {
    const control = controls.current;
    if (!control) return;
    // Frame the final exploded transforms without losing the current animation transforms.
    const positions = records.map((record) => record.object.position.clone());
    records.forEach((record) => record.object.position.copy(targetPositions.get(record.object)!));
    const allBounds = visibleBounds(object);
    let bounds = visibleBounds(
      object,
      props.selectedId !== props.assemblyId ? props.selectedId : null,
      index,
    );
    if (bounds.isEmpty()) bounds = allBounds.clone();
    records.forEach((record, i) => record.object.position.copy(positions[i]));
    object.updateMatrixWorld(true);
    if (bounds.isEmpty()) return;
    const diagonal = bounds.getSize(new THREE.Vector3()).length();
    const padding = Math.max(diagonal * 0.07, 0.012);
    bounds.expandByScalar(padding);
    const reset =
      previousFrame.current?.reset !== props.resetToken || previousFrame.current?.object !== object;
    const savedCamera = savedCameraForScope(
      props.mapping,
      props.asset,
      props.assemblyId,
      index.root.id,
    );
    const direction = reset
      ? new THREE.Vector3(0.75, 0.37, 1)
      : control.getPosition(new THREE.Vector3()).sub(control.getTarget(new THREE.Vector3()));
    const framing =
      savedCamera && reset && !props.scopePartIds
        ? {
            position: new THREE.Vector3(...savedCamera.position),
            target: new THREE.Vector3(...savedCamera.target),
          }
        : frameBounds(
            bounds,
            size.width / Math.max(size.height, 1),
            camera instanceof THREE.PerspectiveCamera ? camera.fov : 38,
            direction,
          );
    const range = cameraRangeForBounds(allBounds, framing.position, framing.target, bounds);
    control.minDistance = range.minDistance;
    control.maxDistance = range.maxDistance;
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.near = range.near;
      // The starting camera can be far from a model exported away from the origin.
      camera.far = Math.max(
        range.far,
        camera.position.distanceTo(allBounds.getCenter(new THREE.Vector3())) +
          allBounds.getSize(new THREE.Vector3()).length(),
      );
      camera.updateProjectionMatrix();
    }
    void control.setLookAt(...framing.position.toArray(), ...framing.target.toArray(), !reduced);
    previousFrame.current = { reset: props.resetToken, object };
    invalidate();
  }, [
    object,
    records,
    index,
    props.assemblyId,
    props.selectedId,
    props.resetToken,
    props.isolatedId,
    hiddenKey,
    targetPositions,
    props.mapping,
    props.asset?.assemblyId,
    reduced,
    size.width,
    size.height,
    invalidate,
  ]);

  const diagnostics = useRef('');
  const lastReport = useRef(0);
  useFrame((state, delta) => {
    if (animation.current) {
      animation.current.elapsed += Math.min(delta, 0.1);
      let unfinished = false;
      for (const entry of animation.current.entries) {
        const progress = entry.duration
          ? Math.min(1, animation.current.elapsed / entry.duration)
          : 1;
        entry.object.position.lerpVectors(
          entry.from,
          entry.to,
          easeProgress(progress, entry.easing),
        );
        if (progress === 1) entry.object.position.copy(entry.to);
        else unfinished = true;
      }
      if (unfinished) invalidate();
      else animation.current = null;
    }
    if (props.onDiagnostics && state.clock.elapsedTime - lastReport.current > 0.3) {
      const info = gl.info;
      let meshes = 0;
      object.traverseVisible((node) => {
        if (node instanceof THREE.Mesh && node.layers.mask !== 0) meshes++;
      });
      const result: ViewerDiagnostics = {
        meshes,
        triangles: info.render.triangles,
        drawCalls: info.render.calls,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      };
      const key = JSON.stringify(result);
      if (key !== diagnostics.current) {
        diagnostics.current = key;
        props.onDiagnostics(result);
      }
      lastReport.current = state.clock.elapsedTime;
    }
  });
  function identify(event: ThreeEvent<PointerEvent | MouseEvent>) {
    const mapped = mappedPartId(event.object);
    return mapped && index.byId.has(mapped)
      ? props.scopePartIds || props.asset?.models
        ? mapped
        : selectionAtLevel(index, mapped, props.assemblyId)
      : null;
  }
  return (
    <>
      <primitive
        object={object}
        onPointerMove={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          const id = identify(event);
          setLocalHover(id);
          onTip(id);
          props.onHover?.(id);
          gl.domElement.style.cursor = id ? 'pointer' : 'grab';
        }}
        onPointerOut={() => {
          setLocalHover(null);
          onTip(null);
          props.onHover?.(null);
          gl.domElement.style.cursor = 'grab';
        }}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          if (event.delta > 5) return;
          const id = identify(event);
          if (id) props.onSelect(id);
        }}
      />
      <CameraControls
        ref={controls}
        makeDefault
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI * 0.85}
        smoothTime={reduced ? 0 : 0.2}
        draggingSmoothTime={reduced ? 0 : 0.12}
        dollySpeed={0.7}
        truckSpeed={1.2}
        onChange={() => invalidate()}
      />
      <GizmoHelper alignment="bottom-right" margin={[48, 72]}>
        <GizmoViewport
          axisColors={[sceneColors.axisX, sceneColors.axisY, sceneColors.axisZ]}
          labelColor={sceneColors.background}
          hideNegativeAxes
        />
      </GizmoHelper>
      <ambientLight intensity={0.9} />
      <hemisphereLight args={[sceneColors.hemisphereSky, sceneColors.hemisphereGround, 2]} />
      <directionalLight position={[3, 5, 4]} intensity={4} color={sceneColors.key} />
      <directionalLight position={[-3, 3, -4]} intensity={3} color={sceneColors.fill} />
      <directionalLight position={[-2, 0.6, 3]} intensity={1} color={sceneColors.rim} />
      {props.assemblyId === index.root.id && (
        <Grid
          position={[0, -0.018, 0]}
          args={[200, 200]}
          cellSize={0.25}
          cellThickness={0.4}
          cellColor={sceneColors.grid}
          sectionSize={1}
          sectionThickness={0.8}
          sectionColor={sceneColors.gridSection}
          fadeDistance={7}
          fadeStrength={2}
          infiniteGrid
        />
      )}
    </>
  );
}

export default function Viewer(props: ViewerProps) {
  const [object, setObject] = useState<THREE.Group | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  const [approximate, setApproximate] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const [contextLost, setContextLost] = useState(false);
  const label = props.catalog.parts.find((part) => part.id === tip)?.name;
  const sceneProps = fallback ? { ...props, mapping: undefined } : props;
  const configurationError = useMemo(
    () =>
      props.asset && !fallback
        ? validateViewerAsset(props.asset, props.catalog, props.mapping, object)
        : null,
    [props.asset, props.catalog, props.mapping, object, fallback],
  );
  const displayError = error ?? configurationError;
  useEffect(() => {
    setFallback(false);
  }, [props.asset?.url]);
  useEffect(() => {
    let cancelled = false;
    let loaded: THREE.Group | null = null;
    setError(null);
    setObject(null);
    setLoading(true);
    if (!props.asset || fallback) {
      loaded = createDemoScene();
      setObject(loaded);
      setLoading(false);
    } else {
      void loadAssetModel(props.asset)
        .then((scene) => {
          if (cancelled) {
            disposeScene(scene);
            return;
          }
          loaded = scene;
          setObject(scene);
          setLoading(false);
        })
        .catch((reason) => {
          if (!cancelled) {
            setError(
              reason instanceof Error
                ? reason.message
                : 'The model could not be loaded. Check its URL and linked resources.',
            );
            setLoading(false);
          }
        });
    }
    return () => {
      cancelled = true;
      if (loaded) disposeScene(loaded);
    };
  }, [props.asset?.url, props.asset?.models, fallback]);
  return (
    <div
      className="viewer-canvas"
      data-testid="viewer"
      data-scene-ready={!!object && !loading && !displayError}
      data-visible-meshes={visibleCount}
      aria-label="Interactive 3D motorcycle viewer"
      onPointerMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        pointer.current = {
          x: Math.max(8, Math.min(event.clientX - box.left + 16, box.width - 220)),
          y: Math.max(8, event.clientY - box.top - 43),
        };
        if (tooltipRef.current) {
          tooltipRef.current.style.left = `${pointer.current.x}px`;
          tooltipRef.current.style.top = `${pointer.current.y}px`;
        }
      }}
    >
      <ViewerErrorBoundary>
        <Canvas
          frameloop="demand"
          dpr={[1, 1.75]}
          camera={{ position: [2.4, 1.8, 3], fov: 38, near: 0.001, far: 100 }}
          gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
          onCreated={({ gl }) => {
            gl.domElement.style.touchAction = 'none';
            gl.domElement.addEventListener('webglcontextlost', () => setContextLost(true));
            gl.domElement.addEventListener('webglcontextrestored', () => setContextLost(false));
          }}
        >
          <MaterialEnvironment />
          <Suspense fallback={null}>
            {object && !displayError && (
              <Scene
                object={object}
                props={sceneProps}
                onTip={setTip}
                onApproximate={setApproximate}
                onVisibleCount={setVisibleCount}
              />
            )}
          </Suspense>
        </Canvas>
      </ViewerErrorBoundary>
      {loading && !displayError && (
        <div className="viewer-warning viewer-loader" role="status">
          Loading 3D geometry…
        </div>
      )}
      {displayError && (
        <div className="viewer-warning" role="alert">
          <strong>Asset unavailable</strong>
          <p>{displayError}</p>
          <button type="button" onClick={() => setFallback(true)}>
            Use demonstration geometry
          </button>
        </div>
      )}
      {object && !loading && !displayError && visibleCount === 0 && (
        <div className="viewer-warning" role="status">
          No visible geometry for this selection. Show hidden components or add the missing catalog
          mappings in the model editor.
        </div>
      )}
      {contextLost && (
        <div className="viewer-warning" role="alert">
          The graphics context was interrupted. Reload the page to restore the viewer.
        </div>
      )}
      {fallback && (
        <div className="viewer-fallback">Demonstration geometry · Asset unavailable</div>
      )}
      {label && (
        <div
          ref={tooltipRef}
          className="viewer-tooltip"
          role="tooltip"
          style={{
            left: pointer.current.x,
            top: pointer.current.y,
          }}
        >
          {label}
        </div>
      )}
      {approximate && props.explosion > 0 && (
        <div className="viewer-layout-note" role="status">
          Approximate layout · Not mechanically verified
        </div>
      )}
    </div>
  );
}
