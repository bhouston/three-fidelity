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
