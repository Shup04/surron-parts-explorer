'use client';

import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  CameraControls,
  CameraControlsImpl,
  GizmoHelper,
  GizmoViewport,
  Grid,
} from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import tokens from '@/ui/tokens.json';
import { AssetModelLoader, priorityModelIds, type ModelLoadSnapshot } from './part-models';
import { ModelLoadStatus } from './ModelLoadStatus';
import { PointerGesture } from './pointer-gesture';
import {
  assembledScopeBounds,
  createInspectionMaterials,
  inspectionHit,
  inspectionPlane,
} from './inspection';
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

const sceneColors = tokens.scene;

export type { ViewerProps } from '@/core/types';

class ViewerErrorBoundary extends React.Component<
  { children: React.ReactNode; onRetry: () => void },
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
          <button type="button" onClick={this.props.onRetry}>
            Try 3D again
          </button>
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

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    setCoarse(query.matches);
    const change = () => setCoarse(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return coarse;
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

function ContextRecovery({ onChange }: { onChange: (lost: boolean) => void }) {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      onChange(true);
    };
    const restored = () => {
      onChange(false);
      invalidate();
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
    };
  }, [gl, invalidate, onChange]);
  return null;
}

function SectionGuide({ bounds, plane }: { bounds: THREE.Box3; plane: THREE.Plane }) {
  const axis = plane.normal.x ? 'x' : plane.normal.y ? 'y' : 'z';
  const geometry = useMemo(() => {
    const size = bounds.getSize(new THREE.Vector3()).multiplyScalar(1.08);
    const width = Math.max(axis === 'x' ? size.z : size.x, 0.01) / 2;
    const height = Math.max(axis === 'y' ? size.z : size.y, 0.01) / 2;
    return new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-width, -height, 0),
      new THREE.Vector3(width, -height, 0),
      new THREE.Vector3(width, height, 0),
      new THREE.Vector3(-width, height, 0),
    ]);
  }, [bounds, axis]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const center = bounds.getCenter(new THREE.Vector3());
  center[axis] = -plane.constant / plane.normal[axis];
  const rotation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    plane.normal,
  );
  return (
    <lineLoop geometry={geometry} position={center} quaternion={rotation} raycast={() => undefined}>
      <lineBasicMaterial
        color={sceneColors.selection}
        transparent
        opacity={0.65}
        depthWrite={false}
      />
    </lineLoop>
  );
}

