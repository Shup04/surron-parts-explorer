# Verification record

Verified on 2026-10-13 with Node.js 24.18.0 and the committed npm lockfile.

| Check                                | Result                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                  | Pass                                                                                                            |
| `npm test`                           | 130 tests pass across ten files                                                                                 |
| `npm run format:check`               | Pass                                                                                                            |
| `git diff --check`                   | Pass                                                                                                            |
| Chromium suite, production preview   | 23 browser flows pass with one worker                                                                           |
| `npm run build`                      | Pass; explorer, catalog review and editor prerendered                                                           |
| Built application smoke test         | Production catalog and OEM detail routes hydrate; desktop/mobile visual checks pass without horizontal overflow |
| JSON and CSV template CLI validation | Both pass; 22 explicitly synthetic records                                                                      |

Browser automation used the installed `/opt/google/chrome/chrome`, configured through `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, with SwiftShader WebGL. The mobile case uses a 390 × 844 viewport. It is not a physical-device or cross-browser certification.

The unit/integration suite exercises catalog traversal including a 4,000-level hierarchy, invalid roots/cycles/duplicates, strict schema parsing, numbers/provenance/search, URL normalization, CSV/JSON round trips, stable/inherited/ambiguous object mappings, malformed and missing model inputs, scene units/transforms, explosion math and exact reassembly, camera bounds, visibility/raycast behavior, and local editor project/resource handling.

The browser suite exercises actual geometry raycasts, search-driven selection, nested assembly navigation, reassembly/explosion controls, hide/show/isolation, browser back and reload, responsive navigation, keyboard selection, local glTF import, explicit ID matches, remapping, explosion/camera exports, IndexedDB-to-explorer handoff, malformed assets, catalog regrouping/renaming, standalone catalog import and edited demonstration previews.

Curated navigation adds 13 unit checks and seven browser flows: fourteen displayed systems, meaningful front-wheel children and collapsed service parts, jackshaft bearing distinctions and quantities, front/rear brake locations, unconfirmed battery variants, reference-only decals/accessories, exact selector membership, unchanged catalog data, explicit configuration evidence, source filters, legacy part links, mobile controls and history without duplicate entries. The no-geometry **Parent assembly** button is pointer-accessible and returns to the presentation parent.

The final browser run used the production build on `127.0.0.1:31387`, with a temporary Playwright config overriding `use.baseURL` and disabling its development-server startup. All 23 flows passed in 47.3 seconds. An earlier development run was interrupted when dependencies and the reused server became unavailable; after restoring dependencies from the unchanged lockfile, the reused development server exhibited a reload loop. The isolated production preview avoided that server state. No existing development server was terminated.

OEM coverage includes every audited source row, missing identifiers and quantities, the seven supplied 2021 midshaft examples, exact OEM preservation, repeated identities/occurrences, source-edition filtering, preserved quantity disagreements, immutable review corrections, deterministic rebuilding, and source-unit headings. Browser tests include real OEM search without geometry, review import/export and persistence, PDF fingerprint rejection, source/year history, mobile detail restoration, safe bulk filtering, additive legacy-project migration, and mapping/replacing a model before viewing the sourced occurrence after reload.

The positive local-PDF browser test runs when the ignored original PDF is available and skips on clean checkouts without it. The other 22 browser flows do not require copyrighted reference inputs. Run browser suites serially; concurrent Playwright processes share and can delete the same trace artifacts.

The initial production build inside the execution sandbox failed because a detached TypeScript subprocess returned empty stdout. Running with normal process permissions passed the unchanged build and its TypeScript validation. Local server/browser execution likewise required normal socket/process permissions. Type checking was never disabled.

Still unverified: real stock assets and mechanical alignment, source claims as physical measurements/fitment, exact contents of explicitly listed unreadable or missing diagram callouts, eleven unavailable newer-reference collections, final-model load time/FPS/memory on target phones, physical touch gestures, Safari/Firefox, Blender helper execution, optional static-export hosting and a deployed public URL. The three PDF table transcriptions were audited; that is not a mechanical certification. See [source coverage](../data/oem/report.md).
