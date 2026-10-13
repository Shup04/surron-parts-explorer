# Verification record

Verified on 2026-10-13 with Node.js 24.18.0 and the committed npm lockfile.

| Check                                | Result                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `npm run typecheck`                  | Pass                                                                                   |
| `npm test`                           | 68 tests pass across five files                                                        |
| `npm run format:check`               | Pass                                                                                   |
| `git diff --check`                   | Pass                                                                                   |
| `npm run test:e2e -- --workers=1`    | Seven Chromium browser flows pass                                                      |
| `npm run build`                      | Pass; explorer and editor prerendered                                                  |
| Built application smoke test         | Both routes return HTTP 200, hydrate and render WebGL canvases; no browser page errors |
| JSON and CSV template CLI validation | Both pass; 22 explicitly synthetic records                                             |

Browser automation used the installed `/opt/google/chrome/chrome`, configured through `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, with SwiftShader WebGL. The mobile case uses a 390 × 844 viewport. It is not a physical-device or cross-browser certification.

The unit/integration suite exercises catalog traversal including a 4,000-level hierarchy, invalid roots/cycles/duplicates, strict schema parsing, numbers/provenance/search, URL normalization, CSV/JSON round trips, stable/inherited/ambiguous object mappings, malformed and missing model inputs, scene units/transforms, explosion math and exact reassembly, camera bounds, visibility/raycast behavior, and local editor project/resource handling.

The browser suite exercises actual geometry raycasts, search-driven selection, nested assembly navigation, reassembly/explosion controls, hide/show/isolation, browser back and reload, responsive navigation, keyboard selection, local glTF import, explicit ID matches, remapping, explosion/camera exports, IndexedDB-to-explorer handoff, malformed assets, catalog regrouping/renaming, standalone catalog import and edited demonstration previews.

The initial production build inside the execution sandbox failed because a detached TypeScript subprocess returned empty stdout. Running with normal process permissions passed the unchanged build and its TypeScript validation. Local server/browser execution likewise required normal socket/process permissions. Type checking was never disabled.

Still unverified: real stock assets and mechanical alignment, source-document transcription, final-model load time/FPS/memory on target phones, physical touch gestures, Safari/Firefox, Blender helper execution, optional static-export hosting and a deployed public URL. No supplied source files were available to perform those checks.
