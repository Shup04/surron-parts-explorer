# Owner handoff and public MVP checklist

## Files to supply

1. Full stock Light Bee X GLB/glTF, its original Blender/CAD project, and separate high-detail assemblies where useful.
2. All external buffers and textures when using `.gltf`; original textures and material references for review.
3. Authoritative MY25/MY26 factory parts documents and a clearer copy of the clipped Emotobykes diagrams, if available. The three historical PDFs are already extracted; exact remaining gaps are in [the coverage report](../data/oem/report.md).
4. Review corrections exported from `/catalog`, with evidence for disputed OEM numbers, quantities, dimensions and generic designations. Do not repeat the completed table transcription.
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

- Review flagged source records and diagram-only exceptions. Preserve original claims; apply documented corrections through the review tool. New editions require their own source ID and page audit.
- Distinguish an occurrence from a shared part designation. Confirm quantities within the correct assembly/model year.
- Keep all unconfirmed values null/unknown. Similar nominal specifications are not proof of interchangeability.
- Mark source-confirmed values separately from mechanically verified measurements/fitment. Do not remove demonstration labels until the relevant geometry and records have been replaced and reviewed.

## Recommended public MVP sequence

1. Supply and verify one complete stock model and one accurate detailed assembly, preferably the jackshaft, against a specific model year.
2. Map those assets to the existing source-backed occurrence IDs and register the exported mappings. Exercise the same automated flows with a sanitized representative production fixture.
3. Check mechanical alignment and labeling with the drawings, then review touch interaction on actual phones and Safari/Firefox. Establish geometry/texture budgets from measured performance.
4. Self-host any required compression decoders, verify source/asset redistribution permissions, choose a production host, and test HTTPS deep links and cache/version behavior.
5. Publish the stock explorer with clear provenance and supported model-year scope. Add aftermarket variants only after compatibility evidence and product records have a reviewed schema.

No production site was published. No stock geometry, mechanical fitment, real-device performance or Blender-export execution was certified by this implementation.
