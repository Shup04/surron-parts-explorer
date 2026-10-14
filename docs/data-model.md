# Catalog, provenance and interchange

`src/oem/types.ts` defines the source-backed identity, occurrence, assembly, variant, relationship and review database. `data/oem/catalog.json` contains the audited release; see [OEM schema and provenance](oem-catalog.md). `src/oem/adapter.ts` projects that database into the existing viewer contract in `src/core/types.ts` without inventing geometry or flattening source evidence.

This document describes that **viewer projection** and its CSV/JSON interchange, not the complete OEM database export. `src/data/catalog.ts` remains the separate 22-record synthetic fixture used only by demonstration workflows. Original measurements retain raw source text and printed unit headings in the OEM layer; mechanically unverified values are not silently converted to numerical viewer measurements.

## Identity and hierarchy

Each catalog covers one motorcycle. `motorcycleId` identifies its root record, whose `kind` is `motorcycle` and `parentId` is `null`. Every other record has a stable `id` and a parent. An `assembly` can contain other assemblies and components; a `component` is a leaf. Children are derived from parent IDs so parent and child lists cannot contradict one another. Do not encode a mesh name, vendor SKU or current position in a catalog ID.

`buildCatalogIndex` produces lookup and child maps. Iterative ancestor and descendant traversal handles deep hierarchies without recursive call-stack limits. Validation rejects missing parents, cycles, duplicate IDs, extra roots and children of leaf components. Separate records can describe left/right occurrences of the same manufactured item and cross-reference one another. Quantities are per parent assembly; unknown quantities are `null`, never inferred from the visible mesh count.

Search indexes names, identifiers, descriptions, OEM numbers, generic designations, dimensions and specifications. Ancestor names contribute to results such as `drivetrain bearing`. URL state uses `motorcycle`, `assembly` and `part` query parameters. Invalid references fall back to a valid assembly; a part in another branch changes the assembly to its parent.

## Unknowns and evidence

Use `null` for an unknown scalar and an empty array/object for unrecorded dimensions, fitment, sources or specifications. Do not turn the synthetic model's measured dimensions into catalog specifications. `verification` is one of:

- `unknown`: no confirmation is recorded.
- `demonstration`: illustrative content only.
- `source-confirmed`: transcribed and checked against an identified source.
- `mechanically-verified`: physical fit or mechanical relationships were checked.

Record every supporting drawing in `sources`, preserving the document title, page, diagram, item and exact part-number spelling. Optional notes can explain the verification method or uncertainty. Overall part status is a summary; compatibility entries and explosion definitions have their own status. For field-level provenance beyond source notes, extend the schema explicitly rather than silently treating an overall status as confirmation of every value.

OEM numbers and generic designations are strings so leading zeroes survive. Dimensions are structured values with units (`mm`, `cm`, `m`, `deg`). Manufacturer or supplier claims belong in a cited source; nothing in the software establishes interchangeability. `alternatives[].relation` distinguishes `confirmed-interchangeable`, `similar-specification` and `unverified`. An alternative ID may identify a future product record outside the stock catalog; it does not establish fitment.

## Importing source drawings

Use the [OEM ingestion workflow](oem-catalog.md) for production source records. The steps below describe small viewer-catalog templates; they do not preserve the complete source-row/physical-identity distinction on their own.

1. Keep the original PDF/image and record its edition and applicable motorcycle/year.
2. Transcribe one drawing's records into a copy of `public/templates/catalog.json` or `.csv`.
3. Preserve exact numbers and punctuation. Record the source page/diagram/item on each part.
4. Review OCR output manually, especially zero/O, one/I, hyphens, suffixes and quantity columns.
5. Leave year compatibility and dimensions unknown when a drawing does not state them.
6. Validate before import. A valid file is structurally consistent; it is not mechanically verified.

```sh
npm run catalog -- validate public/templates/catalog.json
npm run catalog -- validate public/templates/catalog.csv
npm run catalog -- convert my-catalog.csv my-catalog.json
npm run catalog -- convert my-catalog.json my-catalog.csv
```

The converter refuses to overwrite an existing output. In environments that block the `tsx` CLI's IPC socket, use `node --import tsx scripts/catalog.ts` with the same arguments.

CSV contains one row per part. The complete header is provided in the template. Nested fields (`specifications`, `dimensions`, `compatibility`, `sources`, `images`, `alternatives`, `crossReferences`) contain JSON within quoted CSV cells. Blank nullable scalar cells mean unknown. `catalogVersion` and `motorcycleId` repeat on every row. Quoted commas, escaped quotes and multiline notes round-trip. Import OEM columns as **text** in spreadsheet programs to prevent automatic number/date conversion; treat untrusted spreadsheet formulas as text. Do not add unsupported columns: validation reports them rather than discarding them.

## Mapping geometry without changing the catalog

A mapping file has its own version, asset ID and convention (`units: "m"`, `upAxis: "Y"`). Each mapping binds one object key to one catalog part ID. Multiple objects can map to the same part. A mesh/object cannot map to several parts at once. Persistent Blender custom property `objectId` is exported through glTF `extras` and becomes key `id:VALUE`.

Without that property, the key is an indexed path from the imported scene root, for example `$/0:drivetrain/1:bearing`. The index disambiguates duplicate names, but changing sibling order or adding wrappers can invalidate a path. Use persistent IDs for production geometry. Catalog IDs remain unchanged regardless of which mapping strategy is used. Name suggestions in the editor require acceptance; ambiguous mappings are shown and are not silently resolved.

Validate a mapping against both its catalog and imported object list when replacing an asset. Confirm formerly mapped objects still exist, ensure no duplicate persistent IDs, and review any new unmapped objects. A group mapping can represent an assembly, while its children can have more specific mappings. Do not use a parent and child explosion accidentally: their transforms compose by normal scene hierarchy rules.

## Exploded layouts

The optional mapping `explosion` stores a direction vector, distance in metres, animation duration in seconds, easing (`linear`, `smooth`, `cubic`) and verification status. Direction is normalized. Vectors are in the mapped object's **parent coordinate system**, not necessarily world space. Shafts, bearings and spacers usually need a shared axis defined by the actual assembly; the software does not infer that axis from a part name.

The engine captures the original object position and derives each frame from that baseline. At zero explosion the original position is restored exactly, without accumulating offsets. Original rotation and scale are retained. Automatic layout is an approximate demonstration and must be reviewed before making mechanical claims. A configured vector is also unverified until its verification status and source warrant a stronger claim.

## Additional motorcycles and future product variants

Create a separate catalog with another stable motorcycle root, register its assets, and select that catalog at the application boundary. The domain helpers accept any catalog and do not switch on assembly names. The current interface loads the LBX catalog by default; a multi-motorcycle landing page is a future UI extension.

Keep stock catalog occurrence IDs distinct from purchasable product IDs. Future product records can store supplier SKUs, price, availability, variant geometry and compatibility rules. A build configuration should reference the motorcycle catalog version plus selected product/part variants; geometry replacement then uses separate asset/mapping entries. No accounts, checkout, affiliate tracking or server write endpoints are required by the current implementation.
