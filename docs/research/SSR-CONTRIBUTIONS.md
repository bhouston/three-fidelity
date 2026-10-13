# Where three-new's reflection gains come from

Measured October 13, 2026 on physical NVIDIA GeForce GTX 1050 / Pascal; 13 reflection scenes only. The full three-new pipeline is **+7.6340 dB mean** over pinned Three.js dev. The earlier normal-bias/ray-guard/comment PRs do not account for this gain.

## The dominant change is reflection composition

The improved pipeline replaces the base lobe's environment radiance with a reflection radiance estimate (including environment fallback on misses), then lets the material apply its BRDF. Stock post-processing adds a premultiplied reflection over already-lit beauty. Environment specular can therefore be counted again, and stock mirror weighting is also different from material-side Fresnel.

Keeping three-new's sampler, source, filtering, frame count and final material shading unchanged, but adding its incoming reflection radiance to existing environment radiance, loses **14.8911 dB mean**. The screenshot comparison shows the associated washed-out mirror floor. This isolates a composition penalty **within three-new**; it is not a 14.89 dB predicted gain for a standalone stock change. The full-vs-stock comparison also changes other parts of the pipeline.

New draft [three.js #34](https://github.com/bhouston/three.js/pull/34) ports only the `getRadiance` / `RadianceNode` integration hook. It leaves diffuse, multiscattering, sheen and clearcoat inputs intact. The hook is a foundation: current SSRNode's premultiplied color cannot be injected directly. A complete radiance-producing SSR provider with environment fallback is still required, so stock examples do not automatically improve from this API alone.

## Conditional image-quality benefits

| Feature retained in the full pipeline        | Mean benefit when restored | Interpretation                                                             |
| -------------------------------------------- | -------------------------: | -------------------------------------------------------------------------- |
| Replace environment instead of adding to it  |                 14.8911 dB | Largest measured composition penalty; double-counting ablation             |
| Dense linear marching instead of 32 steps    |                  1.6783 dB | Both compared variants disable Hi-Z, so this isolates step count           |
| No artificial distance fade                  |                  0.9515 dB | Same reach/sampling/filter, restores squared distance fade to hit blending |
| Back-depth-dependent hit validation          |                  0.8356 dB | Includes silhouette fetching that requires back depth                      |
| Dedicated reflection temporal/spatial filter |                  0.3909 dB | Final TRAA remains enabled in both variants                                |
| Hit-specular handling                        |                  0.3545 dB | Disables the hit-specular input; other hit/material inputs remain          |
| Full GGX lobe instead of mirror bias 0.5     |                  0.2166 dB | Changing bias changes directions; neither pipeline is proven unbiased      |
| Hi-Z versus uncapped linear traversal        |                  0.2110 dB | Both are dense; changes trace behavior/work                                |
| Long rays instead of authored maxDistance    |                  0.0309 dB | Small effect on these scenes, larger on steampunk (+0.3302 dB)             |

These leave-one-out benefits are conditional on the other features and are **not additive shares** of +7.6340 dB. Negative per-scene benefits are real regressions: dedicated filtering, for example, helps steampunk and diag-metal-hit strongly, but slightly hurts some static simple scenes. No motion capture was performed.

The no-fade experiment restores squared distance fade to the incoming-radiance hit blend while preserving the long ray budget; it is not an exact replay of every historical stock attenuation path. The capped-march experiment sets maxMarchSteps=32 and disables Hi-Z; compare it with no-hiz rather than with the Hi-Z full pipeline. These are controlled diagnostic settings, not a claim to reconstruct every original revision.

## Independent stock fixes

- [#32: dielectric mirror flag](https://github.com/bhouston/three.js/pull/32): `reflectNonMetals=true` bypassed the early-out but still multiplied mirror output by metalness. Adding the missing dielectric Schlick term gives **+1.2659 / +1.0306 dB** on the two dielectric diagnostics, **+0.0302 dB mean**, and **−1.3567 dB** on diag-wall. Default metal-only and stochastic behavior remain unchanged. Recommend as a targeted behavior fix with this composition caveat, not a broad PSNR improvement.
- [#33: optional back-depth validation](https://github.com/bhouston/three.js/pull/33): **+0.0067 dB mean** when added alone to stock dev; +0.1572 on diag-rough-10 but −0.2695 on steampunk. Extra back-face depth pass/sample cost, unmatched layers on open/overlapping geometry, and visible-color proxy for hidden surfaces. Keep experimental; do not upstream yet on this evidence. Its independent effect is much smaller than its conditional benefit in three-new.
- Rejecting cleared-background hit depths produced **0 dB** change across these scenes, so no separate Three.js PR was opened for that experiment.

## Earlier PRs: upstream recommendation and speed

- [#30](https://github.com/bhouston/three.js/pull/30): recommend the wording correction. Moving random samples toward the mirror changes their distribution without adjusting the original PDF; calling that unbiased is unjustified. No executable change, no possible implementation speedup.
- [#29](https://github.com/bhouston/three.js/pull/29): reasonable robustness contribution. Reject back-facing normals instead of converting a negative ray budget into a forward one. The positive grazing-angle denominator bound remains a heuristic, not a proof of physical correctness. PSNR essentially neutral, and this benchmark does not establish a general speedup.
- [#28](https://github.com/bhouston/three.js/pull/28): hold for tuning/redesign. It removes false self-hits in an isolated convex control but slightly hurts the reflection-suite mean (mirror −0.0176 dB, GGX −0.0134 dB). A fixed depth-scaled normal offset is not an error-bounded offset, can remove nearby valid hits, and adds arithmetic. No reliable broad performance advantage was established.

### Throughput experiment

WebGPU, 480×360, seed 1, two sequential repetitions per scene. Vsync/frame cap disabled. Each fresh implementation warmed for at least one second, then ran at least five seconds. Eight complete pipeline frames were submitted per batch and counted only after GPU completion; queues drained before disposal/switching. No individual-frame timings and no concurrent GPU validation/capture jobs. Baseline was run before and after each sequence; percentages use their mean.

| Scene / repeat       | Mean baseline FPS | Baseline drift | Normal bias | Ray guard | Identical comment-only |
| -------------------- | ----------------: | -------------: | ----------: | --------: | ---------------------: |
| diag-sphere / 1      |             642.6 |         -1.83% |       4.19% |     3.48% |                 -1.77% |
| diag-sphere / 2      |             627.3 |          3.30% |       1.26% |    -1.97% |                  1.31% |
| steampunk-camera / 1 |             538.1 |         -1.92% |       0.39% |     1.40% |                  0.17% |
| steampunk-camera / 2 |             541.4 |         -0.45% |      -1.48% |     0.44% |                 -2.41% |

The identical comment-only control varies despite identical executable code, and repeated baselines drift. Normal bias is modestly faster on the convex-sphere control (where it changes false-hit behavior), but not on steampunk; ray-guard effects are inconsistent across repeats/scenes. These measurements are insufficient to claim a portable speed optimization. The full new pipeline and new opt-in PRs were not throughput-benchmarked.

## Literature and correctness

- [Stachowiak, Stochastic Screen-Space Reflections](https://h3.gd/stochastic-ssr/) describes importance sampling combined with spatiotemporal filtering and ratio estimation. Three-new's incoming radiance / normalized accumulation / material integration is a broader change than adding GGX directions.
- [Heitz, Sampling the GGX Distribution of Visible Normals](https://jcgt.org/published/0007/04/01/) grounds visible-normal importance sampling. It does not validate uncorrected mirror-biased random samples, custom hit rejection or screen-space missing geometry.
- [Filament PBR formulation](https://google.github.io/filament/main/filament.html) supports nonzero dielectric Fresnel and applying the material response to incoming radiance. The dielectric flag fix preserves legacy metal weighting and is not a complete physical rewrite.
- [NVIDIA self-intersection analysis](https://developer.nvidia.com/blog/solving-self-intersection-artifacts-in-directx-raytracing/) derives offsets from error bounds/geometric normals. It motivates robust offsetting, but does not justify the current universal SSR normal bias. DXR's exact error analysis cannot simply be transplanted into screen-space tracing.

## Reproduce

```sh
pnpm build
pnpm --filter @three-fidelity/playground dev
# separate terminal, physical GPU required:
node scripts/ssr-pr-capture.mjs
node scripts/ssr-contribution-report.mjs
node scripts/ssr-pr-throughput.mjs
```

Use `SSR_ROOT_URL` for a non-default Vite port, `PUPPETEER_EXECUTABLE_PATH` for an installed Chrome version, `SSR_RENDERERS` for selected capture variants, and `SWARM_ARTIFACTS` for PNG/manifest/benchmark outputs. Throughput runs sequentially and requires a physical NVIDIA adapter in this harness; never overlap it with another GPU task. Viewer preset **SSR contributions** contains stock Three Base, pinned dev and individual variants. These diagnostic variants are disabled by default and excluded from the unrelated representative benchmark scenes.

Source baseline: three.js dev `e615266e7647f0a062219d55e79913237594b6b7`; production three-new fork remains `83c310af72715ae558beea12d169f00c62ea48eb`. Capture mode uses native scene dimensions, 64 GPU-completed pipeline frames, seed 1. Fifteen variants × thirteen scenes were captured this turn with actual selected NVIDIA Pascal adapter verification, fallback false; prior old-fix inputs remain from their original matched captures. PNG sources/metadata are swarm artifacts. Committed AVIF inputs use quality 90, 4:4:4; existing path-traced AVIF references are unchanged. RGB8 full-frame PSNR and unweighted means of per-scene dB deltas can conceal local reflection regressions and include non-reflective pixels. This is one GPU, one seed and static views.

## Full scene results

| Scene              | totalGain | dielectricGain | solidDepthGain | backgroundGain | rayReachBenefit | noFadeBenefit | replaceEnvironmentBenefit | denseMarchBenefit | filterBenefit | hitSpecularBenefit | backDepthBenefit | hizBenefit | fullLobeBenefit |
| ------------------ | --------: | -------------: | -------------: | -------------: | --------------: | ------------: | ------------------------: | ----------------: | ------------: | -----------------: | ---------------: | ---------: | --------------: |
| steampunk-camera   |    3.6597 |        -0.0075 |        -0.2695 |         0.0000 |          0.3302 |        1.6277 |                    4.2821 |            1.1599 |        2.1412 |             1.7174 |           0.6235 |    -0.0203 |          0.5644 |
| diag-mirror        |   11.9011 |        -0.0559 |         0.1523 |         0.0000 |          0.0111 |        1.9121 |                   20.8976 |            3.4545 |       -0.0024 |             0.0414 |           2.4117 |     0.5599 |          0.0594 |
| diag-rough-10      |   11.8575 |        -0.0547 |         0.1572 |         0.0000 |          0.0039 |        1.6010 |                   21.0284 |            2.8983 |       -0.2419 |             0.0051 |           2.6257 |     0.6294 |          0.2803 |
| diag-rough-30      |   10.6943 |        -0.0798 |         0.1520 |         0.0000 |          0.0084 |        1.1510 |                   21.3293 |            0.9205 |        0.2765 |             0.0147 |           2.1747 |     0.4691 |          0.9464 |
| diag-rough-60      |    1.7253 |        -0.0713 |        -0.1349 |         0.0000 |         -0.0008 |       -0.0129 |                   10.9715 |            0.0296 |       -0.1741 |             0.0171 |           0.0657 |     0.0550 |          0.2693 |
| diag-dielectric-0  |    7.5341 |         1.2659 |         0.0000 |         0.0000 |          0.0052 |        0.4157 |                   15.4435 |            0.9473 |       -0.0268 |            -0.0255 |           0.7895 |     0.1804 |          0.0088 |
| diag-dielectric-30 |    6.6446 |         1.0306 |         0.0000 |         0.0000 |         -0.0058 |        0.2355 |                   15.2559 |            0.2257 |        0.0034 |            -0.0217 |           0.6223 |     0.1390 |          0.2968 |
| diag-grazing       |   10.4763 |        -0.0226 |        -0.0164 |         0.0000 |          0.0155 |        1.0340 |                   17.3146 |            2.5413 |       -0.1086 |            -0.0566 |           0.0616 |     0.1940 |          0.0162 |
| diag-offscreen     |   10.5464 |        -0.0548 |         0.0850 |         0.0000 |          0.0097 |        0.7839 |                   14.0126 |            1.5673 |        0.0339 |             0.0504 |           1.3085 |     0.2660 |          0.0253 |
| diag-occlusion     |   11.6963 |        -0.1200 |         0.0107 |         0.0000 |          0.0347 |        1.7356 |                   20.6385 |            3.2650 |       -0.0531 |             0.0025 |           0.0090 |     0.1550 |          0.0732 |
| diag-wall          |    3.8438 |        -1.3567 |         0.0140 |         0.0000 |         -0.0021 |        1.2581 |                    8.7360 |            1.2216 |        0.0149 |             0.0156 |          -0.0342 |    -0.3750 |          0.0142 |
| diag-sphere        |    3.2413 |        -0.0428 |         0.0492 |         0.0000 |          0.0001 |        0.5308 |                    6.8592 |            0.9611 |        0.0053 |            -0.0062 |           0.2142 |     0.1272 |          0.0231 |
| diag-metal-hit     |    5.4219 |        -0.0374 |        -0.1128 |         0.0000 |         -0.0078 |        0.0975 |                   16.8155 |            2.6263 |        3.2137 |             2.8543 |          -0.0097 |     0.3632 |          0.2381 |

Raw metrics and throughput runs are in [SSR-CONTRIBUTIONS.json](data/SSR-CONTRIBUTIONS.json) and [SSR-THROUGHPUT.json](data/SSR-THROUGHPUT.json). No performance improvement is inferred from PSNR.

## Validation

- Viewer metrics/deltas refreshed: 4214 comparisons computed, zero failures; existing historical-image warnings remain.
- Fidelity build, typecheck and lint passed (existing warnings). 49 test files, 321 tests passed, one skipped.
- Three.js independent branches passed core lint/build and changed-file ESLint. Hardware WebGPU and WebGL2 suites passed: 1957 core tests, one existing TODO; 100 addon tests per new behavioral branch. No repository typecheck script exists.
- Physical WebGL renderer: NVIDIA GeForce GTX 1050, ANGLE D3D11. WebGPU actual selected adapter: NVIDIA Pascal, non-fallback. No software fallback or shader/capture errors in final captures.
- Audit remains not clean: existing 2 critical, 4 high, 1 moderate findings (Puppeteer/extract-zip and pathtracer/simple-git tooling among high/critical paths). Dependency versions unchanged.
- Generated root Three.js build outputs excluded. No PR was opened against mrdoob/three.js.
