# Preparing and replacing 3D assets

The included bike and jackshaft are synthetic demonstrations. Their shape, spacing and arrangement are not a Sur-Ron reference. You are responsible for the stock geometry, mechanical layout, source-document transcription and fitment decisions.

## File and coordinate contract

Use glTF 2.0 (`.glb` preferred) for the browser. GLB can package geometry and textures together; `.gltf` can reference sibling `.bin` and image files. Preserve the relative directory layout when copying a multi-file model into `public/models`. The model inspector does not download remote dependencies.

The application uses metres and Y-up. Mechanical dimensions can remain in millimetres in catalog metadata: `metres = millimetres / 1000` and `millimetres = metres * 1000`. glTF specifies metric linear distances and a right-handed Y-up coordinate system. Do the source conversion deliberately and measure a known feature after export. The loader preserves supplied transforms instead of guessing a scale from the model's size. See the [Khronos glTF specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).

Choose a forward axis consistently for your assets and document it with the source model. The demo motorcycle runs along X in its display scene; that display choice is not a mechanical convention imposed on imports. Configure the view camera for the imported orientation. Do not rotate or recenter individual components at import to match the demo.

## Blender preparation

For a concise preparation and re-export workflow, use the [Blender export checklist](blender-export-checklist.md).

1. Work on a backed-up `.blend`. Identify the source length convention and set Blender Scene Units to Metric with a deliberate Unit Scale. Changing display units alone is not proof that geometry is scaled correctly.
2. Check at least one known physical dimension against its source. Verify it again after glTF export. Avoid global automatic scale corrections when exact assembly alignment is important.
3. Keep each selectable component as a separate object. Use empty parent objects for assemblies, including nested assemblies. Name objects meaningfully (`jackshaft`, `bearing-left`, `spacer-right`) to improve suggestions, but treat names as labels.
4. Add a custom **string** property `objectId` to each mesh and useful assembly empty. Use a stable unique value such as a UUID or `lbx-jackshaft-bearing-left-object`. Save these properties in the `.blend`. Duplicated objects must receive new IDs; replacing a mesh for the same object should retain its ID.
5. Keep origins and local axes meaningful. For an axial assembly, preserve the shaft axis and bearing/spacer origins. Keep the assembled transforms. Do not join selectable objects, move all origins to the world origin, or apply transforms indiscriminately.
6. Export **glTF 2.0 / GLB**, with **+Y Up** and **Custom Properties** enabled. Include the complete intended hierarchy. Disable animation export when no authored animations are needed. Export only the intended objects/collection if the source contains construction geometry.
7. Review materials, normals, textures, hierarchy, units and persistent IDs in the visual editor. Verify a known dimension from the source; plausible visual size is insufficient.

Blender's glTF exporter stores enabled custom properties in glTF `extras`. Some authoring features require conversion to supported mesh/material data; preview the result after export. Refer to the [Blender glTF export manual](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html) for your installed Blender version.

The optional helper is deliberately conservative:

```sh
blender source.blend --background --python scripts/blender-export.py -- /tmp/lbx-review.glb
```

It checks Metric units, nonzero scales and unique persistent IDs, exports extras, and refuses an existing output path. It does not assign IDs, apply transforms, join meshes, save the source `.blend` or recenter origins. It exports the scene rather than a hand-selected subset: use a dedicated export scene. Blender was unavailable in the implementation environment, so the helper must be exercised against your Blender version before relying on it. Exporter option changes may require updating the small helper.

## Validate before loading

```sh
npm run model:check -- public/models/lbx.glb
npm run model:check -- public/models/lbx.glb --mapping my-mapping.json --catalog my-catalog.json
npm run model:check -- public/models/lbx.gltf --json
```

