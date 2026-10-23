# 3D viewer implementation

`src/viewer/Viewer.tsx` is a client-only React Three Fiber viewer. Its public interface is `ViewerProps` in `src/core/types.ts`. Catalog navigation and URL state belong to the application, not the renderer. The renderer emits stable part IDs through `onSelect` and `onHover`.

The project assembly loads 37 supplied Blender parts, nine mounted fasteners, 22 jackshaft/pivot models, 17 new rear-wheel models, and three rear-shock models from `public/parts/`, with the motor and jackshaft pulleys omitted for now. Its manifest records readable filenames, physical roles, materials, triangle counts, file hashes, source bounds and the saved Blender source hash. The main frame has 60,000 triangles, and the complete supplied assembly has 1,815,043. All parts retain their authored placement. Frame and swingarm share the purple metallic finish, including embedded flake textures and clearcoat.

The nine added fasteners are four M8×20 footpeg-bracket bolts (6 mm Allen), two M6×10 motor-cover screws (4 mm Allen), and three M5×10 jackshaft-cover screws (3 mm Allen). `data/models/mounted-hardware.json` records PDF callouts, head-standard sources, mounting coordinates, and deferred parts. `scripts/blender-mounted-hardware.py` regenerates these models in the live Blender scene and exports each independently. Their portal details show the hex-key size and nominal dimensions, with a user-requested raw-aluminum finish. Threads are omitted; recess depths and small edge details are illustrative. Their source-backed specifications do not certify mechanical fit: the supplied mount meshes have some irregular/internal triangles. They preserve the existing bike geometry convention of one Blender unit per millimetre.

Four suspension bolt masters (M8×35/45/50/55, 6 mm Allen) are saved in the hidden `LBX_Unplaced_Suspension_Bolts` collection and exported locally to `reference/models/lbx-mounted-hardware/unplaced/`. They are excluded from the portal because the washer/bushing stack and installed orientation are unresolved. The complete new working file is `reference/models/lbx-mounted-hardware/lbx-mounted-hardware.blend`; the prior styled source file remains unchanged. Subframe and bash-plate screws are deferred pending exact JB/ZQ 4725-2006 head/drive dimensions.

**Jackshaft and final drive → Jackshaft assembly** opens the 21 modeled shaft components in place; **Exploded** separates them axially. The three bearings follow Motorino figure 15 and the 2021 catalog figure 17: two at the right/sprocket end and one at the left/pulley end, with the internal spacer between them. Each bearing, spacer, seal and bolt is individually selectable; selecting one retains the assembly context. Six M6×25 sprocket bolts and six M6×16 pulley bolts retain their flange patterns. The separate pivot washer belongs to Swingarm, following figure 01.

`data/models/jackshaft-assembly.json` records source hashes, nominal stack positions, explicit explosion offsets and modeling assumptions. `scripts/blender-install-jackshaft.py` copies the existing revision-02 body and hardware in a separate background Blender process, preserving the source files and existing public models. The raw coordinate scale stays consistent with the bike. The 2RS bearing model remains distinct from the manuals’ 2Z designation. Internal seats, bolt-circle dimensions and omitted pulley/sprocket mounting faces are provisional; the illustrative body bore is not a fit-checked bearing seat. These authored layouts therefore retain the unverified-layout notice.

**Rear wheel → Rear wheel assembly** opens eight groups: hub, rim, spokes, sprocket, bolts, disc, tire and tube. An initial geometry pick selects the parent. Hub is a nested assembly: its contents stay together in the wheel explosion, and a further click enters Hub before individual hub parts can be selected. Its body is modeled; bearing, oil-seal and inner-spacer roles await models. The original hub GLB is preserved. The new set uses an 18 × 1.60 rim, 36 crossed spokes with nipples, a 48T sprocket, five M8×16 sprocket screws, a 202.8 × 2 mm disc, six M6×13 disc screws, and a provisional 3.00-18 tire/tube. Rings and hardware separate laterally in manual diagram order and restore their original coordinates.

