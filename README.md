# Sur-Ron Interactive 3D Parts Explorer

A working, browser-based motorcycle parts explorer and local model-mapping studio. Built with Next.js, TypeScript, React Three Fiber, Three.js and Drei. There are no accounts, purchase flows, backend databases, or upload/write endpoints.

**All supplied geometry and catalog records are demonstrations.** No factory drawings or stock 3D assets were present in the repository. OEM numbers, dimensions, quantities, materials, fitment and standardized replacement designations are deliberately unknown. The included motorcycle silhouette and axial jackshaft assembly are interaction fixtures, not an accurate Sur-Ron or a mechanical reference.

## Run locally

Use Node.js 24 LTS and npm. The lockfile pins the installed dependency versions.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:3000**. Open **http://127.0.0.1:3000/editor** for the model studio.

```sh
npm run build
npm start
```

The production build prerenders both application routes. Deploy using a Node-capable Next.js host: install with `npm ci`, build with `npm run build`, then start the server. The default start script binds to loopback; use `npx next start --hostname 0.0.0.0` behind your deployment platform's HTTPS proxy. No secrets or environment variables are required. No remote deployment was performed.

For a purely static host, set `output: 'export'` in `next.config.ts`, build, and serve `out/` with directory-index routing for `/editor`. This optional export configuration has not been separately verified. Do not expose a development server as a public production server.

## What works

- A responsive, dark 3D workbench with orbit, zoom, pan, reset, framing, mesh hover/tooltips, selection and non-destructive highlights.
- A metadata-driven recursive parts index, search across names/numbers/specifications/assembly names, keyboard alternatives, source/verification details and part breadcrumbs.
- Nested assembly navigation, isolation, component visibility, animated axial exploded views, adjustable amount, configurable timing/easing, and exact reassembly. Approximate layouts are explicitly labeled.
- Shareable `motorcycle`, `assembly` and `part` query parameters with browser history. Example: `/?motorcycle=lbx&assembly=jackshaft&part=bearing-left`.
- A GLB/glTF editor with object hierarchy, viewport selection, bulk mapping, confirmed name suggestions, catalog regrouping/naming, explosion editing, camera presets and JSON import/export.
- Explicit local save stores metadata in localStorage and imported model files in IndexedDB. **Preview in explorer** loads that same saved model at `/?workspace=local`. Local workspace links are specific to your browser; they do not upload or share the geometry.
- Catalog CSV/JSON import/export, validation, GLB/glTF inspection tools, sample templates and a conservative Blender export helper.
- Demand rendering, material/geometry reuse, instanced demonstration tread, lazy assembly asset replacement, Meshopt/Draco support and live renderer diagnostics.

Drag to orbit, scroll to zoom, right-drag to pan. On touch devices use one finger to orbit and two to pan/pinch. `R` resets the camera; `/` focuses search; `Esc` closes mobile panels and isolation. The parts list supports Tab and Enter. Use **Explore jackshaft** to try the complete assembly workflow.

## Bring in your models

1. Read [the model pipeline](docs/model-pipeline.md). Export glTF 2.0 in metres, Y-up, with separate selectable objects and stable `objectId` custom properties. Preserve assembled origins, hierarchy and transforms.
2. Import GLB, or select a glTF file and all its buffer/texture companions together, in `/editor`.
3. Map scene objects to catalog IDs; confirm suggestions; inspect unmapped/conflicting objects. Adjust parent assemblies and readable names without changing IDs.
4. Author explosion directions in each object's parent coordinate system, with distances in metres. Review assembled/exploded endpoints and save useful camera framing.
5. Export full project JSON and mapping JSON; keep the original model files separately. Save locally and preview in the explorer to verify integration.
6. Add versioned assets under `public/models/`, register the exported mapping in `src/config/assets.ts`, and replace the catalog at `src/data/catalog.ts` with validated source-backed records. Dedicated assembly assets can override the whole-bike model.

```sh
npm run catalog -- validate public/templates/catalog.json
npm run catalog -- convert public/templates/catalog.json /tmp/catalog-review.csv
npm run model:check -- public/models/lbx.glb --mapping model-mapping.json --catalog catalog.json
```

See [catalog schema and provenance](docs/data-model.md), [editor workflow](docs/editor.md), [renderer behavior](docs/viewer.md), [architecture and extension points](docs/architecture.md), and [manual handoff](docs/manual-handoff.md).

## Tests

```sh
npm run typecheck
npm test
npm run format:check
npx playwright install chromium
npm run test:e2e
```

If Chromium is already installed, point Playwright to its executable instead of downloading another browser:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/google/chrome/chrome npm run test:e2e
```

Playwright starts the development server if necessary and exercises real WebGL using software rendering in CI. Tests cover catalog traversal, malformed data, duplicate IDs, mapping inheritance and ambiguity, deep links, search, imports/exports, original-transform restoration, actual mesh raycasting, mobile navigation and editor persistence. Traces/screenshots are retained on failures. `npm run build` includes TypeScript validation; there is no lint script configured.

Restricted execution environments may need permission to open the local server/browser or spawn detached build subprocesses. The implementation environment required this for browser QA and the production build. Do not disable TypeScript validation to work around that restriction.

## Current limits

- Accurate LBX geometry, OEM transcription, physical dimensions, fitment and disassembly directions await your source files and mechanical review.
- Performance counters are implemented; final-model/mobile hardware budgets, stress testing with thousands of real meshes, and authored LOD assets remain to be measured. High-poly geometry is never silently decimated.
- Draco-compressed models use an external decoder URL by default; self-host the decoder for offline/restrictive deployments. KTX2/Basis compressed textures and CAD source formats require conversion before import.
- Ordinary rigid part assemblies are supported. Skinned/deforming meshes, assembly animations authored in glTF, and per-instance picking of individually cataloged instanced fasteners are not specialized workflows yet.
- The editor is browser-local, without multi-user synchronization or an asset-hosting service. Browser storage may be cleared; exported metadata and source files are the durable handoff.
- Blender export helper execution, Safari/Firefox and physical touch-device testing remain unverified. Browser automation uses Chromium and a mobile viewport, not a physical phone.
- Aftermarket products, compatibility decisions, saved builds, pricing and commerce are extension points, not implemented purchase features.

Upstream references: [Next.js setup](https://nextjs.org/docs/app/getting-started/installation), [React Three Fiber performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance), [glTF specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).
