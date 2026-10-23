# The Incredibles 2 (Pixar) Art Style & Physics-Based Rendering Specification for React Native Skia v3
## Analytical Ray Tracing, PBR Shaders, Volumetric Physics & Master Lighting in Pure 2D

---

## 1. Core Principle: 100% Pure 2D Graphics Engine via Mathematical Physics

> **Fundamental Principle:**
> **React Native Skia is strictly a 2D graphics engine.**
> There are **no 3D polygon meshes, no OBJ/GLTF files, no vertex buffers, and no external 3D scenes**.
>
> To produce the rich, tactile "3D CGI cartoon" aesthetic of Pixar's *The Incredibles 2*, Skia executes **analytical ray tracing, Signed Distance Field (SDF) raymarching, and Physically Based Rendering (PBR) equations entirely through mathematics and physics calculations**:
> 1. **Analytical Ray Intersection Solvers**: Closed-form quadratic equations ($at^2 + bt + c = 0$) solving exact ray-sphere, ray-cylinder, and ray-capsule intersections per pixel.
> 2. **Physically Based Microfacet BRDF (Cook-Torrance)**: Exact evaluation of Trowbridge-Reitz GGX normal distribution ($D$), Fresnel-Schlick reflectance ($F$), and Smith geometric shadowing-masking ($G$).
> 3. **Subsurface Scattering (SSS) Physics**: Dipole diffusion and Beer-Lambert exponential transmittance ($e^{-\sigma_t d}$) calculating light bleeding through ears, cheeks, and organic cartilage.
> 4. **SDF Raymarching & Soft Shadows**: Analytical distance fields with mathematical penumbra calculations ($\min_t \frac{k \cdot d(t)}{t}$).
> 5. **Radiative Transfer & Volumetric In-Scattering**: Beer-Lambert optical depth integrals for stage spotlight haze, city smog, and laser plasma.
> 6. **Full 2D SkSL Runtime Effects**: Hardware-accelerated GPU execution on Dawn/Graphite (Metal on iOS, Vulkan on Android) compiling directly via `Skia.RuntimeEffect.Make`.

---

## 2. Categorization & Artistic Identity

| Attribute | Target Style (*The Incredibles 2*) | How We Implement in Pure 2D Skia v3 |
|---|---|---|
| **Medium** | 3D CGI Stylized Cartoon (Pixar) | 2D Vector paths + Analytical SkSL Raytracing & PBR Shaders |
| **Dimensionality** | Volumetric, tactile, rounded forms | Closed-form mathematical ray intersections (spheres, capsules, cylinders) |
| **Physics Model** | Full Physical Optics & Radiometry | Cook-Torrance GGX microfacet BRDF + Fresnel-Schlick + Smith masking |
| **Shadows & Occlusion** | Soft penumbra contact shadows + AO | Analytical SDF raymarching with variable penumbra $k \cdot d / t$ |
| **Translucency** | Subsurface Scattering (SSS) on flesh | Beer-Lambert exponential light transmission $I = I_0 e^{-\sigma_t d}$ |
| **Atmosphere & Media** | Volumetric spotlight cones, city haze | Numerical integration of the Radiative Transfer Equation in SkSL |
| **Performance** | Solid 60 FPS on mobile UI thread | Pre-baking analytical passes into GPU textures (`Surface.MakeRaster`) |

---

## 3. Mathematical & Physics Foundations

### 3.1. Analytical Ray-Surface Intersections (Closed-Form Geometry)

For any pixel on the 2D canvas $(x, y)$, we construct an orthographic or pinhole camera ray:
$$\mathbf{r}(t) = \mathbf{o} + t \cdot \mathbf{d}, \quad t > 0$$

#### A. Analytical Ray-Sphere Intersection
A sphere centered at $\mathbf{c}$ with radius $R$ satisfies:
$$\|\mathbf{p} - \mathbf{c}\|^2 = R^2 \implies \|\mathbf{o} + t\mathbf{d} - \mathbf{c}\|^2 = R^2$$