function Scene({
  object,
  revision,
  gesture,
  props,
  onTip,
  onApproximate,
  onVisibleCount,
}: {
  object: THREE.Group;
  revision: number;
  gesture: PointerGesture;
  props: ViewerProps;
  onTip: (partId: string | null) => void;
  onApproximate: (value: boolean) => void;
  onVisibleCount: (value: number) => void;
}) {
  const { camera, gl, invalidate, size } = useThree();
  const reduced = useReducedMotion();
  const coarsePointer = useCoarsePointer();
  const controls = useRef<CameraControls>(null);
  const previousFrame = useRef<{ reset: number; object: THREE.Object3D; boundsKey: string } | null>(
    null,
  );
  const index = useMemo(() => buildCatalogIndex(props.catalog), [props.catalog]);
  const records = useMemo(
    () => prepareScene(object, props.mapping),
    [object, props.mapping, revision],
  );
  const focusIds = useMemo(
    () =>
      new Set((props.scopePartIds ?? [props.assemblyId]).flatMap((id) => [...partSet(index, id)])),
    [index, props.assemblyId, props.scopePartIds],
  );
  const focusBounds = useMemo(() => assembledScopeBounds(records, focusIds), [records, focusIds]);
  const section = props.inspection?.section;
  const plane = useMemo(
    () => inspectionPlane(focusBounds, section ?? null),
    [focusBounds, section?.axis, section?.position, section?.flipped],
  );
  const inspecting = !!props.inspection;
  const [localHover, setLocalHover] = useState<string | null>(null);
  const hovered = props.hoveredId ?? localHover;
  useEffect(() => {
    const canvas = gl.domElement;
    const document = canvas.ownerDocument;
    const window = document.defaultView;
    const clearHover = () => {
      setLocalHover(null);
      onTip(null);
      props.onHover?.(null);
    };
    const cancel = () => {
      gesture.cancel();
      controls.current?.cancel();
      clearHover();
      canvas.style.cursor = 'grab';
    };
    const down = (event: PointerEvent) => {
      gesture.start(event);
      clearHover();
      canvas.style.cursor = 'grabbing';
      // Retain an ongoing drag when a finger or mouse leaves the canvas.
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic events and an already-cancelled pointer have no active capture.
      }
    };
    const move = (event: PointerEvent) => {
      if (!gesture.hasPointer(event.pointerId)) return;
      if (event.pointerType === 'mouse' && event.buttons === 0) cancel();
      else gesture.move(event);
    };
    const up = (event: PointerEvent) => {
      gesture.end(event);
      if (!gesture.active) canvas.style.cursor = 'grab';
    };
    const interrupted = (event: PointerEvent) => {
      if (gesture.hasPointer(event.pointerId)) cancel();
    };
    const visibility = () => {
      if (document.hidden) cancel();
    };
    const preventGesture = (event: Event) => {
      if (event.cancelable) event.preventDefault();
    };
    const preventTouchScroll = (event: TouchEvent) => {
      if (gesture.dragging) preventGesture(event);
    };
    canvas.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', interrupted, true);
    canvas.addEventListener('lostpointercapture', interrupted);
    canvas.addEventListener('webglcontextlost', cancel);
    // Scope Safari's native gesture suppression to the interactive canvas.
    canvas.addEventListener('gesturestart', preventGesture, { passive: false });
    canvas.addEventListener('gesturechange', preventGesture, { passive: false });
    canvas.addEventListener('touchmove', preventTouchScroll, { passive: false });
    document.addEventListener('visibilitychange', visibility);
    window?.addEventListener('blur', cancel);
    return () => {
      cancel();
      canvas.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', interrupted, true);
      canvas.removeEventListener('lostpointercapture', interrupted);
      canvas.removeEventListener('webglcontextlost', cancel);
      canvas.removeEventListener('gesturestart', preventGesture);
      canvas.removeEventListener('gesturechange', preventGesture);
      canvas.removeEventListener('touchmove', preventTouchScroll);
      document.removeEventListener('visibilitychange', visibility);
      window?.removeEventListener('blur', cancel);
    };
  }, [gl, gesture, onTip, props.onHover]);
  const hiddenKey = props.hiddenIds.join('|');
  const frameContext = JSON.stringify([
    props.assemblyId,
    [...focusIds],
    props.explosion,
    props.showSurroundings,
    hiddenKey,
    props.isolatedId,
    props.resetToken,
    size.width,
    size.height,
  ]);
  const targetPositions = useMemo(
    () =>
      explosionTargets(
        records,
        index,
        props.assemblyId,
        props.explosion,
        props.scopePartIds,
        props.explosionGroups,
      ),
    [records, index, props.assemblyId, props.explosion, props.scopePartIds, props.explosionGroups],
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
  const materials = useMemo(() => createInspectionMaterials(object), [object]);
  useLayoutEffect(() => () => materials.dispose(), [materials]);

  useLayoutEffect(() => {
    onVisibleCount(
      updateVisibility(
        object,
        index,
        props.showSurroundings ? index.root.id : props.assemblyId,
        props.hiddenIds,
        props.isolatedId,
        props.showSurroundings ? undefined : props.scopePartIds,
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
          record.explosion?.verification !== 'mechanically-verified' ||
          (!props.scopePartIds &&
            selectionAtLevel(index, record.partId, props.assemblyId) !== record.partId),
      ),
    );
    invalidate();
    // hiddenKey represents the full visibility set without recreating effects on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    object,
    index,
    props.assemblyId,
    props.showSurroundings,
    hiddenKey,
    props.isolatedId,
    targetPositions,
  ]);

  useLayoutEffect(() => {
    const selected =
      props.selectedId && props.selectedId !== props.assemblyId
        ? partSet(index, props.selectedId)
        : new Set<string>();
    const component = !!props.selectedId && index.byId.get(props.selectedId)?.kind === 'component';
    materials.apply({
      selected,
      hovered: hovered ? partSet(index, hovered) : new Set<string>(),
      solid: component ? selected : focusIds,
      fade: props.inspection?.fadeSurroundings ?? false,
      plane,
      keepSelectedUncut: component && inspecting,
    });
    invalidate();
  }, [
    revision,
    props.selectedId,
    props.assemblyId,
    props.inspection?.fadeSurroundings,
    inspecting,
    hovered,
    index,
    materials,
    focusIds,
    plane,
    invalidate,
  ]);

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
    let bounds =
      props.showSurroundings && !props.isolatedId && !focusBounds.isEmpty()
        ? focusBounds.clone()
        : visibleBounds(
            object,
            props.scopePartIds && props.scopePartIds.length > 1
              ? null
              : props.selectedId !== props.assemblyId
                ? props.selectedId
                : null,
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
    const boundsKey = JSON.stringify([
      bounds.min,
      bounds.max,
      frameContext,
      inspecting ? null : props.selectedId,
    ]);
    // New surrounding models may extend clipping/zoom ranges without moving the view.
    const shouldFrame = reset || previousFrame.current?.boundsKey !== boundsKey;
    const savedCamera = savedCameraForScope(
      props.mapping,
      props.asset,
      props.assemblyId,
      index.root.id,
    );
    const direction = reset
      ? new THREE.Vector3(0.75, 0.37, 1)
      : control.getPosition(new THREE.Vector3()).sub(control.getTarget(new THREE.Vector3()));
    const framing = !shouldFrame
      ? {
          position: control.getPosition(new THREE.Vector3()),
          target: control.getTarget(new THREE.Vector3()),
        }
      : savedCamera && reset && !props.scopePartIds
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
    if (shouldFrame)
      void control.setLookAt(...framing.position.toArray(), ...framing.target.toArray(), !reduced);
    previousFrame.current = { reset: props.resetToken, object, boundsKey };
    invalidate();
  }, [
    object,
    records,
    index,
    props.assemblyId,
    props.selectedId,
    props.showSurroundings,
    inspecting,
    frameContext,
    focusBounds,
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
    const hit = inspectionHit(event.intersections, materials.faded);
    const mapped = hit ? mappedPartId(hit.object) : null;
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
        dispose={null}
        onPointerMove={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          if (event.pointerType === 'touch' || gesture.active) return;
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
          if (!gesture.consumeClick(event.nativeEvent)) return;
          const id = identify(event);
          if (id) props.onSelect(id);
        }}
      />
      {plane && <SectionGuide bounds={focusBounds} plane={plane} />}
      <CameraControls
        ref={controls}
        makeDefault
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI * 0.85}
        smoothTime={reduced ? 0 : 0.2}
        draggingSmoothTime={reduced ? 0 : 0.12}
        dollySpeed={0.7}
        truckSpeed={1.2}
        touches={{
          one: CameraControlsImpl.ACTION.TOUCH_ROTATE,
          two: CameraControlsImpl.ACTION.TOUCH_DOLLY_TRUCK,
          three: CameraControlsImpl.ACTION.TOUCH_DOLLY_TRUCK,
        }}
        onChange={() => invalidate()}
      />
      {!coarsePointer && (
        <GizmoHelper alignment="bottom-right" margin={[48, 72]}>
          <GizmoViewport
            axisColors={[sceneColors.axisX, sceneColors.axisY, sceneColors.axisZ]}
            labelColor={sceneColors.background}
            hideNegativeAxes
          />
        </GizmoHelper>
      )}
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
  const [demo, setDemo] = useState<THREE.Group | null>(null);
  const [loadState, setLoadState] = useState<ModelLoadSnapshot | null>(null);
  const loader = useRef<AssetModelLoader | null>(null);
  const gesture = useMemo(() => new PointerGesture(), []);
  const [fallback, setFallback] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  const [approximate, setApproximate] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const [contextLost, setContextLost] = useState(false);
  const [renderAttempt, setRenderAttempt] = useState(0);
  const retryRendering = () => {
    setContextLost(false);
    setRenderAttempt((attempt) => attempt + 1);
  };
  const object = !props.asset || fallback ? demo : (loadState?.scene ?? null);
  const loading = !!props.asset && !fallback && (!loadState || loadState.loading);
  const revision = !props.asset || fallback ? 0 : (loadState?.revision ?? 0);
  const index = useMemo(() => buildCatalogIndex(props.catalog), [props.catalog]);
  const priority = useMemo(
    () =>
      props.asset
        ? priorityModelIds(
            props.asset,
            props.mapping,
            props.scopePartIds ? new Set(props.scopePartIds) : partSet(index, props.assemblyId),
          )
        : [],
    [props.asset, props.mapping, props.scopePartIds, props.assemblyId, index],
  );
  const label = props.catalog.parts.find((part) => part.id === tip)?.name;
  const sceneProps = fallback ? { ...props, mapping: undefined } : props;
  const configurationError = useMemo(
    () =>
      props.asset && !fallback
        ? validateViewerAsset(
            props.asset,
            props.catalog,
            props.mapping,
            object,
            loadState?.models.filter((model) => model.status !== 'loaded').map((model) => model.id),
          )
        : null,
    [props.asset, props.catalog, props.mapping, object, revision, loadState, fallback],
  );
  const displayError = configurationError;
  useEffect(() => {
    setFallback(false);
  }, [props.asset?.url]);
  useEffect(() => {
    const current = new AssetModelLoader();
    loader.current = current;
    const unsubscribe = current.subscribe(() => setLoadState(current.getSnapshot()));
    return () => {
      unsubscribe();
      current.dispose();
    };
  }, []);
  useEffect(() => {
    loader.current?.update(!fallback ? (props.asset ?? null) : null, priority);
    // Priority changes reorder the existing queue without replacing the asset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.asset, fallback]);
  useEffect(() => {
    loader.current?.prioritize(priority);
  }, [priority]);
  useEffect(() => {
    if (!props.asset || fallback) {
      const scene = createDemoScene();
      setDemo(scene);
      return () => disposeScene(scene);
    }
    setDemo(null);
  }, [!!props.asset, fallback]);
  return (
    <div
      className="viewer-canvas"
      data-testid="viewer"
      data-scene-ready={!!object && visibleCount > 0 && !displayError && !contextLost}
      data-load-complete={!loading}
      data-loaded-models={loadState?.loaded ?? 0}
      data-failed-models={loadState?.failed ?? 0}
      data-visible-meshes={visibleCount}
      aria-label="Interactive 3D motorcycle viewer"
      onPointerMove={(event) => {
        if (event.pointerType === 'touch') return;
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
      <ViewerErrorBoundary key={renderAttempt} onRetry={retryRendering}>
        <Canvas
          frameloop="demand"
          onPointerMissed={(event) => {
            if (gesture.consumeClick(event)) props.onDeselect?.();
          }}
          dpr={[1, 1.75]}
          camera={{ position: [2.4, 1.8, 3], fov: 38, near: 0.001, far: 100 }}
          gl={{
            antialias: true,
            powerPreference: 'high-performance',
            alpha: true,
            localClippingEnabled: true,
          }}
          onCreated={({ gl }) => {
            gl.domElement.style.touchAction = 'none';
          }}
        >
          <ContextRecovery onChange={setContextLost} />
          <MaterialEnvironment />
          <Suspense fallback={null}>
            {object && !displayError && (
              <Scene
                object={object}
                revision={revision}
                gesture={gesture}
                props={sceneProps}
                onTip={setTip}
                onApproximate={setApproximate}
                onVisibleCount={setVisibleCount}
              />
            )}
          </Suspense>
        </Canvas>
      </ViewerErrorBoundary>
      {!fallback && !displayError && (
        <ModelLoadStatus
          state={loadState}
          onRetry={(id) => loader.current?.retry(id)}
          onFallback={() => setFallback(true)}
        />
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
      {object && !loading && !displayError && !loadState?.failed && visibleCount === 0 && (
        <div className="viewer-warning" role="status">
          No visible geometry for this selection. Show hidden components or add the missing catalog
          mappings in the model editor.
        </div>
      )}
      {contextLost && (
        <div className="viewer-warning" role="alert">
          <strong>3D view interrupted</strong>
          <p>
            Your selection is unchanged. You can continue browsing parts or restore the 3D view.
          </p>
          <button type="button" onClick={retryRendering}>
            Restore 3D view
          </button>
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
