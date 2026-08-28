# Mock.er — Product Requirements Document (v1)

Technical depth and rationale tables live in [SPEC.md](./SPEC.md). Agents should read this PRD first.

## 1. Summary

Mock.er is a client-side 3D jersey mockup generator for teamwear designers. A user uploads flat jersey artwork (PNG with transparency), the design maps onto a fixed UV-unwrapped basketball jersey mesh, they orbit the garment in the browser, and export any angle as PNG. The wedge is that general mockup tools treat a jersey as a flat canvas. Mock.er understands front, back, side panels, and seams as separate garment surfaces. v1 runs entirely in the browser with no backend, database, or per-render server cost.

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

1. **Upload** — I upload one PNG (transparent, flat artwork). The front panel receives the design.
2. **Orbit** — I drag to rotate the jersey freely around an invisible mannequin (garment only, no body).
3. **Export** — I export the current view or a preset angle as PNG.
4. **Derived back** — When only one image is uploaded, the back is filled from extracted base color (and side stripe carry-over). The UI clearly labels the back as derived.
5. **Side panels** — Side panels auto-fill from extracted base color, with an optional override swatch.
6. **Placement** — Artwork auto-fits the front UV island, with a manual nudge handle for fine adjustment.
7. **Color mode** — I can toggle CMYK/RGB display. No Pantone (licensed IP).

## 6. Functional requirements

### 6.1 Input

- Accept PNG with transparency.
- Reject or warn on baked mockup shading (artwork must be flat, not pre-lit).
- Single front image in v1; back is derived, not uploaded.

### 6.2 Garment model (domain)

Encode panels explicitly, not as scattered conditionals:

| Panel | v1 behavior |
|---|---|
| Front | User artwork mapped to front UV island |
| Back | Derived from base color + stripe carry-over; labeled in UI |
| Side | Auto-filled from extracted base color; override swatch |

Mesh requirements: separate UV islands for front / back / side, no baked textures, clean topology, under ~50k polys. First garment: UV-unwrapped basketball jersey (`.glb`).

### 6.3 Viewer

- Real 3D mesh with UV mapping (not AI image generation).
- Orbit controls in browser (three.js via @react-three/fiber).
- Invisible mannequin: garment alone, no body rig.

### 6.4 Texture pipeline

- Composite uploaded art onto front UV island (Canvas 2D).
- Auto-fit plus manual nudge.
- Base-color extraction for side panels and derived back.
- Apply composited texture to mesh material.

### 6.5 Lighting and materials

- Studio HDRI environment (Poly Haven, CC0).
- Fabric normal + roughness maps (ambientCG / Poly Haven, CC0).

### 6.6 Export

- PNG export of current view or preset angles via `renderer.domElement.toDataURL()`.
- No server render path.

## 7. UX requirements

- Label derived back prominently. Never ship an invented back without disclosure.
- No Pantone picker. CMYK/RGB toggle only.
- Auto-fit alone is insufficient; manual nudge must exist.
- Minimal chrome in v1. The viewer is the product.

## 8. Technical constraints

| Need | Library | License |
|---|---|---|
| App shell | Next.js (App Router) | MIT |
| Renderer | three.js | MIT |
| React bindings | @react-three/fiber | MIT |
| Controls, HDRI, GLTF | @react-three/drei | MIT |
| PSD import (deferred) | ag-psd | MIT |

Texture compositing, base-color extraction, and PNG export use Canvas 2D and `toDataURL()`. No extra libraries.

- **No backend, GPU farm, or database.**
- **Hosting:** Vercel free tier.
- **R3F:** Client-only; dynamic import with `ssr: false` at the page boundary.

## 9. Locked decisions

See [SPEC.md](./SPEC.md) for full rationale table. Summary:

- Real UV-mapped mesh, not generative AI.
- Browser three.js only; zero per-render cost.
- Mesh bought or commissioned once, not modeled in-house.
- Flat transparent artwork only; no baked shading.
- Derived back is explicit in product and UI.

## 10. Assets to source

| Asset | Source | License |
|---|---|---|
| Basketball jersey `.glb` | Sketchfab, Poly Pizza, CGTrader free | CC0/CC-BY — verify |
| Studio HDRI | Poly Haven | CC0 |
| Fabric normal + roughness | ambientCG, Poly Haven | CC0 |

Blender (free) only to verify UV islands and export `.glb`, not for modeling.

## 11. Assumptions to validate (day one)

1. Flat PNG on mesh looks client-ready **in three.js** (not Blender — Blender would mislead).
2. Typical Photoshop exports are flat artwork, not shaded mockups.
3. Cheap derived back (base color + stripe carry-over) is acceptable for v1.

## 12. Build order

Milestone = steps 1–4. Steps 5–8 follow once the render is validated.

1. three.js viewer + orbit controls + placeholder mesh
2. Load real `.glb`, verify UV islands
3. Upload → composite onto front UV island → apply as texture
4. **Look at it.** Go/no-go on assumption 1.
5. Auto-fit + manual nudge
6. Base-color extraction → side panels + derived back
7. HDRI lighting + fabric material pass
8. Angle presets + PNG export

## 13. Success criteria (v1 exit)

- User can upload a flat PNG and see it on the front panel of a 3D jersey.
- User can orbit the jersey smoothly in the browser.
- User can export PNG from current view or presets.
- Derived back is labeled in the UI; side panels fill from base color with override.
- Entire flow runs client-side with no account or server dependency.
- Flat PNG on mesh passes the "client-ready" eye test (assumption 1).

## 14. Out of scope (later)

Poster generator with live editable text, t-shirt/hoodie meshes, panel-separated vector export with seam allowance, roster personalization, video turntable via WebCodecs. See [SPEC.md](./SPEC.md).

## 15. Open questions

- [ ] Which `.glb` mesh to license or commission first?
- [ ] Default PNG export resolution and preset angle set?
- [ ] Exact CMYK/RGB toggle behavior (preview only vs export metadata)?
- [ ] De-shading pipeline if users upload baked mockup renders?
