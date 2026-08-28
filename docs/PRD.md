# Mock.er — Product Requirements Document (v1)

Technical depth and rationale tables live in [SPEC.md](./SPEC.md). Agents should read this PRD first.

## 1. Summary

Mock.er is a client-side 3D jersey mockup generator for teamwear designers. A user uploads flat jersey artwork (with or without a background), the app isolates the garment and wraps it onto a procedurally generated basketball jersey mesh, they orbit the garment in the browser, and export any angle as PNG. The wedge is that general mockup tools treat a jersey as a flat canvas. Mock.er understands front, back, side panels, and seams as separate garment surfaces. v1 runs entirely in the browser with no backend, database, or per-render server cost.

## 2. Goals

- **Primary:** Prove that a flat PNG on a real 3D mesh can look client-ready in three.js (the core product risk).
- **Secondary:** Ship the full v1 loop (upload → orbit → export) as a validation slice for teamwear workflows.
- **Non-goal:** Replace Illustrator, generate marketing posters, or support every garment type in v1.

## 3. Non-goals (v1)

| Cut | Why |
|---|---|
| Vector / trace output (`.ai`, `.svg`) | Separate hard problem, different tool |
| Marketing poster generator with editable text | Second product surface; worthless until the render is good |
| T-shirt and hoodie meshes | One garment first |
| Accounts, auth, billing, storage | v1 is a validation slice |
| PSD import | Only if source files turn out to be layer-structured |
| Video export | Near-free later via the viewer; not now |
| Generative AI in the render path | Warps logos and numbers; fatal for client proofs |

## 4. Audience

| Audience | What they need fast |
|---|---|
| Teamwear designer | Upload flat art, see it on a real 3D jersey, export angles for client review |
| Design lead / client | Trust that the mockup reflects garment structure (back exists, sides exist), not a flat paste |
| Future you (maintainer) | Locked decisions and UV panel model so texture work does not scatter across conditionals |

Designers need confidence that an unknown back is **labeled derived**, not silently invented.

## 5. User stories

1. **Upload** — I upload one image of flat jersey artwork, with or without a background. The app isolates the garment and the front panel receives the design.
2. **Orbit** — I drag to rotate the jersey freely around an invisible mannequin (garment only, no body).
3. **Export** — I export the current view or a preset angle as PNG.
4. **Derived back** — When only one image is uploaded, the back is filled from extracted base color (and side stripe carry-over). The UI clearly labels the back as derived.
5. **Side panels** — Side panels auto-fill from extracted base color, with an optional override swatch.
6. **Placement** — Default is **wrap**: the isolated garment is warped to the mesh silhouette so its neckline, hem, and side seams land on the mesh's. For a bare logo or crest I switch to **place as graphic**, which does an aspect-preserving auto-fit on the front panel plus a manual nudge handle.
7. **Color mode** — I can toggle the extracted base color's numeric readout between hex/RGB and approximate CMYK. Display only; it does not change the render. No Pantone (licensed IP).

## 6. Functional requirements

### 6.1 Input

- Accept PNG with transparency **and** uploads that still have a background — isolating the garment is the pipeline's job (§6.4), not the user's.
- Artwork must still be flat, not pre-lit. A `looksBaked` heuristic (distinct-color-bucket count) raises a dismissible warning; it does not block the upload.
- Single front image in v1; back is derived, not uploaded.

### 6.2 Garment model (domain)

Encode panels explicitly, not as scattered conditionals:

| Panel | v1 behavior |
|---|---|
| Front | User artwork warped onto the front UV island |
| Back | Derived from base color + mirrored edge-strip carry-over; labeled in UI |
| Side | Auto-filled from extracted base color; override swatch |

The mesh is **generated procedurally in code** (`src/lib/jersey.ts`): one parametric
superellipse-torso surface sliced into four indexed panels, with a top-edge function that
carves the neckline and armholes. No `.glb` is sourced for v1.

Mesh requirements either way: separate UV islands for front / back / left / right, no baked
textures, clean topology, under ~50k polys.

#### UV contract (locked)

This is the interface between the geometry and the texture pipeline (§6.4). It is
load-bearing — both sides are written against it, and any future `.glb` must honor it.

