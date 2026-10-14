# Historical path-tracer comparisons

The sibling snapshot at 2521bd4978e59c173946e3816bdf21915d2d2bb9 contains 545 AVIF images across 200 scenes: 193 Blender references, 159 WebGL Legacy captures and 193 WebGPU New captures. All are imported byte-for-byte, including missing-capture gaps. Existing screen-space outputs remain unchanged.

migration/pathtracer-history.json records every original path, canonical path, dimensions, byte count and SHA-256 hash. WebGL Legacy maps to three-gpu-pathtracer; WebGPU New maps to three-gpu-pathtracer-webgpu-experimental. Blender retains its ID. Every imported scene uses its distinct pt- identity from the scene map. Retired three-gpu-pathtracer-webgpu images from the original screen-space suite are neither overwritten nor relabeled.

The source revision identifies the saved snapshot. Per-image generation revisions, sample counts and generator settings were not recorded; these images remain historical comparisons. Import integrity and newly regenerated comparison metrics do not establish current-adapter rendering parity.

Run pnpm build, then node scripts/verify-pathtracer-history.mjs. The test suite verifies every imported byte and identity. The unified website regenerates metrics using its current metric implementations. The manifest's source paths and scene/renderer mappings also drive the sibling site's legacy link redirects.

## Completing missing comparisons

“Historical result” describes the provenance of an existing capture, not whether a scene is supported or complete. All 200 scenes are registered under `pt-*` and can be rendered by the current suite. The imported snapshot has 55 missing reference/path-tracer images (41 WebGL, seven Blender and seven experimental WebGPU). It contains no captures from the current screen-space configurations.

Build the suite and start its render server with `pnpm --filter @three-fidelity/playground dev`. Use the project CLI to fill missing outputs at the registered scene dimensions without replacing existing captures:

```powershell
# Current enabled configurations, in scene-family batches:
pnpm cli render --scenes "pt-gi-*,pt-directionallighttest" --missing-only
pnpm cli render --scenes "pt-khronos-*" --missing-only
pnpm cli render --scenes "pt-x-*" --missing-only
pnpm cli render --scenes "pt-model-*" --missing-only

# The experimental WebGPU path tracer requires explicit selection:
pnpm cli render --scenes "pt-*" --renderers "three-gpu-pathtracer-webgpu-experimental" --missing-only
```

Confirm the actual browser renderer/adapter is a physical GPU before capturing. Use quoted comma-separated globs to subdivide large batches. A batch can be resumed with the same command: completed images are skipped. Keep the imported captures and their exact-byte manifest unchanged; adding missing outputs does not change the provenance of the original images. Process results with `pnpm exec fidelity-kit process fidelity-results`, then build the site and commit the new images and metrics.
