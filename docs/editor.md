# Model mapping studio

Open `/editor` from the explorer. The default **Add bike parts** screen is for building a bike from separate GLBs. Models and assignments are saved in this browser.

## Add separate part GLBs

1. Choose the physical part, such as **Seat**, in **Choose the bike part**.
2. Click **Import Seat GLB** and select its file. All meshes in that file are assigned to Seat automatically. **Your parts** shows the filename and assignment.
3. Click **Save & preview**. Open **Seat and bodywork → Seat** in the explorer, or click its geometry.

Repeat for the frame, wheels and other parts. Adding a part keeps the models already added. Choosing an existing part and importing another GLB replaces only that part. Export every GLB in metres, Y-up, using the same assembled coordinate system; original positions, rotations and scales are preserved. The app does not guess their placement.

For a model imported with the previous editor, choose its physical part and click **Use this model for Seat**. This reuses the stored file and assigns the whole file without requiring mesh selection or another upload.

You can choose a physical role without selecting an OEM variant. Local model assignments are kept separate from sourced OEM references and do not establish installed equipment or fitment.

## Advanced mapping tools

Choose **Advanced tools** for whole-bike GLB/glTF import, individual mesh-to-OEM mapping, catalog editing and explosion authoring. `/editor?advanced=1` opens those tools directly. `/editor?demo=1` opens the original demonstration mapping workflow. The following sections describe these advanced tools.

## Import a model

1. Choose **Import model**. Select exactly one `.glb`, or one `.gltf` together with its `.bin` and texture files. For nested texture folders, use **Import model folder** under Portable workspace and select a directory containing exactly one model. This preserves relative companion paths. A GLB with embedded resources is the most portable option.
2. Source object names, hierarchy, positions, rotations, scales, and origins remain unchanged. The workspace does not recenter, rescale, or rotate your geometry.
3. Read **Geometry checks**. Confirm that one model unit represents one metre and the model is Y-up. A 1,000 mm shaft must be 1 m long in the rendered asset. Size checks flag suspicious bounds; they cannot prove mechanical accuracy or infer your export units.
4. Review duplicate names, duplicate persistent object identifiers, and missing mappings. Stable identifiers are independent from catalog part IDs.

For glTF companions, exact relative paths are preferred; unique file basenames are accepted when the browser file picker does not retain directories. Ambiguous basenames are rejected. Embedded data URIs are supported. HTTP companion resources must be downloaded and supplied locally; the editor will not silently fetch them. Meshopt is bundled. Draco uses the viewer's configured decoder source; see the import documentation for self-hosting it offline. KTX2/Basis textures require a separately configured texture decoder and are not supported by the initial loader.

## Map objects to catalog entries

After GLB/glTF import, open **Import preflight** below the preview for counts, original-name checks, hierarchy depth, metre bounds and actionable transform/origin warnings. It is a snapshot of the imported scene, so exploding or hiding parts does not change the report. It also refreshes when a saved model is restored. The report does not repair the asset or verify physical accuracy. Use the [Blender export checklist](blender-export-checklist.md) before your first import.

The object list preserves source hierarchy. Search object names, keys, catalog IDs, and part names. Filter by mapped, unmapped, or ambiguous state. Long trees load in batches of 250 rows. Expand or collapse groups, and select via the list or directly in the viewport. Checkboxes and Shift-click support multiple selection.

Search catalog targets by OEM number, occurrence ID, name, assembly or source. Results are paginated; each target identifies its source and shared physical identity. Select the correct source occurrence and choose **Map selected**. Several meshes may map to one stable catalog ID. Mapping a group also maps its descendants unless a child has an explicit mapping. The `↳` indicator identifies inherited mappings. Mapping operations replace selected object assignments; **Unmap** removes only explicit assignments, so a parent assignment can still apply. For an inherited-only selection, **Unmap** is disabled; select the mapped parent to remove that assignment.

Exact object-name matches (`part-id` or `part__part-id`) are proposals until you press **Apply exact ID matches**. Case/punctuation/name matches require an individual **Confirm** action. No uncertain proposal is silently accepted.

Ambiguous persistent object identifiers require correcting the source model. JSON with duplicate object assignments is rejected on import. Unknown catalog references and dangling object keys are reported. Missing-object mappings can be removed explicitly, or resolved by loading the correct model.

## Organize the catalog