| Panel  | UV island            | Canvas region (px, 2048²)  |
|--------|----------------------|----------------------------|
| Front  | u 0.0-0.5, v 0.5-1.0 | x 0-1024,    y 0-1024      |
| Back   | u 0.5-1.0, v 0.5-1.0 | x 1024-2048, y 0-1024      |
| Side L | u 0.0-0.5, v 0.0-0.5 | x 0-1024,    y 1024-2048   |
| Side R | u 0.5-1.0, v 0.0-0.5 | x 1024-2048, y 1024-2048   |

Within each island, `v = 1` is the garment's top edge (neckline / armhole curve) and `v = 0`
is the hem; `u` runs across the panel width. Each panel fills its rect completely — the
silhouette lives in the geometry, not in empty UV space.

### 6.3 Viewer

- Real 3D mesh with UV mapping (not AI image generation).
- Orbit controls in browser (three.js via @react-three/fiber).
- Invisible mannequin: garment alone, no body rig.

### 6.4 Texture pipeline

Three stages, all Canvas 2D. The uploaded design is **warped to the garment silhouette**, not
fitted as a rectangle — a rectangular fit puts the artwork's neckline wherever the rectangle's
top edge lands, which is what makes a mockup read as a sticker on a mannequin.

1. **Isolate** (`src/lib/segment.ts`) — accept the upload with or without a background. Use the
   alpha channel when the PNG has real transparency; otherwise flood-fill inward from the
   borders with a color tolerance, despeckle, and keep the largest connected component.
   Produces a garment mask, bounding box, and coverage fraction.
2. **Wrap** (`src/lib/warp.ts`) — build a per-column silhouette (topY / bottomY for every column
   of the source), then fill the front UV island by inverse mapping: for each destination texel,
   `srcX = minX + u*(maxX-minX)` and `srcY = lerp(topY(srcX), bottomY(srcX), 1-v)`, sampled
   bilinearly. Every column is normalized between the garment's own top and bottom contour, so
   the design's neckline lands on the mesh's neckline, its hem on the hem, its side seams on the
   seams. This is what makes it wrap as fabric rather than sit flat.
3. **Composite** (`src/lib/texture.ts`) — sides from the extracted base color or the override
   swatch; derived back from base color plus mirrored left/right edge-strip carry-over from the
   warped front. Apply the composited 2048² canvas to the mesh material.

**Guard:** if the mask is empty or covers under ~10% of the frame, segmentation has failed. Warn
rather than silently wrapping garbage.

**Known ceiling:** flood-fill is not real matting and fails on busy or gradient backdrops.
Upgrade path is an ML matting model.

**"Place as graphic" mode:** the silhouette warp assumes the upload is a whole front-facing
jersey design. A bare logo or crest would be stretched across the entire panel by that warp, so
a second mode keeps aspect-preserving auto-fit plus manual nudge. Wrap is the default.

### 6.5 Lighting and materials

- Three-point studio lighting plus contact shadows. No HDRI in v1.
- Procedurally generated fabric normal map. No downloaded texture maps.
- Rationale: drei's `<Environment preset>` fetches HDRIs from a CDN at runtime, and the drei
  docs warn it "is not meant to be used in production environments and may fail as it relies on
  CDNs". That contradicts §13's client-side-with-no-server-dependency criterion and breaks
  offline.
- Upgrade path: drop an `.hdr` into `public/` and switch to `<Environment files>`.

### 6.6 Export

- PNG export of current view or preset angles via `renderer.domElement.toDataURL()`.
- Fixed **1600x1600** output: temporarily resize the renderer, render synchronously, capture,
  restore. The deliverable must not vary with the designer's window size.
- Preset angles: Front, Back, Left, Right, 3/4.
- Implementation constraint: the R3F canvas needs `gl={{ preserveDrawingBuffer: true }}` or
  `toDataURL()` returns a blank image.
- No server render path.

## 7. UX requirements

- Label derived back prominently. Never ship an invented back without disclosure.
- No Pantone picker. CMYK/RGB toggle only, and it is a numeric readout — label the CMYK figures
  approximate.
- Wrap is the default placement mode. Manual nudge still exists, but it belongs to graphic mode:
  auto-fit alone feels broken there, manual alone feels like homework.
