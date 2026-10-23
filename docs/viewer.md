# 3D viewer implementation

`src/viewer/Viewer.tsx` is a client-only React Three Fiber viewer. Its public interface is `ViewerProps` in `src/core/types.ts`. Catalog navigation and URL state belong to the application, not the renderer. The renderer emits stable part IDs through `onSelect` and `onHover`.

The project assembly loads 39 supplied Blender parts from `public/parts/`. Its manifest records readable filenames, physical roles, materials, triangle counts, file hashes and source bounds. The main frame has 60,000 triangles, and the complete supplied assembly has 1,283,637. All parts retain their authored placement. Frame and swingarm share the purple metallic finish, including embedded flake textures and clearcoat.

The motorcycle and jackshaft geometry at `?demo=1` remains synthetic demonstration content. Shape, proportions, quantity, and explosion distances are not measurements of a Sur-Ron. The demo creates a recognizable motorcycle silhouette and separately selectable shaft, bearing, spacer, sprocket, clip, and fastener objects to exercise the complete workflow. It must not be used to infer dimensions or interchangeability.

## Geometry and identification

`demo-scene.ts` is the only renderer file with predefined catalog part IDs. `scene.ts` implements generic hierarchy selection, visibility, mapping, framing, and explosion targets. No interaction branches on an assembly name.

For demo objects, `userData.partId` identifies the mapped group. For production assets, supply an `AssetDefinition` and an external `MappingConfig`. `getObjectKey(object, assetRoot)` uses persistent glTF extras `objectId` when present, otherwise an indexed scene path. The asset root is explicit so attaching the scene to the R3F canvas never changes lookup keys. Duplicate object keys are not silently selected. A mapped group supplies the part ID for descendants unless a descendant has its own mapping.

Loaders preserve imported object names, parent relationships, matrices, positions, rotations, scale, and origins. They do not center, rescale, merge, or apply transforms to the asset. Internal distances are metres, with Y up. Validate millimetre conversions in the import workflow before loading an asset.

## Selection, visibility, and framing

A click selects the next catalog assembly at the current hierarchy level. Opening that assembly exposes its descendants. Both keyboard list selection and 3D picking use the same catalog IDs. Hidden meshes also receive an empty raycast layer mask because Three.js raycasting does not automatically exclude objects with `visible = false`.

Highlight materials are clones cached per original material. Hover and selection swap the mesh's material reference, then restore the exact reference when the highlight ends. Original imported colors and material properties are not modified. Multi-material meshes are supported.

CameraControls supports drag to orbit, wheel/pinch to zoom, and right-drag/two-finger pan. Camera framing computes a perspective fit from all bounding-box corners and the viewport aspect ratio. It preserves the current viewing angle; explicit reset restores the default angle. A saved mapping camera is used at the loaded asset's assembly root when resetting. This supports both full-motorcycle and dedicated nested-assembly models. All navigation, reset, and explosion framing animate unless the browser requests reduced motion.

Camera clipping planes and zoom limits adapt to the visible model bounds, including large imports and saved camera positions. Geometry keeps its original scale; displaying a large asset does not establish that its export units are correct.

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

A registered asset loads its URL or the individual GLBs in its `models` list. `src/config/project-parts.ts` registers the supplied assembly and adds independent draft model identities to the visible catalog; source records remain unchanged. The explorer and editor use `AssetModelLoader` with at most three file loads in flight. Files mapped to the open assembly or explicit part scope run first; navigation reprioritizes pending requests. Successful files join a persistent scene as they finish, while the remaining files load in the background. A local part workspace loads the GLBs listed in its saved manifest and combines them without changing authored transforms. Source object identifiers are namespaced per file to keep separately exported models selectable. The application can also resolve an assembly to a dedicated registered asset URL. A mounted workspace retains models with the same ID and URL, including their geometry, materials and textures. Replacing a file loads only that revision and releases the replaced resources. Registered URLs include their manifest hash; local replacements get a new blob URL while unchanged files retain their existing URLs. Cache ownership ends when a workspace unmounts; no global model cache or prefetch is used.

The normal explorer restores models saved in this browser and records `workspace=local` in its URL. Curated views restrict geometry to their user-selected model roles and explicit catalog references across source assemblies, without changing source catalog parents or claiming that referenced variants are installed. Clicking a mesh in a local part workspace selects its assigned physical part. An imported legacy model remains visible in the overview even before its meshes have assignments.

