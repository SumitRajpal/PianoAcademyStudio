---
description: Memory rules for generating art, game scenes, and physics-based rendering in the style of The Incredibles 2 (Pixar 3D CGI stylized cartoon) using pure 2D graphics, analytical ray tracing, and PBR shaders in React Native Skia v3.
globs: ["src/screens/game/**/*", "docs/art-style/**/*"]
---

# Art, Physics & Master Lighting Rule: The Incredibles 2 in 2D Skia v3

When designing, updating, or generating game screens, assets, characters, or VFX in `src/screens/game`:

## 1. Engine & Graphics Pipeline: 100% Pure 2D
* **Skia is strictly 2D based.** We prepare exclusively for **2D graphics**.
* **Forbidden**:
  * ❌ NO 3D polygon meshes, OBJ/GLTF loaders, 3D vertex buffers, or 3D camera scene graphs.
  * ❌ NO flat papercraft cutout style (`paperKit.ts`, card cutouts, deckle edges, single drop shadows).
  * ❌ NO crushed pure black shadows (`#000000`). All shadows must be tinted with ambient room/sky tones.

## 2. Mathematical & Physics Foundations
All volumetric depth and lighting must be formulated through **mathematical and physical calculations**:
1. **Analytical Ray Tracing**: Solve closed-form quadratic equations ($at^2 + bt + c = 0$) per pixel for ray-sphere and ray-capsule intersections.
2. **Microfacet Cook-Torrance BRDF**: Evaluate Trowbridge-Reitz GGX normal distribution ($D$), Fresnel-Schlick reflectance ($F$), and Smith geometric shadowing-masking ($G$).
3. **Subsurface Scattering (SSS) Physics**: Calculate forward-scattered light through thin flesh (ears, cheeks, cartilage) via Beer-Lambert exponential decay ($T = e^{-\sigma_t d}$).
4. **SDF Soft Shadow Raymarching**: Use analytical Signed Distance Fields with exact penumbra formulation ($\min_t \frac{k \cdot d(t)}{t}$).
5. **Volumetric Radiative Transfer**: Integrate in-scattering and optical depth along spotlight cones and atmospheric smog.

## 3. SkSL Runtime Shaders (`Skia.RuntimeEffect.Make`)
* Execute analytical ray tracing, Cook-Torrance PBR, and SSS directly on the GPU via SkSL runtime shaders running on Dawn/Graphite (Metal on iOS, Vulkan on Android).
* Pre-bake complex lighting passes into offscreen GPU surfaces (`Skia.Surface.MakeRaster`) and composite per-frame with `canvas.drawImageRectOptions` for rock-solid 60 FPS on the UI thread.
* For complete SkSL shader code, math proofs, and TypeScript recipes, refer to `docs/art-style/INCREDIBLES_PIXAR_SKIA3_SPEC.md`.
