# 3D viewer implementation

`src/viewer/Viewer.tsx` is a client-only React Three Fiber viewer. Its public interface is `ViewerProps` in `src/core/types.ts`. Catalog navigation and URL state belong to the application, not the renderer. The renderer emits stable part IDs through `onSelect` and `onHover`.

The supplied motorcycle and jackshaft geometry is synthetic demonstration content. Shape, proportions, quantity, and explosion distances are not measurements of a Sur-Ron. The demo creates a recognizable motorcycle silhouette and separately selectable shaft, bearing, spacer, sprocket, clip, and fastener objects to exercise the complete workflow. It must not be used to infer dimensions or interchangeability.

## Geometry and identification

`demo-scene.ts` is the only renderer file with predefined catalog part IDs. `scene.ts` implements generic hierarchy selection, visibility, mapping, framing, and explosion targets. No interaction branches on an assembly name.

For demo objects, `userData.partId` identifies the mapped group. For production assets, supply an `AssetDefinition` and an external `MappingConfig`. `getObjectKey(object, assetRoot)` uses persistent glTF extras `objectId` when present, otherwise an indexed scene path. The asset root is explicit so attaching the scene to the R3F canvas never changes lookup keys. Duplicate object keys are not silently selected. A mapped group supplies the part ID for descendants unless a descendant has its own mapping.

Loaders preserve imported object names, parent relationships, matrices, positions, rotations, scale, and origins. They do not center, rescale, merge, or apply transforms to the asset. Internal distances are metres, with Y up. Validate millimetre conversions in the import workflow before loading an asset.

## Selection, visibility, and framing

A click selects the next catalog assembly at the current hierarchy level. Opening that assembly exposes its descendants. Both keyboard list selection and 3D picking use the same catalog IDs. Hidden meshes also receive an empty raycast layer mask because Three.js raycasting does not automatically exclude objects with `visible = false`.

Highlight materials are clones cached per original material. Hover and selection swap the mesh's material reference, then restore the exact reference when the highlight ends. Original imported colors and material properties are not modified. Multi-material meshes are supported.

CameraControls supports drag to orbit, wheel/pinch to zoom, and right-drag/two-finger pan. Camera framing computes a perspective fit from all bounding-box corners and the viewport aspect ratio. It preserves the current viewing angle; explicit reset restores the default angle. A saved mapping camera is used at the loaded asset's assembly root when resetting. This supports both full-motorcycle and dedicated nested-assembly models. All navigation, reset, and explosion framing animate unless the browser requests reduced motion.

## Explosion configuration

Each `ObjectMapping` can define:

```json
{
  "objectKey": "id:jackshaft-bearing-left",
  "partId": "bearing-left",
  "explosion": {
    "direction": [0, 0, -1],
    "distance": 0.12,
    "duration": 0.8,
    "easing": "cubic",
    "verification": "demonstration"
  }
}
```

Distances are metres in the object's **parent coordinate system**. Directions are normalized. Account for parent rotation and scale when assigning vectors; do not apply transforms automatically to make them look correct. The example is demonstration data, not a valid disassembly instruction.

An explosion amount of 0 restores captured original positions exactly. Every target is calculated from the captured original, never from an earlier animated frame. Rotation and scale remain unchanged. Mapped descendants move with their mapped ancestor when the ancestor is the active exploded component, preventing double displacement. A flat imported scene with several meshes assigned to one catalog component receives the same approximate offset for that component.

Objects without an applicable manual configuration use an optional approximate visual layout when the user increases the explosion amount. The viewer labels that layout as not mechanically verified. A manually configured vector is not itself proof of mechanical validity: catalog and mapping verification status must also be reviewed by the owner.

## Loading and failure behavior

`load-model.ts` loads GLB and glTF with Meshopt support bundled locally. Draco support uses `https://www.gstatic.com/draco/versioned/decoders/1.5.7/` by default. For offline or restrictive CSP deployments, self-host the matching Draco decoder files and pass `decoderPath` to `loadModel`. Ordinary uncompressed GLB files do not need the external Draco decoder.

Only the current asset URL is loaded. The application can resolve an assembly to a dedicated asset URL; changing it releases the previous scene. This makes separate full-bike and detailed-assembly assets practical without changing the renderer. Loading an assembly currently replaces its scene after loading; no global asset prefetch is performed.

Configured assets are validated against their declared asset ID, catalog assembly, metre/Y-up conventions, mapping schema, catalog part IDs, and actual loaded scene object keys. Missing, ambiguous, or mismatched references produce explicit errors rather than silent selection failures.

Network errors, invalid geometry, and missing buffers/textures produce a visible load error with an explicit demonstration-fallback button. A graphics initialization error leaves the DOM catalog available. A graphics-context interruption displays recovery guidance. Empty selections explain that mappings or visibility may need attention. A late response from a superseded load is discarded and disposed.

## Performance and verification

The canvas uses demand rendering. Explosion animation and camera controls explicitly invalidate frames; it becomes idle after motion settles. Device pixel ratio is capped at 1.75. The demonstration shares materials and repeated geometries and instances wheel tread blocks. It uses lightweight directional lighting and a fading grid without postprocessing or shadow-map passes.

`onDiagnostics` reports visible meshes, triangle count, draw calls, geometry allocations, and texture allocations. These are WebGL renderer counters, not a claim of a target frame rate. Geometry budgets must be measured on intended devices with actual models. Thousands of separate high-detail meshes still create substantial draw calls; supply a simplified whole-bike GLB and load detailed assemblies separately, instance appropriate fasteners, and use Meshopt/Draco as appropriate. The viewer does not silently decimate precise source geometry.

The DOM wrapper exposes `data-scene-ready` and `data-visible-meshes` for browser integration checks. `tests/viewer.test.ts` exercises actual Three.js objects: mapping, contextual selection, visibility/raycast masks, nested explosion, exact restoration, flat-scene grouping, replacement geometry, ambiguous mappings, instanced bounds, and narrow-screen camera fitting. Browser tests must additionally exercise real WebGL picking, dragging, touch, deep links, and the editor-to-viewer workflow. Real-device mobile performance and final mechanical alignment require owner verification with the final assets.

Official references: [React Three Fiber demand rendering](https://r3f.docs.pmnd.rs/advanced/scaling-performance), [Drei CameraControls](https://drei.docs.pmnd.rs/controls/camera-controls), [Three.js GLTFLoader](https://threejs.org/docs/#examples/en/loaders/GLTFLoader).
