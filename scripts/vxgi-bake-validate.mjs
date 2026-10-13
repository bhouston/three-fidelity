// Hardware-only integration check, run after pnpm build.
import assert from 'node:assert/strict';
import * as headless from '../packages/cli/dist/headless/webgpu.js';
headless.install();
const { createRenderer, completeRenderer, createRendererFrameDriver } =
  await import('../packages/renderers/dist/index.js');
const { getScene, disposeSceneInstance } = await import('../packages/scenes/dist/index.js');
const { createNodeSceneContext } = await import('../packages/scenes/dist/node.js');
const setup = await getScene(process.argv[2] ?? 'cornell-box-basic').create(createNodeSceneContext());
const originals = [];
setup.scene.traverse((mesh) => {
  if (mesh.isMesh) originals.push({ mesh, geometry: mesh.geometry, material: mesh.material });
});
const canvas = headless.createCanvas(128, 96);
let live;
try {
  live = await createRenderer('vxgi-light-bake', canvas, setup, { width: 128, height: 96 });
  const info = live.renderer.backend.device.adapterInfo;
  const adapter = {
    vendor: info.vendor,
    architecture: info.architecture,
    device: info.device,
    description: info.description,
  };
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
  const material = originals
    .map(({ mesh }) => (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material))
    .find((material) => material.lightMap);
  const { DataUtils } = await import('../packages/renderers/node_modules/three/build/three.core.js');
  const texels = await live.renderer.backend.copyTextureToBuffer(
    material.lightMap,
    0,
    0,
    material.lightMap.image.width,
    material.lightMap.image.height,
    0,
  );
  let maximumIrradiance = 0;
  for (let i = 0; i < texels.length; i++) {
    if (i % 4 === 3) continue;
    const irradiance = DataUtils.fromHalfFloat(texels[i]);
    assert.ok(Number.isFinite(irradiance) && irradiance >= 0, 'Baked irradiance must be finite and nonnegative');
    maximumIrradiance = Math.max(maximumIrradiance, irradiance);
  }
  assert.ok(maximumIrradiance > 0.01, 'Expected nonzero indirect lighting in the atlas');
  console.log(JSON.stringify({ maximumIrradiance }));
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