- Warn, don't block, on failed segmentation and on `looksBaked` uploads.
- Minimal chrome in v1. The viewer is the product.

## 8. Technical constraints

| Need | Library | License |
|---|---|---|
| App shell | Next.js (App Router) | MIT |
| Renderer | three.js | MIT |
| React bindings | @react-three/fiber | MIT |
| Controls, contact shadows, GLTF (upgrade path) | @react-three/drei | MIT |
| PSD import (deferred) | ag-psd | MIT |

Mesh generation, segmentation, silhouette warp, texture compositing, base-color extraction, and PNG export use plain geometry math, Canvas 2D, and `toDataURL()`. No extra libraries.

- **No backend, GPU farm, or database.**
- **Hosting:** Vercel free tier.
- **R3F:** Client-only; dynamic import with `ssr: false` at the page boundary.

## 9. Locked decisions

See [SPEC.md](./SPEC.md) for full rationale table. Summary:

- Real UV-mapped mesh, not generative AI.
- Browser three.js only; zero per-render cost.
- Mesh generated procedurally in code, not sourced. A `.glb` is the upgrade path, behind one module.
- Flat artwork only (no baked shading), but a background is fine — the app isolates the garment.
- Front artwork is warped to the garment silhouette, not fitted as a rectangle.
- Derived back is explicit in product and UI.
- No downloaded assets: lighting is three-point + contact shadows, fabric normal is procedural.

## 10. Assets to source

**Nothing.** v1 ships with zero downloaded assets and zero licensing risk.

| Asset | v1 | Upgrade path |
|---|---|---|
| Basketball jersey mesh | Generated procedurally (`src/lib/jersey.ts`) | Licensed or commissioned `.glb` that honors the §6.2 UV contract |
| Studio lighting | Three-point lights + contact shadows | `.hdr` in `public/` via `<Environment files>` |
| Fabric normal | Generated procedurally | CC0 normal + roughness maps (ambientCG, Poly Haven) |

Authoring the geometry means authoring the UVs, so the front / back / side islands are exact by
construction instead of reverse-engineered from a third party's unwrap — and the entire texture
pipeline depends on those islands existing. It also unblocks the build immediately.

An AI-generated mesh (e.g. Meshy) was considered and **rejected**: those ship baked textures and
a single auto-unwrapped atlas, which §6.2 forbids and which makes panel-aware texturing
impossible.

Blender (free) would only be needed to verify UV islands on a future `.glb`, not for modeling.

## 11. Assumptions to validate (day one)

1. Flat PNG on mesh looks client-ready **in three.js** (not Blender — Blender would mislead).
2. Typical Photoshop exports are flat artwork, not shaded mockups.
3. Cheap derived back (base color + stripe carry-over) is acceptable for v1.

## 12. Build order

Milestone = steps 1–4. Steps 5–8 follow once the render is validated.

1. three.js viewer + orbit controls + placeholder mesh
2. Procedural jersey mesh, verify UV islands against the §6.2 contract
3. Upload → isolate → warp onto front UV island → apply as texture
4. **Look at it.** Go/no-go on assumption 1.
5. Graphic mode: auto-fit + manual nudge
6. Base-color extraction → side panels + derived back
7. Three-point lighting + procedural fabric material pass
8. Angle presets + fixed-resolution PNG export

## 13. Success criteria (v1 exit)

- User can upload flat artwork (background or not) and see it wrapped onto the front panel of a 3D jersey.
- User can orbit the jersey smoothly in the browser.
- User can export PNG from current view or presets.
- Derived back is labeled in the UI; side panels fill from base color with override.
- Entire flow runs client-side with no account or server dependency.
- Flat PNG on mesh passes the "client-ready" eye test (assumption 1).

## 14. Out of scope (later)

Poster generator with live editable text, t-shirt/hoodie meshes, panel-separated vector export with seam allowance, roster personalization, video turntable via WebCodecs. See [SPEC.md](./SPEC.md).

## 15. Open questions

- [ ] De-shading pipeline if users upload baked mockup renders? v1 only detects and warns via
      `looksBaked` (§6.1); it does not correct.

Mesh sourcing (§10), export resolution and preset angles (§6.6), and CMYK/RGB toggle behavior
(§5 story 7, §7) are resolved and recorded in those sections.
