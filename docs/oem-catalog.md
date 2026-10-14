# OEM catalog ingestion and review

The default explorer now uses the source-backed catalog. The supplied motorcycle geometry remains a labeled demonstration. Every imported source row is searchable and selectable before any geometry is assigned; selecting an unmapped part shows its source information and an explicit geometry-unavailable state.

Use `/` for the OEM explorer, `/catalog` for local source review, and `/editor` to map your model to OEM occurrences. The original interactive geometry fixture remains available at `/?demo=1` and `/editor?demo=1`. Do not use its component positions, dimensions or explosion directions as mechanical evidence.

## Imported coverage

The checked-in snapshot contains **1,396 source rows and occurrences**, reconciled into **683 catalog identities** in **30 assembly groups**. It includes every legible parts-table row in the three supplied PDFs and 396 factual product cards from 16 accessible retailer collections. There are currently **zero verified OEM geometry mappings**.

| Reference                                                                                                                      | Pages processed | Imported physical rows | Figure/table sections |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------: | ---------------------: | --------------------: |
| [2021 Light Bee X reference](https://surron-russia.ru/wp-content/uploads/2022/05/katalog-zapchastej-surron-light-bee-2021.pdf) |         20 / 20 |                    392 |                    24 |
| [Emotobykes Light Bee diagrams](https://emotobykes.com/manuals/sur-ron-light-bee-parts-diagrams.pdf)                           |         28 / 28 |                    282 |                    21 |
| [Motorino Light Bee / Light Bee X](https://motorino.ca/wp-content/uploads/2022/04/Sur-Ron-Spare-Parts.pdf)                     |         31 / 31 |                    326 |                    22 |

These are source-coverage counts, not a complete motorcycle bill of materials. Documents overlap, assembly rows overlap their subcomponents, and optional or replacement variants are retained. Adding all quantities would count parts more than once.

The generated [coverage report](../data/oem/report.md) is the canonical human-readable record. [coverage.json](../data/oem/coverage.json) supplies machine-readable per-source counts; [catalog.json](../data/oem/catalog.json) contains identities, occurrences, immutable source claims, conflicts and review overlays. Regeneration can change these totals when new source snapshots are added.

### Read the report correctly

- **Rows detected / imported:** physically printed PDF table rows or parsed retailer cards, including repeated callouts and missing values. It does not count inferred parts behind an assembly name.
- **Visually inspected pages:** original PDF pages were rendered and their legible tables reconciled. An inspected page can still have a blank or clipped illustration, documented as an exception.
- **Figures:** includes source table sections and continuations; the 2021 sticker table has an explicit unnumbered audit label. It does not invent an OEM figure number.
- **Need review:** source records that a reviewer has not explicitly marked source-checked or mechanically verified. High extraction confidence means faithful transcription, not confirmed fitment or mechanical correctness.
- **Discrepancy groups:** candidates for review. Differences can be real revisions, descriptions, formatting, quantity context or source mistakes. The current report contains 270 groups; no source is silently chosen as the winner.
- **Mapped / awaiting mapping:** distinct catalog identities with or without explicit OEM occurrence mappings. Counts overlap across sources and cannot be summed. Demonstration meshes do not count.

### Precisely recorded gaps

The 2021 source retains an OEM-less swingarm row (`2_01`), 17 missing quantities, eight blank callouts and all variant rows. Its diagram-only callouts `4_09` (page 3), `10_31` and `10_32` (page 9) have no printed table records and are explicit exceptions. The printed `22_15` in the figure-24 supermoto table is retained unchanged. Brake-pad callout `16_03` crosses the page-14/page-15 break and was visually reconciled. The sticker table has neither a printed figure number nor callouts.

Motorino has six diagram-only exceptions: `3_06` on page 3, and `8_08`, `8_10`, `8_12`, `8_13`, `8_24` in the illustration on page 12. Emotobykes has diagram-only `14_06` and `14_07` on page 20; 13 other figure image regions render blank or clipped in the available Poppler tools. Their legible table rows were still imported. Exact pages, figures and evidence are recorded in the generated report and the independent [Motorino](../data/oem/audits/motorino-visual-audit.json) and [Emotobykes](../data/oem/audits/emotobykes-visual-audit.json) visual audits. Neither legacy PDF has a separate bolt-summary table; its fasteners are included in the figure tables.

The [newer retailer reference](https://lithiumpowersports.com/pages/surron-light-bee-parts-diagram) links 27 collections. Sixteen were accessible; eleven returned HTTP 429 during ingestion:

| Unavailable collection  | Unavailable collection                 |
| ----------------------- | -------------------------------------- |
| Fender kit              | MY26 front brake system                |
| MY26 rear brake system  | MY26 locks, lights, horn and converter |
| Rear rubber fender kit  | Rear shock system                      |
| Seat                    | Secondary belt drive kit               |
| Side stand and footpegs | Steering system and front fork         |
| Swingarm assembly       |                                        |

The exact collection slugs, acquisition failures, parsed-card counts and advertised-count discrepancies are in [current-web-ingestion.json](../data/oem/audits/current-web-ingestion.json). Six accessible collections have a discrepancy between their advertised part count and the actual product-card count; every parsed card was retained and the mismatch is a review exception. Retailer diagram artwork was not copied or used to infer quantities. The newer catalog is incomplete, especially for MY26 braking and electrical changes.

## Identity, occurrences and provenance

The existing 3D engine still consumes its original recursive `Catalog` protocol. The new `src/oem/` domain is separate; `toExplorerCatalog()` adapts source-backed occurrences to selectable explorer nodes.

| Concept            | What it represents                                                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CatalogPart`      | An identity keyed by the exact OEM string, with stable ID, aliases and links to every source row. A missing number gets its own source-scoped identity.                                  |
| `Assembly`         | A source figure/table group under the motorcycle. Explicit aliases reconcile terminology; part names never establish hidden mechanical nesting.                                          |
| `PartOccurrence`   | One source-backed usage in an assembly: quantity, source callout, variant evidence, review state and geometry references.                                                                |
| `ModelVariant`     | A source-year claim or an explicitly unknown year. It is not a blanket compatibility assertion.                                                                                          |
| `SourceRow`        | Immutable original description, exact part number, quantity text, dimensional/weight text, material if stated, source page/figure/callout, confidence and extraction notes.              |
| `ReviewPatch`      | An editable overlay on one occurrence. The original evidence remains inspectable.                                                                                                        |
| `PartRelationship` | Reserved evidence-backed supersession, alternative-number, confirmed-interchangeable or similar-specification relationship. These are separate kinds; no interchangeability is inferred. |
| 3D mapping         | Mesh/object references to existing selectable occurrence IDs, which link back to the catalog identity. Mapping is independent of geometry filenames and OEM strings.                     |

An exact repeated OEM number shares one identity while retaining all its occurrences, descriptions, quantities and source claims. A source callout such as `17_07` is not a universal identifier. Stable part IDs contain a sanitized OEM label and a hash of the **exact** original string; punctuation, zero padding, suffixes and letter case are not silently normalized into another identity. Source-row IDs contain source, page and physical row ordinal; occurrence IDs prefix those with `occ-`.

One commercial assembly can appear alongside its separately sold bearings, clips and fasteners. These remain separate records without an invented assembly bill of materials. A source diagram group can contain several nested commercial assemblies; refining their actual mechanical relationships is an explicit review/model-preparation task.

### Model years and standardized components

Motorino and Emotobykes do not establish production years; their rows stay **year unspecified**. Publication paths and PDF creation dates are not fitment evidence. The `2021` file label is stored as edition context; its title does not establish complete production-year coverage. The PDF metadata records creation in May 2022.

Retailer years are retained only when explicitly present in a product or section label. MY17–25 and MY26 claims remain distinguishable; unknown rows do not silently enter a specific-year filter. Public `year=2021` or `year=unknown` and `source=lbx2021` query parameters filter source evidence, not verified compatibility. A year label on a source does not certify that every listed optional variant is installed on every motorcycle that year.

For example, the 2021 midshaft `Z-6000-2Z-26-10-08` occurrence records quantity **3** while historical references can record a different quantity. Both claims remain. `6000-2Z`, `6000-2RS` and `6001-2RS` must remain distinct designations unless separate evidence establishes a particular relationship. Similar text or dimensions never creates confirmed interchangeability.

Dimensions and weights remain literal source claims, including decimal commas and apparent errors. The 2021 headings specify millimetres and kilograms, but individual cells also contain links, teeth and inch dimensions. Optional `dimensionUnitText` and `weightUnitText` fields preserve those printed column headings alongside populated measurement cells; explicit cell units take precedence. No automatic unit conversion turns counts into distances. Sources without stated units do not receive inferred unit fields. Typed, verified dimensions can be added after checking the physical meaning of each claim.

## Reproduce the ingestion offline

Normal application development and deployment need only the checked-in JSON and npm dependencies. PDF/HTML extraction tools and reference documents are not runtime dependencies.

To reproduce extraction, provide Python 3, Poppler's `pdftotext`, `qpdf` for the 2021 cell-boundary parser, and BeautifulSoup (`bs4`, distribution package commonly named `python3-bs4` or Python package `beautifulsoup4`) for the supplemental HTML parser. `pdfinfo`, `pdftoppm` and `pdftocairo` are useful for audits. Install these through your chosen development environment; the scripts do not install system packages.

The actual local directory is **`reference/parts-catalogue/`**, with these unchanged originals:

```text
reference/parts-catalogue/
  katalog-zapchastej-surron-light-bee-2021.pdf
  sur-ron-light-bee-parts-diagrams.pdf
  Sur-Ron-Spare-Parts.pdf
```

From the repository root:

```sh
python3 scripts/oem/extract-legacy.py
python3 scripts/oem/extract-2021.py
python3 scripts/oem/extract-current.py
npx tsx scripts/oem/build-catalog.ts
```

The legacy parser defaults to both PDFs. Use `--source motorino` or `--source emotobykes`, `--source-dir PATH`, and `--output-dir PATH` when needed. The 2021 parser accepts optional positional input-PDF and output-JSON paths. Both PDF parsers compare the source hash with the inspected edition and check independent per-page physical row counts. A different source file requires a new audit; it cannot silently reuse the existing visual sign-off.

The supplemental parser defaults to **offline** files under `.agent/catalog-ingestion/lithium-<collection-slug>.html`. Those private caches are ignored by Git. If the caches are absent, the committed extraction JSON still supports the application and the database builder; the HTML parser reports unavailable snapshots. Offline reruns refresh available snapshot counts and retain prior acquisition errors for unavailable snapshots. `--download` explicitly permits fetching missing snapshots; it does not bypass access restrictions and does not refetch files already cached.

`build-catalog.ts` accepts optional positional input-extraction-directory and output-directory arguments. It validates source rows, provenance and page coverage, deduplicates exact OEM identities, retains occurrences, detects discrepancies, validates the explorer adapter, then regenerates `catalog.json`, `coverage.json` and `report.md`. It performs no network requests. Repeating it with the same extractions is deterministic; it rebuilds the complete snapshot and never appends duplicate records.

Treat a revised PDF as a new source edition with its own source ID and audited checksum. Keep the old extraction for historical evidence and establish explicit relationships for revisions. Do not overwrite an old source ID with reordered rows that would change what existing occurrence IDs mean.

## Review records without editing JSON

1. Open `/catalog`. Search an OEM number, description or callout. Filter by assembly, source, source year or an issue: missing OEM, missing quantity, dimensions, conflicting claims, repeated OEM identity, review status or absent geometry.
2. Select a row. Its inspector shows the normalized display, immutable original claims, source page/figure/callout, extraction notes and discrepancy links. Repeated OEM identities are expected where one fastener appears in multiple assemblies; review them before merging anything further.
3. For a PDF source, choose **Attach original PDF locally**. The browser checks the file's SHA-256 against the audited source and opens a local object URL at the selected page. It never uploads or publishes the PDF. An external source link remains available as a separate reference.
4. Edit the normalized English name, assembly relationship, verification state and review notes. OEM and quantity overrides require a correction-evidence note. The original fields remain visible alongside the overlay.
5. Use row checkboxes or **Select displayed** for bulk status or assembly changes. The table loads more rows in batches; selecting displayed rows does not select hidden results automatically.
6. Use **Export edits** for a small patch file and **Export complete catalog** for the complete database, including originals, conflicts and review patches. **Import review** accepts those exported edits; importing a complete database export restores its review patches against the current source snapshot. It does not replace the immutable source database with arbitrary incoming records.

Review saves use browser-local storage under `surron-oem-review-v1`. They do not write the repository or a production API. Export after a review session; browser storage can be cleared. Source-checked means a reviewer checked the source record; mechanically-verified requires the separate engineering review. Marking a record does not silently resolve historical source conflicts or establish cross-year fitment.

The builder generates an unreviewed base snapshot. Preserve exported patches when regenerating. To promote reviewed data into a shared release, use `applyReviewPatches()` with the validated base or the complete exported catalog, validate it with `validateOemDatabase()`, and commit the resulting snapshot with its evidence. The local review UI is not a public publishing or synchronization system.

## Connect accurate geometry later

1. Choose the actual motorcycle generation, source edition and optional configuration. Resolve quantity and part-revision questions before using the rows as a mechanical bill of materials.
2. Prepare separate selectable objects in metres with stable object IDs, preserved assembled origins and transforms. Follow the [Blender/model pipeline](model-pipeline.md).
3. Open `/editor`, import your GLB or glTF and companions, then search/map meshes to the existing OEM occurrence. Repeated OEM results represent different source occurrences; select the intended assembly and source record. Several meshes can belong to one occurrence, and one physical-part identity can appear through multiple occurrences.
4. Keep source catalog IDs stable when replacing geometry. Map new object IDs to the same occurrence records; importing a replacement GLB must not replace the OEM database. Missing meshes leave the catalog records searchable.
5. Author and mechanically verify explosion vectors/distances, component origins, assembled positions and camera framing. Review the three-bearing midshaft claims and exact bearing designations against your chosen source/model; no synthetic layout supplies that evidence.
6. Export project/mapping metadata, preserve original model files separately, save locally, then use **Preview in explorer** at `/?workspace=local`. Browser-local workspace links do not share geometry with another user.

After validation, add versioned models to `public/models/` and register mappings in `src/config/assets.ts`. Dedicated assembly models remain supported. The existing editor's catalog export is the viewer projection; **Export complete catalog** in `/catalog` is the authoritative export for the new source/occurrence/provenance domain. Keep both when handing off mapping work and source review.

## Verification and remaining inputs

Run the source and integration tests with the repository's Vitest command; use the main README for browser/build checks. `tests/oem2021.test.ts` specifically protects all 392 2021 rows, merged variant cells, the seven reference midshaft entries, missing values, clipped brake-pad callouts, unusual dimension units and diagram-only exceptions. The other OEM tests cover reconciliation, provenance, source coverage, review validation, variant separation and idempotent rebuilds.

The next evidence to supply is:

- The accurate stock motorcycle and detailed assembly GLB/glTF files, original Blender/CAD projects and required textures.
- Factory documents with explicit production-year/market applicability, especially MY25/MY26 revisions and the eleven unavailable retailer sections.
- Better copies of clipped/blank legacy diagrams and documents identifying the diagram-only callouts.
- Mechanical decisions on disputed quantities, standardized bearing designations, suspicious source dimensions/weights, optional equipment and superseded/interchangeable parts.

Input PDFs and HTML snapshots are local reference assets, excluded from Git and public model hosting. Factual extracted fields retain attribution and external links. Full PDFs, rendered pages and diagram artwork must not be added to `public/` without established redistribution rights.
