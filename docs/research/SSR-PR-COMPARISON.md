# Independent SSR PR comparison

October 13, 2026. Swarm issue 52; three-fidelity issue #254.

## Review units and conclusion

- [Three.js #28](https://github.com/bhouston/three.js/pull/28): normal offset, consistent displaced-ray projection/hit tests, controls, and GPU regression coverage. Largest image change here, but **not an overall PSNR improvement**: mean per-scene delta −0.0176 dB mirror and −0.0134 dB GGX. Default bias 0.002 warrants further tuning. Removing false hits in the prior isolated convex-sphere control did not establish a general beauty-image improvement.
- [Three.js #29](https://github.com/bhouston/three.js/pull/29): reject back-facing shading normals before sampling, and clamp the remaining positive ray-length denominator at 0.001. Numerical robustness, essentially neutral quality: mean +0.000094 dB mirror and +0.000014 dB GGX. Twelve of thirteen images in each mode are pixel-identical to baseline after AVIF decoding.
- [Three.js #30](https://github.com/bhouston/three.js/pull/30): mirror-bias comment correction. Zero image effect; all thirteen independent captures are pixel-identical to baseline.

None explains the large gains of the complete `three-new` pipeline. GGX, dielectric reflections, radiance integration, thickness/hit validation, and dedicated reflection reconstruction are separate mechanisms. Specular SSR was mislabeled diffuse SSGI in the original request. Optional GGX SSR already exists in dev.

## Method

Thirteen reflection scenes: twelve current `diag-*` reflection diagnostics, excluding odd-size Hi-Z coverage, and `steampunk-camera`. Eight variants were rerendered for 104 captures, including stock `three-current`. Each uses native scene dimensions, seed 1, exactly 64 pipeline frames including initialization, the same camera, stock additive composition, and final TRAA. The capture host waits for GPU completion before readback. This is image-quality evaluation, not a throughput benchmark.

The separate dev runtime is pinned at `e615266e7647f0a062219d55e79913237594b6b7` in `submodules/three-dev`. The production fork and immutable npm `three-current` (three@0.186.1) are preserved. A vendored dev SSRNode has only two compile-time ablation switches: normal bias or ray-length guard. Neither enables the other. Comment-only uses baseline executable code. Matching mirror/GGX baselines isolate fixes from version and pipeline changes.

GGX uses dev's default `mirrorBias` 0.5, scene-authored march settings, and the same final TRAA. It does not use `three-new`'s dedicated SSR filter or radiance injection, and is not an unbiased full-lobe experiment. Comparing GGX with mirror evaluates a mode change, not either PR.

References are the existing committed pathtracer AVIFs; no new path traces were generated. PNG readback is encoded to quality-90 4:4:4 AVIF, matching the suite. PSNR uses fidelity-kit's RGB8 comparison of decoded AVIFs. Positive delta means better reference agreement. Means are unweighted means of per-scene dB deltas, not pooled-image PSNR. This static-camera comparison does not establish motion quality or temporal convergence across frame budgets.

Every renderer's actual adapter was intercepted and verified: NVIDIA Pascal, fallback false, GTX 1050 on Build001. Chrome 155, hardware only, software rasterization disabled. The artifact manifest records adapter info for all 104 captures. Independent comment-only captures provide a deterministic A/A control on all thirteen scenes.

## PSNR results (dB)

| Scene              | Stock r186 | Dev mirror | Normal Δ | Guard Δ | Dev GGX | Normal Δ | Guard Δ |
| ------------------ | ---------: | ---------: | -------: | ------: | ------: | -------: | ------: |
| steampunk-camera   |    18.8491 |    19.1143 |  −0.0686 | +0.0012 | 18.5009 |  −0.1142 | +0.0002 |
| diag-mirror        |    24.6520 |    24.6467 |  −0.0194 |       0 | 24.3606 |  −0.0047 |       0 |
| diag-rough-10      |    24.8714 |    24.8632 |  −0.0135 |       0 | 24.5853 |  −0.0084 |       0 |
| diag-rough-30      |    26.3711 |    26.3804 |  −0.0137 |       0 | 26.1702 |  +0.0046 |       0 |
| diag-rough-60      |    24.0813 |    24.2640 |  +0.0168 |       0 | 25.5887 |  +0.0033 |       0 |
| diag-dielectric-0  |    32.5031 |    32.5026 |        0 |       0 | 33.9200 |  −0.0143 |       0 |
| diag-dielectric-30 |    33.6478 |    33.6451 |        0 |       0 | 35.1319 |  +0.0140 |       0 |
| diag-grazing       |    23.7074 |    23.7023 |  −0.0257 |       0 | 23.6031 |  −0.0213 |       0 |
| diag-offscreen     |    19.4368 |    19.4347 |  +0.0036 |       0 | 19.1605 |  +0.0033 |       0 |
| diag-occlusion     |    24.8977 |    24.8993 |  −0.0169 |       0 | 24.4287 |  −0.0187 |       0 |
| diag-wall          |    19.2389 |    19.2416 |  −0.0016 |       0 | 19.3216 |  +0.0043 |       0 |
| diag-sphere        |    21.3553 |    21.3435 |  +0.0003 |       0 | 21.3234 |  −0.0007 |       0 |
| diag-metal-hit     |    26.3301 |    26.3171 |  −0.0896 |       0 | 26.1691 |  −0.0213 |       0 |

Largest normal-bias improvements: +0.0168 dB mirror rough-60 and +0.0140 dB GGX dielectric-30. Largest regressions: −0.0896 dB mirror metal-hit and −0.1142 dB GGX steampunk. The guard changes curved-model content slightly, without a broad gain. These small fixes should not be described as major fidelity improvements.

## Reproduction and viewing

Initialize pinned code submodules with git-dedup without updating revisions. Install locked dependencies and run `pnpm build`. This prepares dev source entrypoints; generated `build/` files must not be committed. Start `pnpm --filter @three-fidelity/playground dev` in another terminal, then run:

```sh
node scripts/ssr-pr-capture.mjs
node scripts/ssr-pr-report.mjs
```

`PUPPETEER_EXECUTABLE_PATH` can select an existing Chrome when Puppeteer's pinned browser is unavailable. `SSR_ROOT_URL` selects the server; `SSR_FRAMES` defaults to 64; `SWARM_ARTIFACTS` selects PNG/manifest output. The scripts capture only reflection scenes.

Viewer presets **SSR fixes (mirror)** and **SSR fixes (GGX)** place each fix beside its matching dev baseline and stock Three Base. New variants are opt-in; production renderers and references are preserved. Input AVIFs and this report are committed. Metrics/heatmaps are ignored and regenerated by fidelity-kit process/build. Comparison variants are excluded from the unrelated representative performance collection.

## Validation

Build, typecheck, lint, and unit coverage results are recorded in the PR. All 104 hardware captures completed without renderer/shader errors (only a favicon 404). Build before tests: several existing tests import generated workspace `dist` modules.

Dependency audit reports existing findings: two critical, four high, one moderate. High/critical paths are `extract-zip` through Puppeteer and `simple-git` through pathtracer tooling. The new link dependency changes no resolved package versions. Audit is not clean.

Hardware Three.js unit suites were rerun independently on each split branch. No PR targets mrdoob/three.js.

## Follow-up: full pipeline attribution and throughput

The October 13 follow-up adds controlled reflection pipeline ablations, independent new fixes and repeated GPU-completed throughput runs. See [SSR-CONTRIBUTIONS.md](SSR-CONTRIBUTIONS.md). The earlier static results above remain unchanged.
