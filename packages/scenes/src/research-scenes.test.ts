import { describe, expect, it, vi } from 'vitest';
import { DirectionalLight, Group, PerspectiveCamera, Scene, Vector3 } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { researchScenes } from './research-scenes.js';
import definitions from './research-scenes.json' with { type: 'json' };
import registry from '../../../registry.json' with { type: 'json' };

describe('research scene source setup', () => {
  it('keeps source camera world transforms and restores radiometric distant lighting', async () => {
    const scene = new Scene();
    const parent = new Group();
    parent.position.set(2, 3, 4);
    const camera = new PerspectiveCamera(35, 1, 0.01, 100);
    camera.position.set(1, 2, 3);
    parent.add(camera);
    scene.add(parent);
    const loadGLTF = vi.fn(async () => ({ scene, cameras: [camera] }) as unknown as GLTF);
    const setup = await researchScenes
      .find((entry) => entry.name === 'research-dragon')!
      .create({ loadGLTF, loadHDR: vi.fn() });
    expect(setup.camera.position.toArray()).toEqual([3, 5, 7]);
    expect(setup.camera.fov).toBe(35);
    const sun = setup.scene.children.find((child) => child instanceof DirectionalLight) as DirectionalLight;
    expect(sun.color.toArray()).toEqual([8, 8, 8]);
    expect(
      sun.position
        .clone()
        .sub(sun.target.position)
        .normalize()
        .distanceTo(new Vector3(-0.18862, 0.692312, 0.69651).normalize()),
    ).toBeLessThan(1e-6);
  });
  it('omits incomplete upstream assets from capture and fails explicitly on direct load', async () => {
    const loadGLTF = vi.fn();
    await expect(
      researchScenes.find((entry) => entry.name === 'research-teapot')!.create({ loadGLTF, loadHDR: vi.fn() }),
    ).rejects.toThrow('upstream environment map is missing');
    expect(loadGLTF).not.toHaveBeenCalled();
    expect(registry.scenes.filter((entry) => entry.category === 'Research scenes')).toHaveLength(22);
    expect(definitions).toHaveLength(27);
    for (const capture of registry.scenes.filter((entry) => entry.category === 'Research scenes')) {
      const source = researchScenes.find((candidate) => candidate.name === capture.id)!;
      expect([source.width, source.height]).toEqual([capture.fidelity.width, capture.fidelity.height]);
    }
  });
});