Expanding into quadratic form $at^2 + bt + c = 0$:
$$\begin{aligned}
\mathbf{v} &= \mathbf{o} - \mathbf{c} \\
a &= \mathbf{d} \cdot \mathbf{d} = 1.0 \quad (\text{normalized}) \\
b &= 2.0 (\mathbf{v} \cdot \mathbf{d}) \\
c &= \mathbf{v} \cdot \mathbf{v} - R^2 \\
\Delta &= b^2 - 4ac
\end{aligned}$$

* If $\Delta < 0$: Ray misses sphere (return background).
* If $\Delta \ge 0$: First hit point is $t = \frac{-b - \sqrt{\Delta}}{2a}$.
* Surface normal at hit point $\mathbf{p} = \mathbf{o} + t\mathbf{d}$:
  $$\mathbf{n} = \frac{\mathbf{p} - \mathbf{c}}{R}$$

#### B. Analytical Ray-Capsule Intersection (Limbs, Fingers, Helicopter Fuselage)
A capsule is defined by segment line points $\mathbf{a}$ to $\mathbf{b}$ and radius $R$.
The closest point on the line segment to ray point $\mathbf{p}$ is:
$$u = \text{clamp}\left(\frac{(\mathbf{p} - \mathbf{a}) \cdot (\mathbf{b} - \mathbf{a})}{\|\mathbf{b} - \mathbf{a}\|^2}, 0.0, 1.0\right)$$
$$\mathbf{c}(u) = \mathbf{a} + u(\mathbf{b} - \mathbf{a})$$
The surface normal is $\mathbf{n} = \frac{\mathbf{p} - \mathbf{c}(u)}{R}$.

---

### 3.2. Microfacet Cook-Torrance PBR Shading Model

The outgoing radiance $L_o(\mathbf{p}, \mathbf{v})$ is governed by the rendering equation:
$$L_o(\mathbf{p}, \mathbf{v}) = \int_{\Omega} \left( k_d \frac{c}{\pi} + k_s f_r(\mathbf{l}, \mathbf{v}) \right) L_i(\mathbf{p}, \mathbf{l}) (\mathbf{n} \cdot \mathbf{l}) d\mathbf{l}$$

#### The Specular BRDF:
$$f_r(\mathbf{l}, \mathbf{v}) = \frac{D(\mathbf{h}) \cdot F(\mathbf{v}, \mathbf{h}) \cdot G(\mathbf{l}, \mathbf{v})}{4 (\mathbf{n} \cdot \mathbf{l}) (\mathbf{n} \cdot \mathbf{v})}$$
where $\mathbf{h} = \frac{\mathbf{l} + \mathbf{v}}{\|\mathbf{l} + \mathbf{v}\|}$ is the half-vector.

#### 1. Normal Distribution Function $D(\mathbf{h})$ (Trowbridge-Reitz GGX):
Models microfacet alignment across surface roughness $\alpha = \text{roughness}^2$:
$$D(\mathbf{h}) = \frac{\alpha^2}{\pi \left( (\mathbf{n} \cdot \mathbf{h})^2 (\alpha^2 - 1) + 1 \right)^2}$$

#### 2. Fresnel Reflectance $F(\mathbf{v}, \mathbf{h})$ (Fresnel-Schlick):
Calculates the reflection coefficient at grazing angles:
$$F(\mathbf{v}, \mathbf{h}) = F_0 + (1.0 - F_0) (1.0 - \max(0.0, \mathbf{v} \cdot \mathbf{h}))^5$$
* Dielectrics (skin, fabric, plastic): $F_0 = 0.04$.
* Metals (helicopter gunmetal, brass cones): $F_0 = \text{Albedo}$ (e.g. $[0.56, 0.57, 0.58]$).

