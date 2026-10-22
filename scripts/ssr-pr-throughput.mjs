import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(new URL('../submodules/fidelity-kit/packages/cli/package.json', import.meta.url));
const { default: puppeteer } = await import(pathToFileURL(require.resolve('puppeteer')).href);
import { mkdir, writeFile } from 'node:fs/promises';
const artifacts = resolve(process.env.SWARM_ARTIFACTS || 'ssr-pr-artifacts');
await mkdir(artifacts, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  args: [
    '--use-angle=d3d11',
    '--disable-software-rasterizer',
    '--enable-unsafe-webgpu',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
  ],
  protocolTimeout: 180000,
});
const results = [];
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    const request = navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter = async (...args) => {
      const adapter = await request(...args);
      if (!adapter || adapter.isFallbackAdapter || adapter.info?.isFallbackAdapter || adapter.info?.vendor !== 'nvidia')
        throw Error('Physical NVIDIA WebGPU adapter required');
      return adapter;
    };
  });
  await page.goto(
    new URL('performance.html', process.env.SSR_ROOT_URL || 'http://127.0.0.1:5173/').href +
      '?fidelityKitMode=capture&fidelityKitParams=' +
      encodeURIComponent(
        JSON.stringify({
          renderer: 'three-dev-ssr-baseline',
          scene: 'diag-sphere',
          width: 480,
          height: 360,
          frames: 1,
        }),
      ),
  );
  await page.waitForFunction(() => window.__fidelityKitCapture || window.__fidelityKitError, { timeout: 120000 });
  for (const repeat of [1, 2]) {
    for (const sceneName of ['diag-sphere', 'steampunk-camera']) {
      for (const rendererName of [
        'three-dev-ssr-baseline',
        'three-dev-ssr-normal-bias',
        'three-dev-ssr-ray-length',
        'three-dev-ssr-mirror-bias-docs',
        'three-dev-ssr-baseline',
      ]) {
        const value = await page.evaluate(
          async (scene, renderer) => {
            const { createPerformanceSession } = await import('/src/performance-session.ts');
            // The browser callback is serialized; its reporter callbacks must stay local.
            // oxlint-disable-next-line unicorn/consistent-function-scoping
            const noop = () => {};
            let gpuAdapter;
            const reporter = {
              phaseStart: noop,
              phaseEnd: noop,
              environment(info) {
                if (info.gpuAdapter?.vendor !== 'nvidia') throw Error('Physical NVIDIA renderer required');
                gpuAdapter = info.gpuAdapter;
              },
              frameBegin: noop,
              frameEnd: noop,
              convergence: async () => {},
              ready: noop,
            };
            const host = document.createElement('div');
            document.body.replaceChildren(host);
            const session = await createPerformanceSession(
              { scene, renderer, width: 480, height: 360, seed: 1 },
              reporter,
              host,
            );
            try {
              let deadline = performance.now() + 1000;
              while (performance.now() < deadline) {
                for (let i = 0; i < 8; i++) session.draw();
                await session.complete();
              }
              await session.complete();
              const start = performance.now();
              deadline = start + 5000;
              let completedFrames = 0;
              while (performance.now() < deadline) {
                for (let i = 0; i < 8; i++) session.draw();
                await session.complete();
                completedFrames += 8;
              }
              const durationMs = performance.now() - start;
              await session.complete();
              return {
                scene,
                renderer,
                width: 480,
                height: 360,
                completedFrames,
                gpuAdapter,
                durationMs,
                framesPerSecond: (completedFrames * 1000) / durationMs,
                batchSize: 8,
                warmupMs: 1000,
              };
            } finally {
              await session.complete();
              session.dispose();
              host.remove();
            }
          },
          sceneName,
          rendererName,
        );
        results.push({ ...value, repeat });
        console.log(JSON.stringify({ ...value, repeat }));
      }
    }
  }
} finally {
  await browser.close();
  await writeFile(
    join(artifacts, 'old-pr-throughput.json'),
    JSON.stringify(
      {
        gpu: results[0]?.gpuAdapter,
        vsync: false,
        frameRateLimit: false,
        method:
          'Sequential warmed 5s runs; batches of 8, GPU-completed frame counts, drained between variants; no individual frame timing.',
        results,
      },
      null,
      2,
    ),
  );
}
