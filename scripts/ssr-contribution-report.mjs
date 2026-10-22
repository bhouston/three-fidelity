import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { measureImages } from 'fidelity-kit';

const registry = JSON.parse(await readFile('registry.json', 'utf8'));
const scenes = registry.scenes.filter(
  (scene) => scene.id === 'steampunk-camera' || (scene.id.startsWith('diag-') && scene.id !== 'diag-odd-size'),
);
const names = [
  'three-current',
  'three-dev-ssr-baseline',
  'three-dev-ssr-dielectric-fresnel',
  'three-dev-ssr-background-depth',
  'three-new',
  'three-new-ssr-no-filter',
  'three-new-ssr-no-hit-specular',
  'three-new-ssr-no-back-depth',
  'three-new-ssr-no-hiz',
  'three-new-ssr-biased-lobe',
  'three-dev-ssr-back-depth',
  'three-new-ssr-short-rays',
  'three-new-ssr-distance-fade',
  'three-new-ssr-additive-env',
  'three-new-ssr-capped-march',
];
const rows = [];
for (const scene of scenes) {
  const scores = {};
  for (const name of names)
    scores[name] = (
      await measureImages(
        join('fidelity-results', scene.id, 'beauty/three-gpu-pathtracer.avif'),
        join('fidelity-results', scene.id, `beauty/${name}.avif`),
      )
    ).metrics.psnr;
  const base = scores['three-dev-ssr-baseline'],
    full = scores['three-new'];
  rows.push({
    scene: scene.id,
    scores,
    totalGain: full - base,
    dielectricGain: scores['three-dev-ssr-dielectric-fresnel'] - base,
    solidDepthGain: scores['three-dev-ssr-back-depth'] - base,
    rayReachBenefit: full - scores['three-new-ssr-short-rays'],
    noFadeBenefit: full - scores['three-new-ssr-distance-fade'],
    replaceEnvironmentBenefit: full - scores['three-new-ssr-additive-env'],
    denseMarchBenefit: scores['three-new-ssr-no-hiz'] - scores['three-new-ssr-capped-march'],
    backgroundGain: scores['three-dev-ssr-background-depth'] - base,
    filterBenefit: full - scores['three-new-ssr-no-filter'],
    hitSpecularBenefit: full - scores['three-new-ssr-no-hit-specular'],
    backDepthBenefit: full - scores['three-new-ssr-no-back-depth'],
    hizBenefit: full - scores['three-new-ssr-no-hiz'],
    fullLobeBenefit: full - scores['three-new-ssr-biased-lobe'],
  });
}
const columns = [
  'totalGain',
  'dielectricGain',
  'solidDepthGain',
  'backgroundGain',
  'rayReachBenefit',
  'noFadeBenefit',
  'replaceEnvironmentBenefit',
  'denseMarchBenefit',
  'filterBenefit',
  'hitSpecularBenefit',
  'backDepthBenefit',
  'hizBenefit',
  'fullLobeBenefit',
];
const means = Object.fromEntries(
  columns.map((key) => [key, rows.reduce((sum, row) => sum + row[key], 0) / rows.length]),
);
const table =
  '| Scene | ' +
  columns.join(' | ') +
  ' |\n| --- | ' +
  columns.map(() => '---:').join(' | ') +
  ' |\n' +
  rows.map((row) => `| ${row.scene} | ${columns.map((key) => row[key].toFixed(4)).join(' | ')} |`).join('\n');
const artifacts = resolve(process.env.SWARM_ARTIFACTS || 'ssr-pr-artifacts');
await writeFile(
  join(artifacts, 'ssr-contributions.json'),
  JSON.stringify(
    {
      method:
        'Standalone fixes compared to pinned dev; leave-one-out benefits measured within three-new. RGB8 PSNR dB, 64 completed frames, seed 1, existing pathtracer reference.',
      means,
      rows,
    },
    null,
    2,
  ),
);
await writeFile(join(artifacts, 'ssr-contributions.md'), table + '\n\nMeans: ' + JSON.stringify(means) + '\n');
console.log(table);
console.log(means);