#### 3. Geometric Shadowing & Masking $G(\mathbf{l}, \mathbf{v})$ (Smith GGX):
Accounts for microfacets occluding one another:
$$G(\mathbf{l}, \mathbf{v}) = G_1(\mathbf{l}) \cdot G_1(\mathbf{v})$$
$$G_1(\mathbf{x}) = \frac{2 (\mathbf{n} \cdot \mathbf{x})}{(\mathbf{n} \cdot \mathbf{x}) + \sqrt{\alpha^2 + (1.0 - \alpha^2)(\mathbf{n} \cdot \mathbf{x})^2}}$$

---

### 3.3. Subsurface Scattering (SSS) Physics: Beer-Lambert Transmittance

Skin is translucent, not opaque plastic. When light strikes Jack-Jack's ear, cheek, or fingers from behind, light enters the tissue, scatters internally, and exits with a warm red-shifted spectrum.

Using the **exponential dipole approximation**:
$$T(\mathbf{p}, \mathbf{l}) = e^{-\sigma_t \cdot d(\mathbf{p})}$$
where:
* $d(\mathbf{p})$ is the local thickness through the volume along the inverted light ray $-\mathbf{l}$.
* $\sigma_t = \sigma_a + \sigma_s$ is the total extinction coefficient.
* Human skin has much lower absorption for red wavelengths than green/blue:
  $$\sigma_t^{\text{skin}} = [0.08, 0.32, 0.75] \implies \text{Transmitted light is intensely crimson/orange.}$$

In the shader, forward-scattered light is formulated as:
$$L_{\text{SSS}} = \text{Albedo}_{\text{SSS}} \cdot \left(\text{clamp}(\mathbf{v} \cdot (-\mathbf{l}), 0.0, 1.0)\right)^{\text{power}} \cdot e^{-\sigma_t \cdot d}$$

---

### 3.4. Signed Distance Field (SDF) Raymarching & Soft Shadows

#### Distance Estimators:
* Sphere: $d(\mathbf{p}, R) = \|\mathbf{p}\| - R$
* Capsule: $d(\mathbf{p}, \mathbf{a}, \mathbf{b}, R) = \|\mathbf{p} - \mathbf{a} - \mathbf{h}(\mathbf{b} - \mathbf{a})\| - R$, with $\mathbf{h} = \text{clamp}\left(\frac{(\mathbf{p} - \mathbf{a}) \cdot (\mathbf{b} - \mathbf{a})}{\|\mathbf{b} - \mathbf{a}\|^2}, 0, 1\right)$
* Plane: $d(\mathbf{p}, \mathbf{n}, h) = \mathbf{p} \cdot \mathbf{n} + h$

#### Exact Soft Shadow Formulation:
Given hit point $\mathbf{p}$ and light direction $\mathbf{l}$, raymarch toward the light and track the closest grazing distance to an obstacle:
$$k_{\text{shadow}}(\mathbf{p}, \mathbf{l}) = \min_{t \in [t_{\min}, t_{\max}]} \left( \text{clamp}\left(\frac{k \cdot d(\mathbf{p} + t \mathbf{l})}{t}, 0.0, 1.0\right) \right)$$
where $k$ controls shadow softness (higher $k$ = sharper shadow, lower $k$ = softer penumbra).

---

### 3.5. Radiative Transfer Equation (Volumetric Light & Fog)

In participating media (stage spotlight beams, city smog), light along a ray $\mathbf{r}(s)$ is attenuated by absorption and augmented by in-scattering:
$$\frac{dL(s)}{ds} = -\sigma_t L(s) + \sigma_s \int_{4\pi} p(\mathbf{\omega}, \mathbf{\omega}') L_i(s, \mathbf{\omega}') d\mathbf{\omega}'$$

Integrating via raymarching with $N$ steps:
$$L_{\text{vol}} = \sum_{i=1}^N \Delta s \cdot \sigma_s \cdot L_{\text{light}}(\mathbf{r}(s_i)) \cdot p(\theta) \cdot e^{-\sigma_t \cdot s_i}$$
where $p(\theta) = \frac{1 - g^2}{4\pi (1 + g^2 - 2g \cos \theta)^{1.5}}$ is the Henyey-Greenstein phase function.

---

## 4. Production SkSL Shaders for React Native Skia v3

