# Modeled motorcycle navigation

The public tree lists parts with assigned models and the assemblies needed to group them. Empty systems and unmodeled component roles are omitted. Explorer search follows the same rule. All 1,396 source occurrences and 683 catalog identities remain intact in `/catalog`, and the editor retains the complete set of roles for adding future models.

## Adding models to the hierarchy

`src/navigation/modeled.ts` projects the curated roles into the public tree using the active model mappings. The project assembly reads `public/parts/manifest.json`; each entry's `role` identifies its place in the hierarchy. Register a new exported model there with its role and it appears automatically. Local imports use the role selected in the editor and appear after **Save & preview**. A catalog record alone never creates a public part.

Only ancestors of modeled parts remain. If several models share one role, each gets a selectable child row with its own name. Source-only **Service parts** wrappers are omitted; populated hardware groups remain. Advanced imports without a curated role use their catalog ancestry. Removing a model assignment removes its row and any newly empty branches, without deleting source records.

For example, the supplied jackshaft currently contains one modeled pulley. Bearings, spacers and bolts appear beneath that assembly as their models are assigned. A whole-file assignment represents one part. The simple editor replaces the model for a selected role; multiple parts sharing one role need separate manifest entries or individual object mappings in the advanced editor.

## Organization

`src/navigation/definition.ts` explicitly assigns existing OEM identities within source assembly scopes to physical inspection roles. Rows without OEM numbers use stable source-row IDs. Descriptions, keyword matches, quantities and arbitrary row limits never determine membership. Editing a description does not change where a component appears.

- Front wheel groups tire, rim/spokes, hub, axle, bearings and rotor; secondary hardware lives under **Service parts**.
- Jackshaft retains shaft, bearings, sprockets, pulley, bushings/spacers, seals and service hardware. Different bearing designations remain separate reference candidates, with each source quantity preserved.
- Brakes separates documented front/rear locations and provides shared pad/lever roles. Calipers with unresolved location remain in assembly references instead of being assigned to a guessed position.
- Battery has an inspection role for the installed pack and its associated components. Historical capacities remain collapsed reference candidates. Chargers are available through search and the full catalog.
- **Footpeg assembly** groups both pegs, their brackets and bracket bolts under **Footpegs and side stand**. Selecting it opens the complete modeled footpeg assembly exploded; the bracket subgroup remains available separately.
- Individual decals, cosmetic color alternatives, external accessories and optional conversion kits are excluded from ordinary navigation. Unconfirmed road equipment is available in source assembly references and search.

These complete role definitions remain available to the editor. Public counts indicate immediate modeled children or populated groups, rather than raw source rows. Distinct OEM identities are never merged because their names resemble each other.

## Exploring the hierarchy

**Parts** opens or closes navigation. A branch arrow expands its children without changing the selection; the component name selects it. Selection reveals its ancestors and scrolls its row into view. Search clears after choosing a result so the selected item can be located in the tree. **Browse components** in assembly details reveals that branch instead of displaying a second child list.

The viewer breadcrumb and back arrow provide parent navigation. From a selected part, back returns to its current assembly; from an assembly, it moves up one level. **Complete motorcycle** and the header home link return to the overview. Details open for selected parts and assemblies, and can be closed on any screen size. On phones and tablets, the drawer traps keyboard focus, closes with Escape even from the search field, and restores focus to its trigger. Hidden components have a crossed-out tree label and a Show action; isolation has an explicit exit control.

Opening an assembly with multiple modeled parts starts its exploded view. **Assembled** restores the original transforms. Selecting a child keeps that assembly visible and retains the current explosion amount. Single modeled parts do not show explosion controls. Reloading or revisiting an assembly link uses the initial exploded view; explosion amount itself is temporary state. Authored explosion directions take precedence, while automatic layouts use the original geometry bounds and remain labeled approximate.