`data/models/rear-wheel-assembly.json` distinguishes catalog dimensions, fitted hub coordinates and visual assumptions. `scripts/trace-rear-wheel-references.py` derives the disc’s 18 windows/60 perimeter vents and the sprocket’s five paired windows from the supplied photographs; the latter web is adapted from 42T to the selected 48T without enlarging the hub interfaces. `scripts/blender-rear-wheel.py` builds the editable Blender assembly and exports each selectable part. Spokes/nipples and tire submeshes remain separate in Blender but merge for portal rendering. Tire tread follows the supplied side silhouette and a matching CM708 product photograph. Cutout tolerances, tread depths, section shape and fastener head details remain unverified. Caliper and other brake work remain deferred.

**Rear suspension → Rear shock** contains the main body, white spring and black preload nut as separate selectable models. The shock is rigidly aligned to the frame and connecting-rod bores without changing its scale; measured mounting-center residuals are about 0.38 mm. The gold/charcoal/chrome finishes and warning label are baked into three embedded 2048px textures. Explosion offsets separate the coil and adjuster while retaining the body position. `data/models/rear-shock-assembly.json` records the fit, source hash and offsets; `scripts/blender-export-rear-shock.py` exports the approved local Blender model without saving changes to it. Export validation removes 11 degenerate source triangles. Repaired hidden surfaces are included; original scan boundaries remain around the casting and mounting eyes.

The motorcycle and jackshaft geometry at `?demo=1` remains synthetic demonstration content. Shape, proportions, quantity, and explosion distances are not measurements of a Sur-Ron. The demo creates a recognizable motorcycle silhouette and separately selectable shaft, bearing, spacer, sprocket, clip, and fastener objects to exercise the complete workflow. It must not be used to infer dimensions or interchangeability.

## Geometry and identification

`demo-scene.ts` is the only renderer file with predefined catalog part IDs. `scene.ts` implements generic hierarchy selection, visibility, mapping, framing, and explosion targets. No interaction branches on an assembly name.

For demo objects, `userData.partId` identifies the mapped group. For production assets, supply an `AssetDefinition` and an external `MappingConfig`. `getObjectKey(object, assetRoot)` uses persistent glTF extras `objectId` when present, otherwise an indexed scene path. The asset root is explicit so attaching the scene to the R3F canvas never changes lookup keys. Duplicate object keys are not silently selected. A mapped group supplies the part ID for descendants unless a descendant has its own mapping.

Loaders preserve imported object names, parent relationships, matrices, positions, rotations, scale, and origins. They do not center, rescale, merge, or apply transforms to the asset. Internal distances are metres, with Y up. Validate millimetre conversions in the import workflow before loading an asset.

## Selection, visibility, and framing

A click selects the next catalog assembly at the current hierarchy level. Opening that assembly exposes its descendants for selection while keeping the surrounding motorcycle visible in assembled mode. Both keyboard list selection and 3D picking use the same catalog IDs. Clicking empty canvas space clears the selected part while keeping the open assembly; camera drags do not clear it. Hidden meshes also receive an empty raycast layer mask because Three.js raycasting does not automatically exclude objects with `visible = false`.

Highlight and inspection materials are clones cached per original material. Hover, selection, fading and section clipping swap the mesh's material reference, then restore the exact reference when those effects end. These interactions do not modify imported materials. Multi-material meshes are supported. Untextured materials receive a shared procedural finish when loaded: fine scratches and roughness variation on metals, and light grain on plastic and rubber. Triplanar mapping covers meshes without UVs, while mipmaps soften the detail at a distance. Existing authored texture maps are left alone. Untextured materials named `Raw aluminum` also receive a darker satin base finish. The GLB files are unchanged.

CameraControls supports drag to orbit, wheel/pinch to zoom, and right-drag/two-finger pan. Camera framing computes a perspective fit from all bounding-box corners and the viewport aspect ratio. It preserves the current viewing angle; explicit reset restores the default angle. A saved mapping camera is used at the loaded asset's assembly root when resetting. This supports both full-motorcycle and dedicated nested-assembly models. All navigation, reset, and explosion framing animate unless the browser requests reduced motion.

