# Voxel Cone Tracing

The `vxgi` renderer is named **Voxel Cone Tracing** in the registry and playground. It uses the pinned Three.js fork's upstream [VXGI Sponza pipeline](https://threejs.org/examples/webgpu_vxgi_sponza.html): an opaque depth/normal/velocity pre-pass, voxel cone tracing, AO and diffuse irradiance injected through `builtinGIContext`, and upstream TRAA. Scene lights, shadows, environment, camera, exposure, and tone mapping retain the suite's settings.

The renderer uses upstream defaults: 128 voxels along the longest scene axis, three diffuse cones, a 40-degree cone aperture, and one cached bounce. GI intensity is 1, rather than the Sponza example's artistic boost of 1.5. It adds diffuse GI and AO; specular reflections use the scene's existing material/environment lighting. No SSGI or SSR is added.

Voxelization is cached for static scene geometry. Camera motion does not require rebuilding it. Dynamic geometry requires explicitly invalidating the volume; the fidelity scenes freeze animated assets at their canonical pose. Automatic scene bounds mean large outdoor scenes have coarser world-space voxels than small rooms. Thin walls, detailed geometry, and mirrors can expose light leakage, coarse occlusion, and the limits of diffuse cone tracing.

All 55 registered fidelity scenes have beauty captures at their registry dimensions and frame counts. The default benchmark collection includes VXGI on its existing scenes; the representative collection includes only its existing four scenes. To reproduce:

```powershell
pnpm build
node scripts/build-render-server.mjs
# With the playground development server running:
pnpm render --renderer vxgi
pnpm performance:representative --machine window001 --session 2026-10-07-02-18 --renderer vxgi --seed 17 --recycle 1 --cooldown-ms 2000
pnpm fidelity:build
```

The representative measurements were added on October 8, 2026 (America/Toronto) to the existing comparison session. Each uses 1920 x 1080, DPR 1, hardware WebGPU, one second of warmup, at least ten seconds of GPU-completed throughput measurement, vsync off, and an end-of-run AVIF. Chrome is recycled between every VXGI workload. Initial voxelization and compilation are recorded during initialization rather than included in steady-state FPS. Existing techniques were measured earlier; these are single observations, not simultaneous measurements or equal-quality comparisons.

| Scene             | VXGI FPS |
| ----------------- | -------: |
| Breakfast room -w |   200.33 |
| Cornell basic     |   217.06 |
| Dogwood           |   254.20 |
| Coffee maker      |   169.86 |

Hardware is the existing `window001` machine's NVIDIA RTX 3060 Ti. See [the existing renderer measurements](performance/REPRESENTATIVE-WINDOWS001.md) for the other techniques. The committed metrics and screenshots are under `performance-results/window001/2026-10-07-02-18/vxgi/`.

## Baked Voxel Cone Tracing

`vxgi-light-bake` uses the LightMapper and UV atlas from [Three.js PR #34991](https://github.com/mrdoob/three.js/pull/34991). Initialization prepares the same default 128-voxel volume with one cached bounce, and bakes 64 jittered samples with three diffuse cones and a 40-degree aperture into an HDR light map with three-texel chart padding. The atlas starts at 1024 square and doubles up to 8192 when dense geometry does not fit; voxel and cone settings remain unchanged. GI intensity remains 1. Initialization waits for GPU completion and releases the volume before returning.

Subsequent frames sample the light map for indirect diffuse; direct lights, shadows, environment/specular lighting and TRAA remain live. Camera movement does not rebake. Geometry and lighting changes require recreating the renderer. This variant does not retain the live VXGI screen-space AO calculation. Atlas geometry and cloned materials are restored and released on disposal. Baking cost is part of startup rather than steady-state performance.

The upstream sources are vendored under `packages/renderers/src/vxgi-bake/` with their MIT license and pinned commit provenance; the existing Three.js fork revision is unchanged.

The Lighting research comparison preset includes both live and baked voxel cone tracing.

## Baked fidelity captures — October 13, 2026

All 55 current, non-historical fidelity scenes have `vxgi-light-bake` beauty captures at their registry dimensions and frame counts. The 200 imported historical entries retain their existing results. Captures use Chrome for Testing 148.0.7778.97 on Windows001 with hardware NVIDIA Ampere WebGPU (RTX 3060 Ti); native integration reports D3D12 driver 32.0.16.1714.

The renderer uses the merged implementation plus the dense-atlas fallback. Coffeemat required an atlas larger than 1024. Atlas packing retries preserve the voxel and cone settings; all 55 image dimensions were checked against the registry.

PSNR in dB against the existing three-gpu-pathtracer reference (higher is closer):

| Scene                  | Live VXGI PSNR | Baked VXGI PSNR |
| ---------------------- | -------------: | --------------: |
| cornell-box-basic      |          22.61 |           20.63 |
| model-breakfast-room-w |          14.45 |           14.87 |
| higharc_dogwood        |          20.00 |           20.19 |
| model-coffee-maker     |          15.25 |           19.32 |

Baking is a diffuse-lighting approximation, with different noise and occlusion behavior from live GI/AO. Cornell retains visible irradiance bands with the upstream sampler. A hardware atlas check using a known world-position/normal field passes on transformed geometry; constant irradiance produces a uniform atlas. Dogwood reports upstream Float32 UV precision limits and possible chart overlap. These results are retained for comparison. Camera motion preserves the finished bake; geometry or lighting changes require recreating the renderer.

Validation: build, typecheck, lint (warnings only), formatting, all 320 tests with coverage (four workers, 30-second timeout), hardware integration on the four representative scenes, and comparison-site build passed. The unchanged dependency graph has seven audit advisories (two critical, four high, one moderate).

## Baked representative benchmarks — October 13, 2026

Session 2026-10-13-16-54 uses source commit 1e93c2386097f3eda0d52667904eb0c9ba17c9c4 after the fidelity-results merge. All four representative workloads completed successfully on Windows001 (Ryzen 9 5950X, NVIDIA RTX 3060 Ti), Chrome for Testing 148.0.7778.97 and hardware NVIDIA Ampere WebGPU. Results and end-of-run captures are under performance-results/window001/2026-10-13-16-54/vxgi-light-bake/.

Each workload uses 1920 × 1080 at DPR 1, vsync and frame caps off, at least one second of warmup, and at least ten seconds of measurement. Workloads run sequentially, with a fresh browser per scene, seed 17 and a two-second cooldown. Frames are counted in batches of 16 after GPU completion; queues are drained before teardown. GPU timestamp profiling is disabled.

| Scene                  | Baked FPS | Startup (s) | Historical live VXGI FPS |
| ---------------------- | --------: | ----------: | -----------------------: |
| model-breakfast-room-w |    728.07 |        3.31 |                   200.33 |
| cornell-box-basic      |    447.52 |        1.45 |                   217.06 |
| higharc_dogwood        |   1004.34 |        1.69 |                   254.20 |
| model-coffee-maker     |    614.11 |        4.32 |                   169.86 |

Startup includes asset loading, atlas generation, voxelization, the complete 64-sample bake, and shader compilation. The process phase includes baking; no isolated bake duration is reported. Steady-state FPS samples the completed light map. Historical live figures come from the separate October 7 session; lighting outputs and dates differ, and these single observations provide no confidence interval. See the fidelity table above for the quality tradeoff.

Validation: all four results have status ok, NVIDIA hardware adapter metadata, vsync off, GPU-completed batch counts, warmup of at least one second, measurement of at least ten seconds, and 1920 × 1080 captures. The comparison site rebuilds with this session. Build, types, lint and 320 coverage tests passed during renderer/fidelity validation.
