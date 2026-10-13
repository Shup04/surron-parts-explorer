# Owner handoff and public MVP checklist

## Files to supply

1. Full stock Light Bee X GLB/glTF, its original Blender/CAD project, and separate high-detail assemblies where useful.
2. All external buffers and textures when using `.gltf`; original textures and material references for review.
3. Factory parts drawings/PDFs, including edition, page/diagram/item references and model-year coverage.
4. Reviewed catalog CSV/JSON transcriptions or enough source information to confirm OEM numbers, descriptions, quantities and generic designations.
5. Evidence for model-year compatibility, physical dimensions and any interchangeable bearing/fastener claims.

## Geometry preparation you retain

- Identify the source unit convention. Convert millimetres to metres deliberately and verify a known dimension after export. The app never rescales a model based on appearance.
- Split selectable occurrences into objects. Keep useful assembly empties, meaningful object origins/local axes, and exact assembled transforms.
- Assign unique stable string `objectId` custom properties. Enable custom properties in glTF export. Preserve IDs when replacing an unchanged component's geometry.
- Give useful object names for matching, but do not use a mesh name as the catalog database key.
- Confirm each object-to-part mapping and assembly parent. Duplicate objects need distinct object IDs; repeated instances requiring individual catalog identity need separate mappings/objects in this version.
- Define shaft/bearing/washer/spacer explosion directions along the correct parent-space axis. Check directions and distances against actual assembly/disassembly structure. The synthetic layout is only a demonstration.
- Inspect both assembled and fully exploded endpoints, intermediate amounts and nested assemblies. Check camera framing and component visibility, then export the mapping.
- Optimize the whole-bike asset and preserve details in assembly assets. Measure triangles, draw calls, texture sizes and load/interaction behavior on target phones.

## Catalog preparation you retain

- Transcribe original OEM text exactly, retaining punctuation/leading zeroes. Record document, page, diagram and item references.
- Distinguish an occurrence from a shared part designation. Confirm quantities within the correct assembly/model year.
- Keep all unconfirmed values null/unknown. Similar nominal specifications are not proof of interchangeability.
- Mark source-confirmed values separately from mechanically verified measurements/fitment. Do not remove demonstration labels until the relevant geometry and records have been replaced and reviewed.

## Recommended public MVP sequence

1. Supply and verify one complete stock model and one accurate detailed assembly, preferably the jackshaft, against a specific model year.
2. Register those assets and source-backed catalog records. Exercise the same automated flows with a sanitized representative production fixture.
3. Check mechanical alignment and labeling with the drawings, then review touch interaction on actual phones and Safari/Firefox. Establish geometry/texture budgets from measured performance.
4. Self-host any required compression decoders, verify source/asset redistribution permissions, choose a production host, and test HTTPS deep links and cache/version behavior.
5. Publish the stock explorer with clear provenance and supported model-year scope. Add aftermarket variants only after compatibility evidence and product records have a reviewed schema.

No production site was published. No stock geometry, mechanical fitment, real-device performance or Blender-export execution was certified by this implementation.