The inspector can rename an existing catalog part, change its parent assembly, and create components or assemblies. To group existing components, create an assembly under the desired parent, then move each component into that assembly through **Parent assembly**. Stable part IDs remain unchanged when names or parents change. Cycles, duplicate IDs, missing parents, and component parents are rejected.

New catalog entries have unknown mechanical data. Use the catalog JSON or CSV workflow to add researched descriptions, OEM numbers, dimensions, sources, compatibility, and quantities. A geometric resemblance is not evidence of interchangeability.

## Configure an exploded view

1. Select and map an object or group.
2. Enter an X/Y/Z direction in that object's **parent coordinate system**. Directions are normalized by the engine; only direction matters.
3. Set distance in metres, animation duration in seconds, easing, and verification status. Use axial directions for shafts, bearings, washers, and spacers where appropriate.
4. Choose **Apply to mapped selection**. The setting applies to each selected object that has an explicit mapping.
5. Use the explosion slider or **Explode / Reassemble** to inspect the movement. Every target is computed from the original position; reassembly restores it exactly.

Editor preview applies configured transforms throughout the imported object hierarchy. Parent and child transforms compound as they do in Three.js. Avoid configuring the same physical movement on both a parent group and its children. The explorer applies hierarchy-aware isolation and explosion at the active catalog assembly level. Use **Preview in explorer** to review that navigation behavior.

**Isolate selection**, **Hide selected**, and **Restore visibility** affect only the preview. They do not delete objects or persist an unintentionally hidden model. The tree identifies hidden objects and objects outside isolation; hidden objects do not retain selection outlines. Rotation, pan, and zoom use mouse or touch controls. **Frame selected** frames multiple selected objects together; **Frame model** restores an overall view. **Save camera** stores the current camera position and target in the mapping configuration, and **Recall camera** restores it.

## Save, export, and test in the explorer

**Save locally** stores validated project metadata in `localStorage` under `surron-editor-project`. Imported model files are stored as browser-local blobs in IndexedDB (`surron-model-workspace`). **Preview in explorer** saves the workspace and opens `/?workspace=local`, where the same catalog, mappings, and imported geometry power search, selection, assembly navigation, and explosion.

After saving, returning through **Explorer** or opening the normal explorer in the same browser restores the models and marks the URL with `workspace=local`. Curated views such as **Seat** show their local model assignments and geometry mapped to source references, including references filed under different source assemblies. Separate part uploads compose your own bike; the explicit `?demo=1` route shows the demonstration.

Leaving through **Explorer** or **Review factual catalog data** uses the same unsaved-change confirmation as closing the tab. Choose **Save locally** first to retain edits.

Storage belongs to this browser and origin. Browser data clearing, private mode limits, quota exhaustion, or eviction can remove it. Keep durable backups:

- **Export full project JSON** contains the complete catalog and model mapping metadata.
- **Export catalog only** produces a standalone catalog for the CLI CSV import/export workflow.
- **Export mapping only** contains model object assignments, explosion settings, and saved camera framing.
- Keep the original GLB/glTF and all companion files separately; JSON exports do not embed geometry.

Import model geometry first, then **Import project / catalog / mapping JSON**. Full project imports replace the local catalog and mapping, while mapping-only imports keep the catalog. Standalone catalog JSON (including CLI CSV conversion output) replaces the catalog and preserves mappings for explicit review of any removed part references. None of these operations modify source files. JSON imports do not load a model named in the metadata. Missing keys are reported against the current scene. Importing replacement geometry retains existing mappings for review and never invents new catalog identities.

Saving is blocked while mappings reference missing geometry or are otherwise invalid. You can still export a JSON repair copy. No production publishing or upload occurs from this workspace.

## Remaining manual review

The tool cannot verify mechanical alignment, disassembly order, tolerances, OEM part numbers, fitment, material, or dimensional accuracy. You must confirm these against source drawings and the physical assembly, preserve source references in the catalog, review the explosion hierarchy, and mark records verified only when evidence supports them. `userData.objectId` / glTF `extras.objectId` provides a stable geometry identifier across object renames; indexed hierarchy paths are fallback keys that must be reviewed after source reorderings.

## Updating an older workspace

Saved projects restore intact. **Merge current OEM catalog** adds missing stable records without replacing existing IDs, custom edits or mappings, and reports retained differences. Review source corrections in `/catalog`; export those patches separately from model-project JSON. Existing saved projects retain their own record snapshots until explicitly reconciled.
