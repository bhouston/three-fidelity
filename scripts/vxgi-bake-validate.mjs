// Hardware-only integration check, run after pnpm build.
import assert from 'node:assert/strict';
import * as headless from '../packages/cli/dist/headless/webgpu.js';
headless.install();
const { createRenderer, completeRenderer, createRendererFrameDriver } =
  await import('../packages/renderers/dist/index.js');
const { getScene, disposeSceneInstance } = await import('../packages/scenes/dist/index.js');
const { createNodeSceneContext } = await import('../packages/scenes/dist/node.js');
const setup = await getScene('cornell-box-basic').create(createNodeSceneContext());
const originals = [];
setup.scene.traverse((mesh) => {
  if (mesh.isMesh) originals.push({ mesh, geometry: mesh.geometry, material: mesh.material });
});
const canvas = headless.createCanvas(128, 96);
let live;
try {
  live = await createRenderer('vxgi-light-bake', canvas, setup, { width: 128, height: 96 });
  const adapter = live.renderer.backend.device.adapterInfo;
  console.log(JSON.stringify({ adapter, bake: live.lightBake }));
  assert.equal(live.lightBake.phase, 'converged');
  assert.equal(live.lightBake.samples, 64);
  for (const { mesh, geometry, material } of originals) {
    assert.notEqual(mesh.geometry, geometry);
    assert.notEqual(mesh.material, material);
    assert.ok(mesh.geometry.getAttribute('uv1'));
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const baked of materials) if ('lightMap' in baked) assert.ok(baked.lightMap);
  }
  const advance = createRendererFrameDriver(live.renderer);
  for (let i = 0; i < 16; i++) {
    advance({ index: i, timeSeconds: i / 60, deltaSeconds: 1 / 60, phase: 'warmup' });
    live.render();
  }
  await completeRenderer(live.renderer);
  const pixels = await headless.readPixels(canvas);
  assert.ok(
    pixels.some((value, i) => i % 4 !== 3 && value > 10),
    'Expected a lit image',
  );
  setup.camera.position.x += 0.1;
  live.render();
  await completeRenderer(live.renderer);
  assert.equal(live.lightBake.samples, 64, 'Camera movement must retain the finished bake');
  live.dispose();
  for (const { mesh, geometry, material } of originals) {
    assert.equal(mesh.geometry, geometry);
    assert.equal(mesh.material, material);
  }
  console.log('Baked VXGI initialization, rendering, camera motion and scene restoration passed.');
} finally {
  live?.dispose();
  disposeSceneInstance(setup);
}
