import { Mesh, PMREMGenerator, RenderPipeline, UnsignedByteType, WebGPURenderer } from 'three/webgpu';
import { color, mrt, normalView, packNormalToRGB, pass, screenUV, velocity } from 'three/tsl';
import { createBakeProxy } from './vxgi-bake/geometry.js';
import { VXGIVolume } from 'three/addons/lighting/vxgi/VXGIVolume.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { LightMapper } from './vxgi-bake/LightMapper.js';
import { vxgiIrradiance } from './vxgi-bake/VXGIIrradiance.js';
import { unwrapUVs } from './vxgi-bake/unwrapUVs.js';
import type { SceneInstance } from '@three-fidelity/scenes';
import type { LiveRenderer, RendererOptions } from './types.js';
import { completeRenderer } from './profiling.js';
import { configureRenderer, createLivePipeline, prepareScene } from './helpers.js';

const bakeSamples = 64;

/** Bake the default VXGI volume once, then render indirect diffuse from a UV atlas. */
export async function createVXGILightBakeRenderer(
  canvas: HTMLCanvasElement,
  setup: SceneInstance,
  { width, height, trackTimestamp = false }: RendererOptions,
): Promise<LiveRenderer> {
  const { scene, camera, effects } = setup;
  const renderer = new WebGPURenderer({ canvas, antialias: false, trackTimestamp });
  renderer.shadowMap.enabled = true;
  configureRenderer(renderer, effects);
  await renderer.init();
  const releaseScene = prepareScene(setup, {
    createGradient: ({ center, edge }) => screenUV.distance(0.5).remap(0, 0.5).mix(color(center), color(edge)),
    bakeEnvironment(environment) {
      const generator = new PMREMGenerator(renderer);
      try {
        return generator.fromScene(environment.scene, environment.sigma);
      } finally {
        generator.dispose();
      }
    },
  });
  const meshes: Mesh[] = [];
  scene.traverse((object) => {
    if (object instanceof Mesh) meshes.push(object);
  });
  const originals = meshes.map((mesh) => ({ mesh, geometry: mesh.geometry, material: mesh.material }));
  let baker: LightMapper | undefined;
  const volume = new VXGIVolume(128);
  const restore = () => {
    for (const { mesh, geometry, material } of originals) {
      if (mesh.geometry !== geometry) mesh.geometry.dispose();
      for (const clone of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (!(Array.isArray(material) ? material : [material]).includes(clone)) clone.dispose();
      }
      mesh.geometry = geometry;
      mesh.material = material;
    }
    baker?.dispose();
    releaseScene();
  };
  try {
    // The unwrapper snapshots skinned/morphed geometry at the suite's canonical pose.
    let resolution = 1024;
    let atlas = unwrapUVs(scene, { resolution, padding: 3 });
    while (!atlas && resolution < 8192) {
      resolution *= 2;
      atlas = unwrapUVs(scene, { resolution, padding: 3 });
    }
    if (!atlas) throw new Error('Unable to pack the VXGI light-map atlas at 8192 texels');
    // VXGI injection uses the same shadow maps as the live pipeline.
    renderer.setSize(width, height, false);
    renderer.render(scene, camera);
    volume.update(renderer, scene);
    baker = new LightMapper(renderer, resolution, vxgiIrradiance(volume, { coneCount: 3 }));
    const bakeMeshes = meshes.map(createBakeProxy);
    try {
      baker.addObjects(bakeMeshes);
      baker.update(bakeSamples);
      await completeRenderer(renderer);
    } finally {
      for (const proxy of bakeMeshes) proxy.geometry.dispose();
    }

    for (const mesh of meshes) {
      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((material) => {
        const baked = material.clone();
        if ('lightMap' in baked) {
          baked.lightMap = baker!.texture;
          if ('lightMapIntensity' in baked) baked.lightMapIntensity = 1;
        }
        return baked;
      });
      mesh.material = Array.isArray(mesh.material) ? materials : materials[0]!;
    }
  } catch (error) {
    restore();
    renderer.dispose();
    throw error;
  } finally {
    volume.dispose();
  }
  const pipeline = new RenderPipeline(renderer);
  const prePass = pass(scene, camera);
  prePass.name = 'Baked VXGI Pre-Pass';
  prePass.transparent = false;
  prePass.setMRT(mrt({ output: packNormalToRGB(normalView), velocity }));
  prePass.getTexture('output').type = UnsignedByteType;
  const scenePass = pass(scene, camera);
  pipeline.outputNode = traa(scenePass, prePass.getTextureNode('depth'), prePass.getTextureNode('velocity'), camera);
  const live = createLivePipeline({
    name: 'vxgi-light-bake',
    renderer,
    camera,
    render() {
      pipeline.render();
    },
    disposeGraph() {
      pipeline.dispose();
      prePass.dispose();
      scenePass.dispose();
      restore();
    },
  });
  live.setSize(width, height);
  return {
    ...live,
    get frames() {
      return live.frames;
    },
    lightBake: { phase: 'converged', samples: bakeSamples, maxSamples: bakeSamples, progress: 1 },
  };
}
