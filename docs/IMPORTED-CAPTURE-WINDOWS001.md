# Imported scene capture on Windows001

The imported `pt-*` definitions are active scenes. Their historical tag describes the provenance of the 545 saved sibling captures, not an inability to render them. New captures preserve those files and their exact-byte manifest.

The native batch uses the registered dimensions, 64 screen-space frames, seed 1, and 4096 samples for the three reference/path-tracer configurations. Noise thresholds are zero. Both native APIs were checked on the physical NVIDIA GeForce RTX 3060 Ti: WebGL uses ANGLE/D3D11; WebGPU uses Dawn/D3D12 (driver 32.0.16.1714). The browser smoke capture independently reported the same Ampere GPU. Blender can use the CPU lane without a graphics context for these HDR-lit imported scenes.

```powershell
pnpm cli render --native --scenes "pt-*" --renderers "three-current,three-new-ssgi-third,three-new-light-probe-ddgi,three-new-light-bake,three-new-vpl,three-new-vpl-shadow-maps,vxgi,vxgi-light-bake,three-gpu-pathtracer*,blender" --frames 64 --missing-only
```

All 200 definitions loaded successfully from the pinned asset libraries. The shared Blender adapter now accepts tone-mapped unlit materials and explicitly translates untextured points/solid one-pixel lines into camera-matched triangle surfaces. These still-capture primitives retain pixel size, vertex color and opacity; their geometry is specific to the chosen camera and resolution. The suite opts into this feature for Blender captures. The voxel light-map bake derives flat normals for inputs that omit them, including their posed morph geometry, without changing the source mesh.

Native Windows captures require `webgpu` 0.6.2 or newer, which ships Dawn's DXC compiler. Version 0.6.1 forces FXC and fails to compile some VPL pipelines. The native host requests the physical adapter's supported buffer limits and rejects uncaptured validation errors. Newly generated images from failed pipelines are removed before retrying; historical captures are preserved. Light-map atlases retain their original budget when it fits and grow only when packing requires it, up to the hardware texture limit.

Both Three versions initialize their own area-light BRDF lookup textures. This enables the imported rectangular-light rigs rather than silently producing black or partially lit scenes. The light-map bake preserves unlit materials without applying its irradiance texture. Imported closed line loops use equivalent indexed closed strips so WebGPU renders their closing edges. These changes preserve authored geometry, cameras and lighting.

Two large LEGO voxel-bake jobs exceeded Node's default heap. Retry memory-heavy jobs serially with a larger heap; this changes the host memory allowance rather than the scene, atlas or sampling policy:

```powershell
$env:NODE_OPTIONS = "--max-old-space-size=12288"
pnpm cli render --native --scenes "pt-model-lego-ucs-imperial-star-destroyer,pt-model-lego-ucs-millennium-falcon" --renderers vxgi-light-bake --frames 64 --missing-only
```

## DirectionalLight's authored normals

`pt-x-directionallight` has three spheres with inward-pointing normals: all 5374 vertices on each sphere have a negative dot product between their normal and radial position (mean cosine -0.9999266). A small Cycles diagnostic produces zero reflected radiance while the same geometry with emission is visible. Its faithful Cycles reference is therefore black. The imported input is preserved; no normals are flipped and no placeholder image is used.

Accept that known outcome explicitly for this scene. Ordinary Blender captures still reject unexpected all-black images, and the override requires native capture with only Blender selected:

```powershell
pnpm cli render --native --scenes pt-x-directionallight --renderers blender --blender-device cpu --allow-all-black --missing-only
```

Current raster pipelines may shade this invalid-normal input differently; its comparison should be interpreted with that input limitation in mind. The original historical images retain their provenance and unknown per-image generation settings.
