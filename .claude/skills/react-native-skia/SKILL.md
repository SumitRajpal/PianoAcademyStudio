---
name: react-native-skia
description: React Native Skia v3 (package `react-native-skia`, 3.5.0 installed) for Piano Academy Studio, with the complete official docs. Use whenever you write, review or debug Skia code here - Canvas, shapes, paths, text, images, SVG, Skottie (Lottie), shaders, image/mask/color filters, Atlas, Pictures, Graphite View, WebGPU, headless rendering, or animating Skia with Reanimated and gestures. Also use for anything piano-related on screen, such as PianoMaster, key highlights or falling notes.
---

# React Native Skia v3

Everything drawn for the piano in this app uses React Native Skia. This file holds the v3 facts that are easy to get wrong and the rules of this project. `references/` holds every page of the official docs for the installed version, unchanged except that links point to the other reference files and images point to GitHub.

## Version facts

- The package is `react-native-skia`. `@shopify/react-native-skia` stops at 2.14; never install it alongside, because both ship the same native module.
- Installed: 3.5.0, the version of these docs. npm already has 3.6.0, which removes the Snapshot Views API (`makeImageFromView`), so don't use it. Before upgrading, regenerate the references (see below).
- v3 renders with Skia Graphite on Dawn: Metal on iOS, Vulkan on Android. It needs React Native 0.79+ with the New Architecture, React 19, iOS 15.1+, Android API 26+ (this project's `minSdkVersion` is 26), and Reanimated 4+ with react-native-worklets 0.7+. It doesn't run in Expo Go.
- `<Canvas>` props: `style`, `ref`, `onLayout`, `opaque`, `android`, `highBitDepth`, plus the usual View props. Removed in v3: `onSize` (use `onLayout`), `debug`, `colorSpace`, `androidWarmup`.
- `useCanvasSize()` returns `{ size, onLayout }`: pass `onLayout` to the Canvas. `useCanvasRef()` gives the ref, and `ref.current.size` reads the layout synchronously.
- Skia no longer plays video: `useVideo()` and `Skia.Video()` are gone, and video and camera frames come from react-native-webgpu (`references/webgpu.md`). The live docs site still shows an old "Video" page; it doesn't apply to v3.
- `makeImageSnapshotAsync()` is gone. `makeImageSnapshot()` returns a GPU image; to encode it or read its pixels without blocking, read it back first with `makeRasterImage()`.
- Renamed in v3: `Skia.Surface.Make` → `Skia.Surface.MakeRaster`, `Skia.Image.MakeImage` → `Skia.Image.MakeRasterImage`, `image.makeNonTextureImage()` → `image.makeRasterImageSync()`.
- `Atlas` is slower than in v2, because Graphite draws an atlas one sprite at a time. See the performance notes in `references/shapes/atlas.md` before using it for many objects.
- Colours: Reanimated's `interpolateColor` doesn't work with Skia colours; use Skia's `interpolateColors`.
- Reanimated 4.7 ignores a `useDerivedValue` dependency list on native and warns about it, so leave it out: dependencies come from what the worklet uses.

## How a Canvas produces frames

- **Retained mode**, the default: each React commit records the drawing once. When a Reanimated value used by the drawing changes, the UI thread writes it into that recording, and a native thread pool draws the frame. An animation frame costs no React render and no work on the JS thread.
  - Pass shared and derived values straight to props; `createAnimatedComponent` and `useAnimatedProps` aren't needed.
  - `select(sharedValue, key)` binds several props to one shared value that holds an object, with a single subscription.
- **Immediate mode**: the Picture API. Record with `Skia.PictureRecorder()` inside `useDerivedValue` and draw with `<Picture picture={...} />`. Use it when the number of drawing commands changes from frame to frame, such as particles or a changing set of falling notes.
- **Graphite View** (`SkiaGraphiteView`): produce the frames yourself, from the JS thread, the Reanimated UI runtime or a dedicated worklet runtime.

## Rules for this project

- **Piano visuals use Skia.** Add Reanimated only when the drawing moves. Animation that doesn't involve the piano, such as a mascot, celebrations or onboarding, uses Rive instead.
- **`PianoMaster` is the source of truth for the piano on screen.** It lives in `src/motion/scenes/PianoMaster`, draws keyboards of any range, and owns the key state.
  - Notes and key geometry live in `src/shared/piano`.
  - Other piano visuals (falling notes, a sheet-music cursor, particles over keys) take key positions from `layoutKeyboard()` there instead of computing their own.
- **Code in `src/motion` runs every frame on the UI thread.** It never calls `runOnJS` or `scheduleOnRN`, and it takes durations and easing from `src/motion/tokens` (architecture rules `motion-no-js-hop` and `motion-tokens`).
- **Testing:** Jest runs with Skia's test environment and mocks (`jest.config.js`).
  - The mock renders `Canvas` as a plain View, and `useCanvasSize()` reports 0×0.
  - So test drawing logic as plain functions, and check what is drawn on a device or the simulator.

## Using the references

- **Before using an API**, read its reference page; the code samples are the official ones.
- **To find a symbol** across all pages: `grep -rn "useRSXformBuffer" .claude/skills/react-native-skia/references`
- **After upgrading `react-native-skia`**, regenerate the references for the new version. The script downloads the docs at that release tag and rewrites the index below:
  `node .claude/skills/react-native-skia/scripts/sync-docs.mjs --tag v<version>`
- **Licence:** the docs are © William Candillon and Shopify Inc., under the MIT licence (`LICENSE.md`).

## Docs index

<!-- docs-index:start -->

Generated by `scripts/sync-docs.mjs` from the react-native-skia **v3.5.0** docs (commit `41750b3d4f`): 54 pages, in the order of the docs sidebar. Sections are the `##` headings of each page.

### Getting started

| Page | Sections |
|:--|:--|
| [Installation](references/getting-started/installation.md) | Requirements · iOS · Android · Expo · Web · Debugging · Testing with Jest · Playground |
| [Hello World](references/getting-started/hello-world.md) | - |
| [Migrating to v3](references/getting-started/migration.md) | 1. Rename the package · 2. Check the platform requirements · 3. Update the Canvas props · 4. Replace the removed APIs · What is new · Troubleshooting |
| [Web Support](references/getting-started/web.md) | Expo · Remotion · Loading Skia · Using a CDN · WebGL Contexts · Unsupported Features · Manual webpack Installation |
| [Headless](references/getting-started/headless.md) | Hello World · GPU Acceleration |

### WebGPU

| Page | Sections |
|:--|:--|
| [WebGPU](references/webgpu.md) | Installation · Compatibility · Sharing the device · From WebGPU to Skia · From Skia to WebGPU · Native buffers · Three.js · Lifetime rules · Examples |

### Canvas

| Page | Sections |
|:--|:--|
| [Canvas](references/canvas/canvas.md) | Canvas size · How frames are produced · Android rendering options · High bit depth · Color space · Getting a Canvas Snapshot · Accessibility |
| [Rendering Modes](references/canvas/rendering-modes.md) | Retained Mode (Default) · Immediate Mode · Choosing the Right Mode |
| [Contexts](references/canvas/contexts.md) | Using `its-fine` |
| [Graphite View](references/canvas/graphite.md) | Recording a frame · Threading model · Snapshots · Web |

### Painting

| Page | Sections |
|:--|:--|
| [Painting](references/paint/overview.md) | Fills and Strokes · Inheritance · Manual Paint Assignment |
| [Painting Properties](references/paint/properties.md) | color · opacity · blendMode · style · strokeWidth · strokeJoin · strokeCap · strokeMiter · antiAlias · dither |

### Group

| Page | Sections |
|:--|:--|
| [Group](references/group.md) | Paint Properties · Transformations · Clipping Operations · Layer Effects · Drawing Order (zIndex) · Fitbox |

### Pictures

| Page | Sections |
|:--|:--|
| [Pictures](references/pictures.md) | Hello World · Applying Effects · Serialization · Instance Methods |

### Shapes

| Page | Sections |
|:--|:--|
| [Path](references/shapes/path.md) | Fill Type |
| [Path API Migration Guide](references/shapes/path-migration.md) | Why the Change? · Basic Migration · Static Factory Methods · Static Path Operations · Transform and Offset · Using PathBuilder · Combining Paths · Animations with usePathValue · Dynamic Path Building in Worklets · Quick Reference |
| [Polygons](references/shapes/polygons.md) | Rect · RoundedRect · DiffRect · Line · Points |
| [Ellipses](references/shapes/ellipses.md) | Circle · Oval |
| [Atlas](references/shapes/atlas.md) | RSXform · Hello World · Animations · Performance |
| [Vertices](references/shapes/vertices.md) | Using texture mapping · Using indices · Large meshes |
| [Patch](references/shapes/patch.md) | Example |

### Images

| Page | Sections |
|:--|:--|
| [Images](references/image.md) | Loading Images · GPU and CPU images · Image Component · Instance Methods |
| [Animated Images](references/animated-images.md) | Using Reanimated · Manual API |
| [SVG Images](references/image-svg.md) | Scaling the SVG · Applying Effects · SVG Support |
| [Snapshot Views](references/snapshot-views.md) | Creating Snapshots of Views |

### Skottie

| Page | Sections |
|:--|:--|
| [Skottie](references/skottie.md) | Rendering Animations · Creating a Skottie Animation · Applying Effects · Animation Properties · Dynamic Animation Properties · Slot Management · Property Access and Modification |

### Text

| Page | Sections |
|:--|:--|
| [Paragraph](references/text/paragraph.md) | Hello World · Using Paints · Paragraph Bounding Box · Fonts · Styling Paragraphs · Text Style Properties · Line Height |
| [Text](references/text/text.md) | Fonts · System Fonts · Low-level API |
| [Glyphs](references/text/glyphs.md) | Draw text vertically |
| [Text Path](references/text/path.md) | Example |
| [Text Blob](references/text/blob.md) | Example |

### Shaders

| Page | Sections |
|:--|:--|
| [Shading Language](references/shaders/language.md) | Shader |
| [Image Shaders](references/shaders/images.md) | Image |
| [Gradients](references/shaders/gradients.md) | Common Properties · Linear Gradient · Radial Gradient · Two Point Conical Gradient · Sweep Gradient |
| [Perlin Noise Shaders](references/shaders/perlin-noise.md) | Fractal Perlin Noise Shader · Turbulence Perlin Noise Shader |
| [Blending and Colors](references/shaders/colors.md) | Blend Shader · Color Shader |

### Image Filters

| Page | Sections |
|:--|:--|
| [Image Filters](references/image-filters/overview.md) | Composing Filters |
| [Shadows](references/image-filters/shadows.md) | Drop Shadow · Inner Shadow |
| [Blur](references/image-filters/blur.md) | Simple Blur · With mode="clamp" |
| [Displacement Map](references/image-filters/displacement-map.md) | Example |
| [Offset](references/image-filters/offset.md) | Example |
| [Morphology](references/image-filters/morphology.md) | Example |
| [Runtime Shader](references/image-filters/runtime-shader.md) | Example · Pixel Density |

### Backdrop Filters

| Page | Sections |
|:--|:--|
| [Backdrop Filters](references/backdrop-filters.md) | Backdrop Filter · Backdrop Blur · Example |

### Mask Filter

| Page | Sections |
|:--|:--|
| [Mask Filters](references/mask-filters.md) | BlurMask |

### Color Filter

| Page | Sections |
|:--|:--|
| [Color Filters](references/color-filters.md) | Color Matrix · BlendColor · Lerp · LinearToSRGBGamma · SRGBToLinearGamma |

### Mask

| Page | Sections |
|:--|:--|
| [Mask](references/mask.md) | Alpha Mask · Luminance Mask |

### Path Effects

| Page | Sections |
|:--|:--|
| [Path Effects](references/path-effects.md) | Discrete Path Effect · Dash Path Effect · Corner Path Effect · Path 1D Path Effect · Path 2D Path Effect · Line 2D Path Effect |

### Animations

| Page | Sections |
|:--|:--|
| [Animations](references/animations/reanimated3.md) | Grouped values · Colors |
| [Gestures](references/animations/gestures.md) | Element Tracking |
| [Hooks](references/animations/hooks.md) | usePathInterpolation · usePathValue · useClock · useRectBuffer · useRSXformBuffer |
| [Textures](references/animations/textures.md) | `useTexture` · `useImageAsTexture` · `usePictureAsTexture` · Under the hood · Surfaces drawn every frame |

### Tutorials

| Page | Sections |
|:--|:--|
| [Tutorials](references/tutorials.md) | 📏 SDFs · ✨ Animations · 👋 Gestures · 🌁 Backdrop Filters · 📊 Charts · ✨ Image Filters · 🌈 Gradients · 🎨 Shaders · 📐 Paths · 📱 Native Views · 👁️ Computer Vision · 🎮 Games |

### Not in the docs sidebar

These pages are in the docs folder, but the sidebar of the docs site does not link to them.

| Page | Sections |
|:--|:--|
| [Box](references/shapes/box.md) | Example |

<!-- docs-index:end -->
