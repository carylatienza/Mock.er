# Mock.er

A 3D jersey mockup generator for teamwear designers. Upload flat jersey artwork, get a
rotatable 3D basketball jersey you can export angles from.

100% client-side. No backend, no database, no accounts, no per-render cost — the mesh, the
texture pipeline, and the PNG export all run in the browser.

## Flow

1. **Upload** one jersey design, with or without a background.
2. **Wrap** — the app isolates the garment and warps it onto the front panel so its neckline,
   hem, and side seams land on the mesh's. Sides fill from the extracted base color; the back
   is derived from that color and labeled derived in the UI.
3. **Orbit** the jersey freely.
4. **Export** the current view or a preset angle (Front, Back, Left, Right, 3/4) as a fixed
   1600x1600 PNG.

## Development

```bash
npm install
npm run dev
```

```bash
npm run build
npm start
```

## How it works

The mesh is generated procedurally in `src/lib/jersey.ts` — one parametric torso surface sliced
into four indexed panels (front, back, left, right), each mapped to a fixed quadrant of a 2048²
texture canvas. That UV contract is the interface everything downstream is written against.

The texture pipeline is three stages: **isolate** (`src/lib/segment.ts`) pulls the garment out of
the upload via alpha or border flood-fill; **wrap** (`src/lib/warp.ts`) builds a per-column
silhouette and inverse-maps the source into the front UV island, normalizing every column between
the garment's own top and bottom contour; **composite** (`src/lib/texture.ts`) fills the side and
derived back panels. Warping to the silhouette rather than fitting a rectangle is what makes the
design read as fabric instead of a sticker.

For a bare logo or crest, switch to "place as graphic" — aspect-preserving fit plus manual nudge.

Product requirements: [docs/PRD.md](docs/PRD.md). Technical spec: [docs/SPEC.md](docs/SPEC.md).