### 4.1. The Master PBR Raytracing Shader (`PbrRaytracer.sksl`)
This SkSL shader performs closed-form analytical ray tracing, GGX microfacet PBR shading, Fresnel-Schlick, and Subsurface Scattering directly per-pixel inside Skia:

```glsl
// SkSL Physically-Based Analytical Raytracing Shader
uniform float2 uResolution;
uniform float3 uSpherePos;     // [x, y, z] center in world space
uniform float  uSphereRadius;  // R
uniform float3 uLightPos;      // [x, y, z] point light origin
uniform float3 uLightColor;    // Light radiance
uniform float3 uAlbedo;        // Base diffuse surface color
uniform float  uRoughness;     // [0.04 .. 1.0]
uniform float  uMetallic;      // 0.0 = dielectric, 1.0 = metal
uniform float3 uSSSColor;      // Warm crimson/amber SSS tint
uniform float  uSSSIntensity;  // Subsurface scattering multiplier

const float PI = 3.14159265359;

// GGX Normal Distribution
float distributionGGX(vec3 N, vec3 H, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float NdotH = max(dot(N, H), 0.0);
    float NdotH2 = NdotH * NdotH;
    float denom = (NdotH2 * (a2 - 1.0) + 1.0);
    return a2 / (PI * denom * denom);
}

// Smith Geometry Function
float geometrySchlickGGX(float NdotV, float roughness) {
    float r = (roughness + 1.0);
    float k = (r * r) / 8.0;
    return NdotV / (NdotV * (1.0 - k) + k);
}

float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
    float NdotV = max(dot(N, V), 0.0);
    float NdotL = max(dot(N, L), 0.0);
    float ggx1 = geometrySchlickGGX(NdotV, roughness);
    float ggx2 = geometrySchlickGGX(NdotL, roughness);
    return ggx1 * ggx2;
}

// Fresnel-Schlick
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

vec4 main(vec2 fragCoord) {
    // 1. Ray Setup (Orthographic / Weak Perspective Camera)
    vec2 uv = (fragCoord - 0.5 * uResolution) / uResolution.y;
    vec3 rayOrigin = vec3(uv.x * 2.0, -uv.y * 2.0, 5.0);
    vec3 rayDir = vec3(0.0, 0.0, -1.0);

    // 2. Analytical Ray-Sphere Intersection
    vec3 oc = rayOrigin - uSpherePos;
    float b = dot(oc, rayDir);
    float c = dot(oc, oc) - uSphereRadius * uSphereRadius;
    float discriminant = b * b - c;

    if (discriminant < 0.0) {
        return vec4(0.0); // Miss: transparent pixel
    }

    float t = -b - sqrt(discriminant);
    vec3 hitPos = rayOrigin + t * rayDir;
    vec3 N = normalize(hitPos - uSpherePos);
    vec3 V = -rayDir;

    // 3. PBR Optics Vectors
    vec3 L = normalize(uLightPos - hitPos);
    vec3 H = normalize(V + L);
    float distToLight = length(uLightPos - hitPos);
    float attenuation = 1.0 / (distToLight * distToLight);
    vec3 radiance = uLightColor * attenuation * 8.0;

    // 4. Fresnel Base Reflectance (F0)
    vec3 F0 = vec3(0.04); // Standard dielectric
    F0 = mix(F0, uAlbedo, uMetallic);

    // 5. Cook-Torrance Specular BRDF
    float NDF = distributionGGX(N, H, uRoughness);
    float G   = geometrySmith(N, V, L, uRoughness);
    vec3  F   = fresnelSchlick(max(dot(H, V), 0.0), F0);

    vec3 numerator = NDF * G * F;
    float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
    vec3 specular = numerator / denominator;

    // Energy Conservation: Diffuse vs Specular
    vec3 kS = F;
    vec3 kD = vec3(1.0) - kS;
    kD *= 1.0 - uMetallic;

    float NdotL = max(dot(N, L), 0.0);

    // Half-Lambert cartoon soft diffuse wrap
    float halfLambert = pow(NdotL * 0.5 + 0.5, 1.4);
    vec3 diffuse = kD * uAlbedo * halfLambert;

    // 6. Subsurface Scattering (Backlight Transmittance Physics)
    float sssThickness = max(0.0, 1.0 - N.z); // Thinner near silhouette edges
    float forwardScatter = pow(clamp(dot(V, -L), 0.0, 1.0), 3.0);
    vec3 sss = uSSSColor * forwardScatter * exp(-sssThickness * 2.5) * uSSSIntensity;

    // 7. Ambient Environmental Fill
    vec3 ambient = vec3(0.03) * uAlbedo;

    // Final Radiance
    vec3 color = ambient + (diffuse + specular) * radiance * NdotL + sss;

    // Tonemap & Gamma Correction
    color = color / (color + vec3(1.0));
    color = pow(color, vec3(1.0 / 2.2));

    return vec4(color, 1.0);
}
```

