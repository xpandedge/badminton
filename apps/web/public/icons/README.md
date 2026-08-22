PWA and favicon assets for DuoRally.

- `icon.svg` — the logo mark, matching the `Mark` in `src/components/Logo.tsx`
  (dark theme, rest state) on the `--ink-800` brand surface. Used as the
  favicon; scales crisply at any size.
- `icon-192.png`, `icon-512.png` — rasterised from `icon.svg`. Referenced by
  `/manifest.webmanifest` with `purpose: "any maskable"`, so the artwork is
  scaled to ~62% and centred to stay inside the maskable safe zone, with the
  background full bleed.

To regenerate the PNGs after changing the logo, update `icon.svg` to match
`Logo.tsx`, then rasterise it at 192 and 512. Any SVG rasteriser works; these
were produced by screenshotting the SVG at each size in headless Chrome.

Keep `icon.svg` in step with `Logo.tsx` — they are the same mark, and a change
to one without the other leaves the app icon disagreeing with the in-app logo.
