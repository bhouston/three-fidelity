// Voxel transport addon shared by live VXGI and its surface bake.
declare module 'three/addons/lighting/vxgi/VXGIVolume.js' {
  import type { Scene } from 'three';
  import type { WebGPURenderer } from 'three/webgpu';
  export class VXGIVolume {
    constructor(resolution?: number);
    update(renderer: WebGPURenderer, scene: Scene): void;
    dispose(): void;
  }
}
