// Reflection-only, sequential hardware captures. This measures image quality, not rendering throughput.
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../submodules/fidelity-kit/packages/cli/package.json', import.meta.url));
const { default: puppeteer } = await import(pathToFileURL(require.resolve('puppeteer')).href);
const { default: sharp } = await import(pathToFileURL(require.resolve('sharp')).href);
const registry = JSON.parse(await readFile(new URL('../registry.json', import.meta.url), 'utf8'));
const rootUrl = process.env.SSR_ROOT_URL || 'http://127.0.0.1:5173/';
const artifacts = resolve(process.env.SWARM_ARTIFACTS || 'ssr-pr-artifacts');
const results = resolve('fidelity-results');
const frames = Number(process.env.SSR_FRAMES || 64);
if (!Number.isSafeInteger(frames) || frames < 1) throw new Error('SSR_FRAMES must be a positive integer');
const renderers = [
  'three-current',
  'three-dev-ssr-baseline',
  'three-dev-ssr-normal-bias',
  'three-dev-ssr-ray-length',
  'three-dev-ssr-mirror-bias-docs',
  'three-dev-ssr-ggx-baseline',
  'three-dev-ssr-ggx-normal-bias',
  'three-dev-ssr-ggx-ray-length',
  'three-dev-ssr-dielectric-fresnel',
  'three-dev-ssr-background-depth',
  'three-dev-ssr-back-depth',
  'three-new',
  'three-new-ssr-no-filter',
  'three-new-ssr-no-hit-specular',
  'three-new-ssr-no-back-depth',
  'three-new-ssr-no-hiz',
  'three-new-ssr-biased-lobe',
  'three-new-ssr-short-rays',
  'three-new-ssr-distance-fade',
  'three-new-ssr-additive-env',
  'three-new-ssr-capped-march',
];
const selectedRenderers = process.env.SSR_RENDERERS?.split(',') || renderers;
if (selectedRenderers.some((name) => !renderers.includes(name))) throw new Error('Unknown SSR renderer');
const scenes = registry.scenes.filter(
  (scene) => (scene.id.startsWith('diag-') && scene.id !== 'diag-odd-size') || scene.id === 'steampunk-camera',
);
const rows = [];
await mkdir(artifacts, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  args: ['--use-angle=d3d11', '--disable-software-rasterizer', '--enable-unsafe-webgpu'],
  protocolTimeout: 180000,
});
try {
  for (const scene of scenes) {
    for (const renderer of selectedRenderers) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.evaluateOnNewDocument(() => {
        window.__ssrAdapters = [];
        const request = navigator.gpu.requestAdapter.bind(navigator.gpu);
        navigator.gpu.requestAdapter = async (...args) => {
          const adapter = await request(...args);
          const info = adapter?.info;
          if (
            !info ||
            info.isFallbackAdapter ||
            adapter.isFallbackAdapter ||
            !info.vendor ||
            /swiftshader|llvmpipe|lavapipe|software|basic render/i.test(
              JSON.stringify({ vendor: info.vendor, description: info.description }),
            )
          ) {
            throw new Error('Hardware WebGPU required');
          }
          window.__ssrAdapters.push({
            vendor: info.vendor,
            architecture: info.architecture,
            description: info.description,
            fallback: info.isFallbackAdapter ?? adapter.isFallbackAdapter ?? false,
          });
          return adapter;
        };
      });
      try {
        const { width, height } = scene.fidelity;
        await page.setViewport({ width, height, deviceScaleFactor: 1 });
        const url = new URL('performance.html', rootUrl);
        url.searchParams.set('fidelityKitMode', 'capture');
        url.searchParams.set(
          'fidelityKitParams',
          JSON.stringify({ renderer, scene: scene.id, width, height, frames, seed: 1 }),
        );
        await page.goto(url.href, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__fidelityKitCapture || window.__fidelityKitError, { timeout: 180000 });
        const metadata = await page.evaluate(() => ({
          capture: window.__fidelityKitCapture,
          error: window.__fidelityKitError,
          adapters: window.__ssrAdapters,
        }));
        if (metadata.error || !metadata.adapters.length)
          throw new Error(metadata.error || 'Renderer adapter unverified');
        const canvas = await page.$('canvas');
        const png = await canvas.screenshot({ type: 'png' });
        const directory = join(results, scene.id, 'beauty');
        await mkdir(directory, { recursive: true });
        const file = join(directory, `${renderer}.avif`);
        await sharp(png).avif({ quality: 90, chromaSubsampling: '4:4:4' }).toFile(file);
        await writeFile(join(artifacts, `${scene.id}-${renderer}.png`), png);
        rows.push({ scene: scene.id, renderer, frames, seed: 1, ...metadata, errors });
        console.log(`${scene.id} / ${renderer}: captured`);
      } finally {
        await page.close(); // capture host drains GPU work before marking completion
      }
    }
  }
} finally {
  await browser.close();
}
const manifest = join(artifacts, 'ssr-pr-captures.json');
let previous = [];
if (process.env.SSR_RENDERERS) {
  try {
    previous = JSON.parse(await readFile(manifest, 'utf8')).filter((row) => !selectedRenderers.includes(row.renderer));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
await writeFile(manifest, JSON.stringify([...previous, ...rows], null, 2));