Touch controls explicitly map one finger to rotation and two fingers to combined pinch/pan. A gesture guard tracks maximum movement and pointer count: dragging back to the starting point, using a second finger, or cancelling the gesture never selects a part. Touch does not create hover tooltips. Pointer capture, cancellation, blur and visibility changes clear stale gestures. Canvas-only native gesture prevention complements `touch-action: none`; scrollable information panels remain usable. The desktop axis gizmo is hidden on coarse pointers, where its small pointer-down targets conflict with swipes. Reset remains available in the mobile dock.

Camera clipping planes and zoom limits adapt to the visible model bounds, including large imports and saved camera positions. Geometry keeps its original scale; displaying a large asset does not establish that its export units are correct.

## In-place inspection

**Inspect** preserves assembled transforms. **Fade surroundings** keeps the selected part or assembly solid and fades the other model geometry. The optional section plane has an X/Y/Z axis, a position slider over the assembled scope bounds, and **Flip** to reverse its direction. Selected components remain solid and uncut. Selecting a component within the current assembly retains its inspection frame; moving the plane does not reframe the camera. **Done** or **Assembled** removes the inspection effects.

Section clipping applies to model materials, leaving the grid and orientation gizmo intact. Picking rejects clipped surfaces and prefers solid parts through faded geometry. The cut is visual: it does not modify geometry or add solid section caps.

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

The optional `ViewerProps.explosionGroups` holds unopened child assemblies together across separate model files. Each group uses its anchor's authored world displacement, converted to each member's parent coordinates. Without an authored anchor, the group uses its combined assembled bounds for one approximate displacement. Child offsets take effect only after entering that assembly.

Modeled assemblies open assembled with their surroundings visible. **Exploded** separates assemblies with several parts and limits visibility to their scope; **Assembled** restores their original positions and surroundings. Selecting a child keeps its assembly visible; single-part views omit explosion controls. Objects without a manual configuration use an approximate visual layout. For modeled scopes, the layout uses captured assembled geometry bounds rather than shared file origins, with displacement proportional to the assembly's size and converted into each object's parent coordinates. The viewer labels that layout as not mechanically verified. A manually configured vector is not itself proof of mechanical validity: catalog and mapping verification status must also be reviewed by the owner.

## Loading and failure behavior

`load-model.ts` loads GLB and glTF with Meshopt support bundled locally. Draco support uses `https://www.gstatic.com/draco/versioned/decoders/1.5.7/` by default. For offline or restrictive CSP deployments, self-host the matching Draco decoder files and pass `decoderPath` to `loadModel`. Ordinary uncompressed GLB files do not need the external Draco decoder.

A registered asset loads its URL or the individual GLBs in its `models` list. `src/config/project-parts.ts` registers the supplied assembly and adds independent draft model identities to the visible catalog; source records remain unchanged. The explorer and editor use `AssetModelLoader` with at most three file loads in flight. Files mapped to the open assembly or explicit part scope run first; navigation reprioritizes pending requests. Successful files join a persistent scene as they finish, while the remaining files load in the background. A local part workspace loads the GLBs listed in its saved manifest and combines them without changing authored transforms. Source object identifiers are namespaced per file to keep separately exported models selectable. The application can also resolve an assembly to a dedicated registered asset URL. A mounted workspace retains models with the same ID and URL, including their geometry, materials and textures. Replacing a file loads only that revision and releases the replaced resources. Registered URLs include their manifest hash; local replacements get a new blob URL while unchanged files retain their existing URLs. Cache ownership ends when a workspace unmounts; no global model cache or prefetch is used.

The normal explorer opens the styled project assembly. Saved browser imports load only through `workspace=local`, including the editor's preview action. Curated views use their user-selected model roles and explicit catalog references across source assemblies for framing and explosion scope, without changing source catalog parents or claiming that referenced variants are installed. Clicking a mesh in a local part workspace selects its assigned physical part. An imported legacy model remains visible in the overview even before its meshes have assignments.

`?workspace=project` explicitly opens the checked-in assembly, bypassing saved local geometry without changing browser storage. **Tools → Project parts** and **Tools → Saved local parts** switch between those views. Demonstration and saved local workspaces do not use the registered project asset as a fallback.

Configured assets are validated against their declared asset ID, catalog assembly, metre/Y-up conventions, mapping schema, catalog part IDs, and actual loaded scene object keys. Missing, ambiguous, or mismatched references produce explicit errors rather than silent selection failures.

