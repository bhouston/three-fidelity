// Long-running research captures use the same registry and browser host as fidelity-kit render.
// Large BVH/shader setup can exceed Puppeteer's default protocol timeout.
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { readFile, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseRegistry, rendererParams, rendererUrl } from '../submodules/fidelity-kit/packages/cli/dist/registry.js';
import { chromeFlags } from '../submodules/fidelity-kit/packages/cli/dist/performance/schedule.js';
const require = createRequire(new URL('../submodules/fidelity-kit/packages/cli/package.json', import.meta.url));
const puppeteer = require('puppeteer');
const sharp = require('sharp');
const { values } = parseArgs({
  options: {
    renderers: { type: 'string', default: 'three-gpu-pathtracer' },
    scenes: { type: 'string' },
    'executable-path': { type: 'string' },
    'root-url': { type: 'string', default: 'http://127.0.0.1:5173/' },
    out: { type: 'string', default: 'fidelity-results' },
    'timeout-ms': { type: 'string', default: '1800000' },
  },
});
const timeout = Number(values['timeout-ms']);
if (!Number.isSafeInteger(timeout) || timeout < 1000) throw new Error('Invalid timeout');
const suite = parseRegistry(JSON.parse(await readFile('registry.json', 'utf8')));
const selected = values.renderers.split(',');
const renderers = selected.map((id) => {
  const renderer = suite.renderers.find((candidate) => candidate.id === id && candidate.kind === 'browser');
  if (!renderer) throw new Error(`Unknown browser renderer: ${id}`);
  return renderer;
});
const scenes = suite.scenes.filter(
  (scene) => scene.category === 'Research scenes' && (!values.scenes || values.scenes.split(',').includes(scene.id)),
);
if (!scenes.length) throw new Error('No research scenes selected');
const browser = await puppeteer.launch({
  headless: true,
  executablePath: values['executable-path'],
  protocolTimeout: timeout,
  args: chromeFlags('on'),
});
let failures = 0;
try {
  const probe = await browser.newPage();
  await probe.goto(values['root-url']);
  const hardware = await probe.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    const gpu = adapter
      ? ['vendor', 'architecture', 'device', 'description'].map((key) => adapter.info[key] ?? '').join(' ')
      : '';
    const gl = document.createElement('canvas').getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    const webgl = gl?.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER);
    return { gpu, webgl };
  });
  await probe.close();
  if (
    !hardware.gpu ||
    !hardware.webgl ||
    /swiftshader|llvmpipe|lavapipe|softpipe|software|basic render|\bwarp\b/i.test(JSON.stringify(hardware))
  )
    throw new Error(`Physical GPU required: ${JSON.stringify(hardware)}`);
  console.log('Hardware:', hardware);
  for (const renderer of renderers)
    for (const scene of scenes) {
      const file = resolve(values.out, scene.id, 'beauty', `${renderer.id}.avif`);
      try {
        await access(file);
        console.log(`${scene.id} / ${renderer.id}: existing`);
        continue;
      } catch {
        /* capture missing output */
      }
      const page = await browser.newPage();
      const start = Date.now();
      try {
        const params = { seed: 1, ...rendererParams(suite, renderer.id, scene.id), ...scene.fidelity };
        await page.setViewport({ width: params.width, height: params.height, deviceScaleFactor: 1 });
        const url = rendererUrl(suite, 'development', values['root-url']);
        url.searchParams.set('fidelityKitMode', 'capture');
        url.searchParams.set('fidelityKitParams', JSON.stringify(params));
        console.log(`${scene.id} / ${renderer.id}: start`);
        await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout });
        await page.waitForFunction(() => '__fidelityKitCapture' in window || '__fidelityKitError' in window, {
          timeout,
        });
        await page.evaluate(() => {
          if (window.__fidelityKitError) throw new Error(window.__fidelityKitError);
        });
        const canvas = await page.$('canvas');
        if (!canvas) throw new Error('Missing capture canvas');
        const png = await canvas.screenshot({ type: 'png' });
        await mkdir(dirname(file), { recursive: true });
        await sharp(png).avif({ quality: 90, chromaSubsampling: '4:4:4' }).toFile(file);
        console.log(`${scene.id} / ${renderer.id}: captured in ${((Date.now() - start) / 1000).toFixed(1)}s`);
      } catch (error) {
        failures++;
        console.error(`${scene.id} / ${renderer.id}:`, error);
      } finally {
        await page.close();
      }
    }
} finally {
  await browser.close();
}
if (failures) process.exitCode = 1;