---

### 4.2. SDF Soft-Shadow Raymarching Shader (`SdfSoftShadow.sksl`)
Calculates mathematically exact penumbra falloff for stage spots and streetlights:

```glsl
// SkSL SDF Raymarching Soft Shadow Generator
uniform float2 uResolution;
uniform float2 uLightSource;   // 2D Light position
uniform float  uShadowSoftness;// k factor (e.g. 16.0 for soft penumbra)

// Signed distance to a 2D scene of occluders (circles & boxes)
float sceneSDF(vec2 p) {
    // Distance to character 1 (circle)
    float d1 = length(p - vec2(300.0, 200.0)) - 45.0;
    // Distance to character 2 (box)
    vec2 dBox = abs(p - vec2(500.0, 260.0)) - vec2(30.0, 60.0);
    float d2 = length(max(dBox, 0.0)) + min(max(dBox.x, dBox.y), 0.0);
    return min(d1, d2);
}

vec4 main(vec2 fragCoord) {
    vec2 p = fragCoord;
    vec2 rayDir = normalize(uLightSource - p);
    float maxDist = length(uLightSource - p);

    float t = 1.0;
    float shadow = 1.0;

    // Raymarch toward the light source
    for (int i = 0; i < 32; ++i) {
        if (t >= maxDist) break;
        float h = sceneSDF(p + rayDir * t);
        if (h < 0.001) {
            shadow = 0.0; // Hard occlusion
            break;
        }
        // Analytical penumbra equation: min(k * h / t)
        shadow = min(shadow, uShadowSoftness * h / t);
        t += clamp(h, 2.0, 25.0);
    }

    shadow = clamp(shadow, 0.0, 1.0);
    // Smoothstep falloff for realistic penumbra
    shadow = shadow * shadow * (3.0 - 2.0 * shadow);

    return vec4(vec3(shadow), 1.0);
}
```

---

### 4.3. Volumetric Atmospheric Raymarcher (`VolumetricHaze.sksl`)
Evaluates the Beer-Lambert radiative transfer integral for spotlight cones and city smog:

```glsl
// SkSL Volumetric Light & Atmospheric Haze Raymarcher
uniform float2 uResolution;
uniform float3 uSpotOrigin;    // 3D position of spotlight
uniform float3 uSpotTarget;    // 3D center of stage
uniform float  uSpotAngleCos;  // cos(half beam angle)
uniform float3 uHazeColor;     // Fog in-scattering color

const int STEPS = 24;
const float DENSITY = 0.035;

vec4 main(vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * uResolution) / uResolution.y;
    vec3 rayOrigin = vec3(uv * 3.0, 4.0);
    vec3 rayDir = vec3(0.0, 0.0, -1.0);

    vec3 spotDir = normalize(uSpotTarget - uSpotOrigin);
    float stepSize = 4.0 / float(STEPS);
    float opticalDepth = 0.0;
    vec3 accumulatedLight = vec3(0.0);

    for (int i = 0; i < STEPS; ++i) {
        vec3 samplePos = rayOrigin + rayDir * (float(i) * stepSize);
        vec3 toLight = samplePos - uSpotOrigin;
        float distToLight = length(toLight);
        vec3 L = toLight / distToLight;

        // Check if sample point lies inside the spotlight cone
        float cosTheta = dot(L, spotDir);
        if (cosTheta > uSpotAngleCos) {
            float coneAttenuation = smoothstep(uSpotAngleCos, uSpotAngleCos + 0.1, cosTheta);
            float distAttenuation = 1.0 / (distToLight * distToLight + 0.5);
            float inScattering = coneAttenuation * distAttenuation;

            // Beer-Lambert transmittance decay
            float transmittance = exp(-opticalDepth);
            accumulatedLight += uHazeColor * inScattering * transmittance * stepSize;
            opticalDepth += DENSITY * stepSize;
        }
    }

    return vec4(accumulatedLight, 1.0);
}
```

