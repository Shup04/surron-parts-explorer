# Visual system

The explorer, catalog review and model mapping studio share a neutral graphite theme. Color describes interaction or a meaningful warning; the motorcycle stays the focus. The Pass 1 navigation, disclosure, focus handling and responsive panel behavior are retained.

## Tokens and primitives

`src/ui/tokens.json` is the source for palette, typography, spacing, radii, control sizes, motion and scene colors. The root layout exposes its `css` entries as CSS variables during server rendering. Both Three.js viewers import the `scene` entries directly. Change tokens here instead of introducing local palettes.

| Role           | Value     |
| -------------- | --------- |
| Canvas / base  | `#141619` |
| Panel          | `#1b1e23` |
| Raised control | `#24282e` |
| Primary text   | `#edf0f3` |
| Secondary text | `#a0a8b3` |
| Accent         | `#8cbbeb` |
| Divider        | `#343a43` |

Use the accent for selection, focus, primary actions and the explosion slider. Hover surfaces are neutral. Warning, error and success tokens belong to actual states such as conflicting records, failed imports or mapping status. Surface depth uses solid fills; no background gradients, glows or blur effects are required.

`Button` and `IconButton` in `src/components/ui/Button.tsx` retain native button props, refs, keyboard behavior and ARIA state. The shared styles in `src/ui/primitives.css` define primary, secondary, ghost and danger variants, form fields, technical values and range controls. Component styles handle placement and responsive layout. `src/ui/viewer.css` owns viewer tooltips and loading/error overlays.

Spacing follows a 4px scale. Controls use 6px radii, with 4px and 10px alternatives. Viewer controls retain 44px targets. Focus outlines are explicit, and motion honors the existing reduced-motion preference. Small supporting text is at least 12px; ordinary UI text is 13–14px with a comfortable line height.

## Type and technical data

Geist is served locally through `next/font/local`, with no font CDN or build-time font download. Geist Mono is reserved for OEM numbers, object IDs, numeric inputs and technical values. Human-readable part names, navigation and form labels use sans serif. Sentence case replaces dense uppercase labels.

Font assets are copied from the installed Next.js 16.4.0 distribution's Geist Latin files. Their [SIL Open Font License](../src/app/fonts/OFL.txt) is included; the license was obtained from [the official Geist repository](https://github.com/vercel/geist-font/blob/main/LICENSE.txt). Preserve that license when updating the files.

## Viewer appearance

Lighting uses neutral sky, ground and key-light colors with a restrained cool fill. Existing model materials, geometry, lighting topology, camera controls and rendering cadence remain intact. Hover and selection use separate material clones with a small blue contribution, preserving textures, roughness, metalness and source emission. Original materials are restored when highlighting ends; cloned materials remain shared per original material and are disposed when the scene is released. The studio uses matching selection outlines.

## Verification

`tests/e2e/visual.spec.ts` checks rendered neutral surfaces, primary/secondary text contrast, loaded sans-serif UI fonts, monospace OEM identifiers, control target sizes, mobile review headings and horizontal overflow. It captures the overview, assembly, exploded assembly, part details, OEM search, mapping studio and catalog review at desktop, laptop, tablet and phone sizes. WebGL screenshots are review artifacts rather than brittle pixel baselines. See [testing](testing.md) for the recorded run and remaining limitations.
