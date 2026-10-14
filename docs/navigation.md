# Curated motorcycle navigation

The public tree organizes the motorcycle into 14 systems. It is a presentation layer over the existing OEM database, not a new parts database or bill of materials. All 1,396 source occurrences and 683 catalog identities remain intact. Search and `/catalog` continue to expose the complete reference catalog, including records without geometry.

## Organization

`src/navigation/definition.ts` explicitly assigns existing OEM identities within source assembly scopes to physical inspection roles. Rows without OEM numbers use stable source-row IDs. Descriptions, keyword matches, quantities and arbitrary row limits never determine membership. Editing a description does not change where a component appears.

- Front wheel groups tire, rim/spokes, hub, axle, bearings and rotor; secondary hardware lives under **Service parts**.
- Jackshaft retains shaft, bearings, sprockets, pulley, bushings/spacers, seals and service hardware. Different bearing designations remain separate reference candidates, with each source quantity preserved.
- Brakes separates documented front/rear locations and provides shared pad/lever roles. Calipers with unresolved location remain in assembly references instead of being assigned to a guessed position.
- Battery has an inspection role for the installed pack and its associated components. Historical capacities remain collapsed reference candidates. Chargers are available through search and the full catalog.
- Individual decals, cosmetic color alternatives, external accessories and optional conversion kits are excluded from ordinary navigation. Unconfirmed road equipment is available in source assembly references and search.

Service sections start collapsed. Counts indicate immediate displayed children, including service sections, rather than raw source rows. Reference details group repeated descriptions by existing catalog identity within the selected role; they retain every occurrence, source, callout, specification and quantity. Distinct OEM identities are never merged because their names resemble each other.

## Evidence and installed variants

The supplied database does not establish a verified installed motorcycle configuration. Generic inspection roles therefore identify what to inspect without choosing an OEM variant. Each component section says **Installed variant not confirmed** and keeps source candidates separate. The source/year selectors filter evidence, not physical fitment. Empty evidence filters leave the inspection organization available with no matching candidates.

Explicit installed configurations can be registered in `src/navigation/configurations.ts` using the `VerifiedConfiguration` contract in `model.ts`. This registry intentionally ships empty. An assignment must include:

1. A stable configuration ID, motorcycle ID and exact model year.
2. A curated component role ID and existing occurrence IDs for one physical catalog identity.
3. `verification: 'verified-installed'` and a written evidence reference establishing that installation.

Selecting a matching configuration adds the evidenced identity under its role. Alternate source candidates remain in reference details. Missing evidence, mixed identities, conflicting assignments, unavailable occurrences or a motorcycle/year mismatch produce no installed child. Source review status, a catalog edition and the existence of a mapped mesh do not establish installation. A configuration can be partial; unassigned roles remain unconfirmed. The configuration selector appears when the registry has entries.

## Selection, geometry and links

`src/navigation/model.ts` builds independent navigation nodes. It never mutates catalog parents or IDs. `src/components/CuratedParts.tsx` renders these nodes using the existing UI styles. The renderer, explosion transforms, model editor and mesh mappings continue to consume the original catalog hierarchy.

The optional `nav` URL parameter addresses a presentation group, for example `/?assembly=jackshaft&nav=nav.jackshaft.bearings`. `part` still identifies an exact existing source occurrence and takes precedence over a presentation group. Selecting a reference opens that occurrence, preserving the original assembly scope and mesh mapping. Browser back/forward and reload restore both forms of navigation. Legacy links, including reference-only decals and accessories, continue to work.

OEM local workspaces use this layer without replacing their saved catalog or mapping. The separate synthetic demonstration and custom non-OEM editor workspaces retain their existing trees. No model import or PDF ingestion is needed to change navigation.

## Maintaining the organization

Add or adjust explicit roles in `definition.ts`, checking the source assembly and exact identifiers in the existing database. Keep uncertain mechanical locations at the nearest supported system reference level. Add optional equipment to ordinary navigation only when its configuration is established. Do not reparent source occurrences to UI service groups; the 3D engine uses catalog ancestry to resolve visibility and explosion scope.

Run `npm test -- tests/curated-navigation.test.ts` and the browser flows in `tests/e2e/curated-navigation.spec.ts` after curation changes. These cover the five requested systems, source preservation, exact matching, configuration validation, counts, collapsed service sections and navigation history. The existing explorer/editor browser flows cover raycasts, exploded views and persistent OEM mappings.
