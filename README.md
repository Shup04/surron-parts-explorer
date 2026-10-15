# Sur-Ron Interactive 3D Parts Explorer

A working, browser-based motorcycle parts explorer and local model-mapping studio. Built with Next.js, TypeScript, React Three Fiber, Three.js and Drei. There are no accounts, purchase flows, backend databases, or upload/write endpoints.

**The explorer includes the supplied Blender parts and a separate source-backed OEM catalog.** The project assembly contains 39 individually selectable GLBs in `public/parts/`, with their authored positions and materials. The catalog contains 1,396 source occurrences representing 683 exact catalog identities, extracted from three local PDFs and 16 accessible supplemental retailer collections. Original descriptions, quantities, source locations, missing values and conflicting claims are preserved. Supplied model roles do not claim an installed OEM variant. The synthetic motorcycle silhouette and jackshaft fixture remain available through `?demo=1`.

Start with [the OEM integration and review workflow](docs/oem-catalog.md) and [the generated source coverage report](data/oem/report.md). Source coverage is not a claim of complete stock equipment or verified model-year compatibility; eleven newer reference collections were unavailable during ingestion.

## Run locally

Use Node.js 24 LTS and npm. The lockfile pins the installed dependency versions.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:3000** for the OEM explorer, **http://127.0.0.1:3000/catalog** for local source review, and **http://127.0.0.1:3000/editor** for OEM model mapping. The original interactive demonstration is available at `/?demo=1` and `/editor?demo=1`.

Choose **Tools → Project parts**, or open `/?workspace=project`, to view the checked-in 39-part assembly even when this browser has a saved local workspace. The main frame was reduced from 889,358 to 60,000 triangles; the whole assembly has 1,283,637 triangles. Purple metallic material belongs to the main frame and swingarm. Textures are embedded in the GLBs. Blender working files and source backups remain local under `reference/models/`; the browser-ready exports and their manifest are versioned in Git.

```sh
npm run build
npm start
```

Deploy using a Node-capable Next.js host: install with `npm ci`, build with `npm run build`, then start the server. The default start script binds to loopback; use `npx next start --hostname 0.0.0.0` behind your deployment platform's HTTPS proxy. No secrets or environment variables are required. The catalog is served from checked-in JSON without runtime scraping. No remote deployment was performed.

For a purely static host, set `output: 'export'` in `next.config.ts`, build, and serve `out/` with directory-index routing for `/editor` and `/catalog`. This optional export configuration has not been separately verified. Do not expose a development server as a public production server.

## What works

- A responsive, dark 3D workbench with orbit, zoom, pan, reset, framing, mesh hover/tooltips, selection and non-destructive highlights.
- A metadata-driven recursive parts index, search across names/numbers/specifications/assembly names, keyboard alternatives, source/verification details and part breadcrumbs.
- A real OEM domain separating exact part identities, source occurrences, assembly groups, source-year claims, review overlays and future revision/interchangeability relationships. Missing geometry never removes a catalog entry.
- A [curated 14-system motorcycle tree](docs/navigation.md) with service hardware collapsed and source variants separated from installed components. The complete OEM catalog remains searchable; no installed variant is guessed from an edition year or a mesh mapping.
- Local catalog review with source/assembly/year/issue filters, original source evidence, conflicting claims, normalized name and quantity/OEM corrections, bulk review/assembly edits and complete JSON export. Local PDF attachments are fingerprint checked and never uploaded.
- Nested assembly navigation, isolation, component visibility, animated axial exploded views, adjustable amount, configurable timing/easing, and exact reassembly. Approximate layouts are explicitly labeled.
- Shareable `motorcycle`, `assembly` and `part` query parameters with browser history, plus OEM `year` and `source` filters. Example source group: `/?assembly=jackshaft&source=lbx2021&year=2021`. Source years are evidence filters, not a fitment guarantee.
- A GLB/glTF editor with object hierarchy, viewport selection, bulk mapping, confirmed name suggestions, catalog regrouping/naming, explosion editing, camera presets and JSON import/export.
- Explicit local save stores metadata in localStorage and imported model files in IndexedDB. **Preview in explorer** loads that same saved model at `/?workspace=local`. Local workspace links are specific to your browser; they do not upload or share the geometry.
- Catalog CSV/JSON import/export, validation, GLB/glTF inspection tools, sample templates and a conservative Blender export helper.
- Demand rendering, material/geometry reuse, instanced demonstration tread, lazy assembly asset replacement, Meshopt/Draco support and live renderer diagnostics.

Drag to orbit, scroll to zoom, right-drag to pan. On touch devices use one finger to orbit and two to pan/pinch. **Parts** toggles the navigation panel; **Details** opens information for the selection. `R` resets the camera; `/` focuses search; `Esc` dismisses the active menu or panel before exiting isolation. Expand a branch with its arrow, or select it by name. The parts list supports Tab and Enter. Assemblies open assembled; use **Exploded**, **Assembled** or the slider to inspect them. Use `/?demo=1`, expand **Motor & drivetrain**, and select **Jackshaft assembly** to exercise the original synthetic fixture. Catalog filters, source evidence and viewer diagnostics are available through disclosures; the header **Tools** menu opens the review and mapping workspaces.

## Bring in your models