The inspector accepts GLB and JSON glTF, lists nodes and object keys, identifies duplicate names/IDs, checks missing node/mesh references, hierarchy cycles, invalid transforms and missing local dependencies, and reports compression extensions. With a mapping, it reports mapped, unmapped and ambiguous nodes. It exits unsuccessfully for errors. It does not alter the asset. It is a metadata/dependency check, not a complete Khronos binary-buffer validator or proof of mechanical scale. For production delivery also run the upstream [glTF Validator](https://github.com/KhronosGroup/glTF-Validator).

Multi-primitive nodes, skins, lights and other loader-created wrappers can produce render objects beyond raw glTF nodes. Map persistent node IDs when possible and use the editor's imported scene tree as the final authority for fallback path mappings. Persistent `objectId` avoids name sanitization and sibling-order issues. A missing mapping target must be reviewed rather than silently reassigned.

## Visual mapping workflow

Open `/editor` in development. Import your GLB or glTF bundle, inspect the object tree, select objects in the viewport, and assign catalog parts. Confirm suggested matches. Group catalog records into assemblies and give them readable names without changing stable IDs. Configure explosion direction, distance, timing and camera framing, and preview both endpoints. Download the resulting catalog and mapping JSON. The editor is local and has no production write endpoint; an export changes no public deployment until you add it to the project.

For a parts-list entry represented by several meshes, map all of those objects to the same catalog ID. For a model with an assembly parent object, map that parent to the assembly and individual children to more specific parts. Check parent and child explosion vectors together because nested local transforms compose. Imported files and editor-only changes are not a persistent asset hosting service; keep exported configuration and original model files under your own version control or asset storage.

## Register and replace assets

Use `src/config/assets.ts` for the runtime asset registry. Asset definitions identify a URL, assembly ID, unique asset ID, label and units. Keep mapping asset IDs in agreement with registry entries. A full-bike asset can cover the complete catalog; a dedicated detailed jackshaft asset can be loaded only when entering that assembly. Keep assembly-specific geometry in its precise local frame and configure its camera independently.

When replacing a model:

1. Preserve catalog part IDs and persistent object IDs for unchanged objects.
2. Export to a new asset filename/version so cached old content cannot mask changes.
3. Run catalog and model validation, including the intended mapping.
4. Import in the editor and review unmapped, ambiguous and missing references.
5. Recheck local axes, camera framing and both explosion endpoints. Verify every original transform is restored at zero.
6. Update the registry URL and mapping together, then run unit tests and the browser navigation/selection flow.

Do not rename catalog IDs simply to match a replacement mesh. Fix the mapping instead.

## Delivery and performance

Use modest geometry for the complete motorcycle and separate detailed assembly assets. Keep high-polygon bolt threads and interior surfaces out of full-bike display assets when they cannot be inspected. Reuse geometries/materials for repeated hardware while retaining occurrence identities. Preserve small components in detailed assembly assets. Compression support depends on the registered runtime loader/decoder configuration; inspect the extensions required by each export and provide the appropriate decoder resources.

Measure actual scene diagnostics on target hardware: meshes, triangles, draw calls, geometry and texture counts, loading behaviour and interaction latency. Thousands of individual draw calls need geometry/material reuse or instancing even if the catalog itself scales well. Do not merge selectable parts indiscriminately to reduce draw calls. Production level-of-detail thresholds require real models and device testing.

## Inputs and manual work still required

- The stock motorcycle GLB/glTF and, where useful, separate detailed assembly assets.
- Editable Blender/CAD sources with persistent object IDs, meaningful origins and an agreed coordinate convention.
- Factory parts drawings with edition/model-year identification and permission to display any supplied images.
- Reviewed OEM numbers, descriptions, quantities, generic designations, dimensions and source references.
- Verified assembly relationships, axial disassembly directions, distances and any disassembly-order notes.
- Confirmed model/year compatibility and independent evidence before declaring standardized parts interchangeable.
- Final material/texture assets, optimization targets and measurements on representative mobile devices.

Until those inputs are reviewed, retain demonstration/unknown badges and do not present the explorer as a fitment or repair authority.
