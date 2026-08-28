# Jersey Mockup Generator — v1 Spec

Upload a flat jersey design, get a rotatable 3D jersey you can export angles from.

Built for teamwear designers. The wedge is that general mockup tools treat a jersey
as a flat canvas — they don't understand that a garment has a back, side panels, or
seams. This does.

---

## v1 flow

1. User uploads one jersey design (PNG, transparent background, flat artwork)
2. Artwork auto-fits onto the front panel of a fixed 3D jersey mesh
3. User orbits the jersey freely in the browser
4. User exports any angle as PNG — preset angles or the current view

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
| Mesh is bought or commissioned, not modeled | One asset, one time. Not a skill to acquire. |
| Back panel is derived, and labeled "derived" in the UI | Single-image input means the back is unknown. An invented back that silently ships to a client is the failure mode that gets blamed on us. |
| Side panels auto-filled from extracted base color, with override swatch | Covers ~90% of real teamwear with zero extra uploads. |
| Input must be flat artwork with transparency | Baked-in mockup shading gets lit a second time by the renderer. Muddy, dark, obviously wrong. |
| Auto-fit onto the UV island, plus a manual nudge handle | Auto alone feels broken. Manual alone feels like homework. |
| No Pantone | Pantone color data is licensed IP — Adobe pulled the books from CC in 2022. CMYK/RGB toggle instead. |

---

## Stack

All MIT, all client-side.

| Need | Library |
|---|---|
| App shell | Next.js (App Router) |
| Renderer | three.js |
| React bindings | @react-three/fiber |
| OrbitControls, HDRI environment, GLTF loading | @react-three/drei |
| PSD import *(deferred)* | ag-psd |

Texture compositing, base-color extraction, and PNG export use plain Canvas 2D and
`renderer.domElement.toDataURL()`. No libraries needed.

No backend. No GPU. No database. Hosting is Vercel's free tier.

---

## Assets to source

| Asset | Source | License |
|---|---|---|
| UV-unwrapped basketball jersey (`.glb`) | Sketchfab (Downloadable + CC0/CC-BY), Poly Pizza, CGTrader free | varies — verify |
| Studio HDRI lighting | Poly Haven | CC0 |
| Fabric normal + roughness maps | ambientCG, Poly Haven | CC0 |

**Mesh requirements:** separate UV islands for front / back / side panels, no baked
textures, clean topology, under ~50k polys. If nothing free is clean, commission one
(~$150) and specify the UV layout — this single asset determines everything downstream.

**Blender** (free) is needed only to verify UV islands and export `.glb`. Not for modeling.

---

## Assumptions to validate on day one

1. **A flat PNG mapped onto a mesh looks client-ready.** This is the entire risk of the
   project and it has nothing to do with the stack. Test it in three.js — not Blender,
   because a Blender render will look better than the product ever will and would be a
   misleading test.
2. **Photoshop exports are flat artwork, not shaded mockup renders.** If shading is baked
   in, the texture pipeline needs a de-shading step and that changes the plan.
3. **A cheap derived back is acceptable.** v1 fills the back with the extracted base color
   and carries side stripes across. It is not a reconstruction of the front.

---

## Build order

1. three.js viewer + orbit controls + placeholder mesh
2. Load real `.glb`, verify UV islands
3. Upload → composite onto front UV island → apply as texture
4. **Look at it.** Go/no-go on assumption 1.
5. Auto-fit + manual nudge
6. Base-color extraction → side panels + derived back
7. HDRI lighting + fabric material pass
8. Angle presets + PNG export

Steps 1–4 are the real milestone. Everything after is straightforward.

---

## Later

Poster generator (layered composition with live text — never generated raster, since
generated text can't be edited), t-shirt and hoodie meshes, panel-separated vector export
with seam allowance for sublimation printers, roster name/number personalization,
video turntable export via WebCodecs.
