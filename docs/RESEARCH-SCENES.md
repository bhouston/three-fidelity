# glTF research scenes

Pinned source: ErfanMo77/gltf-research-scenes at `2b9fc945d7016048fe7099d67de9024241714ff3` (27 scenes).
Initialize with `git-dedup submodule update --init submodules/gltf-research-scenes`.

The `research-` family loads extended glTF materials (Classroom 2 is a GLB), retains original world geometry and embedded cameras, and preserves source aspect ratios at a maximum dimension of 640 pixels. Camera far planes expand to include scene bounds. Existing staged `model-` and `pt-` fixtures keep their distinct identities.

Source emissive meshes remain the only area emitters. Metadata distant lights become directional lights with source RGB radiance and PBRT transforms. Infinite lights use their original radiance; square equal-area maps are resampled into world-space equirectangular HDRs. No studio illumination, replacement sun, normalization, floor, or material edits are added. ACES display mapping and exposure 1 are shared across renderers. Raster baseline does not reproduce emissive indirect lighting; path-traced results are the appropriate lighting reference. PBRT-only integrators and homogeneous media remain conversion limitations, as documented upstream.

Regenerate the five environment derivatives from the pinned sources with:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python scripts/convert-research-environments.py
```

The converter reads PFM floats directly and uses Blender/NumPy for EXR decoding and resampling. It applies inverse light transforms and PBRT's equal-area sphere-to-square mapping, bilinear filtering, and writes linear RGBE without display transforms. HDR assets retain each source scene's license: BMW M6 and House CC0, Breakfast Room, Classroom and Living Room CC-BY-3.0. Attribution and licenses remain in the pinned scene `README.md` and `source/LICENSE.txt`; see the upstream repository's scene table. This repository's MIT license does not replace those licenses.

Five scenes (`material-testball`, `pontiac-gto`, `teapot`, `teapot-full`, `vintage-car`) reference `source/textures/envmap.pfm` absent from upstream. Their definitions fail explicitly and they are excluded from the capture registry until the source environments are supplied. This avoids publishing reference renders with invented illumination. The other 22 scenes are in the registry under Research scenes.

Browser models and relative buffers/textures resolve through revision-pinned upstream URLs; native loaders use the local submodule. HDR derivatives are served from suite-assets/research-environments, including static render-server builds.

Run `pnpm build` followed by `node --expose-gc scripts/validate-research-scenes.mjs` to validate all 22 native definitions, textures and cameras. Lightweight CI tests check registry consistency, camera/light setup and LFS URL routing without downloading the multi-gigabyte scene submodule.

For browser captures, start `pnpm --filter @three-fidelity/playground dev --host 127.0.0.1`, verify the actual WebGPU/WebGL adapters are hardware, then run `pnpm render --scenes 'research-*' --renderers three-current,three-gpu-pathtracer --executable-path '<Chrome path>'`. The shared suite records 128 raster frames and 4096 path-traced samples, using the source aspect ratio. GitHub LFS binary dependencies use revision-pinned media.githubusercontent.com URLs; non-LFS glTF documents use raw.githubusercontent.com so relative resources retain their paths.

For large scenes whose BVH/shader setup exceeds the shared CLI's default Puppeteer timeout, use `node scripts/capture-research-scenes.mjs --executable-path '<Chrome path>'`. This uses the same registry, render host, seed, resolution, sample count and AVIF settings, extends protocol/capture timeouts to 30 minutes, verifies physical GPU adapters, skips existing outputs, and continues past individual scene failures. Select browser renderer IDs with `--renderers id1,id2` or scene IDs with `--scenes research-cornell-box`. It never reduces capture quality to satisfy a timeout.