The header **Tools** menu opens the complete catalog review and model editor. Direct links to unmodeled OEM occurrences still open their source details; they do not add placeholder rows to the public tree. Source filters are shown for explicitly filtered URLs. Assembly details summarize modeled parts instead of listing unrelated catalog candidates.

## Evidence and installed variants

The supplied database does not establish a verified installed motorcycle configuration. Model assignments identify geometry, without choosing an OEM variant or proving fitment. Source/year selectors filter evidence, not physical fitment. Verified configuration data and reference candidates remain separate from the decision to display a modeled part.

Explicit installed configurations can be registered in `src/navigation/configurations.ts` using the `VerifiedConfiguration` contract in `model.ts`. This registry intentionally ships empty. An assignment must include:

1. A stable configuration ID, motorcycle ID and exact model year.
2. A curated component role ID and existing occurrence IDs for one physical catalog identity.
3. `verification: 'verified-installed'` and a written evidence reference establishing that installation.

Selecting a matching configuration adds the evidenced identity under its role. Alternate source candidates remain in reference details. Missing evidence, mixed identities, conflicting assignments, unavailable occurrences or a motorcycle/year mismatch produce no installed child. Source review status, a catalog edition and the existence of a mapped mesh do not establish installation. A configuration can be partial; unassigned roles remain unconfirmed. The configuration selector appears when the registry has entries.

## Selection, geometry and links

`src/navigation/model.ts` builds independent navigation nodes. It never mutates catalog parents or IDs. `src/components/CuratedParts.tsx` renders these nodes using the existing UI styles. The renderer, explosion transforms, model editor and mesh mappings continue to consume the original catalog hierarchy.

The optional `nav` URL parameter addresses a modeled role or assembly, for example `/?nav=nav.jackshaft.pulley`. Single-model role links resolve to the actual modeled part. `part` identifies an exact existing catalog part or source occurrence. When a child is selected within an assembly, `nav` retains the assembly's visible scope. Browser back/forward and reload restore the selection and scope. A role link with no assigned model falls back to the overview; direct source-occurrence links remain available.

OEM local workspaces use this layer without replacing their saved catalog or mapping. The separate synthetic demonstration and custom non-OEM editor workspaces retain their existing trees. No model import or PDF ingestion is needed to change navigation.

## Maintaining the organization

Add or adjust explicit roles in `definition.ts`, checking the source assembly and exact identifiers in the existing database. Keep uncertain mechanical locations at the nearest supported system reference level. Add optional equipment to ordinary navigation only when its configuration is established. Do not reparent source occurrences to UI service groups; the 3D engine uses catalog ancestry to resolve visibility and explosion scope.

Run `npm test -- tests/modeled-navigation.test.ts tests/curated-navigation.test.ts` and the browser flows in `tests/e2e/curated-navigation.spec.ts` after navigation changes. These cover model additions/removals, shared roles, empty branches, custom ancestry, source preservation, selection, assembly explosion and mobile navigation. The editor retains its existing import and mapping tests.

The jackshaft system contains a **Jackshaft assembly** group with the shaft, three separate bearings, spacers, oil seals, and separate six-bolt sprocket/pulley groups. Belt and chain roles remain outside that group. The pivot washer belongs to Swingarm. Existing role IDs remain valid for saved part assignments and deep links.

The jackshaft, rear-wheel and nested rear-hub assemblies are marked `selectAsAssembly`: a 3D click enters the outermost unopened assembly containing that part. Returning to the complete motorcycle restores assembly-first selection. The hub path is **Rear wheel assembly → Hub → Hub body**. Bearing, oil-seal and inner-spacer roles also belong to Hub; they appear when their models are added. External axle spacers remain outside Hub.

An unopened child assembly stays together in its parent's exploded view. `closedAssemblyGroups` supplies these groups to the viewer, using the first modeled child as the movement anchor. The hub body is ordered first. Opening Hub releases its children for their own explosion; with only the body modeled, Hub remains a navigable assembly without explosion controls.