Progress reports loaded, active, queued and failed file counts. The progress bar counts completed attempts, including failures; it does not claim byte-weighted download progress. Network errors, invalid geometry, and missing buffers/textures identify the individual file and expose its own Retry button. Other files stay visible and selectable. The editor validates an uploaded replacement before installing it, so a broken upload retains the previous part. Object-key checks defer references only for pending or failed manifest entries and run as each file arrives; catalog, schema and duplicate-reference checks remain active. Configuration errors retain the explicit demonstration-fallback button. **Restore 3D view** recovers from a graphics failure without reloading the page or losing the selected assembly. The DOM catalog remains available. Empty selections explain that mappings or visibility may need attention. Queued work is dropped on removal or unmount. Already-running loads finish within the concurrency budget, and superseded results are discarded and disposed without updating the current scene.

## Installed app and offline behavior

The web manifest provides a standalone app identity and separate ordinary, maskable and Apple icons. **Tools** offers installation when the browser supplies an invitation, otherwise platform-specific home-screen guidance. Browser zoom remains enabled outside the 3D surface. Installation requires a supported browser and HTTPS (or localhost).

The production-only service worker caches just the small offline recovery document. Application bundles and GLBs retain normal network/browser-cache behavior; the worker does not cache the entire model collection or force reloads when an update appears. Loaded scenes remain usable when connectivity drops. An offline launch shows a reconnect/retry page and preserves the requested deep link. Connection status is announced in the shell. Native installation, iOS browser chrome, and hardware-specific WebGL limits still require physical-device checks.

## Performance and verification

The canvas uses demand rendering. Explosion animation and camera controls explicitly invalidate frames; it becomes idle after motion settles. Device pixel ratio is capped at 1.75. The demonstration shares materials and repeated geometries and instances wheel tread blocks. It uses lightweight directional lighting and a fading grid without postprocessing or shadow-map passes. A studio reflection environment is generated locally from Three.js `RoomEnvironment` once per canvas mount, with intensity 0.7, so imported metal and clearcoat finishes receive reflections without downloading an HDR image. Its GPU texture is disposed when the canvas unmounts.

The main frame and swingarm retain their 60,000/30,000-triangle geometry but now carry tangent-space surface normal maps baked from their original 889,358/307,498-triangle sources. Both the base finish and clearcoat use the baked surface normals; clearcoat would otherwise retain the coarse specular creases. Purple color, metallic/roughness flakes, UVs and authored transforms are preserved. The old flake-only bump is replaced by the source surface normal map. The embedded 2048px frame and 1024px swingarm maps add about 2.31 MiB of GLB downloads and use more texture memory, without adding model triangles or render passes. `data/models/surface-normals.json` records the source hashes, texture dimensions and per-triangle position/UV fingerprints. `scripts/bake-part-normals.py` regenerates staged exports without saving the source `.blend` files.

`onDiagnostics` reports visible meshes, triangle count, draw calls, geometry allocations, and texture allocations. These are WebGL renderer counters, not a claim of a target frame rate. Geometry budgets must be measured on intended devices with actual models. Thousands of separate high-detail meshes still create substantial draw calls; supply a simplified whole-bike GLB and load detailed assemblies separately, instance appropriate fasteners, and use Meshopt/Draco as appropriate. The viewer does not silently decimate precise source geometry.

The DOM wrapper exposes `data-scene-ready` and `data-visible-meshes` for browser integration checks. `tests/viewer.test.ts` exercises actual Three.js objects: mapping, contextual selection, visibility/raycast masks, nested explosion, exact restoration, flat-scene grouping, replacement geometry, ambiguous mappings, instanced bounds, and narrow-screen camera fitting. Browser tests must additionally exercise real WebGL picking, dragging, touch, deep links, and the editor-to-viewer workflow. Real-device mobile performance and final mechanical alignment require owner verification with the final assets.

Official references: [React Three Fiber demand rendering](https://r3f.docs.pmnd.rs/advanced/scaling-performance), [Drei CameraControls](https://drei.docs.pmnd.rs/controls/camera-controls), [Three.js GLTFLoader](https://threejs.org/docs/#examples/en/loaders/GLTFLoader).
