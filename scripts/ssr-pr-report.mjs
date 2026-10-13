import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compareImages, measureImages } from 'fidelity-kit';

const require = createRequire(new URL('../submodules/fidelity-kit/packages/cli/package.json', import.meta.url));
const { default: sharp } = await import(pathToFileURL(require.resolve('sharp')).href);
const artifacts = resolve(process.env.SWARM_ARTIFACTS || 'ssr-pr-artifacts');
const captures = JSON.parse(await readFile(join(artifacts, 'ssr-pr-captures.json'), 'utf8'));
const scenes = [...new Set(captures.map((capture) => capture.scene))];
const renderers = [...new Set(captures.map((capture) => capture.renderer))];
const reference = 'three-gpu-pathtracer';
const rows = [];
const image = (scene, renderer) => join('fidelity-results', scene, 'beauty', `${renderer}.avif`);
for (const scene of scenes) {
  const scores = {};
  for (const renderer of renderers) {
    const comparison = await compareImages(image(scene, reference), image(scene, renderer));
    scores[renderer] = comparison.metrics.psnr;
    const directory = join('fidelity-results', scene, 'beauty');
    const deltaFile = `${renderer}.vs-${reference}.delta.webp`;
    await writeFile(join(directory, deltaFile), comparison.deltaImage);
    await writeFile(
      join(directory, `${renderer}.vs-${reference}.metrics.json`),
      JSON.stringify(
        {
          ...comparison.metrics,
          width: comparison.width,
          height: comparison.height,
          generatedAt: new Date().toISOString(),
          deltaFile,
        },
        null,
        2,
      ),
    );
  }
  const mirror = scores['three-dev-ssr-baseline'];
  const ggx = scores['three-dev-ssr-ggx-baseline'];
  rows.push({
    scene,
    scores,
    mirrorNormalDelta: scores['three-dev-ssr-normal-bias'] - mirror,
    mirrorGuardDelta: scores['three-dev-ssr-ray-length'] - mirror,
    ggxNormalDelta: scores['three-dev-ssr-ggx-normal-bias'] - ggx,
    ggxGuardDelta: scores['three-dev-ssr-ggx-ray-length'] - ggx,
    commentIdentical:
      (await measureImages(image(scene, 'three-dev-ssr-baseline'), image(scene, 'three-dev-ssr-mirror-bias-docs')))
        .metrics.psnr === null,
    guardMirrorIdentical:
      (await measureImages(image(scene, 'three-dev-ssr-baseline'), image(scene, 'three-dev-ssr-ray-length'))).metrics
        .psnr === null,
    guardGGXIdentical:
      (await measureImages(image(scene, 'three-dev-ssr-ggx-baseline'), image(scene, 'three-dev-ssr-ggx-ray-length')))
        .metrics.psnr === null,
  });
}
const format = (value) => (value === null ? '∞' : value.toFixed(4));
const header =
  '| Scene | Stock r186 | Dev mirror | Normal Δ | Guard Δ | Dev GGX | Normal Δ | Guard Δ |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |';
const table =
  header +
  '\n' +
  rows
    .map(
      (row) =>
        `| ${row.scene} | ${format(row.scores['three-current'])} | ${format(row.scores['three-dev-ssr-baseline'])} | ${format(row.mirrorNormalDelta)} | ${format(row.mirrorGuardDelta)} | ${format(row.scores['three-dev-ssr-ggx-baseline'])} | ${format(row.ggxNormalDelta)} | ${format(row.ggxGuardDelta)} |`,
    )
    .join('\n');
const mean = (key) => rows.reduce((total, row) => total + row[key], 0) / rows.length;
const summary = {
  mirrorNormal: mean('mirrorNormalDelta'),
  mirrorGuard: mean('mirrorGuardDelta'),
  ggxNormal: mean('ggxNormalDelta'),
  ggxGuard: mean('ggxGuardDelta'),
};
await writeFile(
  join(artifacts, 'ssr-pr-psnr.json'),
  JSON.stringify({ reference, frames: captures[0].frames, seed: captures[0].seed, summary, rows }, null, 2),
);
await writeFile(join(artifacts, 'ssr-pr-psnr.md'), `${table}\n\nMean Δ dB: ${JSON.stringify(summary)}\n`);
for (const scene of ['diag-sphere', 'diag-grazing', 'steampunk-camera']) {
  const selected = [
    reference,
    'three-dev-ssr-baseline',
    'three-dev-ssr-normal-bias',
    'three-dev-ssr-ggx-baseline',
    'three-dev-ssr-ggx-normal-bias',
  ];
  const labels = ['Path-traced reference', 'Dev mirror', 'Mirror + normal bias', 'Dev GGX', 'GGX + normal bias'];
  const width = 400,
    height = 300,
    labelHeight = 34;
  const composites = [];
  for (let i = 0; i < selected.length; i++) {
    composites.push({
      input: await sharp(image(scene, selected[i])).resize(width, height).png().toBuffer(),
      left: i * width,
      top: labelHeight,
    });
    composites.push({
      input: Buffer.from(
        `<svg width="400" height="34"><rect width="400" height="34" fill="#222"/><text x="12" y="23" fill="white" font-family="sans-serif" font-size="16">${labels[i]}</text></svg>`,
      ),
      left: i * width,
      top: 0,
    });
  }
  await sharp({
    create: { width: selected.length * width, height: height + labelHeight, channels: 3, background: '#222' },
  })
    .composite(composites)
    .png()
    .toFile(join(artifacts, `${scene}-comparison.png`));
}
console.log(table);
console.log('Mean deltas', summary);
