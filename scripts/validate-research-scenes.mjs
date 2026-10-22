import { getScene, disposeSceneInstance } from '../packages/scenes/dist/index.js';
import { createNodeSceneContext } from '../packages/scenes/dist/node.js';
import registry from '../registry.json' with { type: 'json' };
const selected = process.argv.slice(2);
const context = createNodeSceneContext();
let failures = 0;
for (const entry of registry.scenes.filter(
  (entry) => entry.category === 'Research scenes' && (!selected.length || selected.includes(entry.id)),
)) {
  let setup;
  try {
    setup = await getScene(entry.id).create(context);
    let meshes = 0;
    setup.scene.traverse((object) => {
      if (object.isMesh) meshes++;
    });
    if (!meshes || Math.abs(setup.camera.aspect - entry.fidelity.width / entry.fidelity.height) > 1e-6)
      throw new Error('Invalid geometry or camera aspect');
    console.log(`${entry.id}: loaded (${meshes} meshes)`);
  } catch (error) {
    failures++;
    console.error(entry.id, error);
  } finally {
    if (setup) disposeSceneInstance(setup);
  }
  globalThis.gc?.();
}
if (failures) process.exitCode = 1;
