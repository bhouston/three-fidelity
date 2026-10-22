import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DataTexture,
  DirectionalLight,
  EquirectangularReflectionMapping,
  FloatType,
  Matrix4,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  Vector3,
} from 'three';
import definitions from './research-scenes.json' with { type: 'json' };
import type { SceneDefinition } from './types.js';

/** These environments are referenced by metadata but absent from the pinned upstream source. */
export const missingResearchEnvironments = new Set([
  'material-testball',
  'pontiac-gto',
  'teapot',
  'teapot-full',
  'vintage-car',
]);

type Light = {
  pbrt: string;
  source?: string;
  radiance_rgb?: number[];
  from?: number[];
  to?: number[];
  pbrt_transform?: number[];
};

export const researchScenes: SceneDefinition[] = definitions.map((definition) => ({
  name: `research-${definition.id}`,
  description: `ErfanMo77 research scene: ${definition.id}; original camera, extended materials and source lighting.`,
  width: definition.width,
  height: definition.height,
  async create(ctx) {
    if (missingResearchEnvironments.has(definition.id)) {
      throw new Error(
        `Research scene ${definition.id}: upstream environment map is missing; capture disabled until the source asset is available.`,
      );
    }
    const gltf = await ctx.loadGLTF(`@/submodules/gltf-research-scenes/${definition.model}`);
    const scene = new Scene();
    scene.add(gltf.scene);
    scene.updateMatrixWorld(true);
    const sourceCamera = gltf.cameras.find((camera) => camera instanceof PerspectiveCamera);
    if (!(sourceCamera instanceof PerspectiveCamera))
      throw new Error(`Research scene ${definition.id} has no perspective camera`);
    // Detach a world-space copy: source cameras may be parented under transformed nodes.
    const camera = sourceCamera.clone();
    sourceCamera.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale);
    camera.aspect = definition.width / definition.height;
    const bounds = new Box3().setFromObject(gltf.scene);
    const extent = Math.max(bounds.getSize(new Vector3()).length(), 1);
    camera.far = Math.max(camera.far, camera.position.distanceTo(bounds.getCenter(new Vector3())) + extent * 2);
    camera.updateProjectionMatrix();
    gltf.scene.traverse((object) => {
      object.castShadow = true;
      object.receiveShadow = true;
    });
    for (const light of definition.lights as Light[]) {
      if (light.pbrt === 'distant') {
        const transform = new Matrix4().fromArray(light.pbrt_transform!);
        const rgb = light.radiance_rgb!;
        const sun = new DirectionalLight(new Color().setRGB(rgb[0]!, rgb[1]!, rgb[2]!), 1);
        const direction = new Vector3()
          .fromArray(light.from!)
          .sub(new Vector3().fromArray(light.to!))
          .transformDirection(transform);
        const center = bounds.getCenter(new Vector3());
        sun.position.copy(center).addScaledVector(direction, extent);
        sun.target.position.copy(center);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        Object.assign(sun.shadow.camera, {
          left: -extent,
          right: extent,
          top: extent,
          bottom: -extent,
          near: 0.01,
          far: extent * 3,
        });
        sun.shadow.normalBias = extent * 0.0001;
        scene.add(sun, sun.target);
      } else if (light.pbrt === 'infinite') {
        if (scene.environment) throw new Error('Multiple research environment maps require explicit composition');
        const hdr = light.source
          ? await ctx.loadHDR(`suite-assets/research-environments/${definition.id}.hdr`)
          : new DataTexture(new Float32Array([...(light.radiance_rgb ?? [1, 1, 1]), 1]), 1, 1, RGBAFormat, FloatType);
        hdr.mapping = EquirectangularReflectionMapping;
        hdr.needsUpdate = true;
        scene.environment = hdr;
        scene.background = hdr;
      }
      // Area sources are already emissive geometry; adding lights would double their energy.
    }
    const target = camera.position.clone().add(camera.getWorldDirection(new Vector3()));
    return {
      scene,
      camera,
      target,
      effects: { temporalDenoise: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1, frames: 128 },
    };
  },
}));