`?workspace=project` explicitly opens the checked-in assembly, bypassing saved local geometry without changing browser storage. **Tools → Project parts** and **Tools → Saved local parts** switch between those views. Demonstration and saved local workspaces do not use the registered project asset as a fallback.

Configured assets are validated against their declared asset ID, catalog assembly, metre/Y-up conventions, mapping schema, catalog part IDs, and actual loaded scene object keys. Missing, ambiguous, or mismatched references produce explicit errors rather than silent selection failures.

Progress reports loaded, active, queued and failed file counts. The progress bar counts completed attempts, including failures; it does not claim byte-weighted download progress. Network errors, invalid geometry, and missing buffers/textures identify the individual file and expose its own Retry button. Other files stay visible and selectable. The editor validates an uploaded replacement before installing it, so a broken upload retains the previous part. Object-key checks defer references only for pending or failed manifest entries and run as each file arrives; catalog, schema and duplicate-reference checks remain active. Configuration errors retain the explicit demonstration-fallback button. A graphics initialization error leaves the DOM catalog available. A graphics-context interruption displays recovery guidance. Empty selections explain that mappings or visibility may need attention. Queued work is dropped on removal or unmount. Already-running loads finish within the concurrency budget, and superseded results are discarded and disposed without updating the current scene.

## Performance and verification

The canvas uses demand rendering. Explosion animation and camera controls explicitly invalidate frames; it becomes idle after motion settles. Device pixel ratio is capped at 1.75. The demonstration shares materials and repeated geometries and instances wheel tread blocks. It uses lightweight directional lighting and a fading grid without postprocessing or shadow-map passes. A studio reflection environment is generated locally from Three.js `RoomEnvironment` once per canvas mount, with intensity 0.7, so imported metal and clearcoat finishes receive reflections without downloading an HDR image. Its GPU texture is disposed when the canvas unmounts.

The main frame and swingarm retain their 60,000/30,000-triangle geometry but now carry tangent-space surface normal maps baked from their original 889,358/307,498-triangle sources. Both the base finish and clearcoat use the baked surface normals; clearcoat would otherwise retain the coarse specular creases. Purple color, metallic/roughness flakes, UVs and authored transforms are preserved. The old flake-only bump is replaced by the source surface normal map. The embedded 2048px frame and 1024px swingarm maps add about 2.31 MiB of GLB downloads and use more texture memory, without adding model triangles or render passes. `data/models/surface-normals.json` records the source hashes, texture dimensions and per-triangle position/UV fingerprints. `scripts/bake-part-normals.py` regenerates staged exports without saving the source `.blend` files.

`onDiagnostics` reports visible meshes, triangle count, draw calls, geometry allocations, and texture allocations. These are WebGL renderer counters, not a claim of a target frame rate. Geometry budgets must be measured on intended devices with actual models. Thousands of separate high-detail meshes still create substantial draw calls; supply a simplified whole-bike GLB and load detailed assemblies separately, instance appropriate fasteners, and use Meshopt/Draco as appropriate. The viewer does not silently decimate precise source geometry.

The DOM wrapper exposes `data-scene-ready` when visible geometry is usable, `data-load-complete` when all attempts have settled, `data-loaded-models`, `data-failed-models`, and `data-visible-meshes` for browser integration checks. `tests/incremental-models.test.ts` covers scheduling, reprioritization, retries, reuse, stale loads, resource disposal and partial mapping validation. `tests/e2e/incremental-loading.spec.ts` holds background requests open to verify early rendering, then exercises per-file retries and editor replacements without reloading successful files. `tests/viewer.test.ts` exercises actual Three.js objects: mapping, contextual selection, visibility/raycast masks, nested explosion, exact restoration, flat-scene grouping, replacement geometry, ambiguous mappings, instanced bounds, and narrow-screen camera fitting. Browser tests must additionally exercise real WebGL picking, dragging, touch, deep links, and the editor-to-viewer workflow. Real-device mobile performance and final mechanical alignment require owner verification with the final assets.

Official references: [React Three Fiber demand rendering](https://r3f.docs.pmnd.rs/advanced/scaling-performance), [Drei CameraControls](https://drei.docs.pmnd.rs/controls/camera-controls), [Three.js GLTFLoader](https://threejs.org/docs/#examples/en/loaders/GLTFLoader).