---

## 5. TypeScript Integration in React Native Skia v3

```typescript
import { Skia, type SkShader } from 'react-native-skia';

// 1. Compile the SkSL PBR Runtime Effect once at module load
const PBR_RUNTIME_EFFECT = Skia.RuntimeEffect.Make(`... [SkSL source above] ...`)!;

export function createPBRCharacterShader(
  width: number, height: number,
  sphereCenter: [number, number, number],
  radius: number,
  lightPos: [number, number, number],
  albedoHex: string,
  roughness: number,
  metallic: number
): SkShader {
  return PBR_RUNTIME_EFFECT.makeShaderWithChildren([
    width, height,
    ...sphereCenter,
    radius,
    ...lightPos,
    1.0, 0.95, 0.88,               // Light color (warm 3200K)
    ...hexToRgbNormalized(albedoHex), // Albedo [r, g, b]
    roughness,
    metallic,
    0.98, 0.28, 0.15,              // SSS color (warm crimson)
    0.75                           // SSS intensity
  ]);
}
```

---

## 6. Performance & 60 FPS Architectural Guarantee

1. **Hardware Compilation**:
   - `Skia.RuntimeEffect.Make()` compiles SkSL directly into high-performance Metal / Vulkan GPU pipeline shaders via Skia Graphite on Dawn.
2. **Offline Texture Baking**:
   - Complex raytracing and volumetric integrals are evaluated once into a raster surface (`Skia.Surface.MakeRaster`), snapshot as a GPU image (`makeImageSnapshot()`), and composited per-frame with `canvas.drawImageRectOptions`.
3. **Zero UI-Thread Pipeline Stalls**:
   - Per-frame worklets on the UI thread never allocate objects or recompile shaders, maintaining a rock-solid **60 FPS** at native Retina resolutions.

---

## 9. Note Ghost Character Design: The Incredibles Tech Visor HUD

To resolve note character readability on mobile screens while reinforcing *The Incredibles* retro-futuristic hero aesthetic:

1. **Visor Frame & Faceplate**:
   - Sleek aerodynamic titanium/carbon frame with metallic bevel highlight (`#4e6d9e`).
   - Deep glossy curved glass faceplate (`#081220` to `#02050a`) with diagonal specular reflection.
   - Frozone/Syndrome style circular tech earpieces/nodes with color-coded pulsing LEDs.
2. **High-Visibility Digital Neon Note Typography**:
   - Prominent **22pt bold typography** centered across the visor.
   - Triple-pass optical neon rendering:
     - Outer Gaussian neon bloom (`BlendMode.Plus`, sigma 3.2).
     - Inner intense aura (`BlendMode.Plus`, sigma 1.2).
     - Incandescent solid white core (`#ffffff`, 100% razor-sharp readability).
   - Color-coded signature palette per musical note:
     - **A**: Electric Cyan (`#00e5ff`)
     - **B**: Cyber Orange (`#ff9100`)
     - **C**: Neon Crimson (`#ff2a6d`)
     - **D**: Bright Emerald (`#00e676`)
     - **E**: Hyper Violet (`#d500f9`)
     - **F**: Solar Gold (`#ffd600`)
     - **G**: Deep Sky Blue (`#2979ff`)

