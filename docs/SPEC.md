# Jersey Mockup Generator — v1 Spec

Upload a flat jersey design, get a rotatable 3D jersey you can export angles from.

Built for teamwear designers. The wedge is that general mockup tools treat a jersey
as a flat canvas — they don't understand that a garment has a back, side panels, or
seams. This does.

---

## v1 flow

1. User uploads one jersey design (flat artwork, with or without a background)
2. The app isolates the garment and warps it onto the front panel of a procedurally
   generated 3D jersey mesh
3. User orbits the jersey freely in the browser
4. User exports any angle as a 1600x1600 PNG — preset angles or the current view

That's the whole product. It runs entirely client-side.

---

## Non-goals for v1

Cut deliberately. Each is additive later; none rescues a bad render.

- Vector / trace output (`.ai`, `.svg`) — separate hard problem, different tool
- Marketing poster generator with editable text — second product surface, worthless until the render is good
- T-shirt and hoodie meshes — one garment first
- Accounts, auth, billing, storage — v1 is a validation slice
- PSD import — only if the source file turns out to be layer-structured
- Video export — the viewer makes it near-free later; not now
- Any generative AI in the render path

---

## Decisions locked (and why)

| Decision | Rationale |
|---|---|
| Real 3D mesh, UV-mapped — not AI image generation | Generative models warp logos and numbers. Fatal for a client proof. |
| three.js in the browser, no server rendering | Zero per-render cost. A paid product can't afford $2/render. |
| Invisible mannequin (garment alone, no body) | No pose rig, no body-type questions, no likeness licensing. It's what product shots use anyway. |
| Mesh is generated procedurally in code (`src/lib/jersey.ts`), not sourced | Authoring the geometry means authoring the UVs — the front/back/side islands are exact by construction instead of reverse-engineered from someone else's unwrap, and the whole texture pipeline depends on those islands existing. Also unblocks the build with zero licensing risk. A real `.glb` remains the upgrade path and swaps in behind that one module, provided it honors the UV contract. |
| AI-generated mesh (e.g. Meshy) rejected | Ships baked textures and a single auto-unwrapped atlas. Baked textures are already ruled out, and one atlas makes panel-aware texturing impossible. |
| Back panel is derived, and labeled "derived" in the UI | Single-image input means the back is unknown. An invented back that silently ships to a client is the failure mode that gets blamed on us. |
| Side panels auto-filled from extracted base color, with override swatch | Covers ~90% of real teamwear with zero extra uploads. |
| Input must be flat artwork, but a background is fine | Baked-in mockup shading gets lit a second time by the renderer — muddy, dark, obviously wrong, so flatness stays a requirement (warned via `looksBaked`). Backgrounds are not a requirement to push onto the user: the isolate step removes them. |
| Front artwork is warped to the garment silhouette, not fitted as a rectangle | A rectangular fit puts the artwork's neckline wherever the rectangle's top edge lands. That is what makes a mockup read as a sticker pasted on a mannequin. |
| Second placement mode, "place as graphic": aspect-preserving auto-fit plus a manual nudge handle | The silhouette warp assumes a whole front-facing jersey design; it would stretch a bare logo or crest across the entire panel. Wrap is the default. Within graphic mode, auto alone feels broken and manual alone feels like homework. |
| No Pantone | Pantone color data is licensed IP — Adobe pulled the books from CC in 2022. CMYK/RGB toggle instead. |
| CMYK/RGB toggle is a numeric readout only | A screen is physically RGB, and a true soft-proof needs an ICC profile and gamut mapping. A fake one is a misleading print proof. It switches how the extracted base color is displayed (hex/RGB vs approximate CMYK percentages) and does not touch the render. CMYK figures are labeled approximate. Not in the v1 exit criteria. |
| PNG export renders at a fixed 1600x1600 | The deliverable must not vary with the designer's window size. Temporarily resize the renderer, render synchronously, capture, restore. Preset angles: Front, Back, Left, Right, 3/4. The R3F canvas needs `gl={{ preserveDrawingBuffer: true }}` or `toDataURL()` returns a blank image. |
| Three-point studio lighting + contact shadows + procedural fabric normal, no HDRI | drei's `<Environment preset>` fetches HDRIs from a CDN at runtime, and the drei docs warn it "is not meant to be used in production environments and may fail as it relies on CDNs". That contradicts the client-side-with-no-server-dependency requirement and breaks offline. Upgrade path: drop an `.hdr` into `public/` and use `<Environment files>`. |

---

## Stack

All MIT, all client-side.

| Need | Library |
|---|---|
| App shell | Next.js (App Router) |
| Renderer | three.js |
| React bindings | @react-three/fiber |
| OrbitControls, contact shadows, GLTF loading *(upgrade path)* | @react-three/drei |
| PSD import *(deferred)* | ag-psd |