For separate part GLBs, open `/editor`, choose a bike part, import its GLB, then click **Save & preview**. Repeat for each part; existing models are kept. A previously imported seat can be assigned with **Use this model for Seat**. Export the parts in a shared assembled coordinate system so their original positions line up. No manual mesh mapping or OEM selection is required for this workflow.

For whole-bike models and detailed OEM mapping, open **Advanced tools**:

1. Read [the model pipeline](docs/model-pipeline.md). Export glTF 2.0 in metres, Y-up, with separate selectable objects and stable `objectId` custom properties. Preserve assembled origins, hierarchy and transforms.
2. Import GLB, or select a glTF file and all its buffer/texture companions together, in `/editor?advanced=1`.
3. Map scene objects to existing OEM occurrence IDs; confirm suggestions; inspect unmapped/conflicting objects. Check assembly/source context when the same OEM number appears more than once. Keep source review corrections in `/catalog` and preserve stable IDs.
4. Author explosion directions in each object's parent coordinate system, with distances in metres. Review assembled/exploded endpoints and save useful camera framing.
5. Export full project JSON and mapping JSON; keep the original model files separately. Save locally and preview in the explorer to verify integration.
6. Add versioned assets under `public/models/` and register the exported mapping in `src/config/assets.ts`. Preserve `data/oem/catalog.json` and its occurrence identities when replacing geometry. Dedicated assembly assets can override the whole-bike model. The demonstration fixture remains separate in `src/data/catalog.ts`.

```sh
npm run catalog -- validate public/templates/catalog.json
npm run catalog -- convert public/templates/catalog.json /tmp/catalog-review.csv
npm run model:check -- public/models/lbx.glb --mapping model-mapping.json --catalog catalog.json
```

The editor's catalog JSON is the viewer projection; `/catalog` exports the complete OEM identity/occurrence/provenance database. See [OEM ingestion and review](docs/oem-catalog.md), [viewer catalog schema](docs/data-model.md), [editor workflow](docs/editor.md), [renderer behavior](docs/viewer.md), [architecture and extension points](docs/architecture.md), [shared visual system](docs/design-system.md), and [manual handoff](docs/manual-handoff.md).

## Rebuild the OEM catalog

These commands are optional development tools; the checked-in JSON is sufficient to run the application. They require the original PDFs in `reference/parts-catalogue/`, Python 3, Poppler, `qpdf`, and BeautifulSoup for the supplemental cached HTML.

```sh
python3 scripts/oem/extract-legacy.py
python3 scripts/oem/extract-2021.py
python3 scripts/oem/extract-current.py
npx tsx scripts/oem/build-catalog.ts
```

The HTML extractor reads private local snapshots by default. If they are absent, retain the committed extraction JSON and run the database builder directly. Read [the reproducibility details](docs/oem-catalog.md#reproduce-the-ingestion-offline) before downloading new sources or rebuilding reviewed data. Do not publish input PDFs or diagram artwork in `public/`.

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

Playwright starts the development server if necessary and exercises real WebGL using software rendering in CI. Tests cover catalog traversal, malformed data, duplicate IDs, mapping inheritance and ambiguity, deep links, search, imports/exports, original-transform restoration, actual mesh raycasting, mobile navigation and editor persistence. OEM tests also check audited row counts, exact OEM strings, missing values, repeated occurrences, quantities, provenance, reconciliation, source-year separation and review overlays. Traces/screenshots are retained on failures. `npm run build` includes TypeScript validation; there is no lint script configured.

Restricted execution environments may need permission to open the local server/browser or spawn detached build subprocesses. The implementation environment required this for browser QA and the production build. Do not disable TypeScript validation to work around that restriction.

## Current limits

- All OEM catalog identities await accurate geometry. Source measurements, disputed quantities, production-year applicability and disassembly directions need mechanical review. The historical 2021 edition label and retailer year claims do not establish verified cross-year fitment.
- All 1,000 legible PDF table rows were imported, but some diagrams have unlisted callouts and the Emotobykes copy has blank/clipped illustration regions. The supplemental newer source is incomplete: 16 of 27 collections were accessible; eleven returned HTTP 429. Exact exceptions are recorded in [the coverage report](data/oem/report.md) and [web ingestion audit](data/oem/audits/current-web-ingestion.json).
- Performance counters are implemented; final-model/mobile hardware budgets, stress testing with thousands of real meshes, and authored LOD assets remain to be measured. High-poly geometry is never silently decimated.
- Draco-compressed models use an external decoder URL by default; self-host the decoder for offline/restrictive deployments. KTX2/Basis compressed textures and CAD source formats require conversion before import.
- Ordinary rigid part assemblies are supported. Skinned/deforming meshes, assembly animations authored in glTF, and per-instance picking of individually cataloged instanced fasteners are not specialized workflows yet.
- Model mapping and catalog review are browser-local, without multi-user synchronization or an asset-hosting service. Browser storage may be cleared; exported review patches, metadata and source files are the durable handoff. Local review saves do not publish a new catalog release.
- Blender export helper execution, Safari/Firefox and physical touch-device testing remain unverified. Browser automation uses Chromium and a mobile viewport, not a physical phone.
- Aftermarket products, compatibility decisions, saved builds, pricing and commerce are extension points, not implemented purchase features.

Upstream references: [Next.js setup](https://nextjs.org/docs/app/getting-started/installation), [React Three Fiber performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance), [glTF specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).
