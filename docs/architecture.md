# Architecture and extension points

## Boundaries

| Layer              | Files                         | Responsibility                                                                                          |
| ------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| Catalog contract   | `src/core/types.ts`           | Stable part identities, mechanical facts, provenance, verification and asset/mapping contracts          |
| Domain operations  | `src/core/`                   | Runtime validation, indexed hierarchy/search, URL state, mapping identities and pure explosion math     |
| Initial data       | `src/data/catalog.ts`         | Explicitly synthetic catalog with nullable unknown facts                                                |
| Asset registration | `src/config/assets.ts`        | Versioned whole-bike and dedicated assembly model URLs plus external mappings                           |
| Explorer UI        | `src/components/Explorer.tsx` | Search, tree, selected catalog state, URL/history, detail panel and viewport commands                   |
| Renderer           | `src/viewer/`                 | Geometry loading, camera, picking, non-mutating material swaps, explosion interpolation and diagnostics |
| Local editor       | `src/editor/`                 | Model inspection/mapping, local project edits, JSON exchange and browser storage                        |
| Offline tooling    | `scripts/`                    | Catalog conversion, GLB/glTF metadata/dependency inspection and Blender export helper                   |

The renderer receives catalog IDs and emits IDs. It does not own browser navigation or product metadata. A part ID never depends on its display name or on a mesh name. A mapping can associate many scene objects with one part; group mappings are inherited unless a child is mapped more specifically. Preferred persistent scene identity is glTF extras `objectId`; indexed name/path references remain a fallback and must be reviewed when a model hierarchy changes.

## Catalog hierarchy and occurrence identity

The catalog is normalized: one record per component occurrence with `parentId`, plus a derived index for child traversal. There is one motorcycle root. Validation rejects duplicate IDs, invalid roots, missing parents, cycles and components that improperly parent other records. Iterative traversal avoids recursive domain-stack limits, with a 4,000-level test fixture.

A left and right occurrence of the same bearing may share a verified generic designation or OEM number but have distinct stable IDs. That keeps selection, source callouts and transforms unambiguous. `quantity` describes the represented occurrence/parts-list entry only when confirmed; demonstration mesh counts do not populate it. Cross-references and alternatives keep relationships explicit rather than merging catalog identities.

The current in-memory search index is built once per catalog change; repeated typing does not rebuild ancestry. Search includes related assembly names. UI search results are bounded and the editor tree progressively displays 250 rows. Very large catalogs can replace the data source and list implementation without changing `Part`, the mapping contract or viewer events. The full explorer tree currently renders expanded branches rather than using virtualization.

## Navigation and lifecycle

The URL expresses motorcycle, active assembly and selected part. Validation repairs impossible combinations. Selecting a component opens its parent assembly; selecting an assembly makes it the viewer context. Native history entries and `popstate` restore this state. Explosion amount, orbit and hidden/isolation state are temporary interaction state, not part of a share link.

After entering an assembly, the UI briefly presents its assembled state and requests explosion; the renderer interpolates from captured transforms. A user can immediately control the amount. Reduced-motion preferences disable renderer interpolation. Target positions always derive from original transforms, not the last animation frame.

Only the selected geometry asset is retained. A dedicated assembly entry in the registry supersedes the full-bike model; navigation unloads/disposes the previous asset. Superseded asynchronous loads are ignored and disposed. Missing assets leave catalog controls usable and offer an explicit, labeled demo fallback. There is no silent geometry substitution.

## Local model integration

Editor project exports contain `{version, catalog, mapping, assetFileName}`. The editor stores metadata under `surron-editor-project` in localStorage and model blobs in IndexedDB. The explorer loads that saved workspace only with `workspace=local`. Model blobs become temporary object URLs; glTF companion resource URLs are rewritten, while node transforms are unchanged. Temporary URLs and GPU resources are released on replacement/unmount.

This is a local convenience, not a repository or server write. Public model deployment requires copying assets and configuration into the application explicitly. No unauthenticated write APIs exist. Source links allow only HTTP(S); imported glTF resources must be supplied locally instead of issuing arbitrary external companion fetches from the editor.

## Adding a motorcycle

For this initial single-bike application, provide a validated catalog with a different root ID and replace the data export consumed by the explorer/editor, then register its full and assembly assets. The contracts and URL helpers accept arbitrary motorcycle IDs. The current brand/header copy is LBX-specific; update it when changing the product. For a multi-bike product, add a catalog registry keyed by `motorcycle` and a model chooser; keep separate roots/catalogs rather than adding several roots to one catalog. This avoids silently interpreting one motorcycle's part URL against another catalog.

## Future aftermarket and build support

Keep stock occurrence identity separate from a purchasable product. A later `ProductVariant` can reference the part slot, verified compatibility evidence, supplier data and its own asset mapping. A build stores slot-to-variant IDs plus a schema version; the catalog and current selection remain stable while the renderer resolves visible variant assets.

Compatibility must come from reviewed relationships, model-year constraints and sources. `similar-specification` does not mean `confirmed-interchangeable`. Pricing, affiliate URLs, availability and supplier identity belong to separate product records, not geometry names or generic designations. A repository/data adapter can replace the bundled catalog with database-backed records later without moving domain validation into React or Three.js.

## Performance strategy

Demand rendering rests when camera/parts settle. Camera and explosion changes request frames explicitly. Shared materials/geometries and instanced synthetic tire tread demonstrate reuse. The UI exposes actual renderer counts, while separate assembly files provide the main geometry-budget boundary. There is no claimed FPS guarantee without supplied production assets and target-device measurements.

Detailed thread meshes, large textures, thousands of independently rendered materials and densely tessellated CAD exports need owner-led optimization. Add authored levels of detail and repeated-fastener instancing only while preserving the component occurrence mapping. Diagnostic counts and real-device traces should determine that work.