Mesh generation, segmentation, silhouette warp, texture compositing, base-color extraction,
and PNG export use plain geometry math, Canvas 2D, and `renderer.domElement.toDataURL()`.
No libraries needed.

No backend. No GPU. No database. Hosting is Vercel's free tier.

---

## Assets to source

Nothing. v1 ships with zero downloaded assets and zero licensing risk.

| Asset | v1 | Upgrade path |
|---|---|---|
| Basketball jersey mesh | Generated procedurally (`src/lib/jersey.ts`) | Licensed or commissioned `.glb` honoring the UV contract below |
| Studio lighting | Three-point lights + contact shadows | `.hdr` in `public/` via `<Environment files>` |
| Fabric normal | Generated procedurally | CC0 normal + roughness maps (ambientCG, Poly Haven) |

**Geometry:** one parametric superellipse-torso surface sliced into four indexed panels, with
a top-edge function that carves the neckline and armholes.

**Mesh requirements**, procedural or sourced: separate UV islands for front / back / left /
right, no baked textures, clean topology, under ~50k polys.

**Blender** (free) would only be needed to verify UV islands on a future `.glb`. Not for modeling.

---

## UV contract (locked)

The interface between the geometry and the texture pipeline. Load-bearing — both sides are
written against it, and any future `.glb` must honor it.

| Panel  | UV island            | Canvas region (px, 2048²)  |
|--------|----------------------|----------------------------|
| Front  | u 0.0-0.5, v 0.5-1.0 | x 0-1024,    y 0-1024      |
| Back   | u 0.5-1.0, v 0.5-1.0 | x 1024-2048, y 0-1024      |
| Side L | u 0.0-0.5, v 0.0-0.5 | x 0-1024,    y 1024-2048   |
| Side R | u 0.5-1.0, v 0.0-0.5 | x 1024-2048, y 1024-2048   |

Within each island, `v = 1` is the garment's top edge (neckline / armhole curve) and `v = 0`
is the hem; `u` runs across the panel width. Each panel fills its rect completely — the
silhouette lives in the geometry, not in empty UV space.

---

## Texture pipeline

Three stages, all Canvas 2D. See [PRD.md](./PRD.md) §6.4.

| Stage | Module | What it does |
|---|---|---|
| Isolate | `src/lib/segment.ts` | Alpha channel when the PNG has real transparency; otherwise flood-fill inward from the borders with a color tolerance, despeckle, keep the largest connected component. Produces a garment mask, bounding box, and coverage fraction. |
| Wrap | `src/lib/warp.ts` | Per-column silhouette (topY/bottomY for every column of the source), then fill the front UV island by inverse mapping: `srcX = minX + u*(maxX-minX)`, `srcY = lerp(topY(srcX), bottomY(srcX), 1-v)`, sampled bilinearly. |
| Composite | `src/lib/texture.ts` | Sides from extracted base color or override swatch; derived back from base color plus mirrored left/right edge-strip carry-over from the warped front. |

Normalizing every column between the garment's own top and bottom contour is what makes the
design's neckline land on the mesh's neckline, its hem on the hem, its side seams on the seams.
That is the difference between fabric and a sticker.

**Guard:** empty mask, or coverage under ~10% of the frame, means segmentation failed. Warn
rather than silently wrapping garbage.

**Known ceiling:** flood-fill is not real matting and fails on busy or gradient backdrops.
Upgrade path is an ML matting model.

---

## Assumptions to validate on day one

1. **A flat PNG mapped onto a mesh looks client-ready.** This is the entire risk of the
   project and it has nothing to do with the stack. Test it in three.js — not Blender,
   because a Blender render will look better than the product ever will and would be a
   misleading test.
2. **Photoshop exports are flat artwork, not shaded mockup renders.** If shading is baked
   in, the texture pipeline needs a de-shading step and that changes the plan. Still open —
   v1 detects and warns via a `looksBaked` heuristic (distinct-color-bucket count) rather than
   correcting.
3. **A cheap derived back is acceptable.** v1 fills the back with the extracted base color
   and carries side stripes across. It is not a reconstruction of the front.

---

## Build order

1. three.js viewer + orbit controls + placeholder mesh
2. Procedural jersey mesh, verify UV islands against the contract
3. Upload → isolate → warp onto front UV island → apply as texture
4. **Look at it.** Go/no-go on assumption 1.
5. Graphic mode: auto-fit + manual nudge
6. Base-color extraction → side panels + derived back
7. Three-point lighting + procedural fabric material pass
8. Angle presets + fixed 1600x1600 PNG export

Steps 1–4 are the real milestone. Everything after is straightforward.

---

## Later

Poster generator (layered composition with live text — never generated raster, since
generated text can't be edited), t-shirt and hoodie meshes, panel-separated vector export
with seam allowance for sublimation printers, roster name/number personalization,
video turntable export via WebCodecs.
